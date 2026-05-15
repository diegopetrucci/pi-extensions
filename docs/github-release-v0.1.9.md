This release upgrades the `notify` extension with configurable multi-channel notifications.

## Highlights

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

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone notify package: `@diegopetrucci/pi-notify`

## Install

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
