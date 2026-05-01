# GitHub release body — v0.1.13

## v0.1.13

This release makes `minimal-footer` configurable and adds an optional high-context warning.

### Highlights

- added a red `DUMB ZONE` footer indicator when context usage is above 200k tokens
- added JSON config for `minimal-footer`
- `DUMB ZONE` can be disabled, relabeled, recolored, or moved to a different token threshold
- OpenAI Codex session-limit usage can be disabled entirely
- the `5h` and `7d` usage windows can be disabled independently and relabeled
- Codex usage fetches are skipped when usage display is disabled
- added `minimal-footer.example.json` and expanded README configuration docs

### Included docs

- [`docs/release-notes-v0.1.13.md`](./release-notes-v0.1.13.md)
- [`docs/publish-checklist-v0.1.13.md`](./publish-checklist-v0.1.13.md)
- [`docs/announcement-v0.1.13.md`](./announcement-v0.1.13.md)

### Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.13`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer@0.1.5`

### Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone minimal footer:

```bash
pi install npm:@diegopetrucci/pi-minimal-footer
```

Then reload pi:

```text
/reload
```
