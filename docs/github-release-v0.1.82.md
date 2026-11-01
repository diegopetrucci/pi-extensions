This release adds five new TLH helper subagents to the umbrella collection, fixes kitty notification suppression in `notify`, and tightens read-only and config-validation guards across several extensions.

## Highlights

- **New TLH helper subagents:** The umbrella collection now bundles five new subagent extensions — `developer`, `diff_summarizer`, `repo_scout`, `test_runner`, and `web_scout` — each running as an isolated in-process child agent with MCP and trust handling ([#189](https://github.com/diegopetrucci/pi-extensions/pull/189)). They ship in `@diegopetrucci/pi-extensions` only for this release; standalone packages are not published yet. `developer` and `test_runner` run unrestricted bash by design (documented in their READMEs), and `web_scout` sends queries and URLs to the Exa hosted MCP endpoint.
- **kitty notifications:** `notify` now uses a unique OSC 99 identifier per notification instead of a fixed `i=1`, which kitty could treat as an update to an earlier notification and so suppress new popups ([#191](https://github.com/diegopetrucci/pi-extensions/pull/191), fixes [#190](https://github.com/diegopetrucci/pi-extensions/issues/190)). This is based on kitty's identifier semantics and was not verified in a live kitty session.
- **Tighter read-only guards:** `librarian` now blocks shell command substitution and `find -delete`/`-exec`-style actions ([#181](https://github.com/diegopetrucci/pi-extensions/pull/181)); `triage-comments` now blocks `git remote show`, `gh --web`/`-w`, and `gh api --cache` ([#178](https://github.com/diegopetrucci/pi-extensions/pull/178)); and `agent-workflow-audit`'s `git branch` check now allows more read-only listing options while still blocking creation, deletion, and rename ([#189](https://github.com/diegopetrucci/pi-extensions/pull/189)).
- **Correct models for oracle, contrarian, and code-reviewer:** Model preference patterns are anchored so they no longer select weaker sibling models such as `-flash-lite`, `-codex-spark`, or `-mini` variants ([#180](https://github.com/diegopetrucci/pi-extensions/pull/180)).
- **brrr hardening:** `brrr` validates `brrr.json` field by field (wrong types warn and keep defaults), refuses webhook redirects so a redirect cannot forward the message body off the brrr host, and reads settled-run messages from session entries only ([#182](https://github.com/diegopetrucci/pi-extensions/pull/182)).
- **minimal-footer config:** `minimal-footer` no longer crashes on a `null` config file and warns and uses defaults for other non-object config roots ([#184](https://github.com/diegopetrucci/pi-extensions/pull/184)).
- **permission-gate and PowerShell:** `permission-gate` now rejects named `powershell` tool calls as unsupported on every platform and drops its PowerShell analyzer. PowerShell launched through Bash or other tools is not covered by this policy ([#188](https://github.com/diegopetrucci/pi-extensions/pull/188)).

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.16`
- `@diegopetrucci/pi-brrr@0.1.16`
- `@diegopetrucci/pi-code-reviewer@0.1.17`
- `@diegopetrucci/pi-contrarian@0.1.19`
- `@diegopetrucci/pi-librarian@0.1.22`
- `@diegopetrucci/pi-minimal-footer@0.1.26`
- `@diegopetrucci/pi-notify@0.1.20`
- `@diegopetrucci/pi-oracle@0.1.34`
- `@diegopetrucci/pi-permission-gate@0.1.19`
- `@diegopetrucci/pi-project-mcp-json@0.1.4`
- `@diegopetrucci/pi-triage-comments@0.1.18`
- `@diegopetrucci/pi-extensions@0.1.82`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

The five new subagent extensions are included in `@diegopetrucci/pi-extensions` only; they have no standalone package in this release.

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.16"],["@diegopetrucci/pi-brrr","0.1.16"],["@diegopetrucci/pi-code-reviewer","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.19"],["@diegopetrucci/pi-librarian","0.1.22"],["@diegopetrucci/pi-minimal-footer","0.1.26"],["@diegopetrucci/pi-notify","0.1.20"],["@diegopetrucci/pi-oracle","0.1.34"],["@diegopetrucci/pi-permission-gate","0.1.19"],["@diegopetrucci/pi-project-mcp-json","0.1.4"],["@diegopetrucci/pi-triage-comments","0.1.18"],["@diegopetrucci/pi-extensions","0.1.82"]] -->
