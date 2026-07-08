import * as fs from "node:fs/promises";
import * as path from "node:path";

import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

// ============================================================================
// Types (kept intentionally minimal/structural so pure helpers stay testable
// without depending on the full @earendil-works/pi-ai type graph).
// ============================================================================

export interface MinimalTextContent {
	type: "text";
	text: string;
}

export interface MinimalImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export interface MinimalToolCallContent {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	[key: string]: unknown;
}

export type MinimalAssistantContentBlock =
	| MinimalTextContent
	| { type: "thinking"; thinking: string; [key: string]: unknown }
	| MinimalToolCallContent;

export interface MinimalUserMessage {
	role: "user";
	content: string | (MinimalTextContent | MinimalImageContent)[];
	timestamp?: number;
	[key: string]: unknown;
}

export interface MinimalAssistantMessage {
	role: "assistant";
	content: MinimalAssistantContentBlock[];
	timestamp?: number;
	[key: string]: unknown;
}

export interface MinimalToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (MinimalTextContent | MinimalImageContent)[];
	isError: boolean;
	timestamp?: number;
	[key: string]: unknown;
}

export interface MinimalOtherMessage {
	role: Exclude<string, "user" | "assistant" | "toolResult">;
	timestamp?: number;
	[key: string]: unknown;
}

export type MinimalMessage = MinimalUserMessage | MinimalAssistantMessage | MinimalToolResultMessage | MinimalOtherMessage;

export interface MinimalSessionEntry {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
	message?: MinimalMessage;
	customType?: string;
	data?: unknown;
	[key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

const EXTENSION_ID = "dynamic-context-pruning";
const CONFIG_FILE_NAME = "dynamic-context-pruning.json";
const DECISION_ENTRY_TYPE = "dynamic-context-pruning:decision";
const STATS_ENTRY_TYPE = "dynamic-context-pruning:stats";
/**
 * Restore/undo entries (pe-8re9): a lightweight tombstone that records "the
 * decision with this idempotencyKey should be treated as reverted". See
 * `resolvePruneTombstoneState` for the exact chronological resolution rule.
 */
const RESTORE_ENTRY_TYPE = "dynamic-context-pruning:restore";
/** strategyId used for user-initiated prunes from the /prune picker (pe-8re9). Always source:"manual". */
const MANUAL_STRATEGY_ID = "manual";

const DEFAULT_RECENT_TURNS = 4;

/** Cache cost model default: fraction of full (non-cached) price still paid for cached tokens. */
const DEFAULT_CACHED_PRICE_RATIO = 0.1;

/**
 * Default net-benefit gate threshold (max amortization calls). Recalibrated
 * (pe-c5n9) from the representative-corpus benchmark (~/.the-last-harness/
 * agent/sessions, 1,390+ session files, 556 candidates): this is the
 * hindsight-optimal break-even T at cachedPriceRatio r=0.1 (aggressive
 * prompt caching, the common Anthropic case). IMPORTANT caveats:
 *  - Provider/ratio-dependent: this optimum shifts higher as caching gets
 *    weaker (T=29 at r=0.25, T=54 at r=0.5, T=58 at r=0.9 on the same
 *    corpus) — see docs/v2-design.md section 4 and the extension README.
 *  - At r=0.1 the realized deterministic savings this threshold buys are
 *    economically marginal (~20.6k token-units total across the whole
 *    corpus, i.e. pennies); savings only become material at r>=0.25.
 *  - Re-derive via `scripts/benchmark.mjs <sessions-dir> --ratio 0.1` if
 *    the representative corpus changes meaningfully.
 */
const DEFAULT_BREAK_EVEN_THRESHOLD = 22;

/** Tool names never pruned by default: orchestration/subagent-style tools and todo-like state. */
const DEFAULT_PROTECTED_TOOL_NAMES = [
	"todo",
	"task",
	"subagent",
	"agent",
	"skill",
	"oracle",
	"librarian",
	"contrarian",
	"code_reviewer",
	"gnosis",
	"triage_comments",
];

/** File globs never pruned by default: secrets/credential-shaped paths. */
const DEFAULT_PROTECTED_PATH_GLOBS = [
	"**/.env",
	"**/.env.*",
	"**/*.pem",
	"**/*.key",
	"**/id_rsa*",
	"**/id_ed25519*",
	"**/secrets/**",
	"**/*.p12",
	"**/*.pfx",
];

const DEFAULT_MIN_CHARS_SAVED = 200;

/** Default "older than N turns" threshold for the error-input purge strategy. */
const DEFAULT_ERROR_PURGE_MIN_TURNS_OLD = 4;

const DEDUPE_STRATEGY_ID = "dedupe";
const ERROR_PURGE_STRATEGY_ID = "error-purge";

// ============================================================================
// Config
// ============================================================================

export interface PruneProtections {
	/** Tool names (case-insensitive) whose calls are never pruned. */
	toolNames: string[];
	/** Glob patterns matched against string arguments; matches are never pruned. */
	pathGlobs: string[];
	/** Number of most recent conversational turns left untouched. */
	recentTurns: number;
}

export interface PruneThresholds {
	/**
	 * Minimum characters a fresh AUTOMATIC prune proposal must remove (original
	 * content chars minus placeholder chars) to be considered at all (pe-qdzb).
	 * Enforced by `runDynamicContextPruningPipeline` BEFORE the net-benefit
	 * gate (see `PruneGateConfig`/`gate`, which uses break-even token math and
	 * is a separate, later check): candidates below this floor are dropped
	 * up front and never reach gate/batch consideration. Manual prunes and
	 * already-persisted/replayed decisions always bypass this floor, same as
	 * the gate. A value of 0 disables the floor (no filtering).
	 */
	minCharsSaved: number;
}

/** Per-strategy toggles/config (pe-u8gd, pe-qs8j). Each strategy can be disabled independently. */
export interface StrategiesConfig {
	dedupe: { enabled: boolean };
	errorPurge: {
		enabled: boolean;
		/** A tool call's input is only eligible for purging once it is older than this many turns. */
		minTurnsOld: number;
	};
	/** Superseded file-ops strategy (pe-qs8j): stale read/write/edit outputs replaced by a placeholder. */
	supersededFileOps: { enabled: boolean };
}

/** Net-benefit gate operating mode (pe-s2ho). */
export type GateMode = "on" | "off" | "always-apply";

/**
 * State-conditioning hook (pe-s2ho notes): lets the gate use a different
 * break-even threshold depending on whether the agent is mid-loop (actively
 * making tool calls) vs idle (waiting on the user). Both states default to
 * the same threshold today.
 *
 * pe-c5n9 evidence (turn-END definition, since superseded -- see below):
 * the representative-corpus benchmark showed mid_loop candidates carrying
 * ~all realized net benefit while idle candidates carried ~none. That would
 * have argued for a stricter idle default. However, the only live runtime
 * caller (the `context` event handler below) did not yet perform real
 * mid-loop/idle detection at the time, so no default change was made.
 *
 * pe-zy4s update (2026-07-08): real runtime mid_loop/idle detection is now
 * wired through the `context` event handler (`classifyAgentStateFromMessages`),
 * using a turn-START definition (idle = this is the first LLM call of a turn;
 * mid_loop = the agent already made a call or received a tool result this
 * turn) -- see that function's doc comment for the exact runtime-observable
 * semantics. The benchmark's candidate labeling was aligned to this SAME
 * definition (retiring the old turn-END definition above, which was never
 * runtime-observable), and the state-split was re-derived on the
 * representative corpus (~/.the-last-harness/agent/sessions, 460 candidates)
 * under it.
 *
 * The result REVERSES the earlier (turn-END) finding: at r=0.1 the
 * turn-START "idle" population (calls made at the start of a turn) carries
 * essentially ALL the realized net benefit (idle-optimal T=22, total realized
 * net benefit ~20,594 token-units), while "mid_loop" carries essentially NONE
 * (mid_loop-optimal T=1, total realized net benefit ~0.0 -- i.e. no mid_loop
 * candidate is ever worth accepting at r=0.1 under this definition). This is
 * the OPPOSITE of what the pe-c5n9 evidence (measured under the old,
 * non-runtime-observable turn-END definition) suggested.
 *
 * Per the pe-zy4s decision rule (stricter idle default only if idle itself is
 * shown to be ~worthless): idle is NOT worthless here -- it is the ONLY state
 * carrying value at r=0.1 -- so no state-conditioned strictness is justified
 * in either direction. The per-state split is therefore kept at PARITY
 * (`breakEvenThresholdByState: { idle: DEFAULT_BREAK_EVEN_THRESHOLD, mid_loop:
 * DEFAULT_BREAK_EVEN_THRESHOLD }`), both config-overridable. A future ticket
 * could consider a stricter mid_loop default given this evidence, but that is
 * a new, unreviewed direction outside this ticket's authorized decision rule
 * and is left for a follow-up.
 */
export type AgentState = "idle" | "mid_loop";

export interface PruneGateConfig {
	/** "on": gate rejects new prunes above threshold. "off": gate is bypassed
	 * entirely (no cost modelling, everything applies). "always-apply": cost
	 * is still modelled (for stats/observability) but nothing is ever rejected. */
	mode: GateMode;
	/** Fraction of full price still paid for cached ( r ). Default 0.1. */
	cachedPriceRatio: number;
	/**
	 * Default break-even threshold (max future calls to amortize a cache
	 * bust) used when no state-specific override applies. Recalibrated from
	 * the representative-corpus benchmark; see DEFAULT_BREAK_EVEN_THRESHOLD
	 * for the full rationale and ratio-sensitivity caveats.
	 */
	breakEvenThreshold: number;
	/** Per-agent-state threshold overrides; both default to `breakEvenThreshold`. */
	breakEvenThresholdByState: { idle: number; mid_loop: number };
}

export interface DynamicContextPruningConfig {
	enabled: boolean;
	protections: PruneProtections;
	thresholds: PruneThresholds;
	gate: PruneGateConfig;
	strategies: StrategiesConfig;
}

export function defaultConfig(): DynamicContextPruningConfig {
	return {
		enabled: true,
		protections: {
			toolNames: [...DEFAULT_PROTECTED_TOOL_NAMES],
			pathGlobs: [...DEFAULT_PROTECTED_PATH_GLOBS],
			recentTurns: DEFAULT_RECENT_TURNS,
		},
		thresholds: {
			minCharsSaved: DEFAULT_MIN_CHARS_SAVED,
		},
		strategies: {
			dedupe: { enabled: true },
			errorPurge: { enabled: true, minTurnsOld: DEFAULT_ERROR_PURGE_MIN_TURNS_OLD },
			supersededFileOps: { enabled: true },
		},
		gate: {
			mode: "on",
			cachedPriceRatio: DEFAULT_CACHED_PRICE_RATIO,
			breakEvenThreshold: DEFAULT_BREAK_EVEN_THRESHOLD,
			breakEvenThresholdByState: { idle: DEFAULT_BREAK_EVEN_THRESHOLD, mid_loop: DEFAULT_BREAK_EVEN_THRESHOLD },
		},
	};
}

function asStringArray(value: unknown, fallback: string[]): string[] {
	if (!Array.isArray(value)) return fallback;
	const out = value.filter((item): item is string => typeof item === "string" && item.length > 0);
	return out.length > 0 ? out : fallback;
}

function asNonNegativeInt(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.floor(parsed);
}

function asNonNegativeNumber(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return parsed;
}

function asRatio(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
	return parsed;
}

function asGateMode(value: unknown, fallback: GateMode): GateMode {
	return value === "on" || value === "off" || value === "always-apply" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/** Merge a partially-shaped parsed config (e.g. from disk) onto defaults. Never throws. */
export function normalizeConfig(parsed: unknown): DynamicContextPruningConfig {
	const defaults = defaultConfig();
	if (!parsed || typeof parsed !== "object") return defaults;
	const raw = parsed as Record<string, unknown>;
	const rawProtections = (raw.protections && typeof raw.protections === "object" ? raw.protections : {}) as Record<
		string,
		unknown
	>;
	const rawThresholds = (raw.thresholds && typeof raw.thresholds === "object" ? raw.thresholds : {}) as Record<
		string,
		unknown
	>;
	const rawGate = (raw.gate && typeof raw.gate === "object" ? raw.gate : {}) as Record<string, unknown>;
	const rawGateByState = (rawGate.breakEvenThresholdByState && typeof rawGate.breakEvenThresholdByState === "object"
		? rawGate.breakEvenThresholdByState
		: {}) as Record<string, unknown>;
	const rawStrategies = (raw.strategies && typeof raw.strategies === "object" ? raw.strategies : {}) as Record<string, unknown>;
	const rawDedupe = (rawStrategies.dedupe && typeof rawStrategies.dedupe === "object" ? rawStrategies.dedupe : {}) as Record<
		string,
		unknown
	>;
	const rawErrorPurge = (rawStrategies.errorPurge && typeof rawStrategies.errorPurge === "object"
		? rawStrategies.errorPurge
		: {}) as Record<string, unknown>;
	const rawSupersededFileOps = (rawStrategies.supersededFileOps && typeof rawStrategies.supersededFileOps === "object"
		? rawStrategies.supersededFileOps
		: {}) as Record<string, unknown>;

	return {
		enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
		protections: {
			toolNames: asStringArray(rawProtections.toolNames, defaults.protections.toolNames),
			pathGlobs: asStringArray(rawProtections.pathGlobs, defaults.protections.pathGlobs),
			recentTurns: asNonNegativeInt(rawProtections.recentTurns, defaults.protections.recentTurns),
		},
		thresholds: {
			minCharsSaved: asNonNegativeInt(rawThresholds.minCharsSaved, defaults.thresholds.minCharsSaved),
		},
		strategies: {
			dedupe: { enabled: asBoolean(rawDedupe.enabled, defaults.strategies.dedupe.enabled) },
			errorPurge: {
				enabled: asBoolean(rawErrorPurge.enabled, defaults.strategies.errorPurge.enabled),
				minTurnsOld: asNonNegativeInt(rawErrorPurge.minTurnsOld, defaults.strategies.errorPurge.minTurnsOld),
			},
			supersededFileOps: {
				enabled: asBoolean(rawSupersededFileOps.enabled, defaults.strategies.supersededFileOps.enabled),
			},
		},
		gate: {
			mode: asGateMode(rawGate.mode, defaults.gate.mode),
			cachedPriceRatio: asRatio(rawGate.cachedPriceRatio, defaults.gate.cachedPriceRatio),
			breakEvenThreshold: asNonNegativeNumber(rawGate.breakEvenThreshold, defaults.gate.breakEvenThreshold),
			breakEvenThresholdByState: {
				idle: asNonNegativeNumber(rawGateByState.idle, defaults.gate.breakEvenThresholdByState.idle),
				mid_loop: asNonNegativeNumber(rawGateByState.mid_loop, defaults.gate.breakEvenThresholdByState.mid_loop),
			},
		},
	};
}

function getConfigPath(): string {
	return path.join(getAgentDir(), "extensions", CONFIG_FILE_NAME);
}

async function readConfig(): Promise<DynamicContextPruningConfig> {
	try {
		const raw = await fs.readFile(getConfigPath(), "utf8");
		return normalizeConfig(JSON.parse(raw));
	} catch {
		return defaultConfig();
	}
}

async function writeConfig(config: DynamicContextPruningConfig): Promise<void> {
	const configPath = getConfigPath();
	const payload = { ...config, updatedAt: new Date().toISOString() };
	await fs.mkdir(path.dirname(configPath), { recursive: true });
	await fs.writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

// ============================================================================
// Token estimator (chars/4-style; deliberately simple, good enough for
// relative before/after accounting used by later savings-accounting work).
// ============================================================================

export function estimateTokensForText(text: string): number {
	if (!text) return 0;
	return Math.max(0, Math.ceil(text.length / 4));
}

export function estimateTokensForContent(content: string | (MinimalTextContent | MinimalImageContent)[]): number {
	if (typeof content === "string") return estimateTokensForText(content);
	if (!Array.isArray(content)) return 0;
	let total = 0;
	for (const block of content) {
		if (block.type === "text") total += estimateTokensForText(block.text);
		else if (block.type === "image") total += 1200; // rough fixed estimate, mirrors context-inspector's convention
	}
	return total;
}

export type TokenEstimator = (text: string) => number;

/**
 * Classify the agent's current state from the message payload alone (pe-zy4s):
 * this is the runtime-observable definition used both by the live `context`
 * event handler and (via re-export) by the offline benchmark, so the two can
 * never drift apart.
 *
 * Walk backwards from the end of `messages`, skipping any message that is
 * neither `user`, `assistant`, nor `toolResult` (e.g. system-role bookkeeping
 * entries). The first such message found determines the state:
 *  - `user` (a plain user turn message) => "idle": this call is the FIRST LLM
 *    call of a turn, i.e. the decision is being made from a turn-start state.
 *  - `assistant` or `toolResult` (mid-chain) => "mid_loop": the agent is
 *    iterating (already made at least one call this turn, or is reacting to a
 *    tool result).
 *  - No such message found (empty history, or system-only) => "idle" (safe
 *    default: nothing suggests an in-progress loop).
 *
 * The benchmark (scripts/benchmark.mjs) reclassifies its candidate labels to
 * this SAME definition (pe-zy4s), reusing this function directly, so the
 * defaults below rest on evidence measured with the exact definition the
 * runtime observes. (An earlier turn-end-based benchmark definition -- "idle"
 * meant "this IS the turn's last assistant message", only knowable in
 * hindsight -- has been retired: the runtime cannot know in advance whether a
 * call is a turn's last one, so that definition was never runtime-observable.)
 */
export function classifyAgentStateFromMessages(messages: MinimalMessage[]): AgentState {
	for (let i = messages.length - 1; i >= 0; i--) {
		const role = messages[i].role;
		if (role === "user") return "idle";
		if (role === "assistant" || role === "toolResult") return "mid_loop";
		// Any other role (e.g. "system") is skipped: keep walking further back.
	}
	return "idle";
}

/** Resolve which break-even threshold applies for a given agent state (pe-s2ho state-conditioning hook). */
export function resolveBreakEvenThreshold(gateConfig: PruneGateConfig, agentState: AgentState): number {
	const override = gateConfig.breakEvenThresholdByState[agentState];
	return typeof override === "number" && Number.isFinite(override) ? override : gateConfig.breakEvenThreshold;
}

/** Estimate the token cost of a single message (all content kinds), for tail/context-size accounting. */
function estimateMessageTokens(message: MinimalMessage, estimateTokens: TokenEstimator): number {
	if (message.role === "user" || message.role === "toolResult") {
		const content = (message as MinimalUserMessage | MinimalToolResultMessage).content;
		return estimateTokensForContent(content as string | (MinimalTextContent | MinimalImageContent)[]);
	}
	if (message.role === "assistant") {
		let total = 0;
		for (const block of (message as MinimalAssistantMessage).content) {
			if (block.type === "text") total += estimateTokens(block.text);
			else if (block.type === "thinking") total += estimateTokens(block.thinking);
			else if (block.type === "toolCall") total += estimateTokens(JSON.stringify(block.arguments ?? {}));
		}
		return total;
	}
	return 0;
}

/**
 * Sum estimated tokens for messages from `fromIndex` to the end of the array.
 * Used both for cache-bust tail sizing (pe-s2ho cost model) and for raw/
 * effective context-size snapshots. Clamped to valid indices; an out-of-range
 * `fromIndex` (e.g. the very last message, or beyond) degrades gracefully.
 */
export function estimateTailTokens(
	messages: MinimalMessage[],
	fromIndex: number,
	estimateTokens: TokenEstimator = estimateTokensForText,
): number {
	let total = 0;
	const start = Math.max(0, fromIndex);
	for (let i = start; i < messages.length; i++) {
		total += estimateMessageTokens(messages[i], estimateTokens);
	}
	return total;
}

// ============================================================================
// Protections
// ============================================================================

function globToRegExp(glob: string): RegExp {
	let pattern = "^";
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i];
		if (char === "*") {
			if (glob[i + 1] === "*") {
				i++;
				if (glob[i + 1] === "/") {
					pattern += "(?:.*/)?";
					i++;
				} else {
					pattern += ".*";
				}
			} else {
				pattern += "[^/]*";
			}
		} else if (char === "?") {
			pattern += "[^/]";
		} else if ("\\^$.|?*+()[]{}".includes(char)) {
			pattern += `\\${char}`;
		} else {
			pattern += char;
		}
	}
	pattern += "$";
	return new RegExp(pattern);
}

export function isProtectedToolName(toolName: string | undefined, protections: PruneProtections): boolean {
	if (!toolName) return false;
	const normalized = toolName.trim().toLowerCase();
	return protections.toolNames.some((name) => name.trim().toLowerCase() === normalized);
}

export function isProtectedPath(value: string, protections: PruneProtections): boolean {
	if (!value) return false;
	const normalized = value.trim();
	if (!normalized) return false;
	return protections.pathGlobs.some((glob) => globToRegExp(glob).test(normalized));
}

/** Shallow-collect string values from a tool-call arguments object, for path-glob matching. */
export function collectArgStringValues(args: Record<string, unknown> | undefined, depth = 2): string[] {
	if (!args || typeof args !== "object") return [];
	const out: string[] = [];
	const visit = (value: unknown, remainingDepth: number) => {
		if (typeof value === "string") {
			out.push(value);
			return;
		}
		if (remainingDepth <= 0) return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item, remainingDepth - 1);
			return;
		}
		if (value && typeof value === "object") {
			for (const item of Object.values(value as Record<string, unknown>)) visit(item, remainingDepth - 1);
		}
	};
	visit(args, depth);
	return out;
}

