# Publish checklist — v0.1.83

## Scope and source freeze

- [x] Source frozen at `8979c03efbcfa92509d31baf532af76483819f05` (`origin/main`), branch `release/v0.1.83`.
- [x] The exact input `/tmp/pi-extensions-v0.1.83-input.json` dry-run (`/tmp/v0183-dry.json`) selected 20 artifacts; write mode created the four v0.1.83 documents.
- [x] **Exclusion of five standalone packages (user decision, same as v0.1.82):** `@diegopetrucci/pi-developer@0.1.0`, `@diegopetrucci/pi-diff-summarizer@0.1.0`, `@diegopetrucci/pi-repo-scout@0.1.0`, `@diegopetrucci/pi-test-runner@0.1.0`, and `@diegopetrucci/pi-web-scout@0.1.0` are deliberately excluded from this release's standalone publication (not on npm; npm trusted publishing not yet set up). `prepare-release` has no exclude option, so they were removed by manual edit from all package lists and the managed marker in all four documents. The marker lists exactly 15 entries (14 workspaces plus the umbrella) and is byte-identical across the four documents.
- [x] Re-running write mode for v0.1.83 would abort because of this marker mismatch; do not re-run it.
- [x] `@diegopetrucci/pi-extensions@0.1.83` still bundles these five extensions.
- [ ] Follow-up for a future release: bootstrap each of the five packages at `0.1.0` interactively and run `npm trust github` (see `docs/publish-release-helper.md`); see also the new-package handling in `docs/publish-checklist-v0.1.75.md`.
- [x] The 14 unchanged workspace omissions are `@diegopetrucci/pi-agent-workflow-audit@0.1.16`, `@diegopetrucci/pi-annotate-git-diff@0.1.15`, `@diegopetrucci/pi-annotate-last-message@0.1.14`, `@diegopetrucci/pi-brrr@0.1.16`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-context-cap@0.1.16`, `@diegopetrucci/pi-dirty-repo-guard@0.1.13`, `@diegopetrucci/pi-fast@0.1.11`, `@diegopetrucci/pi-git-footer@0.1.13`, `@diegopetrucci/pi-minimal-footer@0.1.26`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-permission-gate@0.1.19`, and `@diegopetrucci/pi-project-mcp-json@0.1.4`.
- [x] No `.pi-fleet-tested-version` markers were changed by release preparation (markers stay; no Pi 1.5.0 fleet certification).

## Target package versions

- [x] `@diegopetrucci/pi-code-reviewer@0.1.18`
- [x] `@diegopetrucci/pi-context-inspector@0.1.18`
- [x] `@diegopetrucci/pi-contrarian@0.1.20`
- [x] `@diegopetrucci/pi-gnosis@0.1.13`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.10`
- [x] `@diegopetrucci/pi-inline-bash@0.1.15`
- [x] `@diegopetrucci/pi-librarian@0.1.23`
- [x] `@diegopetrucci/pi-notify@0.1.21`
- [x] `@diegopetrucci/pi-oracle@0.1.35`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.16`
- [x] `@diegopetrucci/pi-review@0.1.17`
- [x] `@diegopetrucci/pi-todo@0.1.13`
- [x] `@diegopetrucci/pi-triage-comments@0.1.19`
- [x] `pi-dynamic-context-pruning@0.1.16`
- [x] `@diegopetrucci/pi-extensions@0.1.83`

## Contributor audit

