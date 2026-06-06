# annotate-last-message

A standalone pi extension that adds `/annotate-last-message`, a native Glimpse window for annotating the latest completed assistant message on the current session branch.

## Install

```bash
pi install npm:@diegopetrucci/pi-annotate-last-message
```

Then reload pi:

```text
/reload
```

## Usage

Run `/annotate-last-message` from an interactive pi session. The annotation window lets you leave:

- overall guidance for the whole reply,
- section comments for larger chunks of the message, and
- inline notes tied to individual lines.

When you submit, the extension appends a structured planning-oriented feedback prompt to the current editor buffer. It does not auto-apply changes or rewrite the previous assistant message in place.

## Requirements

- Interactive pi session with editor access.
- A completed assistant message with text on the active branch.
- Local desktop support for opening a native [Glimpse](https://github.com/mariozechner/glimpse) window.

## Troubleshooting

- `annotate-last-message requires interactive mode.` → run it from the pi TUI.
- `No assistant messages found on the current session branch.` → wait for an assistant reply, then rerun.
- `Latest assistant message is incomplete (...)` → wait for the assistant turn to finish, then rerun.
- `Latest assistant message has no text to annotate.` → rerun after a normal text reply.
- `A last-message annotation window is already open.` → reuse or close the existing window before opening another.
- `Annotation failed: Glimpse host not found ...` → the native window runtime is unavailable; reinstall/update the package and rerun from a machine/session that can open native windows.
