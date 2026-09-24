# Publish checklist — v0.1.71

## Scope

- Direct OpenAI API Fast mode covers GPT-6 Astra, GPT-6 Sol, and GPT-6 Luna on `openai-responses` and `openai-completions`, injecting `service_tier: "fast"` only when no tier is already present.
- Supported ChatGPT OAuth/subscription Codex models retain `service_tier: "priority"`; API-key Codex requests remain unaffected.
- Fast mode is opt-in via `/fast` or the `enabled:true` configuration setting.
- Fast pricing, availability, rate limits, and usage accounting are provider- and account-dependent; Pi may not include the premium in its model catalog, and the extension does not patch usage totals.
- All 28 fleet markers remain at Pi `0.84.4`.

## Target package versions

- [x] `@diegopetrucci/pi-fast@0.1.3`
- [x] `@diegopetrucci/pi-extensions@0.1.71`

## Validation evidence

- [x] `npm run preflight:install-state` passed; 237 installed packages and 28 local entries were checked
- [x] `npm run typecheck` passed
- [x] `npm test` passed: 729 tests total, 728 passed, 0 failed, 1 skipped
- [x] `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` passed; production audit found 0 vulnerabilities
- [x] root `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org` passed for `@diegopetrucci/pi-extensions@0.1.71`: 1,292,753 packed bytes, 2,236,059 unpacked bytes, 163 files, no suspicious paths
- [x] Fast `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org --workspace @diegopetrucci/pi-fast` passed for `@diegopetrucci/pi-fast@0.1.3`: 5,612 packed bytes, 17,688 unpacked bytes, 5 files, no suspicious paths
- [x] `git diff --check` passed
- [x] no staged files
- [x] all 28 fleet markers remain at Pi `0.84.4`

## Agent-safe follow-up actions

- [ ] commit the release preparation changes on `release/v0.1.71` and push the branch
- [ ] open a pull request from `release/v0.1.71` targeting `main`
- [ ] require CI/CodeQL green, then merge the pull request
- [ ] tag `v0.1.71` on merged `main` and push the tag
- [ ] create a non-draft GitHub release titled "GPT-6 Fast mode for direct OpenAI APIs" using `docs/github-release-v0.1.71.md` as the exact body
- [ ] run `scripts/publish-release.mjs v0.1.71 --dry-run`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with the exact release tag in both confirmation fields
- [ ] inspect the verified package plan and approve the `npm-release` environment deployment

## Post-publish validation

- [ ] after human confirmation, wait five minutes before registry/install validation
- [ ] verify both registry versions, hashes, provenance, and expected `latest` tags
- [ ] perform fresh installs of both released artifacts in clean directories and load them

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.3"],["@diegopetrucci/pi-extensions","0.1.71"]] -->
