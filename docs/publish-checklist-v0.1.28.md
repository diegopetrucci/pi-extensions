# Publish checklist — v0.1.28

## Preflight

- [x] confirm `v0.1.27` exists on origin and GitHub
- [x] confirm `v0.1.28` does not yet exist on origin or GitHub
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.27`
  - [x] `@diegopetrucci/pi-oracle` latest published version is `0.1.7`
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.28`
  - [x] `extensions/oracle/package.json` -> `0.1.8`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.28.md`
  - [x] `docs/github-release-v0.1.28.md`
  - [x] `docs/announcement-v0.1.28.md`
  - [x] `docs/publish-checklist-v0.1.28.md`
- [x] verify extension files exist
  - [x] `extensions/oracle/index.ts`
  - [x] `extensions/oracle/README.md`
  - [x] `extensions/oracle/package.json`
- [x] verify root package includes `./extensions/oracle/index.ts`
- [x] verify oracle docs/provider matrix mention Together provider coverage and thinking-level clamping
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript syntax check for oracle

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/oracle/index.ts
```

- [x] validate package JSON files and release docs

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const oracle=JSON.parse(fs.readFileSync('extensions/oracle/package.json','utf8')); if(root.version!=='0.1.28') throw new Error('root version mismatch'); if(oracle.version!=='0.1.8') throw new Error('oracle version mismatch'); for (const file of ['docs/release-notes-v0.1.28.md','docs/github-release-v0.1.28.md','docs/announcement-v0.1.28.md','docs/publish-checklist-v0.1.28.md']) fs.accessSync(file);"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

## Package sanity

- [x] confirm collection package version is `0.1.28`
- [x] confirm standalone oracle package version is `0.1.8`
- [x] run root package dry-run and verify oracle files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone oracle package dry-run and verify files are limited to README, index, and package metadata

```bash
cd extensions/oracle
npm pack --dry-run --json
cd ../..
```

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.28`

```bash
git add README.md package.json extensions/oracle/index.ts extensions/oracle/README.md extensions/oracle/package.json docs/oracle-provider-matrix.md docs/*v0.1.28.md
git commit -m "Prepare v0.1.28 release"
git tag v0.1.28
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.28
```

- [ ] create GitHub release for `v0.1.28`
- [ ] paste contents of `docs/github-release-v0.1.28.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary (not an internal title or redundant version heading), and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

### Collection package

- [ ] human publishes root package

```bash
npm publish
```

### Standalone oracle package

- [ ] human publishes standalone oracle package

```bash
cd extensions/oracle
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.28`
  - [ ] `@diegopetrucci/pi-oracle@0.1.8`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-oracle
```

- [ ] reload pi and confirm `oracle` is available
- [ ] run `/oracle-model` and confirm Together selection/thinking-level behavior when that provider is authenticated
- [ ] publish announcement copy from `docs/announcement-v0.1.28.md`
