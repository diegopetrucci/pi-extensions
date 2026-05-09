# Release notes — v0.1.14

## Highlights

This release updates the extensions for Pi's move to the `earendil-works/pi-mono` repository and the `@earendil-works/*` package scope.

## Changed

- migrated extension imports from `@mariozechner/*` to `@earendil-works/*`
- migrated oracle's TypeBox import from `@sinclair/typebox` to `typebox`
- updated root and standalone package peer dependencies to the current Pi package names
- updated Pi repository links in README and extension docs to `earendil-works/pi-mono`
- updated the oracle package metadata to declare its `@earendil-works/pi-ai` and `typebox` peers

## Oracle provider updates

- removed stale hardcoded preferences for removed Google Gemini CLI and Google Antigravity providers
- added hardcoded oracle preferences for the current Xiaomi MiMo providers:
  - `xiaomi`
  - `xiaomi-token-plan-ams`
  - `xiaomi-token-plan-cn`
  - `xiaomi-token-plan-sgp`
- updated the oracle provider matrix accordingly

## Why

Pi `0.74.0` moved package and repository plumbing to the `@earendil-works/*` scope and `earendil-works/pi-mono`. Pi still aliases the old imports for compatibility, but publishing packages with the old peer dependency names can point users at stale Pi packages. This release makes the extensions match the current Pi docs and package metadata.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.14`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

## Suggested release blurb

`v0.1.14 updates pi-extensions for Pi's @earendil-works package scope migration, switches oracle to typebox, refreshes repo links, and updates oracle provider preferences for the current Pi catalog.`
