# notify

A small pi extension that sends a terminal or desktop notification when the agent finishes and is waiting for input.

This is adapted from the original `notify.ts` example in [`badlogic/pi-mono`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/notify.ts) and kept basically the same.

## Supported notification backends

- OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
- OSC 99: Kitty
- Windows toast: Windows Terminal / WSL

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-notify
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

- Hooks the `agent_end` event.
- Sends `Pi` / `Ready for input` when the agent finishes.
- Chooses the notification backend from the current terminal environment.
