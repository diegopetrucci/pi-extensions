# Publish checklist — v0.1.55

## Release scope

- [x] add `code-reviewer` to the root collection package
- [x] add standalone package `@diegopetrucci/pi-code-reviewer@0.1.0`
- [x] expose read-only `code_reviewer` subagent tool adapted from TLH code-reviewer priorities
- [x] add contrarian-style reviewer model selection with ordered fallback through available models
- [x] report the final reviewer model and effective/clamped thinking level in run details
- [x] add runtime guard coverage for path escapes, shell mutation, git helper/local-file bypasses, and gh side-effecting flags
- [x] add `dynamic-context-pruning` to the root collection package
- [x] add standalone package `pi-dynamic-context-pruning@0.1.0`
- [x] add automatic dedupe, stale error-input pruning, and superseded file-op pruning behind a cache-aware net-benefit gate
- [x] add `/prune` and `/context-pruning` commands for manual pruning, status, stats, and runtime controls
- [x] bump root collection package to `@diegopetrucci/pi-extensions@0.1.55`
- [x] refresh `package-lock.json` for the new workspaces and root version

## Target package versions

- [x] `@diegopetrucci/pi-extensions@0.1.55`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.0`
- [x] `pi-dynamic-context-pruning@0.1.0`

## Preflight and release docs

- [x] confirm local `v0.1.55` tag already exists on the earlier code-reviewer commit and must be moved to current `main` before npm publish
- [ ] confirm or update the GitHub release after GitHub API rate limit resets
- [x] verify npm versions are unpublished for root `0.1.55`, code-reviewer `0.1.0`, and dynamic-context-pruning `0.1.0`
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
npm view pi-dynamic-context-pruning@0.1.0 version --json
```

All three target version checks still returned npm `E404` on 2026-07-09, so the versions appear unpublished.

### Validation commands

```bash
npm ci
npm run preflight:install-state
npm run ci
git diff --check
```

### Validation evidence

- `npm ci` — passed in `10.62s`; added `273` packages and audited `300` packages. Caveat: npm reported `1 moderate severity vulnerability` and pending allow-scripts review notices for `@google/genai`, `glimpseui`, and `protobufjs` variants.
- `npm run preflight:install-state` — passed in `0.19s`; `Package state matches package-lock.json (247 installed packages and 27 local package entries checked).`
- `npm run ci` — passed in `12.34s`; Node reported `431` tests, `0` failures, duration `9462.375209ms`. Caveat: existing `MODULE_TYPELESS_PACKAGE_JSON` warnings were emitted for several extension packages during test execution.
- `git diff --check` — passed in `0.01s` with no whitespace errors.

## Package dry-runs

- [x] root collection package dry-run
- [x] standalone code-reviewer package dry-run
- [x] standalone dynamic-context-pruning package dry-run

```bash
npm pack --dry-run --json
npm pack --dry-run --json --workspace @diegopetrucci/pi-code-reviewer
npm pack --dry-run --json --workspace pi-dynamic-context-pruning
```

### Dry-run evidence

- `npm pack --dry-run --json` — passed in `0.51s`; produced `@diegopetrucci/pi-extensions@0.1.55` with `156` files, tarball size `13,789,759` bytes, unpacked size `14,798,087` bytes, including both `extensions/code-reviewer/*` and `extensions/dynamic-context-pruning/*`.
- `npm pack --dry-run --json --workspace @diegopetrucci/pi-code-reviewer` — passed in `0.16s`; produced `@diegopetrucci/pi-code-reviewer@0.1.0` with `4` files, tarball size `15,858` bytes, unpacked size `56,902` bytes.
- `npm pack --dry-run --json --workspace pi-dynamic-context-pruning` — passed in `0.16s`; produced `pi-dynamic-context-pruning@0.1.0` with `4` files, tarball size `36,011` bytes, unpacked size `128,809` bytes.

## Publish dry-runs

- [x] `npm publish --dry-run --access public`
- [x] `npm publish --dry-run --access public --workspace @diegopetrucci/pi-code-reviewer`
- [x] `npm publish --dry-run --access public --workspace pi-dynamic-context-pruning`

### Publish dry-run evidence

- `npm publish --dry-run --access public` — passed in `1.45s`; npm would publish `@diegopetrucci/pi-extensions@0.1.55` with `156` files, package size `13.8 MB`, unpacked size `14.8 MB`.
- `npm publish --dry-run --access public --workspace @diegopetrucci/pi-code-reviewer` — passed in `0.91s`; npm would publish `@diegopetrucci/pi-code-reviewer@0.1.0` with `4` files, package size `15.9 kB`, unpacked size `56.9 kB`.
- `npm publish --dry-run --access public --workspace pi-dynamic-context-pruning` — passed in `0.88s`; npm would publish `pi-dynamic-context-pruning@0.1.0` with `4` files, package size `36.0 kB`, unpacked size `128.8 kB`.

## Commit, pull request, tag, and GitHub release

- [ ] commit release changes on non-main branch (current branch: `release-v0.1.55`)
- [ ] push branch `release-v0.1.55`
- [ ] open PR targeting `main`
- [ ] after PR merge, move/update tag `v0.1.55` on `main` before npm publish
- [ ] force-push updated tag `v0.1.55`
- [ ] update the existing GitHub release using `docs/github-release-v0.1.55.md`

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

- [ ] human publishes standalone dynamic-context-pruning package

```bash
npm publish --workspace pi-dynamic-context-pruning --access public
```

## Post-publish validation

- [ ] wait 5 minutes after npm publishing completes
- [ ] verify npm registry/package pages show expected versions
- [ ] install validation after npm propagation

```bash
npm view @diegopetrucci/pi-extensions@0.1.55 name version dist.tarball --json
npm view @diegopetrucci/pi-code-reviewer@0.1.0 name version dist.tarball --json
npm view pi-dynamic-context-pruning@0.1.0 name version dist.tarball --json
npm install --ignore-scripts --no-audit --no-fund @diegopetrucci/pi-extensions@0.1.55 @diegopetrucci/pi-code-reviewer@0.1.0 pi-dynamic-context-pruning@0.1.0
```

## Announcement

- [ ] publish announcement copy from `docs/announcement-v0.1.55.md`
