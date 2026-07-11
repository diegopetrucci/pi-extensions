Refreshes the tlh extension fleet for the Pi 0.80.6 validated baseline, prefers GPT-5.6 Sol at high for Code Reviewer, Oracle, and Contrarian on relevant OpenAI/OpenAI Codex auto-selection paths when available, preserves `max` thinking where supported, moves Notify and Brrr alerts to settled runs, and expands Context Inspector current-context projection.

## Highlights

- refreshes the active Pi 0.80.6 fleet-tested markers across the collection and all standalone workspace packages
- prefers GPT-5.6 Sol first on the relevant OpenAI and OpenAI Codex auto-selection paths for `code-reviewer`, `oracle`, and `contrarian` when available, while keeping existing fallback behavior intact
- keeps Code Reviewer and Contrarian on high by default for those auto-selected runs, and defaults Oracle's GPT-5.6 Sol path to high while retaining xhigh for Oracle's other reasoning-model defaults
- preserves `max` thinking in `oracle`, `contrarian`, `librarian`, and `code-reviewer` when the selected model supports it, with safe clamping otherwise
- updates `notify` and `brrr` to fire on `agent_settled` so notifications arrive after the run fully settles
- preserves Brrr's final assistant-message payload by resolving it from settled session state
- expands `context-inspector` to compare the current model context projection with full active branch history

## Packages

- `@diegopetrucci/pi-extensions@0.1.56`
- `@diegopetrucci/pi-agent-workflow-audit@0.1.5`
- `@diegopetrucci/pi-annotate-git-diff@0.1.3`
- `@diegopetrucci/pi-annotate-last-message@0.1.3`
- `@diegopetrucci/pi-brrr@0.1.6`
- `@diegopetrucci/pi-claude-fast@0.1.6`
- `@diegopetrucci/pi-code-reviewer@0.1.1`
- `@diegopetrucci/pi-confirm-destructive@0.1.6`
- `@diegopetrucci/pi-context-cap@0.1.5`
- `@diegopetrucci/pi-context-inspector@0.1.5`
- `@diegopetrucci/pi-contrarian@0.1.3`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.5`
- `pi-dynamic-context-pruning@0.1.1`
- `@diegopetrucci/pi-git-footer@0.1.4`
- `@diegopetrucci/pi-gnosis@0.1.5`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.3`
- `@diegopetrucci/pi-inline-bash@0.1.5`
- `@diegopetrucci/pi-librarian@0.1.10`
- `@diegopetrucci/pi-minimal-footer@0.1.13`
- `@diegopetrucci/pi-notify@0.1.9`
- `@diegopetrucci/pi-openai-fast@0.1.8`
- `@diegopetrucci/pi-oracle@0.1.18`
- `@diegopetrucci/pi-permission-gate@0.1.6`
- `@diegopetrucci/pi-quiet-tools@0.1.6`
- `@diegopetrucci/pi-review@0.1.6`
- `@diegopetrucci/pi-todo@0.1.5`
- `@diegopetrucci/pi-triage-comments@0.1.6`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone packages can be installed individually, for example:

```bash
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-librarian
pi install npm:@diegopetrucci/pi-notify
pi install npm:@diegopetrucci/pi-context-inspector
```

Then reload pi:

```text
/reload
```
