Changes `git-footer` into a non-replacing built-in-footer status add-on, preserving pi's default footer while adding TLH-style git dirty/ahead/PR indicators.

## Highlights

- Bumps `@diegopetrucci/pi-git-footer` to `0.1.1`.
- Stops replacing pi's built-in footer with `ctx.ui.setFooter()`.
- Uses `ctx.ui.setStatus("git-footer", ...)` so the git summary appears alongside other extension statuses.
- Keeps TLH-style indicators: `!` conflicts, `+` staged, `~` unstaged, `?` untracked, `↑` ahead, and `↓` behind.
- Keeps best-effort `PR #N` display from `gh pr view`.

## Packages

- `@diegopetrucci/pi-extensions@0.1.40`
- `@diegopetrucci/pi-git-footer@0.1.1`

## Install

Standalone footer status add-on:

```bash
pi install npm:@diegopetrucci/pi-git-footer
```

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```
