# minimal-footer

A minimal custom footer for pi.

## Layout

On wide terminals it renders two lines:

```text
<git-branch>                                         <repo-name>
<context-%>                                     <model> • <thinking>
```

Example:

```text
fix/remove-detached-image-tasks                     SendItToMy
44.1%                                              gpt-5.4 • high
```

On narrow terminals it falls back to one item per line.

## Install

Install the whole repo:

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Notes

- Replaces pi's built-in footer entirely.
- Uses the current git branch from pi footer data.
- Shows only context percentage, not context window size.
- Shows model id and thinking level.
