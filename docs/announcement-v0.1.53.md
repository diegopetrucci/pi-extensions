# Announcement drafts — v0.1.53

## Short

Released `@diegopetrucci/pi-extensions@0.1.53`: a bug-fix for `oracle`, `contrarian`, and `librarian`. Their auto model selection could pick a model the catalog lists but your provider/subscription can't actually serve (legacy snapshots or access-gated tiers), failing with a `404`/not-found error. They now fall back to a servable model — ending with your current session model — instead of hard-failing.

Standalone packages: `@diegopetrucci/pi-oracle@0.1.16`, `@diegopetrucci/pi-contrarian@0.1.1`, `@diegopetrucci/pi-librarian@0.1.8`.

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
# or individually
pi install npm:@diegopetrucci/pi-oracle
pi install npm:@diegopetrucci/pi-contrarian
pi install npm:@diegopetrucci/pi-librarian
```

Then reload pi with `/reload`.
