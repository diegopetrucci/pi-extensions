# Publish checklist — v0.1.80

## Scope and source freeze

- [x] At the frozen pre-write point, source was `0d4a903a034a5b55c3bf4bf19f14e05e7256839a`; `HEAD` and `origin/main` matched, with no source or index drift.
- [x] The pinned registry was `https://registry.npmjs.org`. The exact input `/tmp/pi-extensions-v0.1.80-input.json` selected exactly ten changed artifacts in dependency order, assigned the approved targets below, and confirmed each target version was unpublished during dry-run.
- [x] Authorized write mode selected the same ten artifacts, synchronized their manifests and lockfile version leaves, and created exactly `docs/release-notes-v0.1.80.md`, `docs/github-release-v0.1.80.md`, `docs/announcement-v0.1.80.md`, and `docs/publish-checklist-v0.1.80.md`.
- [x] The 19 unchanged workspace omissions are `@diegopetrucci/pi-agent-workflow-audit@0.1.15`, `@diegopetrucci/pi-annotate-git-diff@0.1.15`, `@diegopetrucci/pi-brrr@0.1.15`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-context-cap@0.1.16`, `@diegopetrucci/pi-context-inspector@0.1.17`, `@diegopetrucci/pi-dirty-repo-guard@0.1.12`, `@diegopetrucci/pi-fast@0.1.10`, `@diegopetrucci/pi-git-footer@0.1.13`, `@diegopetrucci/pi-gnosis@0.1.12`, `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`, `@diegopetrucci/pi-inline-bash@0.1.13`, `@diegopetrucci/pi-minimal-footer@0.1.25`, `@diegopetrucci/pi-notify@0.1.19`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-permission-gate@0.1.18`, `@diegopetrucci/pi-review@0.1.16`, and `@diegopetrucci/pi-todo@0.1.12`; their versions and artifacts remain unchanged.
- [x] `package-lock.json` changes only the root version leaves and the nine selected workspace version leaves; dependency ranges, resolutions, peer ranges, and omitted workspace entries remain unchanged.
- [x] All 29 existing `.pi-fleet-tested-version` markers remain byte-for-byte unchanged; no fleet certification or Pi 1.4.0 marker advancement was added.

## Target package versions

- [x] `@diegopetrucci/pi-annotate-last-message@0.1.14`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.16`
- [x] `@diegopetrucci/pi-contrarian@0.1.18`
- [x] `@diegopetrucci/pi-librarian@0.1.21`
- [x] `@diegopetrucci/pi-oracle@0.1.33`
- [x] `@diegopetrucci/pi-project-mcp-json@0.1.3`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.15`
- [x] `@diegopetrucci/pi-triage-comments@0.1.17`
- [x] `pi-dynamic-context-pruning@0.1.15`
- [x] `@diegopetrucci/pi-extensions@0.1.80`

## Contributor audit

- [x] The merged PR range from v0.1.79 to the frozen source is PRs #172, #173, #174, and #175; the local range contains four commits, one for each PR subject.
- [x] Author and trailer metadata for all four commits was audited: every commit is authored by Diego Petrucci, committed by GitHub automation, and carries only The Last Harness as a tool co-author. No external human author or co-author qualifies for public credit; owner and tool identities are excluded.
- [x] The exact public GitHub body therefore omits an empty `## Contributors` section. It uses the title **Pi 1.4.0 compatibility and tool-rendering fixes** and makes no live-provider, visual, interactive, or fleet claim.

## PRE-COMMIT CANDIDATE validation — completed

The following evidence is for the isolated pre-commit release-preparation candidate only. It is not the future verified merged-main gate. The successful raw log is `/var/folders/nq/fkrbfck57y91r169_934fxb80000gn/T/pi-bash-be408c897e8cc757.log`; the scrubbed run reported sandbox `/tmp/pi-0180-validation.MPADnU`. Later edits to these release documents are documentation-only and do not alter the candidate's source or package evidence.

