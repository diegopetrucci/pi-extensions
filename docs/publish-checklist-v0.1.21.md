# Publish checklist — v0.1.21

## Preflight

- [x] confirm working tree contains only intended changes
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.20`
  - [x] `@diegopetrucci/pi-openai-fast` is not published yet
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.21`
  - [x] `extensions/openai-fast/package.json` -> `0.1.0`
  - [x] `extensions/quiet-tools/package.json` -> `0.1.1`
  - [x] `extensions/context-inspector/package.json` -> `0.1.0`
  - [x] `extensions/librarian/package.json` -> `0.1.0`
  - [x] `extensions/context-cap/package.json` -> `0.1.0`
  - [x] `extensions/minimal-footer/package.json` -> `0.1.6`
  - [x] `extensions/oracle/package.json` -> `0.1.7`
  - [x] `extensions/notify/package.json` -> `0.1.3`
  - [x] `extensions/permission-gate/package.json` -> `0.1.1`
  - [x] `extensions/confirm-destructive/package.json` -> `0.1.1`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.21.md`
  - [x] `docs/github-release-v0.1.21.md`
  - [x] `docs/announcement-v0.1.21.md`
  - [x] `docs/publish-checklist-v0.1.21.md`
- [x] verify extension files exist
  - [x] `extensions/openai-fast/index.ts`
  - [x] `extensions/openai-fast/README.md`
  - [x] `extensions/openai-fast/package.json`
  - [x] `extensions/openai-fast/openai-fast.example.json`
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
  --glob '!docs/*v0.1.18.md' \
  --glob '!docs/*v0.1.19.md' \
  --glob '!docs/*v0.1.20.md' \
  --glob '!docs/*v0.1.21.md'
```

## Local smoke tests

- [x] run TypeScript syntax checks

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/quiet-tools/index.ts
bun --check extensions/context-cap/index.ts
bun --check extensions/context-inspector/index.ts
bun --check extensions/librarian/index.ts
bun --check extensions/minimal-footer/index.ts
bun --check extensions/minimal-footer/openai-usage.ts
bun --check extensions/oracle/index.ts
bun --check extensions/permission-gate/index.ts
bun --check extensions/confirm-destructive/index.ts
bun --check extensions/notify/index.ts
bun --check extensions/openai-fast/index.ts
```

- [x] validate sample config JSON

```bash
jq empty extensions/minimal-footer/minimal-footer.example.json
jq empty extensions/notify/notify.example.json
jq empty extensions/openai-fast/openai-fast.example.json
```

- [x] load each extension directly and confirm pi starts

```bash
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/quiet-tools/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/context-cap/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/context-inspector/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/librarian/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/minimal-footer/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/oracle/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/permission-gate/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/confirm-destructive/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/notify/index.ts --list-models smoke
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/openai-fast/index.ts --list-models smoke
```

- [x] run context-inspector command smoke test

```bash
PI_OFFLINE=1 pi --no-extensions --extension ./extensions/context-inspector/index.ts --no-session -p "/context --no-open --redact"
```

- [x] run bundling sanity checks

```bash
bun build extensions/quiet-tools/index.ts --external @earendil-works/pi-coding-agent --external @earendil-works/pi-tui --outfile /tmp/quiet-tools.js
bun build extensions/librarian/index.ts --external @earendil-works/pi-ai --external @earendil-works/pi-coding-agent --external @earendil-works/pi-tui --external typebox --outfile /tmp/librarian.js
bun build extensions/oracle/index.ts --external @earendil-works/pi-ai --external @earendil-works/pi-coding-agent --external @earendil-works/pi-tui --external typebox --outfile /tmp/oracle.js
bun build extensions/openai-fast/index.ts --external @earendil-works/pi-coding-agent --outfile /tmp/openai-fast.js
```

## Package sanity

- [x] confirm collection package exposes all ten extensions in root `package.json`
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
- [x] create tag: `v0.1.21`

```bash
git add README.md package.json extensions docs
git commit -m "Prepare v0.1.21 release"
git tag v0.1.21
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin main
git push origin v0.1.21
```

- [x] create GitHub release for `v0.1.21`
- [x] paste contents of `docs/github-release-v0.1.21.md`

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### New standalone package

- [ ] publish standalone openai-fast package

```bash
cd extensions/openai-fast
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.21`
  - [ ] `@diegopetrucci/pi-openai-fast@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-openai-fast
```

- [ ] reload pi and confirm extensions are available
- [ ] publish announcement copy from `docs/announcement-v0.1.21.md`
