# Publish checklist — v0.1.41

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.41` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished for root `0.1.41` and `claude-fast` `0.1.2`
- [x] verify versions are bumped in `package.json`, `extensions/claude-fast/package.json`, and `package-lock.json`
- [x] verify fleet markers exist and contain `0.78.0` at the repo root and under `extensions/claude-fast/`
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.41.md`
  - [x] `docs/github-release-v0.1.41.md`
  - [x] `docs/announcement-v0.1.41.md`
  - [x] `docs/publish-checklist-v0.1.41.md`

## Local checks

- [x] run TypeScript check for all extension entrypoints

```bash
npm exec -- tsc --noEmit --allowImportingTsExtensions --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck extensions/*/index.ts
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] run npm audit

```bash
npm audit --audit-level=high
```

- [x] smoke-test `claude-fast` extension loading

```bash
tmp=$(mktemp -d); PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/claude-fast/index.ts --list-models
```

## Package sanity

- [x] root collection package includes updated `claude-fast` files and Pi `0.78.0` marker

```bash
npm pack --dry-run --json
```

- [x] standalone `claude-fast` package includes its files and Pi `0.78.0` marker

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-claude-fast
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-claude-fast`

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.41`

```bash
git add .
git commit -m "Prepare v0.1.41 release"
git tag v0.1.41
```

## Push and GitHub release

- [x] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.41
```

- [x] create GitHub release for `v0.1.41`
- [x] paste contents of `docs/github-release-v0.1.41.md`

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [ ] human publishes root package

```bash
npm publish
```

- [ ] human publishes standalone `claude-fast` package

```bash
npm publish --workspace @diegopetrucci/pi-claude-fast
```

## Post-publish validation

- [ ] wait 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [ ] verify npm package pages show expected versions for the root and `claude-fast` packages
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-claude-fast
```

- [ ] reload pi and confirm `claude-fast` loads when installed standalone
- [ ] publish announcement copy from `docs/announcement-v0.1.41.md`
