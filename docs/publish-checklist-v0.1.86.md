# Publish checklist — v0.1.86

## Status and scope

**Published on 2026-11-10** through the trusted `publish.yml` OIDC workflow. All nine packages are verified on npm; see the "Publication record" section below. Preparation started from `150d44b` (`origin/main`) on `release/v0.1.86`, in `/Users/diegopetrucci/Developer/pi-extensions-release-v0.1.86`.

Proposed public title: **More Fast-mode models, plus context-pruning and annotation fixes**.

The user explicitly requested the release checklist after #221 merged. Artifact-based detection selected exactly nine packages. No fleet markers or dependencies change, and no fresh Pi certification is claimed. The target checkboxes below record publication.

## Target package versions

- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.17`
- [x] `@diegopetrucci/pi-contrarian@0.1.22`
- [x] `@diegopetrucci/pi-fast@0.1.12`
- [x] `@diegopetrucci/pi-git-footer@0.1.14`
- [x] `@diegopetrucci/pi-inline-bash@0.1.16`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.27`
- [x] `@diegopetrucci/pi-oracle@0.1.37`
- [x] `pi-dynamic-context-pruning@0.1.17`
- [x] `@diegopetrucci/pi-extensions@0.1.86`

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

## Publishing approval arrangement

- [x] Resolved on 2026-11-10 by explicit maintainer decision: self-approval of the `npm-release` deployment is accepted for v0.1.86, as for v0.1.85.
  - Read-only GitHub inspection on 2026-11-10 shows the environment unchanged since v0.1.85: required reviewer `diegopetrucci`, custom branch policy, and `prevent_self_review: false`. The active CLI identity is `diegopetrucci`.
  - The maintainer (`diegopetrucci`) approves the deployment personally. Required reviewers and branch restrictions stay enforced; no environment setting was changed.
  - Enforcing no-self-review would require a second eligible reviewer and remains a separate, open decision.

## Agent-safe follow-up actions

- [x] With explicit user approval, committed the preparation on `release/v0.1.86`, pushed it, and opened [#222](https://github.com/diegopetrucci/pi-extensions/pull/222).
- [x] CI passed on Node 22.19, 24, and 26, and CodeQL passed. Codex review had no findings. CodeRabbit's two findings were addressed in `b904a4a`: the Fast coverage claim was narrowed and the publishing blocker restored. #222 merged as `0bc0d76`.
- [x] From verified merged `main` (`0bc0d76`, equal to `origin/main`) on 2026-11-10:
  - `npm ci` and `npm run preflight:install-state` passed.
  - `npm run ci` passed first time: 1,422 tests, **1,420 passed, 0 failed, 2 expected skips**. Log: `/tmp/pi-extensions-v0.1.86-main-ci.log`.
  - Root and all 33 workspace pack dry-runs passed, and `git diff --check` passed.
  - The contributor reaudit through `0bc0d76` found only the owner-authored #222 as new; the @chenxin-yan credit stands.
- [x] `v0.1.86` was unused. Annotated tag `v0.1.86` was created on `0bc0d76` and pushed.
- [x] Created the non-draft, latest [GitHub release](https://github.com/diegopetrucci/pi-extensions/releases/tag/v0.1.86) with the descriptive title and the `docs/github-release-v0.1.86.md` body. The body matches apart from one trailing newline, as for v0.1.85. Body backup: `/tmp/v0186-body-backup.md`.

## Authorized trusted OIDC release actions

- [x] With an explicit user release request, ran `scripts/publish-release.mjs v0.1.86 --dry-run` on 2026-11-10. Results: tag commit `0bc0d76`, nine packages planned with action `publish`, and every SHA1 and SHA512 integrity value matches the validated candidate tarballs.
- [x] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [x] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [x] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers and `main` branch restrictions remain enforced (the maintainer accepted self-approval for this release; see above)
- [x] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [x] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [x] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification

## Publication record

- **Run 1, [42897274308](https://github.com/diegopetrucci/pi-extensions/actions/runs/42897274308)** (2026-11-10, dispatched from `main` at `0bc0d76`, approved by the maintainer):
  - The verify job passed. The plan's tarball shasums differed from the local candidate evidence because CI packs with Node 24.11.1 and npm 11.17.0, which gzip differently from the local Node 26.13.0 and npm 11.20.0.
  - A local repack of `0bc0d76` with Node 24.11.1 and npm 11.17.0 reproduced the CI SHA1 and SHA512 exactly for all nine packages, and the decompressed payloads matched the validated candidate tarballs byte for byte. The deployment was approved after that check.
  - `annotate-git-diff`, `contrarian`, `fast`, and `git-footer` published and verified. npm then accepted `pi-inline-bash@0.1.16`, but the registry returned 404 past the helper's ~10-minute visibility window, so the run failed with `Published package did not become visible`. This is the same propagation delay as `pi-context-cap@0.1.11` in v0.1.66.
  - The version became visible at about 21:05 UTC, roughly 14 minutes after upload, with the expected shasum and the `latest` tag.
- **Run 2, [42901725786](https://github.com/diegopetrucci/pi-extensions/actions/runs/42901725786)** (idempotent rerun with the same inputs, approved by the maintainer):
  - The plan skipped the five visible packages and published `minimal-footer`, `oracle`, `dynamic-context-pruning`, and `pi-extensions`.
  - It completed successfully at 21:28 UTC.
- **Post-publication verification** (after a 5-minute wait):
  - All nine `name@version` entries resolve on the public registry with `dist.shasum` and `dist.integrity` equal to the CI-reproduced tarballs, and `latest` points to the target version.
  - A clean `npm install @diegopetrucci/pi-extensions@0.1.86` installs 0.1.86, including the new Fast models.
  - The public release body still matches `docs/github-release-v0.1.86.md` apart from one trailing newline, including the @chenxin-yan credit, and `v0.1.86` is the latest release.
- **Follow-up:** the helper's visibility window (`PUBLISHED_VISIBILITY_RETRY_ATTEMPTS` × 5 s) has now been exceeded twice. Consider extending it within the publish job's 45-minute timeout.

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-git-diff","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.22"],["@diegopetrucci/pi-fast","0.1.12"],["@diegopetrucci/pi-git-footer","0.1.14"],["@diegopetrucci/pi-inline-bash","0.1.16"],["@diegopetrucci/pi-minimal-footer","0.1.27"],["@diegopetrucci/pi-oracle","0.1.37"],["pi-dynamic-context-pruning","0.1.17"],["@diegopetrucci/pi-extensions","0.1.86"]] -->
