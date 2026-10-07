# Pi 1.0.4 compatibility record

> **Date: 2026-10-06.** This record covers the bump of `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` devDependencies from `^1.0.0` to `^1.0.4` (lockfile resolves exactly `1.0.4`). Follow-up changes in this branch will append their notes here.

## Dependency bump

- `package.json` devDependencies: all three Pi packages moved from `^1.0.0` to `^1.0.4`.
- `package-lock.json` refreshed via `npm install --ignore-scripts --no-audit --no-fund -D`; all three packages resolve `1.0.4`.
- `peerDependencies`, other dependencies, and `.pi-fleet-tested-version` markers are unchanged.

## Upstream changes relevant to this repository (1.0.1 – 1.0.4)

### Pi 1.0.1
- **brace-expansion pinned to 5.0.12:** the `brace-expansion@5.0.9` nested vulnerability documented in `docs/pi-1.0.0-validation.md` is resolved upstream. `npm audit` is now clean (0 vulnerabilities). The audit exception recorded in `docs/pi-1.0.0-validation.md` is superseded by this result and no longer applies.
- **Shrinkwrap removed:** the upstream `npm-shrinkwrap.json` was removed; no repo-side impact.
- **`pi.registerToolRenderer` API added:** extension authors can register a renderer for calls to any tool, including tools not yet registered at load time (e.g. MCP tools in resumed sessions). This repo will adopt it in the quiet-tools extension as a follow-up change in this branch.

### Pi 1.0.3
- **Azure provider key renamed:** `azure-openai-responses` → `azure` in model preferences and provider configuration. Added `azure` entry to `PROVIDER_MODEL_PREFERENCES` in all three role extensions (oracle, contrarian, code-reviewer), kept `azure-openai-responses` as a legacy alias with identical patterns for Pi 1.0.0–1.0.2 hosts, updated `docs/oracle-provider-matrix.md` with the new provider name (noting the legacy alias), and updated catalog/selection tests to use `azure` while the coverage test explicitly permits only `azure-openai-responses` as the one approved extra key.

### Pi 1.0.4
- **Catalog drift — Cloudflare dashed Claude IDs and Together removals:** the Pi 1.0.4 `cloudflare-ai-gateway` catalog switched from dotted model IDs (`claude-opus-4.8`, `claude-opus-4.7`, `claude-opus-4.6`, `claude-opus-4.5`) to dashed IDs (`claude-opus-4-8`, etc.). Removed the four dotted patterns from `PROVIDER_MODEL_PREFERENCES` in oracle, contrarian, and code-reviewer; `claude-opus-5` already matches the catalog's `claude-opus-5`/`claude-opus-5-5` entries so the top pick is unchanged. The Together catalog also dropped `openai/gpt-oss-20b` and `google/gemma-4-31B-it`; both were removed from oracle and contrarian.
- **`--tools` / SDK tools and MCP isolation:** with a tool allowlist (`--tools` or SDK `tools`), MCP tools stay registered unless an entry starts with `mcp__` (in which case only the matching MCP tools are kept); unmatched MCP tools are not declared to the model. Deferred/codemode-exposure tools can only be loaded via `tool_search` if it is itself allowlisted. `--tools` and `--exclude-tools` now accept `*` patterns (e.g. `mcp__server__*`), and `--no-mcp` disables MCP for one run. Addressed: all subagent allowlists now include `["mcp__*", "tool_search", "list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"]`, giving each subagent access to all configured MCP tools. This covers oracle/contrarian (`--tools` CLI arg), code-reviewer, triage-comments, agent-workflow-audit (both planOnly and normal), and librarian (SDK `tools` option). Direct-exposure `mcp__*` tools become active and callable; deferred `mcp__*` tools are registered and callable but not declared to the model until `tool_search` loads them (activating them via `setActiveToolsByName`). On Pi <1.0.4 the `mcp__*` pattern is a no-op (harmless); no `--no-mcp` or other unknown flags are used. System prompts, tool descriptions, promptGuidelines, and READMEs updated to state MCP tools are available, may have side effects, run without confirmation in the subagent, and require host Pi >=1.0.4.

  SDK-session subagents (code-reviewer, librarian, triage-comments, agent-workflow-audit):

  - **MCP loading.** `createAgentSession` does not load MCP or tool_search automatically. Each extension calls `createMcpExtension()` and `createToolSearchExtension()` via a feature-detected namespace import. The factories are additionally gated on `VERSION >= 1.0.4` (parsed via a local semver helper in each file): on Pi 0.99.0–1.0.3 `mcp__*` allowlist entries are exact-name matches that match nothing, so spawning servers provides no benefit and the factory list is returned empty. Missing or unparsable VERSION values are treated conservatively as below threshold. On Pi >=1.0.4 both factories are returned and servers are spawned.

  - **Bind / dispose ordering.** Sessions call `bindExtensions({ mode: 'json' })` to trigger `session_start` so servers connect. Each extension assigns the session variable **before** calling `bindExtensions`, so the `finally` block's `disposeSubagentSession` call can dispose the session even if binding fails partway through. Before `session.dispose()`, each extension emits `session_shutdown` through `session.extensionRunner` so MCP stdio transports close cleanly (no leaked child processes).

  - **Project trust.** The global `mcp.json` (from `PI_CODING_AGENT_DIR`) always applies. A project `.pi/mcp.json` is loaded only when the host session has already trusted the project AND the subagent runs in the same directory as the host. The trust gate is derived from `ctx.isProjectTrusted()` (feature-detected; fails closed on older hosts) and a realpath comparison. Librarian subagents always run in a separate temp workspace and therefore never load a project `.pi/mcp.json`.

  - **`SettingsManager.inMemory` / `projectTrusted`.** The `SettingsManager.inMemory({}, { projectTrusted })` options parameter is honored in Pi 0.99.0, 1.0.0, and 1.0.3, verified by unpacking those releases: `inMemory(settings, options)` passes `options` to `fromStorage`, which honors `options.projectTrusted`. There is no version where this option is ignored.

