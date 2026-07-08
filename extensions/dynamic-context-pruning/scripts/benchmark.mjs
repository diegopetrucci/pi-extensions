#!/usr/bin/env node
/**
 * dynamic-context-pruning: offline benchmark harness (pe-e9pv).
 *
 * Standalone, READ-ONLY evidence generator for the v2 go/no-go decision.
 * Replays real (or fixture) pi session JSONL files through the extension's
 * exported strategy/pipeline/cost-model helpers, without ever writing back
 * to a session file or changing any runtime extension behavior.
 *
 * For every point in a session's message sequence where an LLM call would
 * have happened (approximated as "immediately before each assistant
 * message"), this script asks: "what would the strategies propose pruning
 * right now, and what would the cache-aware cost model predict?" It then
 * uses the fact that replay knows the actual future of the session to also
 * report REALIZED net benefit: how many subsequent calls actually happened,
 * and what net benefit the prune would really have produced.
 *
 * Usage:
 *   node extensions/dynamic-context-pruning/scripts/benchmark.mjs [paths...] [options]
 *
 * Options:
 *   --limit N       Only process the first N session files found (default: no limit).
 *   --ratio R       Cached-price ratio(s) to model. Repeatable and/or comma-separated
 *                   (e.g. --ratio 0.1,0.2 or --ratio 0.1 --ratio 0.2). Default: 0.1.
 *   --sweep-max N   Explicit ceiling for the auto-expanding break-even threshold sweep
 *                   (overrides the corpus-derived ceiling). Default: auto-expand from 30.
 *   --json          Emit a full machine-readable JSON dump instead of aligned text.
 *   --simulate-compression       Additionally simulate v2-style RANGE compression (pe-ckbd;
 *                                docs/v2-design.md §1/§4 go/no-go evidence) alongside (never
 *                                mixed into) the deterministic results. See "Compression-
 *                                simulation mode" below for the full model.
 *   --sim-summary-fraction F     Summary size as a fraction of range tokens (repeatable/
 *                                comma-separated, e.g. 0.1,0.15,0.3). Default: 0.15.
 *   --sim-summary-min-tokens N   Floor on summary tokens regardless of fraction. Default: 200.
 *   --sim-summarizer-cost-mult M Relative per-token price of the summarizer call vs the main
 *                                model. Default: 1.0 (same per-token price as the main model;
 *                                a deliberate simplification -- ignores latency/availability).
 *   --sim-min-range-tokens N     Minimum contiguous range size to be considered. Default: 2000.
 *   --help          Print this usage text.
 *
 * With no positional paths, defaults to every *.jsonl file found (recursively)
 * under ~/.pi/agent/sessions. Positional args may be individual .jsonl files
 * or directories (searched recursively for *.jsonl).
 *
 * Requires a Node.js version with native TypeScript type-stripping support
 * for `import()` of .ts files (Node >= 22.6 with --experimental-strip-types,
 * or a newer LTS where this is unflagged/default) — the same mechanism this
 * repo's test suite (test dir, *.test.mjs files) already uses to import
 * extensions' index.ts modules directly without a build step.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionIndexPath = path.join(scriptDir, "..", "index.ts");

const dcp = await import(pathToFileURL(extensionIndexPath).href);
const {
	normalizeConfig,
	runDynamicContextPruningPipeline,
	estimateDecisionSavings,
	estimateTailTokens,
	computeCacheCostModel,
	resolveBreakEvenThreshold,
	sessionEntriesToMessages,
	buildToolCallPairIndex,
	computeRecencyBoundaryIndex,
	isProtectedToolName,
	isProtectedPath,
	collectArgStringValues,
} = dcp;

const DEFAULT_SESSIONS_DIR = path.join(os.homedir(), ".pi", "agent", "sessions");
const DEFAULT_RATIOS = [0.1];

// Compression-simulation mode defaults (pe-ckbd). See the "Compression-simulation
// mode" section below for the full model these back.
const DEFAULT_SIM_MIN_RANGE_TOKENS = 2000;
const DEFAULT_SIM_SUMMARY_FRACTIONS = [0.15];
const DEFAULT_SIM_SUMMARY_MIN_TOKENS = 200;
const DEFAULT_SIM_SUMMARIZER_COST_MULT = 1.0;
// Back-compat starting bound: without --sweep-max and without needing expansion, a
// corpus that doesn't push the argmax to the boundary reports identical numbers to
// before this ticket (pe-7oej).
const THRESHOLD_SWEEP_MAX = 30;
// Hard runaway guard for auto-expansion when no --sweep-max is given: even a
// corpus-derived ceiling is clamped to this so a pathological candidate set can't
// make the sweep loop grow unbounded.
const HARD_SWEEP_CEILING = 500;

// ============================================================================
// CLI argument parsing
// ============================================================================

function printUsage() {
	console.log(
		[
			"Usage: node extensions/dynamic-context-pruning/scripts/benchmark.mjs [paths...] [options]",
			"",
			"Options:",
			"  --limit N     Only process the first N session files found.",
			"  --ratio R     Cached-price ratio(s) to model (repeatable/comma-separated). Default: 0.1.",
			"  --sweep-max N Explicit ceiling for the auto-expanding threshold sweep (overrides the",
			"                corpus-derived ceiling). Default: auto-expand from 30 as needed.",
			"  --json        Emit a full machine-readable JSON dump instead of aligned text.",
			"  --simulate-compression       Additionally simulate v2-style range compression (pe-ckbd);",
			"                               see docs/v2-design.md §1/§4. SIMULATED results are reported",
			"                               alongside (never mixed into) the deterministic results.",
			"  --sim-summary-fraction F     Summary size as a fraction of range tokens (repeatable/",
			"                               comma-separated, e.g. 0.1,0.15,0.3). Default: 0.15.",
			"  --sim-summary-min-tokens N   Floor on summary tokens regardless of fraction. Default: 200.",
			"  --sim-summarizer-cost-mult M Relative per-token price of the summarizer call vs the main",
			"                               model (applies to rangeTokens input + summaryTokens output).",
			"                               Default: 1.0 (same per-token price as the main model).",
			"  --sim-min-range-tokens N     Minimum contiguous range size to be considered. Default: 2000.",
			"  --help        Print this usage text.",
			"",
			"With no positional paths, defaults to *.jsonl files under ~/.pi/agent/sessions.",
		].join("\n"),
	);
}

export function parseArgs(argv) {
	const paths = [];
	let limit;
	const ratios = [];
	let json = false;
	let help = false;
	let sweepMax;
	let simulateCompression = false;
	const simSummaryFractions = [];
	let simSummaryMinTokens;
	let simSummarizerCostMult;
	let simMinRangeTokens;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			help = true;
		} else if (arg === "--json") {
			json = true;
		} else if (arg === "--simulate-compression") {
			simulateCompression = true;
		} else if (arg === "--sim-summary-fraction") {
			simSummaryFractions.push(...String(argv[++i]).split(","));
		} else if (arg.startsWith("--sim-summary-fraction=")) {
			simSummaryFractions.push(...arg.slice("--sim-summary-fraction=".length).split(","));
		} else if (arg === "--sim-summary-min-tokens") {
			const value = argv[++i];
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--sim-summary-min-tokens expects a non-negative number, got: ${value}`);
			simSummaryMinTokens = parsed;
		} else if (arg.startsWith("--sim-summary-min-tokens=")) {
			const value = arg.slice("--sim-summary-min-tokens=".length);
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--sim-summary-min-tokens expects a non-negative number, got: ${value}`);
			simSummaryMinTokens = parsed;
		} else if (arg === "--sim-summarizer-cost-mult") {
			const value = argv[++i];
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--sim-summarizer-cost-mult expects a non-negative number, got: ${value}`);
			simSummarizerCostMult = parsed;
		} else if (arg.startsWith("--sim-summarizer-cost-mult=")) {
			const value = arg.slice("--sim-summarizer-cost-mult=".length);
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--sim-summarizer-cost-mult expects a non-negative number, got: ${value}`);
			simSummarizerCostMult = parsed;
		} else if (arg === "--sim-min-range-tokens") {
			const value = argv[++i];
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--sim-min-range-tokens expects a non-negative number, got: ${value}`);
			simMinRangeTokens = parsed;
		} else if (arg.startsWith("--sim-min-range-tokens=")) {
			const value = arg.slice("--sim-min-range-tokens=".length);
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--sim-min-range-tokens expects a non-negative number, got: ${value}`);
			simMinRangeTokens = parsed;
		} else if (arg === "--limit") {
			const value = argv[++i];
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--limit expects a positive number, got: ${value}`);
			limit = Math.floor(parsed);
		} else if (arg.startsWith("--limit=")) {
			const value = arg.slice("--limit=".length);
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--limit expects a positive number, got: ${value}`);
			limit = Math.floor(parsed);
		} else if (arg === "--sweep-max") {
			const value = argv[++i];
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--sweep-max expects a positive number, got: ${value}`);
			sweepMax = Math.floor(parsed);
		} else if (arg.startsWith("--sweep-max=")) {
			const value = arg.slice("--sweep-max=".length);
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--sweep-max expects a positive number, got: ${value}`);
			sweepMax = Math.floor(parsed);
		} else if (arg === "--ratio") {
			ratios.push(...String(argv[++i]).split(","));
		} else if (arg.startsWith("--ratio=")) {
			ratios.push(...arg.slice("--ratio=".length).split(","));
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		} else {
			paths.push(arg);
		}
	}

	const parsedRatios = ratios
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
		.map((value) => Number(value));
	for (const ratio of parsedRatios) {
		if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new Error(`--ratio expects a number in [0,1], got: ${ratio}`);
	}

	const parsedSimSummaryFractions = simSummaryFractions
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
		.map((value) => Number(value));
	for (const fraction of parsedSimSummaryFractions) {
		if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1)
			throw new Error(`--sim-summary-fraction expects a number in (0,1], got: ${fraction}`);
	}

	return {
		paths,
		limit,
		ratios: parsedRatios.length > 0 ? parsedRatios : [...DEFAULT_RATIOS],
		json,
		help,
		sweepMax,
		simulateCompression,
		simSummaryFractions: parsedSimSummaryFractions.length > 0 ? parsedSimSummaryFractions : [...DEFAULT_SIM_SUMMARY_FRACTIONS],
		simSummaryMinTokens,
		simSummarizerCostMult,
		simMinRangeTokens,
	};
}

// ============================================================================
// Session file discovery
// ============================================================================

async function findJsonlFilesRecursive(rootPath) {
	const results = [];
	async function visit(currentPath) {
		let entries;
		try {
			entries = await fs.readdir(currentPath, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const entryPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				await visit(entryPath);
			} else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
				results.push(entryPath);
			}
		}
	}
	await visit(rootPath);
	results.sort();
	return results;
}

export async function resolveSessionFiles(inputPaths) {
	if (inputPaths.length === 0) {
		return findJsonlFilesRecursive(DEFAULT_SESSIONS_DIR);
	}
	const files = [];
	for (const inputPath of inputPaths) {
		const stat = await fs.stat(inputPath).catch(() => undefined);
		if (!stat) {
			console.error(`warning: path does not exist, skipping: ${inputPath}`);
			continue;
		}
		if (stat.isDirectory()) {
			files.push(...(await findJsonlFilesRecursive(inputPath)));
		} else {
			files.push(inputPath);
		}
	}
	return files;
}

// ============================================================================
// Session parsing & active-branch replay (session-format v1-v3)
// ============================================================================

/**
 * Parse a session JSONL file's lines into entries, skipping the header and
 * any unparseable lines (with a stderr warning). Tolerant of v1 (linear,
 * no id/parentId), v2/v3 (tree structure with id/parentId): entries lacking
 * an `id` are treated as already-linear (v1) and kept in file order.
 */
