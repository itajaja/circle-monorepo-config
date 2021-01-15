/**
 * That's where you define your projects. the "files" is a list of glob path
 * that is passed to git diff to generate the list of files that changed.
 * The name needs to be the name of the circle pipeline
 */

// this is just a project to run linting/tsc over the circleci scripts
const circle = { name: 'circle', files: ['.circleci'] };

// you can define dependencies between projects by spreading the files
const projA = { name: 'projA', files: ['projA', ...circle.files] };

// like in this case, B and C depends on A, which depends on circle
const projB = { name: 'projB', files: ['projB', ...projA.files] };
const projC = { name: 'projC', files: ['projC', ...projA.files] };

export default [circle, projA, projB, projC];
