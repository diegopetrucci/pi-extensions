# Publish checklist — v0.1.88

## Status and scope

**Not yet published.** Preparation started 2026-11-22 from `ed14ffc` (`origin/main`) on `release/v0.1.88-prep`; nothing below is complete until its box is checked. Seven packages are selected (`code-reviewer`, `contrarian`, `fast`, `oracle`, `quiet-tools`, `review`, and the umbrella root).

Proposed public title: **Pi 1.6.0 compatibility and GPT-6.2 Fast mode**.

The Pi development baseline is 1.6.0 (`docs/pi-1.6.0-validation.md`); no fleet markers change and no fleet certification is claimed. Contributor audit of `v0.1.87..ed14ffc`: only repository-owner commits plus The Last Harness co-author trailer, so no `## Contributors` section.

## Target package versions

- [ ] `@diegopetrucci/pi-code-reviewer@0.1.21`
- [ ] `@diegopetrucci/pi-contrarian@0.1.24`
- [ ] `@diegopetrucci/pi-fast@0.1.14`
- [ ] `@diegopetrucci/pi-oracle@0.1.39`
- [ ] `@diegopetrucci/pi-quiet-tools@0.1.18`
- [ ] `@diegopetrucci/pi-review@0.1.19`
- [ ] `@diegopetrucci/pi-extensions@0.1.88`

## Validation evidence

- [x] `npm ci` and `npm run preflight:install-state` passed.
- [x] `npm run ci` passed: 1,532 tests, **0 failed, 2 skipped**.
- [x] The `prepare-release` dry-run re-run reported 7 packages with changelog action `keep` and 4 documents preserved.
- [x] `npm pack --dry-run --workspaces --include-workspace-root --ignore-scripts` passed.
- [x] `git diff --check` passed.
- [x] Changelog placeholders replaced in each package CHANGELOG.md.
- [x] No staged files.

## Agent-safe follow-up actions

- [ ] obtain explicit user approval before any commit-creating command, then commit release prep changes outside this tool
- [ ] tag the release outside this tool
- [ ] push the branch and tag outside this tool
- [ ] create the GitHub release outside this tool

## Authorized trusted OIDC release actions

- [ ] with an explicit user release request, run `scripts/publish-release.mjs v0.1.88 --dry-run` and review the exact tag, body, package, and tarball evidence
- [ ] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [ ] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [ ] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers, `main` branch restrictions, and no-self-review protections remain enforced
- [ ] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [ ] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [ ] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.21"],["@diegopetrucci/pi-contrarian","0.1.24"],["@diegopetrucci/pi-fast","0.1.14"],["@diegopetrucci/pi-oracle","0.1.39"],["@diegopetrucci/pi-quiet-tools","0.1.18"],["@diegopetrucci/pi-review","0.1.19"],["@diegopetrucci/pi-extensions","0.1.88"]] -->
