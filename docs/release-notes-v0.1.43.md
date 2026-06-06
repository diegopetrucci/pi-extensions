# Release notes — v0.1.43

## Highlights

This release adds two standalone native annotation extensions ported from The Last Harness: one for git diffs and one for the latest assistant message.

## annotate-git-diff

- adds `@diegopetrucci/pi-annotate-git-diff@0.1.0`
- adds `/annotate-git-diff` to open a native Glimpse review window inside a git repository
- supports Monaco-based diff viewing, branch/per-commit/all-files scopes, inline comments, file-level comments, and overall feedback
- appends structured feedback to the current editor buffer instead of auto-applying changes

## annotate-last-message

- adds `@diegopetrucci/pi-annotate-last-message@0.1.0`
- adds `/annotate-last-message` to open a native Glimpse window for the latest completed assistant reply
- supports overall guidance, section comments, and line-level inline notes
- appends planning-oriented feedback to the current editor buffer without rewriting the previous assistant message

## Packaging

- bumps the collection package to `@diegopetrucci/pi-extensions@0.1.43`
- registers both new extensions in the root collection package
- adds packaged Glimpse, Monaco, and Tailwind browser assets needed by the annotation UIs

## Validation

- typechecked both new extension source trees
- verified whitespace and patch formatting
- ran npm audit with high-severity threshold
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs
