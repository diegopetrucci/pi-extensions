# project-mcp-json

A pi extension that reads a Claude Code-style `.mcp.json` from the project
working directory and registers the configured MCP servers with pi via
`pi.registerMcpServer`.

> **Requires Pi 1.0 or later.** The `pi.registerMcpServer` API used by this
> extension was introduced in Pi 1.0. On older Pi versions the extension loads
> silently and emits a one-time notice instead of registering any servers.

## Why

Different AI coding environments use different files to configure MCP servers:

| Environment | Config file |
|---|---|
| Pi | `~/.pi/agent/mcp.json` (user) and `.pi/mcp.json` (project, trusted) |
| Claude Code | `.mcp.json` (project root) |
| Codex | `~/.codex/config.toml` (user) and `.codex/config.toml` (project, trusted) |

If your project already has a `.mcp.json` for Claude Code, this extension
lets Pi use it directly — no duplication required.

> **Pi's own `mcp.json` takes precedence by name.** If a server name defined
> in Pi's own `mcp.json` (`~/.pi/agent/mcp.json` or `.pi/mcp.json`) matches
> one this extension registers from `.mcp.json`, Pi's own entry wins — the
> existing server is not replaced and no collision error is raised. This
> extension is most useful when Pi has no `mcp.json` of its own, or when the
> server names do not overlap.

## Discovery

The extension reads **only** `<cwd>/.mcp.json` — it does not walk parent
directories. If the file is absent the extension is a no-op for that session.

## Trust model

The extension follows **Pi's project trust semantics** for deciding whether to
load `.mcp.json`. It treats `.mcp.json` as a trust-requiring project resource,
mirroring the logic Pi uses for its own `.pi/` config resources.

### Decision order (evaluated each session)

1. **Project not trusted** (`/trust` has not been granted) → skip silently.
2. **Project has Pi resources** (e.g. `.pi/mcp.json`, `.pi/extensions/`,
   `.agents/skills/` in the project or an ancestor) → Pi already made a
   genuine trust decision for this project; load `.mcp.json` as well.
3. **Saved trust decision** — check `~/.pi/agent/trust.json` for the nearest
   ancestor of the project directory:
   - `true` → load.
   - `false` → skip silently.
4. **`defaultProjectTrust` global setting** (from `~/.pi/agent/settings.json`):
   - `"always"` → load.
   - `"never"` → skip silently.
   - `"ask"` *(default)* → skip; if interactive UI is available, emit one info
     notification: *"Found .mcp.json — run /trust to enable its MCP servers."*

### Enabling `.mcp.json` loading

The standard way is to run `/trust` inside a Pi session in the project
directory. This saves `true` for the project path in `trust.json` (step 3
above) and causes future sessions to load `.mcp.json` automatically.

Alternatively, set `defaultProjectTrust` to `"always"` in Pi's global
settings (step 4) to enable `.mcp.json` loading for all trusted projects.

> **Note on `--approve` / one-shot trust flags:** Pi's `--approve` flag is
> not detectable from within an extension. It grants a one-shot project-trust
> session but does not write to `trust.json`, so this extension behaves as if
> no saved decision exists and falls through to step 4. Run `/trust` inside
> the session to persist the decision.

### Parent-directory trust and nearest-ancestor semantics

Saved trust decisions in `trust.json` use **nearest-ancestor matching**:
the extension walks up the directory tree from `cwd` and uses the first
decision it finds.  If you trust a parent directory (via `/trust` →
*"Trust parent folder"*), all projects under it — including their
`.mcp.json` files — are loaded by this extension.

### Undo / revoke

**Reliable persistent denial** means saving an explicit `false` for the
project path.  The most direct way is to run `/trust` inside the project
and choose *"Do not trust"* — Pi writes `false` for the exact project path
to `~/.pi/agent/trust.json` and the extension will skip `.mcp.json` even
if a parent directory is trusted.

Other approaches and their limitations:

- **Delete the entry (or set it to `null`)** in `trust.json`: this resumes
  nearest-ancestor lookup (step 3), *not* a direct fallback to
  `defaultProjectTrust`.  If any ancestor directory has a saved `true`, that
  decision is found first and loading is re-enabled.  `defaultProjectTrust`
  (step 4) only applies when the nearest-ancestor walk finds no decision at
  all.  Deleting/nulling an entry is therefore *not* a reliable denial when
  any ancestor path is trusted.
- **Set `defaultProjectTrust` to `"never"`** in `~/.pi/agent/settings.json`:
  this prevents loading only when the nearest-ancestor walk finds no saved
  decision (neither `true` nor `false`).  A saved `true` for the project or
  any ancestor takes precedence; use an explicit saved `false` for the
  project path if both coexist.
- **Manually edit `trust.json`**: `~/.pi/agent/trust.json` is a plain JSON
  object mapping absolute paths to `true`/`false`/`null`.  Set the project
  path to `false` to permanently deny; set it to `null` or delete the key
  to resume nearest-ancestor lookup (a trusted parent may then re-enable
  loading).  For reliable denial, always save `false` explicitly.

## Supported subset

The extension maps a subset of Claude Code's `.mcp.json` schema to Pi's
`McpServerConfig`. Fields and features that are accepted:

- **stdio** servers: `command`, `args`, `env`, `cwd`, `timeout`, `description`
- **http / streamable-http** servers: `url`, `headers`, `oauth`
  (`clientId`, `clientSecret`, `callbackPort`, `callbackUrl`, `scope`),
  `timeout`, `description`
- `${VAR}` and `${VAR:-default}` environment variable expansion in `command`,
  `args`, `env` values, `cwd`, `url`, `headers` values, and `oauth.clientSecret`

Features and fields that are **not** imported:

| Skipped feature | Reason |
|---|---|
| `sse` server type | Not part of Pi's `McpServerConfig` |
| `ws` / `websocket` server type | Not part of Pi's `McpServerConfig` |
| `headersHelper` field | Rejected by strict field allowlist |
| `auth` field | Rejected by strict field allowlist |
| Claude Code approvals (`.claude/settings.json`) | Not read; Pi manages its own trust |
| Claude Code OAuth tokens | Not imported; Pi manages its own OAuth state |

Unknown top-level fields cause the individual server entry to be skipped with a
warning (not the whole file). `sse` and `ws` type strings and `auth`/`headersHelper`
fields always produce a skip warning.

## Secrets caveat

Environment variable values in `env` and `headers` are expanded at session
start and then encoded as literals before being passed to `pi.registerMcpServer`.
After registration, expanded values may be visible in Pi's `/mcp` panel or
wherever Pi surfaces server configuration. To reduce secret exposure:

- **Prefer environment variables** over literal values in `.mcp.json`.
  The extension expands `${VAR}` at startup but the raw variable name is what
  appears in `.mcp.json` (which is often checked into source control), not
  the value.
- **Use `headers` for auth tokens** on HTTP servers rather than embedding
  secrets in the URL.
- Add `.mcp.json` to `.gitignore` if it contains any literal secrets.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-project-mcp-json
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

## Example `.mcp.json`

```json
{
  "mcpServers": {
    "my-local-tool": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@my-org/my-mcp-server"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    },
    "my-remote-tool": {
      "type": "http",
      "url": "${TOOL_SERVER_URL}",
      "headers": {
        "Authorization": "Bearer ${TOOL_TOKEN}"
      }
    }
  }
}
```
