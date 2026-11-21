# Pi 1.6.0 development compatibility record

> Observation date: 2026-11-20.
>
> This is an automated development-compatibility record for moving the root development dependencies to Pi `1.6.0`, refreshing the preference catalogs, and adding GPT-6.2 to the Fast allowlists. It is not visual, interactive, live-provider, fleet, or broader runtime certification. No final code review is claimed by this record.

## Scope and preserved baseline

- The root development dependency ranges for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` moved from `^1.5.2` to `^1.6.0`, with the lockfile updated accordingly.
- Published package versions, peer ranges, and the existing `.pi-fleet-tested-version` markers are unchanged. No Pi `1.6.0` fleet certification is claimed and no fleet marker was advanced.
- No live provider, OAuth, interactive, or visual TUI validation was performed.
- Prior Pi compatibility records (including `docs/pi-1.5.2-validation.md`) remain historical and were not rewritten. No user settings, credentials, or installed runtime were changed.

## Investigation

With only the development dependencies moved to `1.6.0` (observed 2026-11-20 in a scratch copy, before any fixes):

- typecheck had one error: `extensions/quiet-tools/index.ts` TS4104, because `render()` now returns `readonly string[]` and the override returned `string[]`.
- `npm test` ran 1,531 tests with 1 failure: the catalog staleness test, which flags preference entries no longer present in the Pi catalog.

## Changelog impact review

The Pi `1.6.0` changelog was reviewed against the extensions in this repository:

- **`render()` readonly / cached `Container` output (breaking).** `render()` now returns `readonly string[]` and `Container` returns the same cached array while its children are unchanged. The quiet-tools `QuietLinesRenderComponent` and `QuietCallRenderComponent` overrides were retyped to `readonly string[]`. No in-place mutation of `super.render()` or embedded component output was found: the other `render()` call sites (quiet-tools frame, review `text.render`/`container.render`) return the result without mutating it.
- **find path patterns relative to the search directory.** The triage-comments and web-scout `find` guards only reject absolute patterns and `..` traversal, which remain correct (and safer) under relative-to-search-dir semantics. Their prompts and the developer extension's `find` handling do not depend on matching through parent folders. No change needed.
- **`pi.exec` reports 128 + signal for signal-terminated commands (previously 0).** Reviewed `dirty-repo-guard`, `review`, `triage-comments`, and `context-inspector`. The first three check `killed` before or together with `code !== 0`, so a signal-terminated command is still treated as a timeout/failure; the previous code-0 result is no longer a possible false success. `review` has a few sites that treat `code === 0` as success only after `!killed`, so behavior is unchanged. `context-inspector` checks only `code === 0` for the browser-open helper; a signal-terminated opener previously looked like success and now reports `open command exited with code 143/137`, which is the more correct outcome. No code change was made or needed.
- **`session_start` / RPC replacement changes.** RPC `new_session`, `switch_session`, `fork`, and `clone` no longer run `session_start` handlers twice, and events emitted by `session_start` handlers now reach RPC and `--mode json` clients. Extensions here that use `session_start` (fast, oracle, contrarian, librarian, review, todo, git-footer, minimal-footer, claude-fast, context-cap) are idempotent state initializers, so running once rather than twice does not change correctness. No change needed.
- **Other changes.** Anthropic message threads now default on for any provider whose `baseUrl` is on `api.anthropic.com`; Fast's existing `betas` fingerprinting and `disableContinuation` handling already cover this. Pi's default model for `openai`, `azure`, and `openai-codex` is now GPT-6.2 Sol; extensions here select models via their own preference ladders and are unaffected. The new GPT-6.2 models reject thinking level `off`; no extension forces `off` for them.

## Fast extension outcome

GPT-6.2 Sol and GPT-6.2 Astra were added to the Codex priority list, the direct OpenAI API Fast list, and the Ultrafast list in `extensions/fast/index.ts`, with README and tests updated. Evidence is cited in `extensions/fast/README.md`: openai/codex `models.json` @ 6c0cee5 advertises `priority` for both (Codex), and OpenAI's data-residency and Ultrafast docs list both models (direct API Fast and Ultrafast; GPT-6.2 Ultrafast data residency is US-only).

## Catalog changes

The preference catalogs in oracle, contrarian, and code-reviewer, plus `docs/oracle-provider-matrix.md` and `test/provider-model-preferences-catalog.test.mjs`, were refreshed:

- GPT-6.2 Astra ranks directly above GPT-6 Astra and GPT-6.2 Sol directly above GPT-6.1 Sol across the OpenAI-family ladders (openai, openai-codex, azure, Bedrock regional/global IDs, Cloudflare AI Gateway, GitHub Copilot, OpenCode, OpenRouter, Vercel AI Gateway, Radius), preserving tier-before-version ordering.
- `deepseek-v4.1-flash` was added to the Qwen Token Plan ladders, always below `deepseek-v4-pro`: last on the Team ladders, and above `deepseek-v4-flash-0731` on the individual ladders. `qwen4-max-preview` was deliberately not added because it is a preview model. `glm-5.3` was added directly above `glm-5.2` on the Team ladders (the individual ladders already had it).
- Stale entries were removed: OpenCode `gemini-3.1-pro`, `glm-5.2`, `glm-5.1`, and `glm-5` (replaced by a single `glm-5.3` entry); OpenCode Go `glm-5.2`; and NVIDIA `moonshotai/kimi-k2.6` (oracle, contrarian, code-reviewer as applicable).

The catalog test's Fast allowlist expectation (`unified direct API and Codex Fast mode allow the confirmed GPT models`) was updated to include `gpt-6.2-astra` and `gpt-6.2-sol`; its other expectations were updated for the new GPT-6.2 Astra leaders, the removed `glm-5.2` OpenCode Go and `moonshotai/kimi-k2.6` NVIDIA entries.

Catalog assertions cover selection behavior; they do not claim that a selected model was contacted through a live provider.

## Final automated validation evidence

Observed 2026-11-20/21 from the repo root in this worktree with the uncommitted changes applied (not in a scrubbed sandbox), during the final-validation ticket run (pe-s9sy).

| Check | Observed result |
| --- | --- |
| `npm ci` | Passed (161 packages added). |
| `npm run preflight:install-state` | Passed (128 installed packages and 34 local package entries matched `package-lock.json`). |
| Installed versions of `pi-ai`, `pi-coding-agent`, `pi-tui`, and `pi-agent-core` | All four `1.6.0`. |
| `npm run ci` | Passed (exit 0). Tests: **1,532 total, 1,530 passed, 0 failed, 0 cancelled, 2 skipped**. |
| `npm run format:check` | Passed. |
| `git diff --check` | Passed. |

Not run: live provider or OAuth calls, interactive or visual TUI sessions, and fleet certification. The `.pi-fleet-tested-version` markers are unchanged.

## Undo guidance

If this compatibility slice is not accepted, a human maintainer should review the VCS diff and use the normal reviewed VCS process to revert the dependency, quiet-tools, catalog, and Fast changes and this record, rather than a blanket checkout reset. User configuration and credentials were not part of the change set.
