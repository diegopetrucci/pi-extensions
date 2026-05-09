# pi-extensions

A collection of [pi](https://github.com/earendil-works/pi-mono) agent extensions I made:

- [`confirm-destructive`](./extensions/confirm-destructive): Confirms before destructive session actions like clear, switch, and fork.
- [`context-cap`](./extensions/context-cap): Caps effective model context windows at 200k tokens by default so pi avoids the `dumb zone`; toggle temporarily with `/context-cap`.
- [`minimal-footer`](./extensions/minimal-footer): Replaces pi's built-in footer with a minimal configurable two-line layout: branch/repo on the first line, context/model on the second, optional `DUMB ZONE`, plus OpenAI Codex 5-hour and 7-day usage when available.
- [`notify`](./extensions/notify): Sends configurable terminal, desktop, bell, and sound notifications when pi finishes and is ready for input.
- [`oracle`](./extensions/oracle): Adds an Amp-style read-only oracle tool that auto-selects the strongest reasoning model on the current provider/subscription, covers pi’s built-in providers with hardcoded rankings, sets reasoning to xhigh by default, and shows live status while running.
- [`permission-gate`](./extensions/permission-gate): Prompts for confirmation before dangerous bash commands like `rm -rf`, `sudo`, and `chmod 777`.
- [`quiet-tools`](./extensions/quiet-tools): Renders collapsed built-in tool rows as quiet one-line previews without changing model-visible tool results; toggle temporarily with `/quiet-tools`.

(For the full list of pi extensions I use, [check out my dotfiles](https://github.com/diegopetrucci/dot/blob/main/.pi/agent/settings.json).)

## Install

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Or pin the GitHub package to this release:

```bash
pi install git:github.com/diegopetrucci/pi-extensions@v0.1.17
```

Or a specific extension:

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
```

Then reload pi:

```text
/reload
```
