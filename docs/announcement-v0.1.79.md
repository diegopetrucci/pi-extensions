# Announcement drafts — v0.1.79

## Short

v0.1.79 adds 350k context defaults, Pi-aligned path handling, and direct OpenAI OAuth Fast-mode support while trimming unused extension state. It is a release candidate preparation, not a publication or compatibility certification.

Suggested public title: **350k context defaults, Pi-aligned path guards, and OAuth Fast mode**.

## Highlights

- `context-cap` and `minimal-footer` default to 350,000-token thresholds while retaining explicit overrides ([#169](https://github.com/diegopetrucci/pi-extensions/pull/169)).
- Direct OpenAI ChatGPT OAuth requests use `service_tier=priority`; API-key requests retain `fast`, with Codex behavior unchanged ([#160](https://github.com/diegopetrucci/pi-extensions/pull/160)).
- Guarded subagents and permission-gate paths now follow Pi's opened-path behavior while retaining real escape protections, and librarian cache-mode changes persist current preferences ([#154](https://github.com/diegopetrucci/pi-extensions/pull/154), [#156](https://github.com/diegopetrucci/pi-extensions/pull/156), [#161](https://github.com/diegopetrucci/pi-extensions/pull/161), [#167](https://github.com/diegopetrucci/pi-extensions/pull/167)).
- Unused state, metadata, UI declarations, and dead styling were removed across the affected extensions.

## Scope and status

- The pinned-registry comparison selected exactly the 17 package/version pairs listed below; 12 unchanged workspace artifacts were intentionally omitted: `brrr`, `claude-fast`, `confirm-destructive`, `dirty-repo-guard`, `gnosis`, `illustrations-to-explain-things`, `inline-bash`, `notify`, `openai-fast`, `project-mcp-json`, `quiet-tools`, and `todo`.
- [@davidlondono](https://github.com/davidlondono) is credited for the direct OpenAI OAuth service-tier contribution in [#160](https://github.com/diegopetrucci/pi-extensions/pull/160).
- No tag, GitHub release, trusted workflow dispatch, protected environment approval, or npm publication is implied.

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.15`
- `@diegopetrucci/pi-annotate-git-diff@0.1.15`
- `@diegopetrucci/pi-annotate-last-message@0.1.13`
- `@diegopetrucci/pi-code-reviewer@0.1.15`
- `@diegopetrucci/pi-context-cap@0.1.16`
- `@diegopetrucci/pi-context-inspector@0.1.17`
- `@diegopetrucci/pi-contrarian@0.1.17`
- `@diegopetrucci/pi-fast@0.1.10`
- `@diegopetrucci/pi-git-footer@0.1.13`
- `@diegopetrucci/pi-librarian@0.1.20`
- `@diegopetrucci/pi-minimal-footer@0.1.25`
- `@diegopetrucci/pi-oracle@0.1.32`
- `@diegopetrucci/pi-permission-gate@0.1.18`
- `@diegopetrucci/pi-review@0.1.16`
- `@diegopetrucci/pi-triage-comments@0.1.16`
- `pi-dynamic-context-pruning@0.1.14`
- `@diegopetrucci/pi-extensions@0.1.79`

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.15"],["@diegopetrucci/pi-annotate-git-diff","0.1.15"],["@diegopetrucci/pi-annotate-last-message","0.1.13"],["@diegopetrucci/pi-code-reviewer","0.1.15"],["@diegopetrucci/pi-context-cap","0.1.16"],["@diegopetrucci/pi-context-inspector","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.17"],["@diegopetrucci/pi-fast","0.1.10"],["@diegopetrucci/pi-git-footer","0.1.13"],["@diegopetrucci/pi-librarian","0.1.20"],["@diegopetrucci/pi-minimal-footer","0.1.25"],["@diegopetrucci/pi-oracle","0.1.32"],["@diegopetrucci/pi-permission-gate","0.1.18"],["@diegopetrucci/pi-review","0.1.16"],["@diegopetrucci/pi-triage-comments","0.1.16"],["pi-dynamic-context-pruning","0.1.14"],["@diegopetrucci/pi-extensions","0.1.79"]] -->
