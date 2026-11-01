# Announcement drafts — v0.1.82

## Short

v0.1.82 adds five new TLH helper subagents (developer, diff-summarizer, repo-scout, test-runner, web-scout) to the umbrella collection, fixes kitty notification suppression in `notify`, and tightens read-only guards in `librarian`, `triage-comments`, and `agent-workflow-audit`. The new subagents ship in `@diegopetrucci/pi-extensions` only; standalone packages are not published yet. It is a release-preparation candidate, not a publication or compatibility certification.

Suggested public title: **New TLH helper subagents, kitty notification fix, and tighter read-only guards**.

## Highlights

- Five new subagents (`developer`, `diff_summarizer`, `repo_scout`, `test_runner`, `web_scout`) are bundled in the umbrella package ([#189](https://github.com/diegopetrucci/pi-extensions/pull/189)).
- `notify` uses a unique OSC 99 id per notification instead of a fixed `i=1`, which kitty could treat as an update to an earlier notification and so suppress new popups; not verified in a live kitty session ([#191](https://github.com/diegopetrucci/pi-extensions/pull/191)).
- `librarian` and `triage-comments` bash guards block more side-effecting commands ([#181](https://github.com/diegopetrucci/pi-extensions/pull/181), [#178](https://github.com/diegopetrucci/pi-extensions/pull/178)).
- `brrr`, `minimal-footer`, `oracle`, `contrarian`, `code-reviewer`, and `permission-gate` receive hardening fixes ([#182](https://github.com/diegopetrucci/pi-extensions/pull/182), [#184](https://github.com/diegopetrucci/pi-extensions/pull/184), [#180](https://github.com/diegopetrucci/pi-extensions/pull/180), [#188](https://github.com/diegopetrucci/pi-extensions/pull/188)).

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

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.16"],["@diegopetrucci/pi-brrr","0.1.16"],["@diegopetrucci/pi-code-reviewer","0.1.17"],["@diegopetrucci/pi-contrarian","0.1.19"],["@diegopetrucci/pi-librarian","0.1.22"],["@diegopetrucci/pi-minimal-footer","0.1.26"],["@diegopetrucci/pi-notify","0.1.20"],["@diegopetrucci/pi-oracle","0.1.34"],["@diegopetrucci/pi-permission-gate","0.1.19"],["@diegopetrucci/pi-project-mcp-json","0.1.4"],["@diegopetrucci/pi-triage-comments","0.1.18"],["@diegopetrucci/pi-extensions","0.1.82"]] -->
