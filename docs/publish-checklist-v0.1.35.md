# Publish checklist — v0.1.35

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.35` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished:
  - [x] `@diegopetrucci/pi-extensions@0.1.35` (npm latest was `0.1.34`)
  - [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.1`
  - [x] `@diegopetrucci/pi-brrr@0.1.1`
  - [x] `@diegopetrucci/pi-confirm-destructive@0.1.2`
  - [x] `@diegopetrucci/pi-context-cap@0.1.1`
  - [x] `@diegopetrucci/pi-context-inspector@0.1.1`
  - [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.1`
  - [x] `@diegopetrucci/pi-gnosis@0.1.1`
  - [x] `@diegopetrucci/pi-inline-bash@0.1.1`
  - [x] `@diegopetrucci/pi-librarian@0.1.3`
  - [x] `@diegopetrucci/pi-minimal-footer@0.1.7`
  - [x] `@diegopetrucci/pi-notify@0.1.4`
  - [x] `@diegopetrucci/pi-openai-fast@0.1.2`
  - [x] `@diegopetrucci/pi-oracle@0.1.10`
  - [x] `@diegopetrucci/pi-permission-gate@0.1.2`
  - [x] `@diegopetrucci/pi-quiet-tools@0.1.2`
  - [x] `@diegopetrucci/pi-review@0.1.1`
  - [x] `@diegopetrucci/pi-todo@0.1.1`
  - [x] `@diegopetrucci/pi-triage-comments@0.1.2`
- [x] verify versions are bumped in `package.json`, all `extensions/*/package.json`, and `package-lock.json`
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.35.md`
  - [x] `docs/github-release-v0.1.35.md`
  - [x] `docs/announcement-v0.1.35.md`
  - [x] `docs/publish-checklist-v0.1.35.md`
- [x] verify fleet markers exist and contain `0.76.0` at the repo root and under every `extensions/*/` package
- [x] verify every package `files` list includes `.pi-fleet-tested-version`
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript check for all extension entrypoints

```bash
npm exec -- tsc --noEmit --skipLibCheck --moduleResolution bundler --module ESNext --target es2022 extensions/*/index.ts
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] run npm audit

```bash
npm audit --audit-level=high
```

- [x] smoke-test Oracle command loading against Pi `0.76.0`

```bash
tmp=$(mktemp -d); PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/oracle/index.ts -p "/oracle status"
```

## Package sanity

- [x] root collection package includes root marker and 18 extension markers
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-agent-workflow-audit` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-brrr` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-confirm-destructive` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-context-cap` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-context-inspector` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-dirty-repo-guard` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-gnosis` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-inline-bash` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-librarian` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-minimal-footer` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-notify` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-openai-fast` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-oracle` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-permission-gate` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-quiet-tools` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-review` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-todo` includes `.pi-fleet-tested-version`
- [x] `npm pack --dry-run --json --workspace @diegopetrucci/pi-triage-comments` includes `.pi-fleet-tested-version`

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-agent-workflow-audit`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-brrr`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-confirm-destructive`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-context-cap`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-context-inspector`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-dirty-repo-guard`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-gnosis`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-inline-bash`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-librarian`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-minimal-footer`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-notify`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-openai-fast`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-oracle`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-permission-gate`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-quiet-tools`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-review`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-todo`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-triage-comments`

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.35`

```bash
git add .
git commit -m "Prepare v0.1.35 release"
git tag v0.1.35
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.35
```

- [ ] create GitHub release for `v0.1.35`
- [ ] paste contents of `docs/github-release-v0.1.35.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary, and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

- [ ] human publishes all packages

```bash
npm publish
npm publish --workspace @diegopetrucci/pi-agent-workflow-audit
npm publish --workspace @diegopetrucci/pi-brrr
npm publish --workspace @diegopetrucci/pi-confirm-destructive
npm publish --workspace @diegopetrucci/pi-context-cap
npm publish --workspace @diegopetrucci/pi-context-inspector
npm publish --workspace @diegopetrucci/pi-dirty-repo-guard
npm publish --workspace @diegopetrucci/pi-gnosis
npm publish --workspace @diegopetrucci/pi-inline-bash
npm publish --workspace @diegopetrucci/pi-librarian
npm publish --workspace @diegopetrucci/pi-minimal-footer
npm publish --workspace @diegopetrucci/pi-notify
npm publish --workspace @diegopetrucci/pi-openai-fast
npm publish --workspace @diegopetrucci/pi-oracle
npm publish --workspace @diegopetrucci/pi-permission-gate
npm publish --workspace @diegopetrucci/pi-quiet-tools
npm publish --workspace @diegopetrucci/pi-review
npm publish --workspace @diegopetrucci/pi-todo
npm publish --workspace @diegopetrucci/pi-triage-comments
```

## Post-publish validation

- [ ] verify npm package pages show expected versions:
  - [ ] `@diegopetrucci/pi-extensions@0.1.35`
  - [ ] `@diegopetrucci/pi-agent-workflow-audit@0.1.1`
  - [ ] `@diegopetrucci/pi-brrr@0.1.1`
  - [ ] `@diegopetrucci/pi-confirm-destructive@0.1.2`
  - [ ] `@diegopetrucci/pi-context-cap@0.1.1`
  - [ ] `@diegopetrucci/pi-context-inspector@0.1.1`
  - [ ] `@diegopetrucci/pi-dirty-repo-guard@0.1.1`
  - [ ] `@diegopetrucci/pi-gnosis@0.1.1`
  - [ ] `@diegopetrucci/pi-inline-bash@0.1.1`
  - [ ] `@diegopetrucci/pi-librarian@0.1.3`
  - [ ] `@diegopetrucci/pi-minimal-footer@0.1.7`
  - [ ] `@diegopetrucci/pi-notify@0.1.4`
  - [ ] `@diegopetrucci/pi-openai-fast@0.1.2`
  - [ ] `@diegopetrucci/pi-oracle@0.1.10`
  - [ ] `@diegopetrucci/pi-permission-gate@0.1.2`
  - [ ] `@diegopetrucci/pi-quiet-tools@0.1.2`
  - [ ] `@diegopetrucci/pi-review@0.1.1`
  - [ ] `@diegopetrucci/pi-todo@0.1.1`
  - [ ] `@diegopetrucci/pi-triage-comments@0.1.2`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-oracle
```

- [ ] reload pi and confirm installed packages include `.pi-fleet-tested-version` with `0.76.0`
- [ ] publish announcement copy from `docs/announcement-v0.1.35.md`
