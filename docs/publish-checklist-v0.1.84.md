# Publish checklist — v0.1.84

## Status and scope

**Preparation candidate only; publishing setup and release approvals remain outstanding.** Prepared 2026-11-06 from `9a26327d32de6016a03b52f9cc26803a74edb39a` (`origin/main`) on `release/unpublished-agent-packages`. The existing user worktree is untouched.

Proposed title: **Standalone developer, diff, repository, test, and web helpers**.

This proposed standalone-only release keeps the root at `0.1.83`, all five package versions at `0.1.0`, and all fleet markers unchanged. No umbrella or unrelated package is selected. No fresh Pi fleet certification is claimed. The four new v0.1.84 documents are manual preparation; existing release history is unchanged.

## Exact target package set

- [x] `@diegopetrucci/pi-developer@0.1.0`
- [x] `@diegopetrucci/pi-diff-summarizer@0.1.0`
- [x] `@diegopetrucci/pi-repo-scout@0.1.0`
- [x] `@diegopetrucci/pi-test-runner@0.1.0`
- [x] `@diegopetrucci/pi-web-scout@0.1.0`

All five returned npm registry not-found responses during the initial publication audit. Checked target versions mean prepared manifest/lock versions, not successful publication.

## Candidate validation — completed

- [x] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed (161 packages added).
- [x] `npm run preflight:install-state` passed: 128 installed packages, 34 local package entries, 18 optional packages not installed.
- [x] `npm run sync:shared:check` passed.
- [x] `npm run format:check` passed on 184 files.
- [x] `npm run typecheck` passed.
- [x] Full `npm run ci` executed, but **failed**: 1,380 tests, 1,377 passed, 1 failed, 2 skipped. Failure: `brrr warns and uses the default for a wrong-typed idleSeconds`, `test/brrr-extension.test.mjs:571:12` (expected one fetch, observed zero).
- [x] `node --test --test-name-pattern='wrong-typed idleSeconds' test/brrr-extension.test.mjs` reproduced the failure. The test does not mock macOS idle detection: the default threshold is 20 seconds and an `ioreg -c IOHIDSystem` observation during investigation reported `HIDIdleTime = 308146083` ns (about 0.3 seconds). No unrelated test/source fix was made.
- [x] Focused validation passed: 261 tests, 259 passed, 0 failed, 2 skipped (developer intentionally exposes write/edit):

  ```bash
  node --test test/developer-runtime.test.mjs test/diff-summarizer-runtime.test.mjs test/repo-scout-runtime.test.mjs test/test-runner-runtime.test.mjs test/web-scout-runtime.test.mjs test/sdk-subagent-mcp.test.mjs test/workspace-package-metadata.test.mjs test/package-size-budgets.test.mjs test/tarball-runtime-smoke.test.mjs test/prepare-release.test.mjs test/publish-release.test.mjs test/release-workspace.test.mjs test/publish-safety.test.mjs
  ```

- [x] Five-package `npm pack --dry-run --ignore-scripts --json` passed. Packed / unpacked bytes and entries:
  - developer: 12,570 / 39,735 bytes; 4 entries.
  - diff-summarizer: 17,872 / 64,165 bytes; 4 entries.
  - repo-scout: 17,910 / 63,426 bytes; 4 entries.
  - test-runner: 10,812 / 33,877 bytes; 4 entries.
  - web-scout: 15,222 / 48,397 bytes; 4 entries.
- [x] Actual `npm pack --ignore-scripts` passed for exactly those five workspaces. Artifacts and npm pack metadata: `/tmp/pi-standalone-agents-v0.1.84.GLyxEG/`. These temporary artifacts are not uploaded or committed. Each contains exactly `.pi-fleet-tested-version`, `README.md`, `index.ts`, and `package.json`; names/versions and SHA1 hashes were verified against `pack.json`.

### Artifact payload SHA256 evidence

Hashes below are over decompressed tar payload bytes, not the runtime-dependent gzip wrapper. Regenerate and verify artifacts from the final tag before publication.

