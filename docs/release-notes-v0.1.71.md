# Release notes — v0.1.71

## Highlights

- Add direct OpenAI API Fast mode to the unified `fast` extension for GPT-6 Astra, GPT-6 Sol, and GPT-6 Luna on `openai-responses` and `openai-completions`; Fast mode is opt-in via `/fast` or the `enabled:true` configuration setting. Eligible requests receive `service_tier: "fast"` unless they already specify a tier.
- Preserve OpenAI Codex Fast mode: supported ChatGPT OAuth/subscription models continue using `service_tier: "priority"`, while API-key Codex requests remain unchanged.
- Keep Fast-mode accounting caveats explicit: pricing, availability, and rate limits depend on the provider and account; Pi's model catalog may not include the premium, and the extension does not patch usage totals.
- Fleet compatibility is unchanged; all 28 markers remain at Pi `0.84.4`.

## Packaging

- `@diegopetrucci/pi-fast@0.1.3`
- `@diegopetrucci/pi-extensions@0.1.71`

## Validation

- `npm run preflight:install-state` passed; 237 installed packages and 28 local entries were checked.
- `npm run typecheck` passed.
- `npm test` passed: 729 tests total, 728 passed, 0 failed, and 1 skipped.
- `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` passed; production audit found 0 vulnerabilities.
- Root `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org` passed for `@diegopetrucci/pi-extensions@0.1.71`: 1,292,753 packed bytes, 2,236,059 unpacked bytes, 163 files, and no suspicious paths.
- Fast `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org --workspace @diegopetrucci/pi-fast` passed for `@diegopetrucci/pi-fast@0.1.3`: 5,612 packed bytes, 17,688 unpacked bytes, 5 files, and no suspicious paths.
- `git diff --check` passed; no staged files; all 28 fleet markers remain at Pi `0.84.4`.

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.3"],["@diegopetrucci/pi-extensions","0.1.71"]] -->