## project-mcp-json: Pi 1.0.4 compatibility

The extension was added upstream built against Pi 1.0.0. Verified against Pi 1.0.4 (unpacking both releases for comparison):

- **`pi.registerMcpServer` signature and timing.** Signature `(name: string, config: McpServerConfig): void` is unchanged between Pi 1.0.0 (`core/extensions/types.d.ts:1343`) and Pi 1.0.4 (`core/extensions/types.d.ts:1353`). The extension calls it during a `session_start` handler, which counts as a post-bind registration; Pi connects the server immediately ("right away when registered later" per the JSDoc). No timing incompatibility.
- **`McpServerConfig` shape.** `McpStdioServerConfig`, `McpHttpServerConfig`, and the union `McpServerConfig` are identical in both releases. Pi 1.0.4 added `oauth.clientRegistration?: "dcr" | "cimd"` to `McpOAuthConfig` (`core/mcp-servers.d.ts`); that field is outside the extension's strict `OAUTH_ALLOWED_FIELDS` set and would produce an "unknown oauth field" warning if a user puts it in `.mcp.json` — this is intentional protective behaviour, not a regression.
- **`ctx.isProjectTrusted()`.** Present at `core/extensions/types.d.ts:238` in both releases; return type and call convention unchanged.
- **Other imports.** `getAgentDir`, `hasTrustRequiringProjectResources`, `ProjectTrustStore`, `SettingsManager`, `DefaultProjectTrust` are all re-exported from `index.d.ts` in Pi 1.0.4.
- **Pi native config loader / double-registration risk.** Pi 1.0.4's `loadMcpConfig` reads the global `mcp.json` from `agentDir` and, for trusted projects, `<project>/.pi/mcp.json` (`extensions/mcp/config.js:108`, using `CONFIG_DIR_NAME = ".pi"` from `config.js:473`). The extension reads `<project>/.mcp.json`. These are different files; there is no overlap, no double-registration, and no merge conflict.

**Result: no incompatibilities.** All 90 existing tests pass on Pi 1.0.4 (`node --test test/project-mcp-json-*.test.mjs`: 90 pass, 0 fail).

## project-mcp-json: subagent extension-loading gap

Project-mcp-json registers MCP servers during `session_start`. Whether a subagent sees those servers depends on whether it loads user extensions.

**CLI subagents — oracle and contrarian.** Both spawn a pi CLI process via `getPiInvocation()` (oracle `index.ts:1308–1321`, contrarian `index.ts:1437–1451`). The arg arrays contain only `--mode json`, `-p`, `--no-session`, `--model`, `--tools`, `--append-system-prompt`, and the prompt text; there is no `--no-extensions` flag. The spawned pi process therefore loads user extensions from the standard agent directory. If project-mcp-json is installed, it runs inside the subagent session and registers any servers it finds in `.mcp.json`, subject to the same trust and file-existence checks as in the main session. Any server registered this way is reachable by the `mcp__*` allowlist entries already in the subagent `--tools` list.

**SDK-session subagents — code-reviewer, librarian, triage-comments, agent-workflow-audit.** All four create `DefaultResourceLoader` with `noExtensions: true` (code-reviewer `index.ts:1787`, librarian `index.ts:1747`, triage-comments `index.ts:2578`, agent-workflow-audit `index.ts:1475`). They do not load user extensions. MCP server access comes solely from the explicit `createMcpExtension()` factory calls, subject to the Pi >=1.0.4 gate and the trust/cwd conditions already documented above under **`--tools` / SDK tools and MCP isolation**.

No behaviour change was made; this section documents the gap for operators.

## quiet-tools: move to registerToolRenderer (Pi 1.0.1 API)

`extensions/quiet-tools/index.ts` was rewritten to use `pi.registerToolRenderer` (introduced in Pi 1.0.1) instead of `pi.registerTool`. A single resolver is registered at extension load time; it quiets collapsed rows for the 7 built-in tools and any `mcp__*` tool, and reads the enabled flag at render time so toggling works without re-registration. MCP collapsed call lines show the tool name plus compact sanitized JSON args, truncated to the TUI width. On Pi <1.0.1 (where `registerToolRenderer` is absent), the extension registers no renderers and shows a one-time `ui.notify` warning on session start. The `/quiet-tools` commands remain functional on all hosts. `pi.registerTool` is no longer called by this extension.

## Validation (2026-10-07, branch `chore/pi-1.0.4-compat-v2`, based on `origin/main` v0.1.76)

Run in an isolated `env -i` environment with a temporary HOME and `PI_CODING_AGENT_DIR`, `PI_OFFLINE=1`, and empty temporary npm user/global configs.

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | passed |
| `npm run preflight:install-state` | passed (128 installed packages and 29 local package entries checked, 43 optional packages not installed) |
| `npm run format:check` | passed (159 files) |
| `npm run typecheck` | passed |
| `npm test` | 1014 tests, 1013 pass, 0 fail, 1 skipped (pre-existing native-Windows skip), 0 cancelled |
| `npm audit --json` | 0 vulnerabilities |
| `npm pack --dry-run --workspaces --include-workspace-root --json` | 29 packages (including `project-mcp-json`), 0 bundled dependencies |
| `git diff --check` | clean |
| MCP fixture server processes after suite | none |

## Historical records preserved

`docs/pi-1.0.0-validation.md`, `docs/pi-0.99.0-validation.md`, `docs/pi-0.87.1-validation.md`, and `docs/pi-0.85.1-validation.md` are unchanged.
