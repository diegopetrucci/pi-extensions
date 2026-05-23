# Publish checklist — v0.1.34

## Preflight

- [x] confirm `v0.1.33` exists on origin
- [x] note GitHub release for `v0.1.33` is not present
- [x] confirm `v0.1.34` does not yet exist on origin or GitHub
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.33`
  - [x] `@diegopetrucci/pi-librarian` latest published version is `0.1.1`
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.34`
  - [x] `extensions/librarian/package.json` -> `0.1.2`
  - [x] `package-lock.json` root package -> `0.1.34`
  - [x] `package-lock.json` librarian workspace -> `0.1.2`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.34.md`
  - [x] `docs/github-release-v0.1.34.md`
  - [x] `docs/announcement-v0.1.34.md`
  - [x] `docs/publish-checklist-v0.1.34.md`
- [x] verify extension files exist
  - [x] `extensions/librarian/index.ts`
  - [x] `extensions/librarian/README.md`
  - [x] `extensions/librarian/package.json`
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript check for librarian

```bash
npm exec -- tsc --noEmit --skipLibCheck --moduleResolution bundler --module ESNext --target es2022 extensions/librarian/index.ts
```

- [x] validate package JSON files and release docs

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const lib=JSON.parse(fs.readFileSync('extensions/librarian/package.json','utf8')); const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8')); if(root.version!=='0.1.34') throw new Error('root version mismatch'); if(lib.version!=='0.1.2') throw new Error('librarian version mismatch'); if(lock.version!=='0.1.34'||lock.packages[''].version!=='0.1.34') throw new Error('lock root version mismatch'); if(lock.packages['extensions/librarian'].version!=='0.1.2') throw new Error('lock librarian version mismatch'); for (const file of ['docs/release-notes-v0.1.34.md','docs/github-release-v0.1.34.md','docs/announcement-v0.1.34.md']) fs.accessSync(file);"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] smoke-test `/librarian-cache status`

```bash
tmp=$(mktemp -d); PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/librarian/index.ts -p "/librarian-cache status"
```

Output confirms repos unused for 7 days are removed lazily.

## Package sanity

- [x] confirm collection package version is `0.1.34`
- [x] confirm standalone librarian package version is `0.1.2`
- [x] run root package dry-run and verify librarian files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone librarian package dry-run and verify files are limited to README, index, and package metadata

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-librarian
```

- [x] run root publish dry-run

```bash
npm publish --dry-run --access public
```

- [x] run standalone librarian publish dry-run

```bash
npm publish --dry-run --access public --workspace @diegopetrucci/pi-librarian
```

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.34`

```bash
git add .gitignore README.md package.json package-lock.json extensions/librarian docs/*v0.1.34.md
git commit -m "Prepare v0.1.34 release"
git tag v0.1.34
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.34
```

- [ ] create GitHub release for `v0.1.34`
- [ ] paste contents of `docs/github-release-v0.1.34.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary (not an internal title or redundant version heading), and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

### Collection package

- [ ] human publishes root package

```bash
npm publish
```

### Standalone librarian package

- [ ] human publishes standalone librarian package

```bash
cd extensions/librarian
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.34`
  - [ ] `@diegopetrucci/pi-librarian@0.1.2`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-librarian
```

- [ ] reload pi and confirm `/librarian-cache status` reports 7 days
- [ ] publish announcement copy from `docs/announcement-v0.1.34.md`
