# Release notes — v0.1.75

## Highlights

- **Ultrafast mode in `fast`** ([#107](https://github.com/diegopetrucci/pi-extensions/pull/107)): `/ultrafast` and `/fast ultrafast` toggle a session-only Ultrafast mode limited to `gpt-6-astra` on the canonical OpenAI Responses endpoint with API-key authentication. Activation on an unsupported model or auth errors without changing state; losing eligibility disables it with no fallback to regular Fast and no automatic reactivation. Existing request service tiers are preserved. Actual API pricing is 6x Standard and Pi's display accounting omits the premium. Codex OAuth, direct OpenAI OAuth, Chat Completions, preview models, and regional/proxy endpoints are excluded. No live or paid provider calls were made; remote acceptance and billing are not live-certified.
- **New `project-mcp-json` extension** ([#108](https://github.com/diegopetrucci/pi-extensions/pull/108)): loads `<cwd>/.mcp.json` (Claude Code project format) via `pi.registerMcpServer`.
  - Trust follows Pi's project-trust semantics: untrusted (including `--no-approve`) skips; Pi's own decision applies when Pi-protected project resources exist; otherwise the nearest-ancestor saved decision in `~/.pi/agent/trust.json`; otherwise `defaultProjectTrust` (`ask` skips and suggests `/trust`). The extension never writes `trust.json`. An absent `.mcp.json` is a silent no-op.
  - Supports stdio and HTTP/streamable-HTTP servers with a strict field allowlist; rejects SSE, WebSocket, `headersHelper`, `auth`, and command+url entries with a warning.
  - One-pass `${VAR}` / `${VAR:-default}` expansion, then literal escaping so Pi's resolver does not run `!` commands or re-interpolate `$`.
  - Warnings omit configuration values, expanded URLs, and raw errors; names and keys are control-character stripped and length-capped.
  - Same-name servers from Pi's own `mcp.json` win. Requires Pi 1.0 or later (`registerMcpServer`); on older Pi a single notice is shown.

## Packaging

- `@diegopetrucci/pi-fast@0.1.7`
- `@diegopetrucci/pi-project-mcp-json@0.1.0` (new package; tested-version marker `1.0.0`, peer `@earendil-works/pi-coding-agent >=1.0.0`)
- `@diegopetrucci/pi-extensions@0.1.75`

Fleet markers for existing packages are unchanged at Pi `0.84.4`; this release claims no new fleet compatibility certification.

## Validation

- `npm ci` and `npm run preflight:install-state` passed (240 installed packages, 29 local package entries).
- `npm run prepare-release -- --input /tmp/pi-extensions-v0.1.75-input.json` dry-run selected exactly the three target packages; `--write` updated manifests and lock metadata and created the four v0.1.75 documents.
- `npm run ci` passed: 936 tests, 935 passed, 0 failed, 1 skipped.
- `npm pack --dry-run` passed for all 29 packages.
- `git diff --check` passed.
- `npm audit` still reports one high-severity upstream `brace-expansion` finding nested under `@earendil-works/pi-coding-agent`; no remediation is claimed.

<!-- prepare-release:packages [["@diegopetrucci/pi-fast","0.1.7"],["@diegopetrucci/pi-project-mcp-json","0.1.0"],["@diegopetrucci/pi-extensions","0.1.75"]] -->
