# Release notes — v0.1.35

## Highlights

This release validates the collection and every standalone extension package against Pi `0.76.0`, ships fleet-tested version markers with each npm package, and updates Oracle for Pi `0.76.0` tool/result typing.

## Compatibility

- updates the local Pi development baseline to `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` `0.76.0`
- adds `.pi-fleet-tested-version` markers for the collection and each standalone extension package
- includes the fleet marker in every package's npm `files` list so installed packages carry the validation record
- fixes Oracle compatibility with Pi `0.76.0` model registry and tool result APIs

## Validation

- typechecked all extension entrypoints against Pi `0.76.0`
- ran npm audit with high-severity threshold
- smoke-tested Oracle's `/oracle status` command
- verified root and standalone package dry-runs include the fleet-tested marker

## Packaging

- `@diegopetrucci/pi-extensions@0.1.35`
- `@diegopetrucci/pi-agent-workflow-audit@0.1.1`
- `@diegopetrucci/pi-brrr@0.1.1`
- `@diegopetrucci/pi-confirm-destructive@0.1.2`
- `@diegopetrucci/pi-context-cap@0.1.1`
- `@diegopetrucci/pi-context-inspector@0.1.1`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.1`
- `@diegopetrucci/pi-gnosis@0.1.1`
- `@diegopetrucci/pi-inline-bash@0.1.1`
- `@diegopetrucci/pi-librarian@0.1.3`
- `@diegopetrucci/pi-minimal-footer@0.1.7`
- `@diegopetrucci/pi-notify@0.1.4`
- `@diegopetrucci/pi-openai-fast@0.1.2`
- `@diegopetrucci/pi-oracle@0.1.10`
- `@diegopetrucci/pi-permission-gate@0.1.2`
- `@diegopetrucci/pi-quiet-tools@0.1.2`
- `@diegopetrucci/pi-review@0.1.1`
- `@diegopetrucci/pi-todo@0.1.1`
- `@diegopetrucci/pi-triage-comments@0.1.2`

## Suggested release blurb

`v0.1.35 validates pi-extensions and all standalone extension packages against Pi 0.76.0, ships fleet-tested markers in each package, and updates Oracle for Pi 0.76.0 compatibility.`
