# Release notes — v0.1.40

## Highlights

This release changes `git-footer` from a full custom-footer replacement into a built-in-footer add-on. It now keeps pi's default footer intact and contributes only the TLH-style git summary through pi's extension status area.

## git-footer

- bumps `@diegopetrucci/pi-git-footer` to `0.1.1`
- stops calling `ctx.ui.setFooter()`, so it no longer replaces pi's built-in footer
- uses `ctx.ui.setStatus("git-footer", ...)` to render the cached git summary alongside other extension statuses
- continues to show TLH-style indicators: `!` conflicts, `+` staged, `~` unstaged, `?` untracked, `↑` ahead, and `↓` behind
- keeps the best-effort `PR #N` segment from `gh pr view`
- keeps git and GitHub CLI lookups on a background cached path with timeouts

## Packaging

- bumps the collection package to `@diegopetrucci/pi-extensions@0.1.40`
- updates `git-footer` README/package metadata to describe the non-replacing footer behavior
- keeps the root collection auto-loaded extension list unchanged

## Validation

- typechecked the `git-footer` extension against Pi `0.78.0`
- smoke-tested `git-footer` loading through Pi with only the `git-footer` extension enabled
- ran npm audit with high-severity threshold
- verified root and `git-footer` package dry-runs
- verified root and `git-footer` publish dry-runs

## Suggested release blurb

`v0.1.40 changes git-footer into a non-replacing built-in-footer status add-on, preserving pi's default footer while adding TLH-style git dirty/ahead/PR indicators.`
