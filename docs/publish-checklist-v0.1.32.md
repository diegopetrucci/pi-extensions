# Publish checklist — v0.1.32

## Preflight

- [x] confirm `v0.1.31` exists on origin and GitHub
- [x] confirm `v0.1.32` does not yet exist on origin or GitHub
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.31`
  - [x] `@diegopetrucci/pi-review` is not yet published
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.32`
  - [x] `extensions/review/package.json` -> `0.1.0`
- [x] verify licensing metadata and attribution
  - [x] root `package.json` license is `MIT AND Apache-2.0`
  - [x] `extensions/review/package.json` license is `Apache-2.0`
  - [x] `extensions/review/LICENSE` exists
  - [x] README mixed-license note still mentions `extensions/review`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.32.md`
  - [x] `docs/github-release-v0.1.32.md`
  - [x] `docs/announcement-v0.1.32.md`
  - [x] `docs/publish-checklist-v0.1.32.md`
- [x] verify extension files exist
  - [x] `extensions/review/index.ts`
  - [x] `extensions/review/README.md`
  - [x] `extensions/review/LICENSE`
  - [x] `extensions/review/package.json`
- [x] verify root package includes `./extensions/review/index.ts`
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript syntax check for review

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/review/index.ts
```

- [x] validate package JSON files, license metadata, and release docs

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const review=JSON.parse(fs.readFileSync('extensions/review/package.json','utf8')); if(root.version!=='0.1.32') throw new Error('root version mismatch'); if(review.version!=='0.1.0') throw new Error('review version mismatch'); if(root.license!=='MIT AND Apache-2.0') throw new Error('root license mismatch'); if(review.license!=='Apache-2.0') throw new Error('review license mismatch'); for (const file of ['docs/release-notes-v0.1.32.md','docs/github-release-v0.1.32.md','docs/announcement-v0.1.32.md','docs/publish-checklist-v0.1.32.md']) fs.accessSync(file);"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] smoke-test extension loading

```bash
pi --offline --no-extensions -e ./extensions/review/index.ts --list-models '__unlikely__'
```

## Package sanity

- [x] confirm collection package version is `0.1.32`
- [x] confirm standalone review package version is `0.1.0`
- [x] run root package dry-run and verify review files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone review package dry-run and verify files are limited to README, LICENSE, index, and package metadata

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-review
```

- [x] run root publish dry-run

```bash
npm publish --dry-run --access public
```

- [x] run standalone review publish dry-run

```bash
npm publish --dry-run --access public --workspace @diegopetrucci/pi-review
```

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.32`

```bash
git add README.md package.json extensions/review docs/*v0.1.32.md
git commit -m "Prepare v0.1.32 release"
git tag v0.1.32
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.32
```

- [ ] create GitHub release for `v0.1.32`
- [ ] paste contents of `docs/github-release-v0.1.32.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary (not an internal title or redundant version heading), and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

### Collection package

- [ ] human publishes root package

```bash
npm publish
```

### Standalone review package

- [ ] human publishes standalone review package

```bash
cd extensions/review
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.32`
  - [ ] `@diegopetrucci/pi-review@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-review
```

- [ ] reload pi and confirm `/review` and `/end-review` are available
- [ ] publish announcement copy from `docs/announcement-v0.1.32.md`
