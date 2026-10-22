This release adds Pi 1.4.0 development compatibility and tool-rendering fixes, including aligned read-range rendering, BOM-safe project MCP configuration, and hardened pruning aliases.

## Highlights

- **Pi 1.4.0 compatibility and catalog updates:** Oracle, Contrarian, and Code Reviewer preference catalogs were refreshed against the Pi 1.4.0 catalog, while automated SDK-isolation fixtures now express the Pi 1.4.0 transcript-tool restoration contract.
- **Tool-rendering read ranges:** `quiet-tools` follows Pi 1.3/1.4 read-range semantics for finite numeric and numeric-string offsets and limits, including open-ended ranges and safe handling of omitted, null, or malformed values.
- **BOM-safe project MCP configuration:** `project-mcp-json` accepts exactly one leading UTF-8 BOM before parsing `.mcp.json`; malformed input remains fail-closed with secret-safe warnings.
- **Pruning alias hardening:** `pi-dynamic-context-pruning` rejects inherited property names as strategy aliases while retaining documented case-insensitive aliases and explicit per-state threshold behavior.

## Packages

- `@diegopetrucci/pi-annotate-last-message@0.1.14`
- `@diegopetrucci/pi-code-reviewer@0.1.16`
- `@diegopetrucci/pi-contrarian@0.1.18`
- `@diegopetrucci/pi-librarian@0.1.21`
- `@diegopetrucci/pi-oracle@0.1.33`
- `@diegopetrucci/pi-project-mcp-json@0.1.3`
- `@diegopetrucci/pi-quiet-tools@0.1.15`
- `@diegopetrucci/pi-triage-comments@0.1.17`
- `pi-dynamic-context-pruning@0.1.15`
- `@diegopetrucci/pi-extensions@0.1.80`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-last-message","0.1.14"],["@diegopetrucci/pi-code-reviewer","0.1.16"],["@diegopetrucci/pi-contrarian","0.1.18"],["@diegopetrucci/pi-librarian","0.1.21"],["@diegopetrucci/pi-oracle","0.1.33"],["@diegopetrucci/pi-project-mcp-json","0.1.3"],["@diegopetrucci/pi-quiet-tools","0.1.15"],["@diegopetrucci/pi-triage-comments","0.1.17"],["pi-dynamic-context-pruning","0.1.15"],["@diegopetrucci/pi-extensions","0.1.80"]] -->
