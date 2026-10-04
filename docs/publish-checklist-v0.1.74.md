# Publish checklist — v0.1.74

## Scope

- The unified `fast` extension enables OpenAI Codex Fast mode for `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, and `gpt-6-luna`.
- Eligible ChatGPT OAuth Codex requests use `service_tier: "priority"` when Fast mode is active; API-key authentication remains excluded and existing service-tier fields are preserved.
- Codex Fast availability depends on plan, client, workspace settings, and rollout; local eligibility is not live-provider certification.
- Fleet markers are unchanged; this release claims no new compatibility certification.

## Target package versions

- [x] `@diegopetrucci/pi-fast@0.1.6`
- [x] `@diegopetrucci/pi-extensions@0.1.74`

## Validation evidence

- [x] Release preparation `npm ci` passed before local checks; no dependency remediation was applied
- [x] `npm run preflight:install-state` passed with 240 installed packages and 28 local package entries checked
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.74-input.json` passed in dry-run mode and selected exactly the two target packages in dependency order, with no scope mismatch
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.74-input.json --write` passed; both manifests and matching lock metadata were updated and all four v0.1.74 documents were created without changing fleet markers
- [x] `node --test test/fast-extension.test.mjs test/provider-model-preferences-catalog.test.mjs` passed: 154 tests, 154 passed, 0 failed, 0 skipped
- [x] Architect final-validation evidence: `npm ci`, `npm run preflight:install-state`, and `npm run typecheck` passed
- [x] Architect final-validation evidence: the full test suite passed with 842 tests, 841 passed, 0 failed, and 1 skipped
- [x] Architect final-validation evidence: all 28 package dry-runs passed
- [x] `git diff --check` passed
- [x] no staged files (`git diff --cached --name-only` produced no output)
- [x] Raw `npm audit` exited 1 with one high-severity vulnerability at nested `brace-expansion`, associated with `GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, and `GHSA-6j4f-fj2g-mc7p`; this is not a clean audit and no remediation is claimed
- [x] Human approval was recorded to carry forward the existing upstream `brace-expansion` audit exception for v0.1.74; the raw audit remains failed and non-clean, with no remediation or consumer-protection claim

## Public GitHub release

- [ ] Create the GitHub release from `docs/github-release-v0.1.74.md` with the exact public title **GPT-6 Codex Fast mode support**
- [ ] Keep `docs/github-release-v0.1.74.md` as the exact public release body; it starts with a summary and contains no internal title or validation-only prose

## Agent-safe follow-up actions

- [ ] seek explicit approval before creating the release commit
- [ ] commit the release preparation changes on `release/v0.1.74`
- [ ] push the release branch
- [ ] open a pull request from `release/v0.1.74` targeting `main`
- [ ] wait for CI and CodeQL to pass
- [ ] merge the pull request into `main`
- [ ] tag the merged `main` commit as `v0.1.74`
- [ ] push tag `v0.1.74`
- [ ] create a non-draft GitHub release with the exact title **GPT-6 Codex Fast mode support**, using `docs/github-release-v0.1.74.md` as the exact body
- [ ] run `scripts/publish-release.mjs v0.1.74 --dry-run`

## Human-only release actions

- [ ] Keep npm publication human-only: a human must dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] Inspect the verified package plan and approve the protected `npm-release` environment deployment
- [ ] Do not run `npm publish` directly; publishing depends on the human's authenticated npm session

## Undo

To undo these release-only changes, use normal VCS restoration for `package.json`, `extensions/fast/package.json`, `package-lock.json`, and the four new v0.1.74 documents. No fleet marker changes are part of this release.

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.6"],["@diegopetrucci/pi-extensions","0.1.74"]] -->
