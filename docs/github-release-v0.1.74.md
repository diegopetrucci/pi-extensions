Fast mode now supports four GPT-6 models on OpenAI Codex while preserving its existing authentication and payload-safety boundaries.

## Highlights

- OpenAI Codex Fast mode now covers `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, and `gpt-6-luna` in the unified `fast` extension.
- For eligible `openai-codex` requests authenticated with ChatGPT OAuth, toggled Fast mode sends `service_tier: "priority"`. API-key authentication remains unsupported for Codex Fast, and existing `service_tier` values are not overwritten.
- Availability depends on plan, client, workspace settings, and rollout; local eligibility is not live-provider certification.

## Contributors

- [@denusklo](https://github.com/denusklo) — GPT-6 Codex Fast support ([PR #103](https://github.com/diegopetrucci/pi-extensions/pull/103))

## Packages

- `@diegopetrucci/pi-fast@0.1.6`
- `@diegopetrucci/pi-extensions@0.1.74`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.6"],["@diegopetrucci/pi-extensions","0.1.74"]] -->
