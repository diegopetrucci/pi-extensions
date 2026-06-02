# git-footer

A TLH-style git status add-on for pi's built-in footer.

This package is standalone-only and is not auto-loaded by the `@diegopetrucci/pi-extensions` collection package.

It keeps pi's default footer intact and adds a compact git status segment through pi's extension status API:

```text
~/repo (main) • session-name
↑12k ↓3k 44.1%/200k                      model
+2 ~1 ?3 ↑1 • PR #123
```

Git status indicators:

- `!N`: conflicted paths
- `+N`: staged paths
- `~N`: unstaged paths
- `?N`: untracked paths
- `↑N`: commits ahead of upstream
- `↓N`: commits behind upstream

The extension polls git status in the background and caches the latest snapshot. It also performs a best-effort `gh pr view` lookup for the current branch; if `gh` is unavailable or the branch has no PR, the PR segment is omitted.

## Install

```bash
pi install npm:@diegopetrucci/pi-git-footer
```

Then reload pi:

```text
/reload
```

## Notes

- Does not replace pi's built-in footer.
- Uses `ctx.ui.setStatus()`, so pi renders the git summary with other extension statuses.
- The current pi extension API does not support literally appending text inside the built-in footer's first `cwd (branch)` line without replacing the footer.
- Git and GitHub CLI lookups run on a short background interval with timeouts.
