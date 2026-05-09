# compact-bash

A pi extension that makes collapsed assistant `bash` tool output much quieter.

When enabled, collapsed bash output renders as one output line plus an inline hidden-line count and `Ctrl+O` expand hint. Expanding with `Ctrl+O` still shows the full rendered output.

## Commands

```text
/compact-bash status
/compact-bash off
/compact-bash on
/compact-bash toggle
```

The extension starts enabled by default. Disabling is temporary for the current extension runtime/session; after `/reload`, `/new`, `/resume`, or `/fork`, it starts enabled again.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-compact-bash
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

- This extension overrides pi's built-in `bash` tool so it can customize only the TUI renderer.
- It reuses pi's built-in bash implementation and preserves `shellPath`/`shellCommandPrefix` settings when they are available from settings files.
- It does not truncate or rewrite the actual tool result sent to the model.
- It affects assistant-invoked `bash` tool rows. User `!`/`!!` bash commands are rendered by a separate pi component and keep pi's default preview behavior.
