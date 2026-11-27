# Publish checklist — v0.1.89

## Status and scope

**Published on 2026-11-27** through the trusted `publish.yml` OIDC workflow. All 9 packages are verified on npm; see the "Publication record" section below. Preparation started 2026-11-27 from `ba40953` (`origin/main`) on `release/v0.1.89-prep`. Nine packages are selected (`code-reviewer`, `confirm-destructive`, `context-inspector`, `contrarian`, `dirty-repo-guard`, `illustrations-to-explain-things`, `oracle`, `permission-gate`, and the umbrella root).

Proposed public title: **Pi 1.7.0 compatibility and permission-aware approval dialogs**.

The Pi development baseline is 1.7.0 (`docs/pi-1.7.0-validation.md`); no fleet markers change and no fleet certification is claimed. Contributor audit of `v0.1.88..ba40953`: only repository-owner commits plus The Last Harness co-author trailer, so no `## Contributors` section.

The release includes a follow-up fix to the illustrations skill codemode fallback for two CodeRabbit findings on #248 (require an image block; keep the actual image format).

## Target package versions

- [x] `@diegopetrucci/pi-code-reviewer@0.1.22`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.16`
- [x] `@diegopetrucci/pi-context-inspector@0.1.20`
- [x] `@diegopetrucci/pi-contrarian@0.1.25`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.15`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.11`
- [x] `@diegopetrucci/pi-oracle@0.1.40`
- [x] `@diegopetrucci/pi-permission-gate@0.1.21`
- [x] `@diegopetrucci/pi-extensions@0.1.89`

## Validation evidence

- [x] `npm ci` and `npm run preflight:install-state` passed.
- [x] The `prepare-release` dry-run selected 9 packages.
- [x] `npm run ci` passed: 1,535 tests, **0 failed, 2 skipped**.
- [x] The `prepare-release` dry-run re-run reported 9 packages: changelog action `keep` for 8 and `skip` for `illustrations-to-explain-things` (no CHANGELOG), with 4 documents preserved.
- [x] `npm pack --dry-run --workspaces --include-workspace-root --ignore-scripts` passed.
- [x] `git diff --check` passed.
- [x] Changelog placeholders replaced in each package CHANGELOG.md.
- [x] No staged files.

## Agent-safe follow-up actions

- [x] With explicit user approval, committed the preparation on `release/v0.1.89-prep`.
- [x] Opened and merged [#249](https://github.com/diegopetrucci/pi-extensions/pull/249) as `7a0bb79`. CI passed and Codex review reported no findings. CodeRabbit was rate-limited and did not review #249; it had reviewed #248, and its two findings were fixed in #249.
- [x] Annotated tag `v0.1.89` was created on `7a0bb79` and pushed.
- [x] Created the non-draft, latest [GitHub release](https://github.com/diegopetrucci/pi-extensions/releases/tag/v0.1.89) titled "Pi 1.7.0 compatibility and permission-aware approval dialogs" with the `docs/github-release-v0.1.89.md` body. The body matches apart from one trailing newline. Body backup: `/tmp/v0189-body-backup.md`.

## Authorized trusted OIDC release actions

- [x] with an explicit user release request, run `scripts/publish-release.mjs v0.1.89 --dry-run` and review the exact tag, body, package, and tarball evidence
- [x] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [x] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [x] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers and the `main` deployment-branch restriction remain enforced and must never be bypassed or disabled; because the repository has a single maintainer, `npm-release` has `prevent_self_review` off, so record which identity dispatched and which approved, and note any self-approval explicitly in the release checklist. `diegopetrucci`, the sole maintainer and only configured reviewer, both dispatched and approved this run under the maintainer's explicit release authorization; `prevent_self_review` is off, required reviewers and the `main` deployment-branch restriction were enforced, and no bypass was used
- [x] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection (not needed; dispatch and approval were accepted)
- [x] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [x] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification

## Publication record

- **Run [46065253403](https://github.com/diegopetrucci/pi-extensions/actions/runs/46065253403)** (2026-11-27, dispatched by `diegopetrucci` from `main` at `7a0bb79` with `v0.1.89` in both fields):
  - The local `scripts/publish-release.mjs v0.1.89 --dry-run` passed with 9 `publish` entries.
  - The verify job passed (20:40:44–20:41:05 UTC) with 9 `publish` entries. The local dry-run on Node 26.13.1 and npm 11.20.0 gave different tarball hashes, but a repack of the tag with Node 24.11.1 and npm 11.17.0 reproduced all 9 names, versions, actions, SHA1 and SHA512 values from the CI plan. The maintainer's account approved the `npm-release` deployment (self-approval; see the checklist above) after that check.
  - The publish job ran 20:47:54–21:07:39 UTC and succeeded; the 9 packages published in order from 20:48:21 (`pi-code-reviewer`) to 21:04:12 UTC (umbrella `pi-extensions` last). Publication was only through npm OIDC; no local `npm publish` or tokens were used.
- **Post-publication verification** (after a 5-minute wait):
  - All 9 `name@version` entries resolve with `dist.shasum` and `dist.integrity` equal to the CI plan, `latest` points to each target version, and SLSA provenance attestations are present.
  - A clean `npm install --ignore-scripts` of `@diegopetrucci/pi-extensions@0.1.89` and `@diegopetrucci/pi-permission-gate@0.1.21` succeeded. The installed code includes `blockedKind: 'permission'` in `permission-gate`, `dirty-repo-guard`, and `confirm-destructive`, the Ling-3.1-flash oracle ladder entry, and the context-inspector save-error note.
  - The public release body matches `docs/github-release-v0.1.89.md` apart from one trailing newline, and `v0.1.89` is the latest release.

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.22"],["@diegopetrucci/pi-confirm-destructive","0.1.16"],["@diegopetrucci/pi-context-inspector","0.1.20"],["@diegopetrucci/pi-contrarian","0.1.25"],["@diegopetrucci/pi-dirty-repo-guard","0.1.15"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.11"],["@diegopetrucci/pi-oracle","0.1.40"],["@diegopetrucci/pi-permission-gate","0.1.21"],["@diegopetrucci/pi-extensions","0.1.89"]] -->
