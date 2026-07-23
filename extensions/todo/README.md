# todo

A pi extension that adds a branch-aware todo list managed by the agent.

This started from the original `todo.ts` example in [`earendil-works/pi`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/todo.ts), with small packaging and snapshot-safety tweaks.

## What it adds

- a `todo` tool for the agent to list, add, toggle, and clear todos
- a `/todos` command for users to view todos on the current branch
- todo state stored as snapshots in tool result details, so session branches reconstruct the right todo list for that point in history

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-todo
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

## Notes

- Hooks `session_start` and `session_tree` to reconstruct branch-local todo state.
- The `todo` tool supports `list`, `add`, `toggle`, and `clear` actions.
- The `/todos` command opens an interactive viewer and requires UI mode.
