Adds GPT-6 direct OpenAI API Fast mode to the unified `fast` extension. Fast mode is opt-in via `/fast` or the `enabled:true` configuration setting. It preserves existing OpenAI Codex OAuth Fast mode and documents provider-dependent accounting.

## Highlights

- **GPT-6 direct API Fast mode.** Eligible `gpt-6-astra`, `gpt-6-sol`, and `gpt-6-luna` requests on the direct OpenAI APIs use `service_tier: "fast"` when no tier is already set.
- **Codex behavior preserved.** Supported ChatGPT OAuth/subscription Codex models continue to use `service_tier: "priority"`; API-key Codex requests remain unaffected.
- **Accounting limitations documented.** Fast pricing, availability, rate limits, and effective usage reporting remain provider- and account-dependent. Pi may not include a Fast premium in its model catalog, and the extension does not patch usage totals.
- **Compatibility unchanged.** All 28 fleet markers remain **Pi 0.84.4**.

## Packages

- `@diegopetrucci/pi-fast@0.1.3`
- `@diegopetrucci/pi-extensions@0.1.71`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.3"],["@diegopetrucci/pi-extensions","0.1.71"]] -->
