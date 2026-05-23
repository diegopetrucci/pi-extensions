# Release notes — v0.1.33

## Highlights

This release adds `brrr`, a standalone pi extension that sends brrr push notifications when pi finishes an agent turn and is ready for input.

## brrr

- hooks pi's `agent_end` event and posts directly to a brrr webhook
- supports a global or project-local config file
- defaults to resolving the webhook from `$BRRR_WEBHOOK_URL`
- includes optional macOS idle gating, defaulting to 20 seconds to avoid notifying while you are actively at the keyboard
- can use the final assistant message as the notification body, falling back to a configurable project-aware message
- adds `/brrr` to show notification status, webhook resolution status, and the idle threshold
- publishes a standalone package, `@diegopetrucci/pi-brrr@0.1.0`, alongside the collection package

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.33`
- standalone brrr package: `@diegopetrucci/pi-brrr@0.1.0`

## Suggested release blurb

`v0.1.33 adds brrr, a standalone pi extension that sends brrr push notifications when pi finishes a turn, with env-based webhook config, optional macOS idle gating, and a /brrr status command.`