- [x] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` passed and added 154 packages. The only npm warning was the known `node-domexception@1.0.0` deprecation; the npm upgrade notice was informational.
- [x] `npm run preflight:install-state` passed with 126 installed packages and 29 local package entries matching `package-lock.json`; 18 optional packages were not installed.
- [x] `npm run ci` passed: formatting matched 165 files, typechecking passed, and the test summary was 1,161 total, 1,160 passed, 0 failed, 0 cancelled, and 1 skipped. The one skipped test was the Windows-native check.
- [x] `npm pack --dry-run --ignore-scripts --json` passed; the root package reported 167 entries.
- [x] `npm pack --dry-run --ignore-scripts --json --workspaces` passed for all 28 workspace dry-runs.
- [x] `git diff --check` passed.

No merged-main, live-provider, visual, interactive, fleet, host, or publication certification is claimed. No commit, push, PR, merge, tag, GitHub release, workflow dispatch, protected-environment approval, npm publication, or direct `npm publish` was performed.

## Release title and public body

- [x] Exact descriptive title: **Pi 1.4.0 compatibility and tool-rendering fixes**.
- [x] Exact public body: `docs/github-release-v0.1.80.md`; it begins with a concise summary, contains `## Highlights`, `## Packages`, and `## Install`, and has no internal title, redundant version heading, `Included docs`, or `## Contributors` section.
- [x] The release notes, public body, announcement, and checklist retain the same exact managed package evidence marker containing all ten selected package/version pairs; no unfilled scaffolding placeholders remain.
- [x] No staged files remain after the candidate checks and documentation-only update.

## Future verified merged-main gate — not run here

Every item in this section remains unchecked. The candidate results above must not be reused as merged-main evidence.

- [ ] After the release-preparation PR is merged through the human-reviewed process, verify the source before the gate: `git rev-parse --abbrev-ref HEAD` reports `main`; `git rev-parse HEAD` equals the intended merged-main commit; and `git rev-parse origin/main` equals that same commit with no later merge intervening.
- [ ] On that verified intended merged-main commit, run exactly these six commands in this order:
  1. [ ] `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`
  2. [ ] `npm run preflight:install-state`
  3. [ ] `npm run ci`
  4. [ ] `npm pack --dry-run --ignore-scripts --json`
  5. [ ] `npm pack --dry-run --ignore-scripts --json --workspaces`
  6. [ ] `git diff --check`
- [ ] Confirm all six commands pass before tagging or creating a release. This gate makes no host, runtime, compatibility, fleet, visual, provider, or publication claim beyond its recorded install, CI, and package-artifact results.

## Agent-safe follow-up actions

- [ ] Obtain explicit human approval before any commit-creating command, then commit the release-preparation changes outside this task.
- [ ] Push the non-`main` release-preparation branch and open a PR targeting `main`.
- [ ] Wait for required CI and review PR comments or conflicts; resolve or escalate them before merge.
- [ ] Merge only through the human-reviewed process after the required checks and review pass; no automatic merge.
- [ ] Verify the intended merged `main` source as specified above and run the separately authorized future gate.
- [ ] Tag exactly `v0.1.80` from that verified merged `main` commit and push the tag.
- [ ] Create one non-draft GitHub release with the exact title above and the exact body in `docs/github-release-v0.1.80.md`.
- [ ] Only after tag `v0.1.80` and the non-draft GitHub release exist, run exactly `node scripts/publish-release.mjs v0.1.80 --dry-run`.

## Human-only release actions

- [ ] A human dispatches the trusted `.github/workflows/publish.yml` workflow from verified `main` with `v0.1.80` in both the `release_tag` and `confirmation` fields; workflow dispatch is human-only.
- [ ] A human inspects the verified package plan and approves the protected `npm-release` environment deployment.
- [ ] Never invoke `npm publish` directly from this preparation; publication is performed only by the approved human-controlled workflow.
- [ ] A human confirms npm publication; only then wait five minutes before registry, package-page, or npm-install verification.
- [ ] After that five-minute wait, verify exact public-body parity between the published GitHub release and `docs/github-release-v0.1.80.md`, and exact contributor-credit parity with the audited owner-only result: no `## Contributors` section.

## Undo

If prep-only changes later need to be undone, use normal human-reviewed VCS restoration for the ten versioned manifests, `package-lock.json`, and the four new v0.1.80 documents. This task performs no restoration. Do not restore or rewrite source/runtime files, dependencies, old release documents, fleet markers, tags, releases, or registry state. If a later docs-only public-body or credit correction is needed, save a public-body backup and reverse only that docs-only diff without changing package versions, source, tags, or registry state.

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-last-message","0.1.14"],["@diegopetrucci/pi-code-reviewer","0.1.16"],["@diegopetrucci/pi-contrarian","0.1.18"],["@diegopetrucci/pi-librarian","0.1.21"],["@diegopetrucci/pi-oracle","0.1.33"],["@diegopetrucci/pi-project-mcp-json","0.1.3"],["@diegopetrucci/pi-quiet-tools","0.1.15"],["@diegopetrucci/pi-triage-comments","0.1.17"],["pi-dynamic-context-pruning","0.1.15"],["@diegopetrucci/pi-extensions","0.1.80"]] -->
