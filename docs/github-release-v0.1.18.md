This release adds `librarian`, a GitHub research scout for pi with an opt-in local repository checkout cache.

## Highlights

- adds the new `librarian` extension to the collection
- registers a `librarian` tool for evidence-first GitHub code research
- asks on each tool call whether to cache/reuse local repo checkouts
- defaults to no persistent checkout/cache when declined, timed out, or running without UI
- stores opt-in checkouts under the OS user cache directory
- lazily removes marked librarian repo caches after 30 days of non-use
- publishes `librarian` as a standalone package: `@diegopetrucci/pi-librarian`

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- new standalone librarian package: `@diegopetrucci/pi-librarian`

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
