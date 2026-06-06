# Publish checklist — v0.1.43

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.43` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished for root `0.1.43`, `annotate-git-diff` `0.1.0`, and `annotate-last-message` `0.1.0`
- [x] verify versions are bumped in `package.json` and `package-lock.json`
- [x] verify fleet markers exist and contain `0.78.0` at the repo root and under both new extension directories
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.43.md`
  - [x] `docs/github-release-v0.1.43.md`
  - [x] `docs/announcement-v0.1.43.md`
  - [x] `docs/publish-checklist-v0.1.43.md`

## Local checks

- [x] run TypeScript check for both new extension source trees

```bash
npm exec -- tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck extensions/annotate-git-diff/glimpseui.d.ts extensions/annotate-git-diff/*.ts extensions/annotate-last-message/glimpseui.d.ts extensions/annotate-last-message/*.ts
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] run npm audit

```bash
npm audit --audit-level=high
```

## Package sanity

- [x] root collection package includes both new extensions and Pi `0.78.0` markers

```bash
npm pack --dry-run --json
```

- [x] standalone `annotate-git-diff` package includes its files and Pi `0.78.0` marker

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-annotate-git-diff
```

- [x] standalone `annotate-last-message` package includes its files and Pi `0.78.0` marker

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-annotate-last-message
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-annotate-git-diff`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-annotate-last-message`

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.43`

```bash
git add .
git commit -m "Prepare v0.1.43 release"
git tag v0.1.43
```

## Push and GitHub release

- [x] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.43
```

- [x] create GitHub release for `v0.1.43`
- [x] paste contents of `docs/github-release-v0.1.43.md`

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [ ] human publishes root package

```bash
npm publish
```

- [ ] human publishes standalone `annotate-git-diff` package

```bash
npm publish --workspace @diegopetrucci/pi-annotate-git-diff
```

- [ ] human publishes standalone `annotate-last-message` package

```bash
npm publish --workspace @diegopetrucci/pi-annotate-last-message
```

## Post-publish validation

- [ ] wait 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [ ] verify npm package pages show expected versions for the root and standalone packages
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-annotate-git-diff
pi install npm:@diegopetrucci/pi-annotate-last-message
```

- [ ] reload pi and confirm both annotation commands load when installed standalone
- [ ] publish announcement copy from `docs/announcement-v0.1.43.md`
