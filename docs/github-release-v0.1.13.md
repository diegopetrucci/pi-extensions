This release makes `minimal-footer` configurable and adds an optional high-context warning.

## Highlights

- added a red `DUMB ZONE` footer indicator when context usage is above 200k tokens
- added JSON config for `minimal-footer`
- `DUMB ZONE` can be disabled, relabeled, recolored, or moved to a different token threshold
- OpenAI Codex session-limit usage can be disabled entirely
- the `5h` and `7d` usage windows can be disabled independently and relabeled
- Codex usage fetches are skipped when usage display is disabled
- added `minimal-footer.example.json` and expanded README configuration docs

## Packages

- collection package: `@diegopetrucci/pi-extensions`
- standalone minimal footer package: `@diegopetrucci/pi-minimal-footer`

## Install

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
