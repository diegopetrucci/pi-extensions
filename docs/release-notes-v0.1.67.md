# Release notes — v0.1.67

## Highlights

- Oracle, Contrarian, and Code Reviewer prefer GPT-6 Astra on direct OpenAI and Codex, retaining GPT-5.6 and older fallbacks.
- Shared cross-provider preferences include Astra. Copilot intentionally keeps Claude ahead of Astra; runtime regressions cover Claude-to-Astra-to-Sol fallback.
- Oracle and Contrarian remove unavailable pinned Copilot, OpenRouter, NVIDIA, and xAI preference entries.
- This is a model-selection release, not Pi 0.85.1 fleet certification. All fleet markers remain 0.84.4. Native UI and live-provider gates in `pi-0.85.1-validation.md` remain open; Astra fast-mode support is not claimed.

## Packaging

- `@diegopetrucci/pi-code-reviewer@0.1.10`
- `@diegopetrucci/pi-contrarian@0.1.12`
- `@diegopetrucci/pi-oracle@0.1.27`
- `@diegopetrucci/pi-extensions@0.1.67`

## Validation

- After final version bookkeeping, clean `npm ci` and install-state preflight passed (270 installed packages and 28 local entries).
- `npm run ci` passed typecheck and 611 tests: 610 passed, one native-Windows fixture skipped locally. Includes all-package isolated tarball install/load smoke and selection/cwd regressions.
- Production dependency audit reported zero vulnerabilities. All four selected package dry-runs passed; the root unpacked size is 2,215,171 bytes, within its 2,225,000-byte budget.
- Deterministic release preparation selected only Code Reviewer, Contrarian, Oracle, and the umbrella package, confirming the four target versions were unpublished. No fleet marker changed.

<!-- prepare-release:packages [["@diegopetrucci/pi-code-reviewer","0.1.10"],["@diegopetrucci/pi-contrarian","0.1.12"],["@diegopetrucci/pi-oracle","0.1.27"],["@diegopetrucci/pi-extensions","0.1.67"]] -->
