# Release notes — v0.1.34

## Highlights

This release shortens `librarian`'s local repository checkout cache window from 30 days to 7 days, so unused cached GitHub checkouts are cleaned up sooner while caching remains enabled by default.

## librarian

- changes the lazy unused-repo cleanup window from 30 days to 7 days
- updates `/librarian-cache status` and tool metadata to report the 7-day window
- updates collection and standalone librarian docs to match the new cache behavior
- publishes `@diegopetrucci/pi-librarian@0.1.2` alongside the collection package

## Development

- adds local TypeScript typecheck dependencies and a lockfile for repeatable local checks
- ignores `node_modules/` in the repo

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.34`
- standalone librarian package: `@diegopetrucci/pi-librarian@0.1.2`

## Suggested release blurb

`v0.1.34 shortens librarian's default local checkout cache window from 30 days to 7 days, updates cache status/docs/tool metadata, and publishes @diegopetrucci/pi-librarian@0.1.2.`
