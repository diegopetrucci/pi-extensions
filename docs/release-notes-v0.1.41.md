# Release notes — v0.1.41

## Highlights

This release fixes `claude-fast` so disabled Fast mode no longer strips Claude Code OAuth Anthropic beta headers from selected models during status synchronization.

## claude-fast

- bumps `@diegopetrucci/pi-claude-fast` to `0.1.2`
- when Fast mode is disabled, removes only the Fast-mode beta header: `fast-mode-2026-02-01`
- preserves existing Claude Code OAuth beta headers such as `claude-code-20250219` and `oauth-2025-04-20`
- keeps Fast mode behavior unchanged when explicitly enabled for supported Anthropic Claude Opus models

## Packaging

- bumps the collection package to `@diegopetrucci/pi-extensions@0.1.41`

## Validation

- typechecked all extension entrypoints
- ran npm audit with high-severity threshold
- verified root and `claude-fast` package dry-runs
- verified root and `claude-fast` publish dry-runs
