# Publish checklist — v0.1.76

## Scope

- Catch-up release: `@diegopetrucci/pi-extensions@0.1.75` was tagged and released on GitHub but never published, because 17 PRs (#110–#132) merged to `main` before the trusted workflow ran and it requires `main` to match the tag. `pi-fast@0.1.7` and `pi-project-mcp-json@0.1.0` were published from v0.1.75.
- Selects 27 changed workspaces plus the collection, matching `git diff v0.1.75..main` per package; #125 (Oxfmt) merged during the first release PR's CI, so `main` was merged into `release/v0.1.76` and `dirty-repo-guard`, `minimal-footer`, `quiet-tools`, and `todo` were added. `claude-fast` and `openai-fast` are published as deprecation-notice stubs (#112).
- Fleet markers are unchanged (27 at `0.84.4`, `project-mcp-json` at `1.0.0`); no new compatibility certification is claimed.
- Contributor audit for `v0.1.75..main`: all merged PRs are by the repository owner; commit co-authors are `Cursor Agent` and The Last Harness (bots/tools). The `## Contributors` section is omitted.
- No new packages; every target package already exists on npm with trusted publishing, so no manual bootstrap is needed.

## Target package versions

- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.13`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.13`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.11`
- [x] `@diegopetrucci/pi-brrr@0.1.15`
- [x] `@diegopetrucci/pi-claude-fast@0.1.16`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.13`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.13`
- [x] `@diegopetrucci/pi-context-cap@0.1.13`
- [x] `@diegopetrucci/pi-context-inspector@0.1.16`
- [x] `@diegopetrucci/pi-contrarian@0.1.15`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.12`
- [x] `@diegopetrucci/pi-fast@0.1.8`
- [x] `@diegopetrucci/pi-git-footer@0.1.12`
- [x] `@diegopetrucci/pi-gnosis@0.1.12`
- [x] `@diegopetrucci/pi-inline-bash@0.1.12`
- [x] `@diegopetrucci/pi-librarian@0.1.18`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.23`
- [x] `@diegopetrucci/pi-notify@0.1.19`
- [x] `@diegopetrucci/pi-openai-fast@0.1.18`
- [x] `@diegopetrucci/pi-oracle@0.1.30`
- [x] `@diegopetrucci/pi-permission-gate@0.1.16`
- [x] `@diegopetrucci/pi-project-mcp-json@0.1.1`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.14`
- [x] `@diegopetrucci/pi-review@0.1.15`
- [x] `@diegopetrucci/pi-todo@0.1.12`
- [x] `@diegopetrucci/pi-triage-comments@0.1.14`
- [x] `pi-dynamic-context-pruning@0.1.12`
- [x] `@diegopetrucci/pi-extensions@0.1.76`

## Validation evidence

- [x] `npm ci` completed before validation; no dependency remediation was applied
- [x] `npm run preflight:install-state` passed with 242 installed packages and 29 local package entries checked (after merging #125)
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.76-input.json` dry-run selected exactly the 28 target packages
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.76-input.json --write` updated 28 manifests and `package-lock.json` and created the four v0.1.76 documents without changing fleet markers
- [x] `npm run ci` (now including `format:check`) passed: 934 tests, 933 passed, 0 failed, 1 skipped
- [x] `npm pack --dry-run --json --ignore-scripts` passed for all 29 packages; the collection tarball contains no `docs/`, `.tickets`, `.npmrc`, or `*.tgz`
- [x] `git diff --check` passed
- [x] no staged files before the release commit
- [x] Raw `npm audit` reports one high-severity vulnerability at nested `brace-expansion` (`GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`) under `@earendil-works/pi-coding-agent`; not a clean audit, no remediation claimed
- [x] Human approval was recorded to carry forward the existing upstream `brace-expansion` audit exception (approved for v0.1.75; this release replaces its unpublished collection)

## Public GitHub release

- [ ] Create the GitHub release from `docs/github-release-v0.1.76.md` with the exact public title **Collection catch-up: Ultrafast, project .mcp.json, and fixes**
- [ ] Add a note to the v0.1.75 GitHub release that its collection package was published as v0.1.76

## Agent-safe follow-up actions

- [x] seek explicit approval before creating the release commit
- [ ] commit the release preparation changes on `release/v0.1.76`
- [ ] push the release branch and open a pull request targeting `main`
- [ ] wait for CI and CodeQL to pass, then merge
- [ ] confirm no other PR merged between the release PR and tagging; tag the merged `main` commit as `v0.1.76` and push the tag
- [ ] create a non-draft GitHub release with the exact title above, using `docs/github-release-v0.1.76.md` as the exact body
- [ ] run `scripts/publish-release.mjs v0.1.76 --dry-run`

## Human-only release actions

- [ ] Dispatch the trusted `publish.yml` workflow from `main` with `v0.1.76` in both confirmation fields **before merging any other PR to `main`**; the workflow requires `main` to match the tag for every selected package
- [ ] Inspect the verified package plan and approve the protected `npm-release` environment deployment
- [ ] Do not run `npm publish` directly

## Undo

To undo these release-only changes, use normal VCS restoration for the 28 package manifests, `package-lock.json`, and the four new v0.1.76 documents. No fleet marker changes are part of this release.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.13"],["@diegopetrucci/pi-annotate-git-diff","0.1.13"],["@diegopetrucci/pi-annotate-last-message","0.1.11"],["@diegopetrucci/pi-brrr","0.1.15"],["@diegopetrucci/pi-claude-fast","0.1.16"],["@diegopetrucci/pi-code-reviewer","0.1.13"],["@diegopetrucci/pi-confirm-destructive","0.1.13"],["@diegopetrucci/pi-context-cap","0.1.13"],["@diegopetrucci/pi-context-inspector","0.1.16"],["@diegopetrucci/pi-contrarian","0.1.15"],["@diegopetrucci/pi-dirty-repo-guard","0.1.12"],["@diegopetrucci/pi-fast","0.1.8"],["@diegopetrucci/pi-git-footer","0.1.12"],["@diegopetrucci/pi-gnosis","0.1.12"],["@diegopetrucci/pi-inline-bash","0.1.12"],["@diegopetrucci/pi-librarian","0.1.18"],["@diegopetrucci/pi-minimal-footer","0.1.23"],["@diegopetrucci/pi-notify","0.1.19"],["@diegopetrucci/pi-openai-fast","0.1.18"],["@diegopetrucci/pi-oracle","0.1.30"],["@diegopetrucci/pi-permission-gate","0.1.16"],["@diegopetrucci/pi-project-mcp-json","0.1.1"],["@diegopetrucci/pi-quiet-tools","0.1.14"],["@diegopetrucci/pi-review","0.1.15"],["@diegopetrucci/pi-todo","0.1.12"],["@diegopetrucci/pi-triage-comments","0.1.14"],["pi-dynamic-context-pruning","0.1.12"],["@diegopetrucci/pi-extensions","0.1.76"]] -->
