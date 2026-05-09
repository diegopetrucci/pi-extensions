# quiet-tools

A pi extension that makes collapsed built-in tool rows much quieter in the TUI.

When enabled, collapsed tool output renders as one output line plus an inline hidden-line count and `Ctrl+O` expand hint. Expanding with `Ctrl+O` still shows pi's full rendered output.

`quiet-tools` only changes the visual renderer. It does not truncate, summarize, or rewrite the actual tool results sent to the model.

## Covered tools

- `bash`
- `read`
- `grep`
- `find`
- `ls`
- `edit`
- `write`

For `edit` and `write`, the collapsed call preview is also shortened so large diffs or file contents do not fill the TUI. Expanding restores pi's normal renderer.

## Commands

```text
/quiet-tools status
/quiet-tools off
/quiet-tools on
/quiet-tools toggle
```

The extension starts enabled by default. Disabling is temporary for the current extension runtime/session; after `/reload`, `/new`, `/resume`, or `/fork`, it starts enabled again.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-quiet-tools
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

- This extension overrides pi's built-in tool definitions so it can customize only their TUI renderers.
- It reuses pi's built-in implementations and preserves `shellPath`, `shellCommandPrefix`, and image autoresize settings when they are available from settings files.
- If another extension also overrides built-in tool execution, pi's extension load order determines which override wins.
- It affects assistant-invoked tool rows. User `!`/`!!` bash commands are rendered by a separate pi component and keep pi's default preview behavior.
