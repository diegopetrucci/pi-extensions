# Announcement — v0.1.60

## Short

v0.1.60 packages the Pi `0.82.0` compatibility update for the root package plus 26 standalone extensions whose publish tarballs changed. It removes the unavailable `mistralai/mistral-large-3-675b-instruct-2512` preference from `@diegopetrucci/pi-contrarian` and `@diegopetrucci/pi-oracle`, updates all 27 `.pi-fleet-tested-version` markers to Pi `0.82.0`, and bumps the selected packages to their next unpublished patch versions.

## Notes

- final tlh validation passed with 505/505 full-suite tests, 4/4 focused provider-catalog checks, and 1/1 tarball/runtime smoke coverage
- `npm audit` reports an upstream high-severity denial-of-service advisory for `brace-expansion<=5.0.7`, nested under published `@earendil-works/pi-coding-agent@0.82.0`
- exact `npm view <name>@<target> version --json` checks confirmed all 27 target versions remain unpublished
- `npm pack --dry-run --json` and `npm publish --dry-run --ignore-scripts --access public` passed for the root package plus all 26 standalone targets with `suspiciousTotal=0`
- dry-run tarball file lists excluded `.tickets/`, `.pi-subagents/`, release-doc files under `docs/`, `*.tgz` paths, and `.npmrc`

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.7`
- `@diegopetrucci/pi-annotate-git-diff@0.1.7`
- `@diegopetrucci/pi-annotate-last-message@0.1.5`
- `@diegopetrucci/pi-brrr@0.1.10`
- `@diegopetrucci/pi-claude-fast@0.1.10`
- `@diegopetrucci/pi-code-reviewer@0.1.5`
- `@diegopetrucci/pi-confirm-destructive@0.1.8`
- `@diegopetrucci/pi-context-cap@0.1.7`
- `@diegopetrucci/pi-context-inspector@0.1.9`
- `@diegopetrucci/pi-contrarian@0.1.7`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.7`
- `@diegopetrucci/pi-git-footer@0.1.6`
- `@diegopetrucci/pi-gnosis@0.1.7`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.5`
- `@diegopetrucci/pi-inline-bash@0.1.7`
- `@diegopetrucci/pi-librarian@0.1.12`
- `@diegopetrucci/pi-minimal-footer@0.1.16`
- `@diegopetrucci/pi-notify@0.1.13`
- `@diegopetrucci/pi-openai-fast@0.1.12`
- `@diegopetrucci/pi-oracle@0.1.22`
- `@diegopetrucci/pi-permission-gate@0.1.10`
- `@diegopetrucci/pi-quiet-tools@0.1.8`
- `@diegopetrucci/pi-review@0.1.10`
- `@diegopetrucci/pi-todo@0.1.7`
- `@diegopetrucci/pi-triage-comments@0.1.8`
- `pi-dynamic-context-pruning@0.1.3`
- `@diegopetrucci/pi-extensions@0.1.60`

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.7"],["@diegopetrucci/pi-annotate-git-diff","0.1.7"],["@diegopetrucci/pi-annotate-last-message","0.1.5"],["@diegopetrucci/pi-brrr","0.1.10"],["@diegopetrucci/pi-claude-fast","0.1.10"],["@diegopetrucci/pi-code-reviewer","0.1.5"],["@diegopetrucci/pi-confirm-destructive","0.1.8"],["@diegopetrucci/pi-context-cap","0.1.7"],["@diegopetrucci/pi-context-inspector","0.1.9"],["@diegopetrucci/pi-contrarian","0.1.7"],["@diegopetrucci/pi-dirty-repo-guard","0.1.7"],["@diegopetrucci/pi-git-footer","0.1.6"],["@diegopetrucci/pi-gnosis","0.1.7"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.5"],["@diegopetrucci/pi-inline-bash","0.1.7"],["@diegopetrucci/pi-librarian","0.1.12"],["@diegopetrucci/pi-minimal-footer","0.1.16"],["@diegopetrucci/pi-notify","0.1.13"],["@diegopetrucci/pi-openai-fast","0.1.12"],["@diegopetrucci/pi-oracle","0.1.22"],["@diegopetrucci/pi-permission-gate","0.1.10"],["@diegopetrucci/pi-quiet-tools","0.1.8"],["@diegopetrucci/pi-review","0.1.10"],["@diegopetrucci/pi-todo","0.1.7"],["@diegopetrucci/pi-triage-comments","0.1.8"],["pi-dynamic-context-pruning","0.1.3"],["@diegopetrucci/pi-extensions","0.1.60"]] -->
