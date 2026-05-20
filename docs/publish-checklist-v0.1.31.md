# Publish checklist — v0.1.31

## Preflight

- [x] confirm `v0.1.30` exists on origin and GitHub
- [x] confirm `v0.1.31` does not yet exist on origin or GitHub
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.29`
  - [x] `@diegopetrucci/pi-gnosis` is not yet published
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.31`
  - [x] `extensions/gnosis/package.json` -> `0.1.0`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.31.md`
  - [x] `docs/github-release-v0.1.31.md`
  - [x] `docs/announcement-v0.1.31.md`
  - [x] `docs/publish-checklist-v0.1.31.md`
- [x] verify extension files exist
  - [x] `extensions/gnosis/index.ts`
  - [x] `extensions/gnosis/README.md`
  - [x] `extensions/gnosis/package.json`
- [x] verify root package includes `./extensions/gnosis/index.ts`
- [x] verify README extension list remains alphabetically ordered
- [x] verify gnosis does not register slash/user commands

## Local checks

- [x] run TypeScript syntax check for gnosis

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/gnosis/index.ts
```

- [x] validate package JSON files and release docs

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const gnosis=JSON.parse(fs.readFileSync('extensions/gnosis/package.json','utf8')); if(root.version!=='0.1.31') throw new Error('root version mismatch'); if(gnosis.version!=='0.1.0') throw new Error('gnosis version mismatch'); for (const file of ['docs/release-notes-v0.1.31.md','docs/github-release-v0.1.31.md','docs/announcement-v0.1.31.md','docs/publish-checklist-v0.1.31.md']) fs.accessSync(file);"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] smoke-test extension loading

```bash
pi --offline --no-extensions -e ./extensions/gnosis/index.ts --list-models '__unlikely__'
```

## Package sanity

- [x] confirm collection package version is `0.1.31`
- [x] confirm standalone gnosis package version is `0.1.0`
- [x] run root package dry-run and verify gnosis files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone gnosis package dry-run and verify files are limited to README, index, and package metadata

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-gnosis
```

- [x] run root publish dry-run

```bash
npm publish --dry-run --access public
```

- [x] run standalone gnosis publish dry-run

```bash
npm publish --dry-run --access public --workspace @diegopetrucci/pi-gnosis
```

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.31`

```bash
git add .gnosis/entries.jsonl README.md package.json extensions/gnosis docs/*v0.1.31.md
git commit -m "Prepare v0.1.31 release"
git tag v0.1.31
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.31
```

- [ ] create GitHub release for `v0.1.31`
- [ ] paste contents of `docs/github-release-v0.1.31.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary (not an internal title or redundant version heading), and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

### Collection package

- [ ] human publishes root package

```bash
npm publish
```

### Standalone gnosis package

- [ ] human publishes standalone gnosis package

```bash
cd extensions/gnosis
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.31`
  - [ ] `@diegopetrucci/pi-gnosis@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-gnosis
```

- [ ] reload pi and confirm `gnosis` is available
- [ ] publish announcement copy from `docs/announcement-v0.1.31.md`
