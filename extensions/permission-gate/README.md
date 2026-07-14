# permission-gate

A small pi extension that prompts for confirmation before running potentially dangerous bash commands or writing to protected paths.

This is adapted from the original `permission-gate.ts` example in [`earendil-works/pi-mono`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/examples/extensions/permission-gate.ts) and kept basically the same.

## What it checks

- `rm -rf`
- `sudo`
- `chmod` / `chown` with `777`
- direct `write` / `edit` calls touching normalized protected paths:
  - exact `.git` path segments
  - exact `node_modules` path segments
  - secret-bearing `.env` files such as `.env` and `.env.production`

Safe `.env` templates/examples such as `.env.example` and `.env.production.template` are allowed.

If pi is running without an interactive UI, it blocks matching commands and protected path writes by default.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-permission-gate
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

- Hooks the `tool_call` event.
- Inspects `bash`, `write`, and `edit` tool calls.
- Normalizes relative/absolute paths before matching so traversal tricks do not bypass the guard.
- Prompts with a simple `Yes` / `No` selector before allowing dangerous commands or protected path writes.
