# dynamic-context-pruning v2 design: agentic compression parity plan

Status: design-only, not implemented. This document is the pre-descope plan for v2
(agentic, model-driven compression). It exists so that if the v1 benchmark evidence
(pe-e9pv) supports building v2, we can cut implementation tickets directly from it
without re-researching OpenCode DCP or re-deriving the Pi extension mapping.

Scope of v1 (already shipped, for contrast): automatic, non-agentic strategies only
— deduplication, error-input purge, superseded-file-ops pruning — gated by a
cache-aware net-benefit calculation, applied on the `context` event, with a
`/prune` picker and a `/context-pruning` status/config command. See
[`../index.ts`](../index.ts) and [`../scripts/benchmark.mjs`](../scripts/benchmark.mjs).

v2, if funded, adds the agentic layer: a model-invoked `compress` tool that
replaces stale conversation spans with technical summaries, nudges that make the
model actually use it, manual mode, and prompt overrides. This is a categorically
bigger surface than v1 and touches session integrity (signed provider blocks),
so most of this document is about *how to build it safely on Pi*, not just *what
OpenCode DCP does*.

Primary sources:
- OpenCode DCP local checkout: `/Users/diegopetrucci/Developer/misc/opencode-dynamic-context-pruning`
  (README.md, `lib/compress/`, `lib/messages/`, `lib/prompts/`, `lib/strategies/`, `lib/hooks.ts`).
  All bare paths like `lib/compress/range.ts` below refer to this checkout.
- Pi extension API: `packages/coding-agent/docs/extensions.md`, `session-format.md`,
  `compaction.md`, `src/core/extensions/types.ts` in the local Pi checkout.
- Pi provider serialization: `packages/ai/src/types.ts`, `packages/ai/src/api/*.ts`
  in the local Pi checkout (for signed-block field names, see §3).
- v1 implementation: [`../index.ts`](../index.ts) (`STRATEGIES`, `PruneDecisionRecord`,
  tombstones, `evaluateNetBenefitGate`, `CumulativePruneStats`).
- v1 benchmark harness and its first real-corpus run: [`../scripts/benchmark.mjs`](../scripts/benchmark.mjs) (§4).

---

## 1. DCP feature parity inventory

This section is the exhaustive "what v2 must be able to do" list, derived from the
OpenCode DCP source (not just its README), so nothing gets lost between now and
whenever v2 tickets get cut.

### 1.1 Compress tool: range mode vs message mode

DCP exposes compression as an actual tool the model calls, not a background pass.
Two mutually exclusive modes, set by `compress.mode`:

| Mode | Tool | Unit compressed | Source |
|---|---|---|---|
| `range` (default) | `compress` (range schema) | one or more contiguous message/block spans, each replaced by one summary | `lib/compress/range.ts` |
| `message` (experimental) | `compress` (message schema) | individual raw messages, compressed independently, in a batch call | `lib/compress/message.ts` |

Range-mode tool args: `{ topic, content: [{ startId, endId, summary }] }` — the
model gives a topic label plus one or more `{startId, endId, summary}` entries,
where ids are either raw message ids (`m0001`) or existing block ids (`b3`).
Non-overlapping ranges are validated (`validateNonOverlapping` in
`lib/compress/range-utils.ts`); overlapping ranges in the same call are rejected
with a per-entry error message.

Message-mode tool args: `{ topic, content: [{ messageId, topic, summary }] }` —
batch of individual message replacements, resolved via `resolveMessages` in
`lib/compress/message-utils.ts`; partial batches are allowed (some messages
resolve, others are reported as skipped issues without failing the whole call).

Both modes share the same pipeline shape (`lib/compress/pipeline.ts`):
`prepareSession` (snapshot raw messages + build search context) →
mode-specific resolution → protected-content appension (§1.3) →
`applyCompressionState` (§1.2/1.4) → `finalizeSession` (persist + notify).

**v2 decision needed:** whether to ship range mode only first (it is the
default and by far the more mature path in DCP) and treat message mode as a
stretch goal, given DCP itself still labels it experimental.

### 1.2 Nested block summaries (bN placeholders, layered compression)

