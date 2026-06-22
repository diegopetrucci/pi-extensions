# Release notes — v0.1.50

## Highlights

This release refreshes Oracle's hardcoded model preference lists for the newer model IDs exposed by current Pi catalogs, so `/oracle-model` picks the intended strongest target on more providers.

## oracle

- updates Kimi preferences from K2.6-era IDs to Kimi K2.7 Code on Kimi Coding, Moonshot, Moonshot CN, Fireworks, Workers AI, OpenRouter, Together, Vercel AI Gateway, and opencode-go where those providers expose it
- prefers MiniMax M3 ahead of MiniMax M2.7 on MiniMax, MiniMax CN, Fireworks, OpenRouter, Together, Vercel AI Gateway, and opencode-go
- prefers GLM 5.2 ahead of GLM 5.1 on ZAI, ZAI Coding CN, Workers AI, Fireworks, OpenRouter, Vercel AI Gateway, and opencode-go where available
- adds hardcoded Oracle provider preferences and provider-matrix documentation for `ant-ling`, `nvidia`, and `zai-coding-cn`
- keeps older Kimi K2.6, MiniMax M2.7, and GLM 5.1 IDs as fallbacks for providers that still expose them
- updates `docs/oracle-provider-matrix.md` to match the refreshed preference order
- fixes [#2](https://github.com/diegopetrucci/pi-extensions/issues/2)
- publishes `@diegopetrucci/pi-oracle@0.1.14` alongside the collection package

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.50`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.14`

## Validation

- verified npm registry state for the root and standalone oracle packages
- verified package JSON metadata, lockfile versions, release docs, and Pi 0.79.10 dev dependency refresh
- verified refreshed preference patterns against the installed Pi model catalog
- ran install-state preflight and full TypeScript CI
- verified whitespace and patch formatting
- verified root and standalone oracle package dry-runs
- verified root and standalone oracle publish dry-runs
