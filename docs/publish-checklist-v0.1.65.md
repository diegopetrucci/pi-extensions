# Publish checklist — v0.1.65

## Target package versions

- [ ] `@diegopetrucci/pi-agent-workflow-audit@0.1.10`
- [ ] `@diegopetrucci/pi-annotate-git-diff@0.1.10`
- [ ] `@diegopetrucci/pi-annotate-last-message@0.1.8`
- [ ] `@diegopetrucci/pi-brrr@0.1.13`
- [ ] `@diegopetrucci/pi-claude-fast@0.1.14`
- [ ] `@diegopetrucci/pi-code-reviewer@0.1.8`
- [ ] `@diegopetrucci/pi-confirm-destructive@0.1.11`
- [ ] `@diegopetrucci/pi-context-cap@0.1.10`
- [ ] `@diegopetrucci/pi-context-inspector@0.1.12`
- [ ] `@diegopetrucci/pi-contrarian@0.1.10`
- [ ] `@diegopetrucci/pi-dirty-repo-guard@0.1.10`
- [ ] `@diegopetrucci/pi-fast@0.1.1`
- [ ] `@diegopetrucci/pi-git-footer@0.1.9`
- [ ] `@diegopetrucci/pi-gnosis@0.1.10`
- [ ] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.8`
- [ ] `@diegopetrucci/pi-inline-bash@0.1.10`
- [ ] `@diegopetrucci/pi-librarian@0.1.15`
- [ ] `@diegopetrucci/pi-minimal-footer@0.1.19`
- [ ] `@diegopetrucci/pi-notify@0.1.17`
- [ ] `@diegopetrucci/pi-openai-fast@0.1.16`
- [ ] `@diegopetrucci/pi-oracle@0.1.25`
- [ ] `@diegopetrucci/pi-permission-gate@0.1.13`
- [ ] `@diegopetrucci/pi-quiet-tools@0.1.11`
- [ ] `@diegopetrucci/pi-review@0.1.13`
- [ ] `@diegopetrucci/pi-todo@0.1.10`
- [ ] `@diegopetrucci/pi-triage-comments@0.1.11`
- [ ] `pi-dynamic-context-pruning@0.1.7`
- [ ] `@diegopetrucci/pi-extensions@0.1.65`

## Validation evidence

- [x] Corrected `prepare-release` dry-run selected the full 28-package set ending with `@diegopetrucci/pi-extensions@0.1.65`.
- [x] `npm ci` completed; npm reported 0 vulnerabilities, a deprecated `node-domexception` warning, and five install scripts not yet covered by `allowScripts`.
- [x] `npm run preflight:install-state` passed with 243 installed packages and 28 local package entries checked.
- [ ] run the manual smoke checklist in `docs/smoke-checklist-pi-0.84.2.md` with Pi 0.84.2 after `npm run preflight:install-state`
- [x] `npm run ci` passed with 583/583 tests (including typecheck and the full test suite). Re-confirmed after peg-jloj ladder and doc corrections; tally unchanged.
- [x] Release-focused tests passed with 34/34 tests: `prepare-release` (13 tests), `publish-release` (16 tests), publish safety (4 tests), and tarball runtime smoke (1 test).
- [x] Final `prepare-release` dry-run using `/tmp/release-input-v0.1.65.json` selected exactly the same 28-package set as the managed `prepare-release:packages` marker — the marker is byte-identical to the dry-run selection. All four `docs/*-v0.1.65.md` documents were preserved with their prose intact.
- [x] Exact npm registry checks returned E404/no-match responses for all 28 target versions; none are currently published.
- [x] `npm pack --dry-run --json --ignore-scripts` passed for all 28 targets. Sizes by package: agent-workflow-audit 4 files/16,253 packed/56,479 unpacked; annotate-git-diff 14 files/43,565/187,527; annotate-last-message 12 files/11,060/38,214; brrr 5 files/4,474/12,364; claude-fast 5 files/4,237/12,179; code-reviewer 4 files/17,201/62,580; confirm-destructive 4 files/1,663/3,797; context-cap 4 files/2,786/8,046; context-inspector 4 files/16,348/58,928; contrarian 4 files/17,741/68,155; dirty-repo-guard 4 files/1,619/3,382; fast 5 files/5,298/16,036; git-footer 4 files/5,146/16,640; gnosis 4 files/3,415/8,496; illustrations-to-explain-things 24 files/867,953/879,990; inline-bash 4 files/2,575/5,885; librarian 4 files/20,948/74,087; minimal-footer 6 files/10,954/41,954; notify 5 files/5,622/16,869; openai-fast 5 files/3,920/11,325; oracle 4 files/17,067/63,234; permission-gate 4 files/5,295/20,049; quiet-tools 4 files/4,774/15,684; review 5 files/22,867/83,055; todo 4 files/3,825/11,102; triage-comments 4 files/26,061/97,809; dynamic-context-pruning 4 files/39,741/141,123; pi-extensions umbrella 161 files/1,274,714/2,162,691.
- [x] `npm publish --dry-run --ignore-scripts --access public` passed for all 28 targets; no live publish was run.
- [x] Temporary tarballs (28 files) packed to `/tmp/tarball-scan-v0.1.65-*` outside the repo, scanned for forbidden entries, and found zero `docs/`, `.tickets/`, `.pi-subagents/`, `.npmrc`, or `*.tgz` entries; temporary artifacts were removed.
- [x] All 28 `.pi-fleet-tested-version` files read `0.84.2` (27 extensions + umbrella root).
- [x] Repository artifact scan found zero `*.tgz` or `.npmrc` files outside `node_modules`.
- [x] `git diff --check` passed (clean).
- [x] `git diff --cached --name-only` produced no output; no files were staged.
- [x] `npm audit`, `npm audit --omit=dev`, and `npm audit --omit=dev --audit-level=high` each reported 0 vulnerabilities.

## Agent-safe follow-up actions

- [ ] commit release prep changes on `release/pi-0.84.2-v0.1.65` outside this tool
- [ ] push the release branch and open a pull request targeting `main`
- [ ] after the pull request merges, tag `v0.1.65` on `main`
- [ ] push tag `v0.1.65`
- [ ] create the GitHub release using `docs/github-release-v0.1.65.md`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

## Post-publish validation

- [ ] after the human confirms publishing is complete, wait 5 minutes before checking npm registry/package pages or running install validation
- [ ] verify npm registry/package pages show the expected versions for all 28 target packages
- [ ] run install validation after npm propagation

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.10"],["@diegopetrucci/pi-annotate-git-diff","0.1.10"],["@diegopetrucci/pi-annotate-last-message","0.1.8"],["@diegopetrucci/pi-brrr","0.1.13"],["@diegopetrucci/pi-claude-fast","0.1.14"],["@diegopetrucci/pi-code-reviewer","0.1.8"],["@diegopetrucci/pi-confirm-destructive","0.1.11"],["@diegopetrucci/pi-context-cap","0.1.10"],["@diegopetrucci/pi-context-inspector","0.1.12"],["@diegopetrucci/pi-contrarian","0.1.10"],["@diegopetrucci/pi-dirty-repo-guard","0.1.10"],["@diegopetrucci/pi-fast","0.1.1"],["@diegopetrucci/pi-git-footer","0.1.9"],["@diegopetrucci/pi-gnosis","0.1.10"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.8"],["@diegopetrucci/pi-inline-bash","0.1.10"],["@diegopetrucci/pi-librarian","0.1.15"],["@diegopetrucci/pi-minimal-footer","0.1.19"],["@diegopetrucci/pi-notify","0.1.17"],["@diegopetrucci/pi-openai-fast","0.1.16"],["@diegopetrucci/pi-oracle","0.1.25"],["@diegopetrucci/pi-permission-gate","0.1.13"],["@diegopetrucci/pi-quiet-tools","0.1.11"],["@diegopetrucci/pi-review","0.1.13"],["@diegopetrucci/pi-todo","0.1.10"],["@diegopetrucci/pi-triage-comments","0.1.11"],["pi-dynamic-context-pruning","0.1.7"],["@diegopetrucci/pi-extensions","0.1.65"]] -->