- [x] Range `v0.1.82..8979c03` has nine commits (#193, #194, #195, #196, #197, #198, #199, #200, #201), all PRs authored by `diegopetrucci` (owner-only; The Last Harness the only co-author trailer). No external contributors; the public body has no `## Contributors` section.

## PRE-COMMIT CANDIDATE validation

The following evidence is for the pre-commit release-preparation candidate in this worktree only (source `8979c03efbcfa92509d31baf532af76483819f05` plus the uncommitted release-prep edits). It is not the future verified merged-main gate. Raw log: `/tmp/v0183-val.log`.

- [x] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed and added 161 packages. The only npm warning was the known `node-domexception@1.0.0` deprecation.
- [x] `npm run preflight:install-state` passed with 128 installed packages and 34 local package entries matching `package-lock.json`; 18 optional packages were not installed.
- [x] `npm run ci` passed: formatting matched 180 files, typechecking passed, and the test summary was 1,378 total, 1,376 passed, 0 failed, 0 cancelled, and 2 skipped (the developer MCP exposure checks "write absent" and "edit absent", skipped because `developer` intentionally exposes write/edit).
- [x] `npm pack --dry-run --ignore-scripts --json` passed; `@diegopetrucci/pi-extensions@0.1.83` reported 186 entries.
- [x] `npm pack --dry-run --ignore-scripts --json --workspaces` passed for all 33 workspace dry-runs (this includes the five excluded packages; dry-run only).
- [x] `git diff --check` passed.
- [x] `git diff --cached --name-only` is empty; no files are staged.

This candidate evidence makes no merged-main, live-provider, visual, interactive, fleet, host, or publication claim. No commit, stage, tag, push, GitHub release, workflow dispatch, protected-environment approval, npm publication, or direct `npm publish` was performed.

## Release title and public body

- [x] Exact descriptive title: **Pi 1.5.0 compatibility, refreshed model rankings, and tighter subagent guards**.
- [x] Exact public body: `docs/github-release-v0.1.83.md`; summary, `## Highlights`, `## Packages`, `## Install`; no internal title, redundant version heading, `Contributors`, or `Included docs` section. #194 and #197 are not mentioned publicly.
- [x] The release notes, public body, announcement, and checklist retain one identical managed package marker with all 15 package/version pairs.

## Future verified merged-main gate — not run here

Every item in this section remains unchecked. The candidate results above must not be reused as merged-main evidence.

- [ ] After the release-preparation PR is merged through the human-reviewed process, verify `git rev-parse --abbrev-ref HEAD` reports `main`, `git rev-parse HEAD` equals the intended merged-main commit, and `git rev-parse origin/main` equals the same commit.
- [ ] On that commit, run exactly these six commands in order:
  1. [ ] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`
  2. [ ] `npm run preflight:install-state`
  3. [ ] `npm run ci`
  4. [ ] `npm pack --dry-run --ignore-scripts --json`
  5. [ ] `npm pack --dry-run --ignore-scripts --json --workspaces`
  6. [ ] `git diff --check`
- [ ] Confirm all six commands pass before tagging or creating a release.

## Agent-safe follow-up actions

- [ ] obtain explicit user approval before any commit-creating command, then commit release prep changes outside this tool
- [ ] push the non-`main` release-preparation branch and open a PR targeting `main`; wait for CI and review comments before merge
- [ ] tag exactly `v0.1.83` from verified merged `main` outside this tool
- [ ] push the tag outside this tool
- [ ] create one non-draft GitHub release with the exact title above and the exact body in `docs/github-release-v0.1.83.md`

## Authorized trusted OIDC release actions

Note: the five excluded packages (`pi-developer`, `pi-diff-summarizer`, `pi-repo-scout`, `pi-test-runner`, `pi-web-scout`) have no npm trusted publishing set up and must not be expected in the workflow's package plan; review the plan against the 15-entry marker.

- [ ] with an explicit user release request, run `node scripts/publish-release.mjs v0.1.83 --dry-run` and review the exact tag, body, package, and tarball evidence
- [ ] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [ ] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [ ] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers, `main` branch restrictions, and no-self-review protections remain enforced
- [ ] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [ ] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [ ] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification
- [ ] after that wait, verify exact public-body parity with `docs/github-release-v0.1.83.md` (no contributor section expected)

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.18"],["@diegopetrucci/pi-context-inspector","0.1.18"],["@diegopetrucci/pi-contrarian","0.1.20"],["@diegopetrucci/pi-gnosis","0.1.13"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.10"],["@diegopetrucci/pi-inline-bash","0.1.15"],["@diegopetrucci/pi-librarian","0.1.23"],["@diegopetrucci/pi-notify","0.1.21"],["@diegopetrucci/pi-oracle","0.1.35"],["@diegopetrucci/pi-quiet-tools","0.1.16"],["@diegopetrucci/pi-review","0.1.17"],["@diegopetrucci/pi-todo","0.1.13"],["@diegopetrucci/pi-triage-comments","0.1.19"],["pi-dynamic-context-pruning","0.1.16"],["@diegopetrucci/pi-extensions","0.1.83"]] -->