export function parseSessionLines(sessionFile, rawText) {
	const entries = [];
	const lines = rawText.split("\n");
	for (let lineNo = 0; lineNo < lines.length; lineNo++) {
		const line = lines[lineNo].trim();
		if (!line) continue;
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			console.error(`warning: ${sessionFile}:${lineNo + 1}: unparseable JSON line, skipping (${error.message})`);
			continue;
		}
		if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
			console.error(`warning: ${sessionFile}:${lineNo + 1}: entry missing a string "type", skipping`);
			continue;
		}
		if (parsed.type === "session") continue; // header line, not part of the entry tree
		entries.push(parsed);
	}
	return entries;
}

/**
 * Resolve the active branch (leaf path) of a v2/v3 tree-structured session:
 * follow the parentId chain starting from the last entry in the file back to
 * the root, then return it in chronological (root -> leaf) order. Entries
 * without an `id` (v1, already-linear sessions) are returned as-is in file
 * order, since there is no tree to walk.
 */
export function resolveActiveBranch(entries) {
	if (entries.length === 0) return [];
	const hasTreeStructure = entries.every((entry) => typeof entry.id === "string");
	if (!hasTreeStructure) return entries;

	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const path = [];
	const seen = new Set();
	let current = entries[entries.length - 1];
	while (current) {
		if (seen.has(current.id)) break; // guard against malformed cycles
		seen.add(current.id);
		path.push(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	path.reverse();
	return path;
}

// ============================================================================
// Turn/boundary classification
// ============================================================================

/**
 * Classify the agent state at the call boundary immediately before
 * `assistantIndex` (per pe-e9pv NOTES: "mid-loop" = between a user message
 * and the turn's final assistant message; "idle" = at turn end, i.e. this
 * IS the turn's final assistant message).
 */
export function classifyTurnState(messages, assistantIndex) {
	let turnStart = 0;
	for (let i = assistantIndex; i >= 0; i--) {
		if (messages[i].role === "user") {
			turnStart = i;
			break;
		}
	}
	let turnEnd = messages.length;
	for (let i = assistantIndex + 1; i < messages.length; i++) {
		if (messages[i].role === "user") {
			turnEnd = i;
			break;
		}
	}
	let lastAssistantInTurn = assistantIndex;
	for (let i = turnStart; i < turnEnd; i++) {
		if (messages[i].role === "assistant") lastAssistantInTurn = i;
	}
	return assistantIndex === lastAssistantInTurn ? "idle" : "mid_loop";
}

// ============================================================================
// Per-session replay: propose -> cost-model -> realized outcome
// ============================================================================

function percentile(sortedValues, p) {
	if (sortedValues.length === 0) return undefined;
	const index = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length));
	return sortedValues[index];
}

