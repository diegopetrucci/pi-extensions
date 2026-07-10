# Publish checklist — v0.1.56

## Release scope

- [x] refresh Pi 0.80.6 validated baseline and fleet markers for the collection and standalone packages
- [x] prefer GPT-5.6 Sol at high for `code-reviewer`, `oracle`, and `contrarian` on relevant OpenAI/OpenAI Codex auto-selection paths when available, without forcing that selection when other paths win or GPT-5.6 Sol is unavailable
- [x] preserve `max` thinking level support where available and clamp safely when unavailable
- [x] update `notify` and `brrr` to send alerts on `agent_settled`
- [x] preserve Brrr's final assistant-message payload by resolving it from settled session state, with event messages as a fallback
- [x] expand `context-inspector` current-context projection alongside full-branch inspection
- [x] bump root collection package to `@diegopetrucci/pi-extensions@0.1.56`
- [x] patch-bump every standalone workspace package exactly once
- [x] refresh `package-lock.json` local package versions

## Target package versions

- [x] `@diegopetrucci/pi-extensions@0.1.56`
- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.5`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.3`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.3`
- [x] `@diegopetrucci/pi-brrr@0.1.6`
- [x] `@diegopetrucci/pi-claude-fast@0.1.6`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.1`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.6`
- [x] `@diegopetrucci/pi-context-cap@0.1.5`
- [x] `@diegopetrucci/pi-context-inspector@0.1.5`
- [x] `@diegopetrucci/pi-contrarian@0.1.3`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.5`
- [x] `pi-dynamic-context-pruning@0.1.1`
- [x] `@diegopetrucci/pi-git-footer@0.1.4`
- [x] `@diegopetrucci/pi-gnosis@0.1.5`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.3`
- [x] `@diegopetrucci/pi-inline-bash@0.1.5`
- [x] `@diegopetrucci/pi-librarian@0.1.10`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.13`
- [x] `@diegopetrucci/pi-notify@0.1.9`
- [x] `@diegopetrucci/pi-openai-fast@0.1.8`
- [x] `@diegopetrucci/pi-oracle@0.1.18`
- [x] `@diegopetrucci/pi-permission-gate@0.1.6`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.6`
- [x] `@diegopetrucci/pi-review@0.1.6`
- [x] `@diegopetrucci/pi-todo@0.1.5`
- [x] `@diegopetrucci/pi-triage-comments@0.1.6`

## Preflight and release docs

- [x] create release docs
  - [x] `docs/release-notes-v0.1.56.md`
  - [x] `docs/github-release-v0.1.56.md`
  - [x] `docs/announcement-v0.1.56.md`
  - [x] `docs/publish-checklist-v0.1.56.md`
- [x] verify root/workspace manifest versions and lockfile local versions agree
- [x] confirm no staged files were introduced during release prep
- [x] rerun focused review-agent tests, install-state, full CI, whitespace checks, unpublished checks, and the requested package dry-runs for this release-doc refresh

### Validation commands

Executed for this release-doc refresh:

```bash
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const failures = [];
if (root.version !== '0.1.56') failures.push('root package.json version mismatch');
if (lock.version !== '0.1.56') failures.push('package-lock top-level version mismatch');
if (lock.packages['']?.version !== '0.1.56') failures.push('package-lock root package entry mismatch');
for (const dir of fs.readdirSync('extensions')) {
  const pkgPath = path.join('extensions', dir, 'package.json');
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const lockEntry = lock.packages[`extensions/${dir}`];
  if (!lockEntry) failures.push(`missing lock entry for ${dir}`);
  else if (lockEntry.version !== pkg.version) failures.push(`lock mismatch for ${pkg.name}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Version metadata is consistent across root, workspaces, and package-lock.json.');
NODE
git diff --cached --name-only
node --test test/code-reviewer-model-selection.test.mjs test/oracle-model-selection.test.mjs test/contrarian-model-selection.test.mjs
npm ci
npm run preflight:install-state
npm run ci
git diff --check
tmp=$(mktemp)
cat <<'EOF' > "$tmp"
@diegopetrucci/pi-extensions@0.1.56
@diegopetrucci/pi-code-reviewer@0.1.1
@diegopetrucci/pi-oracle@0.1.18
@diegopetrucci/pi-contrarian@0.1.3
EOF
while IFS= read -r spec; do
  echo "### $spec"
  if npm view "$spec" version --json > /tmp/npm-view-out.$$ 2> /tmp/npm-view-err.$$; then
    echo "UNEXPECTED_PUBLISHED $(cat /tmp/npm-view-out.$$)"
    exit 1
  else
    status=$?
    echo "exit=$status"
    cat /tmp/npm-view-err.$$
  fi
  echo
  rm -f /tmp/npm-view-out.$$ /tmp/npm-view-err.$$
done < "$tmp"
for dir in . extensions/code-reviewer extensions/oracle extensions/contrarian; do
  (cd "$dir" && npm pack --dry-run --json)
  (cd "$dir" && npm publish --dry-run --access public)
done
rm -f "$tmp"
git diff --cached --name-only
/usr/bin/find . \( -name '*.tgz' -o -name 'npm-packlist-*' \) -print
```

### Validation evidence

- version-consistency script — passed; root, all standalone workspaces, and `package-lock.json` local package entries match the target release versions
- focused review-agent tests — passed; 25/25 tests passed across `code-reviewer`, `oracle`, and `contrarian` model-selection coverage, including GPT-5.6 Sol preference/high-thinking assertions
- `npm ci` — passed; installed 273 packages in 12s, audited 300 packages, and completed with npm's existing deprecation/vulnerability warnings only
- `npm run preflight:install-state` — passed; `Package state matches package-lock.json (247 installed packages and 27 local package entries checked).`
- `npm run ci` — passed; full typecheck plus full test suite succeeded with 442/442 tests passing in `11644.244333ms`
- `git diff --check` — passed with no output
- `git diff --cached --name-only` — passed with no output before and after the dry-runs, so there are no staged files
- `/usr/bin/find . \( -name '*.tgz' -o -name 'npm-packlist-*' \) -print` — passed with no output, so no tarballs or npm pack temp artifacts were left behind

#### Warnings observed

- `npm ci` emitted two deprecation warnings for `node-domexception@1.0.0`, reported one moderate vulnerability, and reported pending allow-scripts coverage for `@google/genai@1.52.0`, `glimpseui@0.8.1`, `protobufjs@7.6.1`, and `protobufjs@7.6.4`
- `npm run ci` emitted the repository's existing `MODULE_TYPELESS_PACKAGE_JSON` warnings across workspace test runs; validation still passed without test failures
- No requested `npm pack --dry-run --json` or `npm publish --dry-run --access public` command emitted blocking warnings or errors

#### npm unpublished checks (`npm view <pkg>@<version> version --json`)

| Package | npm view result | Evidence |
| --- | --- | --- |
| `@diegopetrucci/pi-extensions@0.1.56` | exit 1 | code E404 ; 404 No match found for version 0.1.56 |
| `@diegopetrucci/pi-code-reviewer@0.1.1` | exit 1 | code E404 ; 404 No match found for version 0.1.1 |
| `@diegopetrucci/pi-oracle@0.1.18` | exit 1 | code E404 ; 404 No match found for version 0.1.18 |
| `@diegopetrucci/pi-contrarian@0.1.3` | exit 1 | code E404 ; 404 No match found for version 0.1.3 |

#### Pack and publish dry-run evidence

| Dir | Package | `npm pack --dry-run --json` | `npm publish --dry-run --access public` |
| --- | --- | --- | --- |
| `.` | `@diegopetrucci/pi-extensions@0.1.56` | 156 files; 13790470 B packed; 14801092 B unpacked; `diegopetrucci-pi-extensions-0.1.56.tgz` | exit 0; 13.8 MB; 14.8 MB; 156 files; `+ @diegopetrucci/pi-extensions@0.1.56` |
| `extensions/code-reviewer` | `@diegopetrucci/pi-code-reviewer@0.1.1` | 4 files; 15917 B packed; 57137 B unpacked; `diegopetrucci-pi-code-reviewer-0.1.1.tgz` | exit 0; 15.9 kB; 57.1 kB; 4 files; `+ @diegopetrucci/pi-code-reviewer@0.1.1` |
| `extensions/oracle` | `@diegopetrucci/pi-oracle@0.1.18` | 4 files; 15503 B packed; 56354 B unpacked; `diegopetrucci-pi-oracle-0.1.18.tgz` | exit 0; 15.5 kB; 56.4 kB; 4 files; `+ @diegopetrucci/pi-oracle@0.1.18` |
| `extensions/contrarian` | `@diegopetrucci/pi-contrarian@0.1.3` | 4 files; 16215 B packed; 61178 B unpacked; `diegopetrucci-pi-contrarian-0.1.3.tgz` | exit 0; 16.2 kB; 61.2 kB; 4 files; `+ @diegopetrucci/pi-contrarian@0.1.3` |

## Commit, tag, push, publish, and GitHub release

- [ ] commit release changes on a non-`main` branch
- [ ] push the release-prep branch
- [ ] open PR targeting `main`
- [ ] after PR merge, tag `v0.1.56` on `main`
- [ ] push tag `v0.1.56`
- [ ] create the GitHub release using `docs/github-release-v0.1.56.md`

## Stop before npm publish

> Human-only: npm publishing depends on the authenticated npm session. Stop before running any `npm publish` command.

- [ ] human publishes root collection package
- [ ] human publishes standalone packages

## Post-publish validation

- [ ] wait 5 minutes after npm publishing completes
- [ ] verify npm registry/package pages show expected versions
- [ ] run install validation after npm propagation

## Announcement

- [ ] publish announcement copy from `docs/announcement-v0.1.56.md`
