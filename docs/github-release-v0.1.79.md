This release adds 350k context defaults, Pi-aligned path handling, and direct OpenAI OAuth Fast-mode support while trimming unused extension state.

## Highlights

- **350k context defaults:** `context-cap` now defaults to a 350,000-token effective context cap, and `minimal-footer` now defaults its `DUMB ZONE` threshold to 350,000 tokens. Explicit overrides remain supported ([#169](https://github.com/diegopetrucci/pi-extensions/pull/169)).
- **OpenAI OAuth Fast mode:** direct OpenAI requests authenticated with Pi ChatGPT OAuth now use `service_tier=priority`; API-key requests retain `fast`, and Codex behavior is unchanged ([#160](https://github.com/diegopetrucci/pi-extensions/pull/160)).
- **Pi-aligned path handling:** guarded subagents and the permission gate remove legacy checks for paths Pi does not open while retaining real checkout-escape and symlink protections. Librarian cache-mode changes now persist current in-memory preferences ([#154](https://github.com/diegopetrucci/pi-extensions/pull/154), [#156](https://github.com/diegopetrucci/pi-extensions/pull/156), [#161](https://github.com/diegopetrucci/pi-extensions/pull/161), [#167](https://github.com/diegopetrucci/pi-extensions/pull/167)).
- **Lean state and maintenance:** unused audit, report, footer, usage, UI-type, and markdown-style state was removed while focused tests and documentation stayed aligned.

## Contributors

- [@davidlondono](https://github.com/davidlondono) contributed the direct OpenAI OAuth service-tier behavior, documentation, and tests in [#160](https://github.com/diegopetrucci/pi-extensions/pull/160).

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

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.15"],["@diegopetrucci/pi-annotate-git-diff","0.1.15"],["@diegopetrucci/pi-annotate-last-message","0.1.13"],["@diegopetrucci/pi-code-reviewer","0.1.15"],["@diegopetrucci/pi-context-cap","0.1.16"],["@diegopetrucci/pi-context-inspector","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.17"],["@diegopetrucci/pi-fast","0.1.10"],["@diegopetrucci/pi-git-footer","0.1.13"],["@diegopetrucci/pi-librarian","0.1.20"],["@diegopetrucci/pi-minimal-footer","0.1.25"],["@diegopetrucci/pi-oracle","0.1.32"],["@diegopetrucci/pi-permission-gate","0.1.18"],["@diegopetrucci/pi-review","0.1.16"],["@diegopetrucci/pi-triage-comments","0.1.16"],["pi-dynamic-context-pruning","0.1.14"],["@diegopetrucci/pi-extensions","0.1.79"]] -->
