# Publish checklist — v0.1.62

## Target package versions

- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.9`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.9`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.7`
- [x] `@diegopetrucci/pi-brrr@0.1.12`
- [x] `@diegopetrucci/pi-claude-fast@0.1.12`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.7`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.10`
- [x] `@diegopetrucci/pi-context-cap@0.1.9`
- [x] `@diegopetrucci/pi-context-inspector@0.1.11`
- [x] `@diegopetrucci/pi-contrarian@0.1.9`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.9`
- [x] `@diegopetrucci/pi-git-footer@0.1.8`
- [x] `@diegopetrucci/pi-gnosis@0.1.9`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.7`
- [x] `@diegopetrucci/pi-inline-bash@0.1.9`
- [x] `@diegopetrucci/pi-librarian@0.1.14`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.18`
- [x] `@diegopetrucci/pi-notify@0.1.15`
- [x] `@diegopetrucci/pi-openai-fast@0.1.14`
- [x] `@diegopetrucci/pi-oracle@0.1.24`
- [x] `@diegopetrucci/pi-permission-gate@0.1.12`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.10`
- [x] `@diegopetrucci/pi-review@0.1.12`
- [x] `@diegopetrucci/pi-todo@0.1.9`
- [x] `@diegopetrucci/pi-triage-comments@0.1.10`
- [x] `pi-dynamic-context-pruning@0.1.5`
- [x] `@diegopetrucci/pi-extensions@0.1.62`

## Validation evidence

- [x] plain `npm ci` completed before final validation and reinstalled the lockfile state
- [x] `npm run preflight:install-state` passed: `Package state matches package-lock.json (246 installed packages and 27 local package entries checked).`
- [x] `npm run ci` passed with 530/530 tests
- [x] `node --test test/provider-model-preferences-catalog.test.mjs` passed with 4/4 tests
- [x] `node --test test/tarball-runtime-smoke.test.mjs` passed with 1/1 tests
- [x] `npm audit`, `npm audit --omit=dev`, and `npm audit --omit=dev --audit-level=high` were run; each reported the same upstream transitive `brace-expansion@5.0.7` and `undici@8.5.0` findings under Pi `0.83.0` (3 vulnerabilities: 1 moderate, 2 high)
- [x] all 27 `.pi-fleet-tested-version` files read `0.83.0`
- [x] exact `npm view <name>@<target> version --json` checks confirmed all 27 target versions are unpublished
- [x] `git diff --check` passed
- [x] `git diff --cached --name-only` produced no output
- [x] `npm pack --dry-run --json` and `npm publish --dry-run --ignore-scripts --access public` passed for the root package plus all 26 standalone targets; aggregate dry-run totals were `packages=27`, `totalFiles=305`, `totalTarballBytes=2437619`, `totalUnpackedBytes=4111192`, `suspiciousTotal=0`, and `publishDryRunFailures=0`
- [x] `.tickets/` and `.pi-subagents/` were absent from every dry-run tarball file list; no dry-run tarball file list included any `docs/` release file, `*.tgz` artifact path, or `.npmrc` file
- [x] `find . \( -name '*.tgz' -o -name '.npmrc' \) -not -path './node_modules/*' -print | sort` produced no output

## Agent-safe follow-up actions

- [x] commit the prepared release changes on `compat/pi-0.83-scoped-models`
- [x] push the release branch
- [x] open pull request [#65](https://github.com/diegopetrucci/pi-extensions/pull/65) targeting `main`
- [x] after the pull request merges, tag `v0.1.62` on `main`
- [x] push tag `v0.1.62`
- [x] create the [GitHub release](https://github.com/diegopetrucci/pi-extensions/releases/tag/v0.1.62) using `docs/github-release-v0.1.62.md`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with `v0.1.62` in both confirmation fields
- [ ] inspect the verified 27-package plan and approve the `npm-release` environment deployment

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.9"],["@diegopetrucci/pi-annotate-git-diff","0.1.9"],["@diegopetrucci/pi-annotate-last-message","0.1.7"],["@diegopetrucci/pi-brrr","0.1.12"],["@diegopetrucci/pi-claude-fast","0.1.12"],["@diegopetrucci/pi-code-reviewer","0.1.7"],["@diegopetrucci/pi-confirm-destructive","0.1.10"],["@diegopetrucci/pi-context-cap","0.1.9"],["@diegopetrucci/pi-context-inspector","0.1.11"],["@diegopetrucci/pi-contrarian","0.1.9"],["@diegopetrucci/pi-dirty-repo-guard","0.1.9"],["@diegopetrucci/pi-git-footer","0.1.8"],["@diegopetrucci/pi-gnosis","0.1.9"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.7"],["@diegopetrucci/pi-inline-bash","0.1.9"],["@diegopetrucci/pi-librarian","0.1.14"],["@diegopetrucci/pi-minimal-footer","0.1.18"],["@diegopetrucci/pi-notify","0.1.15"],["@diegopetrucci/pi-openai-fast","0.1.14"],["@diegopetrucci/pi-oracle","0.1.24"],["@diegopetrucci/pi-permission-gate","0.1.12"],["@diegopetrucci/pi-quiet-tools","0.1.10"],["@diegopetrucci/pi-review","0.1.12"],["@diegopetrucci/pi-todo","0.1.9"],["@diegopetrucci/pi-triage-comments","0.1.10"],["pi-dynamic-context-pruning","0.1.5"],["@diegopetrucci/pi-extensions","0.1.62"]] -->
