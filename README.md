# pi-extensions

A collection of [pi](https://github.com/earendil-works/pi-mono) agent extensions I made:

- [`confirm-destructive`](./extensions/confirm-destructive): Confirms before destructive session actions like clear, switch, and fork.
- [`context-cap`](./extensions/context-cap): Caps effective model context windows at 200k tokens by default so pi avoids the `dumb zone`; toggle temporarily with `/context-cap`.
- [`context-inspector`](./extensions/context-inspector): Adds `/context`, a local self-contained HTML dashboard that breaks down where the current session context is going, with category overview, top offenders, and drilldown search.
- [`dirty-repo-guard`](./extensions/dirty-repo-guard): Prompts before new sessions, session switches, or forks when the current git repo has uncommitted changes.
- [`inline-bash`](./extensions/inline-bash): Expands `!{command}` snippets in user prompts by running them through bash before the prompt reaches the agent.
- [`librarian`](./extensions/librarian): Adds a GitHub research scout with a local repo checkout cache enabled by default under the OS user cache directory, toggleable with `/librarian-cache`, with cached repos expiring after 30 days of non-use.
- [`minimal-footer`](./extensions/minimal-footer): Replaces pi's built-in footer with a minimal configurable two-line layout: branch/repo on the first line, context/model on the second, optional `DUMB ZONE`, plus OpenAI Codex 5-hour and 7-day usage when available.
- [`notify`](./extensions/notify): Sends configurable terminal, desktop, bell, and sound notifications when pi finishes and is ready for input.
- [`openai-fast`](./extensions/openai-fast): Adds `/fast` to enable OpenAI Codex Fast mode for ChatGPT-auth GPT-5.4 and GPT-5.5 by injecting the priority service tier.
- [`oracle`](./extensions/oracle): Adds an Amp-style read-only oracle tool that auto-selects the strongest reasoning model on the current provider/subscription, covers pi’s built-in providers with hardcoded rankings, sets reasoning to xhigh by default, and shows live status while running.
- [`permission-gate`](./extensions/permission-gate): Prompts for confirmation before dangerous bash commands like `rm -rf`, `sudo`, and `chmod 777`.
- [`quiet-tools`](./extensions/quiet-tools): Renders collapsed built-in tool rows as a one-line invocation plus an expand hint without changing model-visible tool results; toggle temporarily with `/quiet-tools`.
- [`todo`](./extensions/todo): Adds a branch-aware `todo` tool for the agent and a `/todos` viewer for users.
- [`triage-comments`](./extensions/triage-comments): Adds `/triage-comments` and a read-only `triage_comments` subagent tool that classifies selected PR review comments with evidence and handling options without implementing changes.

(For the full list of pi extensions I use, [check out my dotfiles](https://github.com/diegopetrucci/dot/blob/main/.pi/agent/settings.json).)

## Install

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Or a specific extension:

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
```

Then reload pi:

```text
/reload
```
