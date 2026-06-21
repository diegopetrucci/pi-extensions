# brrr

A pi extension that sends [brrr](https://brrr.now) push notifications when pi finishes an agent turn and is ready for input.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-brrr
```

### Collection package

```bash
pi install npm:@diegopetrucci/pi-extensions
```

### GitHub package

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Configuration

Config files are merged, with project config overriding global config:

- `~/.pi/agent/extensions/brrr.json`
- `<project>/.pi/brrr.json`

Project config is only read after Pi reports that the project is trusted.

The default config expects your webhook in `BRRR_WEBHOOK_URL`:

```bash
export BRRR_WEBHOOK_URL='https://api.brrr.now/v1/br_...'
```

A ready-to-copy sample file is included at [`brrr.example.json`](./brrr.example.json).

Example:

```json
{
  "enabled": true,
  "onlyWhenInteractive": true,
  "webhook": "$BRRR_WEBHOOK_URL",
  "idleSeconds": 20,
  "title": "Pi finished",
  "message": "Pi finished working in '{project}'.",
  "includeLastAssistantMessage": true,
  "sound": "",
  "openUrl": "",
  "imageUrl": ""
}
```

## Commands

- `/brrr` shows whether notifications are enabled, whether the webhook resolves, and the idle threshold.

## Config fields

- `enabled`: master on/off switch
- `onlyWhenInteractive`: skip notifications in print / non-UI mode
- `webhook`: brrr webhook URL or an environment reference like `$BRRR_WEBHOOK_URL`
- `idleSeconds`: only send when macOS has been idle for at least this many seconds; set to `null` to disable idle gating
- `title`: notification title; supports `{project}` and `{cwd}`
- `message`: fallback notification body; supports `{project}` and `{cwd}`
- `includeLastAssistantMessage`: use the final assistant message as the notification body when available
- `sound`: optional brrr sound value
- `openUrl`: optional URL to open from the notification
- `imageUrl`: optional image URL

## Notes

- Hooks the `agent_end` event.
- The extension sends directly to the brrr webhook; it does not require the `brrr` CLI at runtime.
- By default, notifications are skipped unless the Mac has been idle for at least 20 seconds.
