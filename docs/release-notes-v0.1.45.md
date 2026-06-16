# Release notes — v0.1.45

## Highlights

This release updates `oracle` auto-selection so Claude Fable 5 is preferred when it is available on Anthropic-compatible providers.

## oracle

- adds Claude Fable 5 to hardcoded oracle model preferences for Anthropic, Amazon Bedrock, Cloudflare AI Gateway, GitHub Copilot, OpenCode, OpenRouter, and Vercel AI Gateway
- keeps newer Claude Opus 4.8 preferences as fallbacks after Fable where those providers expose them
- updates the oracle provider matrix so `/oracle-model` expectations match the new top picks
- updates the oracle README to mention Claude Fable coverage
- publishes `@diegopetrucci/pi-oracle@0.1.12` alongside the collection package

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.45`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.12`

## Validation

- verified npm registry state for the root and standalone oracle packages
- verified package JSON metadata and release docs
- verified whitespace and patch formatting
- ran TypeScript and bundling checks for the oracle extension
- smoke-tested `/oracle-model` for Anthropic and OpenRouter Fable selections
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs
