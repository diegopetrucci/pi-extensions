# Publish checklist — v0.1.57

## Release scope

- [x] package the audited support-gap batch as v0.1.57
- [x] add GPT-5.6 Codex Fast coverage in `openai-fast` for `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`
- [x] switch affected extensions to Pi runtime `CONFIG_DIR_NAME` compatibility instead of hardcoded `.pi` config/report paths
- [x] refresh `oracle`, `contrarian`, and `code-reviewer` provider/model preference rankings plus drift coverage
- [x] expand `permission-gate` to guard dangerous `write` and `edit` targets on protected paths
- [x] carry the dependency/audit cleanup for the audited batch, including `@tailwindcss/browser` and protobuf metadata alignment
- [x] bump root collection package to `@diegopetrucci/pi-extensions@0.1.57`
- [x] patch-bump only the changed standalone workspace packages
- [x] refresh `package-lock.json` local package versions

## Target package versions

- [x] `@diegopetrucci/pi-extensions@0.1.57`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.4`
- [x] `@diegopetrucci/pi-brrr@0.1.7`
- [x] `@diegopetrucci/pi-claude-fast@0.1.7`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.2`
- [x] `@diegopetrucci/pi-context-inspector@0.1.6`
- [x] `@diegopetrucci/pi-contrarian@0.1.4`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.14`
- [x] `@diegopetrucci/pi-notify@0.1.10`
- [x] `@diegopetrucci/pi-openai-fast@0.1.9`
- [x] `@diegopetrucci/pi-oracle@0.1.19`
- [x] `@diegopetrucci/pi-permission-gate@0.1.7`
- [x] `@diegopetrucci/pi-review@0.1.7`

## Preflight and release docs

- [x] create release docs
  - [x] `docs/release-notes-v0.1.57.md`
  - [x] `docs/github-release-v0.1.57.md`
  - [x] `docs/announcement-v0.1.57.md`
  - [x] `docs/publish-checklist-v0.1.57.md`
- [x] verify root/changed-workspace manifest versions and lockfile local versions agree
- [x] confirm no staged files were introduced during release prep
- [x] run clean-install, CI, audit, diff, unpublished-version, and pack/publish dry-run validation for the root package plus all 12 changed standalone packages
- [x] confirm dry-runs did not create tarballs or introduce ticket/release-doc artifacts into publishable contents

## Completed validation

### Validation commands

Executed in this order for `pe-g24v`:

```bash
npm ci
npm run preflight:install-state
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const targets = new Map([
  ['annotate-git-diff', '0.1.4'],
  ['brrr', '0.1.7'],
  ['claude-fast', '0.1.7'],
  ['code-reviewer', '0.1.2'],
  ['context-inspector', '0.1.6'],
  ['contrarian', '0.1.4'],
  ['minimal-footer', '0.1.14'],
  ['notify', '0.1.10'],
  ['openai-fast', '0.1.9'],
  ['oracle', '0.1.19'],
  ['permission-gate', '0.1.7'],
  ['review', '0.1.7'],
]);
const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const failures = [];
if (root.version !== '0.1.57') failures.push(`root package.json version ${root.version}`);
if (lock.version !== '0.1.57') failures.push(`package-lock top-level version ${lock.version}`);
if (lock.packages['']?.version !== '0.1.57') failures.push(`package-lock root package version ${lock.packages['']?.version}`);
for (const [dir, expected] of targets) {
  const pkg = JSON.parse(fs.readFileSync(path.join('extensions', dir, 'package.json'), 'utf8'));
  if (pkg.version !== expected) failures.push(`${pkg.name} manifest version ${pkg.version}`);
  const lockEntry = lock.packages[`extensions/${dir}`];
  if (!lockEntry) failures.push(`missing lock entry for ${dir}`);
  else if (lockEntry.version !== expected) failures.push(`${pkg.name} lock version ${lockEntry.version}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Version metadata is consistent for the root package, changed workspaces, and package-lock local entries.');
NODE
npm run ci
npm audit --omit=dev
git diff --check
git diff --cached --name-only
node - <<'NODE'
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const targets = [
  '.',
  'extensions/annotate-git-diff',
  'extensions/brrr',
  'extensions/claude-fast',
  'extensions/code-reviewer',
  'extensions/context-inspector',
  'extensions/contrarian',
  'extensions/minimal-footer',
  'extensions/notify',
  'extensions/openai-fast',
  'extensions/oracle',
  'extensions/permission-gate',
  'extensions/review',
];
let failed = false;
for (const dir of targets) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const spec = `${pkg.name}@${pkg.version}`;
  try {
    const out = execFileSync('npm', ['view', spec, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    console.log(`${spec} PUBLISHED ${out}`);
    failed = true;
  } catch (error) {
    const stderr = (error.stderr || '').toString();
    if (/E404/.test(stderr) || /is not in this registry/.test(stderr)) console.log(`${spec} UNPUBLISHED`);
    else throw error;
  }
}
if (failed) process.exit(1);
NODE
tmpdir=$(mktemp -d)
packages=(
  .
  extensions/annotate-git-diff
  extensions/brrr
  extensions/claude-fast
  extensions/code-reviewer
  extensions/context-inspector
  extensions/contrarian
  extensions/minimal-footer
  extensions/notify
  extensions/openai-fast
  extensions/oracle
  extensions/permission-gate
  extensions/review
)
for pkgdir in "${packages[@]}"; do
  slug=${pkgdir//\//__}
  (cd "$pkgdir" && npm pack --dry-run --json > "$tmpdir/$slug-pack.json")
  (cd "$pkgdir" && npm publish --dry-run --access public > "$tmpdir/$slug-publish.txt" 2>&1)
done
node - "$tmpdir" <<'NODE'
const fs = require('fs');
const path = require('path');
const tmpdir = process.argv[2];
for (const name of fs.readdirSync(tmpdir).filter(n => n.endsWith('-pack.json')).sort()) {
  const slug = name.slice(0, -'-pack.json'.length);
  const pack = JSON.parse(fs.readFileSync(path.join(tmpdir, name), 'utf8'))[0];
  const publishText = fs.readFileSync(path.join(tmpdir, `${slug}-publish.txt`), 'utf8');
  const suspicious = pack.files
    .map(f => f.path)
    .filter(p => /(^|\/)(\.tickets|docs\/publish-checklist|docs\/github-release|docs\/release-notes|docs\/announcement|.*\.tgz)$/.test(p));
  const publishOk = /\+\s+[^\s]+@\S+/.test(publishText) || /Publishing to https:\/\/registry\.npmjs\.org\//.test(publishText);
  console.log(`${slug}: pack=${pack.filename} files=${pack.files.length} size=${pack.size} unpacked=${pack.unpackedSize} suspicious=${suspicious.length} publishDryRun=${publishOk ? 'ok' : 'check'}`);
  if (suspicious.length) console.log(`  suspicious-files: ${suspicious.join(', ')}`);
}
NODE
find . -name '*.tgz' -o -name '*.npmrc' | sort
```

### Validation evidence

- `npm ci` — passed; reinstalled dependencies cleanly, audited 300 packages with `found 0 vulnerabilities`, and only emitted expected warnings about pending allowed install scripts for `@google/genai`, `glimpseui`, and `protobufjs`
- `npm run preflight:install-state` — passed; `Package state matches package-lock.json (247 installed packages and 27 local package entries checked).`
- version-consistency script — passed; root `package.json`, the 12 changed standalone workspace manifests, and matching `package-lock.json` local package entries all match the v0.1.57 targets
- focused tests — no separate focused test command was needed because `npm run ci` already covered the touched packages and publish-safety checks
- `npm run ci` — passed; 454/454 tests passed, including publishability coverage (`root package pack output excludes repo-only extension scripts and docs directories`, `publishable package files allowlists include declared runtime files`); Node emitted existing `MODULE_TYPELESS_PACKAGE_JSON` warnings for several TypeScript workspace packages, but the suite completed successfully
- `npm audit --omit=dev` — passed with `found 0 vulnerabilities`
- `git diff --check` — passed with no output
- `git diff --cached --name-only` — passed with no output, so there are still no staged files
- unpublished npm checks — passed; all 13 target versions returned `UNPUBLISHED` from exact `npm view <name>@<version> version` checks
- `npm pack --dry-run --json` and `npm publish --dry-run --access public` — passed for the root collection package plus all 12 changed standalone packages; every publish dry-run reached the npm public registry dry-run path successfully and every pack dry-run reported `suspicious=0`
- artifact check — `find . -name '*.tgz' -o -name '*.npmrc' | sort` produced no output after the dry-runs, so no tarballs or npm-pack artifacts were left behind

### Dry-run package contents review

| Package | Result |
| --- | --- |
| `@diegopetrucci/pi-extensions@0.1.57` | `npm pack --dry-run --json` reported `156` files, `13792297` byte tarball size, `14808545` byte unpacked size; contents were the expected root runtime bundle: `LICENSE`, `README.md`, preview assets, `.pi-fleet-tested-version`, and the publishable extension runtime files only |
| `@diegopetrucci/pi-annotate-git-diff@0.1.4` | `14` files; runtime TS sources, README, metadata, and web assets only |
| `@diegopetrucci/pi-brrr@0.1.7` | `5` files; `.pi-fleet-tested-version`, `README.md`, `brrr.example.json`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-claude-fast@0.1.7` | `5` files; `.pi-fleet-tested-version`, `README.md`, `claude-fast.example.json`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-code-reviewer@0.1.2` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-context-inspector@0.1.6` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-contrarian@0.1.4` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-minimal-footer@0.1.14` | `6` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `minimal-footer.example.json`, `openai-usage.ts`, `package.json` |
| `@diegopetrucci/pi-notify@0.1.10` | `5` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `notify.example.json`, `package.json` |
| `@diegopetrucci/pi-openai-fast@0.1.9` | `5` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `openai-fast.example.json`, `package.json` |
| `@diegopetrucci/pi-oracle@0.1.19` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-permission-gate@0.1.7` | `4` files; `.pi-fleet-tested-version`, `README.md`, `index.ts`, `package.json` |
| `@diegopetrucci/pi-review@0.1.7` | `5` files; `.pi-fleet-tested-version`, `LICENSE`, `README.md`, `index.ts`, `package.json` |

No dry-run package file list included `.tickets/`, release-doc files under `docs/`, staged-only content, or any `*.tgz` artifact path.

## Commit, PR, tag, release, and publish steps still pending

### Commit, tag, push, publish, and GitHub release

- [ ] commit release changes on a non-`main` branch
- [ ] push the release-prep branch
- [ ] open PR targeting `main`
- [ ] after PR merge, tag `v0.1.57` on `main`
- [ ] push tag `v0.1.57`
- [ ] create the GitHub release using `docs/github-release-v0.1.57.md`

### Stop before npm publish

> Human-only: npm publishing depends on the authenticated npm session. Stop before running any `npm publish` command.

- [ ] human publishes root collection package
- [ ] human publishes changed standalone packages

### Post-publish validation

- [ ] wait 5 minutes after npm publishing completes
- [ ] verify npm registry/package pages show expected versions
- [ ] run install validation after npm propagation

## Announcement

- [ ] publish announcement copy from `docs/announcement-v0.1.57.md`
