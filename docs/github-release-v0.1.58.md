Fixes the minimal footer on Pi v0.81.1 by removing the startup dependency on Pi's removed public `AuthStorage` export and using the current model-registry auth path for OpenAI Codex usage.

## Highlights

- fixes `@diegopetrucci/pi-minimal-footer` launch failures on Pi v0.81.1 caused by `AuthStorage.create()` no longer being exported
- resolves Codex usage auth through `ctx.modelRegistry.getProviderAuth()` while preserving the real registry receiver
- keeps legacy/stored-auth fallbacks, including OAuth account IDs for the `ChatGPT-Account-Id` usage header
- marks `pi-minimal-footer` as fleet-tested with Pi `0.81.1`
- aligns isolated child-agent session helpers and oracle/contrarian provider catalogs with Pi `0.81.1` SDK/catalog changes
- hardens release prep for npm's `ETARGET`/`No matching version found` response when comparing unpublished package baselines
- publishes the root collection plus standalone package catch-up artifacts that were absent from npm or differed from their current published tarballs

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.5`
- `@diegopetrucci/pi-annotate-git-diff@0.1.5`
- `@diegopetrucci/pi-annotate-last-message@0.1.3`
- `@diegopetrucci/pi-brrr@0.1.8`
- `@diegopetrucci/pi-claude-fast@0.1.8`
- `@diegopetrucci/pi-code-reviewer@0.1.3`
- `@diegopetrucci/pi-confirm-destructive@0.1.6`
- `@diegopetrucci/pi-context-cap@0.1.5`
- `@diegopetrucci/pi-context-inspector@0.1.7`
- `@diegopetrucci/pi-contrarian@0.1.5`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.5`
- `@diegopetrucci/pi-git-footer@0.1.4`
- `@diegopetrucci/pi-gnosis@0.1.5`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.3`
- `@diegopetrucci/pi-inline-bash@0.1.5`
- `@diegopetrucci/pi-librarian@0.1.10`
- `@diegopetrucci/pi-minimal-footer@0.1.15`
- `@diegopetrucci/pi-notify@0.1.11`
- `@diegopetrucci/pi-openai-fast@0.1.10`
- `@diegopetrucci/pi-oracle@0.1.20`
- `@diegopetrucci/pi-permission-gate@0.1.8`
- `@diegopetrucci/pi-quiet-tools@0.1.6`
- `@diegopetrucci/pi-review@0.1.8`
- `@diegopetrucci/pi-todo@0.1.5`
- `@diegopetrucci/pi-triage-comments@0.1.6`
- `pi-dynamic-context-pruning@0.1.1`
- `@diegopetrucci/pi-extensions@0.1.58`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone minimal footer:

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
```

Then reload pi:

```text
/reload
```

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.5"],["@diegopetrucci/pi-annotate-git-diff","0.1.5"],["@diegopetrucci/pi-annotate-last-message","0.1.3"],["@diegopetrucci/pi-brrr","0.1.8"],["@diegopetrucci/pi-claude-fast","0.1.8"],["@diegopetrucci/pi-code-reviewer","0.1.3"],["@diegopetrucci/pi-confirm-destructive","0.1.6"],["@diegopetrucci/pi-context-cap","0.1.5"],["@diegopetrucci/pi-context-inspector","0.1.7"],["@diegopetrucci/pi-contrarian","0.1.5"],["@diegopetrucci/pi-dirty-repo-guard","0.1.5"],["@diegopetrucci/pi-git-footer","0.1.4"],["@diegopetrucci/pi-gnosis","0.1.5"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.3"],["@diegopetrucci/pi-inline-bash","0.1.5"],["@diegopetrucci/pi-librarian","0.1.10"],["@diegopetrucci/pi-minimal-footer","0.1.15"],["@diegopetrucci/pi-notify","0.1.11"],["@diegopetrucci/pi-openai-fast","0.1.10"],["@diegopetrucci/pi-oracle","0.1.20"],["@diegopetrucci/pi-permission-gate","0.1.8"],["@diegopetrucci/pi-quiet-tools","0.1.6"],["@diegopetrucci/pi-review","0.1.8"],["@diegopetrucci/pi-todo","0.1.5"],["@diegopetrucci/pi-triage-comments","0.1.6"],["pi-dynamic-context-pruning","0.1.1"],["@diegopetrucci/pi-extensions","0.1.58"]] -->
