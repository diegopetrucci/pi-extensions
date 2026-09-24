# Announcement drafts — v0.1.71

## Short

Pi Extensions v0.1.71 adds direct OpenAI API Fast mode for GPT-6 Astra, GPT-6 Sol, and GPT-6 Luna through the unified `fast` extension. Fast mode is opt-in via `/fast` or the `enabled:true` configuration setting. Eligible requests use `service_tier: "fast"` without changing an existing tier, while supported ChatGPT OAuth/subscription Codex models retain `service_tier: "priority"` and API-key Codex requests remain unaffected. Fast pricing and usage accounting remain provider- and account-dependent: Pi may not include the premium in its model catalog, and the extension does not patch usage totals. All 28 fleet markers remain at Pi 0.84.4. Verified release checks passed: preflight checked 237 installed packages and 28 local entries; typecheck passed; 729 tests completed with 728 passed, 0 failed, and 1 skipped; production audit found 0 vulnerabilities; root pack `@diegopetrucci/pi-extensions@0.1.71` was 1,292,753 packed bytes, 2,236,059 unpacked bytes, and 163 files with no suspicious paths; Fast pack `@diegopetrucci/pi-fast@0.1.3` was 5,612 packed bytes, 17,688 unpacked bytes, and 5 files with no suspicious paths; `git diff --check` passed with no staged files.

## Packages

- `@diegopetrucci/pi-fast@0.1.3`
- `@diegopetrucci/pi-extensions@0.1.71`

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.3"],["@diegopetrucci/pi-extensions","0.1.71"]] -->
