# Publish checklist — v0.1.88

## Status and scope

**Published on 2026-11-22** through the trusted `publish.yml` OIDC workflow. All 7 packages are verified on npm; see the "Publication record" section below. Preparation started 2026-11-22 from `ed14ffc` (`origin/main`) on `release/v0.1.88-prep`. Seven packages are selected (`code-reviewer`, `contrarian`, `fast`, `oracle`, `quiet-tools`, `review`, and the umbrella root).

Proposed public title: **Pi 1.6.0 compatibility and GPT-6.2 Fast mode**.

The Pi development baseline is 1.6.0 (`docs/pi-1.6.0-validation.md`); no fleet markers change and no fleet certification is claimed. Contributor audit of `v0.1.87..ed14ffc`: only repository-owner commits plus The Last Harness co-author trailer, so no `## Contributors` section.

## Target package versions

- [x] `@diegopetrucci/pi-code-reviewer@0.1.21`
- [x] `@diegopetrucci/pi-contrarian@0.1.24`
- [x] `@diegopetrucci/pi-fast@0.1.14`
- [x] `@diegopetrucci/pi-oracle@0.1.39`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.18`
- [x] `@diegopetrucci/pi-review@0.1.19`
- [x] `@diegopetrucci/pi-extensions@0.1.88`

## Validation evidence

- [x] `npm ci` and `npm run preflight:install-state` passed.
- [x] `npm run ci` passed: 1,532 tests, **0 failed, 2 skipped**.
- [x] The `prepare-release` dry-run re-run reported 7 packages with changelog action `keep` and 4 documents preserved.
- [x] `npm pack --dry-run --workspaces --include-workspace-root --ignore-scripts` passed.
- [x] `git diff --check` passed.
- [x] Changelog placeholders replaced in each package CHANGELOG.md.
- [x] No staged files.

## Agent-safe follow-up actions

- [x] With explicit user approval, committed the preparation on `release/v0.1.88-prep`.
- [x] Opened [#244](https://github.com/diegopetrucci/pi-extensions/pull/244). Codex review reported no findings and CI passed. #244 merged as `da78cfa`.
- [x] Annotated tag `v0.1.88` was created on `da78cfa` and pushed.
- [x] Created the non-draft, latest [GitHub release](https://github.com/diegopetrucci/pi-extensions/releases/tag/v0.1.88) titled "Pi 1.6.0 compatibility and GPT-6.2 Fast mode" with the `docs/github-release-v0.1.88.md` body. The body matches apart from one trailing newline. Body backup: `/tmp/v0188-body-backup.md`.

## Authorized trusted OIDC release actions

- [x] with an explicit user release request, run `scripts/publish-release.mjs v0.1.88 --dry-run` and review the exact tag, body, package, and tarball evidence
- [x] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [x] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [x] approve the protected `npm-release` environment deployment with an eligible authenticated GitHub identity. `diegopetrucci`, the sole maintainer and only configured reviewer, both dispatched and approved this run under the maintainer's explicit release authorization. The environment enforces required reviewers and the `main` deployment-branch restriction, but `prevent_self_review` is off and administrator bypass is enabled, so self-approval was possible; the maintainer accepts self-approval because the repository has no second eligible reviewer.
- [x] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection (not needed; dispatch and approval were accepted)
- [x] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [x] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification

## Publication record

- **Run [45010346848](https://github.com/diegopetrucci/pi-extensions/actions/runs/45010346848)** (2026-11-22, from `main` at `da78cfa`):
  - The verify job passed (10:01:18–10:01:42 UTC) with 7 `publish` entries. The local dry-run on Node 26.13.1 and npm 11.20.0 gave different tarball hashes, but a repack of the tag with Node 24.11.1 and npm 11.17.0 reproduced all 7 names, versions, SHA1 and SHA512 values from the CI plan. The maintainer's account approved the deployment (self-approval; see the checklist above) after that check.
  - The publish job ran 10:02:45–10:21:50 UTC and succeeded; the 7 packages published in order from 10:03:08 (`pi-code-reviewer`) to 10:18:17 UTC (umbrella `pi-extensions` last).
- **Post-publication verification** (after a 5-minute wait):
  - All 7 `name@version` entries resolve with `dist.shasum` and `dist.integrity` equal to the CI plan, `latest` points to the target version, and SLSA provenance attestations are present.
  - A clean `npm install --ignore-scripts` of `@diegopetrucci/pi-extensions@0.1.88` and `@diegopetrucci/pi-fast@0.1.14` succeeded, and the installed `pi-fast` includes the GPT-6.2 allowlist entries.
  - The public release body matches `docs/github-release-v0.1.88.md` apart from one trailing newline, and `v0.1.88` is the latest release.

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.21"],["@diegopetrucci/pi-contrarian","0.1.24"],["@diegopetrucci/pi-fast","0.1.14"],["@diegopetrucci/pi-oracle","0.1.39"],["@diegopetrucci/pi-quiet-tools","0.1.18"],["@diegopetrucci/pi-review","0.1.19"],["@diegopetrucci/pi-extensions","0.1.88"]] -->
