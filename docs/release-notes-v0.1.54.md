# Release notes — v0.1.54

## Highlights

This release refreshes the tlh extension fleet for the Pi 0.80.3 validated baseline, prepares publishable fleet-marker patch bumps across every standalone workspace, prefers Claude Sonnet 5 before Sonnet 4 in `oracle` and `contrarian` fallback selection when Fable/Opus are unavailable, and tightens TUI-only custom/native UI guards.

## Pi 0.80.3 baseline and fleet markers

- refreshes the active Pi 0.80.3 validated baseline and fleet markers for the collection and standalone packages
- patch-bumps every standalone workspace package so each published package can carry the refreshed fleet-tested marker

## oracle and contrarian fallback selection

- when Claude Fable 5 and Claude Opus are unavailable, `oracle` and `contrarian` now prefer Claude Sonnet 5 before Claude Sonnet 4
- keeps the fallback ordering aligned with the updated provider preferences and test coverage already merged on this branch

## TUI-only guard fix

- custom/native UI paths now require `ctx.mode === "tui"` before using TUI-only rendering surfaces
- RPC-safe UI behaviors that only need general UI availability remain on `ctx.hasUI`

## Packaging

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

## Validation

- verified all target package versions are currently unpublished on npm
- refreshed `package-lock.json` local package versions to match the bumped manifests
- ran `npm run preflight:install-state` after the lockfile refresh
- checked `git status --short` to confirm the release-prep file set
