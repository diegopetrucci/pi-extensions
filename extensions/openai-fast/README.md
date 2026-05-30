# openai-fast

A pi extension that enables OpenAI Codex Fast mode for ChatGPT-auth GPT-5.4 and GPT-5.5.

When active, the extension injects this into eligible OpenAI Codex request payloads:

```json
{
  "service_tier": "priority"
}
```

The user-facing feature is OpenAI Codex **Fast mode**. The wire value is `priority` because current Codex clients map Fast mode to the OpenAI priority service tier.

## Eligibility

Fast mode is only injected when all of these are true:

- The current provider is `openai-codex`.
- The current API is `openai-codex-responses`.
- The current model is `gpt-5.4` or `gpt-5.5`.
- The provider is using ChatGPT OAuth/subscription auth, not API-key auth.
- The request payload does not already include `service_tier`.

## Commands

```text
/fast
```

Run `/fast` to toggle Fast mode on or off for the current session/runtime. The command reports the new state in chat, and the footer shows `fast` while Fast mode is active for an eligible model.

The extension defaults to off so installing the full collection does not accidentally spend Fast-mode credits.

## Config

Optional global config:

```text
~/.pi/agent/extensions/openai-fast.json
```

Optional project config:

```text
.pi/openai-fast.json
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
pi install npm:@diegopetrucci/pi-openai-fast
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

- This extension intentionally does not affect API-key OpenAI models.
- Pi may only account Fast-mode cost correctly when the backend reports `service_tier: "priority"` in the streamed response. The extension does not patch usage totals to avoid double-counting.
- If pi adds first-class service-tier support later, this extension skips payloads that already contain `service_tier`.
