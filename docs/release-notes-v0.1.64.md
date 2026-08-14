# Release notes — v0.1.64

## Highlights

- `@diegopetrucci/pi-notify` forwards OSC 777 and OSC 99 terminal notifications through tmux's DCS passthrough when `$TMUX` is set, so tmux can deliver them to the outer terminal.
- `terminal.tmuxPassthrough` supports `auto` (the default), `always`, and `never`, allowing users to control wrapping explicitly.
- tmux users must enable `set -g allow-passthrough all`; desktop, bell, and sound channels remain unchanged.
- Wrapping doubles ESC bytes inside the forwarded payload, and disabled tmux passthrough drops wrapped output just as it drops the bare sequence.

## Packaging

- `@diegopetrucci/pi-notify@0.1.16`
- `@diegopetrucci/pi-extensions@0.1.64`

## Validation

- `npm ci` completed before validation. npm reported 3 vulnerabilities (1 moderate, 2 high), a deprecated `node-domexception` warning, and five install scripts not yet covered by `allowScripts`.
- `npm run preflight:install-state` passed: package state matched `package-lock.json` with 246 installed packages and 28 local package entries checked.
- `npm run ci` passed with 579/579 tests, including typecheck and the full test suite.
- Release-focused tests passed with 34/34 tests: `prepare-release`, `publish-release`, publish safety, and tarball runtime smoke coverage.
- Corrected `prepare-release` dry-run selected exactly `@diegopetrucci/pi-notify@0.1.16` then `@diegopetrucci/pi-extensions@0.1.64`; all four v0.1.64 documents were preserved.
- Exact registry checks returned E404/no-match responses for both target versions: `@diegopetrucci/pi-notify@0.1.16` and `@diegopetrucci/pi-extensions@0.1.64`.
- `npm pack --dry-run --json --ignore-scripts` and `npm publish --dry-run --ignore-scripts --access public` passed for exactly those two targets: Notify was 5 files/5,621 bytes packed/16,869 bytes unpacked; the umbrella was 161 files/1,274,647 bytes packed/2,162,150 bytes unpacked.
- Temporary Notify and umbrella tarball scans matched the target manifests and found zero `docs/`, `.tickets/`, `.pi-subagents/`, `.npmrc`, or `*.tgz` entries; temporary artifacts were removed.
- Manifest, lockfile, and managed release-document evidence checks passed: both target versions matched, and all four v0.1.64 documents contained the exact Notify-then-umbrella package evidence. All 28 fleet markers read `0.83.0`.
- Repository artifact scan found zero `*.tgz` or `.npmrc` files outside `node_modules`; `git diff --check` passed and no files were staged.
- `npm audit`, `npm audit --omit=dev`, and `npm audit --omit=dev --audit-level=high` each reported the same 3 transitive vulnerabilities (1 moderate, 2 high) in `brace-expansion`/`undici`; no remediation was applied.

<!-- prepare-release:packages [["@diegopetrucci/pi-notify","0.1.16"],["@diegopetrucci/pi-extensions","0.1.64"]] -->