/**
 * Index of the first message index considered part of the "recent" protected
 * window. Messages at or after this index must never be pruned.
 *
 * A "turn" starts at each user message. Protects the last `recentTurns` turns.
 */
export function computeRecencyBoundaryIndex(messages: MinimalMessage[], recentTurns: number): number {
	if (recentTurns <= 0) return messages.length;
	const turnStarts: number[] = [];
	messages.forEach((message, index) => {
		if (message.role === "user") turnStarts.push(index);
	});
	if (turnStarts.length === 0) return 0;
	const startIdx = Math.max(0, turnStarts.length - recentTurns);
	return turnStarts[startIdx] ?? 0;
}

export function isWithinRecencyWindow(index: number, boundaryIndex: number): boolean {
	return index >= boundaryIndex;
}

/**
 * Number of user-started turns that have elapsed strictly after `index`.
 * Used by the error-input purge strategy's "older than N turns" rule; a
 * message at the very end of the conversation has 0 turns elapsed.
 */
export function computeTurnsElapsedSince(messages: MinimalMessage[], index: number): number {
	let count = 0;
	for (let i = index + 1; i < messages.length; i++) {
		if (messages[i].role === "user") count++;
	}
	return count;
}

// ============================================================================
// Correlation
// ============================================================================

export interface ToolCallPairIndices {
	assistantIndex?: number;
	toolCallBlockIndex?: number;
	resultIndex?: number;
}

/**
 * Build a toolCallId -> pair-indices index for every tool call/result found
 * in `messages`, in a single O(n) pass. Callers that need to resolve many
 * toolCallIds against the same `messages` array (e.g. the pipeline's
 * per-decision protection/savings/apply passes) should build this once and
 * pass it to `findToolCallPairIndices` and friends to avoid an O(n) rescan
 * per decision (pe-e0zd).
 */
export function buildToolCallPairIndex(messages: MinimalMessage[]): Map<string, ToolCallPairIndices> {
	const index = new Map<string, ToolCallPairIndices>();
	const getOrCreate = (toolCallId: string): ToolCallPairIndices => {
		let pair = index.get(toolCallId);
		if (!pair) {
			pair = {};
			index.set(toolCallId, pair);
		}
		return pair;
	};
	messages.forEach((message, messageIndex) => {
		if (message.role === "assistant" && Array.isArray((message as MinimalAssistantMessage).content)) {
			const content = (message as MinimalAssistantMessage).content;
			const seenInThisMessage = new Set<string>();
			content.forEach((block, blockIndex) => {
				if (block.type !== "toolCall") return;
				// Mirror findToolCallPairIndices' content.findIndex: within a single
				// message, the FIRST matching block wins (duplicate ids in one
				// message's content are pathological but must resolve identically).
				if (seenInThisMessage.has(block.id)) return;
				seenInThisMessage.add(block.id);
				const pair = getOrCreate(block.id);
				pair.assistantIndex = messageIndex;
				pair.toolCallBlockIndex = blockIndex;
			});
		} else if (message.role === "toolResult") {
			const pair = getOrCreate((message as MinimalToolResultMessage).toolCallId);
			pair.resultIndex = messageIndex;
		}
	});
	return index;
}

/**
 * Primary correlation: locate an assistant toolCall block and/or its
 * toolResult by toolCallId. Pass a precomputed `pairIndex` (see
 * `buildToolCallPairIndex`) to resolve in O(1) instead of rescanning
 * `messages`; omitting it preserves the original O(n) full-scan behavior.
 */
export function findToolCallPairIndices(
	messages: MinimalMessage[],
	toolCallId: string,
	pairIndex?: Map<string, ToolCallPairIndices>,
): ToolCallPairIndices {
	if (pairIndex) return pairIndex.get(toolCallId) ?? {};
	const pair: ToolCallPairIndices = {};
	messages.forEach((message, index) => {
		if (message.role === "assistant" && Array.isArray((message as MinimalAssistantMessage).content)) {
			const content = (message as MinimalAssistantMessage).content;
			const blockIndex = content.findIndex((block) => block.type === "toolCall" && block.id === toolCallId);
			if (blockIndex >= 0) {
				pair.assistantIndex = index;
				pair.toolCallBlockIndex = blockIndex;
			}
		} else if (message.role === "toolResult" && (message as MinimalToolResultMessage).toolCallId === toolCallId) {
			pair.resultIndex = index;
		}
	});
	return pair;
}

/**
 * Fallback correlation for decisions that reference a session entry rather
 * than a toolCallId (reserved for future non-tool-call strategies). Zips
 * message-producing session entries against the current context projection
 * by position; entry/message counts are expected to match in the common
 * case, but this degrades gracefully otherwise.
 */
function expectedRoleForEntry(entry: MinimalSessionEntry): string | undefined {
	if (entry.type === "message") return entry.message?.role;
	if (entry.type === "custom_message") return "custom";
	if (entry.type === "branch_summary") return "branchSummary";
	if (entry.type === "compaction") return "compactionSummary";
	return undefined;
}

export function buildEntryIdToMessageIndexMap(
	entries: MinimalSessionEntry[],
	messages: MinimalMessage[],
): Map<string, number> {
	const map = new Map<string, number>();
	const producing = entries.filter((entry) =>
		entry.type === "message" || entry.type === "custom_message" || entry.type === "branch_summary" || entry.type === "compaction",
	);
	const length = Math.min(producing.length, messages.length);
	for (let i = 0; i < length; i++) {
		const entry = producing[i];
		const expectedRole = expectedRoleForEntry(entry);
		const candidate = messages[i];
		// Guard against silent misalignment (e.g. compaction/branch-summary shifted
		// the projection): only trust the positional zip when roles line up,
		// otherwise leave it unset so callers fall back to role+timestamp matching.
		if (expectedRole && candidate?.role !== expectedRole) continue;
		map.set(entry.id, i);
	}
	return map;
}

/** Last-resort correlation fallback: match by role + timestamp when order-zip counts diverge. */
export function findMessageIndexByRoleAndTimestamp(
	entry: MinimalSessionEntry,
	messages: MinimalMessage[],
): number | undefined {
	const message = entry.message;
	if (!message || typeof message.role !== "string" || typeof message.timestamp !== "number") return undefined;
	const index = messages.findIndex((m) => m.role === message.role && m.timestamp === message.timestamp);
	return index >= 0 ? index : undefined;
}

/** Resolve a session entry id to a message index using order-zip, then role+timestamp fallback. */
export function resolveMessageIndexForEntry(
	entryId: string,
	entries: MinimalSessionEntry[],
	messages: MinimalMessage[],
): number | undefined {
	const zipMap = buildEntryIdToMessageIndexMap(entries, messages);
	const zipped = zipMap.get(entryId);
	if (zipped !== undefined) return zipped;
	const entry = entries.find((candidate) => candidate.id === entryId);
	if (!entry) return undefined;
	return findMessageIndexByRoleAndTimestamp(entry, messages);
}

