# Announcement copy — v0.1.33

## Short post

Released `@diegopetrucci/pi-extensions@0.1.33` and `@diegopetrucci/pi-brrr@0.1.0`.

This release adds `brrr`, a standalone pi extension that sends brrr push notifications when pi finishes an agent turn and is ready for input. It supports `$BRRR_WEBHOOK_URL`, global/project config, optional macOS idle gating, final assistant-message notification bodies, and a `/brrr` status command.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or standalone:

```bash
pi install npm:@diegopetrucci/pi-brrr
```

Standalone package: `@diegopetrucci/pi-brrr@0.1.0`.

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.33` / `@diegopetrucci/pi-brrr@0.1.0`.

Adds brrr push notifications for pi `agent_end`, with `$BRRR_WEBHOOK_URL`, optional macOS idle gating, final assistant-message bodies, and `/brrr` status.

## Very short version

Released `pi-brrr@0.1.0` / `pi-extensions` v0.1.33.

Adds brrr push notifications for pi.

## Discord / forum version

`pi-brrr@0.1.0` / `pi-extensions@0.1.33` is out.

This release adds `brrr`, a standalone pi extension that sends brrr push notifications when pi finishes an agent turn and is ready for input. It posts directly to the brrr webhook, supports global/project config, can resolve the webhook from `$BRRR_WEBHOOK_URL`, and defaults to a 20-second macOS idle threshold to avoid notifying while you are actively using the machine.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone package:

```bash
pi install npm:@diegopetrucci/pi-brrr
```

The standalone package version is `@diegopetrucci/pi-brrr@0.1.0`.
