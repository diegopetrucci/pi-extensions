Five helper subagents from the collection get standalone packages, so you can install only the tools you need.

## Highlights

- **developer:** Delegate one scoped implementation task to an isolated child agent, with a completion report and validation results.
- **diff-summarizer:** Summarize local changes or a supplied diff, including risk hotspots and requirement coverage.
- **repo-scout:** Inspect a repository's stack, conventions, validation commands, and hotspots.
- **test-runner:** Run exact validation steps in order, stop at the first failure, and report the results.
- **web-scout:** Research a focused question using Exa search and fetching, with cited findings. No API key is required; an optional Exa key supports higher rate limits.

These tools were introduced in [#189](https://github.com/diegopetrucci/pi-extensions/pull/189) and already ship in the collection. This release covers their first standalone versions only; it does not update the umbrella package or certify a new Pi fleet version.

Child-session isolation is not an operating-system sandbox. `developer` and `test_runner` have unrestricted bash; configured MCP tools can have side effects. See each package README for its guards and limitations.

## Packages

- `@diegopetrucci/pi-developer@0.1.0`
- `@diegopetrucci/pi-diff-summarizer@0.1.0`
- `@diegopetrucci/pi-repo-scout@0.1.0`
- `@diegopetrucci/pi-test-runner@0.1.0`
- `@diegopetrucci/pi-web-scout@0.1.0`

## Install

Install only the helpers you want:

```bash
pi install npm:@diegopetrucci/pi-developer@0.1.0
pi install npm:@diegopetrucci/pi-diff-summarizer@0.1.0
pi install npm:@diegopetrucci/pi-repo-scout@0.1.0
pi install npm:@diegopetrucci/pi-test-runner@0.1.0
pi install npm:@diegopetrucci/pi-web-scout@0.1.0
```

If you already use `@diegopetrucci/pi-extensions`, these helpers are included; you do not need to install them again.

<!-- prepare-release:packages [["@diegopetrucci/pi-developer","0.1.0"],["@diegopetrucci/pi-diff-summarizer","0.1.0"],["@diegopetrucci/pi-repo-scout","0.1.0"],["@diegopetrucci/pi-test-runner","0.1.0"],["@diegopetrucci/pi-web-scout","0.1.0"]] -->