/**
 * Replay one session's messages, boundary by boundary (before each assistant
 * message), running the real strategies+pipeline in dry-run (gate mode
 * "off") with accumulating persisted-decision state so each distinct
 * prune opportunity is recorded exactly once, at the earliest call boundary
 * it first becomes proposable -- mirroring how the pipeline actually
 * accumulates persisted decisions call over call in production.
 *
 * For every freshly-discovered candidate this also computes, per configured
 * price ratio: the predicted cache cost-model (penalty/recurringSaving/
 * breakEvenCalls), whether the real "on" gate (at its default/state
 * threshold) would have accepted it, and -- because replay knows the
 * session's actual future -- the REALIZED outcome: how many LLM calls
 * actually followed, and the realized net benefit that pruning would truly
 * have produced.
 */
export function replaySession(sessionFile, messages, { ratios = DEFAULT_RATIOS, config: configOverride } = {}) {
	// `configOverride` (pe-qdzb) lets callers (e.g. tests isolating a specific
	// strategy/gate behavior on a small fixture) replay against a
	// non-default config, most commonly to zero out `thresholds.minCharsSaved`
	// so a tiny fixture's proposal isn't filtered by the real-world default
	// floor before it can be observed. Real corpus benchmark runs (the CLI
	// entrypoint below) intentionally omit this and use full defaults, so the
	// minCharsSaved floor applies there exactly as it would in production.
	const config = configOverride ?? normalizeConfig(undefined);
	const offConfig = { ...config, gate: { ...config.gate, mode: "off" } };

	const assistantIndices = [];
	messages.forEach((message, index) => {
		if (message.role === "assistant") assistantIndices.push(index);
	});

	const persistedDecisions = [];
	const knownIdempotencyKeys = new Set();
	const candidates = [];

	for (const assistantIndex of assistantIndices) {
		const prefix = messages.slice(0, assistantIndex);
		const turnState = classifyTurnState(messages, assistantIndex);

		const result = runDynamicContextPruningPipeline({
			messages: prefix,
			config: offConfig,
			persistedDecisions,
			knownIdempotencyKeys,
			agentState: turnState,
		});

		for (const decision of result.newlyAppliedDecisions) {
			const estimate = estimateDecisionSavings(prefix, decision);
			if (!estimate || estimate.tokensRemoved <= 0) continue;

			const tailTokensAfterEarliestChange = estimateTailTokens(prefix, estimate.position);
			const actualRemainingCalls = assistantIndices.filter((index) => index >= assistantIndex).length;

			const byRatio = {};
			for (const ratio of ratios) {
				const cost = computeCacheCostModel({
					tailTokensAfterEarliestChange,
					tokensRemoved: estimate.tokensRemoved,
					cachedPriceRatio: ratio,
				});
				const realizedNetBenefit = actualRemainingCalls * cost.recurringSaving - cost.penalty;
				const gateThreshold = resolveBreakEvenThreshold({ ...config.gate, cachedPriceRatio: ratio }, turnState);
				byRatio[ratio] = {
					ratio,
					penalty: cost.penalty,
					recurringSaving: cost.recurringSaving,
					breakEvenCalls: cost.breakEvenCalls,
					gateThreshold,
					gatedAcceptedDefault: cost.breakEvenCalls <= gateThreshold,
					realizedNetBenefit,
				};
			}

			candidates.push({
				sessionFile,
				strategyId: decision.strategyId,
				toolCallId: decision.correlation.type === "toolCallId" ? decision.correlation.toolCallId : undefined,
				reason: decision.reason,
				boundaryMessageIndex: assistantIndex,
				turnState,
				position: estimate.position,
				tokensRemoved: estimate.tokensRemoved,
				tailTokensAfterEarliestChange,
				actualRemainingCalls,
				byRatio,
			});
		}

		persistedDecisions.push(...result.newlyAppliedDecisions);
		for (const decision of result.newlyAppliedDecisions) knownIdempotencyKeys.add(decision.idempotencyKey);
	}

	return { sessionFile, assistantCallCount: assistantIndices.length, candidates };
}

