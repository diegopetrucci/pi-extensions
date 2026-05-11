# Publish checklist — v0.1.22

## Preflight

- [x] confirm working tree contains intended openai-fast release changes; unrelated librarian changes are left unstaged
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.21`
  - [x] `@diegopetrucci/pi-openai-fast` latest published version is `0.1.0`
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.22`
  - [x] `extensions/openai-fast/package.json` -> `0.1.1`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.22.md`
  - [x] `docs/github-release-v0.1.22.md`
  - [x] `docs/announcement-v0.1.22.md`
  - [x] `docs/publish-checklist-v0.1.22.md`
- [x] verify extension files exist
  - [x] `extensions/openai-fast/index.ts`
  - [x] `extensions/openai-fast/README.md`
  - [x] `extensions/openai-fast/package.json`
  - [x] `extensions/openai-fast/openai-fast.example.json`
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript syntax check for openai-fast

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/openai-fast/index.ts
```

- [x] validate openai-fast sample config JSON

```bash
jq empty extensions/openai-fast/openai-fast.example.json
```

- [x] skip additional smoke tests and package dry-runs at user request

## Package sanity

- [x] confirm collection package version is `0.1.22`
- [x] confirm standalone openai-fast package version is `0.1.1`
- [x] confirm root README includes updated install instructions for the latest tag

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.22`

```bash
git add README.md package.json extensions/openai-fast docs/*v0.1.22.md
git commit -m "Prepare v0.1.22 release"
git tag v0.1.22
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin main
git push origin v0.1.22
```

- [x] create GitHub release for `v0.1.22`
- [x] paste contents of `docs/github-release-v0.1.22.md`

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone openai-fast package

- [ ] publish standalone openai-fast package

```bash
cd extensions/openai-fast
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.22`
  - [ ] `@diegopetrucci/pi-openai-fast@0.1.1`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-openai-fast
```

- [ ] reload pi and confirm extensions are available
- [ ] publish announcement copy from `docs/announcement-v0.1.22.md`
