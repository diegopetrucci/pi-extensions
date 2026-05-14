# Release notes — v0.1.25

## Highlights

This release adds two new pi extensions copied from upstream examples and packaged for this collection: `todo` and `inline-bash`.

## todo

- adds standalone package `@diegopetrucci/pi-todo@0.1.0`
- registers a branch-aware `todo` tool with `list`, `add`, `toggle`, and `clear` actions
- adds a `/todos` command for viewing the current branch's todo list in the TUI
- stores todo snapshots in tool result details so session tree navigation can reconstruct the right state

## inline-bash

- adds standalone package `@diegopetrucci/pi-inline-bash@0.1.0`
- expands `!{command}` snippets in user prompts by running them through `bash -c`
- preserves whole-line `!command` behavior for pi's built-in shell command mode
- ignores extension-injected follow-up messages, applies a 30-second timeout, and caps each expansion at 50,000 characters

### Security note

`inline-bash` executes prompt text through the local shell before the agent sees it. Treat pasted prompts containing `!{...}` as shell code. `permission-gate` does not intercept these expansions because they are user-prompt transformations, not agent tool calls.

## Documentation

- corrects copied-example attribution links to the upstream `earendil-works/pi-mono` repository

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.25`
- standalone todo package: `@diegopetrucci/pi-todo@0.1.0`
- standalone inline-bash package: `@diegopetrucci/pi-inline-bash@0.1.0`

## Suggested release blurb

`v0.1.25 adds todo, a branch-aware agent task list with a /todos viewer, and inline-bash, which expands trusted !{command} prompt snippets through local bash before the agent runs.`
