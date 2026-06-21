# Publish checklist — v0.1.46

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.46` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished for root `0.1.46` and oracle `0.1.13`
- [x] verify versions are bumped in `package.json`, `extensions/oracle/package.json`, and `package-lock.json`
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.46.md`
  - [x] `docs/github-release-v0.1.46.md`
  - [x] `docs/announcement-v0.1.46.md`
  - [x] `docs/publish-checklist-v0.1.46.md`

## Local checks

- [x] refresh dependencies with `npm ci`

```bash
npm ci
```

- [x] run install-state preflight

```bash
npm run preflight:install-state
```

- [x] run full CI script (preflight + typecheck across all tracked `.ts` files)

```bash
npm run ci
```

- [x] verify package JSON files, release docs, and oracle error-reporting markers

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const oracle=JSON.parse(fs.readFileSync('extensions/oracle/package.json','utf8')); const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8')); const index=fs.readFileSync('extensions/oracle/index.ts','utf8'); if(root.version!=='0.1.46') throw new Error('root version mismatch'); if(oracle.version!=='0.1.13') throw new Error('oracle version mismatch'); if(lock.version!=='0.1.46'||lock.packages[''].version!=='0.1.46') throw new Error('lock root version mismatch'); if(lock.packages['extensions/oracle'].version!=='0.1.13') throw new Error('lock oracle version mismatch'); for (const file of ['docs/release-notes-v0.1.46.md','docs/github-release-v0.1.46.md','docs/announcement-v0.1.46.md','docs/publish-checklist-v0.1.46.md']) fs.accessSync(file); for (const token of ['formatOracleModelError','TRANSIENT_ERROR_PATTERN','lastStopReason','event.message.stopReason','event.message.errorMessage']) if(!index.includes(token)) throw new Error('missing oracle error marker '+token);"
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

- [x] run helper unit-style check for `formatOracleModelError` covering transient, non-transient, missing-detail, and aborted cases

```bash
bun /tmp/oracle-helper-test.ts
```

## Package sanity

- [x] root collection package dry-run

```bash
npm pack --dry-run --json
```

- [x] standalone oracle package dry-run

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-oracle
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-oracle`

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.46`

```bash
git add .
git commit -m "Prepare v0.1.46 release"
git tag v0.1.46
```

## Push and GitHub release

- [x] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.46
```

- [x] create GitHub release for `v0.1.46`
- [x] paste contents of `docs/github-release-v0.1.46.md`

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

- [ ] reload pi and confirm oracle reports `Oracle model error: <detail>` (with the transient hint for transient signatures) when the upstream model turn errors, and keeps the genuine empty-response message otherwise
- [ ] publish announcement copy from `docs/announcement-v0.1.46.md`
