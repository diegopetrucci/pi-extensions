This release refines the `notify` extension defaults so sound is opt-in instead of enabled by default.

## Highlights

- sound is no longer enabled by default
- terminal notifications, desktop notifications, and bell remain enabled by default
- sound playback is still available through config
- `extensions/notify/README.md` now includes a minimal sound-enabling example
- `extensions/notify/notify.example.json` keeps the sound settings as an example, but disabled by default

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