- developer: `cd5eb5eba34ec3c8e6a5956d4bbec295dc7365882dd0692671f5e304dc9c1c72`
- diff-summarizer: `8292234e6611d9c8704d6cd419daaa8a0ea0a43d1d5366811062b91f7fcd3864`
- repo-scout: `363356096ef6339e58d2b90cc1d5a25974da9aa6b7433010a4f1c10ef6321173`
- test-runner: `b9d1d2c80fdf2f4518bef47ca0eb4116c0a77774c7a7c80f9d20fd14c361ce0c`
- web-scout: `d97eed1d0008018d605f36cc9457dd3b9de09996078401efa75a903cf14ee871`

No live-provider, live Exa, interactive Pi, post-publication install, fresh fleet, or clean security audit claim is made.

## Automatic preparation limit

- [x] Five-only input dry-run was attempted with `releaseVersion: "0.1.84"` and the five exact versions above. It failed closed with `Changed package @diegopetrucci/pi-extensions needs an exact target version`.
- [x] No write-mode run, unrelated bump, lock rewrite, or fleet-marker edit was performed. `versions` is not an allowlist; see `docs/prepare-release.md`.
- [x] Manual documents use the same five-entry managed marker. Do not run write mode with this candidate: automatic artifact selection includes the umbrella, which is intentionally outside scope.
- Local dry-run input: `/tmp/pi-extensions-standalone-v0.1.84-input.json`; log: `/tmp/pi-extensions-standalone-v0.1.84-dry-run.log`.

## Contributor audit

- [x] `git log v0.1.83..9a26327 --format='%H%n%an <%ae>%n%B'` lists only owner-authored #203, co-authored by The Last Harness. GitHub confirms #203's author is `diegopetrucci`.
- [x] Original helper PR #189 is owner-authored, also co-authored by The Last Harness. No external human contributor credits were identified; the public body has no empty Contributors section.
- [ ] Reaudit the complete range if commits land before the eventual release tag.

## Blocking decisions and first-publication handoff

- [x] User explicitly deferred the unrelated `brrr` fix and requested publication first on 2026-11-06: “let's fix it later. let's publish first”. Carry the failed full-CI result as an accepted exception for this five-package release only; do not claim full CI passed or weaken CI configuration. This does not waive npm setup, commit approval, PR review, or publishing protections.
- [x] On 2026-11-06 the user explicitly approved committing the preparation and opening the `v0.1.84` PR. This authorizes the release-preparation commit on the non-main branch, push, and PR creation; it does not authorize bypassing human review or publishing safeguards.
- [x] The approved PR uses the proposed standalone-only `v0.1.84` identity. The helper permits a tag independent of the root when the root is unselected, but this differs from prior umbrella-version releases. Using this tag would require a later umbrella release to choose an unused tag (for example, root `0.1.85`); no tag is reserved or created here.
- [ ] Resolve first-publication setup and the policy conflict with an eligible human npm owner before any live action. Current guidance in `docs/publish-release-helper.md` says a package must exist before a trusted publisher can be configured and calls for interactive bootstrap, while `AGENTS.md` restricts live publishing to the workflow. These five names do not yet exist. This candidate chooses no bootstrap method. Agent-side local `npm publish`, legacy token/OTP publishing, and protection bypasses remain prohibited. Do not treat historical bootstrap commands as current agent permission. If a human-approved path bootstraps the exact `0.1.0` artifacts, the later workflow will skip all five (a verification-only no-op), and those initial versions will not gain OIDC provenance retroactively. An OIDC-published first stable release instead requires a separately reviewed, supported package-initialization plan that leaves `0.1.0` unpublished; do not create placeholder versions or alter dist-tags without explicit approval.
- [ ] After human first-publication setup is complete for the exact reviewed artifacts, have the eligible owner configure and verify each package's trusted publisher:

  ```bash
  for package in pi-developer pi-diff-summarizer pi-repo-scout pi-test-runner pi-web-scout; do
    npm trust github "@diegopetrucci/$package" --file publish.yml --repository diegopetrucci/pi-extensions --environment npm-release --allow-publish --yes
    npm trust list "@diegopetrucci/$package"
  done
  ```

  This is a human setup handoff, not an instruction for the agent to execute. Verify exact repository, workflow, protected environment, and publish permission. Keep required reviewers, main-only deployments, and no-self-review protections enforced.

