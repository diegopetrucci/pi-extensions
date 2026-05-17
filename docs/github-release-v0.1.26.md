This release adds `triage-comments`, a read-only review-comment triage extension with `/triage-comments` and a standalone `@diegopetrucci/pi-triage-comments@0.1.0` package.

## Highlights

- adds `/triage-comments` for pasting reviewer feedback or fetching PR comments with read-only `gh` calls
- adds the read-only `triage_comments` subagent tool for classifying selected comments with evidence
- reports verdicts, reasoning, suggested responses, and handling options without implementing changes
- supports selecting all displayed PR comments or an explicit subset of up to 50 comments
- publishes standalone `@diegopetrucci/pi-triage-comments@0.1.0`

## Packages

- collection package: `@diegopetrucci/pi-extensions@0.1.26`
- standalone triage-comments package: `@diegopetrucci/pi-triage-comments@0.1.0`

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
