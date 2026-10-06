This release adds session-only OpenAI Ultrafast mode to the unified Fast extension and a new extension that loads Claude Code-style project `.mcp.json` files into Pi's built-in MCP support.

## Highlights

- **Ultrafast mode (`fast`)**: `/ultrafast` and `/fast ultrafast` toggle a session-only Ultrafast mode for `gpt-6-astra` on the direct OpenAI Responses API with API-key authentication. It requests the Ultrafast service tier only when a request does not already set one, turns off when the model becomes ineligible, and never falls back to regular Fast. Actual API pricing is 6x Standard; Pi's cost display does not include the premium.
- **New `project-mcp-json` extension**: reads `<cwd>/.mcp.json` (the Claude Code project format) and registers its stdio and HTTP servers with Pi's built-in MCP support. It follows Pi's own project-trust rules, so servers load in folders you have already trusted, including through a trusted parent folder, and otherwise suggest running `/trust`. Only known fields are copied, `${VAR}` and `${VAR:-default}` are expanded once, and warnings never show configuration values. Requires Pi 1.0 or later.

## Packages

- `@diegopetrucci/pi-fast@0.1.7`
- `@diegopetrucci/pi-project-mcp-json@0.1.0`
- `@diegopetrucci/pi-extensions@0.1.75`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.7"],["@diegopetrucci/pi-project-mcp-json","0.1.0"],["@diegopetrucci/pi-extensions","0.1.75"]] -->
