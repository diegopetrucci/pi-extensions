This v0.1.78 restart supersedes the failed GitHub-only v0.1.77 publication attempt caused by context-cap/main-tag drift without changing v0.1.77's source, tag, or release metadata. It packages MCP-aware subagents, always-on quiet tools, the 300k context defaults, and the reliability and safety work carried forward from v0.1.77. This is a development baseline only. Quiet-tools is the only package with a Pi `1.1.0` test marker; all other fleet markers remain unchanged, and no whole-fleet compatibility certification is claimed. The preparation covers exactly 20 selected packages; nine unchanged workspace targets remain outside the scope.

## Highlights

- **MCP-aware subagents:** `agent-workflow-audit`, `code-reviewer`, `contrarian`, `librarian`, `oracle`, and `triage-comments` can use configured MCP and tool-search resources on supported hosts, with trust/cwd guards, evidence-limited prompts, and cleanup on exit ([#136](https://github.com/diegopetrucci/pi-extensions/pull/136), [#138](https://github.com/diegopetrucci/pi-extensions/pull/138)).
- **Always-on quiet tools:** collapsed built-in and `mcp__*` rows stay compact while native expanded output remains available; rendering is always on for supported hosts, with no opt-out setting, environment variable, or persistence mechanism. In export-style contexts, an export may omit a native `write`-call preview as an accepted tradeoff; native expanded result rendering remains available in the TUI. `/quiet-tools` and `/quiet-tools status` are read-only, the former on/off/enable/disable/toggle controls are removed, edit self-frame and padding behavior is fixed, and collapsed errors retain a visible `[failed]` marker ([#136](https://github.com/diegopetrucci/pi-extensions/pull/136), [#141](https://github.com/diegopetrucci/pi-extensions/pull/141), [#149](https://github.com/diegopetrucci/pi-extensions/pull/149)).
- **Git command safety:** `code-reviewer` allows `git branch --contains` while continuing to block `git blame --contents`, and safe Git commands suppress commit signatures ([#137](https://github.com/diegopetrucci/pi-extensions/pull/137)).
- **Pi-parity guarded paths:** `agent-workflow-audit`, `code-reviewer`, `librarian`, `permission-gate`, and `triage-comments` resolve cwd-relative, `~`, and encoded `file://` paths like Pi. The four subagent read guards (`agent-workflow-audit`, `code-reviewer`, `librarian`, and `triage-comments`) also check fallback variants and allow canonical roots. Unsafe resolution fails closed ([#148](https://github.com/diegopetrucci/pi-extensions/pull/148)).
- **300k context defaults:** `context-cap` caps effective model context at 300k tokens by default, while `minimal-footer` shows `DUMB ZONE` above 300k tokens by default. With the default 16,384-token reserve, context-cap compacts larger models at approximately 283,616 tokens ([#157](https://github.com/diegopetrucci/pi-extensions/pull/157)).
- **Reliability and safety maintenance:** workflow-audit timeout/live-preview handling, librarian MCP disposal, dynamic-context-pruning bookkeeping, triage-comments safeguards, annotation and review cleanup, shared Azure preferences ([#140](https://github.com/diegopetrucci/pi-extensions/pull/140)), and trust/configuration documentation fixes remain included from the v0.1.77 baseline.

## Packages

- `@diegopetrucci/pi-agent-workflow-audit@0.1.14`
- `@diegopetrucci/pi-annotate-git-diff@0.1.14`
- `@diegopetrucci/pi-annotate-last-message@0.1.12`
- `@diegopetrucci/pi-code-reviewer@0.1.14`
- `@diegopetrucci/pi-confirm-destructive@0.1.14`
- `@diegopetrucci/pi-context-cap@0.1.15`
- `@diegopetrucci/pi-contrarian@0.1.16`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.12`
- `@diegopetrucci/pi-fast@0.1.9`
- `@diegopetrucci/pi-inline-bash@0.1.13`
- `@diegopetrucci/pi-librarian@0.1.19`
- `@diegopetrucci/pi-minimal-footer@0.1.24`
- `@diegopetrucci/pi-oracle@0.1.31`
- `@diegopetrucci/pi-permission-gate@0.1.17`
- `@diegopetrucci/pi-project-mcp-json@0.1.2`
- `@diegopetrucci/pi-quiet-tools@0.1.14`
- `@diegopetrucci/pi-todo@0.1.12`
- `@diegopetrucci/pi-triage-comments@0.1.15`
- `pi-dynamic-context-pruning@0.1.13`
- `@diegopetrucci/pi-extensions@0.1.78`

## Install

```bash
pi install npm:@diegopetrucci/pi-extensions
```

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.14"],["@diegopetrucci/pi-annotate-git-diff","0.1.14"],["@diegopetrucci/pi-annotate-last-message","0.1.12"],["@diegopetrucci/pi-code-reviewer","0.1.14"],["@diegopetrucci/pi-confirm-destructive","0.1.14"],["@diegopetrucci/pi-context-cap","0.1.15"],["@diegopetrucci/pi-contrarian","0.1.16"],["@diegopetrucci/pi-dirty-repo-guard","0.1.12"],["@diegopetrucci/pi-fast","0.1.9"],["@diegopetrucci/pi-inline-bash","0.1.13"],["@diegopetrucci/pi-librarian","0.1.19"],["@diegopetrucci/pi-minimal-footer","0.1.24"],["@diegopetrucci/pi-oracle","0.1.31"],["@diegopetrucci/pi-permission-gate","0.1.17"],["@diegopetrucci/pi-project-mcp-json","0.1.2"],["@diegopetrucci/pi-quiet-tools","0.1.14"],["@diegopetrucci/pi-todo","0.1.12"],["@diegopetrucci/pi-triage-comments","0.1.15"],["pi-dynamic-context-pruning","0.1.13"],["@diegopetrucci/pi-extensions","0.1.78"]] -->
