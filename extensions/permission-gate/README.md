# permission-gate

A small pi extension that prompts for confirmation before running potentially dangerous bash commands or writing to protected paths. Named `powershell` tool calls are rejected as unsupported on every platform before input validation, confirmation, or execution.

This started from the original `permission-gate.ts` example in [`earendil-works/pi`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/permission-gate.ts) and adds conservative shell and path hardening.

## What it checks

- `rm -rf`
- `sudo`
- `chmod` / `chown` with `777`
- direct `write` / `edit` calls touching normalized protected paths:
  - exact `.git` path segments
  - exact `node_modules` path segments
  - secret-bearing `.env` files such as `.env` and `.env.production`

Safe `.env` templates/examples such as `.env.example` and `.env.production.template` are allowed.

Write and edit paths are resolved the same way Pi's built-in tools do — including `file:` URL decoding (percent-encoded paths like `file:///…/%2Eenv` are decoded before checking), `~` and `~/` tilde expansion, Unicode space normalisation, and resolution of relative paths against `ctx.cwd`. Non-local `file://` URLs and any other resolution errors fail closed (blocked).

If pi is running without an interactive UI, it blocks matching bash commands and protected path writes by default. Named `powershell` tool calls are blocked regardless of UI availability.

This is a named-tool policy, not a system-wide PowerShell ban or a shell sandbox: it does not inspect PowerShell text launched through bash or other tools, and trusted extensions, tool overrides, remote operations, spawn hooks, and later handlers must enforce their own final-input policy.

## Pi 0.99 dispatch boundary

The policy is deliberately named-tool-only: it checks `bash`, `powershell`, `write`, and `edit` `tool_call` events. Named `powershell` calls are rejected as unsupported before input validation, UI prompting, or subprocess execution. Pi 0.99 routes `ctx.executeTool()` calls (including calls made by `codemode`) through the same preflight tool-call pipeline and supplies `parentToolCallId`; the named checks therefore apply to nested calls too. Executed calls (including execution errors and `isError` results) reach the tool-result hook. Preflight-blocked, invalid, and unknown-tool calls instead produce Pi's host error result and, for nested calls, a bounded nested-call record without an after-execution `tool_result` event. Confirmation cancellation, UI failure, and missing UI fail closed.

MCP calls also pass through Pi's host pipeline, but arbitrary `mcp__<server>__<tool>` names are outside this extension's existing guarantee. This extension does not authorize arbitrary MCP tools, infer policy from `readOnlyHint`/`destructiveHint` annotations, or provide a universal MCP security sandbox. Any annotation-based or broader MCP policy requires separate human approval. Custom tools, remote/overridden implementations, and later handlers must enforce their own final-input policy.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-permission-gate
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

## Notes

- Hooks the `tool_call` event.
- Inspects `bash`, `powershell`, `write`, and `edit` tool calls; rejects named `powershell` calls as unsupported.
- Validates bash timeouts as well as command strings and fails closed on malformed calls.
- Normalizes relative/absolute paths before matching so traversal tricks do not bypass the guard.
- Resolves write and edit paths like Pi's built-in tools (file URLs, `~` expansion, cwd) so percent-encoded URLs, tilde paths, and cwd-relative paths inside protected directories are all caught.
- Prompts with a simple `Yes` / `No` selector before allowing dangerous commands or protected path writes.
