# annotate-git-diff

A standalone pi extension that adds `/annotate-git-diff`, a native Glimpse window for reviewing git changes and sending structured feedback back to the current editor buffer.

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
- submit-to-editor feedback prompt insertion.

Submitting feedback does not auto-apply code changes. The extension appends a structured prompt to the current editor buffer so you can send that feedback back to the active agent.

## Requirements

- Run inside a git repository.
- Local desktop support for opening a native [Glimpse](https://github.com/mariozechner/glimpse) window.
- Packaged Monaco and Tailwind assets from this npm package.
- POSIX shell utilities (`bash`, `mktemp`, `base64`, and `tr`) for some git snapshot/binary-file paths.

## Troubleshooting

- `Review failed: Not inside a git repository.` → change into a git repo and rerun `/annotate-git-diff`.
- `No reviewable files found.` → make or fetch reviewable changes, then rerun.
- `Review failed: Glimpse host not found ...` → the native window runtime is unavailable; reinstall/update the package and rerun from a machine/session that can open native windows.