// ============================================================================
// Compression-simulation mode (pe-ckbd): v2 go/no-go evidence WITHOUT
// building v2. Simulates v2-style agentic RANGE compression (docs/v2-design.md
// §1.1: the `compress` tool's range mode -- one or more contiguous message
// spans, each replaced by a single summary) during the same replay pass
// deterministic candidates use, and reports REALIZED net benefit for that
// separate, independent population. This never changes runtime extension
// behavior; it is a read-only estimate layered on top of the same exported
// pure helpers (`computeRecencyBoundaryIndex`, `isProtectedToolName`/
// `isProtectedPath`, `buildToolCallPairIndex`, `estimateTailTokens`,
// `computeCacheCostModel`) the runtime pipeline itself uses.
// ============================================================================

/**
 * Collect the (shallow, depth-limited) string values embedded in a toolCall's
 * arguments for a given pair, mirroring index.ts's internal (unexported)
 * `resolveArgStringsForPair` using only exported building blocks.
 */
function argStringsForPair(messages, pair) {
	if (!pair || pair.assistantIndex === undefined || pair.toolCallBlockIndex === undefined) return [];
	const assistantMessage = messages[pair.assistantIndex];
	const block = Array.isArray(assistantMessage?.content) ? assistantMessage.content[pair.toolCallBlockIndex] : undefined;
	if (!block || block.type !== "toolCall") return [];
	return collectArgStringValues(block.arguments);
}

/**
 * Per-message exclusion flags for range compression: a message is excluded
 * from EVER being part of a simulated range if it (or its paired
 * toolCall/toolResult counterpart) touches a protected tool name or a
 * protected path glob (same protections config/semantics the runtime
 * pipeline enforces via `isProtectedToolName`/`isProtectedPath`).
 *
 * Exclusion is a static property of message content + protections config,
 * independent of which call boundary is replaying (protections/config never
 * change mid-replay) -- so this is computed once per session up front, not
 * recomputed per boundary.
 *
 * Pair integrity: a toolCall's assistant message and its toolResult message
 * are always excluded together ("never split a toolCall/toolResult pair") --
 * if either half is protected, both are marked excluded, conservatively
 * dropping the whole pair from ever joining a range.
 */
export function computeSimulatedRangeExclusions(messages, pairIndex, protections) {
	const excluded = new Array(messages.length).fill(false);

	messages.forEach((message, index) => {
		if (message.role === "toolResult") {
			if (isProtectedToolName(message.toolName, protections)) {
				excluded[index] = true;
				return;
			}
			const pair = pairIndex.get(message.toolCallId);
			if (argStringsForPair(messages, pair).some((value) => isProtectedPath(value, protections))) excluded[index] = true;
			return;
		}
		if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type !== "toolCall") continue;
				if (isProtectedToolName(block.name, protections)) {
					excluded[index] = true;
					break;
				}
				if (collectArgStringValues(block.arguments).some((value) => isProtectedPath(value, protections))) {
					excluded[index] = true;
					break;
				}
			}
		}
	});

	// Pair-integrity fixup: never split a toolCall/toolResult pair across the
	// exclusion boundary -- if either half is excluded, exclude both.
	for (const pair of pairIndex.values()) {
		if (pair.assistantIndex === undefined || pair.resultIndex === undefined) continue;
		if (excluded[pair.assistantIndex] || excluded[pair.resultIndex]) {
			excluded[pair.assistantIndex] = true;
			excluded[pair.resultIndex] = true;
		}
	}

	return excluded;
}

/**
 * Identify plausible v2-style compression RANGES for one session
 * (deliberately conservative, per pe-ckbd): contiguous spans of complete,
 * non-recent, non-protected messages that approximate what v2's `compress`
 * tool (range mode; docs/v2-design.md §1.1) would target.
 *
 * Turn integrity: only messages strictly before `computeRecencyBoundaryIndex`
 * (a turn-start-aligned boundary) are ever considered, so every candidate
 * message belongs to an already-completed turn by construction.
 *
 * Each distinct range is recorded exactly once, at the earliest call
 * boundary where it exists AND already meets the minimum size floor --
 * mirroring how deterministic candidates use `knownIdempotencyKeys` to
 * record each opportunity once, at its earliest boundary. Ranges never
 * overlap: a `consumedEnd` cursor tracks how much of the old region has
 * already been claimed by a previously-recorded range, so a growing old
 * region across boundaries can never double-count a previously-recorded
 * span (or the tokens inside it) in a later, larger range.
 *
 * A contiguous run that is bounded on its right by an excluded (protected)
 * message can never grow further, so if it doesn't meet the floor it is
 * skipped permanently. A run bounded on its right by the (still-advancing)
 * recency boundary itself is left open so it can be re-evaluated -- and
 * possibly recorded -- once more messages age out of the recent window at a
 * later boundary.
 */
