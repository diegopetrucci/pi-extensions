# Publish checklist — v0.1.49

## Preflight

- [x] confirm `v0.1.49` tag and GitHub release do not already exist
- [x] confirm branch is `main` and is even with `origin/main` before release changes
- [x] confirm npm versions are unpublished for root `0.1.49` and librarian `0.1.6`
- [x] create release docs
  - [x] `docs/release-notes-v0.1.49.md`
  - [x] `docs/github-release-v0.1.49.md`
  - [x] `docs/announcement-v0.1.49.md`
  - [x] `docs/publish-checklist-v0.1.49.md`
- [x] bump package versions
  - [x] `@diegopetrucci/pi-extensions@0.1.49`
  - [x] `@diegopetrucci/pi-librarian@0.1.6`
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

- [x] verify package JSON files, lockfile versions, release docs, and librarian fast defaults

```bash
node - <<'NODE'
const fs=require('fs');
const expect={
 'package.json':'0.1.49',
 'extensions/librarian/package.json':'0.1.6',
};
for (const [file, version] of Object.entries(expect)) {
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if (data.version!==version) throw new Error(`${file} expected ${version} got ${data.version}`);
}
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
if (lock.version!=='0.1.49'||lock.packages[''].version!=='0.1.49') throw new Error('lock root version mismatch');
if (lock.packages['extensions/librarian'].version!=='0.1.6') throw new Error('librarian lock version mismatch');
for (const file of ['docs/release-notes-v0.1.49.md','docs/github-release-v0.1.49.md','docs/announcement-v0.1.49.md','docs/publish-checklist-v0.1.49.md']) fs.accessSync(file);
const index=fs.readFileSync('extensions/librarian/index.ts','utf8');
if (!index.includes('const DEFAULT_THINKING_LEVEL: ThinkingLevel = "low"')) throw new Error('librarian default thinking is not low');
if (index.includes('Using the caller')) throw new Error('librarian still contains current-model inheritance reason');
if (!index.includes('model=current is no longer supported')) throw new Error('librarian missing model=current rejection');
if (!index.includes('Prefer fast, parallel exploration')) throw new Error('librarian missing parallel exploration prompt');
if (!index.includes('Selected a preferred fast Librarian model')) throw new Error('librarian missing fast model selection reason');
const gh=fs.readFileSync('docs/github-release-v0.1.49.md','utf8');
if (gh.startsWith('#')) throw new Error('GitHub release body should not start with an internal title');
console.log('version and librarian fast-default metadata ok');
NODE
```

- [x] smoke-test affected extension loading/config help with Pi offline mode

```bash
tmp=$(mktemp -d)
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/librarian/index.ts -p "/librarian-config status"
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/librarian/index.ts -p "/librarian-config model current"
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/librarian/index.ts -p "/librarian-config thinking low"
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
npm pack --dry-run --json --workspace @diegopetrucci/pi-librarian
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-librarian`

## Commit and tag

- [x] commit release changes

```bash
git add .
git commit -m "Prepare v0.1.49 release"
```

- [x] create tag

```bash
git tag v0.1.49
```

## Push and GitHub release

> Recommended order: push the commit and tag first, create the GitHub release second, and publish npm packages last. That keeps the published npm versions aligned with a public commit and tag.

- [x] push commit and tag

```bash
git push origin main
git push origin v0.1.49
```

- [x] create GitHub release for `v0.1.49`
- [x] paste contents of `docs/github-release-v0.1.49.md`
- [x] verify the rendered GitHub release uses a descriptive title, starts with the summary, and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [x] publish root collection package manually

```bash
npm publish
```

- [x] publish affected standalone package manually

```bash
npm publish --workspace @diegopetrucci/pi-librarian
```

## Post-publish validation

- [x] waited 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [x] verified npm registry state for root and affected standalone packages
- [x] verified install/package pages after npm propagation

Post-publish validation commands to run:

```bash
npm view @diegopetrucci/pi-extensions@0.1.49 name version dist.tarball --json
npm view @diegopetrucci/pi-librarian@0.1.6 name version dist.tarball --json
npm install --ignore-scripts --no-audit --no-fund @diegopetrucci/pi-extensions@0.1.49 @diegopetrucci/pi-librarian@0.1.6
```
