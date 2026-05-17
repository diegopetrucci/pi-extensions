This release improves `triage-comments` PR intake with current-branch PR auto-detection and optional filtering for resolved/outdated inline review comments before triage.

## Highlights

- auto-detects an existing PR for the current named non-`main` branch before prompting for a PR URL or number
- adds a PR intake filter prompt for resolved inline review comments, outdated inline review comments, both, or neither
- fetches best-effort GitHub review-thread metadata for inline comment resolved/outdated state
- keeps issue comments, review bodies, and inline comments without thread metadata visible so potentially relevant feedback is not silently dropped

## Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.27`
- standalone triage-comments package: `@diegopetrucci/pi-triage-comments@0.1.1`

## Install

Collection:

```bash
pi install npm:@diegopetrucci/pi-extensions
```

Standalone triage-comments:

```bash
pi install npm:@diegopetrucci/pi-triage-comments
```

Then reload pi:

```text
/reload
```
