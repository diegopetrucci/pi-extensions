# Publish checklist — v0.1.55

## Release scope

- [x] add `code-reviewer` to the root collection package
- [x] add new standalone package `@diegopetrucci/pi-code-reviewer@0.1.0`
- [x] expose read-only `code_reviewer` subagent tool adapted from TLH code-reviewer priorities
- [x] add runtime guard coverage for path escapes, shell mutation, git helper/local-file bypasses, and gh side-effecting flags
- [x] bump root collection package to `@diegopetrucci/pi-extensions@0.1.55`
- [x] refresh `package-lock.json` for the new workspace and root version

## Target package versions

- [x] `@diegopetrucci/pi-extensions@0.1.55`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.0`

## Preflight and release docs

- [x] confirm `v0.1.55` tag and GitHub release do not already exist
- [x] verify npm versions are unpublished for root `0.1.55` and code-reviewer `0.1.0`
- [x] create release docs
  - [x] `docs/release-notes-v0.1.55.md`
  - [x] `docs/github-release-v0.1.55.md`
  - [x] `docs/announcement-v0.1.55.md`
  - [x] `docs/publish-checklist-v0.1.55.md`
- [x] refresh dependencies with `npm ci`
- [x] run install-state preflight after dependency refresh
- [x] run local validation and smoke tests

### npm unpublished checks

```bash
npm view @diegopetrucci/pi-extensions@0.1.55 version --json
npm view @diegopetrucci/pi-code-reviewer@0.1.0 version --json
```

Both target version checks returned npm `E404` before release prep.

### Validation commands

```bash
npm ci
npm run preflight:install-state
npx tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck extensions/code-reviewer/index.ts
node --test test/code-reviewer-runtime.test.mjs
npm run ci
git diff --check
```

### Validation evidence

- `npm ci` — passed; added `272` packages and audited `298` packages.
- `npm run preflight:install-state` — passed; `Package state matches package-lock.json (247 installed packages and 26 local package entries checked).`
- focused `npx tsc ... extensions/code-reviewer/index.ts` — passed.
- `node --test test/code-reviewer-runtime.test.mjs` — passed; `9` tests, `0` failures.
- `npm run ci` — passed; `230` tests, `0` failures, duration `7324.631834ms`.

## Package dry-runs

- [x] root collection package dry-run
- [x] standalone code-reviewer package dry-run

```bash
npm pack --dry-run --json
npm pack --dry-run --json --workspace @diegopetrucci/pi-code-reviewer
```

### Dry-run evidence

- `npm pack --dry-run --json` — passed; `diegopetrucci-pi-extensions-0.1.55.tgz` (`152` files, `14654798` bytes unpacked).
- `npm pack --dry-run --json --workspace @diegopetrucci/pi-code-reviewer` — passed; `diegopetrucci-pi-code-reviewer-0.1.0.tgz` (`4` files, `43039` bytes unpacked).

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-code-reviewer`

## Commit, pull request, tag, and GitHub release

- [ ] commit release changes on non-main branch (current branch: `add-code-reviewer-extension`)
- [ ] push branch `add-code-reviewer-extension`
- [ ] open PR targeting `main`
- [ ] after PR merge, tag `v0.1.55` on `main`
- [ ] push tag `v0.1.55`
- [ ] create GitHub release using `docs/github-release-v0.1.55.md`

## Stop before npm publish

> Human-only: npm publishing depends on the authenticated npm session. Stop before running any `npm publish` command. After the user confirms publishing is complete, wait 5 minutes before npm registry/package-page or npm-install validation, because npm propagation can lag.

- [ ] human publishes root collection package

```bash
npm publish --access public
```

- [ ] human publishes standalone code-reviewer package

```bash
npm publish --workspace @diegopetrucci/pi-code-reviewer --access public
```

## Post-publish validation

- [ ] wait 5 minutes after npm publishing completes
- [ ] verify npm registry/package pages show expected versions
- [ ] install validation after npm propagation

```bash
npm view @diegopetrucci/pi-extensions@0.1.55 name version dist.tarball --json
npm view @diegopetrucci/pi-code-reviewer@0.1.0 name version dist.tarball --json
npm install --ignore-scripts --no-audit --no-fund @diegopetrucci/pi-extensions@0.1.55 @diegopetrucci/pi-code-reviewer@0.1.0
```

## Announcement

- [ ] publish announcement copy from `docs/announcement-v0.1.55.md`
