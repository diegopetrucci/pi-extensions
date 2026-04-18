# Release notes — v0.1.8

## Highlights

This release adds a small `notify` extension to the collection.

## Added

- new `notify` extension for pi
- sends a notification when the agent finishes and is waiting for input
- supports multiple backends:
  - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
  - OSC 99: Kitty
  - Windows toast: Windows Terminal / WSL
- chooses the backend from the current terminal environment

## Notes

- the extension is intentionally kept very close to the original example from `badlogic/pi-mono`
- extension README links back to the original source example
- by default it sends `Pi` / `Ready for input`

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.8`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.0`

## Suggested release blurb

`v0.1.8 adds a small notify extension for pi that sends a terminal or desktop notification when the agent finishes and is ready for input, while staying very close to the original pi-mono example.`
