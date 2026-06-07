# Publish checklist — v0.1.44

## Preflight

- [x] confirm current branch is `main`
- [x] confirm `v0.1.44` does not exist locally or on GitHub
- [x] verify npm registry state and local versions are unpublished for root `0.1.44` and `illustrations-to-explain-things` `0.1.0`
- [x] verify versions are bumped in `package.json` and `package-lock.json`
- [x] verify fleet markers exist and contain `0.78.0` at the repo root and under the new skill package directory
- [x] verify docs exist:
  - [x] `docs/release-notes-v0.1.44.md`
  - [x] `docs/github-release-v0.1.44.md`
  - [x] `docs/announcement-v0.1.44.md`
  - [x] `docs/publish-checklist-v0.1.44.md`

## Local checks

- [x] verify package JSON files, skill files, and release docs

```bash
node -e "const fs=require('fs'); const root=JSON.parse(fs.readFileSync('package.json','utf8')); const skill=JSON.parse(fs.readFileSync('extensions/illustrations-to-explain-things/package.json','utf8')); if(root.version!=='0.1.44') throw new Error('root version mismatch'); if(skill.version!=='0.1.0') throw new Error('skill version mismatch'); if(!root.pi.skills?.includes('./extensions/illustrations-to-explain-things/skills')) throw new Error('root pi.skills missing skill'); for (const file of ['docs/release-notes-v0.1.44.md','docs/github-release-v0.1.44.md','docs/announcement-v0.1.44.md','docs/publish-checklist-v0.1.44.md','extensions/illustrations-to-explain-things/skills/illustrations-to-explain-things/SKILL.md']) fs.accessSync(file);"
```

- [x] verify whitespace and patch formatting

```bash
git diff --check
```

- [x] run npm audit

```bash
npm audit --audit-level=high
```

## Package sanity

- [x] root collection package includes the new skill package and Pi `0.78.0` marker

```bash
npm pack --dry-run --json
```

- [x] standalone `illustrations-to-explain-things` package includes skill files and Pi `0.78.0` marker

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-illustrations-to-explain-things
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-illustrations-to-explain-things`

## Commit and tag

- [x] commit changes with a short imperative subject
- [x] create tag: `v0.1.44`

```bash
git add .
git commit -m "Prepare v0.1.44 release"
git tag v0.1.44
```

## Push and GitHub release

- [x] push commit and tag

```bash
git push origin HEAD:main
git push origin v0.1.44
```

- [x] create GitHub release for `v0.1.44`
- [x] paste contents of `docs/github-release-v0.1.44.md`

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [ ] human publishes root package

```bash
npm publish
```

- [ ] human publishes standalone `illustrations-to-explain-things` package

```bash
npm publish --workspace @diegopetrucci/pi-illustrations-to-explain-things
```

## Post-publish validation

- [ ] wait 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [ ] verify npm package pages show expected versions for the root and standalone packages
- [ ] test install from npm

```bash
pi install npm:@diegopetrucci/pi-extensions
pi install npm:@diegopetrucci/pi-illustrations-to-explain-things
```

- [ ] reload pi and confirm the skill loads when installed standalone
- [ ] publish announcement copy from `docs/announcement-v0.1.44.md`
