Adds `git-footer`, a standalone TLH-style cached git status footer for pi, while keeping the collection's default footer behavior unchanged.

## Highlights

- Adds `@diegopetrucci/pi-git-footer@0.1.0`.
- Shows repo, branch, dirty counts, ahead/behind counts, optional `PR #N`, and session name.
- Mirrors TLH git indicators: `!` conflicts, `+` staged, `~` unstaged, `?` untracked, `↑` ahead, and `↓` behind.
- Polls git and GitHub CLI metadata in the background so footer rendering reads only cached snapshots.
- Leaves the collection auto-loaded extension list unchanged because `git-footer` conflicts with `minimal-footer`.

## Packages

- `@diegopetrucci/pi-extensions@0.1.39`
- `@diegopetrucci/pi-git-footer@0.1.0`

## Install

Standalone footer:

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
