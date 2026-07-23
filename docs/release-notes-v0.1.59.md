# Release notes — v0.1.59

## Highlights

This release packages the audited safety and runtime fixes that landed across the root collection and 25 standalone extensions, then synchronizes the root and stale standalone fleet markers to Pi `0.81.1` without republishing the already-current `minimal-footer` standalone.

## Audited fixes in this release

- hardens `code-reviewer`, `oracle`, `contrarian`, and `review` against aborted/error-only subagent completions, preserves usable fallback behavior, and records tool-usage details more accurately for review output
- tightens `permission-gate`, `confirm-destructive`, and `triage-comments` session-safety handling so resume/switch flows respect user-owned work and cancellation more reliably
- refreshes `librarian` command/config caching behavior and supporting runtime coverage, alongside the related regression tests that were audited for this release
- updates the current extension READMEs that still pointed at redirected `earendil-works/pi-mono` example URLs so they now use canonical `earendil-works/pi` links while preserving copied-example attribution text
- marks the root package plus every stale standalone marker as fleet-tested on Pi `0.81.1`; `@diegopetrucci/pi-minimal-footer` already carried the `0.81.1` marker and is intentionally excluded from this publish set

## Packaging

- `@diegopetrucci/pi-agent-workflow-audit@0.1.6`
- `@diegopetrucci/pi-annotate-git-diff@0.1.6`
- `@diegopetrucci/pi-annotate-last-message@0.1.4`
- `@diegopetrucci/pi-brrr@0.1.9`
- `@diegopetrucci/pi-claude-fast@0.1.9`
- `@diegopetrucci/pi-code-reviewer@0.1.4`
- `@diegopetrucci/pi-confirm-destructive@0.1.7`
- `@diegopetrucci/pi-context-cap@0.1.6`
- `@diegopetrucci/pi-context-inspector@0.1.8`
- `@diegopetrucci/pi-contrarian@0.1.6`
- `@diegopetrucci/pi-dirty-repo-guard@0.1.6`
- `@diegopetrucci/pi-git-footer@0.1.5`
- `@diegopetrucci/pi-gnosis@0.1.6`
- `@diegopetrucci/pi-illustrations-to-explain-things@0.1.4`
- `@diegopetrucci/pi-inline-bash@0.1.6`
- `@diegopetrucci/pi-librarian@0.1.11`
- `@diegopetrucci/pi-notify@0.1.12`
- `@diegopetrucci/pi-openai-fast@0.1.11`
- `@diegopetrucci/pi-oracle@0.1.21`
- `@diegopetrucci/pi-permission-gate@0.1.9`
- `@diegopetrucci/pi-quiet-tools@0.1.7`
- `@diegopetrucci/pi-review@0.1.9`
- `@diegopetrucci/pi-todo@0.1.6`
- `@diegopetrucci/pi-triage-comments@0.1.7`
- `pi-dynamic-context-pruning@0.1.2`
- `@diegopetrucci/pi-extensions@0.1.59`

## Validation

- deterministic `prepare-release` dry-run selected exactly 26 packages after the marker pre-apply: the root collection plus the 25 standalone tarballs whose current publish artifacts differ from npm; `minimal-footer` remained excluded
- deterministic `prepare-release --write` updated the selected package manifests, matching `package-lock.json` workspace entries, and created the v0.1.59 release-doc set without touching historical release documents
- post-write checks confirmed all 27 fleet markers now read `0.81.1`, current extension READMEs use canonical upstream Pi links, and `git diff --check` passed with no staged files
- exact `npm view <name>@<target> version` checks confirmed every v0.1.59 target remains unpublished
- final validation passed `npm run ci` with 505/505 tests, plus focused Librarian coverage (15/15), explicit provider-catalog parity coverage (4/4), and tarball/runtime smoke coverage (1/1)
- `npm audit --omit=dev` still reports the known upstream moderate advisory from Pi `0.81.1` dev dependency shrinkwrap content: nested `protobufjs@7.6.4` inside published `@earendil-works/pi-coding-agent`; the root override keeps the direct/top-level resolution at `^7.6.5`, but the upstream shrinkwrap still installs the nested copy
- final validation is complete; human npm publishing remains intentionally out of scope for tlh and is the remaining manual release step

<!-- prepare-release:packages [["@diegopetrucci/pi-agent-workflow-audit","0.1.6"],["@diegopetrucci/pi-annotate-git-diff","0.1.6"],["@diegopetrucci/pi-annotate-last-message","0.1.4"],["@diegopetrucci/pi-brrr","0.1.9"],["@diegopetrucci/pi-claude-fast","0.1.9"],["@diegopetrucci/pi-code-reviewer","0.1.4"],["@diegopetrucci/pi-confirm-destructive","0.1.7"],["@diegopetrucci/pi-context-cap","0.1.6"],["@diegopetrucci/pi-context-inspector","0.1.8"],["@diegopetrucci/pi-contrarian","0.1.6"],["@diegopetrucci/pi-dirty-repo-guard","0.1.6"],["@diegopetrucci/pi-git-footer","0.1.5"],["@diegopetrucci/pi-gnosis","0.1.6"],["@diegopetrucci/pi-illustrations-to-explain-things","0.1.4"],["@diegopetrucci/pi-inline-bash","0.1.6"],["@diegopetrucci/pi-librarian","0.1.11"],["@diegopetrucci/pi-notify","0.1.12"],["@diegopetrucci/pi-openai-fast","0.1.11"],["@diegopetrucci/pi-oracle","0.1.21"],["@diegopetrucci/pi-permission-gate","0.1.9"],["@diegopetrucci/pi-quiet-tools","0.1.7"],["@diegopetrucci/pi-review","0.1.9"],["@diegopetrucci/pi-todo","0.1.6"],["@diegopetrucci/pi-triage-comments","0.1.7"],["pi-dynamic-context-pruning","0.1.2"],["@diegopetrucci/pi-extensions","0.1.59"]] -->
