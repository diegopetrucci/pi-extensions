# Repository Guidelines

## Completion Reminder

After changing anything in this repository, if the work is done, ask the user to go through the release checklist and publishing flow before considering the task complete.

## README Extension Ordering

Keep the list of extensions in `README.md` alphabetically ordered.

## Release Checklist Automation

When walking through a release checklist, the agent should run all agent-safe release steps automatically up to, but not including, npm publishing: preflight checks, local smoke tests, package dry-runs, commits/tags, pushes, and GitHub release creation. `npm publish` is human-only: stop before any `npm publish` command and ask the user to publish manually, because npm publishing depends on the user's authenticated npm session. After the user confirms npm publishing is complete, wait 5 minutes before checking npm registry/package pages or running npm-install validation, because npm propagation can lag. After the 5-minute wait, resume post-publish validation.

## GitHub Release Body Style

Keep `docs/github-release-*.md` as the exact public GitHub release body. Do not include internal document titles like `GitHub release body — ...` or redundant version headings; the release tag already supplies the version. Start with a short summary, then public sections such as `## Highlights`, `## Packages`, and `## Install`. Do not include an "Included docs" section in public release bodies. Use descriptive GitHub release titles instead of repeating the version.
