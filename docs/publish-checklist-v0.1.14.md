# Publish checklist — v0.1.14

## Preflight

- [x] confirm working tree contains only intended changes
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.14`
  - [x] `extensions/minimal-footer/package.json` -> `0.1.6`
  - [x] `extensions/oracle/package.json` -> `0.1.7`
  - [x] `extensions/notify/package.json` -> `0.1.3`
  - [x] `extensions/permission-gate/package.json` -> `0.1.1`
  - [x] `extensions/confirm-destructive/package.json` -> `0.1.1`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.14.md`
  - [x] `docs/github-release-v0.1.14.md`
  - [x] `docs/announcement-v0.1.14.md`
  - [x] `docs/publish-checklist-v0.1.14.md`
- [x] verify extension files exist
  - [x] `extensions/minimal-footer/index.ts`
  - [x] `extensions/minimal-footer/openai-usage.ts`
  - [x] `extensions/oracle/index.ts`
  - [x] `extensions/permission-gate/index.ts`
  - [x] `extensions/confirm-destructive/index.ts`
  - [x] `extensions/notify/index.ts`
- [x] verify no non-historical references remain to old Pi plumbing

```bash
rg "@mariozechner|@sinclair/typebox|badlogic/pi-mono" README.md package.json extensions docs \
  --glob '!docs/*v0.1.14.md' \
  --glob '!docs/release-notes-v0.1.5.md' \
  --glob '!docs/github-release-v0.1.5.md'
```

## Local smoke tests

- [x] run TypeScript syntax checks

```bash
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
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/minimal-footer/index.ts --list-models
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/oracle/index.ts --list-models
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/permission-gate/index.ts --list-models
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/confirm-destructive/index.ts --list-models
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/notify/index.ts --list-models
```

- [x] run oracle bundling sanity check

```bash
bun build extensions/oracle/index.ts --external @earendil-works/pi-ai --external @earendil-works/pi-coding-agent --external @earendil-works/pi-tui --external typebox --outfile /tmp/oracle.js
```

## Package sanity

- [x] confirm collection package exposes all five extensions in root `package.json`
- [x] confirm standalone package metadata uses `@earendil-works/*` peer dependencies
- [x] confirm oracle package declares `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox` peers
- [x] confirm root README includes updated install instructions for the latest tag
- [x] confirm oracle provider matrix includes current Xiaomi MiMo providers and excludes removed Gemini CLI / Antigravity providers
- [x] run package dry-runs

```bash
npm pack --dry-run
for pkg in extensions/*; do
  [ -f "$pkg/package.json" ] || continue
  (cd "$pkg" && npm pack --dry-run)
done
```

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.14`

Example:

```bash
git add README.md package.json extensions docs
```

```bash
git commit -m "Prepare v0.1.14 release"
git tag v0.1.14
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin main
git push origin v0.1.14
```

- [ ] create GitHub release for `v0.1.14`
- [ ] paste contents of `docs/github-release-v0.1.14.md`

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone packages

- [ ] publish standalone minimal footer package

```bash
cd extensions/minimal-footer
npm publish
cd ../..
```

- [ ] publish standalone oracle package

```bash
cd extensions/oracle
npm publish
cd ../..
```

- [ ] publish standalone notify package

```bash
cd extensions/notify
npm publish
cd ../..
```

- [ ] publish standalone permission gate package

```bash
cd extensions/permission-gate
npm publish
cd ../..
```

- [ ] publish standalone confirm destructive package

```bash
cd extensions/confirm-destructive
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.14`
  - [ ] `@diegopetrucci/pi-minimal-footer@0.1.6`
  - [ ] `@diegopetrucci/pi-oracle@0.1.7`
  - [ ] `@diegopetrucci/pi-notify@0.1.3`
  - [ ] `@diegopetrucci/pi-permission-gate@0.1.1`
  - [ ] `@diegopetrucci/pi-confirm-destructive@0.1.1`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-oracle
```

- [ ] reload pi and confirm extensions are available
- [ ] publish announcement copy from `docs/announcement-v0.1.14.md`