export function identifySimulatedRanges(sessionFile, messages, { config, minRangeTokens = DEFAULT_SIM_MIN_RANGE_TOKENS } = {}) {
	const protections = config.protections;
	const pairIndex = buildToolCallPairIndex(messages);
	const excluded = computeSimulatedRangeExclusions(messages, pairIndex, protections);

	const assistantIndices = [];
	messages.forEach((message, index) => {
		if (message.role === "assistant") assistantIndices.push(index);
	});

	const ranges = [];
	const knownRangeKeys = new Set();
	let consumedEnd = 0;

	for (const assistantIndex of assistantIndices) {
		const prefix = messages.slice(0, assistantIndex);
		const oldRegionEnd = Math.min(computeRecencyBoundaryIndex(prefix, protections.recentTurns), prefix.length);

		let i = consumedEnd;
		while (i < oldRegionEnd) {
			if (excluded[i]) {
				i++;
				consumedEnd = i; // an excluded message can never join a range; skip past it permanently.
				continue;
			}
			const runStart = i;
			while (i < oldRegionEnd && !excluded[i]) i++;
			const runEnd = i;
			const isOpenEnded = runEnd === oldRegionEnd;
			const rangeTokens = estimateTailTokens(messages, runStart) - estimateTailTokens(messages, runEnd);

			if (rangeTokens >= minRangeTokens) {
				const key = `${runStart}:${runEnd}`;
				if (!knownRangeKeys.has(key)) {
					knownRangeKeys.add(key);
					const tailTokensAfterEarliestChange = estimateTailTokens(prefix, runStart);
					const actualRemainingCalls = assistantIndices.filter((idx) => idx >= assistantIndex).length;
					ranges.push({
						sessionFile,
						rangeStart: runStart,
						rangeEnd: runEnd,
						rangeTokens,
						boundaryMessageIndex: assistantIndex,
						tailTokensAfterEarliestChange,
						actualRemainingCalls,
					});
				}
				consumedEnd = runEnd;
				continue; // keep scanning: further runs may already be visible within this boundary's old region.
			}

			if (isOpenEnded) break; // still growing; leave consumedEnd where it is, retry at a later boundary.
			consumedEnd = runEnd; // bounded by an excluded message and below the floor -- will never grow; skip permanently.
		}
	}

	return ranges;
}

/**
 * Model the simulated compression outcome + REALIZED net benefit for one
 * identified range, at a given summary-size fraction (pe-ckbd cost model):
 *
 *   summaryTokens      = max(fraction * rangeTokens, summaryMinTokens)
 *   oneTimeCost        = cacheBustPenalty(earliest range position)
 *                          + summarizerCostMult * (rangeTokens + summaryTokens)
 *   recurringSaving    = r * (rangeTokens - summaryTokens)
 *   realizedNetBenefit = actualRemainingCalls * recurringSaving - oneTimeCost
 *
 * `cacheBustPenalty` and the ratio-scaled `recurringSaving` reuse the exact
 * same `computeCacheCostModel` the runtime cost model uses (just fed
 * `rangeTokens - summaryTokens` as the "tokensRemoved" term instead of a
 * single decision's savings) -- summarizer cost is modelled as an ADDITIONAL
 * one-time cost on top of the cache-bust penalty, not folded into it, per
 * the ticket's cost model. This is a simplification: it prices the
 * summarizer call at `summarizerCostMult`x the main model's per-token price
 * and ignores summarizer latency/availability entirely.
 */
export function buildSimulatedCandidate(
	range,
	{
		fraction,
		summaryMinTokens = DEFAULT_SIM_SUMMARY_MIN_TOKENS,
		summarizerCostMult = DEFAULT_SIM_SUMMARIZER_COST_MULT,
		ratios,
	},
) {
	const summaryTokens = Math.max(fraction * range.rangeTokens, summaryMinTokens);
	const byRatio = {};
	for (const ratio of ratios) {
		const cost = computeCacheCostModel({
			tailTokensAfterEarliestChange: range.tailTokensAfterEarliestChange,
			tokensRemoved: range.rangeTokens - summaryTokens,
			cachedPriceRatio: ratio,
		});
		const summarizerCost = summarizerCostMult * (range.rangeTokens + summaryTokens);
		const oneTimeCost = cost.penalty + summarizerCost;
		const recurringSaving = cost.recurringSaving;
		const breakEvenCalls = recurringSaving > 0 ? oneTimeCost / recurringSaving : oneTimeCost > 0 ? Infinity : 0;
		const realizedNetBenefit = range.actualRemainingCalls * recurringSaving - oneTimeCost;
		byRatio[ratio] = {
			ratio,
			cacheBustPenalty: cost.penalty,
			summarizerCost,
			oneTimeCost,
			recurringSaving,
			breakEvenCalls,
			realizedNetBenefit,
		};
	}
	return {
		sessionFile: range.sessionFile,
		rangeStart: range.rangeStart,
		rangeEnd: range.rangeEnd,
		rangeTokens: range.rangeTokens,
		summaryFraction: fraction,
		summaryTokens,
		boundaryMessageIndex: range.boundaryMessageIndex,
		actualRemainingCalls: range.actualRemainingCalls,
		byRatio,
	};
}

/**
 * Aggregate SIMULATED compression evidence across all sessions' identified
 * ranges: a range-size distribution (fraction-independent, since range
 * IDENTIFICATION doesn't depend on summary size), plus a per-fraction,
 * per-ratio auto-expanding threshold sweep (`sweepThresholdWithAutoExpand`,
 * reused as-is against simulated candidates -- a SEPARATE population from
 * deterministic candidates, never mixed into the same sweep).
 *
 * Sensitivity: `fractions` may contain multiple `--sim-summary-fraction`
 * values; each produces its own independent population/sweep so the go/no-go
 * conclusion's dependence on assumed summary size is directly visible.
 */
export function computeSimulatedAggregate(allRanges, { fractions, ratios, summaryMinTokens, summarizerCostMult, sweepMax } = {}) {
	const rangeTokensSorted = allRanges.map((r) => r.rangeTokens).sort((a, b) => a - b);
	const rangeSizeDistribution = {
		count: rangeTokensSorted.length,
		p50: percentile(rangeTokensSorted, 50),
		p90: percentile(rangeTokensSorted, 90),
	};

	const byFraction = {};
	for (const fraction of fractions) {
		const candidates = allRanges.map((range) =>
			buildSimulatedCandidate(range, { fraction, summaryMinTokens, summarizerCostMult, ratios }),
		);
		const totalRangeTokens = candidates.reduce((sum, c) => sum + c.rangeTokens, 0);
		const totalSummaryTokens = candidates.reduce((sum, c) => sum + c.summaryTokens, 0);

		const byRatio = {};
		for (const ratio of ratios) {
			const sweep = sweepThresholdWithAutoExpand(candidates, ratio, { sweepMax });
			byRatio[ratio] = { ratio, sweep };
		}

		byFraction[fraction] = {
			summaryFraction: fraction,
			candidateCount: candidates.length,
			totalRangeTokens,
			totalSummaryTokens,
			byRatio,
		};
	}

	return { rangeCount: allRanges.length, rangeSizeDistribution, byFraction };
}

