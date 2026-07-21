# Publish checklist — v0.1.58

## Target package versions

- [x] `@diegopetrucci/pi-agent-workflow-audit@0.1.5`
- [x] `@diegopetrucci/pi-annotate-git-diff@0.1.5`
- [x] `@diegopetrucci/pi-annotate-last-message@0.1.3`
- [x] `@diegopetrucci/pi-brrr@0.1.8`
- [x] `@diegopetrucci/pi-claude-fast@0.1.8`
- [x] `@diegopetrucci/pi-code-reviewer@0.1.3`
- [x] `@diegopetrucci/pi-confirm-destructive@0.1.6`
- [x] `@diegopetrucci/pi-context-cap@0.1.5`
- [x] `@diegopetrucci/pi-context-inspector@0.1.7`
- [x] `@diegopetrucci/pi-contrarian@0.1.5`
- [x] `@diegopetrucci/pi-dirty-repo-guard@0.1.5`
- [x] `@diegopetrucci/pi-git-footer@0.1.4`
- [x] `@diegopetrucci/pi-gnosis@0.1.5`
- [x] `@diegopetrucci/pi-illustrations-to-explain-things@0.1.3`
- [x] `@diegopetrucci/pi-inline-bash@0.1.5`
- [x] `@diegopetrucci/pi-librarian@0.1.10`
- [x] `@diegopetrucci/pi-minimal-footer@0.1.15`
- [x] `@diegopetrucci/pi-notify@0.1.11`
- [x] `@diegopetrucci/pi-openai-fast@0.1.10`
- [x] `@diegopetrucci/pi-oracle@0.1.20`
- [x] `@diegopetrucci/pi-permission-gate@0.1.8`
- [x] `@diegopetrucci/pi-quiet-tools@0.1.6`
- [x] `@diegopetrucci/pi-review@0.1.8`
- [x] `@diegopetrucci/pi-todo@0.1.5`
- [x] `@diegopetrucci/pi-triage-comments@0.1.6`
- [x] `pi-dynamic-context-pruning@0.1.1`
- [x] `@diegopetrucci/pi-extensions@0.1.58`

## Validation evidence

- [x] `npm ci --ignore-scripts --no-audit --no-fund` completed after direct foreground `npm ci` caused a parent Pi segmentation fault
- [x] `npm run preflight:install-state` passed: `Package state matches package-lock.json (247 installed packages and 27 local package entries checked).`
- [x] target-version consistency script confirmed all selected manifests and local lock entries match the v0.1.58 targets
- [x] `npm run ci` passed with 479/479 tests
- [x] `node --test test/provider-model-preferences-catalog.test.mjs` passed
- [x] `npm audit --omit=dev` was run and reported one remaining moderate upstream dev-dependency finding: nested `protobufjs@7.6.4` in Pi `0.81.1`'s published `@earendil-works/pi-coding-agent` shrinkwrap
- [x] `npm audit --omit=dev --audit-level=high` exited 0; the remaining finding is moderate and not in published extension contents
- [x] `git diff --check` passed
- [x] `git diff --cached --name-only` produced no output
- [x] exact `npm view <name>@<version> version` checks confirmed all 27 target versions are unpublished
- [x] `npm pack --dry-run --json` and `npm publish --dry-run --access public` passed for the root package plus all 26 standalone targets; every package reported `suspicious=0`
- [x] `find . -name '*.tgz' -o -name '*.npmrc' | sort` produced no output

## Agent-safe follow-up actions

- [ ] commit release prep changes outside this tool
- [ ] push the release-prep branch
- [ ] open PR targeting `main`
- [ ] after PR merge, tag `v0.1.58` on `main`
- [ ] push tag `v0.1.58`
- [ ] create the GitHub release using `docs/github-release-v0.1.58.md`

## Human-only release actions

- [ ] publish selected packages manually (this tool cannot publish)

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.5"],["@diegopetrucci/pi-annotate-git-diff","0.1.5"],["@diegopetrucci/pi-annotate-last-message","0.1.3"],["@diegopetrucci/pi-brrr","0.1.8"],["@diegopetrucci/pi-claude-fast","0.1.8"],["@diegopetrucci/pi-code-reviewer","0.1.3"],["@diegopetrucci/pi-confirm-destructive","0.1.6"],["@diegopetrucci/pi-context-cap","0.1.5"],["@diegopetrucci/pi-context-inspector","0.1.7"],["@diegopetrucci/pi-contrarian","0.1.5"],["@diegopetrucci/pi-dirty-repo-guard","0.1.5"],["@diegopetrucci/pi-git-footer","0.1.4"],["@diegopetrucci/pi-gnosis","0.1.5"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.3"],["@diegopetrucci/pi-inline-bash","0.1.5"],["@diegopetrucci/pi-librarian","0.1.10"],["@diegopetrucci/pi-minimal-footer","0.1.15"],["@diegopetrucci/pi-notify","0.1.11"],["@diegopetrucci/pi-openai-fast","0.1.10"],["@diegopetrucci/pi-oracle","0.1.20"],["@diegopetrucci/pi-permission-gate","0.1.8"],["@diegopetrucci/pi-quiet-tools","0.1.6"],["@diegopetrucci/pi-review","0.1.8"],["@diegopetrucci/pi-todo","0.1.5"],["@diegopetrucci/pi-triage-comments","0.1.6"],["pi-dynamic-context-pruning","0.1.1"],["@diegopetrucci/pi-extensions","0.1.58"]] -->
