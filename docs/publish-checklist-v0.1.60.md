# Publish checklist — v0.1.60

## Target package versions

- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.7`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.7`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.5`
- [x] `@diegopetrucci/pi-brrr@0.1.10`
- [x] `@diegopetrucci/pi-claude-fast@0.1.10`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.5`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.8`
- [x] `@diegopetrucci/pi-context-cap@0.1.7`
- [x] `@diegopetrucci/pi-context-inspector@0.1.9`
- [x] `@diegopetrucci/pi-contrarian@0.1.7`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.7`
- [x] `@diegopetrucci/pi-git-footer@0.1.6`
- [x] `@diegopetrucci/pi-gnosis@0.1.7`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.5`
- [x] `@diegopetrucci/pi-inline-bash@0.1.7`
- [x] `@diegopetrucci/pi-librarian@0.1.12`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.16`
- [x] `@diegopetrucci/pi-notify@0.1.13`
- [x] `@diegopetrucci/pi-openai-fast@0.1.12`
- [x] `@diegopetrucci/pi-oracle@0.1.22`
- [x] `@diegopetrucci/pi-permission-gate@0.1.10`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.8`
- [x] `@diegopetrucci/pi-review@0.1.10`
- [x] `@diegopetrucci/pi-todo@0.1.7`
- [x] `@diegopetrucci/pi-triage-comments@0.1.8`
- [x] `pi-dynamic-context-pruning@0.1.3`
- [x] `@diegopetrucci/pi-extensions@0.1.60`

## Validation evidence

- [x] plain `npm ci` completed before all other validation and reinstalled the lockfile state
- [x] `npm run preflight:install-state` passed: `Package state matches package-lock.json (247 installed packages and 27 local package entries checked).`
- [x] `npm run ci` passed with 505/505 tests
- [x] `node --test test/provider-model-preferences-catalog.test.mjs` passed with 4/4 tests
- [x] `node --test test/tarball-runtime-smoke.test.mjs` passed with 1/1 tests
- [x] `npm audit`, `npm audit --omit=dev`, and `npm audit --omit=dev --audit-level=high` were run; each reported the same remaining upstream high-severity finding: `brace-expansion<=5.0.7` nested under published `@earendil-works/pi-coding-agent@0.82.0`
- [x] all 27 `.pi-fleet-tested-version` files read `0.82.0`
- [x] exact `npm view <name>@<target> version --json` checks confirmed all 27 target versions are unpublished
- [x] `git diff --check` passed
- [x] `git diff --cached --name-only` produced no output
- [x] `npm pack --dry-run --json` and `npm publish --dry-run --ignore-scripts --access public` passed for the root package plus all 26 standalone targets; aggregate dry-run totals were `packages=27`, `totalFiles=305`, `totalTarballBytes=2435306`, `totalUnpackedBytes=4101794`, `suspiciousTotal=0`, and `publishDryRunFailures=0`
- [x] `.tickets/` and `.pi-subagents/` were absent from every dry-run tarball file list; no dry-run tarball file list included any `docs/` release file, `*.tgz` artifact path, or `.npmrc` file
- [x] `find . \( -name '*.tgz' -o -name '.npmrc' \) | sort` produced no output

## Agent-safe follow-up actions

- [ ] commit the prepared release changes on `chore/pi-0.82.0-compat` outside tlh
- [ ] push the release branch
- [ ] open a pull request targeting `main`
- [ ] after the pull request merges, tag `v0.1.60` on `main`
- [ ] push tag `v0.1.60`
- [ ] create the GitHub release using `docs/github-release-v0.1.60.md`

## Human-only release actions

- [ ] publish the selected packages manually to npm after the tagged release is ready

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.7"],["@diegopetrucci/pi-annotate-git-diff","0.1.7"],["@diegopetrucci/pi-annotate-last-message","0.1.5"],["@diegopetrucci/pi-brrr","0.1.10"],["@diegopetrucci/pi-claude-fast","0.1.10"],["@diegopetrucci/pi-code-reviewer","0.1.5"],["@diegopetrucci/pi-confirm-destructive","0.1.8"],["@diegopetrucci/pi-context-cap","0.1.7"],["@diegopetrucci/pi-context-inspector","0.1.9"],["@diegopetrucci/pi-contrarian","0.1.7"],["@diegopetrucci/pi-dirty-repo-guard","0.1.7"],["@diegopetrucci/pi-git-footer","0.1.6"],["@diegopetrucci/pi-gnosis","0.1.7"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.5"],["@diegopetrucci/pi-inline-bash","0.1.7"],["@diegopetrucci/pi-librarian","0.1.12"],["@diegopetrucci/pi-minimal-footer","0.1.16"],["@diegopetrucci/pi-notify","0.1.13"],["@diegopetrucci/pi-openai-fast","0.1.12"],["@diegopetrucci/pi-oracle","0.1.22"],["@diegopetrucci/pi-permission-gate","0.1.10"],["@diegopetrucci/pi-quiet-tools","0.1.8"],["@diegopetrucci/pi-review","0.1.10"],["@diegopetrucci/pi-todo","0.1.7"],["@diegopetrucci/pi-triage-comments","0.1.8"],["pi-dynamic-context-pruning","0.1.3"],["@diegopetrucci/pi-extensions","0.1.60"]] -->
