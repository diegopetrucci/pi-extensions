# Release notes — v0.1.7

## Highlights

This release adds a small `confirm-destructive` extension to the collection.

## Added

- new `confirm-destructive` extension for pi
- asks for confirmation before destructive session actions
- checks for:
  - clearing the current session
  - switching sessions when the current session has user messages
  - forking from an entry
- cancels the action when the user declines

## Notes

- the extension is intentionally kept very close to the original example from `badlogic/pi-mono`
- extension README links back to the original source example
- in non-interactive mode, it does nothing

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.7`
- standalone confirm-destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.0`

## Suggested release blurb

`v0.1.7 adds a small confirm-destructive extension for pi that asks before clear, switch, and fork session actions, while staying very close to the original pi-mono example.`
