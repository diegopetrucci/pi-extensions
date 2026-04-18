# Release notes — v0.1.6

## Highlights

This release adds a small `permission-gate` extension to the collection.

## Added

- new `permission-gate` extension for pi
- prompts before potentially dangerous bash commands
- checks for:
  - `rm -rf`
  - `sudo`
  - `chmod` / `chown` with `777`
- blocks matching commands by default when no interactive UI is available

## Notes

- the extension is intentionally kept very close to the original example from `badlogic/pi-mono`
- extension README links back to the original source example

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.6`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.0`

## Suggested release blurb

`v0.1.6 adds a small permission-gate extension for pi that prompts before dangerous bash commands like rm -rf, sudo, and chmod 777, while blocking them by default in non-interactive mode.`