// ============================================================================
// Proposals & persisted decisions
// ============================================================================

export type PruneTargetKind = "tool_result_content" | "tool_call_input";

/**
 * Where a decision came from. "manual" decisions (e.g. a future /prune
 * picker, pe-8re9) always bypass the net-benefit gate: user intent wins.
 * Absent/unspecified defaults to "auto".
 */
export type PruneDecisionSource = "auto" | "manual";

/** What a strategy proposes. The pipeline decides whether/how to apply it. */
export interface ProposedPrune {
	strategyId: string;
	toolCallId: string;
	kind: PruneTargetKind;
	reason: string;
	placeholder?: string;
	/** Defaults to "auto"; set to "manual" for user-initiated prunes that must bypass the gate. */
	source?: PruneDecisionSource;
}

/** What actually gets persisted once the pipeline applies a proposal. */
export interface PruneDecisionRecord {
	idempotencyKey: string;
	strategyId: string;
	correlation: { type: "toolCallId"; toolCallId: string } | { type: "entryId"; entryId: string };
	kind: PruneTargetKind;
	reason: string;
	placeholder?: string;
	createdAt: string;
	source: PruneDecisionSource;
}

export function buildIdempotencyKey(proposal: ProposedPrune): string {
	return `${proposal.strategyId}:${proposal.kind}:${proposal.toolCallId}`;
}

/**
 * Key identifying WHAT a decision targets (kind + correlation), deliberately
 * omitting `strategyId` (unlike `idempotencyKey`). Two decisions from
 * different strategies that both replace the same tool result's content
 * share this key even though their idempotencyKeys differ — that's exactly
 * the overlap pe-j7sb collapses before gating/apply (see
 * `runDynamicContextPruningPipeline`).
 */
function buildDecisionTargetKey(decision: PruneDecisionRecord): string {
	const correlationId = decision.correlation.type === "toolCallId" ? decision.correlation.toolCallId : decision.correlation.entryId;
	return `${decision.kind}:${decision.correlation.type}:${correlationId}`;
}

export function proposalToDecisionRecord(proposal: ProposedPrune, createdAt: string = new Date().toISOString()): PruneDecisionRecord {
	return {
		idempotencyKey: buildIdempotencyKey(proposal),
		strategyId: proposal.strategyId,
		correlation: { type: "toolCallId", toolCallId: proposal.toolCallId },
		kind: proposal.kind,
		reason: proposal.reason,
		placeholder: proposal.placeholder,
		createdAt,
		source: proposal.source ?? "auto",
	};
}

/** Parse a persisted CustomEntry payload back into a decision record. Returns undefined if malformed. */
export function parseDecisionRecord(data: unknown): PruneDecisionRecord | undefined {
	if (!data || typeof data !== "object") return undefined;
	const raw = data as Record<string, unknown>;
	if (typeof raw.idempotencyKey !== "string" || !raw.idempotencyKey) return undefined;
	if (typeof raw.strategyId !== "string") return undefined;
	if (raw.kind !== "tool_result_content" && raw.kind !== "tool_call_input") return undefined;
	if (typeof raw.reason !== "string") return undefined;
	if (typeof raw.createdAt !== "string") return undefined;
	const source: PruneDecisionSource = raw.source === "manual" ? "manual" : "auto";

	const rawCorrelation = raw.correlation as Record<string, unknown> | undefined;
	let correlation: PruneDecisionRecord["correlation"] | undefined;
	if (rawCorrelation?.type === "toolCallId" && typeof rawCorrelation.toolCallId === "string") {
		correlation = { type: "toolCallId", toolCallId: rawCorrelation.toolCallId };
	} else if (rawCorrelation?.type === "entryId" && typeof rawCorrelation.entryId === "string") {
		correlation = { type: "entryId", entryId: rawCorrelation.entryId };
	}
	if (!correlation) return undefined;

	return {
		idempotencyKey: raw.idempotencyKey,
		strategyId: raw.strategyId,
		correlation,
		kind: raw.kind,
		reason: raw.reason,
		placeholder: typeof raw.placeholder === "string" ? raw.placeholder : undefined,
		createdAt: raw.createdAt,
		source,
	};
}

// ============================================================================
// Restore / undo (pe-8re9): tombstones that reverse a persisted decision
// ============================================================================

/**
 * A restore record is a tombstone: it records that the decision identified by
 * `idempotencyKey` should stop being applied, WITHOUT deleting or mutating
 * the original decision entry (the branch's persisted-entry log is
 * append-only, same as decisions/stats). Restoring never "forgets" that a
 * prune happened; it just flips it inactive.
 *
 * Restores are resolved chronologically against decision entries for the
 * SAME idempotencyKey (see `resolvePruneTombstoneState`): whichever entry
 * (decision or restore) for a given key is LATEST wins. This makes
 * prune -> restore -> re-prune -> restore ... sequences behave correctly and
 * idempotently no matter how many times they replay, without needing to
 * mutate or delete anything.
 */
export interface RestoreRecord {
	idempotencyKey: string;
	createdAt: string;
}

export function buildRestoreRecord(idempotencyKey: string, createdAt: string = new Date().toISOString()): RestoreRecord {
	return { idempotencyKey, createdAt };
}

/** Parse a persisted CustomEntry payload back into a restore record. Returns undefined if malformed. */
export function parseRestoreRecord(data: unknown): RestoreRecord | undefined {
	if (!data || typeof data !== "object") return undefined;
	const raw = data as Record<string, unknown>;
	if (typeof raw.idempotencyKey !== "string" || !raw.idempotencyKey) return undefined;
	if (typeof raw.createdAt !== "string") return undefined;
	return { idempotencyKey: raw.idempotencyKey, createdAt: raw.createdAt };
}

/** Build the manual-prune proposal a /prune picker "prune" action emits. Always source: "manual" (gate bypass). */
export function buildManualPruneProposal(toolCallId: string, reason: string = "manual prune via /prune"): ProposedPrune {
	return { strategyId: MANUAL_STRATEGY_ID, toolCallId, kind: "tool_result_content", reason, source: "manual" };
}

export interface PruneTombstoneState {
	/** Decisions whose most recent event (decision vs restore) for their idempotencyKey is a decision. */
	activeDecisions: PruneDecisionRecord[];
	/** idempotencyKeys of `activeDecisions`, for pipeline seen/known-key checks. */
	activeIdempotencyKeys: Set<string>;
	/** idempotencyKeys whose most recent event is a restore: currently tombstoned/inactive. */
	restoredKeys: Set<string>;
	/** Most-recently-seen decision record per key, regardless of current tombstone state (for /prune history display). */
	lastDecisionByKey: Map<string, PruneDecisionRecord>;
}

/**
 * Chronologically resolve decision + restore CustomEntry records on a branch
 * into "currently active" vs "currently restored (tombstoned)" state, per
 * idempotencyKey. For each key, whichever entry (decision or restore)
 * appears LAST in `entries` wins. This is the single source of truth
 * consumed both by the pipeline (to stop automatic strategies from silently
 * re-persisting a just-restored decision) and by the /prune picker (to show
 * accurate status and support prune/restore/re-prune).
 *
 * Idempotent/rebuildable like `rebuildDecisionStateFromEntries`: replaying
 * the same entries any number of times yields identical results.
 */
export function resolvePruneTombstoneState(entries: MinimalSessionEntry[]): PruneTombstoneState {
	const lastDecisionByKey = new Map<string, PruneDecisionRecord>();
	const lastEventKindByKey = new Map<string, "decision" | "restore">();

	for (const entry of entries) {
		if (entry.type !== "custom") continue;
		if (entry.customType === DECISION_ENTRY_TYPE) {
			const record = parseDecisionRecord(entry.data);
			if (!record) continue;
			lastDecisionByKey.set(record.idempotencyKey, record);
			lastEventKindByKey.set(record.idempotencyKey, "decision");
		} else if (entry.customType === RESTORE_ENTRY_TYPE) {
			const record = parseRestoreRecord(entry.data);
			if (!record) continue;
			lastEventKindByKey.set(record.idempotencyKey, "restore");
		}
	}

	const activeDecisions: PruneDecisionRecord[] = [];
	const activeIdempotencyKeys = new Set<string>();
	const restoredKeys = new Set<string>();
	for (const [key, kind] of lastEventKindByKey) {
		if (kind === "decision") {
			const record = lastDecisionByKey.get(key);
			if (record) {
				activeDecisions.push(record);
				activeIdempotencyKeys.add(key);
			}
		} else {
			restoredKeys.add(key);
		}
	}

	return { activeDecisions, activeIdempotencyKeys, restoredKeys, lastDecisionByKey };
}

// ============================================================================
// Apply step (content-replacement only; never drops messages)
// ============================================================================

export function buildPlaceholderText(reason: string, charsRemoved: number): string {
	return `[pruned by ${EXTENSION_ID}: ${reason} (${charsRemoved} chars removed)]`;
}

function contentTextLength(content: (MinimalTextContent | MinimalImageContent)[]): number {
	return content.reduce((sum, block) => (block.type === "text" ? sum + block.text.length : sum), 0);
}

export interface ApplyResult {
	applied: boolean;
	charsRemoved: number;
}

/**
 * Apply a single decision to a mutable messages array (mutates in place).
 * Never removes messages or content blocks; only replaces tool result content
 * or (for errored calls only) tool call input arguments with a placeholder.
 * Gracefully no-ops when the target is absent (e.g. after compaction).
 */
export function applyPruneDecision(
	messages: MinimalMessage[],
	decision: PruneDecisionRecord,
	pairIndex?: Map<string, ToolCallPairIndices>,
): ApplyResult {
	if (decision.correlation.type !== "toolCallId") {
		// v1 only ever targets tool call/result pairs; entryId correlation is
		// reserved for future strategies and intentionally not applied yet.
		return { applied: false, charsRemoved: 0 };
	}
	const pair = findToolCallPairIndices(messages, decision.correlation.toolCallId, pairIndex);

	if (decision.kind === "tool_result_content") {
		if (pair.resultIndex === undefined) return { applied: false, charsRemoved: 0 };
		const resultMessage = messages[pair.resultIndex] as MinimalToolResultMessage;
		const charsRemoved = contentTextLength(resultMessage.content);
		const placeholder = decision.placeholder ?? buildPlaceholderText(decision.reason, charsRemoved);
		messages[pair.resultIndex] = {
			...resultMessage,
			content: [{ type: "text", text: placeholder }],
		};
		return { applied: true, charsRemoved };
	}

	if (decision.kind === "tool_call_input") {
		if (pair.assistantIndex === undefined || pair.toolCallBlockIndex === undefined) {
			return { applied: false, charsRemoved: 0 };
		}
		if (pair.resultIndex === undefined) return { applied: false, charsRemoved: 0 };
		const resultMessage = messages[pair.resultIndex] as MinimalToolResultMessage;
		// Only errored-call inputs may ever be redacted (ticket invariant).
		if (!resultMessage.isError) return { applied: false, charsRemoved: 0 };

		const assistantMessage = messages[pair.assistantIndex] as MinimalAssistantMessage;
		const block = assistantMessage.content[pair.toolCallBlockIndex] as MinimalToolCallContent;
		const charsRemoved = JSON.stringify(block.arguments ?? {}).length;
		const newContent = assistantMessage.content.slice();
		newContent[pair.toolCallBlockIndex] = {
			...block,
			arguments: { pruned: true, reason: decision.reason },
		};
		messages[pair.assistantIndex] = { ...assistantMessage, content: newContent };
		return { applied: true, charsRemoved };
	}

	return { applied: false, charsRemoved: 0 };
}

function resolveToolNameForPair(pair: ToolCallPairIndices, messages: MinimalMessage[]): string | undefined {
	if (pair.resultIndex !== undefined) {
		return (messages[pair.resultIndex] as MinimalToolResultMessage).toolName;
	}
	if (pair.assistantIndex !== undefined && pair.toolCallBlockIndex !== undefined) {
		const assistantMessage = messages[pair.assistantIndex] as MinimalAssistantMessage;
		const block = assistantMessage.content[pair.toolCallBlockIndex] as MinimalToolCallContent | undefined;
		return block?.name;
	}
	return undefined;
}

function resolveArgStringsForPair(pair: ToolCallPairIndices, messages: MinimalMessage[]): string[] {
	if (pair.assistantIndex === undefined || pair.toolCallBlockIndex === undefined) return [];
	const assistantMessage = messages[pair.assistantIndex] as MinimalAssistantMessage;
	const block = assistantMessage.content[pair.toolCallBlockIndex] as MinimalToolCallContent | undefined;
	return collectArgStringValues(block?.arguments);
}

export function isDecisionProtected(
	decision: PruneDecisionRecord,
	messages: MinimalMessage[],
	protections: PruneProtections,
	recencyBoundaryIndex: number,
	pairIndex?: Map<string, ToolCallPairIndices>,
): boolean {
	if (decision.correlation.type !== "toolCallId") return true; // no safe way to check protections yet
	const pair = findToolCallPairIndices(messages, decision.correlation.toolCallId, pairIndex);
	if (pair.resultIndex !== undefined && isWithinRecencyWindow(pair.resultIndex, recencyBoundaryIndex)) return true;
	if (pair.assistantIndex !== undefined && isWithinRecencyWindow(pair.assistantIndex, recencyBoundaryIndex)) return true;

	const toolName = resolveToolNameForPair(pair, messages);
	if (isProtectedToolName(toolName, protections)) return true;

	const argStrings = resolveArgStringsForPair(pair, messages);
	if (argStrings.some((value) => isProtectedPath(value, protections))) return true;

	return false;
}

// ============================================================================
// Savings estimation, cache cost model & net-benefit gate (pe-s2ho)
// ============================================================================

export interface DecisionSavingsEstimate {
	/** Earliest message index this decision changes; used for cache-bust tail sizing. */
	position: number;
	/** Estimated tokens removed by this decision, via the shared estimator. */
	tokensRemoved: number;
}

/**
 * Estimate the token savings and affected position of a single decision
 * without mutating the caller's `messages`. Returns undefined when the
 * decision's target is absent or the decision would not actually apply
 * (mirrors `applyPruneDecision`'s no-op conditions).
 */
