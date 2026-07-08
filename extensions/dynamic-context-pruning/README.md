# dynamic-context-pruning

A pi extension that automatically prunes stale, duplicate, and superseded tool-call
content from long-running sessions, gated by a cache-aware net-benefit calculation
so pruning only happens when it's actually worth the prompt-cache cost. Includes a
manual `/prune` picker and a `/context-pruning` status/control command.

This is v1: deterministic, non-agentic strategies only (no model-invoked
compression, no summarization). See [Roadmap](#roadmap) for what a v2 would add
and why it hasn't been built yet.

## Design

- **Non-destructive.** Nothing is ever deleted from the session file. A prune
  replaces a tool result's content (or a tool call's input arguments) with a
  short placeholder string; the original message stays in the transcript and can
  always be restored.
- **Branch-aware.** Prune decisions and restores are persisted as custom session
  entries (`dynamic-context-pruning:decision`, `dynamic-context-pruning:stats`,
  `dynamic-context-pruning:restore`) appended via `pi.appendEntry`. On
  `session_start` and `session_tree`, the extension folds the current branch's
  entries back into in-memory state, so forking/switching branches correctly
  recomputes which decisions are active for that branch.
- **Tombstone-based restore.** Restoring a pruned result doesn't delete the
  original decision entry — it appends a restore entry for that decision's
  idempotency key. The most recent entry (by chronological order) for a given
  key wins when replaying history, so a decision can be pruned, restored, and
  re-pruned any number of times.
- **Recomputed every call, not on a timer.** All three automatic strategies run
  fresh on every `context` event, over the current message array. Nothing is
  pruned "once and forgotten"; if a tool result would no longer qualify (e.g.
  it's now within the protected recency window), it isn't proposed again, but
  an already-applied, persisted decision still applies until explicitly
  restored.

## Strategies

Three deterministic strategies propose prunes; each can be toggled independently.

### 1. Deduplication (`dedupe`)

If the same tool is called more than once with **canonically identical
arguments**, every occurrence except the newest is proposed for pruning (its
tool result content is replaced with a placeholder pointing at the newest
call).

- Canonicalization: JSON keys are recursively sorted before hashing/comparing
  (`{"b":1,"a":2}` and `{"a":2,"b":1}` are the same key). Tool name comparison
  is case-insensitive.
- Only *completed* tool calls (an assistant `toolCall` block with a matching
  `toolResult` message) are considered; in-flight calls are never touched.
- The **newest** occurrence in a duplicate group is always kept in full.

### 2. Error-input purge (`error-purge`)

Once an errored tool call's *input arguments* are older than a configurable
number of turns, they're proposed for pruning (the call's `arguments` are
replaced, not the error message itself).

- Default: `minTurnsOld = 4` — a call must be **strictly older** than 4 turns
  to qualify (eligible at 5+ turns elapsed, not at exactly 4).
- Only applies to tool calls whose result was `isError: true`.
- Configurable per session via `strategy error-purge on|off` and the
  `strategies.errorPurge.minTurnsOld` config field.

### 3. Superseded file operations (`superseded-file-ops`)

When the same file path is read and/or written more than once, older
`read`/`write`/`edit` tool *outputs* for that path can become stale. This
strategy is deliberately conservative — it only proposes a prune when it can
prove the older output is stale, never on a guess:

1. A **full-file read** (no `offset`/`limit`) is superseded by a **later**
   full-file read of the same normalized path.
2. A **partial read** (has `offset`/`limit`) is *not* superseded by a later
   partial read unless the later read's range fully covers the earlier one.
   If range coverage can't be reliably determined from the arguments (e.g. the
   earlier read has no `limit` — reads to EOF — but the later read is
   bounded), the strategy skips it rather than guessing.
3. **Any** read of a path (full or partial) is superseded once a **later,
   successful** (non-error) write/edit to that path occurs — the old read is
   now known-stale regardless of range comparisons. An errored later
   write/edit does **not** count, since the file may be unchanged.
4. Older write/edit outputs for a path are superseded by a **later,
   successful** write/edit to that same path. An errored later write/edit
   never supersedes.

The newest operation for a given path (by message order) is never
superseded, regardless of kind. Path extraction accepts `path`, `file_path`,
and `filePath` argument names, matched only against pi's built-in
`read`/`write`/`edit` tools; `bash` file writes are out of scope (this
strategy does not parse shell commands).

## Protections

Before any strategy is allowed to propose a prune, several protections apply:

- **Protected tool names** (case-insensitive, never pruned): `todo`, `task`,
  `subagent`, `agent`, `skill`, `oracle`, `librarian`, `contrarian`,
  `code_reviewer`, `gnosis`, `triage_comments`.
