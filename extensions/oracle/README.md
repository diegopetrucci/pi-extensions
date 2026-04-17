# oracle

![oracle preview](https://raw.githubusercontent.com/diegopetrucci/pi-extensions/main/assets/oracle-preview.svg)

An Amp-style oracle for [pi](https://github.com/badlogic/pi-mono).

It adds an `oracle` tool that spins up a separate read-only pi subprocess and sends it to the strongest reasoning model available on the **same provider/subscription** the user is currently using.

## What it does

- creates an isolated read-only subprocess
- auto-picks the strongest reasoning model on the current provider
- uses provider-specific hardcoded rankings first, then a heuristic fallback
- sets reasoning/thinking to `xhigh` by default for reasoning models
- defaults to `read,grep,find,ls`
- can optionally allow non-mutating `bash` inspection
- shows a live oracle status line and widget while the subprocess is running
- renders the oracle response with model, thinking level, timing, and usage info

## Model selection

By default, the extension:

1. looks at the current model's provider
2. lists authenticated models on that provider
3. prefers reasoning-capable models
4. tries a provider-specific hardcoded priority list first
5. falls back to a heuristic that favors stronger tiers like `opus`, `pro`, newer versions, and penalizes `mini`, `flash`, `haiku`, `spark`, etc.

The hardcoded rankings now cover pi's built-in provider set, including OpenAI/Codex, Anthropic, Google variants, GitHub Copilot, Bedrock, Azure OpenAI Responses, Groq, Hugging Face, Kimi, MiniMax, Mistral, OpenCode, OpenRouter, Vercel AI Gateway, xAI, ZAI, and Cerebras.

If no reasoning model exists on the current provider, it falls back to the best available model on that provider.

## Reasoning level

Yes — the extension explicitly sets the oracle reasoning level.

- reasoning models default to `xhigh`
- non-reasoning models default to `off`
- you can override it with the tool's optional `thinkingLevel` parameter

Use `/oracle-model` inside pi to see what it would pick right now.

See also:
- [Oracle provider matrix](../../docs/oracle-provider-matrix.md)
- [v0.1.5 release notes](../../docs/release-notes-v0.1.5.md)

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-oracle
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

## Usage

Ask pi normally, for example:

- `Use the oracle to review the last commit for regressions.`
- `Use the oracle for a second opinion on this refactor plan.`
- `Debug this issue and lean on the oracle heavily.`

The main agent can call the tool directly.

## Tool parameters

- `task` - required prompt for the oracle
- `includeBash` - optional, adds `bash` for non-mutating inspection
- `model` - optional explicit model override
- `thinkingLevel` - optional reasoning/thinking override
- `cwd` - optional working directory override

## Notes

- The oracle is intentionally **read-only by default**.
- It is best for review, analysis, planning, debugging, and second opinions.
- It is slower than using the main model directly, so it should be used selectively.
- While it runs in interactive mode, it adds a footer status line and a widget below the editor.