export function estimateDecisionSavings(
	messages: MinimalMessage[],
	decision: PruneDecisionRecord,
	estimateTokens: TokenEstimator = estimateTokensForText,
	pairIndex?: Map<string, ToolCallPairIndices>,
): DecisionSavingsEstimate | undefined {
	if (decision.correlation.type !== "toolCallId") return undefined;
	const pair = findToolCallPairIndices(messages, decision.correlation.toolCallId, pairIndex);

	// Apply against a shallow copy of the array (not the message objects) so
	// the caller's messages/content are never mutated by this preview. Indices
	// in `pairIndex` (built from `messages`) remain valid against `preview`
	// since slice() preserves length/order.
	const preview = messages.slice();
	const result = applyPruneDecision(preview, decision, pairIndex);
	if (!result.applied) return undefined;

	if (decision.kind === "tool_result_content") {
		if (pair.resultIndex === undefined) return undefined;
		const before = messages[pair.resultIndex] as MinimalToolResultMessage;
		const after = preview[pair.resultIndex] as MinimalToolResultMessage;
		const tokensBefore = estimateTokensForContent(before.content);
		const tokensAfter = estimateTokensForContent(after.content);
		return { position: pair.resultIndex, tokensRemoved: Math.max(0, tokensBefore - tokensAfter) };
	}

	if (decision.kind === "tool_call_input") {
		if (pair.assistantIndex === undefined || pair.toolCallBlockIndex === undefined) return undefined;
		const beforeBlock = (messages[pair.assistantIndex] as MinimalAssistantMessage).content[
			pair.toolCallBlockIndex
		] as MinimalToolCallContent;
		const afterBlock = (preview[pair.assistantIndex] as MinimalAssistantMessage).content[
			pair.toolCallBlockIndex
		] as MinimalToolCallContent;
		const tokensBefore = estimateTokens(JSON.stringify(beforeBlock.arguments ?? {}));
		const tokensAfter = estimateTokens(JSON.stringify(afterBlock.arguments ?? {}));
		return { position: pair.assistantIndex, tokensRemoved: Math.max(0, tokensBefore - tokensAfter) };
	}

	return undefined;
}

/**
 * Estimate the character savings of a single decision (pe-qdzb), i.e. the
 * same before/after delta basis as `estimateDecisionSavings` but measured in
 * raw characters rather than estimated tokens. Used by the pipeline to
 * enforce `thresholds.minCharsSaved` against fresh automatic proposals
 * *before* they reach the net-benefit gate. Returns undefined under the same
 * conditions as `estimateDecisionSavings` (target absent / would not apply).
 * Mirrors `estimateDecisionSavings`'s `Math.max(0, ...)` clamp, so a
 * decision whose placeholder text would be LONGER than the original content
 * (negative savings) is reported as 0 chars saved, not a negative number.
 */
export function estimateDecisionCharsSaved(
	messages: MinimalMessage[],
	decision: PruneDecisionRecord,
	pairIndex?: Map<string, ToolCallPairIndices>,
): number | undefined {
	if (decision.correlation.type !== "toolCallId") return undefined;
	const pair = findToolCallPairIndices(messages, decision.correlation.toolCallId, pairIndex);

	// Same non-mutating preview approach as `estimateDecisionSavings`.
	const preview = messages.slice();
	const result = applyPruneDecision(preview, decision, pairIndex);
	if (!result.applied) return undefined;

	if (decision.kind === "tool_result_content") {
		if (pair.resultIndex === undefined) return undefined;
		const before = messages[pair.resultIndex] as MinimalToolResultMessage;
		const after = preview[pair.resultIndex] as MinimalToolResultMessage;
		const charsBefore = contentTextLength(before.content);
		const charsAfter = contentTextLength(after.content);
		return Math.max(0, charsBefore - charsAfter);
	}

	if (decision.kind === "tool_call_input") {
		if (pair.assistantIndex === undefined || pair.toolCallBlockIndex === undefined) return undefined;
		const beforeBlock = (messages[pair.assistantIndex] as MinimalAssistantMessage).content[
			pair.toolCallBlockIndex
		] as MinimalToolCallContent;
		const afterBlock = (preview[pair.assistantIndex] as MinimalAssistantMessage).content[
			pair.toolCallBlockIndex
		] as MinimalToolCallContent;
		const charsBefore = JSON.stringify(beforeBlock.arguments ?? {}).length;
		const charsAfter = JSON.stringify(afterBlock.arguments ?? {}).length;
		return Math.max(0, charsBefore - charsAfter);
	}

	return undefined;
}

/**
 * Cache-aware cost model (pe-s2ho ticket NOTES, binding over the looser prose
 * in the ticket body): prompt caches are prefix-based, so pruning at message
 * position p invalidates ('busts') the cached tail from p onward exactly
 * once. Modelled per NOTES as:
 *
 *   penalty          ~= (1 - r) * tailTokensAfterEarliestChange
 *   recurringSaving  ~= r * tokensRemoved
 *   breakEvenCalls   =  penalty / recurringSaving
 *
 * where r is `cachedPriceRatio` (fraction of full price still paid for
 * cached tokens; default 0.1). `breakEvenCalls` is the number of subsequent
 * calls needed to amortize the one-time cache bust via the recurring saving.
 */
export interface CacheCostModelInput {
	tailTokensAfterEarliestChange: number;
	tokensRemoved: number;
	cachedPriceRatio: number;
}

export interface CacheCostModelResult {
	penalty: number;
	recurringSaving: number;
	/** Infinity when there is a penalty but no recurring saving to amortize it. */
	breakEvenCalls: number;
}

export function computeCacheCostModel(input: CacheCostModelInput): CacheCostModelResult {
	const r = Number.isFinite(input.cachedPriceRatio) ? Math.min(1, Math.max(0, input.cachedPriceRatio)) : DEFAULT_CACHED_PRICE_RATIO;
	const tailTokens = Math.max(0, input.tailTokensAfterEarliestChange);
	const tokensRemoved = Math.max(0, input.tokensRemoved);
	const penalty = (1 - r) * tailTokens;
	const recurringSaving = r * tokensRemoved;
	const breakEvenCalls = recurringSaving > 0 ? penalty / recurringSaving : penalty > 0 ? Infinity : 0;
	return { penalty, recurringSaving, breakEvenCalls };
}

/** A fresh, automatic (non-manual, non-persisted) decision pending the net-benefit gate. */
export interface GateCandidate {
	decision: PruneDecisionRecord;
	position: number;
	tokensRemoved: number;
}

export interface NetBenefitGateResult {
	accepted: PruneDecisionRecord[];
	rejected: PruneDecisionRecord[];
	mode: GateMode;
	threshold: number;
	earliestPosition: number | undefined;
	tailTokensAfterEarliestChange: number;
	totalTokensRemoved: number;
	cost: CacheCostModelResult | undefined;
}

/**
 * Net-benefit gate (pe-s2ho): decides whether fresh, automatic prune
 * proposals are worth the one-time cache bust they cause. Batch-aware: since
 * prompt caches are a single linear prefix, every candidate in one pipeline
 * pass is "behind" the earliest changed position and shares that one cache
 * bust, so the whole batch is evaluated (and accepted/rejected) jointly.
 *
 * Already-applied/persisted decisions and manual decisions never reach this
 * gate (the pipeline routes them around it entirely; see
 * `runDynamicContextPruningPipeline`).
 */
export function evaluateNetBenefitGate(
	candidates: GateCandidate[],
	messages: MinimalMessage[],
	gateConfig: PruneGateConfig,
	agentState: AgentState = "idle",
	estimateTokens: TokenEstimator = estimateTokensForText,
): NetBenefitGateResult {
	const threshold = resolveBreakEvenThreshold(gateConfig, agentState);

	if (candidates.length === 0) {
		return {
			accepted: [],
			rejected: [],
			mode: gateConfig.mode,
			threshold,
			earliestPosition: undefined,
			tailTokensAfterEarliestChange: 0,
			totalTokensRemoved: 0,
			cost: undefined,
		};
	}

	if (gateConfig.mode === "off") {
		// Gate fully bypassed: no cost modelling performed at all.
		return {
			accepted: candidates.map((c) => c.decision),
			rejected: [],
			mode: "off",
			threshold,
			earliestPosition: undefined,
			tailTokensAfterEarliestChange: 0,
			totalTokensRemoved: candidates.reduce((sum, c) => sum + c.tokensRemoved, 0),
			cost: undefined,
		};
	}

	const earliestPosition = Math.min(...candidates.map((c) => c.position));
	const tailTokensAfterEarliestChange = estimateTailTokens(messages, earliestPosition, estimateTokens);
	const totalTokensRemoved = candidates.reduce((sum, c) => sum + c.tokensRemoved, 0);
	const cost = computeCacheCostModel({
		tailTokensAfterEarliestChange,
		tokensRemoved: totalTokensRemoved,
		cachedPriceRatio: gateConfig.cachedPriceRatio,
	});

	if (gateConfig.mode === "always-apply" || cost.breakEvenCalls <= threshold) {
		return {
			accepted: candidates.map((c) => c.decision),
			rejected: [],
			mode: gateConfig.mode,
			threshold,
			earliestPosition,
			tailTokensAfterEarliestChange,
			totalTokensRemoved,
			cost,
		};
	}

	return {
		accepted: [],
		rejected: candidates.map((c) => c.decision),
		mode: gateConfig.mode,
		threshold,
		earliestPosition,
		tailTokensAfterEarliestChange,
		totalTokensRemoved,
		cost,
	};
}

// ============================================================================
// Savings accounting & stats API (consumed by pe-8re9 /context-pruning stats
// and the pe-e9pv benchmark harness)
// ============================================================================

export interface PruneStatsRecord {
	idempotencyKey: string;
	strategyId: string;
	tokensRemoved: number;
	appliedAt: string;
}

export function buildStatsRecord(
	decision: PruneDecisionRecord,
	tokensRemoved: number,
	appliedAt: string = new Date().toISOString(),
): PruneStatsRecord {
	return {
		idempotencyKey: decision.idempotencyKey,
		strategyId: decision.strategyId,
		tokensRemoved: Math.max(0, tokensRemoved),
		appliedAt,
	};
}

/** Parse a persisted stats CustomEntry payload back into a record. Returns undefined if malformed. */
export function parseStatsRecord(data: unknown): PruneStatsRecord | undefined {
	if (!data || typeof data !== "object") return undefined;
	const raw = data as Record<string, unknown>;
	if (typeof raw.idempotencyKey !== "string" || !raw.idempotencyKey) return undefined;
	if (typeof raw.strategyId !== "string") return undefined;
	if (typeof raw.tokensRemoved !== "number" || !Number.isFinite(raw.tokensRemoved)) return undefined;
	if (typeof raw.appliedAt !== "string") return undefined;
	return { idempotencyKey: raw.idempotencyKey, strategyId: raw.strategyId, tokensRemoved: raw.tokensRemoved, appliedAt: raw.appliedAt };
}

export interface StrategyStats {
	tokensRemoved: number;
	pruneCount: number;
}

export interface CumulativePruneStats {
	totalTokensRemoved: number;
	totalPruneCount: number;
	byStrategy: Record<string, StrategyStats>;
}

export function emptyCumulativeStats(): CumulativePruneStats {
	return { totalTokensRemoved: 0, totalPruneCount: 0, byStrategy: {} };
}

/** Fold a single stats record into cumulative stats (pure; returns a new object). */
export function foldStatsRecord(stats: CumulativePruneStats, record: PruneStatsRecord): CumulativePruneStats {
	const existing = stats.byStrategy[record.strategyId] ?? { tokensRemoved: 0, pruneCount: 0 };
	return {
		totalTokensRemoved: stats.totalTokensRemoved + record.tokensRemoved,
		totalPruneCount: stats.totalPruneCount + 1,
		byStrategy: {
			...stats.byStrategy,
			[record.strategyId]: {
				tokensRemoved: existing.tokensRemoved + record.tokensRemoved,
				pruneCount: existing.pruneCount + 1,
			},
		},
	};
}

export interface RebuiltStatsState {
	stats: CumulativePruneStats;
	seenKeys: Set<string>;
}

/**
 * Rebuild cumulative stats from persisted CustomEntry records on a branch.
 * Idempotent/rebuildable like `rebuildDecisionStateFromEntries`: duplicate or
 * replayed entries for the same idempotencyKey collapse to a single fold.
 */
export function rebuildStatsStateFromEntries(entries: MinimalSessionEntry[]): RebuiltStatsState {
	let stats = emptyCumulativeStats();
	const seenKeys = new Set<string>();
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== STATS_ENTRY_TYPE) continue;
		const record = parseStatsRecord(entry.data);
		if (!record) continue;
		if (seenKeys.has(record.idempotencyKey)) continue;
		seenKeys.add(record.idempotencyKey);
		stats = foldStatsRecord(stats, record);
	}
	return { stats, seenKeys };
}

/** Live (non-persisted) snapshot of raw vs effective (post-prune) context size for a single call. */
export interface ContextSizeSnapshot {
	rawTokens: number;
	effectiveTokens: number;
	tokensSavedThisCall: number;
}

export function computeContextSizeSnapshot(
	rawMessages: MinimalMessage[],
	effectiveMessages: MinimalMessage[],
	estimateTokens: TokenEstimator = estimateTokensForText,
): ContextSizeSnapshot {
	const rawTokens = estimateTailTokens(rawMessages, 0, estimateTokens);
	const effectiveTokens = estimateTailTokens(effectiveMessages, 0, estimateTokens);
	return { rawTokens, effectiveTokens, tokensSavedThisCall: Math.max(0, rawTokens - effectiveTokens) };
}

// ============================================================================
// Strategy registry (populated by follow-up tickets pe-u8gd/pe-qs8j)
// ============================================================================

