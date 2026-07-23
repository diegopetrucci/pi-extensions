# oracle

![oracle preview](https://raw.githubusercontent.com/diegopetrucci/pi-extensions/main/assets/oracle-preview.svg)

An Amp-style oracle for [pi](https://github.com/earendil-works/pi).

It adds an `oracle` tool that spins up a separate read-only pi subprocess and sends it to the strongest reasoning model available on the **same provider/subscription** the user is currently using.

## What it does

- creates an isolated read-only subprocess
- auto-picks the strongest reasoning model on the current provider
- uses provider-specific hardcoded rankings first, then a heuristic fallback
- requests `xhigh` by default for reasoning models, then clamps to the model-supported thinking level
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

The hardcoded rankings now cover pi's built-in provider set, including Claude Fable on Anthropic-compatible providers and Together; see the provider matrix for the current provider-by-provider top picks.

If no reasoning model exists on the current provider, it falls back to the best available model on that provider.

## Reasoning level

Yes — the extension explicitly sets the oracle reasoning level.

- reasoning models request `xhigh` by default, then use the Pi-compatible effective thinking level supported by the matched model
- non-reasoning models default to `off`
- you can override it with the tool's optional `thinkingLevel` parameter; matched models still clamp unsupported overrides and report the effective level
- you can persist a default thinking level with `/oracle thinking <level>` so future automatic oracle tool calls use it when the agent does not pass a per-call override

Use `/oracle-model` inside pi to see what it would pick right now.

See also:
- [Oracle provider matrix](../../docs/oracle-provider-matrix.md)
- [v0.1.12 release notes](../../docs/release-notes-v0.1.12.md)

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

## User defaults

Use `/oracle` to set persisted defaults that apply to future oracle tool calls, including calls the agent launches automatically without per-call overrides.

```text
/oracle status
/oracle model anthropic/claude-opus-4-5
/oracle thinking high
/oracle thinking auto
/oracle clear model
/oracle clear thinking
/oracle clear
```

Tool-call parameters still win over these defaults. `auto` clears the configured default and restores the built-in selection behavior. Preferences are saved under pi's agent directory in `extensions/oracle.json`.

## Tool parameters

- `task` - required prompt for the oracle
- `includeBash` - optional, adds `bash` for non-mutating inspection
- `model` - optional explicit model override; falls back to the `/oracle model` default, then auto-selection
- `thinkingLevel` - optional reasoning/thinking override; falls back to the `/oracle thinking` default, then built-in defaults
- `cwd` - optional working directory override

## Notes

- The oracle is intentionally **read-only by default**.
- It is best for review, analysis, planning, debugging, and second opinions.
- It is slower than using the main model directly, so it should be used selectively.
- While it runs in interactive mode, it adds a footer status line and a widget below the editor.
