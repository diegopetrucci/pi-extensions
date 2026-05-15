This release updates `librarian`: local repository checkout caching is now enabled by default, and a new `/librarian-cache` command controls it across interactive and non-UI runs.

## Highlights

- local checkout cache is enabled by default for `librarian`
- new `/librarian-cache on | off | toggle | status` command
- cache preference persists globally in `~/.pi/agent/extensions/librarian.json`
- command works in interactive, RPC, print, and JSON modes
- non-UI command feedback goes to stderr so stdout stays clean
- cache setup failures fall back to GitHub API/temp-file research
- publishes standalone `@diegopetrucci/pi-librarian`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone librarian package: `@diegopetrucci/pi-librarian`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone librarian:

```bash
pi install npm:@diegopetrucci/pi-librarian
```

Then reload pi:

```text
/reload
```
