# Publish checklist — v0.1.23

## Preflight

- [x] confirm working tree contains only intended librarian cache release changes
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.22`
  - [x] `@diegopetrucci/pi-librarian` latest published version is `0.1.0`
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.23`
  - [x] `extensions/librarian/package.json` -> `0.1.1`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.23.md`
  - [x] `docs/github-release-v0.1.23.md`
  - [x] `docs/announcement-v0.1.23.md`
  - [x] `docs/publish-checklist-v0.1.23.md`
- [x] verify extension files exist
  - [x] `extensions/librarian/index.ts`
  - [x] `extensions/librarian/README.md`
  - [x] `extensions/librarian/package.json`
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript syntax check for librarian

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/librarian/index.ts
```

- [x] validate package/sample JSON

```bash
jq empty package.json
jq empty extensions/librarian/package.json
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

- [x] run `/librarian-cache` smoke tests in print and JSON modes with an isolated `PI_CODING_AGENT_DIR`

```bash
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/librarian/index.ts -p "/librarian-cache status"
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/librarian/index.ts -p "/librarian-cache off"
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/librarian/index.ts --mode json "/librarian-cache status"
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

- [x] run final diff whitespace check

```bash
git diff --check
```

## Package sanity

- [x] confirm collection package exposes all ten extensions in root `package.json`
- [x] confirm standalone librarian package metadata uses `@earendil-works/*` peer dependencies
- [x] confirm root README includes updated install instructions for the latest tag
- [x] run package dry-runs

```bash
npm pack --dry-run --json
(cd extensions/librarian && npm pack --dry-run --json)
```

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.23`

```bash
git add README.md package.json extensions/librarian docs/*v0.1.23.md
git commit -m "Prepare v0.1.23 release"
git tag v0.1.23
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin main
git push origin v0.1.23
```

- [x] create GitHub release for `v0.1.23`
- [x] paste contents of `docs/github-release-v0.1.23.md`

## Publish

### Collection package

- [ ] publish root package

```bash
npm publish
```

### Standalone librarian package

- [ ] publish standalone librarian package

```bash
cd extensions/librarian
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.23`
  - [ ] `@diegopetrucci/pi-librarian@0.1.1`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-librarian
```

- [ ] reload pi and confirm extensions are available
- [ ] publish announcement copy from `docs/announcement-v0.1.23.md`
