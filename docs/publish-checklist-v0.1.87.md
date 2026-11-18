# Publish checklist — v0.1.87

## Status and scope

**Published on 2026-11-17** through the trusted `publish.yml` OIDC workflow. All 31 packages are verified on npm; see the "Publication record" section below. Preparation started 2026-11-17 from `d4925e0` (`origin/main`) on `release/v0.1.87-prep`. 31 packages are selected; 3 are unchanged (`illustrations-to-explain-things`, `claude-fast`, `openai-fast`).

Proposed public title: **Pi 1.5.2 compatibility, per-package update notes, and timeout hardening**.

The Pi development baseline is 1.5.2 (`docs/pi-1.5.2-validation.md`); no fleet markers change and no fleet certification is claimed. Contributor audit of `v0.1.86..origin/main`: only repository-owner commits plus The Last Harness co-author trailer, so no `## Contributors` section.

## Target package versions

- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.17`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.18`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.16`
- [x] `@diegopetrucci/pi-brrr@0.1.17`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.20`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.15`
- [x] `@diegopetrucci/pi-context-cap@0.1.17`
- [x] `@diegopetrucci/pi-context-inspector@0.1.19`
- [x] `@diegopetrucci/pi-contrarian@0.1.23`
- [x] `@diegopetrucci/pi-developer@0.1.1`
- [x] `@diegopetrucci/pi-diff-summarizer@0.1.1`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.14`
- [x] `@diegopetrucci/pi-fast@0.1.13`
- [x] `@diegopetrucci/pi-git-footer@0.1.15`
- [x] `@diegopetrucci/pi-gnosis@0.1.14`
- [x] `@diegopetrucci/pi-inline-bash@0.1.17`
- [x] `@diegopetrucci/pi-librarian@0.1.24`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.28`
- [x] `@diegopetrucci/pi-notify@0.1.22`
- [x] `@diegopetrucci/pi-oracle@0.1.38`
- [x] `@diegopetrucci/pi-permission-gate@0.1.20`
- [x] `@diegopetrucci/pi-project-mcp-json@0.1.5`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.17`
- [x] `@diegopetrucci/pi-repo-scout@0.1.1`
- [x] `@diegopetrucci/pi-review@0.1.18`
- [x] `@diegopetrucci/pi-test-runner@0.1.1`
- [x] `@diegopetrucci/pi-todo@0.1.14`
- [x] `@diegopetrucci/pi-triage-comments@0.1.20`
- [x] `@diegopetrucci/pi-web-scout@0.1.1`
- [x] `pi-dynamic-context-pruning@0.1.18`
- [x] `@diegopetrucci/pi-extensions@0.1.87`

## Validation evidence

- [x] `npm ci` and `npm run preflight:install-state` passed.
- [x] `npm run ci` passed: 1,523 tests, **0 failed, 2 skipped**.
- [x] The `prepare-release` dry-run re-run reported 31 packages with changelog action `keep` and 4 documents preserved.
- [x] `npm pack --dry-run` passed for the root package and all workspaces.
- [x] `git diff --check` passed.
- [x] Changelog placeholders replaced in each package CHANGELOG.md.
- [x] No staged files.

## Agent-safe follow-up actions

