Adds two new standalone pi extensions in the v0.1.55 release scope: `code-reviewer` for isolated, guarded code review subagents, and `dynamic-context-pruning` for cache-aware pruning of stale, duplicate, and superseded session context.

## Highlights

- new `code_reviewer` tool for focused read-only code review from pi sessions
- `code-reviewer` adapts TLH review priorities into a standalone installable package with contrarian-style model fallback and thinking-level clamping
- `code-reviewer` isolates reviewer runs from inherited extensions, skills, prompt templates, themes, context files, and agents files
- new `dynamic-context-pruning` standalone package adds automatic dedupe, stale error-input pruning, and superseded file-op pruning behind a net-benefit gate
- `dynamic-context-pruning` adds `/prune` and `/context-pruning` commands for manual pruning, status, stats, and runtime controls

## Packages

- `@diegopetrucci/pi-extensions@0.1.55`
- `@diegopetrucci/pi-code-reviewer@0.1.0`
- `pi-dynamic-context-pruning@0.1.0`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone:

```bash
pi install npm:@diegopetrucci/pi-code-reviewer
pi install npm:pi-dynamic-context-pruning
```

Then reload pi:

```text
/reload
```
