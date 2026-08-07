# Publish checklist — v0.1.63

## Target package versions

- [x] `@diegopetrucci/pi-claude-fast@0.1.13`
- [x] `@diegopetrucci/pi-fast@0.1.0`
- [x] `@diegopetrucci/pi-openai-fast@0.1.15`
- [x] `pi-dynamic-context-pruning@0.1.6`
- [x] `@diegopetrucci/pi-extensions@0.1.63`

## Validation evidence

- [x] plain `npm ci` completed before validation
- [x] `npm run preflight:install-state` passed with 246 installed packages and 28 local package entries checked
- [x] `npm run ci` passed with 572/572 tests
- [x] Anthropic API-key and OAuth final wire-header coverage passed
- [x] package-size budgets passed after bounded unified Fast headroom was recorded
- [x] `npm audit`, `npm audit --omit=dev`, and `npm audit --omit=dev --audit-level=high` were run; each reported the same upstream Pi 0.83 transitive findings in `brace-expansion` and `undici` (3 vulnerabilities: 1 moderate, 2 high; the complete fix requires Pi 0.84.1)
- [x] exact registry checks confirmed all five target versions are unpublished
- [x] `npm pack --dry-run --json` and `npm publish --dry-run --ignore-scripts --access public` passed for all five targets; aggregate totals were `packages=5`, `files=180`, `tarballBytes=1327300`, and `unpackedBytes=2338971`
- [x] dry-run tarballs contained no `docs/`, `.tickets/`, `.pi-subagents/`, `.npmrc`, or `*.tgz` artifacts
- [x] all 27 workspace `.pi-fleet-tested-version` files read `0.83.0`
- [x] `git diff --check` passed
- [x] `git diff --cached --name-only` produced no output
- [x] repository artifact scan found no `*.tgz` or `.npmrc` files outside `node_modules`

## Agent-safe follow-up actions

- [x] commit release prep changes on `feat/unified-fast`
- [x] push the release branch and open pull request [#67](https://github.com/diegopetrucci/pi-extensions/pull/67) targeting `main`
- [ ] after the pull request merges, tag `v0.1.63` on `main`
- [ ] push tag `v0.1.63`
- [ ] create the GitHub release using `docs/github-release-v0.1.63.md`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

<!-- prepare-release:packages [["@diegopetrucci/pi-claude-fast","0.1.13"],["@diegopetrucci/pi-fast","0.1.0"],["@diegopetrucci/pi-openai-fast","0.1.15"],["pi-dynamic-context-pruning","0.1.6"],["@diegopetrucci/pi-extensions","0.1.63"]] -->
