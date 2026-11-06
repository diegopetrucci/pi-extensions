# Publish checklist — v0.1.85

## Status and scope

**Validated pre-commit preparation candidate only; not published.** Prepared on 2026-11-06 from `f87d72ce15073b3dcbca6bd22a2a22b75a114992` (`origin/main`) on `release/v0.1.85`, in `/Users/diegopetrucci/Developer/pi-extensions-release-v0.1.85`. The original worktree remains untouched.

Proposed public title: **Broader model coverage and refreshed subagent rankings**.

The user confirmed preparing v0.1.85 with all current changes. Artifact-based detection selected exactly six packages; other manifests, dependencies, fleet markers, and historical v0.1.84 documents remain unchanged. The five standalone helpers already match published `0.1.0` artifacts and are not selected. No fresh Pi certification is claimed. Target checkboxes below refer to eventual publication, not manifest preparation.

## Target package versions

- [ ] `@diegopetrucci/pi-annotate-git-diff@0.1.16`
- [ ] `@diegopetrucci/pi-annotate-last-message@0.1.15`
- [ ] `@diegopetrucci/pi-code-reviewer@0.1.19`
- [ ] `@diegopetrucci/pi-contrarian@0.1.21`
- [ ] `@diegopetrucci/pi-oracle@0.1.36`
- [ ] `@diegopetrucci/pi-extensions@0.1.85`

## Validation evidence

- [x] Explicit six-package input `/tmp/pi-extensions-v0.1.85-input.json`; dry-run and write-mode selection agree. Target-version registry checks reported all six targets unpublished.
- [x] Refreshed dependencies after lock synchronization with `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` (161 packages added).
- [x] `npm run preflight:install-state`: 128 installed packages, 34 local package entries, 18 optional packages not installed.
- [x] `npm run ci`: shared-copy drift check, formatting (184 files), typechecking, and 1,386 tests: **1,384 passed, 0 failed, 2 expected skips** (developer write/edit exposure). Tarball runtime smoke is included. Raw log: `/tmp/pi-extensions-v0.1.85-ci.log`. The previously idle-time-sensitive `brrr` test passed; no historical scoped CI exception is applied.
- [x] Root plus all 33 workspace `npm pack --dry-run --ignore-scripts --json` checks passed.
- [x] Actual six-package `npm pack --ignore-scripts` succeeded; artifact names, versions, SHA1, and SHA512 integrity matched pack metadata. Artifacts: `/tmp/pi-extensions-v0.1.85-artifacts-lP625m/` (`pack.json` contains complete metadata). Regenerate from the final tag before publication.
- [x] `git diff --check` passed; no staged files.
- [x] Contributor audit of `v0.1.83..f87d72c`: #203, #204, and #205 are owner-authored; only The Last Harness is coauthored. No external human credits; no empty Contributors section.

Candidate artifact evidence (Node `26.13.0`, npm `11.20.0`):

| Package suffix | Packed / unpacked bytes | Entries | Decompressed-tar SHA256 |
| --- | --- | --- | --- |
| `pi-annotate-git-diff@0.1.16` | 51,392 / 224,551 | 15 | `61808c234ff67d2645ff52fcda5c90e49d8c570b6410a0ab3db57fe3225acb1f` |
| `pi-annotate-last-message@0.1.15` | 20,989 / 75,767 | 14 | `50019cb0567cab47c2f8c775d67c3b67de3f4febe3e32febd518806a5a77ce0c` |
| `pi-code-reviewer@0.1.19` | 22,706 / 85,952 | 4 | `0673366d696216c1d38af74c1c7aab47fae3264892796d5e0a1e40aec1c4bfc0` |
| `pi-contrarian@0.1.21` | 19,370 / 78,746 | 4 | `3e2ea72d9fb3511246c7ae14619b6f61b6bee0da268bbc6b1c84c61da7b6e656` |
| `pi-oracle@0.1.36` | 18,753 / 73,081 | 4 | `64d521efe22d3fd70d2880e04b6337b4b8f36684191643a09ed8b88bc5f8e62e` |
| `pi-extensions@0.1.85` | 1,342,437 / 2,588,229 | 186 | `334763cb4fbfd7f9763e1f411806b93b40e8b9e63470eef18838c05232f859f9` |

## Publishing blockers

- [ ] Obtain an authorized correction of the `npm-release` environment's no-self-review protection and an eligible independent dispatch/review arrangement. Read-only GitHub inspection on 2026-11-06 confirms required reviewer `diegopetrucci`, main-only deployments, but `prevent_self_review: false`; active CLI identity is `diegopetrucci`. Do not exploit this weaker setting or bypass required reviewers. No environment setting has been changed.
- [x] On 2026-11-06 the user explicitly approved committing, pushing, and opening the v0.1.85 release PR. This authorizes the preparation commit on the non-main branch only; human review/merge and publishing protections remain required.
- [ ] Verify the six existing packages' trusted publisher configuration if needed with an eligible npm owner; local `npm trust list` inspection returned HTTP 401, so configuration is unverified. Do not use local live publishing, legacy token/OTP credentials, placeholder versions, or protection bypasses.

## Agent-safe follow-up actions — pre-commit snapshot

The items below record remaining actions immediately before the approved preparation commit. Subsequent commit, PR, and CI results are recorded in git history and the PR, not predicted here.

- [ ] With the explicit approval above, commit the preparation on `release/v0.1.85`, push that branch, and open a PR targeting `main`.
- [ ] Investigate conflicts immediately. If conflict-free, check CI and comments after four minutes; investigate failures/comments and ask the user how to proceed. Preserve human review/merge safeguards.
- [ ] From verified merged `main`, refresh dependencies with `npm ci`, run `npm run preflight:install-state`, `npm run ci`, package dry-runs, and `git diff --check`. Confirm HEAD equals `origin/main`; reaudit the complete previous-release-to-target range and confirm exact public-body credits.
- [ ] Confirm `v0.1.85` is unused; tag verified merged main and push that tag only after all gates pass.
- [ ] Create the non-draft GitHub release with the descriptive title above and the exact `docs/github-release-v0.1.85.md` body. Keep a body backup before any later correction.

## Authorized trusted OIDC release actions

- [ ] with an explicit user release request, run `scripts/publish-release.mjs v0.1.85 --dry-run` and review the exact tag, body, package, and tarball evidence
- [ ] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [ ] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [ ] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers, `main` branch restrictions, and no-self-review protections remain enforced
- [ ] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [ ] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [ ] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-git-diff","0.1.16"],["@diegopetrucci/pi-annotate-last-message","0.1.15"],["@diegopetrucci/pi-code-reviewer","0.1.19"],["@diegopetrucci/pi-contrarian","0.1.21"],["@diegopetrucci/pi-oracle","0.1.36"],["@diegopetrucci/pi-extensions","0.1.85"]] -->
