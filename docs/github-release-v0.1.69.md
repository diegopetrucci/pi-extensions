Pi Extensions v0.1.69 establishes Pi 0.87.1 development compatibility for canonical session projections and deterministic frontier-model selection.

## Highlights

- **Pi 0.87.1 development compatibility.** Context Inspector and Dynamic Context Pruning use Pi's canonical session projection for current-context omissions/replacements and manual-prune inventory, with safe older-runtime fallbacks retained.
- **Deterministic frontier-model selection.** Oracle, Contrarian, and Code Reviewer refresh provider ladders for Claude Opus 5.5, GPT-6 Sol/Luna, and Grok 4.7 while preserving role-specific fallbacks and tiers.
- **Compatibility unchanged.** Pi 0.87.1 is the development baseline only; all 28 fleet markers remain **Pi 0.84.4**, so this release does not advance fleet certification.

## Packages

- `@diegopetrucci/pi-code-reviewer@0.1.11`
- `@diegopetrucci/pi-context-inspector@0.1.14`
- `@diegopetrucci/pi-contrarian@0.1.13`
- `@diegopetrucci/pi-oracle@0.1.28`
- `pi-dynamic-context-pruning@0.1.10`
- `@diegopetrucci/pi-extensions@0.1.69`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.11"],["@diegopetrucci/pi-context-inspector","0.1.14"],["@diegopetrucci/pi-contrarian","0.1.13"],["@diegopetrucci/pi-oracle","0.1.28"],["pi-dynamic-context-pruning","0.1.10"],["@diegopetrucci/pi-extensions","0.1.69"]] -->
