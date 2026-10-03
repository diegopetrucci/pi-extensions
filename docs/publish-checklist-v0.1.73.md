# Publish checklist — v0.1.73

## Scope

- Annotation UIs now send explicit feedback directly to the agent, preserve unsent drafts during close recovery, and render Markdown with safer theme-aware fallbacks.
- Git annotation validates advertised revisions and file scopes, terminates Git option parsing, isolates refresh reads, and cleans up watcher/native-window lifecycle races.
- Development-baseline integration and host metadata were refreshed across the affected extensions.
- All 28 `.pi-fleet-tested-version` markers remain at Pi `0.84.4`; no new compatibility certification is claimed.

## Target package versions

- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.12`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.12`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.10`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.12`
- [x] `@diegopetrucci/pi-context-cap@0.1.12`
- [x] `@diegopetrucci/pi-context-inspector@0.1.15`
- [x] `@diegopetrucci/pi-contrarian@0.1.14`
- [x] `@diegopetrucci/pi-fast@0.1.5`
- [x] `@diegopetrucci/pi-git-footer@0.1.11`
- [x] `@diegopetrucci/pi-librarian@0.1.17`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.22`
- [x] `@diegopetrucci/pi-oracle@0.1.29`
- [x] `@diegopetrucci/pi-permission-gate@0.1.15`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.13`
- [x] `@diegopetrucci/pi-triage-comments@0.1.13`
- [x] `pi-dynamic-context-pruning@0.1.11`
- [x] `@diegopetrucci/pi-extensions@0.1.73`

## Validation evidence

- [x] `npm ci` passed before and after release preparation; npm's install summary reported the same high-severity finding
- [x] Earlier release-preparation audit evidence failed (exit 1) for the only reported high-severity finding: `brace-expansion@5.0.9` at `node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion`; this is an approved exception, not a clean audit or remediation
- [x] `npm run preflight:install-state` passed both times; 240 installed packages and 28 local package entries matched `package-lock.json`
- [x] Existing dry-run evidence from `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.73-input.json`: exactly 16 standalone packages were selected because their local package payloads differed from the published registry baselines; unchanged standalone packages were excluded, and the changed root umbrella was included as the seventeenth target. This is the intended patch-only scope; no new write was run for this follow-up
- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.73-input.json --write` passed; selected manifests, lock metadata, and all four v0.1.73 document scaffolds were updated/created without changing fleet markers
- [x] The ticket-local annotation command passed: 61 tests, 61 passed, 0 failed, and 0 skipped
- [x] `git diff --check` passed
- [x] no files are staged
- [x] all 28 fleet markers remain at Pi `0.84.4`
- [x] Final validation rerun passed `npm ci`, `npm run typecheck`, `npm run preflight:install-state` (240 installed packages and 28 local package entries), `npm explain brace-expansion`, and `npm test` (838 total: 837 passed, 1 skipped, 0 failed)
- [x] Final raw audit result remained failed (exit 1) with one high-severity vulnerability and exactly the three advisories listed below; this is not a clean audit or remediation
- [x] Separate strict exception acceptance check passed by accepting only those three advisories under the approved exception; acceptance does not make the raw audit clean
- [x] Fresh `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org --workspaces --include-workspace-root` output was parsed as JSON and contained 28 package identities, not 25:
  - `@diegopetrucci/pi-extensions@0.1.73`
  - `@diegopetrucci/pi-agent-workflow-audit@0.1.12`
  - `@diegopetrucci/pi-annotate-git-diff@0.1.12`
  - `@diegopetrucci/pi-annotate-last-message@0.1.10`
  - `@diegopetrucci/pi-brrr@0.1.14`
  - `@diegopetrucci/pi-claude-fast@0.1.15`
  - `@diegopetrucci/pi-code-reviewer@0.1.12`
  - `@diegopetrucci/pi-confirm-destructive@0.1.12`
  - `@diegopetrucci/pi-context-cap@0.1.12`
  - `@diegopetrucci/pi-context-inspector@0.1.15`
  - `@diegopetrucci/pi-contrarian@0.1.14`
  - `@diegopetrucci/pi-dirty-repo-guard@0.1.11`
  - `pi-dynamic-context-pruning@0.1.11`
  - `@diegopetrucci/pi-fast@0.1.5`
  - `@diegopetrucci/pi-git-footer@0.1.11`
  - `@diegopetrucci/pi-gnosis@0.1.11`
  - `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`
  - `@diegopetrucci/pi-inline-bash@0.1.11`
  - `@diegopetrucci/pi-librarian@0.1.17`
  - `@diegopetrucci/pi-minimal-footer@0.1.22`
  - `@diegopetrucci/pi-notify@0.1.18`
  - `@diegopetrucci/pi-openai-fast@0.1.17`
  - `@diegopetrucci/pi-oracle@0.1.29`
  - `@diegopetrucci/pi-permission-gate@0.1.15`
  - `@diegopetrucci/pi-quiet-tools@0.1.13`
  - `@diegopetrucci/pi-review@0.1.14`
  - `@diegopetrucci/pi-todo@0.1.11`
  - `@diegopetrucci/pi-triage-comments@0.1.13`
- [x] Final `git diff --check` passed and `git diff --cached --name-only` returned no files

## Approved upstream audit exception

The failed audit identified only `GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, and `GHSA-6j4f-fj2g-mc7p`, all at `node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion` (`5.0.9`) below `minimatch@10.2.6`. Pi 1.0.0's bundled npm shrinkwrap pins the nested version, and lockfile edits or npm overrides do not survive `npm ci`; dependency manifests, lockfile, and installed package state therefore remain unchanged for this release.

