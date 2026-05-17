# Publish checklist — v0.1.27

## Preflight

- [x] confirm `v0.1.26` exists on origin and GitHub
- [x] confirm `v0.1.27` does not yet exist on origin or GitHub
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.26`
  - [x] `@diegopetrucci/pi-triage-comments` latest published version is `0.1.0`
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.27`
  - [x] `extensions/triage-comments/package.json` -> `0.1.1`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.27.md`
  - [x] `docs/github-release-v0.1.27.md`
  - [x] `docs/announcement-v0.1.27.md`
  - [x] `docs/publish-checklist-v0.1.27.md`
- [x] verify extension files exist
  - [x] `extensions/triage-comments/index.ts`
  - [x] `extensions/triage-comments/README.md`
  - [x] `extensions/triage-comments/package.json`
- [x] verify root package includes `./extensions/triage-comments/index.ts`
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript syntax check for triage-comments

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/triage-comments/index.ts
```

- [x] validate package JSON files

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); JSON.parse(require('fs').readFileSync('extensions/triage-comments/package.json', 'utf8'))"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

## Package sanity

- [x] confirm collection package version is `0.1.27`
- [x] confirm standalone triage-comments package version is `0.1.1`
- [x] run root package dry-run and verify triage-comments files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone triage-comments package dry-run and verify files are limited to README, index, and package metadata

```bash
cd extensions/triage-comments
npm pack --dry-run --json
cd ../..
```

- [x] run root publish dry-run

```bash
npm publish --dry-run --access public
```

- [x] run standalone triage-comments publish dry-run

```bash
cd extensions/triage-comments
npm publish --dry-run --access public
cd ../..
```

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.27`

```bash
git add README.md package.json extensions/triage-comments docs/*v0.1.27.md
git commit -m "Prepare v0.1.27 release"
git tag v0.1.27
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.27
```

- [ ] create GitHub release for `v0.1.27`
- [ ] paste contents of `docs/github-release-v0.1.27.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary (not an internal title or redundant version heading), and has no broken links

## Publish

> Human-only: stop before running these `npm publish` commands unless you are the authenticated npm publisher.

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone triage-comments package

- [ ] publish standalone triage-comments package

```bash
cd extensions/triage-comments
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.27`
  - [ ] `@diegopetrucci/pi-triage-comments@0.1.1`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-triage-comments
```

- [ ] reload pi and confirm extensions are available
- [ ] publish announcement copy from `docs/announcement-v0.1.27.md`
