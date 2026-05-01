# pi-extensions

A collection of [pi](https://github.com/badlogic/pi-mono) agent extensions I made:

- [`minimal-footer`](./extensions/minimal-footer): Replaces pi's built-in footer with a minimal configurable two-line layout: branch/repo on the first line, context/model on the second, optional `DUMB ZONE`, plus OpenAI Codex 5-hour and 7-day usage when available.
- [`oracle`](./extensions/oracle): Adds an Amp-style read-only oracle tool that auto-selects the strongest reasoning model on the current provider/subscription, covers pi’s built-in providers with hardcoded rankings, sets reasoning to xhigh by default, and shows live status while running.
- [`permission-gate`](./extensions/permission-gate): Prompts for confirmation before dangerous bash commands like `rm -rf`, `sudo`, and `chmod 777`.
- [`confirm-destructive`](./extensions/confirm-destructive): Confirms before destructive session actions like clear, switch, and fork.
- [`notify`](./extensions/notify): Sends configurable terminal, desktop, bell, and sound notifications when pi finishes and is ready for input.

(For the full list of pi extensions I use, [check out my dotfiles](https://github.com/diegopetrucci/dot/blob/main/.pi/agent/settings.json).)

## Install

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Or pin the GitHub package to this release:

```bash
pi install git:github.com/diegopetrucci/pi-extensions@v0.1.13
```

Or a specific extension:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
