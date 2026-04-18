# GitHub release body — v0.1.7

## v0.1.7

This release adds a small `confirm-destructive` extension to the collection.

### Highlights

- adds a `confirm-destructive` extension for pi
- asks for confirmation before destructive session actions
- checks for:
  - clearing the current session
  - switching sessions when the current session has user messages
  - forking from an entry
- cancels the action when the user declines
- keeps the extension very close to the original example from `badlogic/pi-mono`

### Included docs

- [`docs/release-notes-v0.1.7.md`](./release-notes-v0.1.7.md)
- [`docs/publish-checklist-v0.1.7.md`](./publish-checklist-v0.1.7.md)
- [`docs/announcement-v0.1.7.md`](./announcement-v0.1.7.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.7`
- standalone confirm-destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.0`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone confirm-destructive:

```bash
pi install npm:@diegopetrucci/pi-confirm-destructive
```

Then reload pi:

```text
/reload
```
