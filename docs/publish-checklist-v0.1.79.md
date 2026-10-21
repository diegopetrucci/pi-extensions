# Publish checklist — v0.1.79

## Scope and source freeze

- [x] Source was frozen on `bb/make-a-release-thr_8iqesqhxrq` at `ec1e382656e7259a31e4a21dc78646ec53eacf64`; `origin/main` matched that exact commit before preparation writes.
- [x] The pinned registry was `https://registry.npmjs.org`. The exact input `/tmp/pi-extensions-v0.1.79-input.json` selected 17 changed artifacts and assigned the next unpublished patch to each changed workspace; the root target is `@diegopetrucci/pi-extensions@0.1.79`.
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.79-input.json` passed in dry-run mode, and `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.79-input.json --write` passed in write mode. The latter created exactly the four v0.1.79 documents and synchronized selected manifests and lock metadata.
- [x] The unchanged workspace omissions are `@diegopetrucci/pi-brrr@0.1.15`, `@diegopetrucci/pi-claude-fast@0.1.16`, `@diegopetrucci/pi-confirm-destructive@0.1.14`, `@diegopetrucci/pi-dirty-repo-guard@0.1.12`, `@diegopetrucci/pi-gnosis@0.1.12`, `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`, `@diegopetrucci/pi-inline-bash@0.1.13`, `@diegopetrucci/pi-notify@0.1.19`, `@diegopetrucci/pi-openai-fast@0.1.18`, `@diegopetrucci/pi-project-mcp-json@0.1.2`, `@diegopetrucci/pi-quiet-tools@0.1.14`, and `@diegopetrucci/pi-todo@0.1.12`; their manifests and artifacts remain unchanged.
- [x] `package-lock.json` changes only the root and 16 selected workspace version leaves; dependency ranges, resolutions, and all omitted workspace entries remain unchanged.
- [x] All existing `.pi-fleet-tested-version` markers remain byte-for-byte unchanged; no fleet certification or new host claim was added.

## Target package versions

- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.15`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.15`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.13`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.15`
- [x] `@diegopetrucci/pi-context-cap@0.1.16`
- [x] `@diegopetrucci/pi-context-inspector@0.1.17`
- [x] `@diegopetrucci/pi-contrarian@0.1.17`
- [x] `@diegopetrucci/pi-fast@0.1.10`
- [x] `@diegopetrucci/pi-git-footer@0.1.13`
- [x] `@diegopetrucci/pi-librarian@0.1.20`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.25`
- [x] `@diegopetrucci/pi-oracle@0.1.32`
- [x] `@diegopetrucci/pi-permission-gate@0.1.18`
- [x] `@diegopetrucci/pi-review@0.1.16`
- [x] `@diegopetrucci/pi-triage-comments@0.1.16`
- [x] `pi-dynamic-context-pruning@0.1.14`
- [x] `@diegopetrucci/pi-extensions@0.1.79`

## Contributor audit

