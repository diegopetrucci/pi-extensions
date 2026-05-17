# Announcement copy — v0.1.28

## Short post

Released `@diegopetrucci/pi-extensions@0.1.28` and `@diegopetrucci/pi-oracle@0.1.8`.

This release improves `oracle`: Together now has hardcoded provider ranking, and thinking levels are clamped to the effective pi-compatible level for matched models while preserving requested-vs-effective context.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

or standalone:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Standalone package: `@diegopetrucci/pi-oracle@0.1.8`.

## X / Twitter version

Released `@diegopetrucci/pi-extensions@0.1.28` / `@diegopetrucci/pi-oracle@0.1.8`.

Improves `oracle`: hardcoded Together ranking plus pi-compatible thinking-level clamping that reports effective levels and preserves requested-vs-effective context for matched models.

## Very short version

Released `pi-oracle@0.1.8` / `pi-extensions` v0.1.28.

Adds Together ranking and pi-compatible thinking-level clamping for `oracle`.

## Discord / forum version

`pi-oracle@0.1.8` / `pi-extensions@0.1.28` is out.

This release improves `oracle` model selection and thinking-level handling. Together now gets built-in hardcoded provider ranking before the heuristic fallback, and matched models clamp requested thinking levels to the effective pi-compatible level before the oracle subprocess runs. Results report the effective level and keep requested-vs-effective context when a clamp happens.

Full collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone package:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

The standalone package version is `@diegopetrucci/pi-oracle@0.1.8`.
