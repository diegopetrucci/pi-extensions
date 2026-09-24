Minimal Footer now labels OpenAI Codex usage windows from the durations reported for the account instead of assuming fixed primary and secondary periods.

## Highlights

- **Accurate automatic labels.** Common 5-hour, daily, weekly, monthly, and yearly windows are derived from OpenAI's reported durations, including small backend rounding differences.
- **No positional guesses.** Accounts with only a weekly primary window now show `7d`, while missing or unrecognized durations use neutral usage labels.
- **Overrides preserved.** Explicit configured labels still take precedence over automatic detection.
- **Compatibility unchanged.** All 28 fleet markers remain **Pi 0.84.4**; this release does not advance fleet certification.

## Packages

- `@diegopetrucci/pi-minimal-footer@0.1.21`
- `@diegopetrucci/pi-extensions@0.1.70`

## Install

Minimal Footer only:

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
```

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-minimal-footer","0.1.21"],["@diegopetrucci/pi-extensions","0.1.70"]] -->
