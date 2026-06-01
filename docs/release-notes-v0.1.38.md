# Release notes — v0.1.38

## Highlights

This release validates the collection and every standalone extension package against Pi `0.78.0`, updates Oracle's Claude Opus preferences for Pi's new Opus 4.8 metadata, and extends `claude-fast` to eligible Claude Opus 4.8 requests.

## Pi 0.78.0 compatibility

- updates the local Pi development baseline to `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` `0.78.0`
- refreshes `.pi-fleet-tested-version` markers in the collection and every standalone extension package to `0.78.0`
- typechecks all extension entrypoints against Pi `0.78.0`

## Oracle

- prefers Claude Opus 4.8 before Opus 4.7 for providers where Pi `0.78.0` exposes Opus 4.8 metadata
- updates `docs/oracle-provider-matrix.md` to match the hardcoded Oracle preference order
- keeps Cloudflare AI Gateway on Opus 4.7 because Pi `0.78.0` metadata does not expose Opus 4.8 for that provider

## Claude Fast

- enables `claude-fast` for first-party Anthropic `claude-opus-4-8`
- updates user-facing eligibility text and README docs for Claude Opus 4.8 support

## Packaging

- bumps the collection package to `@diegopetrucci/pi-extensions@0.1.38`
- bumps all standalone extension packages so their Pi `0.78.0` fleet markers can be published

## Validation

- typechecked all extension entrypoints
- smoke-tested `/claude-fast` loading through Pi with only the `claude-fast` extension enabled
- smoke-tested Oracle command loading through Pi with only the `oracle` extension enabled
- ran npm audit with high-severity threshold
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs

## Suggested release blurb

`v0.1.38 validates pi-extensions and all standalone packages against Pi 0.78.0, updates Oracle for Claude Opus 4.8 metadata, and enables claude-fast for Claude Opus 4.8.`
