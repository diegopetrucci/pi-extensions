# permission-gate

A small pi extension that prompts for confirmation before running potentially dangerous bash or PowerShell commands or writing to protected paths.

This started from the original `permission-gate.ts` example in [`earendil-works/pi`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/permission-gate.ts) and adds conservative shell and path hardening.

## What it checks

- `rm -rf`
- PowerShell `Remove-Item -Recurse -Force` and its standard aliases, including module-qualified, interpolated, splatted, and backtick-escaped forms
- `sudo`
- `chmod` / `chown` with `777`
- direct `write` / `edit` calls touching normalized protected paths:
  - exact `.git` path segments
  - exact `node_modules` path segments
  - secret-bearing `.env` files such as `.env` and `.env.production`

Safe `.env` templates/examples such as `.env.example` and `.env.production.template` are allowed.

If pi is running without an interactive UI, it blocks matching commands and protected path writes by default.

For Pi's built-in local Windows PowerShell tool, commands that pass the fast lexical checks are also parsed with the same PowerShell installation's AST parser before execution. Malformed input, parser failures, `Remove-Item` parameter splatting, command-resolution changes (aliases/modules/providers), known script/process/job/member invocation wrappers, computed member calls, and analyzer inputs above 16,000 UTF-8 bytes are treated conservatively and require confirmation (or are blocked when no UI is available). Computed targets passed to provider-capable mutation commands also require confirmation because the target could resolve to `Alias:` or `Function:`. Literal quoted/commented examples, including literal here-strings, stay benign. Definitely enabled `-WhatIf` removals (`-WhatIf`, `-WhatIf:$true`, or `-WhatIf:1`) remain non-destructive and are allowed; computed switch values require confirmation.

Non-Windows and custom/remote `powershell` tools receive the conservative lexical checks, but only Pi's built-in local Windows tool can be verified with its actual parser. Pi extensions are trusted code: tool overrides, remote operations, spawn hooks, and mutations made by handlers loaded after this gate are outside its boundary and must enforce their own final-input policy.

This is a targeted confirmation guard for the command classes listed above, not a shell sandbox or a proof that every unlisted executable/API is harmless.

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
- Inspects `bash`, `powershell`, `write`, and `edit` tool calls.
- Validates shell timeouts as well as command strings and fails closed on malformed calls.
- Normalizes relative/absolute paths before matching so traversal tricks do not bypass the guard.
- Prompts with a simple `Yes` / `No` selector before allowing dangerous commands or protected path writes.
