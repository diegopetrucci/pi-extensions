# Publish checklist — v0.1.70

## Scope

- Minimal Footer derives automatic OpenAI Codex usage-window labels from reported durations instead of fixed primary/secondary assumptions.
- Explicit label overrides remain supported, while missing or unknown durations use neutral labels.
- All 28 fleet markers remain at Pi `0.84.4`; this release does not advance fleet certification.

## Target package versions

- [x] `@diegopetrucci/pi-minimal-footer@0.1.21`
- [x] `@diegopetrucci/pi-extensions@0.1.70`

## Validation evidence

- [x] `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.70-input.json` passed and selected exactly the two target packages in managed order; all four managed package-evidence markers were preserved on the post-write dry-run
- [x] `npm ci --ignore-scripts --no-audit --no-fund` passed; 264 packages were added
- [x] `npm run preflight:install-state` passed; 237 installed packages and 28 local package entries were checked
- [x] `npm run typecheck` passed
- [x] `npm test` passed: 728 tests total, 727 passed, 0 failed, 1 skipped
- [x] `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` passed; production audit found 0 vulnerabilities
- [x] Both dry-run packs passed: `@diegopetrucci/pi-minimal-footer@0.1.21` was 11,676 bytes packed, 44,208 bytes unpacked, 6 files; `@diegopetrucci/pi-extensions@0.1.70` was 1,292,451 bytes packed, 2,234,387 bytes unpacked, 163 files
- [x] root unpacked size is 2,234,387 bytes, within the 2,235,000-byte budget
- [x] validation recorded no staged files and exactly 28 fleet markers at Pi `0.84.4`
- [x] `git diff --check` passed

## Agent-safe follow-up actions

- [ ] commit the release preparation changes on `release/v0.1.70` and push the branch
- [ ] open a pull request from `release/v0.1.70` targeting `main`
- [ ] require CI/CodeQL green, then merge the pull request
- [ ] tag `v0.1.70` on merged `main` and push the tag
- [ ] create a non-draft GitHub release titled “Accurate Codex usage-window labels in Minimal Footer” using `docs/github-release-v0.1.70.md` as the exact body
- [ ] run `scripts/publish-release.mjs v0.1.70 --dry-run`

## Human-only release actions

- [ ] dispatch the trusted `publish.yml` workflow from `main` with `v0.1.70` in both confirmation fields
- [ ] inspect the verified two-package plan and approve the `npm-release` environment deployment

## Post-publish validation

- [ ] after human confirmation, wait five minutes before registry/install validation
- [ ] verify both registry versions, hashes, provenance, and expected `latest` tags
- [ ] perform fresh installs of both released artifacts in clean directories and load them

<!-- prepare-release:packages [["@diegopetrucci/pi-minimal-footer","0.1.21"],["@diegopetrucci/pi-extensions","0.1.70"]] -->
