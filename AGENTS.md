# Repository Guidelines

## Completion Reminder

After changing anything in this repository, if the work is done, ask the user to go through the release checklist and publishing flow before considering the task complete.

## Release Checklist Automation

When walking through a release checklist, run all agent-safe steps automatically up to npm publishing: preflight checks, local smoke tests, package dry-runs, commits/tags, pushes, and GitHub release creation. Stop before any `npm publish` command and ask the user to publish manually, because npm publishing depends on the user's authenticated npm session. After the user confirms npm publishing is complete, resume with post-publish validation.
