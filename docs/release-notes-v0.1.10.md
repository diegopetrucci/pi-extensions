# Release notes — v0.1.10

## Highlights

This release refines the `notify` extension defaults so sound is opt-in instead of enabled by default.

## Changed

- `notify` no longer enables sound playback by default
- terminal notifications, desktop notifications, and bell remain enabled by default
- sound playback is still fully supported via config
- `extensions/notify/notify.example.json` now shows sound disabled by default while keeping the sound options in place
- `extensions/notify/README.md` now includes a minimal example for enabling sound

## Why

Sound notifications can be more disruptive than terminal, desktop, or bell notifications. This change keeps the safer default behavior while preserving sound as an explicit option.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.10`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.2`

## Suggested release blurb

`v0.1.10 makes notify sound opt-in by default while keeping sound playback available via config.`