export interface StrategyProposeInput {
	messages: MinimalMessage[];
	protections: PruneProtections;
	estimateTokens: TokenEstimator;
	/**
	 * Full config, so strategies can read their own enable flag and any
	 * strategy-specific settings (e.g. error-purge's `minTurnsOld`).
	 * Protection/recency filtering is handled centrally by the pipeline
	 * (see `isDecisionProtected`); strategies do not need to re-check it.
	 */
	config: DynamicContextPruningConfig;
	/**
	 * Session working directory (pe-qs8j), used to normalize relative file
	 * paths (e.g. from read/write/edit tool args) against an absolute base so
	 * the same file referenced via different relative/absolute spellings is
	 * recognized as the same path. Optional/backward-compatible: undefined
	 * when the caller doesn't have a cwd available (e.g. older callers/tests);
	 * strategies that need it should degrade gracefully (best-effort relative
	 * normalization only) rather than throw.
	 */
	cwd?: string;
}

export interface PruneStrategy {
	id: string;
	propose(input: StrategyProposeInput): ProposedPrune[];
}

// ----------------------------------------------------------------------
// Argument canonicalization (shared by the dedupe strategy; exported for
// direct unit testing of key-order/nesting/whitespace behavior).
// ----------------------------------------------------------------------

/**
 * Recursively canonicalize a parsed tool-call arguments value: object keys
 * are sorted (recursively); array order and all string/number/boolean VALUES
 * are left untouched (per ticket: never normalize argument values beyond
 * structural key ordering). Serializing the result via JSON.stringify then
 * yields a deterministic, whitespace-free representation regardless of the
 * original key order.
 */
export function canonicalizeArguments(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => canonicalizeArguments(item));
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(obj).sort()) sorted[key] = canonicalizeArguments(obj[key]);
		return sorted;
	}
	return value;
}

/** Canonical JSON string for a tool call's arguments (see `canonicalizeArguments`). */
export function canonicalizeArgumentsJSON(args: unknown): string {
	return JSON.stringify(canonicalizeArguments(args ?? {}));
}

/** Dedup key: identical tool name (case-insensitive) + canonicalized args JSON. */
export function buildDedupeKey(toolName: string, args: unknown): string {
	return `${toolName.trim().toLowerCase()}::${canonicalizeArgumentsJSON(args)}`;
}

/** Exported for /prune picker item building (pe-8re9) and direct unit testing. */
export interface ToolCallOccurrence {
	toolCallId: string;
	toolName: string;
	arguments: Record<string, unknown> | undefined;
	assistantIndex: number;
	resultIndex: number;
	isError: boolean;
}

/** Collect every assistant toolCall block that has a matching toolResult message, in message order. */
export function collectCompletedToolCallOccurrences(messages: MinimalMessage[]): ToolCallOccurrence[] {
	const resultIndexById = new Map<string, number>();
	const isErrorById = new Map<string, boolean>();
	messages.forEach((message, index) => {
		if (message.role === "toolResult") {
			const result = message as MinimalToolResultMessage;
			resultIndexById.set(result.toolCallId, index);
			isErrorById.set(result.toolCallId, result.isError);
		}
	});

	const occurrences: ToolCallOccurrence[] = [];
	messages.forEach((message, assistantIndex) => {
		if (message.role !== "assistant") return;
		for (const block of (message as MinimalAssistantMessage).content) {
			if (block.type !== "toolCall") continue;
			const resultIndex = resultIndexById.get(block.id);
			if (resultIndex === undefined) continue; // still in flight; nothing to dedupe/purge yet
			occurrences.push({
				toolCallId: block.id,
				toolName: block.name,
				arguments: block.arguments,
				assistantIndex,
				resultIndex,
				isError: isErrorById.get(block.id) ?? false,
			});
		}
	});
	return occurrences;
}

// ----------------------------------------------------------------------
// Strategy 1: deduplication (pe-u8gd)
// ----------------------------------------------------------------------

/** Placeholder text for a duplicate tool result whose content was replaced. */
export function buildDedupePlaceholder(toolName: string, newestToolCallId: string): string {
	return `[pruned by ${EXTENSION_ID}: duplicate ${toolName} call result; see newest occurrence (call ${newestToolCallId})]`;
}

export const dedupeStrategy: PruneStrategy = {
	id: DEDUPE_STRATEGY_ID,
	propose(input: StrategyProposeInput): ProposedPrune[] {
		if (input.config.strategies.dedupe.enabled === false) return [];

		const occurrences = collectCompletedToolCallOccurrences(input.messages);
		const groups = new Map<string, ToolCallOccurrence[]>();
		for (const occurrence of occurrences) {
			const key = buildDedupeKey(occurrence.toolName, occurrence.arguments);
			const group = groups.get(key);
			if (group) group.push(occurrence);
			else groups.set(key, [occurrence]);
		}

		const proposals: ProposedPrune[] = [];
		for (const group of groups.values()) {
			if (group.length < 2) continue;
			// Occurrences are collected in message order, so the last one is newest.
			const newest = group[group.length - 1];
			for (const occurrence of group.slice(0, -1)) {
				proposals.push({
					strategyId: DEDUPE_STRATEGY_ID,
					toolCallId: occurrence.toolCallId,
					kind: "tool_result_content",
					reason: `duplicate ${occurrence.toolName} call; see result of call ${newest.toolCallId}`,
					placeholder: buildDedupePlaceholder(occurrence.toolName, newest.toolCallId),
				});
			}
		}
		return proposals;
	},
};

// ----------------------------------------------------------------------
// Strategy 2: error-input purge (pe-u8gd)
// ----------------------------------------------------------------------

export const errorPurgeStrategy: PruneStrategy = {
	id: ERROR_PURGE_STRATEGY_ID,
	propose(input: StrategyProposeInput): ProposedPrune[] {
		if (input.config.strategies.errorPurge.enabled === false) return [];
		const minTurnsOld = input.config.strategies.errorPurge.minTurnsOld;

		const occurrences = collectCompletedToolCallOccurrences(input.messages);
		const proposals: ProposedPrune[] = [];
		for (const occurrence of occurrences) {
			if (!occurrence.isError) continue;
			const turnsElapsed = computeTurnsElapsedSince(input.messages, occurrence.assistantIndex);
			// Strictly older than `minTurnsOld` turns (e.g. default 4: eligible at 5+, not at exactly 4).
			if (turnsElapsed <= minTurnsOld) continue;
			proposals.push({
				strategyId: ERROR_PURGE_STRATEGY_ID,
				toolCallId: occurrence.toolCallId,
				kind: "tool_call_input",
				reason: `errored ${occurrence.toolName} call input older than ${minTurnsOld} turns`,
			});
		}
		return proposals;
	},
};

// ----------------------------------------------------------------------
// Strategy 3: superseded file operations (pe-qs8j)
// ----------------------------------------------------------------------
//
// When the same file path is read and/or written multiple times in a
// session, older read/write/edit tool *outputs* for that path can become
// stale relative to a later operation. This strategy proposes replacing
// those older outputs with a placeholder, per the following CONSERVATIVE,
// binding rules (do not loosen without an architect decision):
//
//   1. A full-file read (no offset/limit args) is superseded by a LATER
//      full-file read of the same normalized path.
//   2. A partial read (offset/limit args present) is NOT superseded by a
//      later partial read UNLESS the later read's range fully covers the
//      earlier one's range. If range coverage can't be reliably determined
//      from the args (e.g. earlier read has no limit — reads to EOF — but
//      the later read is bounded), skip: do not propose supersession.
//      Full-file reads are represented as the range [1, EOF); comparing
//      that representation via the same coverage check naturally satisfies
//      rule 1 as a special case of rule 2 (see `readRangeCovers`).
//   3. ANY read of a path (full or partial) is superseded once a LATER
//      *successful* (non-error) write/edit to that same path occurs — the
//      old read output is now known-stale regardless of read-vs-read range
//      comparisons. The placeholder explicitly notes the file has since
//      changed. An ERRORED later write/edit does NOT count (the file may be
//      unchanged; conservative).
//   4. Older write/edit outputs for a path are superseded by a LATER
//      *successful* write/edit to that same path (again, a later errored
//      write/edit never supersedes). Write/edit tool outputs are usually
//      small, so proposals are only ever emitted when there is a non-empty
//      result to prune; the shared net-benefit gate additionally decides
//      whether the estimated savings are worth the cache-bust cost.
//
// The NEWEST operation for a given path (by message order) is never
// superseded/pruned, regardless of kind — there is nothing later to point
// the placeholder at.
//
// Path extraction is defensive: pi's built-in `read`/`write`/`edit` tools
// all accept a `path` argument (see packages/coding-agent/src/core/tools/
// {read,write,edit}.ts); some tool-call renderers also fall back to a
// legacy `file_path` name, and `filePath` is accepted as a further
// defensive fallback. `bash` is explicitly OUT of scope: this strategy does
// not attempt to parse shell commands for file paths.

const SUPERSEDED_FILE_OPS_STRATEGY_ID = "superseded-file-ops";

type FileOpKind = "read" | "write" | "edit";

const FILE_OP_TOOL_NAMES: ReadonlySet<string> = new Set(["read", "write", "edit"]);

/** Extract a file path from tool-call arguments, checking common arg names defensively. */
export function extractFileOpPathArg(args: Record<string, unknown> | undefined): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const raw = (args.path ?? args.file_path ?? args.filePath) as unknown;
	return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

/**
 * Normalize a raw path for path-identity comparisons. When `cwd` is
 * provided, relative paths are resolved against it so `"a.txt"`,
 * `"./a.txt"`, and `"<cwd>/a.txt"` are all recognized as the same file.
 * Without a `cwd` (best-effort/back-compat), only structural normalization
 * (`./` prefixes, redundant separators) is applied — relative vs. absolute
 * spellings of the same file will NOT be unified in that case.
 */
export function normalizeFileOpsPath(rawPath: string, cwd: string | undefined): string {
	const trimmed = rawPath.trim();
	if (!trimmed) return trimmed;
	const absoluteOrRelative = cwd && !path.isAbsolute(trimmed) ? path.resolve(cwd, trimmed) : trimmed;
	return path.normalize(absoluteOrRelative);
}

/** A read's line range. `end === undefined` means the read continues through end-of-file. */
export interface FileReadRange {
	start: number;
	end: number | undefined;
}

/** Compute a read's line range from its `offset`/`limit` args (see pi's `read` tool: 1-indexed offset, line-count limit). */
export function computeFileReadRange(args: Record<string, unknown> | undefined): FileReadRange {
	const offsetRaw = args?.offset;
	const limitRaw = args?.limit;
	const offset = typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : undefined;
	const limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
	const start = offset ?? 1;
	const end = limit !== undefined ? start + limit - 1 : undefined;
	return { start, end };
}

/** True when a range represents a full-file read (starts at line 1, no limit). */
export function isFullFileReadRange(range: FileReadRange): boolean {
	return range.start === 1 && range.end === undefined;
}

/**
 * Conservative range-coverage check: does `later` fully cover `earlier`?
 * Implements rules 1+2 above via one unified representation (a full-file
 * read is just the range [1, EOF)):
 *   - `later` must start at or before `earlier` (later.start <= earlier.start).
 *   - If `later` has no end (reads to EOF), it covers any bounded-or-unbounded
 *     earlier range that starts at/after it (the earlier read already proved
 *     the file has at least `earlier.end` lines, if bounded).
 *   - If `later` IS bounded but `earlier` is unbounded (reads to EOF),
 *     coverage can't be reliably determined (later might stop short of the
 *     file's actual end) — conservatively return false (skip).
 *   - Otherwise (both bounded), `later` covers `earlier` iff later.end >= earlier.end.
 */
export function readRangeCovers(later: FileReadRange, earlier: FileReadRange): boolean {
	if (later.start > earlier.start) return false;
	if (later.end === undefined) return true;
	if (earlier.end === undefined) return false;
	return later.end >= earlier.end;
}

interface FileOpOccurrence {
	toolCallId: string;
	kind: FileOpKind;
	normalizedPath: string;
	range: FileReadRange | undefined;
	isError: boolean;
	resultTextLength: number;
	assistantIndex: number;
}

function collectFileOpOccurrences(messages: MinimalMessage[], cwd: string | undefined): FileOpOccurrence[] {
	const occurrences: FileOpOccurrence[] = [];
	for (const occurrence of collectCompletedToolCallOccurrences(messages)) {
		const kind = occurrence.toolName.trim().toLowerCase();
		if (!FILE_OP_TOOL_NAMES.has(kind)) continue;
		const rawPath = extractFileOpPathArg(occurrence.arguments);
		if (!rawPath) continue; // can't safely correlate without a path
		const normalizedPath = normalizeFileOpsPath(rawPath, cwd);
		if (!normalizedPath) continue;
		const resultMessage = messages[occurrence.resultIndex] as MinimalToolResultMessage;
		occurrences.push({
			toolCallId: occurrence.toolCallId,
			kind: kind as FileOpKind,
			normalizedPath,
			range: kind === "read" ? computeFileReadRange(occurrence.arguments) : undefined,
			isError: occurrence.isError,
			resultTextLength: contentTextLength(resultMessage.content),
			assistantIndex: occurrence.assistantIndex,
		});
	}
	return occurrences;
}

function buildFileChangedPlaceholder(normalizedPath: string, supersedingKind: FileOpKind, supersedingToolCallId: string): string {
	return `[pruned by ${EXTENSION_ID}: file has since changed — ${normalizedPath} was modified by a later ${supersedingKind} (call ${supersedingToolCallId})]`;
}

function buildSupersededReadPlaceholder(normalizedPath: string, supersedingToolCallId: string): string {
	return `[pruned by ${EXTENSION_ID}: superseded by newer read of ${normalizedPath} (call ${supersedingToolCallId})]`;
}

function buildSupersededWritePlaceholder(normalizedPath: string, supersedingKind: FileOpKind, supersedingToolCallId: string): string {
	return `[pruned by ${EXTENSION_ID}: superseded by newer ${supersedingKind} of ${normalizedPath} (call ${supersedingToolCallId})]`;
}

