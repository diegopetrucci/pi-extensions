Adds `review`, a standalone tlh/pi extension adapted from `mitsuhiko/agent-stuff` for interactive code reviews of local and GitHub-backed changes.

## Highlights

- Adds `/review` and `/end-review`.
- Reviews uncommitted changes, base branches, commits, GitHub pull requests, and selected paths.
- Supports shared custom review instructions plus one-off `--extra` instructions.
- Preserves the upstream loop-fixing workflow for compatible review targets.
- Publishes standalone `@diegopetrucci/pi-review@0.1.0` alongside `@diegopetrucci/pi-extensions@0.1.32`.
- Keeps Apache-2.0 attribution/licensing for `extensions/review`; the root collection package metadata remains mixed-license (`MIT AND Apache-2.0`).

## Packages

- `@diegopetrucci/pi-extensions@0.1.32`
- `@diegopetrucci/pi-review@0.1.0`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone review:

```bash
pi install npm:@diegopetrucci/pi-review
```

Then reload pi:

```text
/reload
```
