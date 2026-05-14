# GitHub release body — v0.1.25

## v0.1.25

This release adds two new packaged pi extensions: `todo` and `inline-bash`.

### Highlights

- adds `todo`, a branch-aware agent todo tool with `list`, `add`, `toggle`, and `clear` actions
- adds `/todos`, an interactive viewer for the current branch's todo list
- adds `inline-bash`, which expands trusted `!{command}` snippets in user prompts through `bash -c`
- keeps whole-line `!command` prompts reserved for pi's built-in shell command behavior
- publishes standalone `@diegopetrucci/pi-todo@0.1.0`
- publishes standalone `@diegopetrucci/pi-inline-bash@0.1.0`
- corrects copied-example attribution links to the upstream `earendil-works/pi-mono` repository

### Security note

`inline-bash` executes `!{...}` prompt snippets locally before the agent sees the prompt. Treat pasted prompts as shell code. `permission-gate` does not intercept these expansions because they are user-prompt transformations, not agent tool calls.

### Included docs

- [`docs/release-notes-v0.1.25.md`](./release-notes-v0.1.25.md)
- [`docs/publish-checklist-v0.1.25.md`](./publish-checklist-v0.1.25.md)
- [`docs/announcement-v0.1.25.md`](./announcement-v0.1.25.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.25`
- standalone todo package: `@diegopetrucci/pi-todo@0.1.0`
- standalone inline-bash package: `@diegopetrucci/pi-inline-bash@0.1.0`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone todo:

```bash
pi install npm:@diegopetrucci/pi-todo
```

Standalone inline-bash:

```bash
pi install npm:@diegopetrucci/pi-inline-bash
```

Then reload pi:

```text
/reload
```
