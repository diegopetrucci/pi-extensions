Adds two native annotation extensions ported from The Last Harness: one for reviewing git diffs and one for annotating the latest assistant reply.

## Highlights

- Adds `@diegopetrucci/pi-annotate-git-diff@0.1.0` with `/annotate-git-diff`.
- Adds `@diegopetrucci/pi-annotate-last-message@0.1.0` with `/annotate-last-message`.
- Registers both extensions in the collection package.
- Packages the Glimpse, Monaco, and Tailwind browser assets needed by the annotation UIs.

## Packages

- `@diegopetrucci/pi-extensions@0.1.43`
- `@diegopetrucci/pi-annotate-git-diff@0.1.0`
- `@diegopetrucci/pi-annotate-last-message@0.1.0`

## Install

Standalone:

```bash
pi install npm:@diegopetrucci/pi-annotate-git-diff
pi install npm:@diegopetrucci/pi-annotate-last-message
```

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```
