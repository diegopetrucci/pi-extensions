# confirm-destructive

A small pi extension that asks for confirmation before destructive session actions.

This is adapted from the original `confirm-destructive.ts` example in [`badlogic/pi-mono`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/confirm-destructive.ts) and kept basically the same.

## What it checks

- clearing the current session
- switching sessions when the current session has user messages
- forking from an entry

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-confirm-destructive
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

- Hooks `session_before_switch` and `session_before_fork`.
- Cancels the action when the user declines.
- Does nothing in non-interactive mode.
