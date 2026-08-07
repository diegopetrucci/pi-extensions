# fast

A pi extension that provides one `/fast` toggle for supported OpenAI Codex and Anthropic Claude models. It selects the provider-specific Fast-mode request shape from the currently selected model.

For eligible OpenAI Codex models it injects:

```json
{
  "service_tier": "priority"
}
```

For eligible Anthropic Claude models it injects:

```json
{
  "speed": "fast"
}
```

It also adds the required Anthropic beta header value:

```text
anthropic-beta: fast-mode-2026-02-01
```

## Eligibility

OpenAI Fast mode requires all of the following:

- Provider `openai-codex`.
- API `openai-codex-responses`.
- Model `gpt-5.4`, `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, or `gpt-5.6-luna`.
- ChatGPT OAuth/subscription auth, not API-key auth.
- No existing `service_tier` field in the request payload.

Anthropic Fast mode requires all of the following:

- Provider `anthropic`.
- API `anthropic-messages`.
- Model `claude-opus-4-6`, `claude-opus-4-7`, or `claude-opus-4-8`.
- No existing `speed` field in the request payload.

Anthropic Fast mode supports both API-key and Claude Code OAuth access when the account has access to the research preview.

## Commands

```text
/fast
```

Run `/fast` to toggle Fast mode for the current session/runtime. The enabled state follows model changes: switching between eligible OpenAI and Anthropic models automatically changes the request format without resetting the toggle. The footer shows `fast` only while the selected model is eligible and Fast mode is enabled.

The extension defaults to off so installing the full collection does not accidentally spend Fast-mode credits.

## Config

Optional global config:

```text
~/<pi-config-dir>/agent/extensions/fast.json
```

Optional project config:

```text
<project>/<pi-config-dir>/fast.json
```

Here `<pi-config-dir>` is Pi's runtime config directory name (`CONFIG_DIR_NAME`; `.pi` by default). Project config overrides global config after Pi reports that the project is trusted.

```json
{
  "enabled": false,
  "showStatus": true
}
```

- `enabled`: default Fast-mode state when there is no session override.
- `showStatus`: show a compact `fast` status when Fast mode is active for the selected model.

The unified extension intentionally does not read `openai-fast.json` or `claude-fast.json`; those files belong to the provider-specific standalone packages and may contain conflicting defaults.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-fast
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

## Legacy provider-specific packages

The collection package loads this unified extension instead of `openai-fast` and `claude-fast`. Both provider-specific packages remain available as standalone alternatives. Do not load them together with this extension: independent Fast-mode state and duplicate `/fast` registrations can produce conflicting behavior.

## Notes

- Anthropic Fast mode has separate rate limits, costs more than standard speed, and does not share prompt-cache prefixes with standard-speed requests.
- OpenAI Fast mode intentionally does not affect API-key models.
- Existing `speed` and `service_tier` fields are never overwritten.
- Cost accounting still depends on the provider reporting the effective tier in its streamed response.
