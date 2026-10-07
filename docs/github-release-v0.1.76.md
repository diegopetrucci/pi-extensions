This release publishes the collection bundle with the v0.1.75 features, fixes footer, inline-bash, gnosis, and Oracle/Contrarian model-selection issues, and retires the leftover standalone Fast stacks.

## Highlights

- **Includes the v0.1.75 features in the collection**: session-only OpenAI Ultrafast mode (`/ultrafast`, `/fast ultrafast`) and the new `project-mcp-json` extension for Claude Code-style `.mcp.json` files. The v0.1.75 collection package was not published; install this version instead.
- **`git-footer`**: no longer polls `git status` or `gh pr view` in untrusted projects, and runs `git status` with `core.fsmonitor` disabled.
- **`inline-bash`**: command output is inserted literally, so output containing `$&`, `$$`, or `!{...}` is no longer rewritten.
- **`oracle` and `contrarian`**: model preferences now let a weaker sibling model (for example `gpt-5.4-mini`) be selected when it is the one available, instead of being shadowed by its stronger sibling's pattern.
- **`gnosis`**: the install hint appears only when `gn` is actually missing, not on every failed command.
- **`claude-fast` and `openai-fast`**: now deprecation notices only. They no longer register commands or change requests; use the unified `fast` extension.
- **`review`, `annotate-*`, `triage-comments`, `code-reviewer`**: messages and docs now use the package or command name; `review` uses one pull-request checkout path.
- Internal cleanup across many packages removes unused code with no intended behavior change.

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.13`
- `@diegopetrucci/pi-annotate-git-diff@0.1.13`
- `@diegopetrucci/pi-annotate-last-message@0.1.11`
- `@diegopetrucci/pi-brrr@0.1.15`
- `@diegopetrucci/pi-claude-fast@0.1.16`
- `@diegopetrucci/pi-code-reviewer@0.1.13`
- `@diegopetrucci/pi-confirm-destructive@0.1.13`
- `@diegopetrucci/pi-context-cap@0.1.13`
- `@diegopetrucci/pi-context-inspector@0.1.16`
- `@diegopetrucci/pi-contrarian@0.1.15`
- `@diegopetrucci/pi-fast@0.1.8`
- `@diegopetrucci/pi-git-footer@0.1.12`
- `@diegopetrucci/pi-gnosis@0.1.12`
- `@diegopetrucci/pi-inline-bash@0.1.12`
- `@diegopetrucci/pi-librarian@0.1.18`
- `@diegopetrucci/pi-notify@0.1.19`
- `@diegopetrucci/pi-openai-fast@0.1.18`
- `@diegopetrucci/pi-oracle@0.1.30`
- `@diegopetrucci/pi-permission-gate@0.1.16`
- `@diegopetrucci/pi-project-mcp-json@0.1.1`
- `@diegopetrucci/pi-review@0.1.15`
- `@diegopetrucci/pi-triage-comments@0.1.14`
- `pi-dynamic-context-pruning@0.1.12`
- `@diegopetrucci/pi-extensions@0.1.76`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.13"],["@diegopetrucci/pi-annotate-git-diff","0.1.13"],["@diegopetrucci/pi-annotate-last-message","0.1.11"],["@diegopetrucci/pi-brrr","0.1.15"],["@diegopetrucci/pi-claude-fast","0.1.16"],["@diegopetrucci/pi-code-reviewer","0.1.13"],["@diegopetrucci/pi-confirm-destructive","0.1.13"],["@diegopetrucci/pi-context-cap","0.1.13"],["@diegopetrucci/pi-context-inspector","0.1.16"],["@diegopetrucci/pi-contrarian","0.1.15"],["@diegopetrucci/pi-fast","0.1.8"],["@diegopetrucci/pi-git-footer","0.1.12"],["@diegopetrucci/pi-gnosis","0.1.12"],["@diegopetrucci/pi-inline-bash","0.1.12"],["@diegopetrucci/pi-librarian","0.1.18"],["@diegopetrucci/pi-notify","0.1.19"],["@diegopetrucci/pi-openai-fast","0.1.18"],["@diegopetrucci/pi-oracle","0.1.30"],["@diegopetrucci/pi-permission-gate","0.1.16"],["@diegopetrucci/pi-project-mcp-json","0.1.1"],["@diegopetrucci/pi-review","0.1.15"],["@diegopetrucci/pi-triage-comments","0.1.14"],["pi-dynamic-context-pruning","0.1.12"],["@diegopetrucci/pi-extensions","0.1.76"]] -->
