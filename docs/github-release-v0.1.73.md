Adds safer annotation workflows and refreshes development-baseline integration across the affected extensions. No new fleet compatibility certification is claimed.

## Highlights

- Annotation UIs send explicit feedback directly to the agent, retain unsent drafts during close recovery, and safely render Markdown with theme-aware fallbacks.
- Git annotation validates advertised revisions and file scopes, terminates Git option parsing, isolates review reads across refreshes, and handles watcher and native-window lifecycle races.
- Host metadata and development-baseline integration are refreshed across the affected agent, context, model, footer, and utility extensions.
- All 28 `.pi-fleet-tested-version` markers remain at Pi `0.84.4`.
- Known upstream advisory: Pi 1.0.0's host shrinkwrap retains `brace-expansion@5.0.9` at `node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion`, with advisories `GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, and `GHSA-6j4f-fj2g-mc7p`. This release does not remediate or protect consumers from vulnerabilities in their host runtime; upstream fixes are [pin 5.0.12](https://github.com/earendil-works/pi/commit/0495646a8322ff99ce40ac2f9e15f1f49f56bb11) and [remove shrinkwrap](https://github.com/earendil-works/pi/commit/581e7ba78141a4d8b61cc9d11b8b22ae7e59195e).

## Packages

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

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.12"],["@diegopetrucci/pi-annotate-git-diff","0.1.12"],["@diegopetrucci/pi-annotate-last-message","0.1.10"],["@diegopetrucci/pi-code-reviewer","0.1.12"],["@diegopetrucci/pi-context-cap","0.1.12"],["@diegopetrucci/pi-context-inspector","0.1.15"],["@diegopetrucci/pi-contrarian","0.1.14"],["@diegopetrucci/pi-fast","0.1.5"],["@diegopetrucci/pi-git-footer","0.1.11"],["@diegopetrucci/pi-librarian","0.1.17"],["@diegopetrucci/pi-minimal-footer","0.1.22"],["@diegopetrucci/pi-oracle","0.1.29"],["@diegopetrucci/pi-permission-gate","0.1.15"],["@diegopetrucci/pi-quiet-tools","0.1.13"],["@diegopetrucci/pi-triage-comments","0.1.13"],["pi-dynamic-context-pruning","0.1.11"],["@diegopetrucci/pi-extensions","0.1.73"]] -->
