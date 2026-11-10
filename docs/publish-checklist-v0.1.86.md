# Publish checklist — v0.1.86

## Status and scope

**Validated pre-commit preparation candidate only; not published.** Prepared on 2026-11-10 from `150d44b` (`origin/main`) on `release/v0.1.86`, in `/Users/diegopetrucci/Developer/pi-extensions-release-v0.1.86`.

Proposed public title: **More Fast-mode models, plus context-pruning and annotation fixes**.

The user explicitly requested the release checklist after #221 merged. Artifact-based detection selected exactly nine packages. No fleet markers or dependencies change, and no fresh Pi certification is claimed. The target checkboxes below refer to eventual publication, not to manifest preparation.

## Target package versions

- [ ] `@diegopetrucci/pi-annotate-git-diff@0.1.17`
- [ ] `@diegopetrucci/pi-contrarian@0.1.22`
- [ ] `@diegopetrucci/pi-fast@0.1.12`
- [ ] `@diegopetrucci/pi-git-footer@0.1.14`
- [ ] `@diegopetrucci/pi-inline-bash@0.1.16`
- [ ] `@diegopetrucci/pi-minimal-footer@0.1.27`
- [ ] `@diegopetrucci/pi-oracle@0.1.37`
- [ ] `pi-dynamic-context-pruning@0.1.17`
- [ ] `@diegopetrucci/pi-extensions@0.1.86`

## Validation evidence

- [x] Explicit nine-package input at `/tmp/pi-extensions-v0.1.86-input.json`. Dry-run and write-mode selection agree, and the registry checks reported all nine targets unpublished.
- [x] Refreshed dependencies after lock synchronization with `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` (161 packages added).
- [x] `npm run preflight:install-state`: 128 installed packages, 34 local package entries, 18 optional packages not installed.
- [x] `npm run ci`:
  - The first run had 1 failure: the idle-time-sensitive `brrr warns and uses the default for a wrong-typed idleSeconds`. `brrr` is unchanged since v0.1.85.
  - Two immediate full reruns passed, each with 1,422 tests: **1,420 passed, 0 failed, 2 expected skips**. The reruns included shared-source drift, formatting (187 files), TypeScript, and tarball runtime smoke.
  - Logs: `/tmp/pi-extensions-v0.1.86-ci{,-rerun1,-rerun2}.log`.
- [x] Root plus all 33 workspace `npm pack --dry-run --ignore-scripts --json` checks passed.
- [x] An actual nine-package `npm pack --ignore-scripts` succeeded. Artifact names, versions, SHA1, and SHA512 integrity matched the pack metadata.
  - Artifacts: `/tmp/pi-extensions-v0.1.86-artifacts-GYmoLV/`, with complete metadata in `pack.json`.
  - Regenerate them from the final tag before publication.
- [x] `git diff --check` passed; no staged files.
- [x] Contributor audit of `v0.1.85..150d44b`:
  - #217 is by external contributor [@chenxin-yan](https://github.com/chenxin-yan) and is credited in the public body.
  - All other PRs are owner-authored.
  - Coauthors are `diegopetrucci` and The Last Harness. No bots are credited.

Candidate artifact evidence (Node `26.13.0`, npm `11.20.0`):

| Package suffix | Packed / unpacked bytes | Entries | Decompressed-tar SHA256 |
| --- | --- | --- | --- |
| `pi-annotate-git-diff@0.1.17` | 51,751 / 226,617 | 15 | `d8d6ee338d2f5acc7d7e5bb5f0524210407b6bbb01037e179e519e1c99e0a6c6` |
| `pi-contrarian@0.1.22` | 19,436 / 78,999 | 4 | `e80b4205b68e80166e8c2cbac433af7907a97e56aa92ad48cf1a33e008b58677` |
| `pi-fast@0.1.12` | 8,182 / 28,748 | 5 | `8b61fa0e4fdf980bdd2e89a1456b92f8f3849d46c1d24ec60f144c77a5f0715e` |
| `pi-git-footer@0.1.14` | 5,577 / 18,944 | 5 | `ece29d616f05aec89c88801577959cd87f82127b80001ccec586432df507076d` |
| `pi-inline-bash@0.1.16` | 2,804 / 7,455 | 4 | `7d8a5419bf90ba2a5824722f3856553ef7899e11ecd0bfc04b5bab95444e55aa` |
| `pi-minimal-footer@0.1.27` | 15,458 / 59,416 | 7 | `9fd31db37394b357a4ed16339535c0844d59c395f7adf80aea28ac8ca46869e2` |
| `pi-oracle@0.1.37` | 18,813 / 73,334 | 4 | `83702eaf4dea42ddc91087a04c3e4be1026be27f72da4cf9801d0bd417fad9b3` |
| `pi-dynamic-context-pruning@0.1.17` | 36,436 / 131,837 | 4 | `534ba1bcffa04d2e03143064d8ca54894cb3b83a0b1af2633846d4f267a4a98b` |
| `pi-extensions@0.1.86` | 1,341,200 / 2,596,397 | 188 | `097c43689220a08c421cb8a4877e2f3ee89393256af2f6a56fbe2bdd4f2320cc` |

## Publishing blockers

- [ ] Before dispatch, obtain an authorized correction of the `npm-release` environment's no-self-review protection and an eligible independent dispatch/review arrangement.
  - Read-only GitHub inspection on 2026-11-10 shows the environment unchanged since v0.1.85: required reviewer `diegopetrucci`, custom branch policy, and `prevent_self_review: false`.
  - The active CLI identity is `diegopetrucci`.
  - Do not exploit this weaker setting or bypass required reviewers. No environment setting has been changed.

## Agent-safe follow-up actions — pre-commit snapshot

- [ ] With explicit user approval, commit the preparation on `release/v0.1.86`, push that branch, and open a PR targeting `main`.
- [ ] Investigate conflicts immediately. If there are none, check CI and comments after the agreed wait. Investigate failures or comments and ask the user how to proceed. Preserve human review and merge safeguards.
- [ ] From verified merged `main`:
  - refresh dependencies with `npm ci`
  - run `npm run preflight:install-state`, `npm run ci`, the package dry-runs, and `git diff --check`
  - confirm HEAD equals `origin/main`
  - reaudit contributors through the final tag
- [ ] Confirm `v0.1.86` is unused. Tag verified merged main and push that tag only after all gates pass.
- [ ] Create the non-draft GitHub release with the descriptive title above and the exact `docs/github-release-v0.1.86.md` body. Keep a backup of the body before any later correction.

## Authorized trusted OIDC release actions

- [ ] with an explicit user release request, run `scripts/publish-release.mjs v0.1.86 --dry-run` and review the exact tag, body, package, and tarball evidence
- [ ] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [ ] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [ ] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers, `main` branch restrictions, and no-self-review protections remain enforced
- [ ] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [ ] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [ ] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-git-diff","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.22"],["@diegopetrucci/pi-fast","0.1.12"],["@diegopetrucci/pi-git-footer","0.1.14"],["@diegopetrucci/pi-inline-bash","0.1.16"],["@diegopetrucci/pi-minimal-footer","0.1.27"],["@diegopetrucci/pi-oracle","0.1.37"],["pi-dynamic-context-pruning","0.1.17"],["@diegopetrucci/pi-extensions","0.1.86"]] -->
