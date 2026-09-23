# Publish checklist — v0.1.69

## Scope

- Pi `0.87.1` compatibility is a development baseline only; it does not advance fleet certification.
- Context Inspector and Dynamic Context Pruning use Pi's canonical session projection for current-context omissions/replacements and manual-prune inventories, with older-runtime fallbacks retained.
- Oracle, Contrarian, and Code Reviewer use deterministic frontier-model selection for the refreshed Pi 0.87.1 catalog, including Claude Opus 5.5, GPT-6 Sol/Luna, and Grok 4.7.
- All 28 fleet markers remain at Pi `0.84.4`.

## Target package versions

- [x] `@diegopetrucci/pi-code-reviewer@0.1.11`
- [x] `@diegopetrucci/pi-context-inspector@0.1.14`
- [x] `@diegopetrucci/pi-contrarian@0.1.13`
- [x] `@diegopetrucci/pi-oracle@0.1.28`
- [x] `pi-dynamic-context-pruning@0.1.10`
- [x] `@diegopetrucci/pi-extensions@0.1.69`

## Validation evidence

- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.69-input.json` passed and selected exactly the six target packages in managed order; all four managed package-evidence markers were preserved byte-for-byte
- [x] `npm ci --ignore-scripts --no-audit --no-fund` passed; 264 packages were added
- [x] `npm run preflight:install-state` passed; 237 installed packages and 28 local package entries were checked
- [x] `npm run typecheck` passed
- [x] `npm test` passed: 727 tests total, 726 passed, 0 failed, 1 skipped
- [x] `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` passed; production audit found 0 vulnerabilities
- [x] All six dry-run packs passed: `@diegopetrucci/pi-code-reviewer@0.1.11` was 17,661 bytes packed, 66,270 bytes unpacked, 4 files; `@diegopetrucci/pi-context-inspector@0.1.14` was 17,035 bytes packed, 61,847 bytes unpacked, 4 files; `@diegopetrucci/pi-contrarian@0.1.13` was 18,157 bytes packed, 71,309 bytes unpacked, 4 files; `@diegopetrucci/pi-oracle@0.1.28` was 17,416 bytes packed, 65,750 bytes unpacked, 4 files; `pi-dynamic-context-pruning@0.1.10` was 41,105 bytes packed, 146,725 bytes unpacked, 4 files; and `@diegopetrucci/pi-extensions@0.1.69` was 1,291,796 bytes packed, 2,232,119 bytes unpacked, 163 files
- [x] root unpacked size is 2,232,119 bytes, within the 2,235,000-byte budget
- [x] validation recorded unchanged repository hashes/status, no staged files, and exactly 28 fleet markers at Pi `0.84.4`
- [x] `git diff --check` passed

## Agent-safe follow-up actions

- [ ] commit the release preparation changes on `release/v0.1.69` and push the branch
- [ ] open a pull request from `release/v0.1.69` targeting `main`
- [ ] require CI/CodeQL green, then merge the pull request
- [ ] tag `v0.1.69` on merged `main` and push the tag
- [ ] create a non-draft GitHub release titled “Pi 0.87.1 compatibility and deterministic model selection” using `docs/github-release-v0.1.69.md` as the exact body
- [ ] run `scripts/publish-release.mjs v0.1.69 --dry-run`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

## Post-publish validation

- [ ] after human confirmation, wait five minutes before registry/install validation
- [ ] verify six registry versions, hashes, provenance, and expected `latest` tags
- [ ] perform a fresh install of all six released artifacts in clean directories and load them

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.11"],["@diegopetrucci/pi-context-inspector","0.1.14"],["@diegopetrucci/pi-contrarian","0.1.13"],["@diegopetrucci/pi-oracle","0.1.28"],["pi-dynamic-context-pruning","0.1.10"],["@diegopetrucci/pi-extensions","0.1.69"]] -->
