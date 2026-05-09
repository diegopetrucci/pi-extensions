# Release notes — v0.1.16

## Highlights

This release adds `compact-bash`, a new pi extension that makes collapsed assistant `bash` tool output much quieter by rendering a one-line preview by default.

## New extension: compact-bash

- adds `extensions/compact-bash`
- overrides pi's built-in assistant `bash` tool renderer
- keeps the actual tool result unchanged for the model
- collapsed `bash` output shows one output line plus an inline hidden-line count
- expanded output still shows the full rendered result via `Ctrl+O`
- starts enabled by default
- includes temporary session/runtime commands:
  - `/compact-bash status`
  - `/compact-bash off`
  - `/compact-bash on`
  - `/compact-bash toggle`

## Notes

- This is a display-only change for assistant-invoked `bash` tool rows.
- It does not truncate or rewrite bash output sent to the model.
- User `!`/`!!` bash commands are rendered by pi's separate user-bash component and keep pi's default preview behavior.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.16`
- new standalone compact bash package: `@diegopetrucci/pi-compact-bash@0.1.0`
- standalone context cap package: `@diegopetrucci/pi-context-cap@0.1.0`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

## Suggested release blurb

`v0.1.16 adds compact-bash, a new pi extension that collapses assistant bash tool output to a one-line preview by default while keeping full output available with Ctrl+O.`
