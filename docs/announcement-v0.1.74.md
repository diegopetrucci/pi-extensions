# Announcement drafts — v0.1.74

## Short

Pi Extensions v0.1.74 adds OpenAI Codex Fast mode support for four GPT-6 models—`gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, and `gpt-6-luna`—to the unified `fast` extension. Eligible ChatGPT OAuth Codex requests use `service_tier: "priority"` when Fast mode is enabled; API-key authentication remains excluded and existing service-tier fields are preserved. Availability remains dependent on plan, client, workspace settings, and rollout; no new compatibility certification is claimed.

## Packages

- `@diegopetrucci/pi-fast@0.1.6`
- `@diegopetrucci/pi-extensions@0.1.74`

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.6"],["@diegopetrucci/pi-extensions","0.1.74"]] -->
