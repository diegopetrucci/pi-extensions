# Publish checklist — v0.1.72

## Scope

- Claude Opus 5.5 (`claude-opus-5-5`) is eligible for Anthropic `anthropic-messages` Fast mode through the unified `fast` extension.
- Eligible requests use `speed: "fast"` and the required `fast-mode-2026-02-01` beta; existing Claude Opus 4.8 and Claude Opus 5 behavior remains supported.
- API-key and Claude Code OAuth access remain supported when the account has the Anthropic Fast-mode research preview.
- All 28 fleet compatibility markers remain at Pi `0.84.4`.

## Target package versions

- [x] `@diegopetrucci/pi-fast@0.1.4`
- [x] `@diegopetrucci/pi-extensions@0.1.72`

## Validation evidence

- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.72-input.json` passed in dry-run mode and selected exactly the two target packages in dependency order
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.72-input.json --write` passed; both manifests and matching lock metadata were updated and all four v0.1.72 documents were created
- [x] `npm run preflight:install-state` passed; 237 installed packages and 28 local package entries were checked
- [x] `npm run typecheck` passed
- [x] `npm test` passed: 729 tests total, 728 passed, 0 failed, 1 skipped
- [x] `node --test test/fast-extension.test.mjs test/fast-extensions-config-status.test.mjs test/provider-model-preferences-catalog.test.mjs` passed: 125 tests, 125 passed, 0 failed, 0 skipped
- [x] `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` passed; production audit found 0 vulnerabilities
- [x] root `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org` passed for `@diegopetrucci/pi-extensions@0.1.72`: 1,292,767 packed bytes, 163 files
- [x] Fast `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org --workspace @diegopetrucci/pi-fast` passed for `@diegopetrucci/pi-fast@0.1.4`: 5,625 packed bytes, 5 files
- [x] `git diff --check` passed
- [x] no staged files
- [x] all 28 fleet markers remain at Pi `0.84.4`
- [x] read-only final validation caused no changes; the repository had only the expected pre-existing release-prep and ticket files

## Agent-safe follow-up actions

- [ ] commit the release preparation changes on `release/v0.1.72`
- [ ] push the release branch
- [ ] open a pull request from `release/v0.1.72` targeting `main`
- [ ] require CI/CodeQL to pass
- [ ] merge the pull request
- [ ] tag `v0.1.72` on merged `main`
- [ ] push tag `v0.1.72`
- [ ] create a non-draft GitHub release titled "Claude Opus 5.5 Fast mode support" using `docs/github-release-v0.1.72.md` as the exact body
- [ ] run `scripts/publish-release.mjs v0.1.72 --dry-run`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

## Post-publish validation

- [ ] after human confirmation, wait five minutes before registry/install validation
- [ ] verify both registry versions, hashes, provenance, and expected `latest` tags
- [ ] perform fresh installs of both released artifacts in clean directories and load them

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.4"],["@diegopetrucci/pi-extensions","0.1.72"]] -->
