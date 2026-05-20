Adds `gnosis`, an agent-facing wrapper around the `gn` repo-local knowledge base CLI.

## Highlights

- Adds a `gnosis` tool for agents to search and record durable project knowledge.
- Supports `plan`, `review`, `search`, `latest`, `show`, `topics`, `write`, and `reindex`.
- Keeps the surface agent-only: no slash commands, and no `edit`/`rm` actions.
- Runs tool calls sequentially to avoid same-turn races between search/write/reindex operations.
- Adds guidance for searching existing knowledge before implementation and recording only non-obvious context not already in code or docs.

## Packages

- `@diegopetrucci/pi-extensions@0.1.31`
- `@diegopetrucci/pi-gnosis@0.1.0`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Or install only gnosis:

```bash
pi install npm:@diegopetrucci/pi-gnosis
```

The extension requires the `gn` CLI:

```bash
brew install --cask skorokithakis/tap/gnosis
```

or:

```bash
go install github.com/skorokithakis/gnosis/cmd/gn@latest
```
