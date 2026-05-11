# Release notes — v0.1.21

## Highlights

This release adds `openai-fast`, a new pi extension that exposes `/fast` controls for OpenAI Codex Fast mode on ChatGPT-auth GPT-5.4 and GPT-5.5.

## openai-fast

- adds `/fast status`, `/fast on`, `/fast off`, `/fast auto`, and `/fast toggle`
- injects `service_tier: "priority"` into eligible OpenAI Codex request payloads
- limits injection to:
  - `openai-codex` provider
  - `openai-codex-responses` API
  - ChatGPT OAuth/subscription auth
  - `gpt-5.4` and `gpt-5.5`
  - payloads that do not already define `service_tier`
- defaults off so installing the collection does not accidentally spend Fast-mode credits
- supports optional global and project config via `openai-fast.json`
- exposes a standalone package: `@diegopetrucci/pi-openai-fast`

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.21`
- standalone openai-fast package: `@diegopetrucci/pi-openai-fast@0.1.0`
- standalone quiet tools package: `@diegopetrucci/pi-quiet-tools@0.1.1`
- standalone context inspector package: `@diegopetrucci/pi-context-inspector@0.1.0`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.0`
- standalone context cap package: `@diegopetrucci/pi-context-cap@0.1.0`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

## Suggested release blurb

`v0.1.21 adds openai-fast, a new /fast extension that enables OpenAI Codex Fast mode for ChatGPT-auth GPT-5.4 and GPT-5.5 by injecting the priority service tier.`
