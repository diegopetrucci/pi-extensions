# Announcement copy — v0.1.18

## Short post

Released `@diegopetrucci/pi-extensions@0.1.18`.

This release adds `librarian`, a GitHub research scout for pi. It asks before using an opt-in local repo checkout cache under your OS cache directory; if you say no, cancel, time out, or run without UI, it uses API/temp-file research only.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or just librarian:

```bash
pi install npm:@diegopetrucci/pi-librarian
```

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.18`.

Adds `librarian`: a pi GitHub research scout that asks before using an opt-in local repo checkout cache. Default remains no persistent checkout/cache; cached repos expire after 30 days of non-use.

`pi install npm:@diegopetrucci/pi-extensions`

## Very short version

Released `pi-extensions` v0.1.18.

Adds `librarian`, a GitHub research scout with an opt-in 30-day local repo checkout cache.

## Discord / forum version

`pi-extensions@0.1.18` is out.

This release adds `librarian`, a GitHub research scout for pi. On each tool call it asks whether to cache/reuse local repo checkouts under your OS cache directory. If you decline, cancel, time out, or run without UI, it behaves like API-only GitHub reconnaissance.

Cached repo checkouts are marked and removed lazily after 30 days of non-use.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone librarian:

```bash
pi install npm:@diegopetrucci/pi-librarian
```
