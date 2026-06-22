## Preflight

- [x] confirm `v0.1.48` tag and GitHub release do not already exist
- [x] confirm branch is `main` and is even with `origin/main` before release changes
- [x] create release docs
  - [x] `docs/release-notes-v0.1.48.md`
  - [x] `docs/github-release-v0.1.48.md`
  - [x] `docs/announcement-v0.1.48.md`
  - [x] `docs/publish-checklist-v0.1.48.md`
- [x] bump package versions
  - [x] `@diegopetrucci/pi-extensions@0.1.48`
  - [x] `@diegopetrucci/pi-minimal-footer@0.1.10`
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

- [x] verify package JSON files, lockfile versions, release docs, and minimal-footer marker config

```bash
node - <<'NODE'
const fs=require('fs');
const expect={
 'package.json':'0.1.48',
 'extensions/minimal-footer/package.json':'0.1.10',
};
for (const [file, version] of Object.entries(expect)) {
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if (data.version!==version) throw new Error(`${file} expected ${version} got ${data.version}`);
}
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
if (lock.version!=='0.1.48'||lock.packages[''].version!=='0.1.48') throw new Error('lock root version mismatch');
if (lock.packages['extensions/minimal-footer'].version!=='0.1.10') throw new Error('minimal-footer lock version mismatch');
for (const file of ['docs/release-notes-v0.1.48.md','docs/github-release-v0.1.48.md','docs/announcement-v0.1.48.md','docs/publish-checklist-v0.1.48.md']) fs.accessSync(file);
const index=fs.readFileSync('extensions/minimal-footer/index.ts','utf8');
if (!index.includes('experimentalMarker')) throw new Error('minimal-footer missing experimentalMarker config');
if (!index.includes('process.env.PI_EXPERIMENTAL === "1"')) throw new Error('minimal-footer missing PI_EXPERIMENTAL check');
if (index.includes('cacheHit') || index.includes('cache-hit')) throw new Error('minimal-footer unexpectedly added cache-hit display');
const example=JSON.parse(fs.readFileSync('extensions/minimal-footer/minimal-footer.example.json','utf8'));
if (example.experimentalMarker?.label!=='xp') throw new Error('example missing xp marker');
console.log('version and minimal-footer marker metadata ok');
NODE
```

- [x] smoke-test affected extension loading with Pi `0.79.5`

```bash
PI_OFFLINE=1 pi --no-extensions --extension "./extensions/minimal-footer/index.ts" --list-models smoke
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

- [x] affected standalone package dry-run

```bash
npm pack --dry-run --json --workspace @diegopetrucci/pi-minimal-footer
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-minimal-footer`

## Commit and tag

- [x] commit release changes

```bash
git add .
git commit -m "Prepare v0.1.48 release"
```

- [x] create tag

```bash
git tag v0.1.48
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin main
git push origin v0.1.48
```

- [x] create GitHub release for `v0.1.48`
- [x] paste contents of `docs/github-release-v0.1.48.md`
- [x] verify the rendered GitHub release uses a descriptive title, starts with the summary, and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [ ] publish root collection package manually

```bash
npm publish
```

- [ ] publish affected standalone package manually

```bash
npm publish --workspace @diegopetrucci/pi-minimal-footer
```

## Post-publish validation

- [ ] waited 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [ ] verified npm registry state for root and affected standalone packages
- [ ] verified install/package pages after npm propagation

Post-publish validation commands to run:

```bash
npm view @diegopetrucci/pi-extensions@0.1.48 name version dist.tarball --json
npm view @diegopetrucci/pi-minimal-footer@0.1.10 name version dist.tarball --json
npm install --ignore-scripts --no-audit --no-fund @diegopetrucci/pi-extensions@0.1.48 @diegopetrucci/pi-minimal-footer@0.1.10
```
