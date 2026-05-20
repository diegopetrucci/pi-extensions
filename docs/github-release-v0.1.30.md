This release adds persisted `/oracle` defaults so automatic Oracle tool calls can respect the user's preferred model and reasoning/thinking level.

## Highlights

- adds `/oracle` as a user-facing configuration command for Oracle defaults
- supports persisted default model selection with `/oracle model <provider/model>`
- supports persisted default thinking levels with `/oracle thinking <off|minimal|low|medium|high|xhigh>`
- supports `/oracle status`, `/oracle model auto`, `/oracle thinking auto`, and `/oracle clear [all|model|thinking]`
- applies configured defaults to future `oracle` tool calls, including agent-launched calls that omit explicit `model` or `thinkingLevel`
- preserves per-call tool parameters as the highest-precedence override and continues clamping unsupported thinking levels to model capabilities
- updates `/oracle-model` to report configured defaults when active

## Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.30`
- standalone oracle package: `@diegopetrucci/pi-oracle@0.1.9`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone oracle:

```bash
pi install npm:@diegopetrucci/pi-oracle
```

Then reload pi:

```text
/reload
```
