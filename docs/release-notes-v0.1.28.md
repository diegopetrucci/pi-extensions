# Release notes — v0.1.28

## Highlights

This release tightens `oracle` model selection and thinking-level compatibility. Together now has first-class hardcoded provider ranking, and oracle calls pass/report a pi-compatible effective thinking level when the matched model cannot use the requested level.

## oracle

- adds Together to the provider-specific hardcoded preference coverage, with `deepseek-ai/DeepSeek-V4-Pro` as the first intended pick when available and GLM, Kimi, Qwen, MiniMax, GPT OSS, and older model fallbacks before the heuristic ranker
- documents Together coverage in the oracle docs/provider matrix alongside the other built-in providers
- keeps `xhigh` as the default request for reasoning models, then resolves the effective thinking level against the matched model's supported capabilities before launching the oracle subprocess
- applies the same thinking-level clamp to explicit model overrides when the override matches an authenticated model; unmatched overrides preserve the requested fallback because no model capability map is available
- preserves requested-vs-effective context for matched models by passing the effective level, reporting the effective level in results, and recording the requested level plus a clamp reason when a request is adjusted

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.28`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.8`

## Suggested release blurb

`v0.1.28 improves oracle with hardcoded Together provider ranking and pi-compatible thinking-level clamping that preserves requested-vs-effective context for matched models.`
