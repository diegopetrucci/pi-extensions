# Announcement copy — v0.1.21

## Short post

Released `@diegopetrucci/pi-extensions@0.1.21`.

This release adds `openai-fast`: a `/fast` extension for OpenAI Codex Fast mode on ChatGPT-auth GPT-5.4 and GPT-5.5. It injects the priority service tier only for eligible Codex requests and defaults off so installing the collection does not accidentally spend Fast-mode credits.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or just openai-fast:

```bash
pi install npm:@diegopetrucci/pi-openai-fast
```

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.21`.

New: `openai-fast`, a `/fast` extension for OpenAI Codex Fast mode on ChatGPT-auth GPT-5.4/GPT-5.5. It injects the priority service tier only for eligible Codex requests and defaults off.

`pi install npm:@diegopetrucci/pi-extensions`

## Very short version

Released `pi-extensions` v0.1.21.

Adds `openai-fast`: `/fast` controls for ChatGPT-auth OpenAI Codex Fast mode on GPT-5.4/GPT-5.5.

## Discord / forum version

`pi-extensions@0.1.21` is out.

This release adds `openai-fast`, a new extension that exposes `/fast status`, `/fast on`, `/fast off`, `/fast auto`, and `/fast toggle`.

It enables OpenAI Codex Fast mode by injecting `service_tier: "priority"`, but only for ChatGPT OAuth/subscription auth on `openai-codex` GPT-5.4 and GPT-5.5. It skips requests that already define a service tier, and it defaults off so installing the collection does not accidentally spend Fast-mode credits.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone openai-fast:

```bash
pi install npm:@diegopetrucci/pi-openai-fast
```