Every compression creates a numbered "block" (`allocateBlockId` in
`lib/compress/state.ts`), not just a text replacement. Blocks form a DAG:
when a new range overlaps a block already produced by an earlier compression,
the model can reference it by placeholder `(bN)` or `{block_N}` in its new
summary, and DCP expands that placeholder with the *prior* summary's body
before wrapping the new one (`injectBlockPlaceholders`,
`appendMissingBlockSummaries` in `lib/compress/range-utils.ts`). If the model's
summary text omits a placeholder for a block that structurally falls inside
its own new range, DCP force-appends that older summary under a
"previously compressed summaries" heading so information is never silently
dropped even if the model forgets to reference it
(`validateSummaryPlaceholders` + `appendMissingBlockSummaries`).

Mechanically: a compression call always **consumes** (deactivates) the blocks
it nests and records `parentBlockIds` / `consumedBlockIds` /
`includedBlockIds` (`applyCompressionState` in `lib/compress/state.ts`), so the
active block set stays a flat, non-overlapping cover of the conversation even
though the underlying DAG is deep. This is the core anti-dilution mechanism:
each layer's stored `summary` field contains the *actual expanded text* of
everything it nests (not just a reference), while the *DAG* is kept for
`/dcp decompress` / `/dcp recompress` bookkeeping and for detecting "you're
inside an already-decompressed block" states.

Each stored summary is wrapped with a fixed header/footer
(`wrapCompressedSummary` in `lib/compress/state.ts`):
`[Compressed conversation section]\n<body>\n\n<dcp-message-id>bN</dcp-message-id>`.

### 1.3 Protected content appended into summaries

Before a summary is finalized, four independent protection passes may append
verbatim content, in this order (see `range.ts` / `message.ts`):

1. **`protectUserMessages`** (`appendProtectedUserMessages` in
   `lib/compress/protected-content.ts`) — appends the raw text of any user
   message inside the compressed range, verbatim, under a
   "sent in this conversation verbatim" heading. Off by default; documented
   footgun (large pasted logs never compress).
2. **`protectTags`** (`appendProtectedPromptInfo` /
   `extractProtectedPromptInfo`) — scans user message text for
   `<protect>...</protect>` spans and appends their contents verbatim,
   independent of `protectUserMessages`.
3. **`compress.protectedTools`** (`appendProtectedTools`) — for any tool call
   in range whose name matches the protected-tools list (or whose
   `filePath`-shaped argument matches `protectedFilePatterns`), appends the
   tool's completed output verbatim under a "protected tools" heading.
   Defaults to `task`, `skill`, `todowrite`, `todoread` for
   `compress.protectedTools` specifically (a *narrower* default list than the
   always-protected-from-pruning list below).
4. **Sub-agent expansion**: if `experimental.allowSubAgents` is on and a
   protected `task` tool call is a sub-agent invocation, DCP fetches the
   sub-agent's own session transcript and merges a synthesized result into the
   appended output (`buildSubagentResultText`, `mergeSubagentResult` in
   `lib/subagents/subagent-results.ts`), cached per `callID`
   (`state.subAgentResultCache`) so repeat compressions don't refetch.

Separately, a **global always-protected-from-compression/pruning** tool list
applies regardless of the above (i.e., these tools' content is never removed
by *any* DCP mechanism, not just kept-in-summary):
`task`, `skill`, `todowrite`, `todoread`, `compress`, `batch`, `plan_enter`,
`plan_exit`, `write`, `edit` (README "Protected Tools" section). The
`commands.protectedTools` and `strategies.*.protectedTools` config arrays are
*additive* to this fixed list, not replacements.

`protectedFilePatterns` (glob, matched against a tool's `filePath`-shaped
parameter via `getFilePathsFromParameters` / `isFilePathProtected` in
`lib/protected-patterns.ts`) protects file-touching tool outputs regardless of
tool name — e.g. `**/*.env` stays out of compression even via a generic `read`
call.

### 1.4 Dedup + error purge recalculated on compress

DCP's own automatic strategies (`lib/strategies/deduplication.ts`,
`lib/strategies/purge-errors.ts`) are re-evaluated every time `compress` runs
(not just on a timer/every context build), because a compression changes which
tool calls are "active" and therefore which duplicates/errors are still live.
This is the DCP analogue of v1's `runDynamicContextPruningPipeline` being
re-run on every `context` event — the parity point for v2 is that agentic
compression must trigger the same recomputation pass immediately, so a
`compress` call and the automatic strategies never disagree about what's
currently pruned in the same context build.

### 1.5 Nudges

DCP's core lever for making the model *actually* call `compress` autonomously.
Config lives under `compress.*` (`lib/config.ts`):

