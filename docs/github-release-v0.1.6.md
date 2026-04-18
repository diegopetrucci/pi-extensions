# GitHub release body — v0.1.6

## v0.1.6

This release adds a small `permission-gate` extension to the collection.

### Highlights

- adds a `permission-gate` extension for pi
- prompts before potentially dangerous bash commands
- checks for:
  - `rm -rf`
  - `sudo`
  - `chmod` / `chown` with `777`
- blocks matching commands by default when no interactive UI is available
- keeps the extension very close to the original example from `badlogic/pi-mono`

### Included docs

- [`docs/release-notes-v0.1.6.md`](./release-notes-v0.1.6.md)
- [`docs/publish-checklist-v0.1.6.md`](./publish-checklist-v0.1.6.md)
- [`docs/announcement-v0.1.6.md`](./announcement-v0.1.6.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.6`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.0`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone permission gate:

```bash
pi install npm:@diegopetrucci/pi-permission-gate
```

Then reload pi:

```text
/reload
```
