# review

A standalone tlh/pi review extension that adds `/review` and `/end-review`, adapted from the upstream [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/review.ts) implementation.

## Install

Install the standalone package:

```bash
pi install npm:@diegopetrucci/pi-review
```

Then reload pi:

```text
/reload
```

## Usage

- `/review` — open the interactive selector
- `/review uncommitted` — review uncommitted changes
- `/review branch main` — review against a base branch
- `/review commit <sha>` — review a specific commit
- `/review pr <number-or-url>` — fetch and review a GitHub pull request
- `/review folder src docs` — review one or more folders/files as a snapshot
- `/review --extra "focus on performance regressions"` — add one-off instructions
- `/end-review` — return from the review branch and optionally summarize or queue fixes

## Notes

- Behavior is intentionally kept equivalent to the upstream source, with only packaging/attribution changes for this repository.
- PR review requires `gh` access and a clean working tree for tracked files.
- If the project is trusted and a `REVIEW_GUIDELINES.md` file exists next to the repo's `.pi` directory, its contents are appended to the review prompt.

## License and attribution

This package vendors and adapts `extensions/review.ts` from `mitsuhiko/agent-stuff` under the Apache-2.0 license. See [LICENSE](./LICENSE).
