Adds `code-reviewer`, a standalone read-only pi extension that runs isolated, guarded code review subagents for ticket fit, correctness, security, simplicity, and validation gaps. It auto-selects contrarian-style opposite-provider/model-family review models when available and clamps requested thinking to the chosen model's capabilities.

## Highlights

- new `code_reviewer` tool for focused read-only code review from pi sessions
- adapts the TLH code-reviewer review priorities into a standalone installable package
- isolates reviewer runs from inherited extensions, skills, prompt templates, themes, context files, and agents files
- prefers opposite-provider/model-family reviewer models with ordered fallback through available models
- reports the final reviewer model and effective/clamped thinking level in run details
- guards local inspection with read-only tools plus constrained `git`/`gh` bash access

## Packages

- `@diegopetrucci/pi-extensions@0.1.55`
- `@diegopetrucci/pi-code-reviewer@0.1.0`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone:

```bash
pi install npm:@diegopetrucci/pi-code-reviewer
```

Then reload pi:

```text
/reload
```
