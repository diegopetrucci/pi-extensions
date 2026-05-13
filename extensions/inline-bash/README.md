# inline-bash

A pi extension that expands inline bash commands in user prompts before they are sent to the agent.

This is copied from the original `inline-bash.ts` example in [`earendil-works/pi`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/inline-bash.ts) and kept basically the same.

## Usage

Write inline commands with `!{...}`:

```text
What's in !{pwd}?
The current branch is !{git branch --show-current} and status: !{git status --short}
My node version is !{node --version}
```

The extension runs each command and replaces the `!{command}` pattern with trimmed stdout or stderr.

Whole-line `!command` syntax is left alone so pi's built-in shell-command behavior still works.

## Install

### Standalone npm package

```bash
pi install npm:@diegopetrucci/pi-inline-bash
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

- Hooks the `input` event.
- Inline commands run through `bash -c` with a 30-second timeout.
- In interactive mode, pi shows a notification summarizing the expanded commands.
- Treat prompt text containing `!{...}` as shell code; only use this extension where prompt authors are trusted.