The exception is explicitly approved and is not a claim of zero vulnerabilities or remediation. Upstream fixes are [0495646a83](https://github.com/earendil-works/pi/commit/0495646a8322ff99ce40ac2f9e15f1f49f56bb11) (pin `brace-expansion` to `5.0.12`) and [581e7ba781](https://github.com/earendil-works/pi/commit/581e7ba78141a4d8b61cc9d11b8b22ae7e59195e) (remove the npm shrinkwrap and recommend the managed installer), verified read-only. The extension packages do not carry or repair the Pi host runtime dependency, so this release does not protect consumers from vulnerabilities in their host runtime.

## Public GitHub release

- [ ] Create the GitHub release from `docs/github-release-v0.1.73.md` with the exact public title **Safer annotation workflows and development-baseline updates**
- [ ] Keep `docs/github-release-v0.1.73.md` as the exact public release body; it intentionally contains no internal title or validation-only prose

## Agent-safe follow-up actions

Complete these steps in order:

1. [ ] Seek explicit approval before creating the release commit.
2. [ ] Commit the release preparation changes on `release/v0.1.73`.
3. [ ] Push branch `release/v0.1.73`.
4. [ ] Open a pull request from `release/v0.1.73` targeting `main`.
5. [ ] Wait for CI and CodeQL to pass.
6. [ ] Merge the pull request into `main`.
7. [ ] Tag the merged `main` commit as `v0.1.73`.
8. [ ] Push tag `v0.1.73`.
9. [ ] Create a non-draft GitHub release with the exact title **Safer annotation workflows and development-baseline updates**, using `docs/github-release-v0.1.73.md` as the exact body.
10. [ ] Run `scripts/publish-release.mjs v0.1.73 --dry-run`.

## Human-only release actions

- [ ] Keep npm publication human-only: a human must dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields.
- [ ] Inspect the verified package plan and approve the `npm-release` environment deployment; do not run `npm publish` directly.

## Post-publish validation

- [ ] after human confirmation, wait five minutes before registry/install validation
- [ ] verify released registry versions, hashes, provenance, and expected `latest` tags
- [ ] perform fresh installs of the released artifacts in clean directories and load them

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.12"],["@diegopetrucci/pi-annotate-git-diff","0.1.12"],["@diegopetrucci/pi-annotate-last-message","0.1.10"],["@diegopetrucci/pi-code-reviewer","0.1.12"],["@diegopetrucci/pi-context-cap","0.1.12"],["@diegopetrucci/pi-context-inspector","0.1.15"],["@diegopetrucci/pi-contrarian","0.1.14"],["@diegopetrucci/pi-fast","0.1.5"],["@diegopetrucci/pi-git-footer","0.1.11"],["@diegopetrucci/pi-librarian","0.1.17"],["@diegopetrucci/pi-minimal-footer","0.1.22"],["@diegopetrucci/pi-oracle","0.1.29"],["@diegopetrucci/pi-permission-gate","0.1.15"],["@diegopetrucci/pi-quiet-tools","0.1.13"],["@diegopetrucci/pi-triage-comments","0.1.13"],["pi-dynamic-context-pruning","0.1.11"],["@diegopetrucci/pi-extensions","0.1.73"]] -->