| Setting | Meaning | Default |
|---|---|---|
| `maxContextLimit` | absolute tokens or `"X%"` of model window; above this, strong nudges fire on every Nth call (`nudgeFrequency`) | `100000` |
| `minContextLimit` | absolute or `"X%"`; below this, turn/iteration nudges are off entirely; at/above it they're eligible | `50000` |
| `modelMaxLimits` / `modelMinLimits` | per `providerID/modelID` override of the above two, absolute or `%`; wins over the global value when present | none |
| `nudgeFrequency` | 1 = nudge every LLM call while over `maxContextLimit`, 5 = every 5th | `5` |
| `iterationNudgeThreshold` | after this many messages since the last user message (mid-agent-loop, no new user turn), start iteration nudges | `15` |
| `nudgeForce` | `"soft"` (nudge injected as assistant-authored context) vs `"strong"` (nudge injected as if from the user) — controls how hard to push compression after a user message | `"soft"` |

Three distinct nudge kinds exist (`lib/prompts/context-limit-nudge.ts`,
`turn-nudge.ts`, `iteration-nudge.ts`, orchestrated from
`lib/messages/inject/inject.ts::injectCompressNudges`):

- **context-limit nudge**: fires while `overMaxLimit`, anchored (not repeated
  every single call — `addAnchor` dedupes by nudge interval) to the last
  non-ignored message.
- **turn nudge**: fires once per user-turn boundary while `overMinLimit`, at
  both the last user message and the last assistant message before it.
- **iteration nudge**: fires when mid-loop (no new user message yet) and
  `messagesSinceUser >= iterationNudgeThreshold`, while `overMinLimit`.

All three are suppressed while `state.manualMode` is truthy, and are cleared
entirely once the model just called `compress` (`messageHasCompress`) — DCP
resets its nudge anchor state after every compression so it doesn't
double-nudge for content that was just handled.

`compress.summaryBuffer`: when true, tokens already spent on *active* summary
blocks extend the effective `maxContextLimit` for nudge purposes (a session
that has already compressed aggressively gets more headroom before nudging
again), rather than being counted against the same fixed ceiling as raw
content.

### 1.6 Manual mode

`manualMode.enabled: true` disables all autonomous nudging (the model is
never told or nudged to call `compress`); the tool is only invoked via the
`/dcp compress` slash command, which pre-fills a compression request into the
next turn (`handleManualTriggerCommand` in `lib/commands/`, wired through
`pendingManualTrigger` + `applyPendingManualTrigger` in `lib/hooks.ts`).
`manualMode.automaticStrategies: true` (default true even in manual mode)
keeps deduplication/error-purge running regardless — manual mode only turns
off the *agentic* compression tool's autonomy, not the mechanical strategies.
This is functionally identical in spirit to v1's existing `gate.mode` /
`enabled` toggles, just scoped to the agentic layer only.

### 1.7 Command surface (`/dcp ...`)

All subcommands are dispatched from a single registered command plus one
convenience alias (`lib/hooks.ts::createCommandExecuteHandler`,
`lib/commands/help.ts`):

| Subcommand | Behavior |
|---|---|
| `/dcp` (no args) | Opens TUI panel: context usage, stats, manual-mode toggle |
| `/dcp panel` | Same panel, explicit |
| `/dcp context` | `handleContextCommand` — current effective vs raw context size |
| `/dcp stats` | `handleStatsCommand` — cumulative tokens saved per strategy |
| `/dcp sweep` | `handleSweepCommand` — manually trigger dedup/error-purge/etc. immediately, independent of compress |
| `/dcp manual [on\|off]` | `handleManualToggleCommand` — toggle `manualMode.enabled` at runtime |
| `/dcp compress [focus]` | Pre-fills a compress-tool request into the next turn (`handleManualTriggerCommand`); optional focus text steers what gets compressed |
| `/dcp decompress [n]` | See below |
| `/dcp recompress [n]` | See below |
| `/dcp-compress [focus]` | Alias for `/dcp compress [focus]` as a standalone slash command |

