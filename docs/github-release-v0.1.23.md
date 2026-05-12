# GitHub release body — v0.1.23

## v0.1.23

This release updates `librarian`: local repository checkout caching is now enabled by default, and a new `/librarian-cache` command controls it across interactive and non-UI runs.

### Highlights

- local checkout cache is enabled by default for `librarian`
- new `/librarian-cache on | off | toggle | status` command
- cache preference persists globally in `~/.pi/agent/extensions/librarian.json`
- command works in interactive, RPC, print, and JSON modes
- non-UI command feedback goes to stderr so stdout stays clean
- cache setup failures fall back to GitHub API/temp-file research
- publishes standalone `@diegopetrucci/pi-librarian@0.1.1`

### Included docs

- [`docs/release-notes-v0.1.23.md`](./release-notes-v0.1.23.md)
- [`docs/publish-checklist-v0.1.23.md`](./publish-checklist-v0.1.23.md)
- [`docs/announcement-v0.1.23.md`](./announcement-v0.1.23.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.23`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.1`

### Install

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
