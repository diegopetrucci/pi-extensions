# Release notes — v0.1.61

## Highlights

This release packages the Pi `0.82.1` compatibility update for the root collection and 26 standalone extensions whose publish tarballs changed.

## Compatibility changes in scope

- prefers `claude-opus-5` ahead of older Claude frontier fallbacks in `@diegopetrucci/pi-oracle`, `@diegopetrucci/pi-contrarian`, and `@diegopetrucci/pi-code-reviewer` so their hardcoded provider order matches the current Pi `0.82.1` catalog
- updates the supporting provider policy contract coverage and the oracle provider matrix for the new Claude Opus 5 top picks introduced by the Pi `0.82.1` certification work
- updates the agent workflow audit message renderer and its tests for the current padded renderer options used by Pi `0.82.1`
- updates all 27 `.pi-fleet-tested-version` markers in the root package and standalone packages to Pi `0.82.1`, bumps the selected package manifests to the next unpublished patch versions, and synchronizes matching `package-lock.json` entries through the deterministic release-prep flow

## Packaging

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

## Validation

- plain `npm ci` completed before all other validation, reinstalling the lockfile state and surfacing one remaining upstream `npm audit` finding: `brace-expansion<=5.0.7` nested under published `@earendil-works/pi-coding-agent@0.82.1`
- `npm run preflight:install-state` passed: `Package state matches package-lock.json (247 installed packages and 27 local package entries checked).`
- `npm run ci` passed with 519/519 tests, and focused reruns passed for provider-catalog coverage (4/4) and tarball/runtime smoke coverage (1/1)
- exact `npm view <name>@<target> version --json` checks confirmed all 27 v0.1.61 target versions remain unpublished
- all 27 `.pi-fleet-tested-version` files read `0.82.1`, `git diff --check` passed, and `git diff --cached --name-only` produced no output
- `npm pack --dry-run --json` and `npm publish --dry-run --ignore-scripts --access public` passed for the root package plus all 26 standalone targets; aggregate dry-run totals were `packages=27`, `totalFiles=305`, `totalTarballBytes=2435358`, `totalUnpackedBytes=4102034`, `suspiciousTotal=0`, and `publishDryRunFailures=0`
- no dry-run tarball file list included `.tickets/`, `.pi-subagents/`, any `docs/` release file, any `*.tgz` artifact path, or any `.npmrc` file; `find . \( -name '*.tgz' -o -name '.npmrc' \) | sort` also produced no output
- final tlh validation is complete; the agent-safe commit, push, pull request, merge, tag, and GitHub release steps remain pending, followed by human-only npm publishing

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.8"],["@diegopetrucci/pi-annotate-git-diff","0.1.8"],["@diegopetrucci/pi-annotate-last-message","0.1.6"],["@diegopetrucci/pi-brrr","0.1.11"],["@diegopetrucci/pi-claude-fast","0.1.11"],["@diegopetrucci/pi-code-reviewer","0.1.6"],["@diegopetrucci/pi-confirm-destructive","0.1.9"],["@diegopetrucci/pi-context-cap","0.1.8"],["@diegopetrucci/pi-context-inspector","0.1.10"],["@diegopetrucci/pi-contrarian","0.1.8"],["@diegopetrucci/pi-dirty-repo-guard","0.1.8"],["@diegopetrucci/pi-git-footer","0.1.7"],["@diegopetrucci/pi-gnosis","0.1.8"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.6"],["@diegopetrucci/pi-inline-bash","0.1.8"],["@diegopetrucci/pi-librarian","0.1.13"],["@diegopetrucci/pi-minimal-footer","0.1.17"],["@diegopetrucci/pi-notify","0.1.14"],["@diegopetrucci/pi-openai-fast","0.1.13"],["@diegopetrucci/pi-oracle","0.1.23"],["@diegopetrucci/pi-permission-gate","0.1.11"],["@diegopetrucci/pi-quiet-tools","0.1.9"],["@diegopetrucci/pi-review","0.1.11"],["@diegopetrucci/pi-todo","0.1.8"],["@diegopetrucci/pi-triage-comments","0.1.9"],["pi-dynamic-context-pruning","0.1.4"],["@diegopetrucci/pi-extensions","0.1.61"]] -->