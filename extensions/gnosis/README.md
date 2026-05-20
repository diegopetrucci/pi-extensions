# gnosis

A pi extension that exposes [`gnosis`](https://github.com/skorokithakis/gnosis) as an agent tool.

`gnosis` is a repo-local knowledge base for durable project context: decisions, rejected alternatives, constraints, operational lessons, and intent that are not obvious from code or docs.

## What it adds

- a `gnosis` tool for the agent
- support for `plan`, `review`, `search`, `latest`, `show`, `topics`, `write`, and `reindex`
- prompt guidance encouraging the agent to search before implementation and record only durable, non-obvious knowledge

This extension intentionally does not add slash commands; it is an agent-facing wrapper around the `gn` CLI. It also intentionally omits `edit` and `rm` actions from the tool surface.

## Requirements

Install the `gn` CLI first:

```bash
brew install --cask skorokithakis/tap/gnosis
```

Or with Go:

```bash
go install github.com/skorokithakis/gnosis/cmd/gn@latest
```

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-gnosis
```

### Collection package

```bash
pi install npm:@diegopetrucci/pi-extensions
```

### GitHub package

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Notes

- The extension shells out to `gn` in the current Pi working directory.
- Gnosis stores entries in `.gnosis/entries.jsonl` at the repo root and uses a disposable SQLite FTS5 index for search.
- `write` mutates the repo-local gnosis knowledge base; `reindex` rebuilds the search cache.
