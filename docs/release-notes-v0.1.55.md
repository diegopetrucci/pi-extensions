# Release notes — v0.1.55

## Highlights

This release scope adds two standalone pi extensions to the repo's v0.1.55 publishing set: `code-reviewer`, a guarded read-only `code_reviewer` subagent tool for focused code reviews, and `dynamic-context-pruning`, a cache-aware context-pruning extension for long sessions.

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

## dynamic-context-pruning

- ships as standalone package `pi-dynamic-context-pruning@0.1.0`
- automatically prunes duplicate tool results, stale errored tool inputs, and superseded file-operation outputs
- gates automatic pruning on cache-aware break-even math so pruning only applies when predicted to be net beneficial
- adds `/prune` for manual picker-driven pruning and `/context-pruning` for status, stats, strategy toggles, and gate control

## Packaging

- `@diegopetrucci/pi-extensions@0.1.55`
- `@diegopetrucci/pi-code-reviewer@0.1.0`
- `pi-dynamic-context-pruning@0.1.0`

## Validation

- verified local `v0.1.55` tag already exists on the earlier code-reviewer commit and must be moved to current `main` before npm publish
- verified target npm versions are unpublished before release prep for the root package, `@diegopetrucci/pi-code-reviewer@0.1.0`, and `pi-dynamic-context-pruning@0.1.0`
- refreshed dependencies with `npm ci`
- ran `npm run preflight:install-state` after dependency refresh
- ran full `npm run ci` (`431` tests, `0` failures)
- verified `git diff --check` passes with no whitespace errors
- verified root plus both standalone package dry-runs
- verified root plus both standalone publish dry-runs

## Suggested release blurb

`v0.1.55 adds code-reviewer for isolated guarded code reviews and dynamic-context-pruning for cache-aware cleanup of stale, duplicate, and superseded session context.`