- [x] `git rev-list --count v0.1.78..ec1e382656e7259a31e4a21dc78646ec53eacf64` returned 16 commits. Commit authors and trailers were audited: 15 commits are authored by repository owner Diego Petrucci, and the external human author is David Alejandro Londoño (`@davidlondono`) on #160.
- [x] GitHub API review confirmed the merged PRs in the range are #151, #152, #153, #154, #156, #160, #161, #162, #163, #164, #165, #166, #167, #168, #169, and #170. All 16 are merged; #160 is the only external-human PR.
- [x] `Co-authored-by` trailers identify The Last Harness and Cursor Agent as tool identities, with repository-owner trailers where present; GitHub automation is the committer. These identities are excluded from public contributor credits. The audited public credit is [@davidlondono](https://github.com/davidlondono) for the direct OpenAI OAuth service-tier behavior, documentation, and tests in [#160](https://github.com/diegopetrucci/pi-extensions/pull/160).

## Validation evidence

- [x] The pre-write `prepare-release` dry-run selected exactly 17 packages in the managed dependency order, checked exact target versions against `https://registry.npmjs.org`, and reported all four documents would be created.
- [x] The authorized write mode selected the same 17 packages, synchronized manifests and `package-lock.json`, and created `docs/release-notes-v0.1.79.md`, `docs/github-release-v0.1.79.md`, `docs/announcement-v0.1.79.md`, and `docs/publish-checklist-v0.1.79.md`.
- [x] The six-command validation evidence below applies to the pre-commit candidate at source `ec1e382656e7259a31e4a21dc78646ec53eacf64`; the later changes in this task are documentation-only and do not alter its package or source evidence.
- [x] The six commands passed in exactly this order:
  1. `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` — 156 packages added; npm emitted the known `node-domexception@1.0.0` deprecation warning.
  2. `npm run preflight:install-state` — 128 installed packages and 29 local package entries matched `package-lock.json`.
  3. `npm run ci` — 1,153 total: 1,152 passed, 0 failed, and 1 skipped.
  4. `npm pack --dry-run --ignore-scripts --json` — the root package reported 167 files.
  5. `npm pack --dry-run --ignore-scripts --json --workspaces` — all 28 workspace dry-runs passed.
  6. `git diff --check` — passed.
- [x] The raw CI output is preserved at `/var/folders/nq/fkrbfck57y91r169_934fxb80000gn/T/pi-bash-79223b690f70a32d.log`; the complete workspace JSON result covers all 28 workspace dry-runs.
- [x] These are pre-commit candidate results only. No merged-main, compatibility, fleet, or host certification is claimed.
- [x] No staged files remain; no commit, tag, push, PR, merge, release, workflow dispatch, environment approval, or npm publication was performed.

## Release title and body

- [x] Exact descriptive title: **350k context defaults, Pi-aligned path guards, and OAuth Fast mode**.
- [x] Exact public body: `docs/github-release-v0.1.79.md`; it begins with a short summary, contains `Highlights`, `Contributors`, `Packages`, and `Install`, and has no internal title or redundant version heading.

## Future merged-main gate — not run here

- [ ] After the intended release-preparation PR is merged, verify the source before running the gate: `git rev-parse --abbrev-ref HEAD` reports `main`; `git rev-parse HEAD` equals the intended merged-main commit; and `git rev-parse origin/main` equals that same commit with no later merge intervening.
- [ ] On that verified intended merged-main commit, run these commands in exactly this order:
  1. `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`
  2. `npm run preflight:install-state`
  3. `npm run ci`
  4. `npm pack --dry-run --ignore-scripts --json`
  5. `npm pack --dry-run --ignore-scripts --json --workspaces`
  6. `git diff --check`
- [ ] This gate is future work and was not run here. It validates merged-main CI, install state, and package artifacts only; it makes no host, runtime, compatibility, fleet, visual, provider, or fleet-marker certification claim.

## Agent-safe follow-up actions

- [ ] Obtain explicit human approval before any commit-creating command, then commit the release-preparation changes outside this task.
- [ ] Push the non-`main` branch and open a PR targeting `main`.
- [ ] Wait for required CI and review PR comments or conflicts; resolve or escalate them before merge.
- [ ] Merge the PR only after the required checks and review pass.
- [ ] Verify the intended merged `main` source as specified above and run the separately authorized future gate.
- [ ] Tag exactly `v0.1.79` from that verified merged `main` commit and push the tag.
- [ ] Create one non-draft GitHub release with the exact title and body above.
- [ ] After the tag and GitHub release exist, run `node scripts/publish-release.mjs v0.1.79 --dry-run`.

## Human-only release actions

- [ ] Before any later PR is merged into `main`, a human dispatches the trusted `publish.yml` workflow from verified `main` with `v0.1.79` in both `release_tag` and `confirmation` fields.
- [ ] A human inspects the verified package plan and approves the protected `npm-release` environment deployment.
- [ ] A human confirms npm publication; only then wait five minutes before registry, package-page, or npm-install verification.
- [ ] Never run `npm publish` directly from this preparation.

## Undo

Use normal human-reviewed VCS restoration for the 17 versioned manifests, `package-lock.json`, and the four new v0.1.79 documents. Do not restore or rewrite source/runtime files, dependencies, old release documents, fleet markers, tags, releases, or registry state.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.15"],["@diegopetrucci/pi-annotate-git-diff","0.1.15"],["@diegopetrucci/pi-annotate-last-message","0.1.13"],["@diegopetrucci/pi-code-reviewer","0.1.15"],["@diegopetrucci/pi-context-cap","0.1.16"],["@diegopetrucci/pi-context-inspector","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.17"],["@diegopetrucci/pi-fast","0.1.10"],["@diegopetrucci/pi-git-footer","0.1.13"],["@diegopetrucci/pi-librarian","0.1.20"],["@diegopetrucci/pi-minimal-footer","0.1.25"],["@diegopetrucci/pi-oracle","0.1.32"],["@diegopetrucci/pi-permission-gate","0.1.18"],["@diegopetrucci/pi-review","0.1.16"],["@diegopetrucci/pi-triage-comments","0.1.16"],["pi-dynamic-context-pruning","0.1.14"],["@diegopetrucci/pi-extensions","0.1.79"]] -->
