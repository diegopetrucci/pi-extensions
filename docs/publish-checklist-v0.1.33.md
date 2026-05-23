# Publish checklist — v0.1.33

## Preflight

- [x] confirm `v0.1.32` exists on origin and GitHub
- [x] confirm `v0.1.33` does not yet exist on origin or GitHub
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.32`
  - [x] `@diegopetrucci/pi-brrr` is not yet published
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.33`
  - [x] `extensions/brrr/package.json` -> `0.1.0`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.33.md`
  - [x] `docs/github-release-v0.1.33.md`
  - [x] `docs/announcement-v0.1.33.md`
  - [x] `docs/publish-checklist-v0.1.33.md`
- [x] verify extension files exist
  - [x] `extensions/brrr/index.ts`
  - [x] `extensions/brrr/README.md`
  - [x] `extensions/brrr/brrr.example.json`
  - [x] `extensions/brrr/package.json`
- [x] verify root package includes `./extensions/brrr/index.ts`
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript syntax check for brrr

```bash
bun --check extensions/brrr/index.ts
```

- [x] validate package JSON files and release docs

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const brrr=JSON.parse(fs.readFileSync('extensions/brrr/package.json','utf8')); if(root.version!=='0.1.33') throw new Error('root version mismatch'); if(brrr.version!=='0.1.0') throw new Error('brrr version mismatch'); for (const file of ['docs/release-notes-v0.1.33.md','docs/github-release-v0.1.33.md','docs/announcement-v0.1.33.md','docs/publish-checklist-v0.1.33.md']) fs.accessSync(file);"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] smoke-test extension loading

```bash
pi --offline --no-extensions -e ./extensions/brrr/index.ts --list-models '__unlikely__'
```

## Package sanity

- [x] confirm collection package version is `0.1.33`
- [x] confirm standalone brrr package version is `0.1.0`
- [x] run root package dry-run and verify brrr files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone brrr package dry-run and verify files are limited to README, index, example config, and package metadata

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-brrr
```

- [x] run root publish dry-run

```bash
npm publish --dry-run --access public
```

- [x] run standalone brrr publish dry-run

```bash
npm publish --dry-run --access public --workspace @diegopetrucci/pi-brrr
```

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.33`

```bash
git add README.md package.json extensions/brrr docs/*v0.1.33.md
git commit -m "Prepare v0.1.33 release"
git tag v0.1.33
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.33
```

- [ ] create GitHub release for `v0.1.33`
- [ ] paste contents of `docs/github-release-v0.1.33.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary (not an internal title or redundant version heading), and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

### Collection package

- [ ] human publishes root package

```bash
npm publish
```

### Standalone brrr package

- [ ] human publishes standalone brrr package

```bash
cd extensions/brrr
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.33`
  - [ ] `@diegopetrucci/pi-brrr@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-brrr
```

- [ ] reload pi and confirm `/brrr` is available
- [ ] publish announcement copy from `docs/announcement-v0.1.33.md`