- [x] With explicit user approval, committed the preparation on `release/v0.1.87-prep`.
- [x] Opened [#238](https://github.com/diegopetrucci/pi-extensions/pull/238). CodeRabbit raised three changelog-wording findings, fixed in `d8b3f3f`; the pre-existing preset-selector issue went to [#239](https://github.com/diegopetrucci/pi-extensions/issues/239). #238 merged as `ce73c9e`.
- [x] Annotated tag `v0.1.87` was created on `ce73c9e` and pushed.
- [x] Created the non-draft, latest [GitHub release](https://github.com/diegopetrucci/pi-extensions/releases/tag/v0.1.87) with the descriptive title and the `docs/github-release-v0.1.87.md` body. The body matches apart from one trailing newline. Body backup: `/tmp/v0187-body-backup.md`.

## Authorized trusted OIDC release actions

- [x] with an explicit user release request, run `scripts/publish-release.mjs v0.1.87 --dry-run` and review the exact tag, body, package, and tarball evidence
- [x] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [x] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [x] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers and `main` branch restrictions remain enforced (the maintainer accepted self-approval of `npm-release` for v0.1.87)
- [x] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [x] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [x] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification (run 2 was cancelled by the job timeout after every package had published, so publication success was verified directly on the registry — all 31 versions, hashes, latest, provenance — before the five-minute wait)

## Publication record

- **Run 1, [44120885483](https://github.com/diegopetrucci/pi-extensions/actions/runs/44120885483)** (2026-11-17, from `main` at `ce73c9e`):
  - The verify job passed. The local dry-run on Node 26.13.1 and npm 11.20.0 gave different tarball hashes, but a repack of the tag with Node 24.11.1 and npm 11.17.0 reproduced all 31 SHA1 and SHA512 values from the CI plan. The deployment was approved after that check.
  - Nine packages (`agent-workflow-audit` through `contrarian`) published between 16:06 and 16:25 UTC.
  - Publishing `@diegopetrucci/pi-developer@0.1.1` failed with `ENEEDAUTH`: the five subagent packages added in #189 (`developer`, `diff-summarizer`, `repo-scout`, `test-runner`, `web-scout`) had been bootstrapped manually at 0.1.0 without an npm trusted publisher.
  - The maintainer ran `npm trust github ... --file publish.yml --repository diegopetrucci/pi-extensions --environment npm-release --allow-publish` for those five packages from another machine.
- **Run 2, [44172004270](https://github.com/diegopetrucci/pi-extensions/actions/runs/44172004270)** (idempotent rerun, same inputs):
  - The plan had 9 skip and 22 publish entries, and all 31 hashes matched the reproduced evidence. The deployment was approved.
  - The 22 packages published between 20:45:55 and 21:28:21 UTC.
  - The job was cancelled at 21:28:23 UTC by its 45-minute timeout during the final visibility check, after every package had published.
- **Post-publication verification** (after a 5-minute wait):
  - All 31 `name@version` entries resolve with `dist.shasum` and `dist.integrity` equal to the reproduced tarballs, `latest` points to the target version, and provenance attestations are present.
  - A clean `npm install` of `@diegopetrucci/pi-extensions@0.1.87`, `@diegopetrucci/pi-web-scout@0.1.1`, and `@diegopetrucci/pi-oracle@0.1.38` succeeded, and the packages include `CHANGELOG.md`.
  - The public release body matches apart from one trailing newline, and `v0.1.87` is the latest release.
- **Follow-ups:**
  - The publish job timeout is raised to 180 minutes in this same PR.
  - [#239](https://github.com/diegopetrucci/pi-extensions/issues/239) tracks the review preset selector issue.
  - Pending maintainer action: set the five subagent packages' npm publishing access to "Require two-factor authentication and disallow tokens".

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.17"],["@diegopetrucci/pi-annotate-git-diff","0.1.18"],["@diegopetrucci/pi-annotate-last-message","0.1.16"],["@diegopetrucci/pi-brrr","0.1.17"],["@diegopetrucci/pi-code-reviewer","0.1.20"],["@diegopetrucci/pi-confirm-destructive","0.1.15"],["@diegopetrucci/pi-context-cap","0.1.17"],["@diegopetrucci/pi-context-inspector","0.1.19"],["@diegopetrucci/pi-contrarian","0.1.23"],["@diegopetrucci/pi-developer","0.1.1"],["@diegopetrucci/pi-diff-summarizer","0.1.1"],["@diegopetrucci/pi-dirty-repo-guard","0.1.14"],["@diegopetrucci/pi-fast","0.1.13"],["@diegopetrucci/pi-git-footer","0.1.15"],["@diegopetrucci/pi-gnosis","0.1.14"],["@diegopetrucci/pi-inline-bash","0.1.17"],["@diegopetrucci/pi-librarian","0.1.24"],["@diegopetrucci/pi-minimal-footer","0.1.28"],["@diegopetrucci/pi-notify","0.1.22"],["@diegopetrucci/pi-oracle","0.1.38"],["@diegopetrucci/pi-permission-gate","0.1.20"],["@diegopetrucci/pi-project-mcp-json","0.1.5"],["@diegopetrucci/pi-quiet-tools","0.1.17"],["@diegopetrucci/pi-repo-scout","0.1.1"],["@diegopetrucci/pi-review","0.1.18"],["@diegopetrucci/pi-test-runner","0.1.1"],["@diegopetrucci/pi-todo","0.1.14"],["@diegopetrucci/pi-triage-comments","0.1.20"],["@diegopetrucci/pi-web-scout","0.1.1"],["pi-dynamic-context-pruning","0.1.18"],["@diegopetrucci/pi-extensions","0.1.87"]] -->
