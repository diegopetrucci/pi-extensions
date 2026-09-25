# Release notes — v0.1.72

## Highlights

- Add Claude Opus 5.5 (`claude-opus-5-5`) to the unified `fast` extension's Anthropic Fast-mode allowlist. Eligible `anthropic-messages` requests can use `speed: "fast"` with the required Fast-mode beta header.
- Preserve existing Claude Opus 4.8 and Claude Opus 5 support, including API-key and Claude Code OAuth access when the account has the research preview.
- Fleet compatibility is unchanged; all 28 `.pi-fleet-tested-version` markers remain at Pi `0.84.4`.

## Packaging

- `@diegopetrucci/pi-fast@0.1.4`
- `@diegopetrucci/pi-extensions@0.1.72`

## Validation

- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.72-input.json` passed in dry-run mode and selected exactly the two target packages in dependency order: `@diegopetrucci/pi-fast@0.1.4`, then `@diegopetrucci/pi-extensions@0.1.72`.
- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.72-input.json --write` passed, updated both manifests and matching lock metadata, and created the four v0.1.72 release documents without changing fleet markers.
- `npm run preflight:install-state` passed; 237 installed packages and 28 local package entries were checked.
- `npm run typecheck` passed.
- `npm test` passed: 729 tests total, 728 passed, 0 failed, and 1 skipped.
- `node --test test/fast-extension.test.mjs test/fast-extensions-config-status.test.mjs test/provider-model-preferences-catalog.test.mjs` passed: 125 tests, 125 passed, 0 failed, 0 skipped.
- `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` passed; the production audit found 0 vulnerabilities.
- Root `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org` passed for `@diegopetrucci/pi-extensions@0.1.72`: 1,292,767 packed bytes and 163 files.
- Fast `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org --workspace @diegopetrucci/pi-fast` passed for `@diegopetrucci/pi-fast@0.1.4`: 5,625 packed bytes and 5 files.
- `git diff --check` passed; no staged files; all 28 fleet markers remain at Pi `0.84.4`.
- The read-only final validator observed only the expected pre-existing release-prep and ticket files; validation caused no changes.

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.4"],["@diegopetrucci/pi-extensions","0.1.72"]] -->
