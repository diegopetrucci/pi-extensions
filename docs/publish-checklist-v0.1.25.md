# Publish checklist — v0.1.25

## Preflight

- [x] confirm `v0.1.24` exists on origin and GitHub
- [x] confirm `v0.1.25` does not yet exist on origin or GitHub
- [x] confirm working tree contains intended todo and inline-bash release changes on top of `origin/main`
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.24`
  - [x] `@diegopetrucci/pi-todo` is not published yet
  - [x] `@diegopetrucci/pi-inline-bash` is not published yet
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.25`
  - [x] `extensions/todo/package.json` -> `0.1.0`
  - [x] `extensions/inline-bash/package.json` -> `0.1.0`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.25.md`
  - [x] `docs/github-release-v0.1.25.md`
  - [x] `docs/announcement-v0.1.25.md`
  - [x] `docs/publish-checklist-v0.1.25.md`
- [x] verify extension files exist
  - [x] `extensions/todo/index.ts`
  - [x] `extensions/todo/README.md`
  - [x] `extensions/todo/package.json`
  - [x] `extensions/inline-bash/index.ts`
  - [x] `extensions/inline-bash/README.md`
  - [x] `extensions/inline-bash/package.json`
- [x] verify root package includes `./extensions/todo/index.ts` and `./extensions/inline-bash/index.ts`
- [x] verify README extension list remains alphabetically ordered
- [x] verify root README GitHub install tag references `v0.1.25`
- [x] verify README includes the inline-bash shell-execution security note
- [x] verify copied-example attribution links point at `earendil-works/pi-mono`

## Local checks

- [x] run TypeScript syntax check for todo and inline-bash

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/todo/index.ts
bun --check extensions/inline-bash/index.ts
```

- [x] validate package JSON files

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); JSON.parse(require('fs').readFileSync('extensions/todo/package.json', 'utf8')); JSON.parse(require('fs').readFileSync('extensions/inline-bash/package.json', 'utf8'))"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

## Package sanity

- [x] confirm collection package version is `0.1.25`
- [x] confirm standalone todo package version is `0.1.0`
- [x] confirm standalone inline-bash package version is `0.1.0`
- [x] run root package dry-run and verify todo and inline-bash files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone todo package dry-run and verify files are limited to README, index, and package metadata

```bash
cd extensions/todo
npm pack --dry-run --json
cd ../..
```

- [x] run standalone inline-bash package dry-run and verify files are limited to README, index, and package metadata

```bash
cd extensions/inline-bash
npm pack --dry-run --json
cd ../..
```

- [x] run root publish dry-run

```bash
npm publish --dry-run --access public
```

- [x] run standalone todo publish dry-run

```bash
cd extensions/todo
npm publish --dry-run --access public
cd ../..
```

- [x] run standalone inline-bash publish dry-run

```bash
cd extensions/inline-bash
npm publish --dry-run --access public
cd ../..
```

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.25`

```bash
git add README.md package.json extensions/todo extensions/inline-bash extensions/dirty-repo-guard/README.md docs/*v0.1.25.md
git commit -m "Prepare v0.1.25 release"
git tag v0.1.25
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.25
```

- [ ] create GitHub release for `v0.1.25`
- [ ] paste contents of `docs/github-release-v0.1.25.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary (not an internal title or redundant version heading), and has no broken links

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone todo package

- [ ] publish standalone todo package

```bash
cd extensions/todo
npm publish
cd ../..
```

### Standalone inline-bash package

- [ ] publish standalone inline-bash package

```bash
cd extensions/inline-bash
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.25`
  - [ ] `@diegopetrucci/pi-todo@0.1.0`
  - [ ] `@diegopetrucci/pi-inline-bash@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-todo
pi install npm:@diegopetrucci/pi-inline-bash
```

- [ ] reload pi and confirm extensions are available
- [ ] publish announcement copy from `docs/announcement-v0.1.25.md`
