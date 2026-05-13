# Publish checklist — v0.1.24

## Preflight

- [x] confirm `v0.1.23` already exists on origin and GitHub for the librarian cache release, so this dirty-repo-guard release uses `v0.1.24`
- [x] confirm working tree contains intended dirty-repo-guard release changes on top of `origin/main`
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.22`
  - [x] `@diegopetrucci/pi-librarian` latest published version is `0.1.0`
  - [x] `@diegopetrucci/pi-dirty-repo-guard` is not published yet
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.24`
  - [x] `extensions/librarian/package.json` -> `0.1.1`
  - [x] `extensions/dirty-repo-guard/package.json` -> `0.1.0`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.24.md`
  - [x] `docs/github-release-v0.1.24.md`
  - [x] `docs/announcement-v0.1.24.md`
  - [x] `docs/publish-checklist-v0.1.24.md`
- [x] verify extension files exist
  - [x] `extensions/dirty-repo-guard/index.ts`
  - [x] `extensions/dirty-repo-guard/README.md`
  - [x] `extensions/dirty-repo-guard/package.json`
- [x] verify root package includes `./extensions/dirty-repo-guard/index.ts`
- [x] verify README extension list remains alphabetically ordered
- [x] verify root README GitHub install tag references `v0.1.24`

## Local checks

- [x] run TypeScript syntax check for dirty-repo-guard

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/dirty-repo-guard/index.ts
```

- [x] validate package JSON files and release preflight with Node

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); JSON.parse(require('fs').readFileSync('extensions/dirty-repo-guard/package.json', 'utf8'))"
```

- [x] verify `extensions/dirty-repo-guard/index.ts` matches pi's local upstream example copy

```bash
cmp -s extensions/dirty-repo-guard/index.ts /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/dirty-repo-guard.ts
```

## Package sanity

- [x] confirm collection package version is `0.1.24`
- [x] confirm standalone dirty-repo-guard package version is `0.1.0`
- [x] confirm pending standalone librarian package version is `0.1.1`
- [x] run root package dry-run and verify dirty-repo-guard files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone dirty-repo-guard package dry-run and verify files are limited to README, index, and package metadata

```bash
cd extensions/dirty-repo-guard
npm pack --dry-run --json
cd ../..
```

- [x] run pending standalone librarian package dry-run

```bash
cd extensions/librarian
npm pack --dry-run --json
cd ../..
```

- [x] run root publish dry-run

```bash
npm publish --dry-run --access public
```

- [x] run standalone dirty-repo-guard publish dry-run

```bash
cd extensions/dirty-repo-guard
npm publish --dry-run --access public
cd ../..
```

- [x] run pending standalone librarian publish dry-run

```bash
cd extensions/librarian
npm publish --dry-run --access public
cd ../..
```

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.24`

```bash
git add README.md package.json extensions/dirty-repo-guard docs/*v0.1.24.md
git commit -m "Prepare v0.1.24 release"
git tag v0.1.24
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin main
git push origin v0.1.24
```

- [x] create GitHub release for `v0.1.24`
- [x] paste contents of `docs/github-release-v0.1.24.md`

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone dirty-repo-guard package

- [ ] publish standalone dirty-repo-guard package

```bash
cd extensions/dirty-repo-guard
npm publish
cd ../..
```

### Pending standalone librarian package from v0.1.23

- [ ] publish standalone librarian package if the v0.1.23 npm publish has not already been completed

```bash
cd extensions/librarian
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.24`
  - [ ] `@diegopetrucci/pi-dirty-repo-guard@0.1.0`
  - [ ] `@diegopetrucci/pi-librarian@0.1.1` if publishing the pending v0.1.23 standalone package
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-dirty-repo-guard
pi install npm:@diegopetrucci/pi-librarian
```

- [ ] reload pi and confirm extensions are available
- [ ] publish announcement copy from `docs/announcement-v0.1.24.md`
