# Release notes — v0.1.5

## Highlights

This release rounds out the new `oracle` extension and makes its model selection much more predictable across providers.

## Added

- Amp-style `oracle` extension for pi
- read-only oracle subprocess using a separate pi invocation
- live oracle status line and below-editor widget while the oracle is running
- preview asset: `assets/oracle-preview.svg`
- provider matrix doc: `docs/oracle-provider-matrix.md`

## Improved

- provider-specific hardcoded rankings now cover pi's built-in provider set
- explicit oracle reasoning level control
  - defaults to `xhigh` for reasoning models
  - defaults to `off` for non-reasoning models
  - optional `thinkingLevel` override in the tool call
- `/oracle-model` now works in print mode too
- package metadata and README updated for the oracle extension

## Providers covered by hardcoded oracle rankings

- amazon-bedrock
- anthropic
- azure-openai-responses
- cerebras
- github-copilot
- google
- google-antigravity
- google-gemini-cli
- google-vertex
- groq
- huggingface
- kimi-coding
- minimax
- minimax-cn
- mistral
- openai
- openai-codex
- opencode
- opencode-go
- openrouter
- vercel-ai-gateway
- xai
- zai

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.5`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.5`

## Suggested release blurb

`v0.1.5 adds an Amp-style Oracle extension for pi, with read-only subprocess execution, explicit reasoning-level control, live status UI, preview art, and hardcoded model rankings across pi’s built-in providers.`
