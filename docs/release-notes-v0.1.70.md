# Release notes — v0.1.70

## Highlights

- Label OpenAI Codex usage windows in Minimal Footer from the durations reported by OpenAI instead of assuming the primary window is always 5 hours and the secondary window is always 7 days.
- Recognize common 5-hour, daily, weekly, monthly, and yearly windows with a small tolerance for backend rounding.
- Preserve explicit configured labels; when an automatic label cannot be derived, use neutral `usage` or `secondary usage` labels rather than guessing from window position.
- Keep all 28 fleet markers at Pi `0.84.4`; this release does not advance fleet certification.

## Packaging

- `@diegopetrucci/pi-minimal-footer@0.1.21`
- `@diegopetrucci/pi-extensions@0.1.70`

## Validation

- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.70-input.json` passed and selected exactly Minimal Footer and the umbrella bundle in managed order; all four managed package-evidence markers were preserved on the post-write dry-run.
- `npm ci --ignore-scripts --no-audit --no-fund` passed; 264 packages were added.
- `npm run preflight:install-state` passed; 237 installed packages and 28 local package entries were checked.
- `npm run typecheck` passed.
- `npm test` passed: 728 tests total, 727 passed, 0 failed, and 1 skipped.
- `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` passed; the production audit found 0 vulnerabilities.
- Both dry-run packs passed: `@diegopetrucci/pi-minimal-footer@0.1.21` was 11,676 bytes packed, 44,208 bytes unpacked, 6 files; `@diegopetrucci/pi-extensions@0.1.70` was 1,292,451 bytes packed, 2,234,387 bytes unpacked, 163 files.
- The root unpacked size of 2,234,387 bytes is within the 2,235,000-byte budget.
- The validation run recorded no staged files and exactly 28 fleet markers at Pi `0.84.4`.
- `git diff --check` passed.

<!-- prepare-release:packages [["@diegopetrucci/pi-minimal-footer","0.1.21"],["@diegopetrucci/pi-extensions","0.1.70"]] -->
