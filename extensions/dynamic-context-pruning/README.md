# dynamic-context-pruning

A pi extension that will dynamically prune stale context from long-running sessions to keep them within budget while protecting important information.

This is an early scaffold. The `/context-pruning` command is currently a placeholder stub with no pruning logic yet.

## Commands

```text
/context-pruning
```

Prints a placeholder status line. Pruning behavior will be implemented in follow-up work.

## Install

### Standalone npm package

```bash
pi install npm:pi-dynamic-context-pruning
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

- This extension is under active development. No context is pruned yet.