// ============================================================================
// Aggregation
// ============================================================================

function emptyStrategyAgg() {
	return { candidateCount: 0, totalTokensRemoved: 0, totalPenalty: 0, totalRealizedNetBenefit: 0, gatedAcceptedCount: 0 };
}

function foldCandidateIntoStrategyAgg(agg, candidate, ratio) {
	const r = candidate.byRatio[ratio];
	agg.candidateCount += 1;
	agg.totalTokensRemoved += candidate.tokensRemoved;
	agg.totalPenalty += r.penalty;
	agg.totalRealizedNetBenefit += r.realizedNetBenefit;
	if (r.gatedAcceptedDefault) agg.gatedAcceptedCount += 1;
}

export function aggregateBySessionAndStrategy(sessionResult, ratio) {
	const byStrategy = {};
	for (const candidate of sessionResult.candidates) {
		const agg = (byStrategy[candidate.strategyId] ??= emptyStrategyAgg());
		foldCandidateIntoStrategyAgg(agg, candidate, ratio);
	}
	return byStrategy;
}

/** Sweep break-even threshold T over 1..max; returns the T maximizing total realized net benefit, plus the full curve. */
export function sweepThreshold(candidates, ratio, max = THRESHOLD_SWEEP_MAX) {
	const curve = [];
	let best = { threshold: 1, total: Number.NEGATIVE_INFINITY };
	for (let threshold = 1; threshold <= max; threshold++) {
		let total = 0;
		for (const candidate of candidates) {
			const r = candidate.byRatio[ratio];
			if (r && Number.isFinite(r.breakEvenCalls) && r.breakEvenCalls <= threshold) total += r.realizedNetBenefit;
		}
		curve.push({ threshold, total });
		if (total > best.total) best = { threshold, total };
	}
	return { recommended: best.threshold, totalAtRecommended: best.total, curve };
}

/**
 * Derive a sane, corpus-based ceiling for auto-expanding the threshold sweep (pe-7oej).
 *
 * Once the tested max T reaches the largest finite breakEvenCalls seen across the
 * candidate set, every larger T accepts exactly the same set of candidates -- the
 * total-realized-net-benefit curve is provably flat beyond that point, so the true
 * global argmax (over all T from 1..Infinity) is guaranteed to already be visible in
 * the tested range. This is a tighter and more principled ceiling than sweeping an
 * arbitrary large fixed bound, while still being derived straight from the corpus.
 *
 * The result is clamped to HARD_SWEEP_CEILING as a runaway guard, and floored at
 * THRESHOLD_SWEEP_MAX so a corpus with no accepted candidates doesn't shrink the
 * sweep below the historical default.
 */
export function deriveSweepCeiling(candidates, ratio) {
	let maxBreakEven = 0;
	for (const candidate of candidates) {
		const r = candidate.byRatio?.[ratio];
		if (r && Number.isFinite(r.breakEvenCalls) && r.breakEvenCalls > maxBreakEven) maxBreakEven = r.breakEvenCalls;
	}
	if (maxBreakEven <= THRESHOLD_SWEEP_MAX) return THRESHOLD_SWEEP_MAX;
	return Math.min(HARD_SWEEP_CEILING, Math.ceil(maxBreakEven));
}

/**
 * Auto-expanding threshold sweep (pe-7oej): starts at `initialMax` (default 30, the
 * historical hardcoded cap) and, while the recommended T is still pinned to the max
 * tested T, doubles the max tested T and re-sweeps -- until the argmax is strictly
 * interior (recommended < maxTested) or a ceiling is hit.
 *
 * The ceiling is `sweepMax` when explicitly provided (an explicit --sweep-max always
 * overrides the corpus-derived ceiling, even if smaller than 30), otherwise it is
 * derived from the corpus via deriveSweepCeiling (itself capped at HARD_SWEEP_CEILING).
 *
 * On a corpus that never pins to the boundary, this returns byte-identical numbers to
 * the pre-pe-7oej sweepThreshold(candidates, ratio, 30) call (back-compat).
 */
export function sweepThresholdWithAutoExpand(candidates, ratio, { initialMax = THRESHOLD_SWEEP_MAX, sweepMax } = {}) {
	const ceiling = sweepMax !== undefined ? sweepMax : deriveSweepCeiling(candidates, ratio);
	let maxTested = Math.max(1, Math.min(initialMax, ceiling));
	let sweep = sweepThreshold(candidates, ratio, maxTested);
	while (sweep.recommended >= maxTested && maxTested < ceiling) {
		maxTested = Math.min(ceiling, maxTested * 2);
		sweep = sweepThreshold(candidates, ratio, maxTested);
	}
	const boundaryPinned = sweep.recommended >= maxTested;
	return { ...sweep, maxTested, boundaryPinned };
}

export function computeAggregate(sessionResults, ratios, { sweepMax } = {}) {
	const allCandidates = sessionResults.flatMap((session) => session.candidates);
	const primaryRatio = ratios[0];

	const byStrategy = {};
	for (const candidate of allCandidates) {
		const agg = (byStrategy[candidate.strategyId] ??= emptyStrategyAgg());
		foldCandidateIntoStrategyAgg(agg, candidate, primaryRatio);
	}

	const remainingCallsSorted = allCandidates.map((c) => c.actualRemainingCalls).sort((a, b) => a - b);
	const distribution = {
		count: remainingCallsSorted.length,
		p50: percentile(remainingCallsSorted, 50),
		p90: percentile(remainingCallsSorted, 90),
	};

	const midLoopCandidates = allCandidates.filter((c) => c.turnState === "mid_loop");
	const idleCandidates = allCandidates.filter((c) => c.turnState === "idle");

	const thresholdSweepByRatio = {};
	for (const ratio of ratios) {
		thresholdSweepByRatio[ratio] = {
			overall: sweepThresholdWithAutoExpand(allCandidates, ratio, { sweepMax }),
			mid_loop: sweepThresholdWithAutoExpand(midLoopCandidates, ratio, { sweepMax }),
			idle: sweepThresholdWithAutoExpand(idleCandidates, ratio, { sweepMax }),
		};
	}

	return {
		candidateCount: allCandidates.length,
		byStrategy,
		distribution,
		thresholdSweepByRatio,
		primaryRatio,
	};
}

