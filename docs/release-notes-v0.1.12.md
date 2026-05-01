# Release notes — v0.1.12

## Highlights

This release refreshes `oracle` model selection so it tracks the latest top reasoning models exposed by pi's built-in providers.

## Changed

- `oracle` now prefers newer top models such as Claude Opus 4.7, GPT-5.5 Pro, GPT-5.5, Gemini 3.1 Pro, Grok 4.3, Kimi K2.6, DeepSeek V4 Pro, MiniMax M2.7, and Mistral Medium 3.5 where available
- provider preference coverage now includes Cloudflare AI Gateway, Cloudflare Workers AI, DeepSeek, Fireworks, Moonshot, and Moonshot CN
- the oracle provider matrix was updated with the expected first match for each built-in provider
- the oracle README now mentions the expanded built-in provider coverage
- added repository agent guidance to remind agents to run the release checklist before considering repository changes complete

## Why

The oracle extension intentionally hardcodes provider-specific top model preferences before falling back to heuristics. pi's model catalog has gained several stronger reasoning models and new provider entries, so the hardcoded preference matrix needed a refresh to keep `/oracle-model` choosing the best available target predictably.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.12`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.6`

## Suggested release blurb

`v0.1.12 refreshes oracle model selection for the latest top reasoning models, adds preference coverage for new built-in providers, and updates the oracle provider matrix.`