- [ ] Reconcile the existing environment with mandatory no-self-review policy before workflow approval. Read-only GitHub inspection on 2026-11-06 found `npm-release` restricted to `main` with required reviewer `diegopetrucci`, but `prevent_self_review: false`; the active CLI identity is also `diegopetrucci`. No protection was changed, and no workflow was dispatched or approved. Obtain an authorized protection correction and an eligible independent dispatch/review arrangement; do not self-approve under the weaker current setting.
- [ ] Consider current npm first-package setup options with the human owner, not as an automatic workaround: [npm's 2026-10-02 announcement](https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages/) says `npm stage publish` can create a new package without making it installable, after which trusted publishing can be configured. [npm-stage documentation](https://docs.npmjs.com/cli/v11/commands/npm-stage/) says staged versions reserve the semver index and require 2FA for approval or rejection. Therefore staging `0.1.0` is not a drop-in prerequisite to workflow publication of `0.1.0`: it would block that same version until explicitly resolved. No stage, approval, rejection, placeholder version, or trust change has been made. Obtain a supported reviewed initialization plan without legacy CI credentials or local agent publication.

## Follow-up gates — pre-commit snapshot

The entries below describe remaining actions at the final pre-commit audit. Commit/PR results are recorded in the PR and git history rather than predicted here.

- [ ] With the user approval above, commit the reviewed preparation on the non-main branch, push, and open a PR targeting `main`.
- [ ] Follow `AGENTS.md`: investigate conflicts immediately; if conflict-free, check CI and PR comments after four minutes. Investigate failures/comments and ask the user how to proceed. Keep human review/merge safeguards.
- [ ] From the verified merged-main commit, refresh with `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`, run `npm run preflight:install-state`, `npm run ci`, the five-package dry-run, and `git diff --check`. Confirm branch/HEAD/origin-main equality and all gates before tagging; document the user's scoped `brrr` exception if that same test still fails rather than claiming a clean CI result.
- [ ] Confirm the release identity is still unused, audit the final range, tag exactly `v0.1.84` from verified merged main, push it, and create the non-draft release with the descriptive title and exact `docs/github-release-v0.1.84.md` body.
- [ ] With exact release authorization and first-publication setup resolved, run `node scripts/publish-release.mjs v0.1.84 --dry-run`; review all five versions, artifact hashes, and body parity. No other package is allowed in the plan. Bootstrapped exact matching versions should be skipped, never overwritten.
- [ ] Dispatch `publish.yml` only from verified `main`, with `v0.1.84` in both `release_tag` and `confirmation`, if the authenticated identity is permitted.
- [ ] Inspect verification evidence and approve protected `npm-release` deployment only with an eligible identity; escalate rejected dispatch/approval to an eligible human rather than bypassing protections.
- [ ] Let the workflow alone perform agent-authorized live publication through OIDC. Never substitute local publishing or token/OTP credentials.
- [ ] After verified workflow success, wait five minutes before registry/package-page or npm-install validation. Verify all five `0.1.0` versions, latest tags, registry hashes/provenance where applicable, final install smoke, contributor audit, and exact public-body parity.
- [ ] Publish the announcement only after successful verification.

At the final pre-commit audit, no commit, stage, push, tag, public release, workflow dispatch, environment approval, npm trust change, or publication had been performed. The subsequent approved preparation commit and PR do not constitute publication.

<!-- prepare-release:packages [["@diegopetrucci/pi-developer","0.1.0"],["@diegopetrucci/pi-diff-summarizer","0.1.0"],["@diegopetrucci/pi-repo-scout","0.1.0"],["@diegopetrucci/pi-test-runner","0.1.0"],["@diegopetrucci/pi-web-scout","0.1.0"]] -->
