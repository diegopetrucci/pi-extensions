# Announcement drafts — v0.1.73

## Short

Pi Extensions v0.1.73 makes annotation feedback more direct and resilient: explicit submissions go to the agent, close recovery keeps unsent drafts, Markdown rendering is safer and theme-aware, and Git revision/file-scope validation plus window lifecycle hardening protect review flows. The release also refreshes development-baseline integration across affected extensions. All 28 fleet markers remain at Pi `0.84.4`; no new compatibility certification is claimed.

Known upstream advisory: Pi 1.0.0's host shrinkwrap retains `brace-expansion@5.0.9` at `node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion`, with advisories `GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, and `GHSA-6j4f-fj2g-mc7p`. This release does not remediate or protect consumers from vulnerabilities in their host runtime; upstream fixes are [pin 5.0.12](https://github.com/earendil-works/pi/commit/0495646a8322ff99ce40ac2f9e15f1f49f56bb11) and [remove shrinkwrap](https://github.com/earendil-works/pi/commit/581e7ba78141a4d8b61cc9d11b8b22ae7e59195e).

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

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.12"],["@diegopetrucci/pi-annotate-git-diff","0.1.12"],["@diegopetrucci/pi-annotate-last-message","0.1.10"],["@diegopetrucci/pi-code-reviewer","0.1.12"],["@diegopetrucci/pi-context-cap","0.1.12"],["@diegopetrucci/pi-context-inspector","0.1.15"],["@diegopetrucci/pi-contrarian","0.1.14"],["@diegopetrucci/pi-fast","0.1.5"],["@diegopetrucci/pi-git-footer","0.1.11"],["@diegopetrucci/pi-librarian","0.1.17"],["@diegopetrucci/pi-minimal-footer","0.1.22"],["@diegopetrucci/pi-oracle","0.1.29"],["@diegopetrucci/pi-permission-gate","0.1.15"],["@diegopetrucci/pi-quiet-tools","0.1.13"],["@diegopetrucci/pi-triage-comments","0.1.13"],["pi-dynamic-context-pruning","0.1.11"],["@diegopetrucci/pi-extensions","0.1.73"]] -->
