# Release notes — v0.1.51

## Highlights

This release refreshes the full extension package fleet for the latest validated Pi baseline, `0.79.10`.

## Pi compatibility

- updates `.pi-fleet-tested-version` markers in the collection and every standalone extension package from `0.78.0` to `0.79.10`
- keeps the local development baseline on `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` `0.79.10`
- bumps all package versions so the refreshed Pi compatibility markers can be published

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.51`
- standalone agent-workflow-audit package: `@diegopetrucci/pi-agent-workflow-audit@0.1.3`
- standalone annotate-git-diff package: `@diegopetrucci/pi-annotate-git-diff@0.1.1`
- standalone annotate-last-message package: `@diegopetrucci/pi-annotate-last-message@0.1.1`
- standalone brrr package: `@diegopetrucci/pi-brrr@0.1.4`
- standalone claude-fast package: `@diegopetrucci/pi-claude-fast@0.1.4`
- standalone confirm-destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.4`
- standalone context-cap package: `@diegopetrucci/pi-context-cap@0.1.3`
- standalone context-inspector package: `@diegopetrucci/pi-context-inspector@0.1.3`
- standalone dirty-repo-guard package: `@diegopetrucci/pi-dirty-repo-guard@0.1.3`
- standalone git-footer package: `@diegopetrucci/pi-git-footer@0.1.2`
- standalone gnosis package: `@diegopetrucci/pi-gnosis@0.1.3`
- standalone illustrations-to-explain-things package: `@diegopetrucci/pi-illustrations-to-explain-things@0.1.1`
- standalone inline-bash package: `@diegopetrucci/pi-inline-bash@0.1.3`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.7`
- standalone minimal-footer package: `@diegopetrucci/pi-minimal-footer@0.1.11`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.7`
- standalone openai-fast package: `@diegopetrucci/pi-openai-fast@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.15`
- standalone permission-gate package: `@diegopetrucci/pi-permission-gate@0.1.4`
- standalone quiet-tools package: `@diegopetrucci/pi-quiet-tools@0.1.4`
- standalone review package: `@diegopetrucci/pi-review@0.1.4`
- standalone todo package: `@diegopetrucci/pi-todo@0.1.3`
- standalone triage-comments package: `@diegopetrucci/pi-triage-comments@0.1.4`

## Validation

- verified the installed Pi CLI reports `0.79.10`
- verified npm latest for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` is `0.79.10`
- refreshed package-lock local package versions
- ran install-state preflight and full TypeScript typecheck
- verified root and all standalone package dry-runs include `.pi-fleet-tested-version`
