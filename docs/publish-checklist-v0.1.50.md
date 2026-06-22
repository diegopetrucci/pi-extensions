# Publish checklist — v0.1.50

## Preflight

- [x] confirm `v0.1.50` tag and GitHub release do not already exist
- [x] confirm branch is `main` and is even with `origin/main` before release changes
- [x] confirm npm versions are unpublished for root `0.1.50` and oracle `0.1.14`
- [x] create release docs
  - [x] `docs/release-notes-v0.1.50.md`
  - [x] `docs/github-release-v0.1.50.md`
  - [x] `docs/announcement-v0.1.50.md`
  - [x] `docs/publish-checklist-v0.1.50.md`
- [x] bump package versions
  - [x] `@diegopetrucci/pi-extensions@0.1.50`
  - [x] `@diegopetrucci/pi-oracle@0.1.14`
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

- [x] verify package JSON files, lockfile versions, release docs, and Oracle model preference markers

```bash
node - <<'NODE'
const fs=require('fs');
const expect={
 'package.json':'0.1.50',
 'extensions/oracle/package.json':'0.1.14',
};
for (const [file, version] of Object.entries(expect)) {
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if (data.version!==version) throw new Error(`${file} expected ${version} got ${data.version}`);
}
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
if (lock.version!=='0.1.50'||lock.packages[''].version!=='0.1.50') throw new Error('lock root version mismatch');
if (lock.packages['extensions/oracle'].version!=='0.1.14') throw new Error('oracle lock version mismatch');
for (const file of ['docs/release-notes-v0.1.50.md','docs/github-release-v0.1.50.md','docs/announcement-v0.1.50.md','docs/publish-checklist-v0.1.50.md']) fs.accessSync(file);
const index=fs.readFileSync('extensions/oracle/index.ts','utf8');
for (const token of ['"kimi-coding": ["k2p7"','MiniMax-M3','glm-5.2','"ant-ling"','nvidia: [','"zai-coding-cn"']) {
 if (!index.includes(token)) throw new Error('missing oracle preference marker '+token);
}
const gh=fs.readFileSync('docs/github-release-v0.1.50.md','utf8');
if (gh.startsWith('#')) throw new Error('GitHub release body should not start with an internal title');
console.log('version and oracle preference metadata ok');
NODE
```

- [x] verify refreshed top-pick patterns against the installed Pi model catalog

```bash
node - <<'NODE'
const path = require('node:path');
const { MODELS } = require(path.join(process.cwd(), 'node_modules/@earendil-works/pi-ai/dist/models.generated.js'));
const expected = {
  'ant-ling': 'Ling-2.6-1T',
  'cloudflare-workers-ai': '@cf/moonshotai/kimi-k2.7-code',
  'kimi-coding': 'k2p7',
  minimax: 'MiniMax-M3',
  'minimax-cn': 'MiniMax-M3',
  moonshotai: 'kimi-k2.7-code',
  'moonshotai-cn': 'kimi-k2.7-code',
  nvidia: 'nvidia/nemotron-3-ultra-550b-a55b',
  zai: 'glm-5.2',
  'zai-coding-cn': 'glm-5.2',
};
for (const [provider, pattern] of Object.entries(expected)) {
 const models = Object.values(MODELS[provider] ?? {});
 const match = models.find((model) => `${model.id} ${model.name ?? ''}`.toLowerCase().includes(pattern.toLowerCase()));
 if (!match) throw new Error(`${provider} missing ${pattern}`);
}
console.log('oracle preference catalog markers ok');
NODE
```

- [x] smoke-test affected extension loading/config help with Pi offline mode

```bash
tmp=$(mktemp -d)
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/oracle/index.ts -p "/oracle status"
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/oracle/index.ts -p "/oracle thinking low"
PI_CODING_AGENT_DIR="$tmp/agent" PI_OFFLINE=1 pi --no-session --no-extensions --extension ./extensions/oracle/index.ts -p "/oracle model auto"
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
npm pack --dry-run --json --workspace @diegopetrucci/pi-oracle
```

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-oracle`

## Commit and tag

- [x] commit release changes

```bash
git add .
git commit -m "Prepare v0.1.50 release"
```

- [ ] create tag after the release PR merges

```bash
git checkout main
git pull --ff-only
git tag v0.1.50
```

## Pull request, push, and GitHub release

> Recommended order: merge the release PR first, tag the merged `main` commit second, create the GitHub release third, and publish npm packages last. Repository rules require changes to land through a pull request.

- [x] push release branch

```bash
git push origin HEAD:release/v0.1.50
```

- [x] create release PR
- [ ] merge release PR after required checks pass
- [ ] push tag after merge

```bash
git push origin v0.1.50
```

- [ ] create GitHub release for `v0.1.50`
- [ ] paste contents of `docs/github-release-v0.1.50.md`
- [ ] verify the rendered GitHub release uses a descriptive title, starts with the summary, and has no broken links

## Stop before npm publish

> Human-only: stop here before running any `npm publish` command. Ask the authenticated npm publisher to run the publish commands manually. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [ ] publish root collection package manually

```bash
npm publish
```

- [ ] publish affected standalone package manually

```bash
npm publish --workspace @diegopetrucci/pi-oracle
```

## Post-publish validation

- [ ] wait 5 minutes after human npm publish confirmation before checking npm registry/install validation
- [ ] verify npm registry state for root and affected standalone packages
- [ ] verify install/package pages after npm propagation

Post-publish validation commands to run:

```bash
npm view @diegopetrucci/pi-extensions@0.1.50 name version dist.tarball --json
npm view @diegopetrucci/pi-oracle@0.1.14 name version dist.tarball --json
npm install --ignore-scripts --no-audit --no-fund @diegopetrucci/pi-extensions@0.1.50 @diegopetrucci/pi-oracle@0.1.14
```