**`/dcp decompress <n>` semantics** (source-dove into `lib/commands/decompress.ts`
because the README doesn't spell this out): it does **not** delete or discard
the compression. It flips `block.active = false` on the target block (and marks
`block.deactivatedByUser = true`, distinct from the flag used when a block is
deactivated by being consumed into a newer block), then re-runs
`syncCompressionBlocks` so the *original raw messages* that block covered are
active again on the next context build. Restoring a block whose ancestor block
is itself still active is rejected with a pointer to decompress the ancestor
first (a block nested inside another active compression cannot be restored in
isolation). `/dcp decompress` (no arg) lists currently-active compressions
with topic + token size so the user can pick a target. Restoring recomputes
`activeByAnchorMessageId` and reverses `stats.totalPruneTokens` by the
restored token count.

**`/dcp recompress <n>` semantics** (`lib/commands/recompress.ts`): the
inverse — re-activates a block the user had previously decompressed
(`deactivatedByUser === true`), i.e. clears `deactivatedByUser` /
`deactivatedAt` and re-syncs. It only lists/accepts targets that (a) were
user-decompressed (not just "any inactive block" — blocks superseded by a
newer compression aren't recompress targets) and (b) whose origin
`compressMessageId` is still present in the session (if the message that
issued the original `compress` call was itself removed/branched away, the
block can no longer be re-applied and the command reports that explicitly).
Re-applying re-adds the restored token delta back into `stats.totalPruneTokens`.

Net effect: decompress/recompress is a **user-controlled override of the
active/inactive bit on an existing block**, not a re-run of compression or a
history edit — the block and its summary text are permanent once created;
only whether it's *currently substituted in* toggles.

### 1.8 Prompt-override system

Six prompts are individually overridable (`system`, `compress-range`,
`compress-message`, `context-limit-nudge`, `turn-nudge`, `iteration-nudge`),
gated behind `experimental.customPrompts` (off by default). When enabled, DCP
writes read-only "managed defaults" to
`~/.config/opencode/dcp-prompts/defaults/` and looks for same-named override
files in a separate overrides directory; deleting an override file resets to
default. `PromptStore` (`lib/prompts/store.ts`) handles reload-on-change so
edits take effect without a restart, and runtime prompt building always starts
from either the override or the packaged default plus a fixed
format-instructions suffix appended in code (`RANGE_FORMAT_EXTENSION` /
`MESSAGE_FORMAT_EXTENSION` in `lib/prompts/extensions/tool.ts`) that is *not*
user-overridable, so the tool-call contract itself can't be broken by a bad
override.

### 1.9 Prune notifications

`pruneNotification`: `"off" | "minimal" | "detailed"` controls how much detail
is shown when a compression (or automatic strategy) fires.
`pruneNotificationType`: `"chat"` (an in-conversation system-style message) vs
`"toast"` (host UI toast, no conversation entry). `compress.showCompression`
additionally controls whether the actual summary text is echoed into the
notification (useful for auditing what the model chose to compress away,
directly relevant to §3's prompt-injection concern).

### 1.10 Sub-agent handling

`experimental.allowSubAgents` (default `false`) gates two independent things:
(a) whether DCP's own hooks (system prompt injection, chat transform,
pruning, nudging) run at all inside a sub-agent's session — when false, DCP
fully no-ops for `state.isSubAgent` sessions (`createSystemPromptHandler`,
`createChatMessageTransformHandler` early-return checks in `lib/hooks.ts`);
and (b) whether a parent session's `task` tool-call summaries are enriched
with the sub-agent's own transcript when protected-tools appension runs
(§1.3). DCP also hard-skips its own system-prompt injection for
Opencode-internal utility agents (title generation, thread/session
summarization) via a signature-string allowlist
(`INTERNAL_AGENT_SIGNATURES` in `lib/hooks.ts`) so DCP's prompt never leaks
into unrelated internal LLM calls.

### 1.11 Turn protection

`turnProtection.enabled` + `turnProtection.turns` (default off, 4 turns):
protects a tool call's *output* from the mechanical purge-errors/dedup
strategies for N turns after it was made, tracked via a per-call turn counter
in `state/tool-cache.ts`. This is orthogonal to compress — it only delays the
*automatic* strategies, giving the model a grace window to reference a
just-made tool result before it can be purged, independent of whether
compression is in play at all.

### 1.12 Cache-impact expectations

DCP's README states empirically observed cache hit rates of **~85% with DCP
enabled vs ~90% without**, attributed to prompt caches being strict
prefix-matched — any prune/compress changes the message stream from that
point forward, busting the cached prefix tail once. DCP's framing: no impact
for request-based billing (e.g. GitHub Copilot) or uniform cached/uncached
pricing (e.g. Cerebras); worthwhile trade for reduced token volume and
reduced stale-context hallucination in long sessions. v1's
`evaluateNetBenefitGate` / `computeCacheCostModel` already models this
trade-off quantitatively rather than accepting it qualitatively — v2's
agentic compression must feed into (or be judged by) the same gate rather
than bypassing it, see §4.

---

## 2. Pi primitive mapping

Goal: for each DCP feature above, name the Pi extension primitive(s) it maps
to, and flag whether v1's existing seams extend naturally or whether v2 needs
genuinely new machinery.

| DCP feature | Pi primitive(s) | v1 seam? |
|---|---|---|
| Compress tool (range/message) | `pi.registerTool()` — new tool definition(s); tool `execute` reads/writes v2's own block store, not `event.messages` directly | **New.** v1 has no `registerTool` usage; needs a new tool module. |
| Applying a compression to what the LLM sees | `pi.on("context", ...)` returning `{ messages }` | **Extends.** Same hook v1 already uses in `runDynamicContextPruningPipeline`; v2 adds a compression-application pass alongside v1's strategies in the same pipeline call, sharing one recompute per `context` event (parity with §1.4). |
| Persisting a compression decision (block created/deactivated) | `pi.appendEntry(customType, data)` — custom session entries | **Extends.** Same mechanism as v1's `DECISION_ENTRY_TYPE` / `STATS_ENTRY_TYPE` / `RESTORE_ENTRY_TYPE`; v2 adds new entry types (e.g. `BLOCK_ENTRY_TYPE`) rebuilt from branch entries the same way `resolvePruneTombstoneState` rebuilds v1's decision state on `session_start` / `session_tree`. |
| Block DAG (parents/children, active bit) | In-memory state rebuilt from `appendEntry` history, same pattern as v1's `persistedDecisions` / `lastDecisionByKey` maps rebuilt in `rebuildState(ctx)` | **New machinery, familiar pattern.** No block store exists in v1; v1's tombstone-rebuild pattern (fold entries into current state on session start/tree) is the template to reuse, not a novel one. |
| `bN` placeholder resolution / ref assignment | Needs a stable "block ref ↔ block id" mapping, analogous to v1's idempotency-key correlation but keyed by block id instead of tool-call id | **New.** v1 correlates decisions to tool calls (`ProposedPrune.correlation`); v2 needs an equivalent correlation from a model-authored placeholder string to a specific stored block, validated the same defensive way DCP does (`validateSummaryPlaceholders`). |
| Summary injection into the message stream | **Must not** mutate an existing signed assistant/tool message. Inject as a *new* synthetic message in the `context` handler's returned `messages` array (Pi allows returning a modified/filtered array from `context`), analogous to DCP's `createSyntheticUserMessage` — never edit `content` blocks of a message the harness will re-send with a stale signature. | **New**, and this is the highest-risk seam — see §3. |
| Protected content appension (§1.3) | Pure functions over the same `event.messages` shape v1 already reads in the `context` handler; tool defaults reuse v1's existing `isProtectedToolName` / `isProtectedPath` helpers, config-extended | **Extends directly.** `isProtectedToolName`, `isProtectedPath`, `collectArgStringValues` in `../index.ts` are mode-agnostic already; v2 just needs to call them from the compress-tool's summary-assembly step too. |
| Dedup / error-purge recompute on compress | Re-run `STRATEGIES` (v1's `dedupeStrategy`, `errorPurgeStrategy`) inside the same pipeline call that applies a new compression, before returning from `context` | **Extends directly.** `runDynamicContextPruningPipeline` already re-evaluates `STRATEGIES` every `context` call; v2 just needs compression-state changes to flow into the *same* call rather than a separate one. |
| Nudges (context-limit / turn / iteration) | `ctx.getContextUsage()` for current usage against `minContextLimit`/`maxContextLimit`; nudge text injected via `pi.on("context")`'s returned messages (append/replace a synthetic user or assistant-role message) or via `pi.on("before_agent_start")` returning `{ message: {...} }` for a persistent injected message | **New logic, existing primitives.** `ctx.getContextUsage()` is already read in v1's `/context-pruning status` handler; nudges need new anchor-tracking state (mirroring `state.nudges.*` in DCP) plus a decision about `context`-time (ephemeral, re-evaluated each call) vs `before_agent_start`-time (persistent, stored in session) injection — recommend `context`-time since nudges must stop firing the instant the model just compressed, and `context` messages are non-persistent/recomputed every call by construction. |
| Manual mode | Existing v1 `GateMode`/config plumbing (`config.gate.mode`, `applyContextPruningConfigMutation`) extended with a `manualMode` field; `/context-pruning manual` mirrors `/dcp manual` | **Extends directly.** v1 already has an on/off/always-apply gate mode and a `/context-pruning` mutation command; add a sibling flag rather than new config machinery. |
| `/dcp` command surface | `pi.registerCommand("context-pruning", ...)` subcommand dispatch, same shape as v1's existing `parseContextPruningArgs` / `applyContextPruningConfigMutation`; `/dcp compress` maps to a manual-trigger flow analogous to v1's manual `/prune` picker persisting via `persistManualPrune` | **Extends directly** for status/stats/manual/sweep-equivalents; **new** for compress/decompress/recompress since those need the block store. |
| decompress / recompress | Toggle `active` bit on a stored block entry (`appendEntry` a small "block state changed" record) + trigger the same `context`-event recompute path | **New**, but same shape as v1's existing prune/restore tombstone pattern (`RESTORE_ENTRY_TYPE`) — decompress is structurally "restore" for a block instead of a pruned tool result. |
| Prompt overrides | Not a Pi-native concept; would need a new extension-owned config surface (e.g. read override files relative to the extension's config dir) layered under `before_agent_start`'s system-prompt chaining, or exposed only as in-repo prompt constants initially | **New**, and lower priority — Pi has no first-class "editable prompt directory" primitive; simplest v2 slice may just hardcode good prompts and defer overridability. |
| Prune notifications (chat/toast) | `ctx.ui` / whatever notification primitive v1's `notify(ctx, ...)` helper already wraps in `../index.ts`; "toast vs chat" maps to Pi's UI notification severity/channel options if the host supports non-conversation-entry toasts (needs discovery), else always "chat"-equivalent | **Mostly extends.** v1's `notify()` helper is the toast-equivalent seam already; needs verifying whether Pi's coding-agent host distinguishes an ephemeral toast channel from an appended visible message. |
| Sub-agent handling | `ctx` fields exposed to extensions for detecting a sub-agent-spawned session (needs confirming exact `ExtensionContext` field/event — out of scope to guess here); `session_start`'s `reason` and any sub-agent flag | **Needs a repo-scout/API confirmation ticket before v2 work starts** — v1 does not currently branch on sub-agent-ness at all. |
| Turn protection | New per-tool-call turn counter, same computation style as v1's `computeTurnsElapsedSince` (`../index.ts`) already used for error-purge staging | **Extends directly.** The counting primitive already exists in v1 for a different strategy; turn protection reuses the same counting, just as a *protection* predicate rather than a *trigger* predicate. |
| `session_before_compact` interplay | `pi.on("session_before_compact", ...)` — v2 must decide whether an active DCP compression block should count toward Pi's own compaction token estimate, and whether compaction firing should first defer to/trigger DCP's compress tool instead of (or before) Pi's native summarization | **New, and needs an explicit product decision**, not just plumbing: if v2 ships, does agentic compress *replace* Pi's native auto-compaction for this extension's user base, sit alongside it, or does DCP-style compression only apply *before* Pi's own overflow-threshold logic ever triggers? This determines whether `session_before_compact` needs a `cancel: true` path at all. |

---

## 3. Oracle-review hardening prerequisites

These are non-negotiable correctness/safety properties v2 must satisfy *before*
any agentic (model-triggered) compression ships, because agentic compression
means model-authored text is being spliced into a conversation that gets
re-serialized to multiple LLM provider APIs on every subsequent call.

### 3.1 Never mutate signed assistant/thinking blocks

Pi's message content blocks carry provider-issued signatures required for
correct multi-turn replay:

- `textSignature` — round-trips OpenAI Responses reasoning-item id/phase
  metadata and other providers' text-signing needs
  (`packages/ai/src/types.ts:325`).
- `thinkingSignature` — carries the provider's opaque/encrypted thinking-block
  signature (Anthropic extended thinking, OpenAI Responses reasoning item id;
  `packages/ai/src/types.ts:331`, produced/consumed in
  `packages/ai/src/api/anthropic-messages.ts`,
  `packages/ai/src/api/openai-responses-shared.ts`,
  `packages/ai/src/api/openai-completions.ts`,
  `packages/ai/src/api/bedrock-converse-stream.ts`).
- `thoughtSignature` — Google's opaque signature for reusing thought context,
  can appear on *any* part type, not just thinking parts
  (`packages/ai/src/types.ts:349`, `packages/ai/src/api/google-shared.ts`).

**Rule for v2:** compression must never edit the `content` array of an
existing assistant message that carries any of these three fields. DCP's own
approach validates this by construction — `filterCompressedRanges` in
`lib/messages/prune.ts` never edits an in-place message's parts to inject a
summary; it **removes** covered messages from the array outright and injects
a **brand-new synthetic message** (`createSyntheticUserMessage`) as a
replacement carrying only plain text, seeded off the *last user message's*
metadata, not off any assistant/thinking-bearing message. v2 must follow the
same shape: summaries are synthesized as new, unsigned, plain-text messages
in the array `context` returns, never a signature-bearing message edited in
place. Any Pi-side test suite for this should specifically assert that a
message with a non-empty `textSignature`/`thinkingSignature`/`thoughtSignature`
that survives into the post-compression array is byte-identical to its
pre-compression form.

### 3.2 Sidecar refs / unsigned-text-only injection

Corollary of 3.1: block placeholders (`bN`) and nudge text must live only in
plain-text (unsigned) message parts — new synthetic `text` parts appended to
a *new* message, or to a message that legitimately has no signature fields
(e.g. a tool-result message, or a fresh user-role message). v1's existing
`injectMessageIds` equivalent in DCP (`lib/messages/inject/inject.ts`) already
does this correctly: it appends id/priority tags into existing *user* message
text parts (which never carry provider signatures) or synthesizes a new text
part, and separately handles assistant messages by appending only into
existing text parts / prepending a synthetic part before tool parts — never
touching thinking/tool-call blocks. v2 must audit every injection point
against this rule, not just the summary-replacement path.

### 3.3 Provider-serialization tests across OpenAI/Anthropic/Google-style APIs

Because compression changes message shape/count, and because the three
signature fields above are provider-specific and mutually exclusive in
practice, v2 needs round-trip serialization tests that build a session with a
compressed block adjacent to signed assistant/thinking content and verify
each of the OpenAI Completions, OpenAI Responses, Anthropic Messages, and
Google-style serializers (`packages/ai/src/api/*.ts` in the Pi checkout)
produce a valid payload with the signature fields of *surviving* messages
untouched. This is the direct mitigation for the failure mode DCP does not
have to worry about as much (OpenCode plugins target a narrower provider
surface); Pi's multi-provider `packages/ai` layer makes this a first-class v2
requirement, not a nice-to-have.

### 3.4 Stable message refs, minimal cache churn

v2's block-ref system (bN) must produce **stable** ids across repeated
`context` calls for content that hasn't changed — i.e. re-running the
pipeline on the same underlying session state should never renumber existing
blocks, only allocate new ones for new compressions (mirroring DCP's
monotonic `nextBlockId`/`nextRunId` counters in `lib/compress/state.ts`).
Unstable refs would both break the model's ability to reference existing
blocks in a later `compress` call and needlessly bust prompt caches beyond
what compression already costs (§1.12/§4). This is directly testable: given
an unchanged prior block set and one new compression, assert only the new
block ids differ from the prior context-build's block set.

### 3.5 Own effective post-prune token estimator for nudges

Nudge thresholds (`minContextLimit`/`maxContextLimit`) must be evaluated
against v2's own **post-prune/post-compression** effective token estimate,
not Pi's raw pre-extension context size — otherwise nudges will systematically
overfire (never seeing the savings already achieved) or underfire (if
`ctx.getContextUsage()` already reflects extension changes, double-counting
`summaryBuffer`-style headroom). v1 already has the building block:
`estimateTokensForText` / `computeContextSizeSnapshot` in `../index.ts`
compute an effective vs raw context snapshot; v2's nudge threshold check must
be evaluated against that snapshot, not a naive re-ask of
`ctx.getContextUsage()`, exactly as DCP's `isContextOverLimits`
(`lib/messages/inject/utils.ts`) computes off its own reconstructed context
size rather than trusting a host-reported number blindly.

### 3.6 Prompt-injection audit surface for model-authored summaries

A `compress` tool call lets the *model* write arbitrary text that later gets
re-presented to the model (and possibly to the user, depending on
`pruneNotification`) as trusted "prior conversation" content. This is a
plausible prompt-injection vector if the summarized span itself contained
adversarial/untrusted content (e.g. fetched web/tool output) that steers the
model's own summary text. v2 must ship with:
- `compress.showCompression`-equivalent notification always available (§1.9)
  so a human can audit what got written into a summary, even if off by
  default for noise reasons.
- The synthetic summary message clearly marked as a compression artifact
  (DCP's fixed `[Compressed conversation section]` header / `<dcp-message-id>`
  footer plays this role — never freeform, so it can't be spoofed by a
  user or a tool result that happens to contain look-alike text elsewhere in
  the session) — v2 should keep an equally fixed, non-user-overridable
  wrapper format.
- No path where a `compress`-authored summary can alter session *configuration*
  or trigger *other* tool calls merely by being replayed as context (v1
  already treats all tool-result content as inert data, not instructions;
  v2 must not regress that by, e.g., interpreting placeholder syntax found in
  untrusted tool output as a legitimate `bN` reference — `validateSummaryPlaceholders`
  in DCP only trusts placeholders that come from the compress tool call's own
  `summary` argument, never from arbitrary message content, and v2 must keep
  that boundary equally strict).

---

## 4. Benchmark decision gate

v2 (agentic compression, nudges, manual mode, the full command surface) is
**only** authorized to proceed once `pe-e9pv` benchmark evidence, run against
a representative corpus of real sessions, shows a *favorable* realized net
benefit at a viable recommended threshold. Concrete go/no-go bar:

**Go conditions (all required):**
1. `sweepThreshold`'s recommended `T` yields `totalAtRecommended` (summed
   realized net benefit across all gated-accepted candidates) that is
   **> 0** and not a rounding artifact of a handful of candidates — i.e. a
   meaningfully positive aggregate, not a marginal win driven by one outlier
   session.
2. **Sufficient candidate volume**: enough gate-eligible candidates across
   enough distinct sessions that the sign of (1) isn't noise from a small
   sample. As a floor, this needs materially more than the ~19
   candidates/32 sessions observed in the first real-corpus run below —
   that run was gate-rejecting *everything*, which by construction contributes
   zero evidence either way about realized benefit at threshold-crossing
   candidates.
3. **p90 remaining-calls is high enough to amortize a compression summary's
   own token cost.** A compression only pays off if there are enough
   subsequent LLM calls left in the session to recoup the summary's fixed
   token overhead (writing + re-sending the summary itself is not free) —
   if the p90 of "calls remaining after a candidate prune point" is small
   (as observed below), agentic compression is structurally unlikely to
   amortize regardless of threshold tuning, and pursuing v2 would be
   premature.
4. Provider-serialization hardening from §3.3 is a *design* prerequisite for
   starting v2 implementation, not a benchmark gate — but its absence is a
   no-go on its own regardless of favorable benchmark numbers, since it's a
   correctness requirement, not an optimization.

**No-go / defer conditions:** benchmark shows near-zero or negative realized
net benefit at every viable threshold, or candidate volume/p90 remaining-calls
stay too low across a broader corpus to plausibly amortize summary overhead —
in that world, v1's mechanical strategies plus a better-tuned gate threshold
(`pe-s2ho`) are the right stopping point, and v2 should not be built.

### 4.1 Current baseline (first real-corpus run, recorded here for continuity)

The first `pe-e9pv` run against real local session files produced:

- **19 gate-eligible candidates across 32 sessions** — i.e. most sessions in
  this corpus produced zero prunable candidates at all under v1's strategies.
- **All 19 candidates were gate-rejected** at the (still-provisional) default
  break-even threshold in place at the time.
- **Remaining-calls-after-position distribution: p50 = 1, p90 = 5** — i.e. for
  half of candidates there was only one more LLM call left in the session
  after the candidate prune point, and even at the 90th percentile there were
  only five more calls to amortize savings over.
- **Recommended threshold from the sweep: T = 1** — the most conservative
  possible break-even bound, driven directly by the thin remaining-calls
  runway above.

Explicit caveats on this baseline (do not treat it as a final no-go signal by
itself):
- **Short-session skew**: this corpus skews toward short sessions relative to
  the long-running-agent-loop scenario DCP is designed for; p50=1/p90=5
  remaining calls is a symptom of session *length*, not necessarily of
  pruning's intrinsic value in longer sessions.
- **Subagent-heavy workflow offloads tool calls**: a meaningful share of the
  underlying work in this corpus is delegated to sub-agent sessions (separate
  session files, each individually short), which structurally reduces the
  main session's own candidate volume and remaining-call runway — the
  corpus is not necessarily representative of a single long-lived
  non-delegating session, which is the scenario where DCP-style compression is
  most likely to pay off.

**Action implied by this baseline alone:** re-run `pe-e9pv` against a broader
and/or longer-session corpus (ideally including non-subagent-heavy, long
single-thread sessions) before treating "no realized benefit yet" as a
verdict on v2. The baseline above is evidence *against* rushing v2, not
evidence that v2 is definitively not worth building.
