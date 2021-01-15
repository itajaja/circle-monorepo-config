/* eslint-disable no-console */
import { execSync } from 'child_process';

import { uniqBy } from 'lodash';
import orderBy from 'lodash/orderBy';
import fetch, { RequestInit } from 'node-fetch';

import projects from './projects';

const ENV: any = process.env;

type Job = {
  /* eslint-disable @typescript-eslint/naming-convention */
  workflows: { workflow_name: string };
  vcs_revision: string;
  stop_time: string;
  job_name: string;
  status: string;
  /* eslint-enable @typescript-eslint/naming-convention */
};

const PROJECT_SLUG = `github/${ENV.CIRCLE_PROJECT_USERNAME}/${ENV.CIRCLE_PROJECT_REPONAME}`;

async function circleReq(path: string, init: RequestInit = {}) {
  const url = `https://circleci.com/api/${path}`;
  const basicAuth = Buffer.from(`${ENV.CIRCLE_TOKEN}:`).toString('base64');
  const resp = await fetch(url, {
    ...init,
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  if (!resp.ok) {
    throw new Error(`request failed (${resp.status} ${resp.statusText}):
    ${await resp.text()}`);
  }
  return resp.json();
}

const cachedJobs: Record<string, Promise<Job[]>> = {};
function getJobs(branch: string): Promise<Job[]> {
  if (!cachedJobs[branch]) {
    console.log(`getting jobs for branch ${branch}`);
    cachedJobs[branch] = circleReq(
      `v1.1/project/${PROJECT_SLUG}/tree/${branch}`,
    );
  }
  return cachedJobs[branch];
}

function git(cmd: string) {
  return execSync(`git ${cmd}`);
}

/**
 * returns true if all the last jobs at that commit for a given workflow were successful
 */
async function isCommitSuccessful(commit: string, workflow: string) {
  const gitCmd = `branch --contains=${commit} --format "%(refname:short)"`;
  const branches = git(gitCmd).toString().split('\n').filter(Boolean);
  const allJobs = (await Promise.all(branches.map(getJobs))).flat();
  const jobs = allJobs.filter(
    (j) => j.workflows.workflow_name === workflow && j.vcs_revision === commit,
  );

  if (jobs.length === 0) return false;

  const recentJobsByJobName = uniqBy(
    orderBy(jobs, (j) => j.stop_time, 'desc'),
    (j) => j.job_name,
  );
  return recentJobsByJobName.every((x) => x.status === 'success');
}

async function findLastSuccessfulCommitForWorkflow(workflow: string) {
  const commits = git('rev-list HEAD').toString().split('\n').filter(Boolean);

  let successfulCommit: string | null = null;
  for (const commit of commits) {
    // eslint-disable-next-line no-await-in-loop
    if (await isCommitSuccessful(commit, workflow)) {
      successfulCommit = commit;
      break;
    }
  }

  return successfulCommit;
}

async function createProjectDeps({ name, files }: typeof projects[0]) {
  const lastSuccess = await findLastSuccessfulCommitForWorkflow(name);
  console.log(`last success for ${name}: ${lastSuccess}`);

  if (!lastSuccess) return { shouldRun: true, name };

  const diff = git(
    `diff ${lastSuccess}..HEAD --name-only -- ${files.join(' ')}`,
  );
  return { name, shouldRun: diff.length > 0 };
}

async function run() {
  console.log('calculating workflows');
  const projectDeps = await Promise.all(projects.map(createProjectDeps));

  console.log(projectDeps);

  if (projectDeps.every((p) => !p.shouldRun)) {
    console.log('no project to run, exiting');
  }

  const pipelineParams = projectDeps.reduce(
    (a, v) => ({
      ...a,
      [v.name]: v.shouldRun,
    }),
    { trigger: false }, // we don't want to rerun this job
  );
  const pipelinePayload = {
    branch: ENV.CIRCLE_BRANCH,
    parameters: pipelineParams,
  };

  console.log('Triggering pipeline', pipelinePayload);

  await circleReq(`v2/project/${PROJECT_SLUG}/pipeline`, {
    method: 'POST',
    body: JSON.stringify(pipelinePayload),
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
