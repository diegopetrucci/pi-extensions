# Announcement drafts — v0.1.56

## Short

Released `@diegopetrucci/pi-extensions@0.1.56`: refreshes the tlh extension fleet for the Pi 0.80.6 validated baseline, patch-bumps every standalone workspace for the new fleet marker, prefers GPT-5.6 Sol at high for Code Reviewer, Oracle, and Contrarian on relevant OpenAI/OpenAI Codex auto-selection paths when available, preserves `max` thinking where supported, moves Notify and Brrr alerts to `agent_settled`, preserves Brrr's final assistant-message payload from settled session state, and expands Context Inspector current-context projection against full branch history.

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

```bash
pi install npm:@diegopetrucci/pi-extensions
# or individually
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-librarian
pi install npm:@diegopetrucci/pi-notify
pi install npm:@diegopetrucci/pi-context-inspector
```

Then reload pi with `/reload`.

## X / Twitter version

Released `pi-extensions@0.1.56` plus patch bumps for every standalone package in the tlh fleet.

Pi 0.80.6 baseline refresh, GPT-5.6 Sol high preference for Code Reviewer, Oracle, and Contrarian on relevant OpenAI/OpenAI Codex auto-selection paths when available, max-thinking preservation, settled Notify and Brrr alerts, Brrr's final assistant-message payload from settled session state, and richer Context Inspector projection are all included.
