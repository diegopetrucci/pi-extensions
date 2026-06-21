# Release notes — v0.1.47

## Highlights

This release makes project-local extension configuration honor Pi project trust. Global extension config still loads normally, but project-controlled `.pi/*.json` files and review guidelines are ignored unless Pi reports that the project is trusted.

## Project trust gating

- `brrr` reads `<project>/.pi/brrr.json` only for trusted projects, preventing untrusted repositories from redirecting brrr webhooks or enabling assistant-message notifications.
- `notify` reads `<project>/.pi/notify.json` only for trusted projects, preventing untrusted repositories from enabling shell-backed sound commands through notification config.
- `minimal-footer` walks upward for `.pi/minimal-footer.json` only for trusted projects.
- `openai-fast` walks upward for `.pi/openai-fast.json` only for trusted projects, so untrusted repositories cannot silently opt sessions into priority service-tier requests.
- `claude-fast` walks upward for `.pi/claude-fast.json` only for trusted projects, so untrusted repositories cannot silently opt sessions into Claude Fast mode or mutate beta headers.
- `review` reads `REVIEW_GUIDELINES.md` next to a project `.pi` directory only for trusted projects, preventing untrusted review-prompt injection.
- A fail-closed compatibility helper ignores project-local config when the running Pi context does not expose `ctx.isProjectTrusted()`.
- Affected READMEs now document that project config/guidelines require a trusted project.

## Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.47`
- standalone brrr package: `@diegopetrucci/pi-brrr@0.1.3`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.6`
- standalone minimal-footer package: `@diegopetrucci/pi-minimal-footer@0.1.9`
- standalone openai-fast package: `@diegopetrucci/pi-openai-fast@0.1.5`
- standalone claude-fast package: `@diegopetrucci/pi-claude-fast@0.1.3`
- standalone review package: `@diegopetrucci/pi-review@0.1.3`

## Validation

- refreshed dependencies with `npm ci`
- verified installed package state against `package-lock.json`
- ran full repository TypeScript checking
- verified package JSON metadata, lockfile versions, release docs, and trust-gating markers
- smoke-tested affected extension loading with Pi `0.79.9`
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs
