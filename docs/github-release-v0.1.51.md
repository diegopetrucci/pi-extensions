Refreshes the full extension package fleet for the latest validated Pi baseline, `0.79.10`.

## Highlights

- Updates `.pi-fleet-tested-version` markers in the collection and every standalone package from `0.78.0` to `0.79.10`.
- Keeps the local development baseline on `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` `0.79.10`.
- Bumps all package versions so the refreshed Pi compatibility markers can be published.

## Packages

- `@diegopetrucci/pi-extensions@0.1.51`
- `@diegopetrucci/pi-agent-workflow-audit@0.1.3`
- `@diegopetrucci/pi-annotate-git-diff@0.1.1`
- `@diegopetrucci/pi-annotate-last-message@0.1.1`
- `@diegopetrucci/pi-brrr@0.1.4`
- `@diegopetrucci/pi-claude-fast@0.1.4`
- `@diegopetrucci/pi-confirm-destructive@0.1.4`
- `@diegopetrucci/pi-context-cap@0.1.3`
- `@diegopetrucci/pi-context-inspector@0.1.3`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.3`
- `@diegopetrucci/pi-git-footer@0.1.2`
- `@diegopetrucci/pi-gnosis@0.1.3`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.1`
- `@diegopetrucci/pi-inline-bash@0.1.3`
- `@diegopetrucci/pi-librarian@0.1.7`
- `@diegopetrucci/pi-minimal-footer@0.1.11`
- `@diegopetrucci/pi-notify@0.1.7`
- `@diegopetrucci/pi-openai-fast@0.1.6`
- `@diegopetrucci/pi-oracle@0.1.15`
- `@diegopetrucci/pi-permission-gate@0.1.4`
- `@diegopetrucci/pi-quiet-tools@0.1.4`
- `@diegopetrucci/pi-review@0.1.4`
- `@diegopetrucci/pi-todo@0.1.3`
- `@diegopetrucci/pi-triage-comments@0.1.4`

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
