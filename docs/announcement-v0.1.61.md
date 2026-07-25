# Announcement — v0.1.61

## Short

v0.1.61 packages the Pi `0.82.1` compatibility update for the root package plus 26 standalone extensions whose publish tarballs changed. It prefers `claude-opus-5` ahead of older Claude frontier fallbacks in `@diegopetrucci/pi-oracle`, `@diegopetrucci/pi-contrarian`, and `@diegopetrucci/pi-code-reviewer`, updates the supporting provider policy contract coverage, oracle provider matrix, and agent workflow audit renderer compatibility work for Pi `0.82.1`, updates all 27 `.pi-fleet-tested-version` markers to Pi `0.82.1`, and bumps the selected packages to their next unpublished patch versions.

## Notes

- final tlh validation passed with 519/519 full-suite tests, 4/4 focused provider-catalog checks, and 1/1 tarball/runtime smoke coverage
- `npm audit` reports an upstream high-severity denial-of-service advisory for `brace-expansion<=5.0.7`, nested under published `@earendil-works/pi-coding-agent@0.82.1`
- exact `npm view <name>@<target> version --json` checks confirmed all 27 target versions remain unpublished
- `npm pack --dry-run --json` and `npm publish --dry-run --ignore-scripts --access public` passed for the root package plus all 26 standalone targets with `packages=27`, `totalFiles=305`, `totalTarballBytes=2435358`, `totalUnpackedBytes=4102034`, and `suspiciousTotal=0`
- dry-run tarball file lists excluded `.tickets/`, `.pi-subagents/`, release-doc files under `docs/`, `*.tgz` paths, and `.npmrc`

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.8`
- `@diegopetrucci/pi-annotate-git-diff@0.1.8`
- `@diegopetrucci/pi-annotate-last-message@0.1.6`
- `@diegopetrucci/pi-brrr@0.1.11`
- `@diegopetrucci/pi-claude-fast@0.1.11`
- `@diegopetrucci/pi-code-reviewer@0.1.6`
- `@diegopetrucci/pi-confirm-destructive@0.1.9`
- `@diegopetrucci/pi-context-cap@0.1.8`
- `@diegopetrucci/pi-context-inspector@0.1.10`
- `@diegopetrucci/pi-contrarian@0.1.8`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.8`
- `@diegopetrucci/pi-git-footer@0.1.7`
- `@diegopetrucci/pi-gnosis@0.1.8`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.6`
- `@diegopetrucci/pi-inline-bash@0.1.8`
- `@diegopetrucci/pi-librarian@0.1.13`
- `@diegopetrucci/pi-minimal-footer@0.1.17`
- `@diegopetrucci/pi-notify@0.1.14`
- `@diegopetrucci/pi-openai-fast@0.1.13`
- `@diegopetrucci/pi-oracle@0.1.23`
- `@diegopetrucci/pi-permission-gate@0.1.11`
- `@diegopetrucci/pi-quiet-tools@0.1.9`
- `@diegopetrucci/pi-review@0.1.11`
- `@diegopetrucci/pi-todo@0.1.8`
- `@diegopetrucci/pi-triage-comments@0.1.9`
- `pi-dynamic-context-pruning@0.1.4`
- `@diegopetrucci/pi-extensions@0.1.61`

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.8"],["@diegopetrucci/pi-annotate-git-diff","0.1.8"],["@diegopetrucci/pi-annotate-last-message","0.1.6"],["@diegopetrucci/pi-brrr","0.1.11"],["@diegopetrucci/pi-claude-fast","0.1.11"],["@diegopetrucci/pi-code-reviewer","0.1.6"],["@diegopetrucci/pi-confirm-destructive","0.1.9"],["@diegopetrucci/pi-context-cap","0.1.8"],["@diegopetrucci/pi-context-inspector","0.1.10"],["@diegopetrucci/pi-contrarian","0.1.8"],["@diegopetrucci/pi-dirty-repo-guard","0.1.8"],["@diegopetrucci/pi-git-footer","0.1.7"],["@diegopetrucci/pi-gnosis","0.1.8"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.6"],["@diegopetrucci/pi-inline-bash","0.1.8"],["@diegopetrucci/pi-librarian","0.1.13"],["@diegopetrucci/pi-minimal-footer","0.1.17"],["@diegopetrucci/pi-notify","0.1.14"],["@diegopetrucci/pi-openai-fast","0.1.13"],["@diegopetrucci/pi-oracle","0.1.23"],["@diegopetrucci/pi-permission-gate","0.1.11"],["@diegopetrucci/pi-quiet-tools","0.1.9"],["@diegopetrucci/pi-review","0.1.11"],["@diegopetrucci/pi-todo","0.1.8"],["@diegopetrucci/pi-triage-comments","0.1.9"],["pi-dynamic-context-pruning","0.1.4"],["@diegopetrucci/pi-extensions","0.1.61"]] -->