Adds `brrr`, a standalone pi extension for brrr push notifications when pi finishes an agent turn and is ready for input.

## Highlights

- Hooks pi's `agent_end` event and posts directly to a brrr webhook.
- Defaults to resolving the webhook from `$BRRR_WEBHOOK_URL`.
- Supports global config at `~/.pi/agent/extensions/brrr.json` and project config at `.pi/brrr.json`.
- Adds optional macOS idle gating, defaulting to 20 seconds.
- Can use the final assistant message as the notification body, with a configurable fallback message.
- Adds `/brrr` to show notification status.
- Publishes standalone `@diegopetrucci/pi-brrr@0.1.0` alongside `@diegopetrucci/pi-extensions@0.1.33`.

## Packages

- `@diegopetrucci/pi-extensions@0.1.33`
- `@diegopetrucci/pi-brrr@0.1.0`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone brrr:

```bash
pi install npm:@diegopetrucci/pi-brrr
```

Then set your webhook and reload pi:

```bash
export BRRR_WEBHOOK_URL='https://api.brrr.now/v1/br_...'
```

```text
/reload
```
