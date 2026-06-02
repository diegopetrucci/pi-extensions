# Publish checklist — v0.1.39

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.39` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished for the root package and new `git-footer` standalone package
- [x] verify versions are bumped in `package.json`, `extensions/git-footer/package.json`, and `package-lock.json`
- [x] verify fleet markers exist and contain `0.78.0` at the repo root and under `extensions/git-footer/`
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.39.md`
  - [x] `docs/github-release-v0.1.39.md`
  - [x] `docs/announcement-v0.1.39.md`
  - [x] `docs/publish-checklist-v0.1.39.md`
- [x] verify README extension list remains alphabetically ordered

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

- [x] smoke-test `git-footer` extension loading

```bash
tmp=$(mktemp -d); PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/git-footer/index.ts --list-models
```

## Package sanity

- [x] root collection package includes new `git-footer` files and Pi `0.78.0` marker

```bash
npm pack --dry-run --json
```

- [x] standalone `git-footer` package includes its files and Pi `0.78.0` marker

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-git-footer
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-git-footer`

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.39`

```bash
git add .
git commit -m "Prepare v0.1.39 release"
git tag v0.1.39
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.39
```

- [x] create GitHub release for `v0.1.39`
- [x] paste contents of `docs/github-release-v0.1.39.md`
- [x] verify the rendered GitHub release uses a descriptive title, starts with the summary, and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

- [x] human publishes root package

```bash
npm publish
```

- [x] human publishes standalone `git-footer` package

```bash
npm publish --workspace @diegopetrucci/pi-git-footer
```

## Post-publish validation

- [x] wait 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [x] verify npm package pages show expected versions for the root and `git-footer` packages
- [x] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-git-footer
```

- [x] reload pi and confirm `git-footer` loads when installed standalone
- [ ] publish announcement copy from `docs/announcement-v0.1.39.md`
