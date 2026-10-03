# fast

A pi extension that provides one `/fast` toggle for supported direct OpenAI API, OpenAI Codex, and Anthropic Claude models. It selects the provider-specific Fast-mode request shape from the currently selected model.

For eligible direct OpenAI API models it injects:

```json
{
  "service_tier": "fast"
}
```

For eligible OpenAI Codex OAuth models it injects:

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

Direct OpenAI API Fast mode requires all of the following:

- Provider `openai`.
- API `openai-responses` or `openai-completions`.
- Model `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, or `gpt-6-luna`.
- API-key auth or Pi's `openai` ChatGPT OAuth (`Sign in with ChatGPT`).
- No existing `service_tier` field in the request payload.

The direct OpenAI route stays on OpenAI's direct API contract for both API-key
auth and Pi's `openai` ChatGPT OAuth. Acceptance of `service_tier: "fast"` by
Pi's `openai` ChatGPT OAuth sign-in endpoint has not been live-verified and
remains deferred to manual gate `pel-71t6`. This direct route is never forwarded
to legacy `openai-codex` or its subscription-usage endpoint. The documented
request shape is support evidence, not live certification; this change was
validated only with mocked eligibility and request payloads, not live or paid
provider calls.

OpenAI Codex Fast mode requires all of the following:

- Provider `openai-codex`.
- API `openai-codex-responses`.
- Model `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, or `gpt-6-luna`.
- ChatGPT OAuth/subscription auth, not API-key auth.
- No existing `service_tier` field in the request payload.

Codex evidence, 2026-10-03: the [maintainer's PR #103 review](https://github.com/diegopetrucci/pi-extensions/pull/103)
reports that the Codex model list advertises Fast as `priority` for `gpt-6-astra`,
`gpt-6.1-sol`, `gpt-6-sol`, and `gpt-6-luna`. The official Codex CLI
[sends Fast as `priority`](https://github.com/openai/codex/blob/b741e480e203f037ca726bc2a76d99a8e8668e66/codex-rs/protocol/src/config_types.rs#L539-L553).
The maintainer's live check through Pi 1.0.0 on that date returned HTTP 200 and
completed normally for `gpt-6-astra` and `gpt-6.1-sol`; `gpt-6-sol` and
`gpt-6-luna` are enabled based on the model list only. In that check,
`response.completed` always reported `service_tier: "default"`, with or without
`priority`, so the response cannot confirm Fast was applied.

Pi trusts the requested tier and applies a 2× multiplier to its displayed cost
estimate for `priority`; this does not measure included subscription allowance
consumption or confirm Fast was applied. [OpenAI's Codex speed documentation](https://developers.openai.com/codex/speed),
checked on 2026-10-03, lists `gpt-6-sol` and `gpt-6-luna` among supported Fast
models where available. It specifies 2.5× the Standard rate for included
subscription limits and 2× for purchased credits and Enterprise pay-as-you-go
billing. Treating Pi's 2× estimate as a subscription-limit multiplier would
understate the documented allowance consumption.

Anthropic Fast mode requires all of the following:

- Provider `anthropic`.
- API `anthropic-messages`.
- Model `claude-opus-4-8`, `claude-opus-5`, or `claude-opus-5-5`.
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
- Direct OpenAI Fast mode is limited to the confirmed GPT-6 API models above; Fast pricing, availability, and rate limits remain provider- and account-dependent.
- Authoritative support evidence: [OpenAI Fast mode](https://developers.openai.com/api/docs/guides/fast-mode) explicitly uses `gpt-6.1-sol` with `service_tier: "fast"` and documents `priority` as an equivalent alias for supported API models; the [GPT-6.1 Sol model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol) documents the model itself.
- Codex Fast availability depends on plan, client, workspace settings, and rollout. Local eligibility is not live-provider certification.
- Pi's provider catalog remains the source of reported model pricing, including any tiered pricing; this extension does not apply guessed discounts or rewrite cost metadata.
- OpenAI Codex Fast mode intentionally does not affect API-key models.
- The retired `openai-fast` and `claude-fast` packages remain legacy standalone boundaries; new provider/auth behavior belongs only to this unified extension.
- Existing `speed` and `service_tier` fields are never overwritten.
- Pi's model catalog may not include a Fast-mode premium. Cost accounting depends on the provider reporting the effective tier in its streamed response, and this extension does not patch usage totals.
