# Circle Monorepo Configuration

This repo shows how circle can be used to run CI within a monorepo.

It features:
- a way to define projects and dependencies within projects
- running CI steps conditionally on file changes

## Credits

inspired by https://github.com/labs42io/circleci-monorepo

## Requirements

An env var `CIRCLE_TOKEN` needs to be set with an API token. Unfortunately, since circle APIs v2 only accept user tokens, you cannot use project level tokens
