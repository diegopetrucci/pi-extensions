# Publish checklist — v0.1.54

## Release scope

- [x] refresh Pi 0.80.3 validated baseline and fleet markers for the collection and standalone packages
- [x] prefer Claude Sonnet 5 before Claude Sonnet 4 in `oracle` and `contrarian` fallback selection when Fable/Opus are unavailable
- [x] fix TUI-only custom/native UI paths to require `ctx.mode === "tui"` while preserving `ctx.hasUI` for RPC-safe UI surfaces
- [x] bump root collection package to `@diegopetrucci/pi-extensions@0.1.54`
- [x] patch-bump every standalone workspace package
- [x] refresh `package-lock.json` local package versions

## Target package versions

- [x] `@diegopetrucci/pi-extensions@0.1.54`
- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.4`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.2`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.2`
- [x] `@diegopetrucci/pi-brrr@0.1.5`
- [x] `@diegopetrucci/pi-claude-fast@0.1.5`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.5`
- [x] `@diegopetrucci/pi-context-cap@0.1.4`
- [x] `@diegopetrucci/pi-context-inspector@0.1.4`
- [x] `@diegopetrucci/pi-contrarian@0.1.2`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.4`
- [x] `@diegopetrucci/pi-git-footer@0.1.3`
- [x] `@diegopetrucci/pi-gnosis@0.1.4`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.2`
- [x] `@diegopetrucci/pi-inline-bash@0.1.4`
- [x] `@diegopetrucci/pi-librarian@0.1.9`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.12`
- [x] `@diegopetrucci/pi-notify@0.1.8`
- [x] `@diegopetrucci/pi-openai-fast@0.1.7`
- [x] `@diegopetrucci/pi-oracle@0.1.17`
- [x] `@diegopetrucci/pi-permission-gate@0.1.5`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.5`
- [x] `@diegopetrucci/pi-review@0.1.5`
- [x] `@diegopetrucci/pi-todo@0.1.4`
- [x] `@diegopetrucci/pi-triage-comments@0.1.5`

## Preflight and release docs

- [x] verify npm versions are unpublished for all target packages
- [x] create release docs
  - [x] `docs/release-notes-v0.1.54.md`
  - [x] `docs/github-release-v0.1.54.md`
  - [x] `docs/announcement-v0.1.54.md`
  - [x] `docs/publish-checklist-v0.1.54.md`
- [x] refresh dependencies with `npm ci`
- [x] run install-state preflight after the lockfile refresh
- [x] run local validation and smoke tests

### npm unpublished checks

```bash
npm view @diegopetrucci/pi-extensions@0.1.54 version --json
npm view @diegopetrucci/pi-agent-workflow-audit@0.1.4 version --json
npm view @diegopetrucci/pi-annotate-git-diff@0.1.2 version --json
npm view @diegopetrucci/pi-annotate-last-message@0.1.2 version --json
npm view @diegopetrucci/pi-brrr@0.1.5 version --json
npm view @diegopetrucci/pi-claude-fast@0.1.5 version --json
npm view @diegopetrucci/pi-confirm-destructive@0.1.5 version --json
npm view @diegopetrucci/pi-context-cap@0.1.4 version --json
npm view @diegopetrucci/pi-context-inspector@0.1.4 version --json
npm view @diegopetrucci/pi-contrarian@0.1.2 version --json
npm view @diegopetrucci/pi-dirty-repo-guard@0.1.4 version --json
npm view @diegopetrucci/pi-git-footer@0.1.3 version --json
npm view @diegopetrucci/pi-gnosis@0.1.4 version --json
npm view @diegopetrucci/pi-illustrations-to-explain-things@0.1.2 version --json
npm view @diegopetrucci/pi-inline-bash@0.1.4 version --json
npm view @diegopetrucci/pi-librarian@0.1.9 version --json
npm view @diegopetrucci/pi-minimal-footer@0.1.12 version --json
npm view @diegopetrucci/pi-notify@0.1.8 version --json
npm view @diegopetrucci/pi-openai-fast@0.1.7 version --json
npm view @diegopetrucci/pi-oracle@0.1.17 version --json
npm view @diegopetrucci/pi-permission-gate@0.1.5 version --json
npm view @diegopetrucci/pi-quiet-tools@0.1.5 version --json
npm view @diegopetrucci/pi-review@0.1.5 version --json
npm view @diegopetrucci/pi-todo@0.1.4 version --json
npm view @diegopetrucci/pi-triage-comments@0.1.5 version --json
```

