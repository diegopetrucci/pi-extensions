Updates `oracle` auto-selection so Claude Fable 5 is preferred when it is available on Anthropic-compatible providers.

## Highlights

- Adds Claude Fable 5 to hardcoded oracle preferences for Anthropic, Amazon Bedrock, Cloudflare AI Gateway, GitHub Copilot, OpenCode, OpenRouter, and Vercel AI Gateway.
- Keeps newer Claude Opus 4.8 preferences as fallbacks after Fable where available.
- Updates the oracle provider matrix and README for Fable coverage.
- Publishes standalone `@diegopetrucci/pi-oracle@0.1.12` alongside `@diegopetrucci/pi-extensions@0.1.45`.

## Packages

- `@diegopetrucci/pi-extensions@0.1.45`
- `@diegopetrucci/pi-oracle@0.1.12`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone oracle:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
