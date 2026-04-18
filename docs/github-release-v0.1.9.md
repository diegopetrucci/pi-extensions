# GitHub release body — v0.1.9

## v0.1.9

This release upgrades the `notify` extension with configurable multi-channel notifications.

### Highlights

- `notify` now supports:
  - terminal notifications
  - desktop notifications
  - terminal bell
  - sound playback
- all channels are enabled by default
- title and body are configurable
- terminal, desktop, and sound backends are configurable
- config files are merged with project overrides:
  - `~/.pi/agent/extensions/notify.json`
  - `<project>/.pi/notify.json`
- includes a sample config file at `extensions/notify/notify.example.json`

### Included docs

- [`docs/release-notes-v0.1.9.md`](./release-notes-v0.1.9.md)
- [`docs/publish-checklist-v0.1.9.md`](./publish-checklist-v0.1.9.md)
- [`docs/announcement-v0.1.9.md`](./announcement-v0.1.9.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.9`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.1`

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
