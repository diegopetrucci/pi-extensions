# Release notes — v0.1.55

## Highlights

This release adds `code-reviewer`, a standalone read-only pi extension that exposes a guarded `code_reviewer` subagent tool for focused code reviews without implementing fixes. The reviewer now mirrors the contrarian model-selection style by preferring opposite-provider/model-family review models when available and clamping requested thinking to the selected model's capabilities.

## code-reviewer

- adapts the TLH code-reviewer review priorities into a standalone pi extension
- reviews ticket fit, diff mismatches, correctness, security, simplicity, and validation gaps
- runs the reviewer in an isolated in-memory child session with inherited extensions, skills, prompt templates, themes, context files, and agents files disabled
- auto-selects a contrarian-style opposite-provider/model-family review model when available, with ordered fallback through available models
- uses the active requested thinking level when available, defaults reasoning reviewers to `high` otherwise, and clamps the effective thinking level to the chosen model's capabilities
- keeps the runtime read-only with built-in inspection tools plus heavily guarded `bash` access

## Runtime safety

- blocks write/edit tools, raw `..` traversal, symlink-assisted path escapes, shell operators, pipelines, redirection, inline environment assignments, and path-qualified executables
- constrains `git` to known read-only inspection commands with safe flags/config injected to avoid pagers, optional locks, external diff/textconv/filter helpers, fsmonitor helpers, and signature/help helper execution
- blocks local-file git option bypasses such as `--contents`, `--pathspec-from-file`, `--ignore-revs-file`, `git blame -S`, and `git ls-files -X/--exclude-from`
- constrains `gh` to known read-only commands and blocks mutating commands, `gh api` write methods/body fields/cache writes, and browser-launching `--web` forms

## Packaging

- `@diegopetrucci/pi-extensions@0.1.55`
- `@diegopetrucci/pi-code-reviewer@0.1.0`

## Validation

- verified `v0.1.55` tag and GitHub release do not already exist
- verified target npm versions are unpublished before release prep
- refreshed dependencies with `npm ci`
- ran `npm run preflight:install-state` after dependency refresh
- ran focused code-reviewer TypeScript, model-selection, thinking, fallback, and runtime guard tests
- ran full `npm run ci` (`237` tests, `0` failures)
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs

## Suggested release blurb

`v0.1.55 adds code-reviewer, a standalone read-only pi extension that runs isolated, guarded code review subagents for ticket fit, correctness, security, simplicity, validation gaps, and contrarian-style model/thinking selection.`
