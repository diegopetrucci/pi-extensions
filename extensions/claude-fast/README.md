# claude-fast

A pi extension that enables Anthropic Claude Fast mode for supported Claude Opus models.

When active, the extension injects this into eligible Anthropic request payloads:

```json
{
  "speed": "fast"
}
```

It also adds the required Anthropic beta header value to the current model before requests:

```text
anthropic-beta: fast-mode-2026-02-01
```

## Eligibility

Fast mode is only injected when all of these are true:

- The current provider is `anthropic`.
- The current API is `anthropic-messages`.
- The current model is `claude-opus-4-6` or `claude-opus-4-7`.
- The request payload does not already include `speed`.

Claude Fast mode is available for API-key access and Claude Code subscription/OAuth access when the account has access to Anthropic's Fast mode research preview. For Claude Code subscription users, Anthropic documents this as extra usage credits, not included subscription usage.

## Commands

```text
/claude-fast
```

Run `/claude-fast` to toggle Fast mode on or off for the current session/runtime. The command reports the new state in chat, and the footer shows `fast` while Fast mode is active for an eligible model.

The extension defaults to off so installing the full collection does not accidentally spend Fast-mode credits.

## Config

Optional global config:

```text
~/.pi/agent/extensions/claude-fast.json
```

Optional project config:

```text
.pi/claude-fast.json
```

Project config overrides global config.

```json
{
  "enabled": false,
  "showStatus": true
}
```

- `enabled`: default Fast-mode state when there is no session override.
- `showStatus`: show a compact `fast` status when Fast mode is active for the current model.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-claude-fast
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

## Notes

- Anthropic Fast mode has separate rate limits and costs more than standard speed.
- Requests at different speeds do not share prompt-cache prefixes.
- Anthropic documents Fast mode as unavailable with Priority Tier.
- If pi adds first-class speed support later, this extension skips payloads that already contain `speed`.