export const supersededFileOpsStrategy: PruneStrategy = {
	id: SUPERSEDED_FILE_OPS_STRATEGY_ID,
	propose(input: StrategyProposeInput): ProposedPrune[] {
		if (input.config.strategies.supersededFileOps.enabled === false) return [];

		const occurrences = collectFileOpOccurrences(input.messages, input.cwd);
		const byPath = new Map<string, FileOpOccurrence[]>();
		for (const occurrence of occurrences) {
			const group = byPath.get(occurrence.normalizedPath);
			if (group) group.push(occurrence);
			else byPath.set(occurrence.normalizedPath, [occurrence]);
		}

		const proposals: ProposedPrune[] = [];
		for (const group of byPath.values()) {
			// `group` is already in message/chronological order because
			// `collectCompletedToolCallOccurrences` iterates messages in order.
			//
			// Single reverse pass (pe-e0zd): instead of `group.slice(i + 1).find(...)`
			// per index (O(k^2) allocations+scans for a group of size k), walk the
			// group back-to-front and maintain:
			//  - `nearestLaterSuccessfulWrite`: the nearest (chronologically first)
			//    later successful write/edit, updated as we pass one going backward.
			//    This is exactly equivalent to `later.find(non-read && !isError)`
			//    because `later` preserves chronological order and `.find` returns
			//    the first (nearest) match.
			//  - `nearestCoveringReads`: later reads not yet known-redundant, nearest
			//    first. A read R dominates (renders redundant) any later-tracked read
			//    E once `readRangeCovers(R.range, E.range)` holds, because coverage is
			//    transitive and R is nearer than E — so R already satisfies anything
			//    E would have satisfied, and is checked first anyway. Dominated reads
			//    are dropped on insert, which keeps this list small in the common case
			//    (e.g. monotonically-widening re-reads of the same file) while still
			//    producing byte-for-byte the same first-match result as the original
			//    forward `.find`.
			let nearestLaterSuccessfulWrite: FileOpOccurrence | undefined;
			const nearestCoveringReads: FileOpOccurrence[] = [];

			for (let i = group.length - 1; i >= 0; i--) {
				const occurrence = group[i];
				// Never supersede the newest operation for this path (rule: "never
				// supersede the newest op for a path") — but still fold it into the
				// tracking state below so earlier occurrences can see it as "later".
				if (i !== group.length - 1) {
					if (occurrence.kind === "read") {
						// Rule 3 takes priority: any later successful write/edit makes
						// this read stale outright, regardless of read-vs-read coverage.
						if (nearestLaterSuccessfulWrite) {
							if (occurrence.resultTextLength > 0) {
								proposals.push({
									strategyId: SUPERSEDED_FILE_OPS_STRATEGY_ID,
									toolCallId: occurrence.toolCallId,
									kind: "tool_result_content",
									reason: `${occurrence.normalizedPath} has since been modified (see ${nearestLaterSuccessfulWrite.kind} call ${nearestLaterSuccessfulWrite.toolCallId})`,
									placeholder: buildFileChangedPlaceholder(
										occurrence.normalizedPath,
										nearestLaterSuccessfulWrite.kind,
										nearestLaterSuccessfulWrite.toolCallId,
									),
								});
							}
						} else if (occurrence.range !== undefined) {
							// Rules 1+2: superseded by a later read whose range covers this one's.
							const occurrenceRange = occurrence.range;
							const laterCoveringRead = nearestCoveringReads.find(
								(candidate) => candidate.range !== undefined && readRangeCovers(candidate.range, occurrenceRange),
							);
							if (laterCoveringRead && occurrence.resultTextLength > 0) {
								proposals.push({
									strategyId: SUPERSEDED_FILE_OPS_STRATEGY_ID,
									toolCallId: occurrence.toolCallId,
									kind: "tool_result_content",
									reason: `superseded by newer read of ${occurrence.normalizedPath} (call ${laterCoveringRead.toolCallId})`,
									placeholder: buildSupersededReadPlaceholder(occurrence.normalizedPath, laterCoveringRead.toolCallId),
								});
							}
						}
					} else if (nearestLaterSuccessfulWrite) {
						// occurrence.kind is "write" or "edit": rule 4 — superseded only by a
						// LATER *successful* write/edit (an errored later write/edit never
						// supersedes; reads never supersede writes/edits).
						if (occurrence.resultTextLength > 0) {
							proposals.push({
								strategyId: SUPERSEDED_FILE_OPS_STRATEGY_ID,
								toolCallId: occurrence.toolCallId,
								kind: "tool_result_content",
								reason: `superseded by newer ${nearestLaterSuccessfulWrite.kind} of ${occurrence.normalizedPath} (call ${nearestLaterSuccessfulWrite.toolCallId})`,
								placeholder: buildSupersededWritePlaceholder(
									occurrence.normalizedPath,
									nearestLaterSuccessfulWrite.kind,
									nearestLaterSuccessfulWrite.toolCallId,
								),
							});
						}
					}
				}

				// Fold this occurrence into the tracking state for the next (earlier) iteration.
				if (occurrence.kind !== "read") {
					if (!occurrence.isError) nearestLaterSuccessfulWrite = occurrence;
				} else if (occurrence.range !== undefined) {
					const occurrenceRange = occurrence.range;
					for (let j = nearestCoveringReads.length - 1; j >= 0; j--) {
						const existing = nearestCoveringReads[j];
						if (existing.range !== undefined && readRangeCovers(occurrenceRange, existing.range)) {
							nearestCoveringReads.splice(j, 1);
						}
					}
					nearestCoveringReads.unshift(occurrence);
				}
			}
		}
		return proposals;
	},
};

/**
 * Strategies PROPOSE prunes; only this pipeline ever APPLIES them.
 */
export const STRATEGIES: PruneStrategy[] = [dedupeStrategy, errorPurgeStrategy, supersededFileOpsStrategy];

function collectProposals(input: StrategyProposeInput): ProposedPrune[] {
	const proposals: ProposedPrune[] = [];
	for (const strategy of STRATEGIES) {
		try {
			proposals.push(...strategy.propose(input));
		} catch {
			// A misbehaving strategy must never break the pipeline or corrupt context.
		}
	}
	return proposals;
}

// ============================================================================
// Pipeline
// ============================================================================

export interface PipelineInput {
	messages: MinimalMessage[];
	config: DynamicContextPruningConfig;
	persistedDecisions: PruneDecisionRecord[];
	/** Idempotency keys already known/persisted; used to avoid re-emitting appendEntry calls. */
	knownIdempotencyKeys: ReadonlySet<string>;
	/**
	 * Idempotency keys most-recently restored/undone via the /prune picker
	 * (pe-8re9; see `resolvePruneTombstoneState`). Fresh AUTOMATIC proposals
	 * matching one of these keys are dropped so a restored decision does not
	 * silently re-apply on the very next context event. Manual re-prunes
	 * always use a fresh idempotencyKey namespaced by "manual" (see
	 * `buildManualPruneProposal`), so they are unaffected by this filter and
	 * always work regardless of tombstone state. Optional/back-compat: an
	 * absent set behaves as if nothing was ever restored.
	 */
	restoredIdempotencyKeys?: ReadonlySet<string>;
	/**
	 * State-conditioning hook (pe-s2ho notes): lets the net-benefit gate use a
	 * different break-even threshold depending on whether the agent is
	 * mid-loop vs idle. Defaults to "idle" until callers wire real detection.
	 */
	agentState?: AgentState;
	/** Session working directory (pe-qs8j), forwarded to strategies for path normalization. */
	cwd?: string;
}

export interface PipelineResult {
	messages: MinimalMessage[];
	/** Decisions that were applied this call and are not yet persisted; caller should appendEntry these once. */
	newlyAppliedDecisions: PruneDecisionRecord[];
	/** Stats records to persist 1:1 alongside `newlyAppliedDecisions` (same idempotencyKey, same order). */
	newlyAppliedStats: PruneStatsRecord[];
	/** Live (non-persisted) snapshot of raw vs effective context size for this call. */
	contextSizeSnapshot: ContextSizeSnapshot;
	/** Net-benefit gate outcome for this call's fresh automatic proposals (debug/stats consumers). */
	gate: NetBenefitGateResult;
}

/**
 * Centrally applies persisted + freshly-proposed prune decisions to a deep
 * copy of the messages array. Strategies only propose; this function is the
 * single place that mutates content. Pairing invariants are preserved by
 * construction: messages/blocks are never added or removed, only replaced.
 *
 * Net-benefit gate (pe-s2ho): only NEW, automatic (non-manual) proposals are
 * gated; already-persisted decisions stay applied (their cache bust already
 * happened) and manual decisions always bypass the gate (user intent wins).
 */
export function runDynamicContextPruningPipeline(input: PipelineInput): PipelineResult {
	if (!input.config.enabled) {
		return {
			messages: input.messages,
			newlyAppliedDecisions: [],
			newlyAppliedStats: [],
			contextSizeSnapshot: computeContextSizeSnapshot(input.messages, input.messages),
			gate: {
				accepted: [],
				rejected: [],
				mode: input.config.gate.mode,
				threshold: resolveBreakEvenThreshold(input.config.gate, input.agentState ?? "idle"),
				earliestPosition: undefined,
				tailTokensAfterEarliestChange: 0,
				totalTokensRemoved: 0,
				cost: undefined,
			},
		};
	}

	const agentState = input.agentState ?? "idle";
	const messages = input.messages.map((message) => ({ ...message }));
	const recencyBoundaryIndex = computeRecencyBoundaryIndex(messages, input.config.protections.recentTurns);
	// Built once and reused across all protection/savings/apply checks below so
	// each per-decision lookup is O(1) instead of an O(n) rescan of `messages`
	// (pe-e0zd). Positions are stable across the apply loop below (and against
	// `input.messages`) because decisions only ever replace a message's
	// content at its existing index, never insert/remove/reorder messages.
	const pairIndex = buildToolCallPairIndex(messages);

	const proposals = collectProposals({
		messages,
		protections: input.config.protections,
		estimateTokens: estimateTokensForText,
		config: input.config,
		cwd: input.cwd,
	});

	const seenKeys = new Set(input.persistedDecisions.map((decision) => decision.idempotencyKey));
	const restoredKeys = input.restoredIdempotencyKeys ?? new Set<string>();
	const freshDecisions = proposals
		.filter((proposal) => !seenKeys.has(buildIdempotencyKey(proposal)))
		.filter((proposal) => !restoredKeys.has(buildIdempotencyKey(proposal)))
		.map((proposal) => proposalToDecisionRecord(proposal));

	// De-dup fresh proposals against each other too (multiple strategies could
	// theoretically propose the same idempotency key in one call).
	const dedupedFresh: PruneDecisionRecord[] = [];
	const freshKeys = new Set<string>();
	for (const decision of freshDecisions) {
		if (freshKeys.has(decision.idempotencyKey)) continue;
		freshKeys.add(decision.idempotencyKey);
		dedupedFresh.push(decision);
	}

	// Manual decisions (source: "manual") always bypass the net-benefit gate.
	// Only fresh *automatic* proposals are ever gated; gating happens here
	// against the pre-mutation `messages` clone, before the apply loop below
	// mutates anything.
	const freshManual = dedupedFresh.filter((decision) => decision.source === "manual");
	const freshAutomaticUnfiltered = dedupedFresh.filter((decision) => decision.source !== "manual");

	// Minimum-size floor (pe-qdzb): drop fresh automatic proposals whose
	// character savings (original content chars minus placeholder chars) fall
	// below `thresholds.minCharsSaved`, BEFORE gate evaluation so dropped
	// candidates never consume batch/earliest-position gate consideration.
	// Applies to automatic proposals only; manual (`freshManual` above) and
	// already-persisted decisions (`input.persistedDecisions`, applied later)
	// bypass this floor entirely, same as the net-benefit gate. A floor of 0
	// (the config default before pe-c5n9's DEFAULT_MIN_CHARS_SAVED constant was
	// introduced) is a no-op: every non-negative delta clears it.
	const minCharsSaved = input.config.thresholds.minCharsSaved;
	const freshAutomatic =
		minCharsSaved <= 0
			? freshAutomaticUnfiltered
			: freshAutomaticUnfiltered.filter((decision) => {
					const charsSaved = estimateDecisionCharsSaved(messages, decision, pairIndex);
					return charsSaved !== undefined && charsSaved >= minCharsSaved;
				});

	// Collapse fresh AUTOMATIC candidates that target the same (kind,
	// correlation) down to a single decision (pe-j7sb). Two strategies (e.g.
	// `dedupe` and `superseded-file-ops`) can independently propose a decision
	// for the exact same tool result; their idempotencyKeys differ (each
	// embeds its own strategyId) so the self-dedup above does not catch this,
	// and letting both through would double-count the same tokensRemoved in
	// the net-benefit gate and double-apply/double-credit in the apply loop
	// below. The winner is chosen by a DETERMINISTIC strategy priority derived
	// from `STRATEGIES` array order: earlier entries in `STRATEGIES` win. Only
	// the winning decision's placeholder/reason is what ends up gated/applied/
	// persisted. Manual decisions (already filtered out above) and persisted
	// decisions are never collapsed here — only fresh automatic overlap causes
	// the double-count this call.
	const strategyPriority = new Map(STRATEGIES.map((strategy, index) => [strategy.id, index]));
	const collapsedByTarget = new Map<string, PruneDecisionRecord>();
	for (const decision of freshAutomatic) {
		const targetKey = buildDecisionTargetKey(decision);
		const existing = collapsedByTarget.get(targetKey);
		if (!existing) {
			collapsedByTarget.set(targetKey, decision);
			continue;
		}
		const existingPriority = strategyPriority.get(existing.strategyId) ?? Number.POSITIVE_INFINITY;
		const candidatePriority = strategyPriority.get(decision.strategyId) ?? Number.POSITIVE_INFINITY;
		if (candidatePriority < existingPriority) collapsedByTarget.set(targetKey, decision);
	}
	const collapsedFreshAutomatic = Array.from(collapsedByTarget.values());

	// Fresh automatic candidates must also be excluded from gating (not just
	// from the apply loop) when their target is already claimed by a decision
	// that will apply earlier in `allCandidates` — i.e. a persisted decision or
	// a fresh manual decision. Persisted decisions come from a DIFFERENT prior
	// call, so a fresh proposal from a different strategy on the same
	// toolCallId+kind has a distinct idempotencyKey and slips past `seenKeys`
	// above; likewise a fresh manual decision has `source: "manual"` and is
	// filtered out of `freshAutomatic` but still claims its target. Without
	// this exclusion, `evaluateNetBenefitGate` below would double-count that
	// target's tokensRemoved even though the apply-loop guard further down
	// correctly skips applying the fresh candidate — corrupting the gate's
	// net-benefit math (and potentially flipping ACCEPT/REJECT) even though no
	// double-apply occurs. Only decisions with `correlation.type ===
	// "toolCallId"` are applyable targets worth tracking here; anything else is
	// ignored safely (it cannot collide with a toolCallId-keyed target).
	const claimedTargetKeys = new Set<string>();
	for (const decision of [...input.persistedDecisions, ...freshManual]) {
		if (decision.correlation.type !== "toolCallId") continue;
		claimedTargetKeys.add(buildDecisionTargetKey(decision));
	}

	const savingsByKey = new Map<string, number>();
	const gateCandidates: GateCandidate[] = [];
	for (const decision of collapsedFreshAutomatic) {
		if (claimedTargetKeys.has(buildDecisionTargetKey(decision))) continue; // already claimed by a persisted/manual decision applying earlier
		if (isDecisionProtected(decision, messages, input.config.protections, recencyBoundaryIndex, pairIndex)) continue;
		const estimate = estimateDecisionSavings(messages, decision, estimateTokensForText, pairIndex);
		if (!estimate || estimate.tokensRemoved <= 0) continue;
		savingsByKey.set(decision.idempotencyKey, estimate.tokensRemoved);
		gateCandidates.push({ decision, position: estimate.position, tokensRemoved: estimate.tokensRemoved });
	}

	const gate = evaluateNetBenefitGate(gateCandidates, messages, input.config.gate, agentState, estimateTokensForText);

	const allCandidates = [...input.persistedDecisions, ...freshManual, ...gate.accepted];
	const newlyAppliedDecisions: PruneDecisionRecord[] = [];
	const newlyAppliedStats: PruneStatsRecord[] = [];

	// Guards against double-apply/double-count when more than one candidate in
	// `allCandidates` targets the same (kind, correlation) — e.g. a persisted
	// decision from a different strategy and a fresh automatic decision (from
	// a strategy that started proposing overlap only after the persisted one
	// was written) both targeting the same toolCallId+kind in this SAME call.
	// `applyPruneDecision` unconditionally re-applies its placeholder even when
	// the target is already a placeholder and reports `applied: true`, so
	// without this guard the second candidate would silently overwrite the
	// first's placeholder AND still be credited full stats/newlyAppliedDecisions
	// (pe-j7sb). The pre-gate collapse above already prevents this among fresh
	// automatic candidates; this guard additionally covers persisted-vs-fresh
	// (and any other) overlap within a single call.
	const appliedTargetKeys = new Set<string>();
	for (const decision of allCandidates) {
		if (isDecisionProtected(decision, messages, input.config.protections, recencyBoundaryIndex, pairIndex)) continue;
		const targetKey = buildDecisionTargetKey(decision);
		if (appliedTargetKeys.has(targetKey)) continue; // already pruned by an earlier candidate this call
		const result = applyPruneDecision(messages, decision, pairIndex);
		if (!result.applied) continue; // graceful no-op: target absent/already safe
		appliedTargetKeys.add(targetKey);
		if (!input.knownIdempotencyKeys.has(decision.idempotencyKey)) {
			newlyAppliedDecisions.push(decision);
			const tokensRemoved =
				savingsByKey.get(decision.idempotencyKey) ??
				estimateDecisionSavings(input.messages, decision, estimateTokensForText, pairIndex)?.tokensRemoved ??
				0;
			newlyAppliedStats.push(buildStatsRecord(decision, tokensRemoved));
		}
	}

	const contextSizeSnapshot = computeContextSizeSnapshot(input.messages, messages, estimateTokensForText);

	return { messages, newlyAppliedDecisions, newlyAppliedStats, contextSizeSnapshot, gate };
}

