# Publish checklist — v0.1.45

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.45` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished for root `0.1.45` and oracle `0.1.12`
- [x] verify versions are bumped in `package.json`, `extensions/oracle/package.json`, and `package-lock.json`
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.45.md`
  - [x] `docs/github-release-v0.1.45.md`
  - [x] `docs/announcement-v0.1.45.md`
  - [x] `docs/publish-checklist-v0.1.45.md`

## Local checks

- [x] verify package JSON files, release docs, and oracle preference entries

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const oracle=JSON.parse(fs.readFileSync('extensions/oracle/package.json','utf8')); const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8')); const index=fs.readFileSync('extensions/oracle/index.ts','utf8'); if(root.version!=='0.1.45') throw new Error('root version mismatch'); if(oracle.version!=='0.1.12') throw new Error('oracle version mismatch'); if(lock.version!=='0.1.45'||lock.packages[''].version!=='0.1.45') throw new Error('lock root version mismatch'); if(lock.packages['extensions/oracle'].version!=='0.1.12') throw new Error('lock oracle version mismatch'); for (const file of ['docs/release-notes-v0.1.45.md','docs/github-release-v0.1.45.md','docs/announcement-v0.1.45.md','docs/publish-checklist-v0.1.45.md']) fs.accessSync(file); for (const token of ['claude-fable-5','anthropic/claude-fable-5','~anthropic/claude-fable-latest']) if(!index.includes(token)) throw new Error('missing oracle preference '+token);"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] run TypeScript check for oracle

```bash
bun --check extensions/oracle/index.ts
```

- [x] run oracle bundling sanity check

```bash
bun build extensions/oracle/index.ts --external @earendil-works/pi-ai --external @earendil-works/pi-coding-agent --external @earendil-works/pi-tui --external typebox --outfile /tmp/oracle.js
```

- [x] smoke-test Anthropic Fable oracle selection

```bash
ANTHROPIC_API_KEY=dummy PI_OFFLINE=1 pi --no-extensions --extension ./extensions/oracle/index.ts --provider anthropic --model claude-fable-5 --no-session -p "/oracle-model"
```

- [x] smoke-test OpenRouter Fable oracle selection

```bash
OPENROUTER_API_KEY=dummy PI_OFFLINE=1 pi --no-extensions --extension ./extensions/oracle/index.ts --provider openrouter --model anthropic/claude-fable-5 --no-session -p "/oracle-model"
```

## Package sanity

- [x] root collection package includes oracle updates

```bash
npm pack --dry-run --json
```

- [x] standalone oracle package includes README, index, package metadata, and Pi marker

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-oracle
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-oracle`

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.45`

```bash
git add .
git commit -m "Prepare v0.1.45 release"
git tag v0.1.45
```

## Push and GitHub release

- [x] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.45
```

- [x] create GitHub release for `v0.1.45`
- [x] paste contents of `docs/github-release-v0.1.45.md`

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [ ] human publishes root package

```bash
npm publish
```

- [ ] human publishes standalone oracle package

```bash
npm publish --workspace @diegopetrucci/pi-oracle
```

## Post-publish validation

- [ ] wait 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [ ] verify npm package pages show expected versions for the root and standalone oracle packages
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-oracle
```

- [ ] reload pi and confirm `/oracle-model` can select Claude Fable 5 when the provider exposes it
- [ ] publish announcement copy from `docs/announcement-v0.1.45.md`