// ============================================================================
// Text rendering
// ============================================================================

function formatNumber(value, digits = 1) {
	if (value === undefined || value === null || Number.isNaN(value)) return "-";
	if (!Number.isFinite(value)) return "inf";
	return value.toFixed(digits);
}

function padColumns(rows) {
	if (rows.length === 0) return "";
	const widths = [];
	for (const row of rows) {
		row.forEach((cell, i) => {
			widths[i] = Math.max(widths[i] ?? 0, String(cell).length);
		});
	}
	return rows.map((row) => row.map((cell, i) => String(cell).padEnd(widths[i])).join("  ")).join("\n");
}

function renderSessionTable(sessionResult, ratio) {
	const byStrategy = aggregateBySessionAndStrategy(sessionResult, ratio);
	const header = ["strategy", "candidates", "tokensRemoved", "predPenalty(sum)", "gatedAccepted", "realizedNetBenefit(sum)"];
	const rows = [header];
	const strategyIds = Object.keys(byStrategy).sort();
	for (const strategyId of strategyIds) {
		const agg = byStrategy[strategyId];
		rows.push([
			strategyId,
			agg.candidateCount,
			formatNumber(agg.totalTokensRemoved, 0),
			formatNumber(agg.totalPenalty, 1),
			`${agg.gatedAcceptedCount}/${agg.candidateCount}`,
			formatNumber(agg.totalRealizedNetBenefit, 1),
		]);
	}
	if (strategyIds.length === 0) rows.push(["(no candidates)", "", "", "", "", ""]);
	return padColumns(rows);
}

function renderAggregateSummary(aggregate, ratios) {
	const lines = [];
	lines.push(`Sessions processed: candidates=${aggregate.candidateCount}`);
	lines.push("");
	lines.push(`PREDICTED vs REALIZED by strategy (ratio r=${aggregate.primaryRatio}):`);
	const header = ["strategy", "candidates", "tokensRemoved", "predPenalty(sum)", "gatedAccepted", "realizedNetBenefit(sum)"];
	const rows = [header];
	for (const strategyId of Object.keys(aggregate.byStrategy).sort()) {
		const agg = aggregate.byStrategy[strategyId];
		rows.push([
			strategyId,
			agg.candidateCount,
			formatNumber(agg.totalTokensRemoved, 0),
			formatNumber(agg.totalPenalty, 1),
			`${agg.gatedAcceptedCount}/${agg.candidateCount}`,
			formatNumber(agg.totalRealizedNetBenefit, 1),
		]);
	}
	lines.push(padColumns(rows));
	lines.push("");
	lines.push(
		`REALIZED remaining-calls-after-position distribution: count=${aggregate.distribution.count} p50=${
			aggregate.distribution.p50 ?? "-"
		} p90=${aggregate.distribution.p90 ?? "-"}`,
	);
	lines.push("");
	lines.push(
		"RECOMMENDED break-even threshold (sweep auto-expands past T=30 until the argmax is interior or a ceiling is hit;",
	);
	lines.push("maximizes total REALIZED net benefit; ties -> smallest T):");
	for (const ratio of ratios) {
		const sweep = aggregate.thresholdSweepByRatio[ratio];
		lines.push(`  ratio r=${ratio}:`);
		for (const [label, entry] of [
			["overall ", sweep.overall],
			["mid_loop", sweep.mid_loop],
			["idle    ", sweep.idle],
		]) {
			const marker = entry.boundaryPinned ? "  [boundary-pinned (optimum may be higher)]" : "";
			lines.push(
				`    ${label}: T=${entry.recommended}  totalRealizedNetBenefit=${formatNumber(entry.totalAtRecommended, 1)}  maxTested=${entry.maxTested}${marker}`,
			);
		}
	}
	return lines.join("\n");
}

/**
 * Render the SIMULATED-vs-deterministic side-by-side comparison (pe-ckbd).
 *
 * NON-OVERLAP SIMPLIFICATION (documented, not modeled): deterministic and
 * SIMULATED populations are computed fully independently. A SIMULATED range
 * may fully contain one or more deterministic candidates' toolCallIds (e.g. a
 * dedupe/error-purge opportunity inside an old turn that a range would also
 * compress away); this comparison does NOT net that overlap out or otherwise
 * model any interaction between the two strategies. Totals from both rows are
 * therefore NOT additive -- they are two independent estimates of value over
 * (mostly) the same old-turn content, not a combined total.
 */
