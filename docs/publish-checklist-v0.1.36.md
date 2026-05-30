# Publish checklist — v0.1.36

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.36` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished:
  - [x] `@diegopetrucci/pi-extensions@0.1.36` (npm latest was `0.1.35`)
  - [x] `@diegopetrucci/pi-openai-fast@0.1.3` (npm latest was `0.1.2`)
- [x] verify versions are bumped in `package.json`, `extensions/openai-fast/package.json`, and `package-lock.json`
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.36.md`
  - [x] `docs/github-release-v0.1.36.md`
  - [x] `docs/announcement-v0.1.36.md`
  - [x] `docs/publish-checklist-v0.1.36.md`
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

- [x] smoke-test OpenAI Fast command loading

```bash
tmp=$(mktemp -d); PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/openai-fast/index.ts -p "/fast"
```

## Package sanity

- [x] root collection package includes `openai-fast` files and marker

```bash
npm pack --dry-run --json
```

- [x] standalone `openai-fast` package includes README, index, example config, package metadata, and marker

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-openai-fast
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-openai-fast`

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.36`

```bash
git add .
git commit -m "Prepare v0.1.36 release"
git tag v0.1.36
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.36
```

- [x] create GitHub release for `v0.1.36`
- [x] paste contents of `docs/github-release-v0.1.36.md`
- [x] verify the rendered GitHub release uses a descriptive title, starts with the summary, and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

- [ ] human publishes root package

```bash
npm publish
```

- [ ] human publishes standalone openai-fast package

```bash
npm publish --workspace @diegopetrucci/pi-openai-fast
```

## Post-publish validation

- [ ] verify npm package pages show expected versions:
  - [ ] `@diegopetrucci/pi-extensions@0.1.36`
  - [ ] `@diegopetrucci/pi-openai-fast@0.1.3`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-openai-fast
```

- [ ] reload pi and confirm `/fast` toggles with no options
- [ ] publish announcement copy from `docs/announcement-v0.1.36.md`
