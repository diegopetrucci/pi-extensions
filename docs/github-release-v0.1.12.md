# GitHub release body — v0.1.12

## v0.1.12

This release refreshes `oracle` model selection for the latest top reasoning models and provider entries in pi's built-in model catalog.

### Highlights

- `oracle` now prefers newer top models such as Claude Opus 4.7, GPT-5.5 Pro, GPT-5.5, Gemini 3.1 Pro, Grok 4.3, Kimi K2.6, DeepSeek V4 Pro, MiniMax M2.7, and Mistral Medium 3.5 where available
- added provider preference coverage for Cloudflare AI Gateway, Cloudflare Workers AI, DeepSeek, Fireworks, Moonshot, and Moonshot CN
- updated the oracle provider matrix with the expected top pick for every built-in provider in the installed pi model catalog
- updated oracle docs to mention the expanded built-in provider coverage
- added repository agent guidance to run the release checklist before considering repository changes complete

### Included docs

- [`docs/release-notes-v0.1.12.md`](./release-notes-v0.1.12.md)
- [`docs/publish-checklist-v0.1.12.md`](./publish-checklist-v0.1.12.md)
- [`docs/announcement-v0.1.12.md`](./announcement-v0.1.12.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.12`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.6`

### Install

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
