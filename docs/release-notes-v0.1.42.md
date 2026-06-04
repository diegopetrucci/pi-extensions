# Release notes — v0.1.42

## Highlights

This release updates `librarian` so its internal research subagent no longer inherits the caller's high-thinking model settings by default, and turns the local checkout cache off by default.

## librarian

- bumps `@diegopetrucci/pi-librarian` to `0.1.5`
- changes the local repository checkout cache default from on to off
- adds `/librarian-config` for persistent internal subagent defaults:
  - `/librarian-config model <provider/model|auto|current>`
  - `/librarian-config thinking <off|minimal|low|medium|high|xhigh|auto>`
  - `/librarian-config clear [all|model|thinking]`
- defaults the internal librarian subagent to a lightweight auto-selected model with `medium` thinking
- adds optional `model` and `thinkingLevel` tool-call overrides for explicit non-default runs
- preserves `/librarian-cache` for cache on/off/toggle/status control

## Packaging

- bumps the collection package to `@diegopetrucci/pi-extensions@0.1.42`

## Validation

- typechecked all extension entrypoints
- verified whitespace and patch formatting
- ran npm audit with high-severity threshold
- smoke-tested `/librarian-cache` and `/librarian-config` commands in isolated print-mode configs
- verified root and `librarian` package dry-runs
- verified root and `librarian` publish dry-runs
