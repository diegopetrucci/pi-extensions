# Announcement drafts — v0.1.54

## Short

Released `@diegopetrucci/pi-extensions@0.1.54`: refreshes the tlh extension fleet for the Pi 0.80.3 validated baseline, prefers Claude Sonnet 5 before Sonnet 4 in `oracle` and `contrarian` fallback selection when Claude Fable 5 and Claude Opus are unavailable, and fixes TUI-only custom/native UI guards to use `ctx.mode === "tui"` while keeping RPC-safe UI behavior on `ctx.hasUI`.

## Packages

- `@diegopetrucci/pi-extensions@0.1.54`
- `@diegopetrucci/pi-agent-workflow-audit@0.1.4`
- `@diegopetrucci/pi-annotate-git-diff@0.1.2`
- `@diegopetrucci/pi-annotate-last-message@0.1.2`
- `@diegopetrucci/pi-brrr@0.1.5`
- `@diegopetrucci/pi-claude-fast@0.1.5`
- `@diegopetrucci/pi-confirm-destructive@0.1.5`
- `@diegopetrucci/pi-context-cap@0.1.4`
- `@diegopetrucci/pi-context-inspector@0.1.4`
- `@diegopetrucci/pi-contrarian@0.1.2`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.4`
- `@diegopetrucci/pi-git-footer@0.1.3`
- `@diegopetrucci/pi-gnosis@0.1.4`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.2`
- `@diegopetrucci/pi-inline-bash@0.1.4`
- `@diegopetrucci/pi-librarian@0.1.9`
- `@diegopetrucci/pi-minimal-footer@0.1.12`
- `@diegopetrucci/pi-notify@0.1.8`
- `@diegopetrucci/pi-openai-fast@0.1.7`
- `@diegopetrucci/pi-oracle@0.1.17`
- `@diegopetrucci/pi-permission-gate@0.1.5`
- `@diegopetrucci/pi-quiet-tools@0.1.5`
- `@diegopetrucci/pi-review@0.1.5`
- `@diegopetrucci/pi-todo@0.1.4`
- `@diegopetrucci/pi-triage-comments@0.1.5`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
# or individually
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi with `/reload`.
