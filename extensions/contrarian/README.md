# contrarian

A read-only contrarian subagent for [pi](https://github.com/earendil-works/pi).

It adds a `contrarian` tool that spins up a separate pi subprocess to stress-test plans, designs, assumptions, bug hypotheses, review conclusions, and product directions by steelmanning the strongest credible opposing case.

This is adapted from the TLH [`contrarian` subagent prompt](https://github.com/diegopetrucci/the-last-harness/blob/main/agents/subagents/contrarian.md) into a standalone pi extension.

## What it does

- creates an isolated read-only subprocess
- prefers a strong model on the opposite model family/provider when available, then falls back to the best available model
- requests `high` reasoning by default for reasoning models, then clamps to the model-supported thinking level
- defaults to `read,grep,find,ls`, with optional non-mutating bash inspection
- renders the contrarian response with model, thinking level, timing, and usage info
- shows a live contrarian status line and widget while the subprocess is running

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-contrarian
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

- `Use the contrarian to stress-test this refactor plan.`
- `Ask contrarian for the strongest opposing case before we commit to this design.`
- `Have contrarian review my bug hypothesis and identify what evidence could disprove it.`

The main agent can call the tool directly.

## User defaults

Use `/contrarian` to set persisted defaults that apply to future contrarian tool calls, including calls the agent launches automatically without per-call overrides.

```text
/contrarian status
/contrarian model anthropic/claude-opus-4-8
/contrarian thinking high
/contrarian thinking auto
/contrarian clear model
/contrarian clear thinking
/contrarian clear
```

Use `/contrarian-model` inside pi to see what it would pick right now.

Tool-call parameters still win over these defaults. `auto` clears the configured default and restores the built-in selection behavior. Preferences are saved under pi's agent directory in `extensions/contrarian.json`.

## Tool parameters

- `task` - required prompt for the contrarian
- `includeBash` - optional, adds `bash` for non-mutating inspection
- `model` - optional explicit model override; falls back to the `/contrarian model` default, then auto-selection
- `thinkingLevel` - optional reasoning/thinking override; falls back to the `/contrarian thinking` default, then built-in defaults
- `cwd` - optional working directory override

## Notes

- The contrarian is intentionally **read-only**.
- It never implements fixes or produces patches.
- Its output separates confirmed objections, plausible concerns, and unresolved unknowns.
- It is best for adversarial review before committing to a plan, design, or conclusion.