function renderSimulatedSummary(aggregate, simulated, ratios) {
	const lines = [];
	lines.push(
		`Ranges identified: ${simulated.rangeCount}  (rangeTokens p50=${simulated.rangeSizeDistribution.p50 ?? "-"} p90=${
			simulated.rangeSizeDistribution.p90 ?? "-"
		})`,
	);
	lines.push(`minRangeTokens=${simulated.minRangeTokens}  summaryMinTokens=${simulated.summaryMinTokens}  summarizerCostMult=${simulated.summarizerCostMult}`);
	lines.push("");
	lines.push(
		"NOTE: deterministic and SIMULATED populations below are computed INDEPENDENTLY -- a simulated",
	);
	lines.push(
		"range may fully contain deterministic candidates; no overlap/interaction is netted out or",
	);
	lines.push("modeled. Totals from the two rows are NOT additive.");
	lines.push("");

	const deterministicCandidateCount = aggregate.candidateCount;
	const deterministicTokensRemoved = Object.values(aggregate.byStrategy).reduce((sum, agg) => sum + agg.totalTokensRemoved, 0);

	for (const ratio of ratios) {
		lines.push(`ratio r=${ratio}:`);
		const detSweep = aggregate.thresholdSweepByRatio[ratio]?.overall;
		lines.push(
			`  deterministic: candidates=${deterministicCandidateCount}  tokensRemoved=${formatNumber(deterministicTokensRemoved, 0)}  realizedNetBenefit@T=${detSweep?.recommended ?? "-"}=${formatNumber(detSweep?.totalAtRecommended, 1)}`,
		);
		for (const fraction of Object.keys(simulated.byFraction)) {
			const byFraction = simulated.byFraction[fraction];
			const simSweepEntry = byFraction.byRatio[ratio];
			const sweep = simSweepEntry?.sweep;
			const marker = sweep?.boundaryPinned ? "  [boundary-pinned]" : "";
			lines.push(
				`  SIMULATED (summaryFraction=${fraction}): candidates=${byFraction.candidateCount}  rangeTokens=${formatNumber(byFraction.totalRangeTokens, 0)}  summaryTokens=${formatNumber(byFraction.totalSummaryTokens, 0)}  realizedNetBenefit@T=${sweep?.recommended ?? "-"}=${formatNumber(sweep?.totalAtRecommended, 1)}${marker}`,
			);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

// ============================================================================
// Main
// ============================================================================

async function loadSessionMessages(sessionFile) {
	const rawText = await fs.readFile(sessionFile, "utf8");
	const entries = parseSessionLines(sessionFile, rawText);
	const activeBranch = resolveActiveBranch(entries);
	return sessionEntriesToMessages(activeBranch);
}

export async function runBenchmark({
	paths,
	limit,
	ratios,
	sweepMax,
	simulateCompression = false,
	simSummaryFractions,
	simSummaryMinTokens,
	simSummarizerCostMult,
	simMinRangeTokens,
}) {
	let sessionFiles = await resolveSessionFiles(paths);
	if (limit !== undefined) sessionFiles = sessionFiles.slice(0, limit);

	// Simulation always uses the DEFAULT config's protections/recentTurns (no config
	// override support here): a real go/no-go run should reflect real-world defaults,
	// same rationale as the deterministic replay path's corpus-benchmark entrypoint.
	const simConfig = normalizeConfig(undefined);
	const resolvedMinRangeTokens = simMinRangeTokens ?? DEFAULT_SIM_MIN_RANGE_TOKENS;
	const resolvedSummaryMinTokens = simSummaryMinTokens ?? DEFAULT_SIM_SUMMARY_MIN_TOKENS;
	const resolvedSummarizerCostMult = simSummarizerCostMult ?? DEFAULT_SIM_SUMMARIZER_COST_MULT;
	const resolvedFractions = simSummaryFractions && simSummaryFractions.length > 0 ? simSummaryFractions : [...DEFAULT_SIM_SUMMARY_FRACTIONS];

	const sessionResults = [];
	const allSimulatedRanges = [];
	for (const sessionFile of sessionFiles) {
		let messages;
		try {
			messages = await loadSessionMessages(sessionFile);
		} catch (error) {
			console.error(`warning: ${sessionFile}: failed to read/parse, skipping (${error.message})`);
			continue;
		}
		if (messages.length === 0) {
			console.error(`warning: ${sessionFile}: no messages found on active branch, skipping`);
			continue;
		}
		const sessionResult = replaySession(sessionFile, messages, { ratios });
		if (simulateCompression) {
			const ranges = identifySimulatedRanges(sessionFile, messages, { config: simConfig, minRangeTokens: resolvedMinRangeTokens });
			sessionResult.simulatedRanges = ranges;
			allSimulatedRanges.push(...ranges);
		}
		sessionResults.push(sessionResult);
	}

	const aggregate = computeAggregate(sessionResults, ratios, { sweepMax });
	const result = { sessionFiles, sessionResults, aggregate, ratios };

	if (simulateCompression) {
		result.simulated = {
			minRangeTokens: resolvedMinRangeTokens,
			summaryMinTokens: resolvedSummaryMinTokens,
			summarizerCostMult: resolvedSummarizerCostMult,
			...computeSimulatedAggregate(allSimulatedRanges, {
				fractions: resolvedFractions,
				ratios,
				summaryMinTokens: resolvedSummaryMinTokens,
				summarizerCostMult: resolvedSummarizerCostMult,
				sweepMax,
			}),
		};
	}

	return result;
}

async function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(error.message);
		printUsage();
		process.exitCode = 1;
		return;
	}

	if (args.help) {
		printUsage();
		return;
	}

	const { sessionFiles, sessionResults, aggregate, ratios, simulated } = await runBenchmark(args);

	if (sessionFiles.length === 0) {
		console.error("No session files found to benchmark.");
		process.exitCode = 1;
		return;
	}

	if (args.json) {
		const payload = {
			generatedAt: new Date().toISOString(),
			ratios,
			sessionFiles,
			sessions: sessionResults,
			aggregate,
		};
		if (simulated) payload.simulated = simulated;
		console.log(JSON.stringify(payload, null, 2));
		return;
	}

	console.log(`dynamic-context-pruning offline benchmark — ${sessionResults.length}/${sessionFiles.length} session(s) replayed`);
	console.log("All numbers are PREDICTED (cost-model) unless labeled REALIZED (uses replay's knowledge of the actual future).");
	console.log("");

	for (const sessionResult of sessionResults) {
		console.log(`Session: ${sessionResult.sessionFile}`);
		console.log(`  assistant calls: ${sessionResult.assistantCallCount}`);
		console.log(renderSessionTable(sessionResult, ratios[0]));
		console.log("");
	}

	console.log("=".repeat(72));
	console.log("AGGREGATE SUMMARY");
	console.log("=".repeat(72));
	console.log(renderAggregateSummary(aggregate, ratios));

	if (simulated) {
		console.log("");
		console.log("=".repeat(72));
		console.log("SIMULATED compression (v2 go/no-go evidence; range-mode approximation)");
		console.log("=".repeat(72));
		console.log(renderSimulatedSummary(aggregate, simulated, ratios));
	}
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
	main().catch((error) => {
		console.error(error?.stack ?? String(error));
		process.exitCode = 1;
	});
}
