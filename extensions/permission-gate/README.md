# permission-gate

A small pi extension that prompts for confirmation before running potentially dangerous bash commands.

This is adapted from the original `permission-gate.ts` example in [`badlogic/pi-mono`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/permission-gate.ts) and kept basically the same.

## What it checks

- `rm -rf`
- `sudo`
- `chmod` / `chown` with `777`

If pi is running without an interactive UI, it blocks matching commands by default.

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
- Only inspects the `bash` tool.
- Prompts with a simple `Yes` / `No` selector before allowing dangerous commands.
