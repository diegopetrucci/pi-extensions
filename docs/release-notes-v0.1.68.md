# Release notes — v0.1.68

## Highlights

- Release PR #82's conservative default: `gate.breakEvenThresholdByState.mid_loop=1`, while idle stays `22`.
- Show both effective state thresholds in `/context-pruning status`, with regression coverage for defaults, custom overrides, and the global fallback.
- Qualify cache-cost claims: enough subsequent calls can amortize a one-time bust, and turn-start classification does not imply a cold cache. Mark the historical `22/22` decision as superseded.
- Manual prunes, persisted decisions, and explicit configuration overrides retain their behavior. Existing saved `mid_loop=22` overrides are not migrated automatically.
- Fleet markers remain Pi 0.84.4. This release does not claim new Pi compatibility certification.

## Packaging

- `pi-dynamic-context-pruning@0.1.9`
- `@diegopetrucci/pi-extensions@0.1.68`

## Validation

- Deterministic release preparation selected only Dynamic Context Pruning and the umbrella package, verified both target versions were unpublished, and synchronized version-only lockfile changes.
- Clean `npm ci` completed after version bookkeeping; install-state preflight checked 270 installed packages and 28 local entries.
- `npm run ci` passed typecheck and all 613 tests: 612 passed, one native-Windows-only fixture skipped locally. The suite includes isolated tarball install/load smoke for all publishable packages.
- Both selected package dry-runs passed. The root unpacked size is 2,216,861 bytes, within its 2,225,000-byte budget; the standalone package is 142,813 bytes unpacked.
- Production dependency audit reported zero vulnerabilities. No fleet compatibility marker changed.

<!-- prepare-release:packages [["pi-dynamic-context-pruning","0.1.9"],["@diegopetrucci/pi-extensions","0.1.68"]] -->
