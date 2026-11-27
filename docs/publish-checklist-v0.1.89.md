# Publish checklist — v0.1.89

## Status and scope

**Unpublished candidate.** Preparation started 2026-11-27 from `ba40953` (`origin/main`) on `release/v0.1.89-prep`. Nine packages are selected (`code-reviewer`, `confirm-destructive`, `context-inspector`, `contrarian`, `dirty-repo-guard`, `illustrations-to-explain-things`, `oracle`, `permission-gate`, and the umbrella root).

Proposed public title: **Pi 1.7.0 compatibility and permission-aware approval dialogs**.

The Pi development baseline is 1.7.0 (`docs/pi-1.7.0-validation.md`); no fleet markers change and no fleet certification is claimed. Contributor audit of `v0.1.88..ba40953`: only repository-owner commits plus The Last Harness co-author trailer, so no `## Contributors` section.

The release includes a follow-up fix to the illustrations skill codemode fallback for two CodeRabbit findings on #248 (require an image block; keep the actual image format).

## Target package versions

- [ ] `@diegopetrucci/pi-code-reviewer@0.1.22`
- [ ] `@diegopetrucci/pi-confirm-destructive@0.1.16`
- [ ] `@diegopetrucci/pi-context-inspector@0.1.20`
- [ ] `@diegopetrucci/pi-contrarian@0.1.25`
- [ ] `@diegopetrucci/pi-dirty-repo-guard@0.1.15`
- [ ] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.11`
- [ ] `@diegopetrucci/pi-oracle@0.1.40`
- [ ] `@diegopetrucci/pi-permission-gate@0.1.21`
- [ ] `@diegopetrucci/pi-extensions@0.1.89`

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

- [ ] obtain explicit user approval before any commit-creating command, then commit release prep changes outside this tool
- [ ] tag the release outside this tool
- [ ] push the branch and tag outside this tool
- [ ] create the GitHub release outside this tool

## Authorized trusted OIDC release actions

- [ ] with an explicit user release request, run `scripts/publish-release.mjs v0.1.89 --dry-run` and review the exact tag, body, package, and tarball evidence
- [ ] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [ ] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [ ] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers and the `main` deployment-branch restriction remain enforced and must never be bypassed or disabled; because the repository has a single maintainer, `npm-release` has `prevent_self_review` off, so record which identity dispatched and which approved, and note any self-approval explicitly in the release checklist
- [ ] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [ ] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [ ] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.22"],["@diegopetrucci/pi-confirm-destructive","0.1.16"],["@diegopetrucci/pi-context-inspector","0.1.20"],["@diegopetrucci/pi-contrarian","0.1.25"],["@diegopetrucci/pi-dirty-repo-guard","0.1.15"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.11"],["@diegopetrucci/pi-oracle","0.1.40"],["@diegopetrucci/pi-permission-gate","0.1.21"],["@diegopetrucci/pi-extensions","0.1.89"]] -->
