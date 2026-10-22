# Pi 1.4.0 development compatibility record

> Observation date: 2026-10-22.
>
> This is an automated development-compatibility record for the approved Pi `1.4.0` dependency and test-fixture migration. It is not visual, interactive, live-provider, fleet, or broader runtime certification. No final code review is claimed by this record.

## Scope and preserved baseline

- The root development dependency ranges for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` moved from `^1.0.4` to `^1.4.0`. The lockfile resolves those three packages and transitive `@earendil-works/pi-agent-core` to exactly `1.4.0`.
- The root package remains version `0.1.79`; published workspace versions, peer ranges, and unrelated direct dependency ranges were not bumped by this compatibility work.
- The `extensions/*` workspace pattern contains 28 workspace manifests. The validation pack result is therefore the root package plus 28 workspaces, **29 packages total**—not 29 workspaces. The install preflight separately reported 29 local package entries and 18 optional packages not installed.
- Prior Pi compatibility records and release documents remain historical records and were not rewritten. No user settings, credentials, installed runtime, or fleet marker was changed.
- The 27 existing `.pi-fleet-tested-version` markers at `0.84.4` remain `0.84.4`. The existing `project-mcp-json` marker at `1.0.0` and `quiet-tools` marker at `1.1.0` also remain unchanged. No Pi `1.4.0` fleet-marker advancement is claimed.

## Approved compatibility changes

### Catalog migration

The Oracle, Contrarian, and Code Reviewer preference catalogs were refreshed against the published Pi `1.4.0` catalog. Newly dead entries were removed while surviving order and the legacy `azure-openai-responses` alias were preserved. Xiaomi preferences were migrated from the `2.5` tiers to the approved `2.6` tiers:

- direct Xiaomi: `mimo-v2.6-pro-ultraspeed`, `mimo-v2.6-pro`, `mimo-v2.6-flash`;
- token plans: `mimo-v2.6-pro`, then `mimo-v2.6-flash` for the available AMS, CN, and SGP ladders.

A review correction preserves live OpenRouter Kimi K2 Thinking (`moonshotai/kimi-k2-thinking`), removes dead exact Copilot GPT-5.4 entries from Oracle and Contrarian, and makes catalog tests honor ID-only trailing-space matching. Existing Code Reviewer nonexact `gpt-5.4` can still match the `gpt-5.4` nano model; the unchanged ranking policy remains deferred, not a new feature.

The catalog-specific assertions retain behavioral coverage; they do not claim that a selected model was contacted through a live provider.

### Quiet read ranges and project MCP JSON

- `quiet-tools` now follows Pi 1.3/1.4 read-range semantics for finite numbers and numeric strings, null or omitted values, and malformed ranges. For example, `offset: "10", limit: 5` renders `:10-14`; an offset without a limit renders `:10`. Older-host compatibility is retained without an unconditional import of the newer helper.
- `project-mcp-json` strips exactly one leading UTF-8 BOM before parsing `.mcp.json`. Malformed input remains fail-closed, with strict field allowlists, trust gates, literal escaping, and secret-safe warnings unchanged.
- Notification policy and output-truncation policy were not changed or decided by this compatibility slice. Those policy decisions remain deferred; no new notification, truncation, or Fast-eligibility behavior is implied.

### Approved SDK test-fixture migration

The Pi `1.4.0` SDK changed transcript-tool restoration to depend on `usesDefaultTools`. The approved test-only migration makes that contract explicit without changing production runtime, subagent trust controls, or tool policy:

- explicit-loadout restoration uses `usesDefaultTools: false`; a transcript cannot override the selected loadout, while allowed deferred tools can be activated explicitly;
- default-tool restoration uses `usesDefaultTools: true`; allowed late deferred tools are restored and remain active across reload;
- absent and empty transcript cases, denied-tool boundaries, MCP/extension discovery, and no-provider-call checks remain covered.

The initial full-gate attempt exposed this fixture mismatch and stopped in `npm run ci` with 1,159 tests, 1,156 passed, 2 failed, and 1 Windows-native-only skip; pack dry-runs and the final diff check were not reached. The two failures were the nested and parent forms of the restored `late_deferred` positive-control assertion. Its raw output is preserved at `/var/folders/nq/fkrbfck57y91r169_934fxb80000gn/T/pi-bash-496bf0e3779c0fb2.log`. The approved test-fixture migration corrected the test contract; it did not weaken or delete the positive restoration coverage.

## Final automated validation evidence

The final ordered validation ran from the repository root in a scrubbed `env -i` environment with a temporary HOME, agent directory, cache, npm user/global config files, and `PI_OFFLINE=1`. Sandbox: `/tmp/pi-140-validation.gJKTfF`. The parent independently inspected the successful raw output at `/var/folders/nq/fkrbfck57y91r169_934fxb80000gn/T/pi-bash-b57e3468bfcea48e.log` and recorded it in the final-validation report.

| Ordered check | Observed result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` | Passed; 154 packages added. The only setup warning was the `node-domexception@1.0.0` deprecation notice; npm also printed its routine update notice. |
| `npm run preflight:install-state` | Passed; 126 installed packages and 29 local package entries matched `package-lock.json`; 18 optional packages were not installed. |
| Exact-version assertion for `pi-ai`, `pi-coding-agent`, `pi-tui`, and `pi-agent-core` | Passed; all four resolved to `1.4.0`. |
| `npm run ci` | Passed. Formatting matched on 165 files, typecheck passed, and the full test run reported **1,161 total, 1,160 passed, 0 failed, 0 cancelled, 1 Windows-native-only skip**. The four Pi `1.4.0` SDK allowlist/restoration subtests passed. |
| npm-test tarball loader | Passed inside the CI suite: `publishable tarballs install offline and Pi loads their declared runtime entries`. This is temporary package/load evidence, not interactive or native certification. |
| `npm pack --dry-run --ignore-scripts --json` | Passed for the root package: `@diegopetrucci/pi-extensions@0.1.79`, 167 files, no bundled dependencies. |
| `npm pack --dry-run --ignore-scripts --json --workspaces` | Passed for all 28 workspaces, with no bundled dependencies. Together with the root result, this is 29 packages total. |
| `git diff --check` | Passed; no whitespace errors. The parent validation inspection also found no staged files. |

The Windows-native-only skip is an expected platform-specific parser case. No live provider, OAuth, visual/native UI, interactive session, or fleet validation was run, and no broader runtime certification follows from the automated results.

## Release handoff and gates

This Pi compatibility update triggers the repository release flow because it updates the supported Pi development baseline and its automated tests. This document is only the handoff; it did not generate release artifacts or execute release steps. The following remain gated for separately authorized work and human decisions:

- commit approval and release-version selection/preparation;
- release artifact generation, version bumps, and any package bookkeeping;
- pull request, merge, tags, and GitHub release creation;
- human-only npm publication and post-publication verification.

No commit, staging, push, publishing, user-configuration edit, or ticket closure was performed here. Final code review is not represented as complete; review and merge remain release gates.

## Undo guidance

If this compatibility slice is not accepted, a human maintainer should review the relevant VCS diff and use the normal reviewed VCS process to revert the approved Pi `1.4.0` compatibility changes, including this record, rather than restoring user settings or applying a blanket checkout reset. No revert was performed here. User configuration and credentials were not part of the change set.
