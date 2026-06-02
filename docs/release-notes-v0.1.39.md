# Release notes — v0.1.39

## Highlights

This release adds `git-footer`, a standalone TLH-style footer extension for pi that shows cached git branch/status information, ahead/behind counts, and a best-effort PR number without spawning subprocesses during footer rendering.

## git-footer

- adds `@diegopetrucci/pi-git-footer@0.1.0`
- replaces pi's built-in footer with a compact two-line layout
- shows repo, branch, dirty counts, ahead/behind counts, optional `PR #N`, and session name
- mirrors TLH git indicators: `!` conflicts, `+` staged, `~` unstaged, `?` untracked, `↑` ahead, and `↓` behind
- polls `git status --porcelain=v2 --branch` in the background and renders from cached snapshots
- looks up the current branch PR with `gh pr view` on a best-effort background path
- ships as standalone-only and is not auto-loaded by the collection because it conflicts with `minimal-footer`

## Packaging

- bumps the collection package to `@diegopetrucci/pi-extensions@0.1.39`
- includes the new standalone `git-footer` package files in the repository and root collection tarball
- keeps the root collection auto-loaded extension list unchanged so existing `minimal-footer` users are not displaced

## Validation

- typechecked all extension entrypoints against Pi `0.78.0`
- smoke-tested `git-footer` loading through Pi with only the `git-footer` extension enabled
- ran npm audit with high-severity threshold
- verified root and `git-footer` package dry-runs
- verified root and `git-footer` publish dry-runs

## Suggested release blurb

`v0.1.39 adds git-footer, a standalone TLH-style cached git status footer for pi, while keeping the collection's default footer behavior unchanged.`
