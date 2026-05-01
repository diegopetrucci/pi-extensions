# minimal-footer

A minimal custom footer for pi.

![minimal-footer preview](https://raw.githubusercontent.com/diegopetrucci/pi-extensions/main/assets/minimal-footer-preview.png)

It replaces pi's built-in footer with a cleaner two-line layout that focuses on the information I care about most:

- current git branch
- current repo name
- current context percentage
- current model and thinking level
- OpenAI Codex 5-hour and 7-day usage when available

## Layout

On wide terminals it renders two lines:

```text
<git-branch>                                         <repo-name>
<context-%>                                     <model> <thinking>
```

Example:

```text
fix/remove-detached-image-tasks                     SendItToMy
44.1%                                              gpt-5.4 high
```

When using `openai-codex`, the bottom-left line also includes subscription usage:

```text
44.1% · 5h 12% · 7d 38%
```

On narrow terminals it falls back to one item per line.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
```

### Collection package

```bash
pi install npm:@diegopetrucci/pi-extensions
```

### GitHub package

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## What it shows

- **Top left:** current git branch
- **Top right:** current repo directory name
- **Bottom left:** current context usage percentage
- **Bottom left on `openai-codex`:** current context usage percentage plus 5-hour and 7-day Codex usage
- **Bottom right:** model id and thinking level

## Publishing notes

This extension also lives inside the broader [`pi-extensions`](../../README.md) collection, but it is set up to be publishable as its own npm package too.

## Notes

- Replaces pi's built-in footer entirely.
- Uses pi footer data for git branch updates.
- Shows only context percentage, not context window size.
- Shows the model id rather than a provider-specific display label.
- For `openai-codex`, reads pi's stored OAuth login and fetches usage from ChatGPT's backend usage endpoint.
- Usage is cached briefly in memory and refreshed after turns.
