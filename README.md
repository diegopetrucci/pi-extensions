# pi-extensions

[![Total npm downloads](https://img.shields.io/npm/dt/%40diegopetrucci%2Fpi-extensions?label=total%20npm%20downloads)](https://www.npmjs.com/package/@diegopetrucci/pi-extensions)

A collection of [pi](https://pi.dev) agent extensions I made. (btw, [I am also building my own harness on top of pi](https://github.com/diegopetrucci/the-last-harness). have a look!)

### Subagents

- [`code-reviewer`](./extensions/code-reviewer): Adds a read-only `code_reviewer` subagent tool that reviews local changes for ticket fit, diff mismatches, correctness, security, simplicity, and validation gaps without implementing fixes, auto-selects a contrarian-style opposite-provider review model when available, and clamps requested thinking to the chosen model's capabilities.
- [`contrarian`](./extensions/contrarian): Adds a read-only contrarian tool that spins up an isolated subprocess to stress-test plans, designs, assumptions, bug hypotheses, and conclusions by steelmanning the strongest opposing case.
- [`librarian`](./extensions/librarian): Adds a GitHub research scout with a local repo checkout cache disabled by default under the OS user cache directory, toggleable with `/librarian-cache`, configurable subagent model/thinking defaults via `/librarian-config`, and cached repos expiring after 7 days of non-use.
- [`oracle`](./extensions/oracle): Adds an Amp-style read-only oracle tool that auto-selects the strongest reasoning model on the current provider/subscription, supports persisted `/oracle` model/thinking defaults, requests xhigh reasoning by default and clamps to model capabilities, and shows live status while running.

### Providers

- [`claude-fast`](./extensions/claude-fast): Adds `/claude-fast` to enable Anthropic Claude Fast mode for supported Claude Opus models by injecting `speed: "fast"`.
- [`openai-fast`](./extensions/openai-fast): Adds `/fast` to enable OpenAI Codex Fast mode for ChatGPT-auth GPT-5.4, GPT-5.5, and GPT-5.6 Codex variants by injecting the priority service tier.

### UI

- [`git-footer`](./extensions/git-footer): Standalone extension that adds TLH-style git dirty counts, ahead/behind, and optional PR number to pi's built-in footer status area.
- [`minimal-footer`](./extensions/minimal-footer): Replaces pi's built-in footer with a minimal configurable two-line layout: branch plus cached git dirty/ahead/PR status and repo on the first line, context/model on the second, optional `DUMB ZONE`, optional `xp` marker, plus OpenAI Codex 5-hour and 7-day usage when available.
- [`quiet-tools`](./extensions/quiet-tools): Renders collapsed built-in tool rows as a one-line invocation plus an expand hint without changing model-visible tool results; toggle temporarily with `/quiet-tools`.

### / Slash commands

- [`agent-workflow-audit`](./extensions/agent-workflow-audit): Adds `/agent-workflow-audit`, which runs an isolated repo workflow audit subagent and returns only the final distilled report to the main session.
- [`annotate-git-diff`](./extensions/annotate-git-diff): Adds `/annotate-git-diff`, a native Glimpse UI for annotating git diffs and appending structured feedback prompts to the editor.
- [`annotate-last-message`](./extensions/annotate-last-message): Adds `/annotate-last-message`, a native Glimpse UI for annotating the latest assistant reply and sending planning-oriented feedback back through the editor.
- [`review`](./extensions/review): Adds `/review` and `/end-review` for interactive code reviews of local changes, commits, PRs, and selected paths.
- [`triage-comments`](./extensions/triage-comments): Adds `/triage-comments` and a read-only `triage_comments` subagent tool that can auto-detect the current branch's PR, filter resolved/outdated inline comments, classify selected review comments with evidence, and suggest handling options without implementing changes

### Context management

- [`context-cap`](./extensions/context-cap): Caps effective model context windows at 200k tokens by default so pi avoids the `dumb zone`; toggle temporarily with `/context-cap`.
- [`context-inspector`](./extensions/context-inspector): Adds `/context`, a local self-contained HTML dashboard that breaks down where the current session context is going, with category overview, top offenders, and drilldown search.
- [`dynamic-context-pruning`](./extensions/dynamic-context-pruning): Automatically prunes duplicate tool results, stale errored inputs, and superseded file-op outputs from long sessions behind a cache-aware net-benefit gate, with a `/prune` picker and `/context-pruning` status/control commands.

### Safety

- [`confirm-destructive`](./extensions/confirm-destructive): Confirms before destructive session actions like clear, switch, and fork.
- [`dirty-repo-guard`](./extensions/dirty-repo-guard): Prompts before new sessions, session switches, or forks when the current git repo has uncommitted changes.
- [`permission-gate`](./extensions/permission-gate): Prompts for confirmation before dangerous bash commands and protected `write`/`edit` targets like `.git`, `node_modules`, and secret-bearing `.env` files.

### Quality of life

- [`brrr`](./extensions/brrr): Sends brrr push notifications when pi finishes an agent turn and is ready for input, with optional macOS idle gating.
- [`gnosis`](./extensions/gnosis): Exposes the `gn` repo-local knowledge base CLI as an agent tool for searching and recording durable project decisions, constraints, and intent.
- [`illustrations-to-explain-things`](./extensions/illustrations-to-explain-things): Adds a skill for generating clean, absurd Xiaohei-style article illustrations, shot lists, image edits, and visual metaphors.
- [`inline-bash`](./extensions/inline-bash): Expands `!{command}` snippets in user prompts by running them through bash before the prompt reaches the agent.
- [`notify`](./extensions/notify): Sends configurable terminal, desktop, bell, and sound notifications when pi finishes and is ready for input.
- [`todo`](./extensions/todo): Adds a branch-aware `todo` tool for the agent and a `/todos` viewer for users..

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
