# Release notes — v0.1.23

## Highlights

This release updates `librarian` so its local repository checkout cache is enabled by default and can be controlled with a new `/librarian-cache` command.

## librarian

- enables cached local GitHub repo checkouts by default
- adds `/librarian-cache on | off | toggle | status`
- persists the cache preference globally in `~/.pi/agent/extensions/librarian.json`
- supports the command in interactive, RPC, print, and JSON modes
- writes non-UI command feedback to stderr so stdout remains usable for normal output or JSON events
- falls back to GitHub API/temp-file research if cache setup fails
- enforces cache-off mode for both `read` and `bash` access to the cache root

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.23`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.1`

## Suggested release blurb

`v0.1.23 updates librarian: local checkout cache is now enabled by default and can be controlled with /librarian-cache on/off/toggle/status, including in non-UI runs.`
