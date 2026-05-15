This release adds `openai-fast`, a new pi extension that exposes `/fast` controls for OpenAI Codex Fast mode on ChatGPT-auth GPT-5.4 and GPT-5.5.

## Highlights

- adds `/fast status`, `/fast on`, `/fast off`, `/fast auto`, and `/fast toggle`
- injects `service_tier: "priority"` into eligible OpenAI Codex request payloads
- only targets the `openai-codex` provider with ChatGPT OAuth/subscription auth
- only targets `gpt-5.4` and `gpt-5.5`
- skips payloads that already define `service_tier`, so future native pi support or another extension can win
- defaults off to avoid accidentally spending Fast-mode credits
- publishes standalone `@diegopetrucci/pi-openai-fast`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone openai-fast package: `@diegopetrucci/pi-openai-fast`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone openai-fast:

```bash
pi install npm:@diegopetrucci/pi-openai-fast
```

Then reload pi:

```text
/reload
```
