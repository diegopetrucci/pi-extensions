# Announcement drafts — v0.1.72

## Short

Pi Extensions v0.1.72 adds Claude Opus 5.5 (`claude-opus-5-5`) to the unified `fast` extension's Anthropic Fast-mode allowlist. Eligible `anthropic-messages` requests use `speed: "fast"` and the required Fast-mode beta; existing Claude Opus 4.8 and Claude Opus 5 support, API-key and Claude Code OAuth access, and all 28 Pi `0.84.4` fleet markers remain unchanged. Final validation passed: preflight checked 237 installed packages and 28 local entries; typecheck passed; 729 tests completed with 728 passed, 0 failed, and 1 skipped; production audit found 0 vulnerabilities; root pack `@diegopetrucci/pi-extensions@0.1.72` had 1,292,767 packed bytes and 163 files; Fast pack `@diegopetrucci/pi-fast@0.1.4` had 5,625 packed bytes and 5 files; `git diff --check` passed with no staged files, and validation caused no changes to the expected pre-existing release-prep and ticket files.

## Packages

- `@diegopetrucci/pi-fast@0.1.4`
- `@diegopetrucci/pi-extensions@0.1.72`

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.4"],["@diegopetrucci/pi-extensions","0.1.72"]] -->