// ============================================================================
// Session-entry state rebuild (idempotent; tolerates duplicate/replayed entries)
// ============================================================================

export interface RebuiltDecisionState {
	decisions: PruneDecisionRecord[];
	idempotencyKeys: Set<string>;
}

/** Rebuild in-memory decision state from persisted CustomEntry records on a branch. */
export function rebuildDecisionStateFromEntries(entries: MinimalSessionEntry[]): RebuiltDecisionState {
	const decisions: PruneDecisionRecord[] = [];
	const idempotencyKeys = new Set<string>();
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== DECISION_ENTRY_TYPE) continue;
		const record = parseDecisionRecord(entry.data);
		if (!record) continue;
		if (idempotencyKeys.has(record.idempotencyKey)) continue; // tolerate duplicate/replayed entries
		idempotencyKeys.add(record.idempotencyKey);
		decisions.push(record);
	}
	return { decisions, idempotencyKeys };
}

// ============================================================================
// /prune picker helpers (pe-8re9)
// ============================================================================

/** Convert branch entries into the plain message array the pipeline/pickers correlate against. */
export function sessionEntriesToMessages(entries: MinimalSessionEntry[]): MinimalMessage[] {
	const messages: MinimalMessage[] = [];
	for (const entry of entries) {
		if (entry.type === "message" && entry.message) messages.push(entry.message);
	}
	return messages;
}

/** Truncated, canonicalized single-line digest of a tool call's arguments, for compact picker display. */
export function buildArgsDigest(args: unknown, maxLength = 80): string {
	const json = canonicalizeArgumentsJSON(args);
	if (json.length <= maxLength) return json;
	return `${json.slice(0, Math.max(0, maxLength - 1))}\u2026`;
}

export type PrunableItemStatus = "active" | "pruned" | "restored";

export interface PrunableItem {
	toolCallId: string;
	toolName: string;
	argsDigest: string;
	/** Estimated tokens of the ORIGINAL (unpruned) tool result content, i.e. what pruning would save / restoring would bring back. */
	estimatedTokens: number;
	status: PrunableItemStatus;
	/** Set only when status === "pruned": the currently-active decision pruning this result. */
	activeDecision?: PruneDecisionRecord;
}

/**
 * Build picker rows for every completed tool call whose result is eligible
 * for manual prune/restore. `activeByToolCallId` should be built from
 * currently-ACTIVE decisions only (kind: "tool_result_content"), keyed by
 * toolCallId; `restoredToolCallIds` from currently-restored keys' underlying
 * toolCallId (see `buildActiveResultDecisionMap`/`extractToolCallIdFromDecisionKey`
 * usage in the extension wiring).
 */
export function buildPrunableItems(
	messages: MinimalMessage[],
	activeByToolCallId: Map<string, PruneDecisionRecord>,
	restoredToolCallIds: ReadonlySet<string>,
	_estimateTokens: TokenEstimator = estimateTokensForText,
): PrunableItem[] {
	const items: PrunableItem[] = [];
	for (const occurrence of collectCompletedToolCallOccurrences(messages)) {
		const resultMessage = messages[occurrence.resultIndex] as MinimalToolResultMessage;
		const estimatedTokens = estimateTokensForContent(resultMessage.content);
		const activeDecision = activeByToolCallId.get(occurrence.toolCallId);
		const status: PrunableItemStatus = activeDecision
			? "pruned"
			: restoredToolCallIds.has(occurrence.toolCallId)
				? "restored"
				: "active";
		items.push({
			toolCallId: occurrence.toolCallId,
			toolName: occurrence.toolName,
			argsDigest: buildArgsDigest(occurrence.arguments),
			estimatedTokens,
			status,
			activeDecision,
		});
	}
	return items;
}

/** Build a Map<toolCallId, decision> from active decisions, restricted to tool_result_content kind. First match per toolCallId wins. */
export function buildActiveResultDecisionMap(activeDecisions: PruneDecisionRecord[]): Map<string, PruneDecisionRecord> {
	const map = new Map<string, PruneDecisionRecord>();
	for (const decision of activeDecisions) {
		if (decision.kind !== "tool_result_content") continue;
		if (decision.correlation.type !== "toolCallId") continue;
		if (!map.has(decision.correlation.toolCallId)) map.set(decision.correlation.toolCallId, decision);
	}
	return map;
}

/** Single-line label for a /prune picker option row. */
export function formatPrunableItemOption(item: PrunableItem): string {
	const statusLabel =
		item.status === "pruned"
			? `pruned by ${item.activeDecision?.strategyId ?? "?"}${item.activeDecision?.source === "manual" ? " (manual)" : ""}`
			: item.status === "restored"
				? "restored (prunable again)"
				: "not pruned";
	return `${item.toolName} ${item.argsDigest} \u2014 ~${item.estimatedTokens} tok \u2014 ${statusLabel}`;
}

/**
 * Picker option rows for the /prune interactive selector: a stable, guaranteed-unique label
 * (a 1-based row-number prefix) paired with its source item, so the caller can recover the
 * exact selected row even when two items would otherwise render byte-identical labels
 * (e.g. duplicate tool calls with the same args digest, estimated tokens, and status).
 * Do NOT recover a selection via `formatPrunableItemOption(item) === choice` or
 * `options.indexOf(choice)` on re-derived labels — always match against these rows' `label`.
 */
export function buildPrunableItemPickerOptions(items: PrunableItem[]): Array<{ label: string; item: PrunableItem }> {
	return items.map((item, index) => ({ label: `${index + 1}) ${formatPrunableItemOption(item)}`, item }));
}

/** Multi-line detail text for a /prune confirm dialog, describing the item and (when pruning) the predicted cache-bust cost. */
export function formatPrunableItemDetail(item: PrunableItem, cost?: CacheCostModelResult): string {
	const lines = [`Tool: ${item.toolName}`, `Args: ${item.argsDigest}`, `Estimated tokens: ${item.estimatedTokens}`];
	if (item.status === "pruned" && item.activeDecision) {
		lines.push(`Currently pruned by "${item.activeDecision.strategyId}": ${item.activeDecision.reason}`);
	}
	if (cost) {
		lines.push(
			`Predicted cache-bust cost: penalty \u2248${cost.penalty.toFixed(0)} tok, recurring saving \u2248${cost.recurringSaving.toFixed(0)} tok/call, break-even \u2248${Number.isFinite(cost.breakEvenCalls) ? cost.breakEvenCalls.toFixed(1) : "\u221e"} calls.`,
			"Manual prunes always bypass the net-benefit gate, so this preview is informational only.",
		);
	}
	return lines.join("\n");
}

/** Plain-text report used both by the non-UI /prune fallback and as a debugging aid. */
export function formatPrunableItemsReport(items: PrunableItem[]): string[] {
	if (items.length === 0) return ["No prunable tool results found in this session."];
	return items.map((item, index) => `${index + 1}. ${formatPrunableItemOption(item)}`);
}

// ============================================================================
// /context-pruning control + status/stats helpers (pe-8re9)
// ============================================================================

export type StrategyKey = "dedupe" | "errorPurge" | "supersededFileOps";

const STRATEGY_ALIASES: Record<string, StrategyKey> = {
	dedupe: "dedupe",
	"error-purge": "errorPurge",
	errorpurge: "errorPurge",
	error_purge: "errorPurge",
	errorPurge: "errorPurge",
	"superseded-file-ops": "supersededFileOps",
	supersededfileops: "supersededFileOps",
	superseded_file_ops: "supersededFileOps",
	supersededFileOps: "supersededFileOps",
};

const STRATEGY_DISPLAY_NAMES: Record<StrategyKey, string> = {
	dedupe: "dedupe",
	errorPurge: "error-purge",
	supersededFileOps: "superseded-file-ops",
};

export type ContextPruningSubcommand =
	| { kind: "help" }
	| { kind: "status" }
	| { kind: "stats" }
	| { kind: "enabled"; value: boolean }
	| { kind: "toggle" }
	| { kind: "strategy"; strategy: StrategyKey; value: boolean }
	| { kind: "gate"; mode: GateMode }
	| { kind: "unknown"; raw: string };

/** Parse `/context-pruning <...>` arguments into a typed subcommand. Pure; never throws. */
export function parseContextPruningArgs(rawArgs: string): ContextPruningSubcommand {
	const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return { kind: "help" };
	const [head, ...rest] = tokens;
	const cmd = head.toLowerCase();

	switch (cmd) {
		case "help":
		case "-h":
		case "--help":
			return { kind: "help" };
		case "status":
			return { kind: "status" };
		case "stats":
			return { kind: "stats" };
		case "on":
			return { kind: "enabled", value: true };
		case "off":
			return { kind: "enabled", value: false };
		case "toggle":
			return { kind: "toggle" };
		case "strategy": {
			const [nameRaw, valueRaw] = rest;
			const key = nameRaw ? STRATEGY_ALIASES[nameRaw.toLowerCase()] ?? STRATEGY_ALIASES[nameRaw] : undefined;
			const value = valueRaw?.toLowerCase();
			if (!key || (value !== "on" && value !== "off")) return { kind: "unknown", raw: rawArgs };
			return { kind: "strategy", strategy: key, value: value === "on" };
		}
		case "gate": {
			const modeRaw = rest[0]?.toLowerCase();
			if (modeRaw === "on" || modeRaw === "off" || modeRaw === "always-apply") return { kind: "gate", mode: modeRaw };
			return { kind: "unknown", raw: rawArgs };
		}
		default:
			return { kind: "unknown", raw: rawArgs };
	}
}

export function contextPruningUsage(): string {
	return [
		"Usage: /context-pruning <status|stats|on|off|toggle|strategy <name> on|off|gate <on|off|always-apply>>",
		"",
		"  status                        Show enabled state, strategies, protections, and context size.",
		"  stats                         Show cumulative tokens saved per strategy.",
		"  on | off | toggle             Enable/disable dynamic context pruning entirely.",
		"  strategy <name> on|off        Toggle one strategy: dedupe | error-purge | superseded-file-ops.",
		"  gate on|off|always-apply      Control the net-benefit gate: reject/bypass/model-only.",
	].join("\n");
}

export interface ConfigMutationResult {
	config: DynamicContextPruningConfig;
	message: string;
}

