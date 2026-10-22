# Announcement drafts — v0.1.80

## Short

v0.1.80 brings Pi 1.4.0 automated development compatibility and catalog updates, tool-rendering read-range fixes, BOM-safe project MCP configuration, and hardened pruning aliases. It is a release-preparation candidate, not a publication or compatibility certification.

Suggested public title: **Pi 1.4.0 compatibility and tool-rendering fixes**.

## Highlights

- Oracle, Contrarian, and Code Reviewer preference catalogs were refreshed against the Pi 1.4.0 catalog, and the automated SDK-isolation fixtures now express the Pi 1.4.0 transcript-tool restoration contract.
- `quiet-tools` now formats finite numeric and numeric-string read offsets and limits using Pi 1.3/1.4 semantics, including open-ended ranges and safe handling of omitted, null, or malformed values.
- `project-mcp-json` accepts exactly one leading UTF-8 BOM before parsing `.mcp.json`; malformed input remains fail-closed with secret-safe warnings.
- `pi-dynamic-context-pruning` rejects inherited property names as strategy aliases while retaining documented case-insensitive aliases and explicit per-state threshold behavior.

## Scope and status

- The pinned public-registry comparison selected exactly the ten package/version pairs listed below. The other 19 workspaces were intentionally omitted and remain at their existing versions; no dependency ranges, resolutions, or fleet markers were changed for omitted workspaces.
- The source was frozen at `0d4a903a034a5b55c3bf4bf19f14e05e7256839a` with `origin/main` matching before preparation writes. The exact input `/tmp/pi-extensions-v0.1.80-input.json` selected the same ten artifacts in dry-run and write mode.
- These are automated development and packaging claims only. No live-provider, visual, interactive, fleet, host, or broader runtime certification is implied.

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

<!-- prepare-release:packages [["@diegopetrucci/pi-annotate-last-message","0.1.14"],["@diegopetrucci/pi-code-reviewer","0.1.16"],["@diegopetrucci/pi-contrarian","0.1.18"],["@diegopetrucci/pi-librarian","0.1.21"],["@diegopetrucci/pi-oracle","0.1.33"],["@diegopetrucci/pi-project-mcp-json","0.1.3"],["@diegopetrucci/pi-quiet-tools","0.1.15"],["@diegopetrucci/pi-triage-comments","0.1.17"],["pi-dynamic-context-pruning","0.1.15"],["@diegopetrucci/pi-extensions","0.1.80"]] -->
