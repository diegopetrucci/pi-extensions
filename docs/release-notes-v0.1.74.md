# Release notes — v0.1.74

## Highlights

- The unified `fast` extension now enables OpenAI Codex Fast mode for `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, and `gpt-6-luna`, in addition to the previously supported Codex models.
- When Fast mode is toggled for an eligible OpenAI Codex ChatGPT OAuth session, requests use `service_tier: "priority"`. API-key authentication remains excluded, and existing `service_tier` fields are preserved.
- Codex Fast eligibility reflects the advertised model-list and CLI request shape; plan, client, workspace, and rollout availability remain provider-controlled. No new fleet compatibility certification is claimed.

## Packaging

- `@diegopetrucci/pi-fast@0.1.6`
- `@diegopetrucci/pi-extensions@0.1.74`

## Validation

- `npm ci` passed before local checks; no dependency remediation was applied.
- `npm run preflight:install-state` passed with 240 installed packages and 28 local package entries checked.
- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.74-input.json` passed in dry-run mode and selected exactly `@diegopetrucci/pi-fast@0.1.6` followed by `@diegopetrucci/pi-extensions@0.1.74`; no other packages were selected.
- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.74-input.json --write` passed, updated the two manifests and synchronized `package-lock.json`, and created the four v0.1.74 documents without changing fleet markers.
- `node --test test/fast-extension.test.mjs test/provider-model-preferences-catalog.test.mjs` passed: 154 tests, 154 passed, 0 failed, and 0 skipped.
- Architect final-validation evidence: `npm ci`, `npm run preflight:install-state`, and `npm run typecheck` passed.
- Architect final-validation evidence: the full test suite passed with 842 tests, 841 passed, 0 failed, and 1 skipped.
- Architect final-validation evidence: all 28 package dry-runs passed.
- `git diff --check` passed and no files were staged.
- Raw `npm audit` exited 1 with one high-severity vulnerability at nested `brace-expansion`, associated with `GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, and `GHSA-6j4f-fj2g-mc7p`; this is not a clean audit and no remediation is claimed.
- Human approval was recorded to carry forward the existing upstream `brace-expansion` audit exception for v0.1.74; the raw audit remains failed and non-clean, with no remediation or consumer-protection claim.

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.6"],["@diegopetrucci/pi-extensions","0.1.74"]] -->
