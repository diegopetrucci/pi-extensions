# Publish checklist — v0.1.18

## Preflight

- [x] confirm working tree contains only intended changes
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.18`
  - [x] `extensions/librarian/package.json` -> `0.1.0`
  - [x] `extensions/quiet-tools/package.json` -> `0.1.0`
  - [x] `extensions/context-cap/package.json` -> `0.1.0`
  - [x] `extensions/minimal-footer/package.json` -> `0.1.6`
  - [x] `extensions/oracle/package.json` -> `0.1.7`
  - [x] `extensions/notify/package.json` -> `0.1.3`
  - [x] `extensions/permission-gate/package.json` -> `0.1.1`
  - [x] `extensions/confirm-destructive/package.json` -> `0.1.1`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.18.md`
  - [x] `docs/github-release-v0.1.18.md`
  - [x] `docs/announcement-v0.1.18.md`
  - [x] `docs/publish-checklist-v0.1.18.md`
- [x] verify extension files exist
  - [x] `extensions/librarian/index.ts`
  - [x] `extensions/librarian/README.md`
  - [x] `extensions/quiet-tools/index.ts`
  - [x] `extensions/context-cap/index.ts`
  - [x] `extensions/minimal-footer/index.ts`
  - [x] `extensions/minimal-footer/openai-usage.ts`
  - [x] `extensions/oracle/index.ts`
  - [x] `extensions/permission-gate/index.ts`
  - [x] `extensions/confirm-destructive/index.ts`
  - [x] `extensions/notify/index.ts`
- [x] verify README extension list is alphabetically ordered
- [x] verify no non-historical references remain to `compact-bash`

```bash
rg "compact-bash|pi-compact-bash" README.md package.json extensions
```

- [x] verify no non-historical references remain to old Pi plumbing

```bash
rg "@mariozechner|@sinclair/typebox|badlogic/pi-mono" README.md package.json extensions docs \
  --glob '!docs/release-notes-v0.1.5.md' \
  --glob '!docs/github-release-v0.1.5.md' \
  --glob '!docs/*v0.1.14.md' \
  --glob '!docs/*v0.1.15.md' \
  --glob '!docs/*v0.1.16.md' \
  --glob '!docs/*v0.1.17.md' \
  --glob '!docs/*v0.1.18.md'
```

## Local smoke tests

- [x] run TypeScript syntax checks

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/quiet-tools/index.ts
bun --check extensions/context-cap/index.ts
bun --check extensions/librarian/index.ts
bun --check extensions/minimal-footer/index.ts
bun --check extensions/minimal-footer/openai-usage.ts
bun --check extensions/oracle/index.ts
bun --check extensions/permission-gate/index.ts
bun --check extensions/confirm-destructive/index.ts
bun --check extensions/notify/index.ts
```

- [x] validate sample config JSON

```bash
jq empty extensions/minimal-footer/minimal-footer.example.json
jq empty extensions/notify/notify.example.json
```

- [x] load each extension directly and confirm pi starts

```bash
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/quiet-tools/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/context-cap/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/librarian/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/minimal-footer/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/oracle/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/permission-gate/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/confirm-destructive/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/notify/index.ts --list-models smoke
```

- [x] run librarian bundling sanity check

```bash
bun build extensions/librarian/index.ts --external @earendil-works/pi-ai --external @earendil-works/pi-coding-agent --external @earendil-works/pi-tui --external typebox --outfile /tmp/librarian.js
```

- [x] run oracle bundling sanity check

```bash
bun build extensions/oracle/index.ts --external @earendil-works/pi-ai --external @earendil-works/pi-coding-agent --external @earendil-works/pi-tui --external typebox --outfile /tmp/oracle.js
```

## Package sanity

- [x] confirm collection package exposes all eight extensions in root `package.json`
- [x] confirm standalone package metadata uses `@earendil-works/*` peer dependencies
- [x] confirm root README includes updated install instructions for the latest tag
- [x] run package dry-runs

```bash
npm pack --dry-run --json
for pkg in extensions/*; do
  [ -f "$pkg/package.json" ] || continue
  (cd "$pkg" && npm pack --dry-run --json)
done
```

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.18`

```bash
git add README.md package.json extensions docs
git commit -m "Prepare v0.1.18 release"
git tag v0.1.18
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin main
git push origin v0.1.18
```

- [x] create GitHub release for `v0.1.18`
- [x] paste contents of `docs/github-release-v0.1.18.md`

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### New standalone package

- [ ] publish standalone librarian package

```bash
cd extensions/librarian
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.18`
  - [ ] `@diegopetrucci/pi-librarian@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-librarian
```

- [ ] reload pi and confirm extensions are available
- [ ] publish announcement copy from `docs/announcement-v0.1.18.md`