- **Protected path globs** (never pruned if any string argument matches):
  `**/.env`, `**/.env.*`, `**/*.pem`, `**/*.key`, `**/id_rsa*`,
  `**/id_ed25519*`, `**/secrets/**`, `**/*.p12`, `**/*.pfx`.
- **Recency window**: the most recent `recentTurns` conversational turns
  (default `4`) are never touched by any automatic strategy, regardless of
  what they contain.

All three lists/values are configurable (see [Configuration](#configuration)).

## Savings accounting and the net-benefit gate

Every applied decision's estimated token savings are folded into cumulative,
per-strategy stats (`/context-pruning stats`), persisted as
`dynamic-context-pruning:stats` session entries.

Before a *fresh, automatic* prune proposal is actually applied, it must pass a
**cache-aware net-benefit gate**. The intuition: prompt caches are
prefix-matched, so pruning at message position `p` invalidates ("busts") the
cached prefix from `p` onward, exactly once. That's a one-time cost, offset by
a smaller recurring saving on every subsequent call (fewer tokens sent). The
gate models this as a break-even calculation:

```text
penalty          ≈ (1 - r) * tailTokensAfterEarliestChange
recurringSaving  ≈ r * tokensRemoved
breakEvenCalls   =  penalty / recurringSaving
```

Where `r` is `gate.cachedPriceRatio` — the fraction of full price still paid
for cached tokens (default `0.1`, i.e. cached tokens cost ~10% of fresh
tokens). `breakEvenCalls` is how many subsequent LLM calls are needed to
recoup the one-time cache-bust cost via the recurring saving. The gate accepts
a batch of candidates only if `breakEvenCalls <= gate.breakEvenThreshold`
(default `5`, **explicitly provisional** — see [Roadmap](#roadmap)).

All candidates proposed in the same `context` call share one cache bust (since
a prompt cache is a single linear prefix), so they're evaluated and
accepted/rejected jointly against the earliest position any of them touches.

Manual prunes via `/prune` bypass the gate entirely — you already decided the
result isn't worth keeping, so there's no threshold to check.

Gate modes (`/context-pruning gate <mode>`):

- `on` (default): reject batches above the threshold.
- `off`: bypass the gate entirely; no cost modelling, everything applies.
- `always-apply`: cost is still modelled (for stats/observability) but nothing
  is ever rejected.

## Commands

### `/prune`

Interactive picker (TUI/RPC) over every prunable tool result in the current
branch:

```text
/prune
```

- Lists active, pruned, and previously-restored tool results.
- Selecting an active result shows a cost preview (predicted cache-bust
  penalty vs. recurring saving) before you confirm the prune.
- Selecting a pruned result offers to restore it.
- Outside an interactive UI (no `ctx.hasUI`), prints a read-only report of
  prunable results instead.

### `/context-pruning`

```text
/context-pruning status
/context-pruning stats
/context-pruning on
/context-pruning off
/context-pruning toggle
/context-pruning strategy <dedupe|error-purge|superseded-file-ops> on|off
/context-pruning gate <on|off|always-apply>
```

- `status`: enabled state, gate mode/threshold/ratio, per-strategy on/off
  state, protection counts, last call's raw/effective/saved token snapshot,
  and current context usage.
- `stats`: cumulative tokens saved, overall and per strategy.
- `on` / `off` / `toggle`: enable or disable the extension entirely.
- `strategy <name> on|off`: toggle one strategy independently.
- `gate <mode>`: change the net-benefit gate mode at runtime.

Config changes made via `/context-pruning` are persisted to disk (see
[Configuration](#configuration)) and also applied in-memory immediately, even
if the write fails.

## Configuration

Config is stored at:

```text
<pi agent dir>/extensions/dynamic-context-pruning.json
```

It's read once on `session_start` and rewritten whenever `/context-pruning`
mutates it. A missing or unparseable file falls back to defaults; the file is
never required to exist. Full shape, with defaults:

```json
{
  "enabled": true,
  "protections": {
    "toolNames": ["todo", "task", "subagent", "agent", "skill", "oracle", "librarian", "contrarian", "code_reviewer", "gnosis", "triage_comments"],
    "pathGlobs": ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/id_rsa*", "**/id_ed25519*", "**/secrets/**", "**/*.p12", "**/*.pfx"],
    "recentTurns": 4
  },
  "thresholds": {
    "minCharsSaved": 200
  },
  "strategies": {
    "dedupe": { "enabled": true },
    "errorPurge": { "enabled": true, "minTurnsOld": 4 },
    "supersededFileOps": { "enabled": true }
  },
  "gate": {
    "mode": "on",
    "cachedPriceRatio": 0.1,
    "breakEvenThreshold": 5,
    "breakEvenThresholdByState": { "idle": 5, "mid_loop": 5 }
  }
}
```

Notes:

- `thresholds.minCharsSaved` is reserved for a future minimum-size filter and
  is **not** currently enforced by the pipeline; the net-benefit gate's
  break-even math is what actually decides whether a prune applies.
- `gate.breakEvenThresholdByState` lets `idle` vs `mid_loop` agent states use
  different thresholds; both default to `gate.breakEvenThreshold`. Real
  mid-loop/idle detection isn't wired through yet, so this always evaluates as
  `idle` in v1 — the field exists so the seam is ready once that lands. The
  representative-corpus benchmark (see [Roadmap](#roadmap)) shows `mid_loop`
  candidates carry ~all realized net benefit and `idle` candidates carry ~none
  at r=0.1, which argues for a stricter `idle` default — but since every live
  evaluation runs as `idle` today, defaulting it stricter would silently
  disable most automatic pruning. Both states are intentionally kept at
  parity until real agent-state detection lands; that's a follow-up ticket.
- `gate.breakEvenThreshold`'s default of `22` is calibrated from the
  representative-corpus benchmark at `cachedPriceRatio` r=0.1 (aggressive
  prompt caching, the common case) — see [Roadmap](#roadmap) for the full
  evidence and its ratio-sensitivity caveats. It is **provider/ratio-
  dependent**: the optimal threshold rises as caching gets weaker (T=29 at
  r=0.25, T=54 at r=0.5, T=58 at r=0.9 on the same corpus).

## Prompt-cache trade-off

Pruning trades a smaller stream of tokens sent on every future call against a
one-time cache-bust cost, because prompt caches match on a strict prefix: any
change to the message stream busts the cached prefix from that point onward
for the next call. This is exactly why the net-benefit gate exists rather than
pruning unconditionally — a prune that happens too late in a session (few
calls left to amortize the one-time cost over) or removes too few tokens
relative to the tail it invalidates can cost *more* than it saves. The gate's
break-even math (above) is the mechanism that keeps pruning net-positive on
average rather than accepting the cache trade-off unconditionally.

## Benchmark harness

A standalone, read-only offline benchmark replays real (or fixture) pi
session `.jsonl` files through the extension's exported strategy/pipeline/cost
model helpers — it never writes back to a session file or changes runtime
behavior.

```bash
node extensions/dynamic-context-pruning/scripts/benchmark.mjs [paths...] [options]
```

Options:

- `--limit N`: only process the first N session files found.
- `--ratio R`: cached-price ratio(s) to model; repeatable and/or
  comma-separated (e.g. `--ratio 0.1,0.2`). Default: `0.1`.
- `--json`: emit a full machine-readable JSON dump instead of aligned text.
- `--help`: print usage.

With no positional paths, it defaults to every `*.jsonl` file found
recursively under `~/.pi/agent/sessions`.

> **Corpus choice matters.** `~/.pi/agent/sessions` (the default) tends to be
> dominated by short orchestrator/delegation sessions, which structurally
> under-report candidates and skew the remaining-calls-after-position
> distribution low. The representative-corpus numbers in [Roadmap](#roadmap)
> instead come from `~/.the-last-harness/agent/sessions` — the harness's own
> longer, tool-heavy agent sessions — which is the corpus to point the
> harness at when re-deriving or sanity-checking the gate default.

For every point in a session where an LLM call would have happened
(approximated as immediately before each assistant message), the harness
reports two kinds of numbers:

- **Predicted**: what the strategies would propose right now, and what the
  cache-aware cost model (penalty / recurring saving / break-even calls)
  estimates, without knowing what happens next in the session.
- **Realized**: since replay knows the session's actual future, the harness
  also reports how many subsequent LLM calls actually followed a candidate
  prune point, and the *actual* net benefit that prune would have produced —
  `realizedNetBenefit = actualRemainingCalls * recurringSaving - penalty`.

It also sweeps the break-even threshold `T` from 1 to 30 and reports the `T`
that maximizes total realized net benefit across all gate-eligible
candidates, both overall and split by idle/mid-loop agent state.

## Comparison

- **[opencode-dynamic-context-pruning](https://github.com/sculptdotfun/opencode-dynamic-context-pruning) ("pi-dcp" upstream)**:
  the OpenCode plugin this extension takes its name and general problem space
  from. It ships a model-invoked `compress` tool (agentic, nested-summary
  compression), autonomous nudges, manual mode, and a full `/dcp` command
  surface. This extension's v1 implements none of that agentic layer — only
  the deterministic automatic strategies and cache-aware gate, which is the
  subset OpenCode DCP calls its own automatic dedup/error-purge strategies.
  See [Roadmap](#roadmap) for the full parity gap and what would be needed to
  close it.
- **[context-cap](../context-cap)** / **[context-inspector](../context-inspector)**:
  siblings in this repo that address adjacent but different problems.
  `context-cap` shrinks the *effective* model context window so pi's own
  auto-compaction fires earlier; it doesn't remove or alter any content.
  `context-inspector` is a read-only dashboard that shows where context is
  going; it doesn't modify anything either. `dynamic-context-pruning` is the
  only one of the three that actually removes/replaces content from what gets
  sent to the model.

## Roadmap

[`docs/v2-design.md`](./docs/v2-design.md) is the authoritative v2 design
spec: full OpenCode DCP parity, meaning a model-invoked `compress` tool,
nested block summaries, autonomous nudges, manual mode, and the full `/dcp`-
equivalent command surface (decompress/recompress, prompt overrides,
notifications).

**v2 proceeds only if benchmark evidence supports it.** The design doc's
benchmark decision gate requires a meaningfully positive aggregate realized
net benefit, at sufficient candidate volume, with enough remaining-calls
runway per session to plausibly amortize a compression summary's own token
cost — see `docs/v2-design.md` §4 for the exact go/no-go bar.

The representative-corpus run of the benchmark harness (`pe-c5n9`, over
`~/.the-last-harness/agent/sessions`: 1,390+ session files, 556 gate-eligible
candidates — see the corpus-choice note above) produced:

- **Candidates and tokens removed by strategy**: `dedupe` 111 candidates /
  93,330 tokens removed; `error-purge` 187 / 28,191; `superseded-file-ops`
  258 / 247,474.
- **Remaining-calls-after-position distribution: p50 = 47, p90 = 156** — far
  more amortization runway than the earlier small-corpus run showed, because
  this corpus is dominated by long, tool-heavy agent sessions rather than
  short orchestrator sessions.
- **Hindsight-optimal break-even threshold `T`** (maximizes total *realized*
  net benefit), by cached-price ratio `r`, split overall / mid_loop / idle:

  | ratio `r` | overall `T` (benefit) | mid_loop `T` (benefit) | idle `T` (benefit) |
  | --- | --- | --- | --- |
  | 0.1  | T=22 (~20.6k)  | T=22 (~20.6k)  | T=1 (0 — zero benefit) |
  | 0.25 | T=29 (~1.54M)  | T=29 (~1.54M)  | T=12 (~4.0k) |
  | 0.5  | T=54 (~8.06M)  | T=54 (~8.06M)  | T=27 (~37.2k) |
  | 0.9  | T=58 (~24.7M)  | T=58 (~24.2M)  | T=21 (~459k) |

**Reading**: `mid_loop` candidates carry essentially all of the realized
benefit; `idle` candidates carry essentially none (literally zero at r=0.1).
At r=0.1 (aggressive prompt caching, the common Anthropic case) the total
realized benefit across the whole 1,390-session corpus is only ~20.6k
token-units — economically marginal, on the order of pennies. Savings only
become material at weaker caching, r>=0.25.

**This reframes, rather than weakens, the case for v2.** Small deterministic
removals (dedupe/error-purge/superseded-file-ops) structurally cannot beat
the cache-bust penalty at r=0.1 — there just isn't enough single-message
token volume in them. If pruning is going to matter economically under
aggressive caching, it has to come from *large* removals: agentic range
compression and nested summaries (the v2 `compress` tool), which remove
orders of magnitude more tokens per operation than these deterministic
strategies do. So this evidence argues *for* prototyping v2 (contingent on
summary quality/hardening work), not against it — v1's mechanical strategies
remain useful as a free, always-on baseline, but they were never going to be
where the real savings live.

## Install

### Standalone npm package

```bash
pi install npm:pi-dynamic-context-pruning
```

### Collection package

```bash
pi install npm:@diegopetrucci/pi-extensions
```

### GitHub package

```bash
pi install git:github.com/diegopetrucci/pi-extensions
```

Then reload pi:

```text
/reload
```

## Notes

- This extension's package name is intentionally unscoped (`pi-dynamic-context-pruning`,
  not `@diegopetrucci/pi-dynamic-context-pruning`), a deliberate deviation from
  this repo's usual package-naming convention.
- Token counts throughout (`status`, `stats`, the benchmark harness) are
  estimates from a simple chars/4-style heuristic, not exact provider token
  counts.