### Validation commands

```bash
npm ci
npm run preflight:install-state
npm run typecheck
npm test
```

### Validation evidence

- `npm ci` — passed; added 271 packages and audited 296 packages.
- `npm run preflight:install-state` — passed; `Package state matches package-lock.json (247 installed packages and 25 local package entries checked).`
- `npm run typecheck` — passed.
- `npm test` — passed; `221` tests, `0` failures, duration `8554.158917ms`.
- `npx pi --no-extensions --no-context-files --offline --no-session -p -e extensions/oracle/index.ts "/oracle status"` — passed; reported `Oracle defaults: model=auto, thinkingLevel=auto.`
- `npx pi --no-extensions --no-context-files --offline --no-session -p -e extensions/contrarian/index.ts "/contrarian status"` — passed; reported `Contrarian defaults: model=auto, thinkingLevel=auto.`

## Package dry-runs

- [x] root collection package dry-run
- [x] standalone workspace package dry-runs

```bash
npm pack --dry-run --json
npm pack --dry-run --json --workspace @diegopetrucci/pi-agent-workflow-audit
npm pack --dry-run --json --workspace @diegopetrucci/pi-annotate-git-diff
npm pack --dry-run --json --workspace @diegopetrucci/pi-annotate-last-message
npm pack --dry-run --json --workspace @diegopetrucci/pi-brrr
npm pack --dry-run --json --workspace @diegopetrucci/pi-claude-fast
npm pack --dry-run --json --workspace @diegopetrucci/pi-confirm-destructive
npm pack --dry-run --json --workspace @diegopetrucci/pi-context-cap
npm pack --dry-run --json --workspace @diegopetrucci/pi-context-inspector
npm pack --dry-run --json --workspace @diegopetrucci/pi-contrarian
npm pack --dry-run --json --workspace @diegopetrucci/pi-dirty-repo-guard
npm pack --dry-run --json --workspace @diegopetrucci/pi-git-footer
npm pack --dry-run --json --workspace @diegopetrucci/pi-gnosis
npm pack --dry-run --json --workspace @diegopetrucci/pi-illustrations-to-explain-things
npm pack --dry-run --json --workspace @diegopetrucci/pi-inline-bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-librarian
npm pack --dry-run --json --workspace @diegopetrucci/pi-minimal-footer
npm pack --dry-run --json --workspace @diegopetrucci/pi-notify
npm pack --dry-run --json --workspace @diegopetrucci/pi-openai-fast
npm pack --dry-run --json --workspace @diegopetrucci/pi-oracle
npm pack --dry-run --json --workspace @diegopetrucci/pi-permission-gate
npm pack --dry-run --json --workspace @diegopetrucci/pi-quiet-tools
npm pack --dry-run --json --workspace @diegopetrucci/pi-review
npm pack --dry-run --json --workspace @diegopetrucci/pi-todo
npm pack --dry-run --json --workspace @diegopetrucci/pi-triage-comments
```

### Dry-run evidence

