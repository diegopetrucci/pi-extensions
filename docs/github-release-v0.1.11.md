This release adds OpenAI Codex subscription usage to `minimal-footer`.

## Highlights

- `minimal-footer` now shows `5h` and `7d` usage percentages when the active provider is `openai-codex`
- usage is fetched from ChatGPT's backend usage endpoint using pi's stored OpenAI Codex OAuth login
- the footer refreshes usage on session start, model change, and turn end
- usage is cached briefly in memory
- non-OpenAI providers keep the previous footer behavior
- `extensions/minimal-footer/README.md` and package metadata were updated accordingly

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone minimal footer:

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
```

Then reload pi:

```text
/reload
```
