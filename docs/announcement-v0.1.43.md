Released `@diegopetrucci/pi-extensions@0.1.43` with two new annotation extensions ported from The Last Harness:

- `@diegopetrucci/pi-annotate-git-diff@0.1.0` adds `/annotate-git-diff`, a native Glimpse + Monaco review UI for git diffs that appends structured feedback to the editor.
- `@diegopetrucci/pi-annotate-last-message@0.1.0` adds `/annotate-last-message`, a native annotation UI for the latest assistant reply with overall, section, and inline notes.

Install:

```bash
pi install npm:@diegopetrucci/pi-extensions
# or standalone:
pi install npm:@diegopetrucci/pi-annotate-git-diff
pi install npm:@diegopetrucci/pi-annotate-last-message
```

Then run `/reload`.
