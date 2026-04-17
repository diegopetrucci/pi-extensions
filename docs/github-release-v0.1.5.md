# GitHub release body — v0.1.5

## v0.1.5

This release rounds out the new `oracle` extension and makes its model selection much more predictable across providers.

### Highlights

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

### Included docs

- [`docs/oracle-provider-matrix.md`](./oracle-provider-matrix.md)
- [`docs/release-notes-v0.1.5.md`](./release-notes-v0.1.5.md)
- [`docs/publish-checklist-v0.1.5.md`](./publish-checklist-v0.1.5.md)
- [`docs/announcement-v0.1.5.md`](./announcement-v0.1.5.md)

### Providers covered by hardcoded oracle rankings

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

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.5`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.5`

### Install

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
