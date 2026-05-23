Shortens `librarian`'s local repository checkout cache window from 30 days to 7 days, so unused cached GitHub checkouts are cleaned up sooner while caching remains enabled by default.

## Highlights

- Changes lazy cleanup for unused librarian repo caches from 30 days to 7 days.
- Updates `/librarian-cache status` and tool metadata to report the 7-day window.
- Updates collection and standalone librarian docs.
- Adds local TypeScript typecheck dev dependencies and a lockfile for repeatable local checks.
- Publishes standalone `@diegopetrucci/pi-librarian@0.1.2` alongside `@diegopetrucci/pi-extensions@0.1.34`.

## Packages

- `@diegopetrucci/pi-extensions@0.1.34`
- `@diegopetrucci/pi-librarian@0.1.2`

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
