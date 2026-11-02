# Pi 1.5.0 development compatibility record

> Observation date: 2026-11-02.
>
> This is an automated development-compatibility record for the approved Pi `1.5.0` dependency, extension-compatibility, and test migration. It is not visual, interactive, live-provider, fleet, or broader runtime certification. No final code review is claimed by this record.

## Scope and preserved baseline

- The root development dependency ranges for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` moved from `^1.4.0` to `^1.5.0`. The lockfile resolves those three packages and transitive `@earendil-works/pi-agent-core` to exactly `1.5.0`.
- Published package versions, peer ranges, and the existing `.pi-fleet-tested-version` markers are unchanged. No Pi `1.5.0` fleet certification is claimed and no fleet marker was advanced.
- The root package is `@diegopetrucci/pi-extensions@0.1.82`. The validation pack result is the root package plus 33 workspaces, **34 packages total**. The install preflight separately reported 34 local package entries and 18 optional packages not installed.
- Prior Pi compatibility records and release documents remain historical records and were not rewritten. No user settings, credentials, or installed runtime were changed.
- Pre-implementation investigation, with development dependencies bumped to `1.5.0` before any fixes: typecheck reported 10 errors (oracle 4, contrarian 4, gnosis 1, todo 1) because pi-ai `StringEnum` now returns a pi-schema `Schema`, and `npm test` had 3 failures, all catalog-related (stale Radius/Mistral entries). All extensions still loaded under Pi `1.5.0`. 12 registered tool schemas compiled and validated under pi-schema with no behavior differences in the probed cases, and the tool parameter JSON for oracle, contrarian, gnosis, and todo is byte-identical before and after the helper change. A read-only independent oracle review confirmed these findings and identified the librarian kimi-coding selection change, the inline-bash capped-output gap, and review selector paging.

## Approved compatibility changes

### StringEnum typing helper

Oracle, contrarian, gnosis, and todo replace the `@earendil-works/pi-ai` `StringEnum` import with a package-local helper built on `typebox` `Type.Unsafe`. This restores TypeBox `Static` inference, which broke because the published pi-ai `1.5.0` `StringEnum` returns a pi-schema `Schema`. Inside the Pi runtime the loader already supplied a TypeBox-typed `StringEnum`, and the emitted tool parameter JSON is unchanged.

### Catalog refresh

The preference catalogs and `docs/oracle-provider-matrix.md` were refreshed:

- stale Radius and Mistral entries were removed;
- GPT-6.1 Terra and Kimi K3.1 Pro rankings were added;
- Terra is excluded from fast mode;
- the librarian kimi-coding selection changed from `k3-256k` to `kimi-for-coding` because K3-256K pricing became 3/15. This change was reviewed and accepted.

Catalog assertions cover selection behavior; they do not claim that a selected model was contacted through a live provider.

### Inline-bash capped-output fix

`inline-bash` now reports an error when a command's output exceeds the limit and the command is terminated, or when it is killed or timed out, and it no longer treats those results as silent successes. Truncated output gets an `[inline-bash: ...]` marker. Non-zero exits are reported as errors even without stderr. Regression tests were added.

### Injected key hints

All five renderers changed: quiet-tools prefers the injected `context.keyHint` and falls back to its imported `keyHint`; oracle, contrarian, librarian, and triage-comments use the injected `keyHint` (`app.tools.expand`) when available and fall back to the literal `(Ctrl+O to expand)`. Related render tests were updated.

### Review blocked status and paging

The review extension's inline selectors declare `capturesViewportInput` and pass a blocked/question status so Pi `>= 1.5.0` reports "waiting for user"; older hosts ignore it. The searchable selector also handles `tui.select.pageUp` and `tui.select.pageDown`. Tests were extended.

### Billed-cost provenance

The ten usage aggregators (code-reviewer, developer, diff-summarizer, librarian, repo-scout, test-runner, triage-comments, web-scout, oracle, and contrarian) propagate `cost.totalFromProvider` only when every accumulated usage record was provider-billed; otherwise the flag is omitted. A new test, `test/usage-provider-billed-cost.test.mjs`, covers this.

## Final automated validation evidence

The final validation (ticket `pe-s842`) ran from the repository root in the worktree. Unlike the 1.4.0 record, it was **not** run in a scrubbed `env -i` sandbox.

| Ordered check | Observed result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed; 161 packages added. The only warning was the `node-domexception@1.0.0` deprecation notice. |
| `npm run preflight:install-state` | Passed; 128 installed packages and 34 local package entries matched `package-lock.json`; 18 optional packages were not installed. |
| Exact-version check for `pi-ai`, `pi-coding-agent`, `pi-tui`, and `pi-agent-core` | All four resolved to `1.5.0`. |
| `npm run ci` | Passed (exit 0, independently re-run by the architect). Format check clean, typecheck clean, tests **1,378 total, 1,376 passed, 0 failed, 0 cancelled, 2 skipped**. The two skips are the developer MCP exposure checks `write absent` and `edit absent`, skipped because developer intentionally exposes write/edit. Includes the publishable-tarball offline install/load test. |
| `npm pack --dry-run --ignore-scripts --json` | Passed for the root package: `@diegopetrucci/pi-extensions@0.1.82`, 186 files. |
| `npm pack --dry-run --ignore-scripts --json --workspaces` | Passed for 33 workspaces (34 packages total with the root). |
| `git diff --check` | Clean. |
| `git status` | Nothing staged. |

Not run: live provider or OAuth calls, interactive or visual TUI sessions, and fleet certification. The `.pi-fleet-tested-version` markers are unchanged, and no broader runtime certification follows from the automated results.

## Release handoff and gates

This Pi compatibility update triggers the repository release flow because it adds compatibility with a new Pi version. This document is only the handoff; it did not generate release artifacts or execute release steps. The following remain gated for separately authorized work and human decisions:

- commit approval and release-version selection/preparation;
- pull request, merge, tags, and GitHub release creation;
- publishing and post-publication verification.

No commit, staging, push, publishing, user-configuration edit, or ticket closure was performed here. Final code review is not represented as complete; review and merge remain release gates.

## Undo guidance

If this compatibility slice is not accepted, a human maintainer should review the relevant VCS diff and use the normal reviewed VCS process to revert the approved Pi `1.5.0` compatibility changes, including this record, rather than restoring user settings or applying a blanket checkout reset. No revert was performed here. User configuration and credentials were not part of the change set.