/** Apply a config-mutating subcommand ((enabled|toggle|strategy|gate)) to a config. Pure; returns a new config object. */
export function applyContextPruningConfigMutation(
	config: DynamicContextPruningConfig,
	subcommand: Extract<ContextPruningSubcommand, { kind: "enabled" | "toggle" | "strategy" | "gate" }>,
): ConfigMutationResult {
	if (subcommand.kind === "enabled") {
		return {
			config: { ...config, enabled: subcommand.value },
			message: `Dynamic context pruning ${subcommand.value ? "enabled" : "disabled"}.`,
		};
	}
	if (subcommand.kind === "toggle") {
		const value = !config.enabled;
		return { config: { ...config, enabled: value }, message: `Dynamic context pruning ${value ? "enabled" : "disabled"}.` };
	}
	if (subcommand.kind === "strategy") {
		const strategies = {
			...config.strategies,
			[subcommand.strategy]: { ...config.strategies[subcommand.strategy], enabled: subcommand.value },
		};
		return {
			config: { ...config, strategies },
			message: `Strategy "${STRATEGY_DISPLAY_NAMES[subcommand.strategy]}" ${subcommand.value ? "enabled" : "disabled"}.`,
		};
	}
	return {
		config: { ...config, gate: { ...config.gate, mode: subcommand.mode } },
		message: `Net-benefit gate set to "${subcommand.mode}".`,
	};
}

export interface StatusReportInput {
	config: DynamicContextPruningConfig;
	contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
	lastSnapshot?: ContextSizeSnapshot;
}

/** Human-readable `/context-pruning status` report lines. Pure; testable with fixture inputs. */
export function formatStatusReport(input: StatusReportInput): string[] {
	const { config, contextUsage, lastSnapshot } = input;
	const lines: string[] = [];
	lines.push(`Dynamic context pruning: ${config.enabled ? "ENABLED" : "disabled"}`);
	lines.push(
		`Gate: mode=${config.gate.mode} threshold=${config.gate.breakEvenThreshold} cachedPriceRatio=${config.gate.cachedPriceRatio}`,
	);
	lines.push("Strategies:");
	lines.push(`  dedupe: ${config.strategies.dedupe.enabled ? "on" : "off"}`);
	lines.push(
		`  error-purge: ${config.strategies.errorPurge.enabled ? "on" : "off"} (minTurnsOld=${config.strategies.errorPurge.minTurnsOld})`,
	);
	lines.push(`  superseded-file-ops: ${config.strategies.supersededFileOps.enabled ? "on" : "off"}`);
	lines.push(
		`Protections: recentTurns=${config.protections.recentTurns}, protectedTools=${config.protections.toolNames.length}, protectedPathGlobs=${config.protections.pathGlobs.length}`,
	);
	if (lastSnapshot) {
		lines.push(
			`Last call: raw=${lastSnapshot.rawTokens} tok, effective=${lastSnapshot.effectiveTokens} tok, saved=${lastSnapshot.tokensSavedThisCall} tok`,
		);
	} else {
		lines.push("Last call: no context snapshot yet (nothing has run through the pipeline this session).");
	}
	if (contextUsage) {
		const percent = contextUsage.percent != null ? ` (${contextUsage.percent.toFixed(1)}%)` : "";
		lines.push(`Current context usage: ${contextUsage.tokens ?? "unknown"} / ${contextUsage.contextWindow} tokens${percent}`);
	}
	return lines;
}

/** Human-readable `/context-pruning stats` report lines. Pure; testable with fixture inputs. */
export function formatStatsReport(stats: CumulativePruneStats): string[] {
	const lines: string[] = [`Total tokens saved: ${stats.totalTokensRemoved} across ${stats.totalPruneCount} prune(s).`];
	const strategyIds = Object.keys(stats.byStrategy).sort();
	if (strategyIds.length === 0) {
		lines.push("No prunes recorded yet.");
		return lines;
	}
	for (const id of strategyIds) {
		const s = stats.byStrategy[id];
		lines.push(`  ${id}: ${s.tokensRemoved} tok saved across ${s.pruneCount} prune(s)`);
	}
	return lines;
}

// ============================================================================
// Extension wiring
// ============================================================================

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
		return;
	}
	console.error(message);
}

export const __testing = {
	globToRegExp,
	getConfigPath,
	readConfig,
	writeConfig,
};

export default function dynamicContextPruningExtension(pi: ExtensionAPI) {
	let config: DynamicContextPruningConfig = defaultConfig();
	let persistedDecisions: PruneDecisionRecord[] = [];
	let knownIdempotencyKeys = new Set<string>();
	let restoredIdempotencyKeys = new Set<string>();
	let lastDecisionByKey = new Map<string, PruneDecisionRecord>();
	let cumulativeStats: CumulativePruneStats = emptyCumulativeStats();
	let knownStatsKeys = new Set<string>();
	let lastContextSizeSnapshot: ContextSizeSnapshot | undefined;

	const rebuildState = (ctx: ExtensionContext) => {
		const branchEntries = ctx.sessionManager.getBranch() as unknown as MinimalSessionEntry[];
		const tombstoneState = resolvePruneTombstoneState(branchEntries);
		persistedDecisions = tombstoneState.activeDecisions;
		knownIdempotencyKeys = tombstoneState.activeIdempotencyKeys;
		restoredIdempotencyKeys = tombstoneState.restoredKeys;
		lastDecisionByKey = tombstoneState.lastDecisionByKey;
		const rebuiltStats = rebuildStatsStateFromEntries(branchEntries);
		cumulativeStats = rebuiltStats.stats;
		knownStatsKeys = rebuiltStats.seenKeys;
	};

	pi.on("session_start", async (_event, ctx) => {
		config = await readConfig();
		rebuildState(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		rebuildState(ctx);
	});

	pi.on("context", async (event, ctx) => {
		if (!config.enabled) return undefined;

		const result = runDynamicContextPruningPipeline({
			messages: event.messages as unknown as MinimalMessage[],
			config,
			persistedDecisions,
			knownIdempotencyKeys,
			restoredIdempotencyKeys,
			// Real mid-loop/idle agent-state detection (pe-zy4s): derived straight from
			// the message payload via classifyAgentStateFromMessages -- see its doc
			// comment for the exact runtime-observable definition.
			agentState: classifyAgentStateFromMessages(event.messages as unknown as MinimalMessage[]),
			cwd: ctx.sessionManager.getCwd(),
		});

		for (const decision of result.newlyAppliedDecisions) {
			if (knownIdempotencyKeys.has(decision.idempotencyKey)) continue;
			knownIdempotencyKeys.add(decision.idempotencyKey);
			persistedDecisions.push(decision);
			lastDecisionByKey.set(decision.idempotencyKey, decision);
			try {
				pi.appendEntry(DECISION_ENTRY_TYPE, decision);
			} catch {
				// Persisting a decision for a call that never completes (abort/retry)
				// is harmless: pruning is recomputed fresh on every call. Swallow.
			}
		}

		for (const statRecord of result.newlyAppliedStats) {
			if (knownStatsKeys.has(statRecord.idempotencyKey)) continue;
			knownStatsKeys.add(statRecord.idempotencyKey);
			cumulativeStats = foldStatsRecord(cumulativeStats, statRecord);
			try {
				pi.appendEntry(STATS_ENTRY_TYPE, statRecord);
			} catch {
				// Same reasoning as decision persistence above: safe to drop on abort/retry.
			}
		}

		lastContextSizeSnapshot = result.contextSizeSnapshot;
		void ctx; // ctx currently unused beyond typing; kept for future protections/UI hooks.
		return { messages: result.messages as never };
	});

	/** Persist + apply a manual prune decision immediately (accounting included), bypassing the net-benefit gate. */
	const persistManualPrune = (messages: MinimalMessage[], toolCallId: string): { decision: PruneDecisionRecord; tokensRemoved: number } => {
		const proposal = buildManualPruneProposal(toolCallId);
		const decision = proposalToDecisionRecord(proposal);
		const estimate = estimateDecisionSavings(messages, decision, estimateTokensForText);
		const tokensRemoved = estimate?.tokensRemoved ?? 0;
		const statRecord = buildStatsRecord(decision, tokensRemoved);

		pi.appendEntry(DECISION_ENTRY_TYPE, decision);
		pi.appendEntry(STATS_ENTRY_TYPE, statRecord);

		persistedDecisions = [...persistedDecisions.filter((d) => d.idempotencyKey !== decision.idempotencyKey), decision];
		knownIdempotencyKeys.add(decision.idempotencyKey);
		restoredIdempotencyKeys.delete(decision.idempotencyKey);
		lastDecisionByKey.set(decision.idempotencyKey, decision);
		if (!knownStatsKeys.has(statRecord.idempotencyKey)) {
			knownStatsKeys.add(statRecord.idempotencyKey);
			cumulativeStats = foldStatsRecord(cumulativeStats, statRecord);
		}

		return { decision, tokensRemoved };
	};

	/** Persist a restore (tombstone) for a currently-active decision. Idempotent: safe to call more than once. */
	const persistRestore = (idempotencyKey: string): void => {
		const record = buildRestoreRecord(idempotencyKey);
		pi.appendEntry(RESTORE_ENTRY_TYPE, record);
		persistedDecisions = persistedDecisions.filter((d) => d.idempotencyKey !== idempotencyKey);
		knownIdempotencyKeys.delete(idempotencyKey);
		restoredIdempotencyKeys.add(idempotencyKey);
	};

	pi.registerCommand("prune", {
		description: "Review, manually prune, and restore prunable tool results (interactive picker in TUI/RPC)",
		handler: async (_args, ctx) => {
			const branchEntries = ctx.sessionManager.getBranch() as unknown as MinimalSessionEntry[];
			const messages = sessionEntriesToMessages(branchEntries);
			const activeByToolCallId = buildActiveResultDecisionMap(persistedDecisions);
			const restoredToolCallIds = new Set(
				Array.from(lastDecisionByKey.values())
					.filter((d) => d.correlation.type === "toolCallId" && restoredIdempotencyKeys.has(d.idempotencyKey))
					.map((d) => (d.correlation as { type: "toolCallId"; toolCallId: string }).toolCallId),
			);
			const items = buildPrunableItems(messages, activeByToolCallId, restoredToolCallIds);

			if (!ctx.hasUI) {
				notify(ctx, ["/prune: no interactive UI available. Prunable tool results in this session:", "", ...formatPrunableItemsReport(items)].join("\n"), "info");
				return;
			}

			if (items.length === 0) {
				notify(ctx, "No prunable tool results found in this session.", "info");
				return;
			}

			const doneLabel = "Done";
			while (true) {
				const latestBranch = ctx.sessionManager.getBranch() as unknown as MinimalSessionEntry[];
				const latestMessages = sessionEntriesToMessages(latestBranch);
				const latestActive = buildActiveResultDecisionMap(persistedDecisions);
				const latestRestoredToolCallIds = new Set(
					Array.from(lastDecisionByKey.values())
						.filter((d) => d.correlation.type === "toolCallId" && restoredIdempotencyKeys.has(d.idempotencyKey))
						.map((d) => (d.correlation as { type: "toolCallId"; toolCallId: string }).toolCallId),
				);
				const latestItems = buildPrunableItems(latestMessages, latestActive, latestRestoredToolCallIds);
				if (latestItems.length === 0) {
					notify(ctx, "No prunable tool results found in this session.", "info");
					return;
				}

				// Labels may collide (e.g. duplicate tool calls with identical args/tokens/status), so each
				// option is disambiguated with a stable row-number prefix and the selection is recovered by
				// matching that unique label back to its own row — never by indexOf on re-derived base labels.
				const pickerOptions = buildPrunableItemPickerOptions(latestItems);
				const options = pickerOptions.map((option) => option.label);
				const choice = await ctx.ui.select("/prune \u2014 select a tool result to prune or restore", [...options, doneLabel]);
				if (!choice || choice === doneLabel) return;

				const item = pickerOptions.find((option) => option.label === choice)?.item;
				if (!item) continue;

				if (item.status === "pruned" && item.activeDecision) {
					const confirmed = await ctx.ui.confirm("Restore this tool result?", formatPrunableItemDetail(item));
					if (confirmed) {
						persistRestore(item.activeDecision.idempotencyKey);
						notify(ctx, `Restored ${item.toolName} result; it will show its original content on the next call.`, "info");
					}
					continue;
				}

				// active or restored: offer a (re-)prune, with a predicted cache-bust cost preview.
				const previewProposal = buildManualPruneProposal(item.toolCallId);
				const previewDecision = proposalToDecisionRecord(previewProposal);
				const estimate = estimateDecisionSavings(latestMessages, previewDecision, estimateTokensForText);
				const cost = estimate
					? computeCacheCostModel({
							tailTokensAfterEarliestChange: estimateTailTokens(latestMessages, estimate.position, estimateTokensForText),
							tokensRemoved: estimate.tokensRemoved,
							cachedPriceRatio: config.gate.cachedPriceRatio,
						})
					: undefined;

				const confirmed = await ctx.ui.confirm(`Prune ${item.toolName} result?`, formatPrunableItemDetail(item, cost));
				if (confirmed) {
					persistManualPrune(latestMessages, item.toolCallId);
					notify(ctx, `Pruned ${item.toolName} result; it will apply on the next call.`, "info");
				}
			}
		},
	});

	pi.registerCommand("context-pruning", {
		description: "Inspect and control dynamic context pruning: status, stats, on/off, strategy, gate",
		handler: async (args, ctx) => {
			const subcommand = parseContextPruningArgs(args);

			if (subcommand.kind === "help") {
				notify(ctx, contextPruningUsage(), "info");
				return;
			}
			if (subcommand.kind === "unknown") {
				notify(ctx, `Unknown /context-pruning subcommand: "${subcommand.raw}".\n\n${contextPruningUsage()}`, "error");
				return;
			}
			if (subcommand.kind === "status") {
				const usage = ctx.getContextUsage();
				notify(ctx, formatStatusReport({ config, contextUsage: usage, lastSnapshot: lastContextSizeSnapshot }).join("\n"), "info");
				return;
			}
			if (subcommand.kind === "stats") {
				notify(ctx, formatStatsReport(cumulativeStats).join("\n"), "info");
				return;
			}

			const { config: nextConfig, message } = applyContextPruningConfigMutation(config, subcommand);
			config = nextConfig;
			try {
				await writeConfig(config);
			} catch {
				// Config is still updated in-memory for this session even if the write fails
				// (e.g. read-only filesystem); surface the change but note persistence failed.
				notify(ctx, `${message} (warning: failed to persist config to disk)`, "warning");
				return;
			}
			notify(ctx, message, "info");
		},
	});
}
