## Preflight

- [x] confirm `v0.1.47` tag and GitHub release do not already exist
- [x] confirm branch is `main` and is even with `origin/main` before release changes
- [x] create release docs
  - [x] `docs/release-notes-v0.1.47.md`
  - [x] `docs/github-release-v0.1.47.md`
  - [x] `docs/announcement-v0.1.47.md`
  - [x] `docs/publish-checklist-v0.1.47.md`
- [x] bump package versions
  - [x] `@diegopetrucci/pi-extensions@0.1.47`
  - [x] `@diegopetrucci/pi-brrr@0.1.3`
  - [x] `@diegopetrucci/pi-notify@0.1.6`
  - [x] `@diegopetrucci/pi-minimal-footer@0.1.9`
  - [x] `@diegopetrucci/pi-openai-fast@0.1.5`
  - [x] `@diegopetrucci/pi-claude-fast@0.1.3`
  - [x] `@diegopetrucci/pi-review@0.1.3`
- [x] refresh dependencies

```bash
npm ci
```

- [x] run install-state preflight

```bash
npm run preflight:install-state
```

- [x] run full CI script

```bash
npm run ci
```

- [x] verify package JSON files, lockfile versions, release docs, and trust-gating markers

```bash
node - <<'NODE'
const fs=require('fs');
const expect={
 'package.json':'0.1.47',
 'extensions/brrr/package.json':'0.1.3',
 'extensions/notify/package.json':'0.1.6',
 'extensions/minimal-footer/package.json':'0.1.9',
 'extensions/openai-fast/package.json':'0.1.5',
 'extensions/claude-fast/package.json':'0.1.3',
 'extensions/review/package.json':'0.1.3',
};
for (const [file, version] of Object.entries(expect)) {
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if (data.version!==version) throw new Error(`${file} expected ${version} got ${data.version}`);
}
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
if (lock.version!=='0.1.47'||lock.packages[''].version!=='0.1.47') throw new Error('lock root version mismatch');
for (const [file, version] of Object.entries(expect)) {
 if (file==='package.json') continue;
 const key=file.replace('/package.json','');
 if (lock.packages[key].version!==version) throw new Error(`${key} lock expected ${version} got ${lock.packages[key].version}`);
}
for (const file of ['docs/release-notes-v0.1.47.md','docs/github-release-v0.1.47.md','docs/announcement-v0.1.47.md','docs/publish-checklist-v0.1.47.md']) fs.accessSync(file);
for (const file of ['extensions/brrr/index.ts','extensions/notify/index.ts','extensions/minimal-footer/index.ts','extensions/openai-fast/index.ts','extensions/claude-fast/index.ts','extensions/review/index.ts']) {
 const text=fs.readFileSync(file,'utf8');
 if (!text.includes('canReadProjectConfig')) throw new Error(`${file} missing canReadProjectConfig`);
 if (!text.includes('isProjectTrusted')) throw new Error(`${file} missing isProjectTrusted`);
}
console.log('version and trust-gating metadata ok');
NODE
```

- [x] smoke-test affected extension loading with Pi `0.79.9`

```bash
pi --version
for ext in brrr notify minimal-footer openai-fast claude-fast review; do
  PI_OFFLINE=1 pi --no-extensions --extension "./extensions/$ext/index.ts" --list-models smoke
 done
```

- [x] verify whitespace/patch formatting

```bash
git diff --check
```

## Package dry-runs

- [x] root collection package dry-run

```bash
npm pack --dry-run --json
```

- [x] affected standalone package dry-runs

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-brrr
npm pack --dry-run --json --workspace @diegopetrucci/pi-notify
npm pack --dry-run --json --workspace @diegopetrucci/pi-minimal-footer
npm pack --dry-run --json --workspace @diegopetrucci/pi-openai-fast
npm pack --dry-run --json --workspace @diegopetrucci/pi-claude-fast
npm pack --dry-run --json --workspace @diegopetrucci/pi-review
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-brrr`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-notify`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-minimal-footer`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-openai-fast`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-claude-fast`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-review`

## Commit and tag

- [x] commit release changes

```bash
git add .
git commit -m "Prepare v0.1.47 release"
```

- [x] create tag

```bash
git tag v0.1.47
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin main
git push origin v0.1.47
```

- [x] create GitHub release for `v0.1.47`
- [x] paste contents of `docs/github-release-v0.1.47.md`
- [x] verify the rendered GitHub release uses a descriptive title, starts with the summary, and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [ ] publish root collection package manually

```bash
npm publish
```

- [ ] publish affected standalone packages manually

```bash
npm publish --workspace @diegopetrucci/pi-brrr
npm publish --workspace @diegopetrucci/pi-notify
npm publish --workspace @diegopetrucci/pi-minimal-footer
npm publish --workspace @diegopetrucci/pi-openai-fast
npm publish --workspace @diegopetrucci/pi-claude-fast
npm publish --workspace @diegopetrucci/pi-review
```

## Post-publish validation

- [ ] wait 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [ ] verify npm registry state for root and affected standalone packages
- [ ] verify install/package pages after npm propagation
