This release certifies all 28 packages against Pi 0.84.4, adds conservative PowerShell protection, and repairs the packaged native annotation UI across normal Node Pi and official Pi SEA builds.

## Highlights

- **Pi 0.84.4 fleet certification.** Every compatibility marker advances from Pi 0.84.2 to 0.84.4, with explicit runtime coverage of the intervening 0.84.3 release. The audit covered prompt lifecycle events, terminal capability overrides, bundled entrypoints, root Markdown skills, model persistence, RPC behavior, and the optional PowerShell tool.
- **PowerShell safety.** `permission-gate` now analyzes the `powershell` tool with bounded lexical checks everywhere and native PowerShell AST parsing on Windows. Malformed, dynamic, nested, splatted, resolution-mutating, and otherwise unanalyzable commands require confirmation or fail closed without a UI; benign literal text and definitely enabled `-WhatIf` removals remain allowed.
- **Packaged `/annotate-git-diff`.** Tailwind and Monaco no longer depend on fragile SEA module resolution or `file://` loading. The extension discovers its declared packaged runtimes and serves Monaco's complete asset graph from an ephemeral, tokenized server bound only to `127.0.0.1`, with no CDN dependency and cleanup on submit, cancel, error, close, or Pi shutdown.
- **Native lifecycle hardening.** Both annotation extensions prevent duplicate startup, buffer Glimpse failures without fatal unhandled `error` events, close normally after real submit/cancel messages, and suppress late windows after shutdown.
- **Current frontier catalogs.** Oracle and Contrarian keep synchronized curated ladders that match Pi 0.84.4's pinned provider catalog, including current Kimi K3, GLM 5.3, GPT-5.6, and DeepSeek V4 Pro variants.

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.11`
- `@diegopetrucci/pi-annotate-git-diff@0.1.11`
- `@diegopetrucci/pi-annotate-last-message@0.1.9`
- `@diegopetrucci/pi-brrr@0.1.14`
- `@diegopetrucci/pi-claude-fast@0.1.15`
- `@diegopetrucci/pi-code-reviewer@0.1.9`
- `@diegopetrucci/pi-confirm-destructive@0.1.12`
- `@diegopetrucci/pi-context-cap@0.1.11`
- `@diegopetrucci/pi-context-inspector@0.1.13`
- `@diegopetrucci/pi-contrarian@0.1.11`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.11`
- `@diegopetrucci/pi-fast@0.1.2`
- `@diegopetrucci/pi-git-footer@0.1.10`
- `@diegopetrucci/pi-gnosis@0.1.11`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.9`
- `@diegopetrucci/pi-inline-bash@0.1.11`
- `@diegopetrucci/pi-librarian@0.1.16`
- `@diegopetrucci/pi-minimal-footer@0.1.20`
- `@diegopetrucci/pi-notify@0.1.18`
- `@diegopetrucci/pi-openai-fast@0.1.17`
- `@diegopetrucci/pi-oracle@0.1.26`
- `@diegopetrucci/pi-permission-gate@0.1.14`
- `@diegopetrucci/pi-quiet-tools@0.1.12`
- `@diegopetrucci/pi-review@0.1.14`
- `@diegopetrucci/pi-todo@0.1.11`
- `@diegopetrucci/pi-triage-comments@0.1.12`
- `pi-dynamic-context-pruning@0.1.8`
- `@diegopetrucci/pi-extensions@0.1.66`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.11"],["@diegopetrucci/pi-annotate-git-diff","0.1.11"],["@diegopetrucci/pi-annotate-last-message","0.1.9"],["@diegopetrucci/pi-brrr","0.1.14"],["@diegopetrucci/pi-claude-fast","0.1.15"],["@diegopetrucci/pi-code-reviewer","0.1.9"],["@diegopetrucci/pi-confirm-destructive","0.1.12"],["@diegopetrucci/pi-context-cap","0.1.11"],["@diegopetrucci/pi-context-inspector","0.1.13"],["@diegopetrucci/pi-contrarian","0.1.11"],["@diegopetrucci/pi-dirty-repo-guard","0.1.11"],["@diegopetrucci/pi-fast","0.1.2"],["@diegopetrucci/pi-git-footer","0.1.10"],["@diegopetrucci/pi-gnosis","0.1.11"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.9"],["@diegopetrucci/pi-inline-bash","0.1.11"],["@diegopetrucci/pi-librarian","0.1.16"],["@diegopetrucci/pi-minimal-footer","0.1.20"],["@diegopetrucci/pi-notify","0.1.18"],["@diegopetrucci/pi-openai-fast","0.1.17"],["@diegopetrucci/pi-oracle","0.1.26"],["@diegopetrucci/pi-permission-gate","0.1.14"],["@diegopetrucci/pi-quiet-tools","0.1.12"],["@diegopetrucci/pi-review","0.1.14"],["@diegopetrucci/pi-todo","0.1.11"],["@diegopetrucci/pi-triage-comments","0.1.12"],["pi-dynamic-context-pruning","0.1.8"],["@diegopetrucci/pi-extensions","0.1.66"]] -->
