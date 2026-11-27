# Pi 1.7.0 development compatibility record

> Observation date: 2026-11-27.
>
> This is an automated development-compatibility record for moving the root development dependencies to Pi `1.7.0` and refreshing the model preference catalogs. It is not visual, interactive, live-provider, fleet, or broader runtime certification. No final code review is claimed by this record.

## Scope and preserved baseline

- The root development dependency ranges for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` moved from `^1.6.0` to `^1.7.0`, with the lockfile updated accordingly (resolving `1.7.0`).
- Published package versions, peer ranges, and the existing `.pi-fleet-tested-version` markers are unchanged. No Pi `1.7.0` fleet certification is claimed and no fleet marker was advanced.
- No live provider, OAuth, interactive, or visual TUI validation was performed.
- Prior Pi compatibility records (including `docs/pi-1.6.0-validation.md`) remain historical and were not rewritten. No user settings, credentials, or installed runtime were changed.

## Investigation

With only the development dependencies moved to `1.7.0` (observed 2026-11-27, before any fixes):

- typecheck was clean.
- The full suite has 1,532 tests. On the 1.6.0 baseline: 1,530 pass, 2 skipped, 0 fail. On 1.7.0 before fixes: 1,522 pass, 8 fail, 2 skipped. All 8 failures were built-in catalog drift (stale preference patterns and tests pinning removed model IDs), not behavior regressions.

## Changelog impact review

The Pi `1.6.1` and `1.7.0` changelogs were reviewed against the extensions in this repository:

- **Telemetry removal and `showCacheMissNotices` → `notices.*`.** Neither the removed telemetry settings nor the renamed cache-miss notice setting are used by any extension here. No change needed.
- **`--agent-dir` sets `PI_CODING_AGENT_DIR`.** The oracle and contrarian child `pi` processes inherit the environment, so they now see the same agent directory as their parent. No change needed.
- **`OSC7577_TOKEN` scrubbed at startup.** Pi removes the variable from the process environment at startup; nothing here reads or forwards it.
- **`after_provider_response` now fires on errors and retries.** The minimal-footer extension is unchanged: Codex uses WebSocket transport, which does not emit this event, so its behavior is not affected.
- **`setEditorText` / `pasteToEditor` repaint fix.** The review and annotate-git-diff extensions benefit from the fix with no code change.
- **Fast.** Unaffected: the only new Fast-related catalog entries are healthcare variants, which are deliberately not added to any allowlist.
- **dynamic-context-pruning.** It ignores `bashExecution` messages, so the `!!` context-estimate fix does not affect it.
- **Adopted in companion changes in this PR.** `blockedKind` (permission-request labelling for approval `select()` dialogs), bash `fullOutputError` (context-inspector), and codemode `generateImages` options (illustrations-to-explain-things) are handled by separate tickets in this PR rather than by this record's catalog change.

## Catalog changes

The preference catalogs in oracle, contrarian, and code-reviewer (including the shared Azure lists), plus `docs/oracle-provider-matrix.md` and the model-selection/catalog tests, were refreshed per Diego-approved decisions (2026-11):

- **Removed** every pattern no longer matching the 1.7.0 catalog: Ling 2.6 1T/Flash, `gpt-5-chat-latest`, `o1-pro`, `o4-mini`, Cloudflare Kimi K2.6/K2.7 Code, DeepSeek V4 Pro 0813, GLM 5.2, Nemotron 120B and Qwen3 30B, Copilot `gpt-5.6-terra`, `gemini-3.1-flash-lite-preview`, Groq `llama-3.3-70b-versatile`, Mistral `mistral-large-4-0-8`/`mistral-medium-3.5`/`mistral-medium-2508`/Devstral, OpenCode `kimi-k2.6`/`kimi-k2.5`, OpenCode Go `mimo-v2.5*`, OpenRouter `moonshotai/kimi-k2-thinking`, Together `deepseek-ai/DeepSeek-V4-Pro` and `openai/gpt-oss-120b`, Vercel `alibaba/qwen3-max-thinking`.
- **ant-ling:** `Ling-3.1-flash`, then `Ling-3.2-flash`, then `Ling-3.0-flash` (exact IDs). 3.1 Flash is Pi 1.7.0's new ant-ling default; 3.2 Flash is second because it is newer but its catalog price is unknown (0/0); 3.0 Flash is last; Ling 3.0 Tiny and Flash VL are excluded.
- **zai / zai-coding-cn:** `glm-5.4` directly above `glm-5.3` (catalog price is 0/0, i.e. unknown).
- **Qwen4 Max** directly above the previous top Qwen Max on the four Qwen Token Plan providers, OpenCode Go, Vercel AI Gateway and Together (newer and cheaper than 3.8 Max: $1.5/$4.5 vs $2/$6).
- **Together:** `zai-org/GLM-5.3` directly above `zai-org/GLM-5.3-Flash`.
- **OpenCode (oracle and contrarian):** `kimi-k3.1-pro` directly above `kimi-k3`.
- **Deliberately not added:** OpenCode Go `longcat-2.5`; Fireworks `qwen4-max`/`glm-5p3`; any region or price-tier router aliases (`-us`, `-flex`, `-spot`, `-fast`, `-ultrafast`); healthcare variants; Fast allowlist changes.
- Code-reviewer's intentional per-provider policies are kept: it received the same removals and additions only where its ladder already covers the provider.

Catalog assertions cover selection behavior; they do not claim that a selected model was contacted through a live provider.

## Ticket-local validation evidence

Observed 2026-11-27 from the repo root in this worktree with the uncommitted changes applied: `npm run typecheck`, the catalog/model-selection/provider-policy-contract tests, and `npm run format:check` passed. Full-suite validation is deferred to the final-validation ticket.

Not run: live provider or OAuth calls, interactive or visual TUI sessions, and fleet certification. The `.pi-fleet-tested-version` markers are unchanged.

## Undo guidance

If this compatibility slice is not accepted, a human maintainer should review the VCS diff and use the normal reviewed VCS process to revert the dependency, catalog, and doc changes, rather than a blanket checkout reset. User configuration and credentials were not part of the change set.
