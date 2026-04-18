# GitHub release body — v0.1.8

## v0.1.8

This release adds a small `notify` extension to the collection.

### Highlights

- adds a `notify` extension for pi
- sends a notification when the agent finishes and is waiting for input
- supports multiple backends:
  - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
  - OSC 99: Kitty
  - Windows toast: Windows Terminal / WSL
- chooses the backend from the current terminal environment
- keeps the extension very close to the original example from `badlogic/pi-mono`

### Included docs

- [`docs/release-notes-v0.1.8.md`](./release-notes-v0.1.8.md)
- [`docs/publish-checklist-v0.1.8.md`](./publish-checklist-v0.1.8.md)
- [`docs/announcement-v0.1.8.md`](./announcement-v0.1.8.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.8`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.0`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone notify:

```bash
pi install npm:@diegopetrucci/pi-notify
```

Then reload pi:

```text
/reload
```
