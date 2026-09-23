# Release notes — v0.1.69

## Highlights

- Establish Pi `0.87.1` as the collection's development compatibility baseline; this release does not advance fleet certification.
- Use Pi 0.87.1's canonical session projection in Context Inspector and Dynamic Context Pruning for current-context omissions/replacements and manual-prune inventories, while retaining safe raw-history and older-runtime fallbacks.
- Make frontier-model selection deterministic across Oracle, Contrarian, and Code Reviewer by refreshing the Pi 0.87.1 provider ladders for Claude Opus 5.5, GPT-6 Sol/Luna, and Grok 4.7 while preserving role-specific fallbacks and tiers.
- Keep all 28 fleet markers at Pi `0.84.4`; no fleet certification is advanced by this release.

## Packaging

- `@diegopetrucci/pi-code-reviewer@0.1.11`
- `@diegopetrucci/pi-context-inspector@0.1.14`
- `@diegopetrucci/pi-contrarian@0.1.13`
- `@diegopetrucci/pi-oracle@0.1.28`
- `pi-dynamic-context-pruning@0.1.10`
- `@diegopetrucci/pi-extensions@0.1.69`

## Validation

- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.69-input.json` passed and selected exactly the six target packages in managed order; all four managed package-evidence markers were preserved byte-for-byte.
- `npm ci --ignore-scripts --no-audit --no-fund` passed; 264 packages were added.
- `npm run preflight:install-state` passed; 237 installed packages and 28 local package entries were checked.
- `npm run typecheck` passed.
- `npm test` passed: 727 tests total, 726 passed, 0 failed, and 1 skipped.
- `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` passed; the production audit found 0 vulnerabilities.
- All six dry-run packs passed: `@diegopetrucci/pi-code-reviewer@0.1.11` was 17,661 bytes packed, 66,270 bytes unpacked, 4 files; `@diegopetrucci/pi-context-inspector@0.1.14` was 17,035 bytes packed, 61,847 bytes unpacked, 4 files; `@diegopetrucci/pi-contrarian@0.1.13` was 18,157 bytes packed, 71,309 bytes unpacked, 4 files; `@diegopetrucci/pi-oracle@0.1.28` was 17,416 bytes packed, 65,750 bytes unpacked, 4 files; `pi-dynamic-context-pruning@0.1.10` was 41,105 bytes packed, 146,725 bytes unpacked, 4 files; and `@diegopetrucci/pi-extensions@0.1.69` was 1,291,796 bytes packed, 2,232,119 bytes unpacked, 163 files.
- The root unpacked size of 2,232,119 bytes is within the 2,235,000-byte budget.
- The validation run recorded unchanged repository hashes/status, no staged files, and exactly 28 fleet markers at Pi `0.84.4`.

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.11"],["@diegopetrucci/pi-context-inspector","0.1.14"],["@diegopetrucci/pi-contrarian","0.1.13"],["@diegopetrucci/pi-oracle","0.1.28"],["pi-dynamic-context-pruning","0.1.10"],["@diegopetrucci/pi-extensions","0.1.69"]] -->
