# Release notes — v0.1.44

## Highlights

This release packages the existing `illustrations-to-explain-things` skill for pi, making it installable either through the collection package or as its own standalone package.

## illustrations-to-explain-things

- adds `@diegopetrucci/pi-illustrations-to-explain-things@0.1.0`
- bundles the Xiaohei-style illustration skill, reference docs, OpenAI skill metadata, and example images
- supports article/blog inline illustrations, shot lists, image edits, and visual metaphors for workflows, structures, states, and key ideas
- defaults response text, shot lists, and handwritten image labels to English unless the user explicitly requests another language

## Packaging

- bumps the collection package to `@diegopetrucci/pi-extensions@0.1.44`
- registers the skill under the root package's `pi.skills` manifest
- updates the collection README so the new skill appears alphabetically with the packaged extensions

## Validation

- verified npm registry state for the root and standalone packages
- verified package JSON metadata and release docs
- verified whitespace and patch formatting
- ran npm audit with high-severity threshold
- verified root and standalone package dry-runs
- verified root and standalone publish dry-runs
