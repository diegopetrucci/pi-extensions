# quiet-tools

A pi extension that makes collapsed built-in tool rows and MCP tool rows quieter in the TUI.

When enabled, each collapsed tool row renders as one invocation line plus a separate `(Ctrl+O to expand)` hint line. Tool output is hidden until expanded. Expanding with `Ctrl+O` still shows pi's full rendered output.

`quiet-tools` only changes the visual renderer. It does not truncate, summarize, or rewrite the actual tool results sent to the model. Expanded rendering delegates back to Pi's renderer, preserving pi's default output for every tool.

## How it works

On Pi >=1.0.1, `quiet-tools` registers a single `pi.registerToolRenderer` resolver. The resolver intercepts collapsed rows for the 7 built-in tools and any `mcp__*` tool and renders them quietly. All other tools are passed through to Pi's default rendering. The enabled flag is read at render time, so toggling quiet mode with `/quiet-tools on|off` takes effect immediately for subsequent renders—no restart or reload required.

On Pi <1.0.1 (where `registerToolRenderer` is not available), the extension registers no renderers and shows a one-time warning notification on session start. The `/quiet-tools` commands still work and toggle the flag, but they have no visual effect.

## Covered tools

**Built-in tools:** `bash`, `edit`, `find`, `grep`, `ls`, `read`, `write`

Each built-in has a compact one-line summary (e.g. `$ echo hello`, `read ~/project/notes.txt:1-20`, `grep /TODO/ in src/`).

**MCP tools:** any tool whose name starts with `mcp__`

MCP collapsed call lines show the tool name followed by the compact JSON arguments (sanitized to a single line, truncated to the available TUI width). MCP collapsed results render empty, like built-in collapsed results.

For every covered tool, the collapsed invocation is truncated to a single visual line. Expanding restores pi's normal renderer.

## Requirements

Pi >=1.0.1 is required for quiet rendering. On older Pi hosts, the extension loads without error and the commands remain available, but rendering is inactive.

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

- `quiet-tools` uses pi's `registerToolRenderer` API to wrap only the visual renderers, without touching tool execution or metadata.
- It affects assistant-invoked tool rows. User `!`/`!!` bash commands are rendered by a separate pi component and keep pi's default preview behavior.
- Pi renders image attachments outside tool result renderers, so inline image display for image reads is still controlled by pi's image settings.
- MCP tool argument lines are sanitized (ANSI, control characters) and truncated to fit the TUI width. Expand to see full output.
