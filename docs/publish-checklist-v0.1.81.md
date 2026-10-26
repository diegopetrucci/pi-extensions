# Publish checklist — v0.1.81

## Scope and source freeze

- [x] At the frozen pre-write point, source was `b1ce3ce42e10c4a94100536c62f1f906cadf5a80`; `HEAD` and `origin/main` matched and the tree was clean apart from untracked `.tickets/`.
- [x] The exact input `/tmp/pi-extensions-v0.1.81-input.json` selected exactly four artifacts in dependency order; write mode selected the same four, synchronized their manifests and lockfile version leaves, and created exactly the four v0.1.81 release documents.
- [x] The 25 unchanged workspace omissions are `@diegopetrucci/pi-agent-workflow-audit@0.1.15`, `@diegopetrucci/pi-annotate-git-diff@0.1.15`, `@diegopetrucci/pi-annotate-last-message@0.1.14`, `@diegopetrucci/pi-brrr@0.1.15`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-code-reviewer@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-context-cap@0.1.16`, `@diegopetrucci/pi-context-inspector@0.1.17`, `@diegopetrucci/pi-contrarian@0.1.18`, `pi-dynamic-context-pruning@0.1.15`, `@diegopetrucci/pi-git-footer@0.1.13`, `@diegopetrucci/pi-gnosis@0.1.12`, `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`, `@diegopetrucci/pi-librarian@0.1.21`, `@diegopetrucci/pi-minimal-footer@0.1.25`, `@diegopetrucci/pi-notify@0.1.19`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-oracle@0.1.33`, `@diegopetrucci/pi-permission-gate@0.1.18`, `@diegopetrucci/pi-project-mcp-json@0.1.3`, `@diegopetrucci/pi-quiet-tools@0.1.15`, `@diegopetrucci/pi-review@0.1.16`, `@diegopetrucci/pi-todo@0.1.12`, and `@diegopetrucci/pi-triage-comments@0.1.17`.
- [x] No `.pi-fleet-tested-version` markers were changed.

## Target package versions

- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.13`
- [x] `@diegopetrucci/pi-fast@0.1.11`
- [x] `@diegopetrucci/pi-inline-bash@0.1.14`
- [x] `@diegopetrucci/pi-extensions@0.1.81`

## Contributor audit

- [x] Range `v0.1.80..b1ce3ce` has three commits (#177, #183, #186). #177 and #183 are owner-only (Diego Petrucci, GitHub committer, The Last Harness tool trailer). #186 is authored by Den Kong ([@denusklo](https://github.com/denusklo)) with co-authors Diego Petrucci and The Last Harness.
- [x] The public body includes `## Contributors` with exactly one entry: [@denusklo](https://github.com/denusklo) for the Anthropic Fast beta fix and regression tests in [#186](https://github.com/diegopetrucci/pi-extensions/pull/186).

## PRE-COMMIT CANDIDATE validation — completed

The following evidence is for the pre-commit release-preparation candidate in this worktree only (source `b1ce3ce42e10c4a94100536c62f1f906cadf5a80` plus the uncommitted release-prep edits), run in the order shown. It is not the future verified merged-main gate. Raw log: `/tmp/v0181-val.log`.

- [x] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed and added 154 packages. The only npm warning was the known `node-domexception@1.0.0` deprecation.
- [x] `npm run preflight:install-state` passed with 126 installed packages and 29 local package entries matching `package-lock.json`; 18 optional packages were not installed.
- [x] `npm run ci` passed: formatting matched 165 files, typechecking passed, and the test summary was 1,163 total, 1,162 passed, 0 failed, 0 cancelled, and 1 skipped.
- [x] `npm pack --dry-run --ignore-scripts --json` passed; the root package reported 167 entries.
- [x] `npm pack --dry-run --ignore-scripts --json --workspaces` passed for all 28 workspace dry-runs.
- [x] `git diff --check` passed.

This candidate evidence makes no merged-main, live-provider, visual, interactive, fleet, host, or publication claim. No commit, stage, tag, push, GitHub release, workflow dispatch, protected-environment approval, npm publication, or direct `npm publish` was performed.

## Release title and public body

- [x] Exact descriptive title: **Anthropic Fast fix for Claude Opus 5/5.5 and bounded shell checks**.
- [x] Exact public body: `docs/github-release-v0.1.81.md`; summary, `## Highlights`, `## Contributors`, `## Packages`, `## Install`; no internal title, redundant version heading, or `Included docs` section. #177 is not mentioned publicly.
- [x] The release notes, public body, announcement, and checklist retain one identical managed package marker with all four package/version pairs; no unfilled placeholders remain.

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
- [ ] tag exactly `v0.1.81` from verified merged `main` outside this tool
- [ ] push the tag outside this tool
- [ ] create one non-draft GitHub release with the exact title above and the exact body in `docs/github-release-v0.1.81.md`

## Authorized trusted OIDC release actions

- [ ] with an explicit user release request, run `node scripts/publish-release.mjs v0.1.81 --dry-run` and review the exact tag, body, package, and tarball evidence
- [ ] dispatch the trusted `publish.yml` workflow only when the authenticated GitHub identity is permitted, from verified `main`, with the exact release tag in both `release_tag` and `confirmation` fields
- [ ] inspect the verified package plan and confirm the audited contributor evidence and exact public-body/package evidence before approval
- [ ] approve the protected `npm-release` environment deployment only with an eligible authenticated GitHub identity; required reviewers, `main` branch restrictions, and no-self-review protections remain enforced
- [ ] if GitHub rejects the identity's dispatch or approval, escalate to an eligible human; never bypass or disable protection
- [ ] let the workflow publish through npm OIDC only; never run local `npm publish` or use legacy npm token/OTP credentials
- [ ] after verified workflow publication success, wait five minutes before post-publish registry/package-page or npm-install verification
- [ ] after that wait, verify exact public-body parity with `docs/github-release-v0.1.81.md` and contributor-credit parity (exactly @denusklo for #186)

<!-- prepare-release:packages [["@diegopetrucci/pi-dirty-repo-guard","0.1.13"],["@diegopetrucci/pi-fast","0.1.11"],["@diegopetrucci/pi-inline-bash","0.1.14"],["@diegopetrucci/pi-extensions","0.1.81"]] -->
