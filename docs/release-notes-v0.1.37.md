# Release notes — v0.1.37

## Highlights

This release adds `claude-fast`, a new pi extension that enables Anthropic Claude Fast mode for supported Claude Opus models.

## Claude Fast

- adds `/claude-fast` to toggle Claude Fast mode for the current session/runtime
- injects `speed: "fast"` into eligible Anthropic Messages request payloads
- adds the required `fast-mode-2026-02-01` Anthropic beta header while active
- gates Fast mode to the first-party `anthropic` provider on `claude-opus-4-6` and `claude-opus-4-7`
- defaults off so installing the collection does not accidentally spend Fast-mode credits

## Packaging

- adds standalone package `@diegopetrucci/pi-claude-fast@0.1.0`
- bumps the collection package to `@diegopetrucci/pi-extensions@0.1.37`
- documents global and project config files for `claude-fast`

## Validation

- typechecked all extension entrypoints
- smoke-tested `/claude-fast` loading through Pi with only the `claude-fast` extension enabled
- ran npm audit with high-severity threshold
- verified root and standalone `claude-fast` package dry-runs
- verified root and standalone `claude-fast` publish dry-runs

## Suggested release blurb

`v0.1.37 adds claude-fast, a /claude-fast extension that enables Anthropic Claude Fast mode on supported Claude Opus models by injecting speed: "fast" and the required Fast mode beta header.`
