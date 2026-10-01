# annotate-git-diff

A standalone pi extension that adds `/annotate-git-diff`, a native Glimpse window for reviewing git changes. Explicit **Submit to agent** sends structured feedback directly to the active agent; closing with unsent comments pastes an editor-only draft instead.

## Attribution

This extension was ported from the first-party The Last Harness implementation. It adapts the MIT-licensed `@ryan_nookpi/pi-extension-diff-review` implementation from the `Jonghakseo/pi-extension` monorepo and preserves its original inspiration credit to [badlogic/pi-diff-review](https://github.com/badlogic/pi-diff-review).

## Install

```bash
pi install npm:@diegopetrucci/pi-annotate-git-diff
```

Then reload pi:

```text
/reload
```

## Usage

Run `/annotate-git-diff` inside a git repository. The command opens a native review window with:

- Monaco-based diff viewing,
- branch diff, per-commit including working tree, and all-files scopes,
- inline, file-level, and overall review comments,
- explicit Submit sends review feedback directly to the agent; closing the window with unsent comments pastes a draft prompt to the editor instead.

Submitting feedback does not auto-apply code changes. Clicking **Submit to agent** sends a structured prompt directly to the active agent. If you close the window with comments not yet submitted, the extension pastes a draft prompt into the editor instead, so an accidental close cannot fire a new agent turn.

The review UI does not fetch assets from a CDN. While the window is open, the extension serves its packaged Monaco graph from an ephemeral, tokenized HTTP server bound only to `127.0.0.1`; closing, cancelling, submitting, startup failure, or Pi shutdown stops that server.

## Rollback

There is no runtime setting or toggle for submit behavior. To restore the prior editor-only Submit flow, reinstall the previous package version or revert this source change and rebuild/reinstall the package.

## Requirements

- Run inside a git repository.
- Local desktop support for opening a native [Glimpse](https://github.com/mariozechner/glimpse) window.
- Packaged Monaco and Tailwind assets from this npm package.
- POSIX shell utilities (`bash`, `mktemp`, `base64`, and `tr`) for some git snapshot/binary-file paths.

## Troubleshooting

- `Review failed: Not inside a git repository.` → change into a git repo and rerun `/annotate-git-diff`.
- `No reviewable files found.` → make or fetch reviewable changes, then rerun.
- `Review failed: Glimpse host not found ...` → the native window runtime is unavailable; reinstall/update the package and rerun from a machine/session that can open native windows.
- `Review failed: Unable to locate packaged ... runtime` → reinstall/update the package so its declared Monaco and Tailwind dependencies are present, then rerun.
