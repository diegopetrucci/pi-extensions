# git-footer

A TLH-style git status footer for pi.

This package is standalone-only and is not auto-loaded by the `@diegopetrucci/pi-extensions` collection package because only one custom footer should win.

It replaces pi's built-in footer with a compact two-line layout whose first line mirrors how [`the-last-harness`](https://github.com/diegopetrucci/the-last-harness) summarizes repository state:

```text
<repo> • <branch> • <git-status> • PR #<number> • <session-name>
ctx <percent>% • <model> <thinking> • <extension-statuses>
```

Git status indicators:

- `!N`: conflicted paths
- `+N`: staged paths
- `~N`: unstaged paths
- `?N`: untracked paths
- `↑N`: commits ahead of upstream
- `↓N`: commits behind upstream

The extension polls git status in the background, caches the latest snapshot, and keeps footer rendering synchronous. It also performs a best-effort `gh pr view` lookup for the current branch; if `gh` is unavailable or the branch has no PR, the PR segment is omitted.

## Install

```bash
pi install npm:@diegopetrucci/pi-git-footer
```

Then reload pi:

```text
/reload
```

## Notes

- Replaces pi's built-in footer entirely.
- Intended as a separate footer extension; do not enable it at the same time as another custom-footer extension such as `minimal-footer` unless you want the last-loaded footer to win.
- `render()` never spawns subprocesses. Git and GitHub CLI lookups run on a short background interval with timeouts, and the footer reads only cached snapshots.
