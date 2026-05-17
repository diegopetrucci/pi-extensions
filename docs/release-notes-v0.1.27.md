# Release notes — v0.1.27

## Highlights

This release improves `triage-comments` PR intake: `/triage-comments pr` can detect the current branch's PR before asking for a PR number, and fetched PR comments can be filtered to hide resolved and/or outdated inline review comments before triage selection.

## triage-comments

- `pr` mode with no explicit target first checks the current named non-`main` branch for an existing PR using read-only `git` and `gh pr view` calls, then falls back to the PR URL/number prompt when detection is not applicable or fails
- adds a PR intake prompt to show all fetched comments or hide resolved inline review comments, outdated inline review comments, or both
- fetches best-effort review-thread metadata from GitHub GraphQL so inline review comments can show resolved/outdated state
- keeps PR issue comments, review bodies, and inline comments without thread metadata visible because GitHub only exposes resolved/outdated state at the review-thread level
- includes filter/thread state in displayed comments and in the triage payload context so the read-only triage has selection context

## Packaging

- collection package: `@diegopetrucci/pi-extensions@0.1.27`
- standalone triage-comments package: `@diegopetrucci/pi-triage-comments@0.1.1`

## Suggested release blurb

`v0.1.27 improves triage-comments PR intake with current-branch PR auto-detection and optional filtering for resolved/outdated inline review comments before triage.`
