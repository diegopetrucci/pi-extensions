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

The message preview renders headings, lists, blockquotes, emphasis, inline code, strikethrough, links, and fenced code while preserving the original one-based source-line coordinates. Raw HTML is displayed as text. Link destinations are shown as inert text beside the label; the window never navigates to an assistant-provided URL.

The window follows the active Pi theme through `ctx.ui.theme`, including Markdown colors and dark/light appearance, with readable local fallbacks when a theme token is unavailable. Opening the window does not change Pi's host theme or settings.

When you submit, the extension sends a structured planning-oriented feedback prompt directly to the agent as a follow-up message. Your existing editor text is left untouched. It does not auto-apply changes or rewrite the previous assistant message in place.

## Rollback

There is no runtime setting or toggle for submit behavior. To roll back the rendering/theme change, reinstall the previous package version or revert this source change and rebuild/reinstall the package; no Pi theme or host setting needs to be restored.

## Requirements

- Interactive pi TUI session.
- A completed assistant message with text on the active branch.
- Local desktop support for opening a native [Glimpse](https://github.com/mariozechner/glimpse) window.

## Troubleshooting

- `annotate-last-message requires interactive mode.` → run it from the pi TUI.
- `No assistant messages found on the current session branch.` → wait for an assistant reply, then rerun.
- `Latest assistant message is incomplete (...)` → wait for the assistant turn to finish, then rerun.
- `Latest assistant message has no text to annotate.` → rerun after a normal text reply.
- `A last-message annotation window is already open.` → reuse or close the existing window before opening another.
- `Annotation failed: Glimpse host not found ...` → the native window runtime is unavailable; reinstall/update the package and rerun from a machine/session that can open native windows.
