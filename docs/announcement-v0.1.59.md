# Announcement drafts — v0.1.59

## Short

v0.1.59 packages the audited review/runtime and session-safety fixes across the current extension set, synchronizes the root plus 25 stale standalone fleet markers to Pi `0.81.1`, and refreshes current README example links to canonical upstream Pi URLs. The deterministic release-prep flow selected exactly the 26 tarball-different packages for next-patch publishing; `minimal-footer` keeps its existing `0.81.1` marker but is not republished in this release. Known caveat: `npm audit --omit=dev` still reports the upstream moderate nested `protobufjs@7.6.4` advisory from Pi `0.81.1`'s published `@earendil-works/pi-coding-agent` shrinkwrap.

## Notes

- final validation is complete; npm publishing remains the human-only release step

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.6`
- `@diegopetrucci/pi-annotate-git-diff@0.1.6`
- `@diegopetrucci/pi-annotate-last-message@0.1.4`
- `@diegopetrucci/pi-brrr@0.1.9`
- `@diegopetrucci/pi-claude-fast@0.1.9`
- `@diegopetrucci/pi-code-reviewer@0.1.4`
- `@diegopetrucci/pi-confirm-destructive@0.1.7`
- `@diegopetrucci/pi-context-cap@0.1.6`
- `@diegopetrucci/pi-context-inspector@0.1.8`
- `@diegopetrucci/pi-contrarian@0.1.6`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.6`
- `@diegopetrucci/pi-git-footer@0.1.5`
- `@diegopetrucci/pi-gnosis@0.1.6`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.4`
- `@diegopetrucci/pi-inline-bash@0.1.6`
- `@diegopetrucci/pi-librarian@0.1.11`
- `@diegopetrucci/pi-notify@0.1.12`
- `@diegopetrucci/pi-openai-fast@0.1.11`
- `@diegopetrucci/pi-oracle@0.1.21`
- `@diegopetrucci/pi-permission-gate@0.1.9`
- `@diegopetrucci/pi-quiet-tools@0.1.7`
- `@diegopetrucci/pi-review@0.1.9`
- `@diegopetrucci/pi-todo@0.1.6`
- `@diegopetrucci/pi-triage-comments@0.1.7`
- `pi-dynamic-context-pruning@0.1.2`
- `@diegopetrucci/pi-extensions@0.1.59`

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.6"],["@diegopetrucci/pi-annotate-git-diff","0.1.6"],["@diegopetrucci/pi-annotate-last-message","0.1.4"],["@diegopetrucci/pi-brrr","0.1.9"],["@diegopetrucci/pi-claude-fast","0.1.9"],["@diegopetrucci/pi-code-reviewer","0.1.4"],["@diegopetrucci/pi-confirm-destructive","0.1.7"],["@diegopetrucci/pi-context-cap","0.1.6"],["@diegopetrucci/pi-context-inspector","0.1.8"],["@diegopetrucci/pi-contrarian","0.1.6"],["@diegopetrucci/pi-dirty-repo-guard","0.1.6"],["@diegopetrucci/pi-git-footer","0.1.5"],["@diegopetrucci/pi-gnosis","0.1.6"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.4"],["@diegopetrucci/pi-inline-bash","0.1.6"],["@diegopetrucci/pi-librarian","0.1.11"],["@diegopetrucci/pi-notify","0.1.12"],["@diegopetrucci/pi-openai-fast","0.1.11"],["@diegopetrucci/pi-oracle","0.1.21"],["@diegopetrucci/pi-permission-gate","0.1.9"],["@diegopetrucci/pi-quiet-tools","0.1.7"],["@diegopetrucci/pi-review","0.1.9"],["@diegopetrucci/pi-todo","0.1.6"],["@diegopetrucci/pi-triage-comments","0.1.7"],["pi-dynamic-context-pruning","0.1.2"],["@diegopetrucci/pi-extensions","0.1.59"]] -->
