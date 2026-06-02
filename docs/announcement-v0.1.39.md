# Announcement copy — v0.1.39

## Short

Released `v0.1.39`: adds `git-footer`, a standalone TLH-style cached git status footer for pi.

## Medium

`v0.1.39` adds `@diegopetrucci/pi-git-footer`, a standalone footer extension that shows repo, branch, dirty counts, ahead/behind counts, optional PR number, and session name using cached background git status snapshots.

## Highlights

- Collection package: `@diegopetrucci/pi-extensions@0.1.39`
- New standalone package: `@diegopetrucci/pi-git-footer@0.1.0`
- TLH-style git indicators: `!`, `+`, `~`, `?`, `↑`, `↓`
- Background polling keeps footer rendering synchronous
- Not auto-loaded by the collection because it conflicts with `minimal-footer`

## Install

```bash
pi install npm:@diegopetrucci/pi-git-footer
# or the collection:
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi with `/reload`.