- `npm pack --dry-run --json` — passed; `diegopetrucci-pi-extensions-0.1.54.tgz` (`148` files, `14611475` bytes unpacked).
- `@diegopetrucci/pi-agent-workflow-audit` — `diegopetrucci-pi-agent-workflow-audit-0.1.4.tgz` (`4` files, `55859` bytes unpacked).
- `@diegopetrucci/pi-annotate-git-diff` — `diegopetrucci-pi-annotate-git-diff-0.1.2.tgz` (`14` files, `187481` bytes unpacked).
- `@diegopetrucci/pi-annotate-last-message` — `diegopetrucci-pi-annotate-last-message-0.1.2.tgz` (`12` files, `38169` bytes unpacked).
- `@diegopetrucci/pi-brrr` — `diegopetrucci-pi-brrr-0.1.5.tgz` (`5` files, `11384` bytes unpacked).
- `@diegopetrucci/pi-claude-fast` — `diegopetrucci-pi-claude-fast-0.1.5.tgz` (`5` files, `11849` bytes unpacked).
- `@diegopetrucci/pi-confirm-destructive` — `diegopetrucci-pi-confirm-destructive-0.1.5.tgz` (`4` files, `3317` bytes unpacked).
- `@diegopetrucci/pi-context-cap` — `diegopetrucci-pi-context-cap-0.1.4.tgz` (`4` files, `7980` bytes unpacked).
- `@diegopetrucci/pi-context-inspector` — `diegopetrucci-pi-context-inspector-0.1.4.tgz` (`4` files, `58341` bytes unpacked).
- `@diegopetrucci/pi-contrarian` — `diegopetrucci-pi-contrarian-0.1.2.tgz` (`4` files, `61082` bytes unpacked).
- `@diegopetrucci/pi-dirty-repo-guard` — `diegopetrucci-pi-dirty-repo-guard-0.1.4.tgz` (`4` files, `3326` bytes unpacked).
- `@diegopetrucci/pi-git-footer` — `diegopetrucci-pi-git-footer-0.1.3.tgz` (`4` files, `16575` bytes unpacked).
- `@diegopetrucci/pi-gnosis` — `diegopetrucci-pi-gnosis-0.1.4.tgz` (`4` files, `8430` bytes unpacked).
- `@diegopetrucci/pi-illustrations-to-explain-things` — `diegopetrucci-pi-illustrations-to-explain-things-0.1.2.tgz` (`24` files, `13610949` bytes unpacked).
- `@diegopetrucci/pi-inline-bash` — `diegopetrucci-pi-inline-bash-0.1.4.tgz` (`4` files, `5829` bytes unpacked).
- `@diegopetrucci/pi-librarian` — `diegopetrucci-pi-librarian-0.1.9.tgz` (`4` files, `59789` bytes unpacked).
- `@diegopetrucci/pi-minimal-footer` — `diegopetrucci-pi-minimal-footer-0.1.12.tgz` (`6` files, `40173` bytes unpacked).
- `@diegopetrucci/pi-notify` — `diegopetrucci-pi-notify-0.1.8.tgz` (`5` files, `12733` bytes unpacked).
- `@diegopetrucci/pi-openai-fast` — `diegopetrucci-pi-openai-fast-0.1.7.tgz` (`5` files, `10683` bytes unpacked).
- `@diegopetrucci/pi-oracle` — `diegopetrucci-pi-oracle-0.1.17.tgz` (`4` files, `56075` bytes unpacked).
- `@diegopetrucci/pi-permission-gate` — `diegopetrucci-pi-permission-gate-0.1.5.tgz` (`4` files, `2798` bytes unpacked).
- `@diegopetrucci/pi-quiet-tools` — `diegopetrucci-pi-quiet-tools-0.1.5.tgz` (`4` files, `15618` bytes unpacked).
- `@diegopetrucci/pi-review` — `diegopetrucci-pi-review-0.1.5.tgz` (`5` files, `81935` bytes unpacked).
- `@diegopetrucci/pi-todo` — `diegopetrucci-pi-todo-0.1.4.tgz` (`4` files, `11046` bytes unpacked).
- `@diegopetrucci/pi-triage-comments` — `diegopetrucci-pi-triage-comments-0.1.5.tgz` (`4` files, `93665` bytes unpacked).

## Commit, tag, and GitHub release

- [ ] commit release changes on non-main branch (current branch: `release/v0.1.54`)
- [ ] push branch `release/v0.1.54`
- [ ] open PR targeting `main`
- [ ] after PR merge, tag `v0.1.54` on `main`
- [ ] push tag `v0.1.54`
- [ ] create GitHub release using `docs/github-release-v0.1.54.md`

## Stop before npm publish

> Human-only: npm publishing depends on the authenticated npm session.

- [ ] human publishes root collection package
- [ ] human publishes standalone packages

