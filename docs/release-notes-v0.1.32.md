# Release notes — v0.1.32

## Highlights

This release adds `review`, a standalone tlh/pi extension adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) that brings `/review` and `/end-review` to interactive code-review workflows.

## review

- adds `/review` and `/end-review` for interactive reviews inside tlh/pi
- supports reviewing uncommitted changes, base branches, specific commits, GitHub pull requests, and selected paths
- supports shared custom review instructions plus one-off `--extra` instructions
- preserves the upstream loop-fixing workflow for compatible review targets
- publishes a standalone package, `@diegopetrucci/pi-review@0.1.0`, alongside the collection package
- keeps Apache-2.0 attribution and licensing for `extensions/review`, while the root collection package metadata remains mixed-license: `MIT AND Apache-2.0`

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.32`
- standalone review package: `@diegopetrucci/pi-review@0.1.0`

## Suggested release blurb

`v0.1.32 adds review, a standalone interactive code-review extension adapted from mitsuhiko/agent-stuff, with /review and /end-review for uncommitted changes, branches, commits, PRs, and selected paths.`
