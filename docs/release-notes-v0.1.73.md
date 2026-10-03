# Release notes — v0.1.73

## Highlights

- Annotation workflows now send explicit feedback directly to the agent, retain unsent drafts during close recovery, and provide safer Markdown rendering with theme-aware fallbacks.
- `annotate-git-diff` validates advertised revisions and file scopes, terminates Git option parsing, isolates review reads across refreshes, and cleans up watchers and native windows across lifecycle races.
- The release refreshes host metadata and development-baseline integration across the affected agent, context, model, footer, and utility extensions.
- All 28 `.pi-fleet-tested-version` markers remain at Pi `0.84.4`; this release does not claim a new compatibility certification.

## Known upstream audit exception

Earlier release-preparation audit evidence failed (exit 1) for the only reported high-severity finding: `brace-expansion@5.0.9` at `node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion`, below `minimatch@10.2.6`. The finding is limited to `GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, and `GHSA-6j4f-fj2g-mc7p`.

Pi 1.0.0's bundled npm shrinkwrap pins this nested version; a lockfile edit or npm override does not survive `npm ci`. This release deliberately leaves the dependency manifests, lockfile, and installed package state unchanged. The approved exception is not an audit pass or remediation. Upstream fixes are [0495646a83](https://github.com/earendil-works/pi/commit/0495646a8322ff99ce40ac2f9e15f1f49f56bb11) (pin `brace-expansion` to `5.0.12`) and [581e7ba781](https://github.com/earendil-works/pi/commit/581e7ba78141a4d8b61cc9d11b8b22ae7e59195e) (remove the npm shrinkwrap and recommend the managed installer), verified read-only.

The extension packages do not carry or repair the Pi host runtime dependency, so this release does not protect consumers from vulnerabilities in their host runtime.

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.12`
- `@diegopetrucci/pi-annotate-git-diff@0.1.12`
- `@diegopetrucci/pi-annotate-last-message@0.1.10`
- `@diegopetrucci/pi-code-reviewer@0.1.12`
- `@diegopetrucci/pi-context-cap@0.1.12`
- `@diegopetrucci/pi-context-inspector@0.1.15`
- `@diegopetrucci/pi-contrarian@0.1.14`
- `@diegopetrucci/pi-fast@0.1.5`
- `@diegopetrucci/pi-git-footer@0.1.11`
- `@diegopetrucci/pi-librarian@0.1.17`
- `@diegopetrucci/pi-minimal-footer@0.1.22`
- `@diegopetrucci/pi-oracle@0.1.29`
- `@diegopetrucci/pi-permission-gate@0.1.15`
- `@diegopetrucci/pi-quiet-tools@0.1.13`
- `@diegopetrucci/pi-triage-comments@0.1.13`
- `pi-dynamic-context-pruning@0.1.11`
- `@diegopetrucci/pi-extensions@0.1.73`

## Validation

- Earlier release-preparation audit evidence failed (exit 1) for exactly the one high-severity finding documented above; the release accepts it as a narrow approved exception, not a clean audit or remediation.
- `npm ci` passed before and after release preparation; npm's install summary reported the same high-severity finding.
- `npm run preflight:install-state` passed both times, checking 240 installed packages and 28 local package entries against `package-lock.json`.
- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.73-input.json` passed in dry-run mode and selected exactly the 16 registry-detected changed standalone packages plus the root package, in dependency order.
- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.73-input.json --write` passed, updated the selected manifests and matching lock metadata, and created the four v0.1.73 release documents without changing fleet markers.
- The ticket-local annotation command passed: 61 tests, 61 passed, 0 failed, and 0 skipped.
- `git diff --check` passed and no files were staged.
- Final validation rerun passed `npm ci`, `npm run typecheck`, `npm run preflight:install-state` (240 installed packages and 28 local package entries), `npm explain brace-expansion`, and `npm test` (838 total: 837 passed, 1 skipped, 0 failed).
- Final raw audit result: failed (exit 1) with one high-severity vulnerability and exactly the three advisories listed above. A separate strict exception acceptance check passed by accepting only those three advisories under the approved exception; the audit remains non-clean and this is not remediation.
- Fresh `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org --workspaces --include-workspace-root` output was parsed as JSON and contained 28 package identities, not 25:
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
- Final `git diff --check` passed and `git diff --cached --name-only` returned no files.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.12"],["@diegopetrucci/pi-annotate-git-diff","0.1.12"],["@diegopetrucci/pi-annotate-last-message","0.1.10"],["@diegopetrucci/pi-code-reviewer","0.1.12"],["@diegopetrucci/pi-context-cap","0.1.12"],["@diegopetrucci/pi-context-inspector","0.1.15"],["@diegopetrucci/pi-contrarian","0.1.14"],["@diegopetrucci/pi-fast","0.1.5"],["@diegopetrucci/pi-git-footer","0.1.11"],["@diegopetrucci/pi-librarian","0.1.17"],["@diegopetrucci/pi-minimal-footer","0.1.22"],["@diegopetrucci/pi-oracle","0.1.29"],["@diegopetrucci/pi-permission-gate","0.1.15"],["@diegopetrucci/pi-quiet-tools","0.1.13"],["@diegopetrucci/pi-triage-comments","0.1.13"],["pi-dynamic-context-pruning","0.1.11"],["@diegopetrucci/pi-extensions","0.1.73"]] -->
