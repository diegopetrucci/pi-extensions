# Release notes — v0.1.30

## Highlights

This release adds persisted Oracle defaults, so users can choose the model and reasoning/thinking level that future automatic oracle tool calls should use when the agent does not pass per-call overrides.

## oracle

- adds `/oracle` as a user-facing configuration command for Oracle defaults
- supports `/oracle model <provider/model>` and `/oracle thinking <off|minimal|low|medium|high|xhigh>`
- supports `/oracle status`, `/oracle model auto`, `/oracle thinking auto`, and `/oracle clear [all|model|thinking]`
- persists preferences under pi's agent directory in `extensions/oracle.json`
- applies persisted defaults to future `oracle` tool calls, including automatic agent-launched calls that omit `model` or `thinkingLevel`
- keeps per-call tool parameters as the highest-precedence override and still clamps unsupported thinking levels to matched model capabilities
- updates `/oracle-model` so it reports the configured default when one is active

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.30`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.9`

## Suggested release blurb

`v0.1.30 adds persisted /oracle model and thinking defaults so automatic Oracle calls respect the user's preferred model/reasoning level unless a tool call overrides them.`
