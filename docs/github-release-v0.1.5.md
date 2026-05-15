This release rounds out the new `oracle` extension and makes its model selection much more predictable across providers.

## Highlights

- adds an Amp-style `oracle` extension for pi
- runs the oracle in a separate read-only pi subprocess
- adds live oracle UI while running
  - footer status line
  - widget below the editor
- explicitly sets oracle reasoning level
  - `xhigh` for reasoning models by default
  - `off` for non-reasoning models by default
  - optional `thinkingLevel` override
- adds provider-specific hardcoded model rankings across pi’s built-in providers
- adds oracle preview art and provider matrix docs

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

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone oracle package: `@diegopetrucci/pi-oracle`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone oracle:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
