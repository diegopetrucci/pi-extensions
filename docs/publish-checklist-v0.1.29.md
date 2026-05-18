# Publish checklist — v0.1.29

## Preflight

- [x] confirm `v0.1.28` exists on origin and GitHub
- [x] confirm `v0.1.29` does not yet exist on origin or GitHub
- [x] verify npm registry state
  - [x] `@diegopetrucci/pi-extensions` latest published version is `0.1.28`
  - [x] `@diegopetrucci/pi-agent-workflow-audit` is not yet published
- [x] verify versions are correct
  - [x] `package.json` -> `0.1.29`
  - [x] `extensions/agent-workflow-audit/package.json` -> `0.1.0`
- [x] verify docs exist
  - [x] `docs/release-notes-v0.1.29.md`
  - [x] `docs/github-release-v0.1.29.md`
  - [x] `docs/announcement-v0.1.29.md`
  - [x] `docs/publish-checklist-v0.1.29.md`
- [x] verify extension files exist
  - [x] `extensions/agent-workflow-audit/index.ts`
  - [x] `extensions/agent-workflow-audit/README.md`
  - [x] `extensions/agent-workflow-audit/package.json`
- [x] verify root package includes `./extensions/agent-workflow-audit/index.ts`
- [x] verify README extension list remains alphabetically ordered

## Local checks

- [x] run TypeScript syntax check for agent-workflow-audit

```bash
export NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules
bun --check extensions/agent-workflow-audit/index.ts
```

- [x] validate package JSON files and release docs

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const audit=JSON.parse(fs.readFileSync('extensions/agent-workflow-audit/package.json','utf8')); if(root.version!=='0.1.29') throw new Error('root version mismatch'); if(audit.version!=='0.1.0') throw new Error('agent-workflow-audit version mismatch'); for (const file of ['docs/release-notes-v0.1.29.md','docs/github-release-v0.1.29.md','docs/announcement-v0.1.29.md','docs/publish-checklist-v0.1.29.md']) fs.accessSync(file);"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] smoke-test extension loading and command help

```bash
pi --offline --no-extensions -e ./extensions/agent-workflow-audit/index.ts --list-models '__unlikely__'
pi --offline --no-extensions -e ./extensions/agent-workflow-audit/index.ts --no-session -p '/agent-workflow-audit --help'
```

## Package sanity

- [x] confirm collection package version is `0.1.29`
- [x] confirm standalone agent-workflow-audit package version is `0.1.0`
- [x] run root package dry-run and verify agent-workflow-audit files are included

```bash
npm pack --dry-run --json
```

- [x] run standalone agent-workflow-audit package dry-run and verify files are limited to README, index, and package metadata

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-agent-workflow-audit
```

## Commit and tag

- [ ] commit changes with a short imperative subject
- [ ] create tag: `v0.1.29`

```bash
git add .gnosis/entries.jsonl README.md package.json extensions/agent-workflow-audit docs/*v0.1.29.md
git commit -m "Prepare v0.1.29 release"
git tag v0.1.29
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [ ] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.29
```

- [ ] create GitHub release for `v0.1.29`
- [ ] paste contents of `docs/github-release-v0.1.29.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary (not an internal title or redundant version heading), and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually, then resume with post-publish validation after they confirm publishing is complete.

### Collection package

- [ ] human publishes root package

```bash
npm publish
```

### Standalone agent-workflow-audit package

- [ ] human publishes standalone agent-workflow-audit package

```bash
cd extensions/agent-workflow-audit
npm publish
cd ../..
```

## Post-publish validation

- [ ] verify npm package pages show expected versions
  - [ ] `@diegopetrucci/pi-extensions@0.1.29`
  - [ ] `@diegopetrucci/pi-agent-workflow-audit@0.1.0`
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-agent-workflow-audit
```

- [ ] reload pi and confirm `agent-workflow-audit` is available
- [ ] run `/agent-workflow-audit --plan-only` in a disposable checkout to confirm the command starts and returns a final report
- [ ] publish announcement copy from `docs/announcement-v0.1.29.md`
