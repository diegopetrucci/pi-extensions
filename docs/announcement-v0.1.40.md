# Announcement copy — v0.1.40

## Short

Released `v0.1.40`: `git-footer` now keeps pi's default footer and adds TLH-style git status as a footer status add-on.

## Medium

`v0.1.40` updates `@diegopetrucci/pi-git-footer` so it no longer replaces pi's built-in footer. It now uses pi's extension status area to show TLH-style dirty counts, ahead/behind, and optional PR number while preserving the default footer layout.

## Highlights

- Collection package: `@diegopetrucci/pi-extensions@0.1.40`
- Standalone package: `@diegopetrucci/pi-git-footer@0.1.1`
- `git-footer` no longer calls `setFooter()`
- Uses `setStatus()` so pi's built-in footer remains intact
- Keeps TLH-style git indicators and best-effort PR display

## Install

```bash
pi install npm:@diegopetrucci/pi-git-footer
# or the collection:
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi with `/reload`.
