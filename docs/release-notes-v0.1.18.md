# Release notes — v0.1.18

## Highlights

This release adds `librarian`, a GitHub research scout for pi that can optionally cache local repository checkouts under the user's OS cache directory.

## New extension: librarian

- adds `extensions/librarian`
- registers a `librarian` tool for evidence-first GitHub code research
- asks on each tool call whether to cache/reuse local repo checkouts
- defaults to API/temp-file mode when the user declines, the prompt times out, or no UI is available
- stores opt-in checkouts under the OS user cache directory:
  - macOS: `~/Library/Caches/pi-librarian/repos`
  - Linux: `${XDG_CACHE_HOME:-~/.cache}/pi-librarian/repos`
  - Windows: `%LOCALAPPDATA%\\pi-librarian\\repos`
- removes marked librarian repo caches lazily after 30 days of non-use
- supports `PI_LIBRARIAN_CACHE_ROOT` for custom cache roots
- runs a restricted subagent with `read`/`bash`, no inherited skills/extensions/context files, a global timeout, default bash timeouts, and conservative runtime guards

## Notes

- The default behavior remains no persistent checkout/cache.
- The local checkout cache is opt-in per tool call.
- Do not install this alongside another extension that registers a `librarian` tool unless duplicate/conflicting tool names are intentional.

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.18`
- new standalone librarian package: `@diegopetrucci/pi-librarian@0.1.0`
- standalone quiet tools package: `@diegopetrucci/pi-quiet-tools@0.1.0`
- standalone context cap package: `@diegopetrucci/pi-context-cap@0.1.0`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.6`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.7`
- standalone notify package: `@diegopetrucci/pi-notify@0.1.3`
- standalone permission gate package: `@diegopetrucci/pi-permission-gate@0.1.1`
- standalone confirm destructive package: `@diegopetrucci/pi-confirm-destructive@0.1.1`

## Suggested release blurb

`v0.1.18 adds librarian, a pi GitHub research scout that asks before using an opt-in local checkout cache and otherwise behaves like API-only GitHub reconnaissance.`
