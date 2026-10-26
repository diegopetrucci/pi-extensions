# web-scout

Adds a `web_scout` subagent tool that adapts The Last Harness [`web-scout`](https://github.com/diegopetrucci/the-last-harness/blob/main/agents/subagents/web-scout.md) prompt into a standalone pi extension.

Use it for focused, read-only web research that needs cited sources. The subagent searches and fetches pages through the hosted [Exa](https://exa.ai) MCP endpoint and reports findings with URLs, retrieval timestamps, and short verbatim quotes. Blockers are reported in the final result; the subagent cannot ask follow-up questions.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-web-scout
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

## `web_scout` tool behavior

The tool accepts:

- `task` — required research question
- `cwd` — optional working directory used for local read-only context; defaults to the current session directory

The subagent runs in-process in an isolated child session with:

- the current session model (no automatic model selection and no persisted `/config` commands);
- `medium` thinking, clamped to the model's supported levels;
- `web_search` and `fetch_url`, implemented in this package by calling `https://mcp.exa.ai/mcp` with plain JSON-RPC over HTTP (`web_search_exa` / `web_fetch_exa`); no SDK dependency;
- read-only built-in tools: `read`, `grep`, `find`, `ls`;
- configured MCP tools (run without confirmation in the subagent; may have side effects; requires host Pi >=1.0.4; older hosts degrade to no MCP, no error); the global `mcp.json` always applies; a project `.pi/mcp.json` is loaded only when the host session has already trusted the project;
- a local-checkout path guard for file inspection.

The output is a markdown report: research target, key findings with citations, limitations, and next steps. The tool appends a run-details suffix with the model, effective thinking level, turn count, tool calls, duration, working directory, and tools used.

## API key

No API key is required. If `EXA_API_KEY` is set in the environment it is passed to Exa (`exaApiKey` query parameter) for higher rate limits. The key is never logged or echoed: it is redacted from error messages and is not shown to the model.

## Guarantees

- `fetch_url` accepts only `http://` and `https://` URLs; other schemes are rejected before any request.
- Each Exa request has a 30 second timeout; tool output is truncated (20,000 characters), and `fetch_url` page size is capped.
- Rate limits (HTTP 429 or Exa rate-limit errors) and network failures produce clear tool errors rather than silent empty results.
- Fetched content is treated as untrusted data; the prompt requires citations and forbids fabrication.
- Runtime guards block write/edit/bash tools and path traversal outside the checkout. Guards apply to built-in tools only; configured MCP tools pass the guard and are limited only by prompt guidance.

## Limitations

- The subagent has an 8-turn and 8-minute budget; tool use is disabled on the final turn so it can answer.
- Web access depends on the Exa hosted endpoint's availability and unauthenticated rate limits.
- Search and fetch contents are sent to Exa; do not include secrets in the research task.
