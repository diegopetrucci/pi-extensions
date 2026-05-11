# GitHub release body — v0.1.22

## v0.1.22

This release updates `openai-fast` so running `/fast` without arguments opens an action picker.

### Highlights

- bare `/fast` now offers a picker for `status`, `on`, `off`, `auto`, and `toggle`
- explicit commands such as `/fast on` and `/fast status` continue to work unchanged
- non-UI mode still falls back to status behavior
- publishes standalone `@diegopetrucci/pi-openai-fast@0.1.1`

### Included docs

- [`docs/release-notes-v0.1.22.md`](./release-notes-v0.1.22.md)
- [`docs/publish-checklist-v0.1.22.md`](./publish-checklist-v0.1.22.md)
- [`docs/announcement-v0.1.22.md`](./announcement-v0.1.22.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.22`
- standalone openai-fast package: `@diegopetrucci/pi-openai-fast@0.1.1`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone openai-fast:

```bash
pi install npm:@diegopetrucci/pi-openai-fast
```

Then reload pi:

```text
/reload
```
