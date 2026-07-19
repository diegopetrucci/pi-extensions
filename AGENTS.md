# Repository Guidelines

## Completion Reminder

After completing work in this repository, trigger or walk through the release checklist and publishing flow only when the change adds a user-facing feature or tests, certifies, or bumps compatibility with a new Pi version, including `.pi-fleet-tested-version` changes. Do not trigger a release for maintenance-only hardening, tests, documentation, packaging, or internal tooling unless the user explicitly requests one.

## README Extension Ordering

Keep the list of extensions in `README.md` alphabetically ordered.

## Branch and Pull Request Workflow

Do not commit directly to `main` in this repository. For any change, create or switch to a non-`main` branch before committing, push the branch, and open a pull request targeting `main`. If work starts while checked out on `main`, create the branch before staging or committing changes.

## Release Checklist Automation

When walking through a release checklist, the agent should run all agent-safe release steps automatically up to, but not including, npm publishing: preflight checks, local smoke tests, package dry-runs, commits/tags, pushes, and GitHub release creation. Refresh dependencies with `npm ci` before local validation, then run `npm run preflight:install-state` to confirm installed packages match `package-lock.json` before smoke tests. `npm publish` is human-only: stop before any `npm publish` command and ask the user to publish manually, because npm publishing depends on the user's authenticated npm session. After the user confirms npm publishing is complete, wait 5 minutes before checking npm registry/package pages or running npm-install validation, because npm propagation can lag. After the 5-minute wait, resume post-publish validation.

## GitHub Release Body Style

Keep `docs/github-release-*.md` as the exact public GitHub release body. Do not include internal document titles like `GitHub release body — ...` or redundant version headings; the release tag already supplies the version. Start with a short summary, then public sections such as `## Highlights`, `## Packages`, and `## Install`. Do not include an "Included docs" section in public release bodies. Use descriptive GitHub release titles instead of repeating the version.

## Memory

At the start of any task, run `gn help plan` and follow its instructions.
After finishing a task, run `gn help review`.
