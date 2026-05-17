# Release notes — v0.1.26

## Highlights

This release adds `triage-comments`, a read-only review-comment triage extension. It adds an interactive `/triage-comments` intake flow plus a `triage_comments` subagent tool for classifying selected PR review comments with evidence and handling options before any implementation work happens.

## triage-comments

- adds standalone package `@diegopetrucci/pi-triage-comments@0.1.0`
- adds `/triage-comments` for pasting reviewer feedback or fetching PR comments with read-only `gh` calls
- supports selecting all displayed comments or an explicit subset of up to 50 comments for triage
- adds the read-only `triage_comments` subagent tool for verdicts, evidence, reasoning, draft responses, and handling options
- classifies comments as `valid`, `invalid`, `partially valid`, `subjective`, or `needs clarification`
- keeps triage separate from implementation: the extension does not edit files or post GitHub replies, and the main agent should ask which handling option to take before making changes

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.26`
- standalone triage-comments package: `@diegopetrucci/pi-triage-comments@0.1.0`

## Suggested release blurb

`v0.1.26 adds triage-comments, a read-only /triage-comments flow and triage_comments subagent tool for classifying selected PR review comments with evidence, draft replies, and handling options before implementation.`
