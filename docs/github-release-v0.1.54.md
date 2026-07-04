Refreshes the tlh extension fleet for the Pi 0.80.3 validated baseline, updates `oracle` and `contrarian` to prefer Claude Sonnet 5 before Sonnet 4 when Fable/Opus are unavailable, and fixes TUI-only custom/native UI guards.

## Highlights

- refreshes the active Pi 0.80.3 fleet-tested markers across the collection and all standalone workspace packages
- `oracle` and `contrarian` now prefer Claude Sonnet 5 before Claude Sonnet 4 when Claude Fable 5 and Claude Opus are unavailable
- TUI-only custom/native UI paths now use `ctx.mode === "tui"`, while RPC-safe UI behaviors stay on `ctx.hasUI`

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

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone packages can be installed individually, for example:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
