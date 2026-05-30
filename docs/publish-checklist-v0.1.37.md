# Publish checklist — v0.1.37

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.37` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished:
  - [x] `@diegopetrucci/pi-extensions@0.1.37` (npm latest was `0.1.36`)
  - [x] `@diegopetrucci/pi-claude-fast@0.1.0` (npm package was not found)
- [x] verify versions are bumped in `package.json`, `extensions/claude-fast/package.json`, and `package-lock.json`
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.37.md`
  - [x] `docs/github-release-v0.1.37.md`
  - [x] `docs/announcement-v0.1.37.md`
  - [x] `docs/publish-checklist-v0.1.37.md`
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

- [x] smoke-test Claude Fast command loading

```bash
tmp=$(mktemp -d); PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/claude-fast/index.ts -p "/claude-fast"
```

## Package sanity

- [x] root collection package includes `claude-fast` files and marker

```bash
npm pack --dry-run --json
```

- [x] standalone `claude-fast` package includes README, index, example config, package metadata, and marker

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-claude-fast
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-claude-fast`

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.37`

```bash
git add .
git commit -m "Prepare v0.1.37 release"
git tag v0.1.37
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.37
```

- [x] create GitHub release for `v0.1.37`
- [x] paste contents of `docs/github-release-v0.1.37.md`
- [x] verify the rendered GitHub release uses a descriptive title, starts with the summary, and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

- [ ] human publishes root package

```bash
npm publish
```

- [ ] human publishes standalone claude-fast package

```bash
npm publish --workspace @diegopetrucci/pi-claude-fast
```

## Post-publish validation

- [ ] verify npm package pages show expected versions:
  - [ ] `@diegopetrucci/pi-extensions@0.1.37`
  - [ ] `@diegopetrucci/pi-claude-fast@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-claude-fast
```

- [ ] reload pi and confirm `/claude-fast` toggles with no options
- [ ] publish announcement copy from `docs/announcement-v0.1.37.md`
