Validates the collection and every standalone extension package against Pi `0.76.0`, ships fleet-tested markers with each npm package, and updates Oracle for Pi `0.76.0` compatibility.

## Highlights

- Updates the local Pi development baseline to `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` `0.76.0`.
- Adds `.pi-fleet-tested-version` markers to the collection and every standalone extension package.
- Includes the marker in each package's npm `files` list so installed packages carry the validation record.
- Fixes Oracle for Pi `0.76.0` model registry and tool result typing.
- Typechecks all extension entrypoints against Pi `0.76.0`.

## Packages

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

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone example:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
