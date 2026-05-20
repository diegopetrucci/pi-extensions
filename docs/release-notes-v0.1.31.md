# Release notes — v0.1.31

## Highlights

This release adds `gnosis`, an agent-facing wrapper around the [`gn`](https://github.com/skorokithakis/gnosis) repo-local knowledge base CLI.

## gnosis

- adds a `gnosis` tool for agents to search and record durable project knowledge
- supports `plan`, `review`, `search`, `latest`, `show`, `topics`, `write`, and `reindex`
- intentionally does not add slash commands
- intentionally omits `edit` and `rm` from the tool surface
- shells out to `gn` in the current Pi working directory using argv arrays rather than shell interpolation
- runs sequentially to avoid same-turn races between reads, writes, and reindex operations
- adds prompt guidance for searching before implementation and recording only non-obvious knowledge not already captured in code or docs
- includes standalone package docs and install instructions for the required `gn` CLI

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.31`
- standalone gnosis package: `@diegopetrucci/pi-gnosis@0.1.0`

## Suggested release blurb

`v0.1.31 adds a gnosis agent tool that lets pi search and record repo-local project decisions, constraints, and intent through the gn CLI.`
