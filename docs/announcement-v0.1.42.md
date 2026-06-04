# Announcement copy — v0.1.42

## Short

Released `v0.1.42`: `librarian` now defaults to cache-off and uses configurable medium-thinking internal subagent defaults instead of inheriting high-thinking caller settings.

## Medium

`v0.1.42` updates `@diegopetrucci/pi-librarian` with opt-in local checkout caching and a new `/librarian-config` command for internal subagent model/thinking defaults. The default subagent path now auto-selects a lightweight model and requests `medium` thinking.

## Highlights

- Collection package: `@diegopetrucci/pi-extensions@0.1.42`
- Standalone package: `@diegopetrucci/pi-librarian@0.1.5`
- Librarian local checkout cache is off by default
- New `/librarian-config model ...` and `/librarian-config thinking ...`
- Internal Librarian subagent defaults to auto-selected lightweight model + `medium` thinking

## Install

```bash
pi install npm:@diegopetrucci/pi-librarian
# or the collection:
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi with `/reload`.