```bash
npm publish --access public
npm publish --workspace @diegopetrucci/pi-agent-workflow-audit --access public
npm publish --workspace @diegopetrucci/pi-annotate-git-diff --access public
npm publish --workspace @diegopetrucci/pi-annotate-last-message --access public
npm publish --workspace @diegopetrucci/pi-brrr --access public
npm publish --workspace @diegopetrucci/pi-claude-fast --access public
npm publish --workspace @diegopetrucci/pi-confirm-destructive --access public
npm publish --workspace @diegopetrucci/pi-context-cap --access public
npm publish --workspace @diegopetrucci/pi-context-inspector --access public
npm publish --workspace @diegopetrucci/pi-contrarian --access public
npm publish --workspace @diegopetrucci/pi-dirty-repo-guard --access public
npm publish --workspace @diegopetrucci/pi-git-footer --access public
npm publish --workspace @diegopetrucci/pi-gnosis --access public
npm publish --workspace @diegopetrucci/pi-illustrations-to-explain-things --access public
npm publish --workspace @diegopetrucci/pi-inline-bash --access public
npm publish --workspace @diegopetrucci/pi-librarian --access public
npm publish --workspace @diegopetrucci/pi-minimal-footer --access public
npm publish --workspace @diegopetrucci/pi-notify --access public
npm publish --workspace @diegopetrucci/pi-openai-fast --access public
npm publish --workspace @diegopetrucci/pi-oracle --access public
npm publish --workspace @diegopetrucci/pi-permission-gate --access public
npm publish --workspace @diegopetrucci/pi-quiet-tools --access public
npm publish --workspace @diegopetrucci/pi-review --access public
npm publish --workspace @diegopetrucci/pi-todo --access public
npm publish --workspace @diegopetrucci/pi-triage-comments --access public
```

## Post-publish validation

- [ ] wait 5 minutes after npm publishing completes
- [ ] verify npm registry/package pages show expected versions
- [ ] install validation after npm propagation

```bash
npm view @diegopetrucci/pi-extensions@0.1.54 name version dist.tarball --json
npm view @diegopetrucci/pi-agent-workflow-audit@0.1.4 name version dist.tarball --json
npm view @diegopetrucci/pi-annotate-git-diff@0.1.2 name version dist.tarball --json
npm view @diegopetrucci/pi-annotate-last-message@0.1.2 name version dist.tarball --json
npm view @diegopetrucci/pi-brrr@0.1.5 name version dist.tarball --json
npm view @diegopetrucci/pi-claude-fast@0.1.5 name version dist.tarball --json
npm view @diegopetrucci/pi-confirm-destructive@0.1.5 name version dist.tarball --json
npm view @diegopetrucci/pi-context-cap@0.1.4 name version dist.tarball --json
npm view @diegopetrucci/pi-context-inspector@0.1.4 name version dist.tarball --json
npm view @diegopetrucci/pi-contrarian@0.1.2 name version dist.tarball --json
npm view @diegopetrucci/pi-dirty-repo-guard@0.1.4 name version dist.tarball --json
npm view @diegopetrucci/pi-git-footer@0.1.3 name version dist.tarball --json
npm view @diegopetrucci/pi-gnosis@0.1.4 name version dist.tarball --json
npm view @diegopetrucci/pi-illustrations-to-explain-things@0.1.2 name version dist.tarball --json
npm view @diegopetrucci/pi-inline-bash@0.1.4 name version dist.tarball --json
npm view @diegopetrucci/pi-librarian@0.1.9 name version dist.tarball --json
npm view @diegopetrucci/pi-minimal-footer@0.1.12 name version dist.tarball --json
npm view @diegopetrucci/pi-notify@0.1.8 name version dist.tarball --json
npm view @diegopetrucci/pi-openai-fast@0.1.7 name version dist.tarball --json
npm view @diegopetrucci/pi-oracle@0.1.17 name version dist.tarball --json
npm view @diegopetrucci/pi-permission-gate@0.1.5 name version dist.tarball --json
npm view @diegopetrucci/pi-quiet-tools@0.1.5 name version dist.tarball --json
npm view @diegopetrucci/pi-review@0.1.5 name version dist.tarball --json
npm view @diegopetrucci/pi-todo@0.1.4 name version dist.tarball --json
npm view @diegopetrucci/pi-triage-comments@0.1.5 name version dist.tarball --json
```
