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

const DEFAULT_RECENT_TURNS = 4;

/** Cache cost model default: fraction of full (non-cached) price still paid for cached tokens. */
const DEFAULT_CACHED_PRICE_RATIO = 0.1;

/**
 * Default net-benefit gate threshold (max amortization calls). Explicitly
 * PROVISIONAL per pe-s2ho ticket notes: pe-e9pv's realized-benefit benchmark
 * will supply the final, data-backed default(s). Do not treat "5" as tuned.
 */
const DEFAULT_BREAK_EVEN_THRESHOLD = 5;

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
	 * Minimum characters a prune must remove to be worth persisting. Reserved
	 * for a future minimum-size filter; NOT used by the net-benefit gate
	 * (see `PruneGateConfig`/`gate`), which uses break-even token math instead.
	 * Not enforced by this pipeline yet.
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
 * the same threshold today; a future ticket can widen/narrow either once
 * real usage data (pe-e9pv) exists.
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
	 * bust) used when no state-specific override applies. PROVISIONAL default;
	 * see DEFAULT_BREAK_EVEN_THRESHOLD.
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

/** Primary correlation: locate an assistant toolCall block and/or its toolResult by toolCallId. */
export function findToolCallPairIndices(messages: MinimalMessage[], toolCallId: string): ToolCallPairIndices {
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
export function applyPruneDecision(messages: MinimalMessage[], decision: PruneDecisionRecord): ApplyResult {
	if (decision.correlation.type !== "toolCallId") {
		// v1 only ever targets tool call/result pairs; entryId correlation is
		// reserved for future strategies and intentionally not applied yet.
		return { applied: false, charsRemoved: 0 };
	}
	const pair = findToolCallPairIndices(messages, decision.correlation.toolCallId);

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
): boolean {
	if (decision.correlation.type !== "toolCallId") return true; // no safe way to check protections yet
	const pair = findToolCallPairIndices(messages, decision.correlation.toolCallId);
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
): DecisionSavingsEstimate | undefined {
	if (decision.correlation.type !== "toolCallId") return undefined;
	const pair = findToolCallPairIndices(messages, decision.correlation.toolCallId);

	// Apply against a shallow copy of the array (not the message objects) so
	// the caller's messages/content are never mutated by this preview.
	const preview = messages.slice();
	const result = applyPruneDecision(preview, decision);
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

interface ToolCallOccurrence {
	toolCallId: string;
	toolName: string;
	arguments: Record<string, unknown> | undefined;
	assistantIndex: number;
	resultIndex: number;
	isError: boolean;
}

/** Collect every assistant toolCall block that has a matching toolResult message, in message order. */
function collectCompletedToolCallOccurrences(messages: MinimalMessage[]): ToolCallOccurrence[] {
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
			for (let i = 0; i < group.length; i++) {
				// Never supersede the newest operation for this path (rule: "never
				// supersede the newest op for a path").
				if (i === group.length - 1) continue;
				const occurrence = group[i];
				const later = group.slice(i + 1);

				if (occurrence.kind === "read") {
					// Rule 3 takes priority: any later successful write/edit makes
					// this read stale outright, regardless of read-vs-read coverage.
					const laterWrite = later.find((candidate) => candidate.kind !== "read" && !candidate.isError);
					if (laterWrite) {
						if (occurrence.resultTextLength <= 0) continue; // rule 4: skip zero-length proposals
						proposals.push({
							strategyId: SUPERSEDED_FILE_OPS_STRATEGY_ID,
							toolCallId: occurrence.toolCallId,
							kind: "tool_result_content",
							reason: `${occurrence.normalizedPath} has since been modified (see ${laterWrite.kind} call ${laterWrite.toolCallId})`,
							placeholder: buildFileChangedPlaceholder(occurrence.normalizedPath, laterWrite.kind, laterWrite.toolCallId),
						});
						continue;
					}

					// Rules 1+2: superseded by a later read whose range covers this one's.
					const laterCoveringRead = later.find(
						(candidate) =>
							candidate.kind === "read" &&
							candidate.range !== undefined &&
							occurrence.range !== undefined &&
							readRangeCovers(candidate.range, occurrence.range),
					);
					if (laterCoveringRead) {
						if (occurrence.resultTextLength <= 0) continue;
						proposals.push({
							strategyId: SUPERSEDED_FILE_OPS_STRATEGY_ID,
							toolCallId: occurrence.toolCallId,
							kind: "tool_result_content",
							reason: `superseded by newer read of ${occurrence.normalizedPath} (call ${laterCoveringRead.toolCallId})`,
							placeholder: buildSupersededReadPlaceholder(occurrence.normalizedPath, laterCoveringRead.toolCallId),
						});
					}
					continue;
				}

				// occurrence.kind is "write" or "edit": rule 4 — superseded only by a
				// LATER *successful* write/edit (an errored later write/edit never
				// supersedes; reads never supersede writes/edits).
				const laterSuccessfulWrite = later.find((candidate) => candidate.kind !== "read" && !candidate.isError);
				if (laterSuccessfulWrite) {
					if (occurrence.resultTextLength <= 0) continue; // rule 4: skip zero-length proposals
					proposals.push({
						strategyId: SUPERSEDED_FILE_OPS_STRATEGY_ID,
						toolCallId: occurrence.toolCallId,
						kind: "tool_result_content",
						reason: `superseded by newer ${laterSuccessfulWrite.kind} of ${occurrence.normalizedPath} (call ${laterSuccessfulWrite.toolCallId})`,
						placeholder: buildSupersededWritePlaceholder(occurrence.normalizedPath, laterSuccessfulWrite.kind, laterSuccessfulWrite.toolCallId),
					});
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

	const proposals = collectProposals({
		messages,
		protections: input.config.protections,
		estimateTokens: estimateTokensForText,
		config: input.config,
		cwd: input.cwd,
	});

	const seenKeys = new Set(input.persistedDecisions.map((decision) => decision.idempotencyKey));
	const freshDecisions = proposals
		.filter((proposal) => !seenKeys.has(buildIdempotencyKey(proposal)))
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
	const freshAutomatic = dedupedFresh.filter((decision) => decision.source !== "manual");

	const savingsByKey = new Map<string, number>();
	const gateCandidates: GateCandidate[] = [];
	for (const decision of freshAutomatic) {
		if (isDecisionProtected(decision, messages, input.config.protections, recencyBoundaryIndex)) continue;
		const estimate = estimateDecisionSavings(messages, decision, estimateTokensForText);
		if (!estimate || estimate.tokensRemoved <= 0) continue;
		savingsByKey.set(decision.idempotencyKey, estimate.tokensRemoved);
		gateCandidates.push({ decision, position: estimate.position, tokensRemoved: estimate.tokensRemoved });
	}

	const gate = evaluateNetBenefitGate(gateCandidates, messages, input.config.gate, agentState, estimateTokensForText);

	const allCandidates = [...input.persistedDecisions, ...freshManual, ...gate.accepted];
	const newlyAppliedDecisions: PruneDecisionRecord[] = [];
	const newlyAppliedStats: PruneStatsRecord[] = [];

	for (const decision of allCandidates) {
		if (isDecisionProtected(decision, messages, input.config.protections, recencyBoundaryIndex)) continue;
		const result = applyPruneDecision(messages, decision);
		if (!result.applied) continue; // graceful no-op: target absent/already safe
		if (!input.knownIdempotencyKeys.has(decision.idempotencyKey)) {
			newlyAppliedDecisions.push(decision);
			const tokensRemoved =
				savingsByKey.get(decision.idempotencyKey) ??
				estimateDecisionSavings(input.messages, decision, estimateTokensForText)?.tokensRemoved ??
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
	let cumulativeStats: CumulativePruneStats = emptyCumulativeStats();
	let knownStatsKeys = new Set<string>();

	const rebuildState = (ctx: ExtensionContext) => {
		const branchEntries = ctx.sessionManager.getBranch() as unknown as MinimalSessionEntry[];
		const rebuiltDecisions = rebuildDecisionStateFromEntries(branchEntries);
		persistedDecisions = rebuiltDecisions.decisions;
		knownIdempotencyKeys = rebuiltDecisions.idempotencyKeys;
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
			// Real mid-loop/idle agent-state detection lands in a follow-up ticket;
			// "idle" is the safe default until it's wired through ctx.
			agentState: "idle",
			cwd: ctx.sessionManager.getCwd(),
		});

		for (const decision of result.newlyAppliedDecisions) {
			if (knownIdempotencyKeys.has(decision.idempotencyKey)) continue;
			knownIdempotencyKeys.add(decision.idempotencyKey);
			persistedDecisions.push(decision);
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

		void ctx; // ctx currently unused beyond typing; kept for future protections/UI hooks.
		return { messages: result.messages as never };
	});

	pi.registerCommand("context-pruning", {
		description: "Dynamic context pruning (placeholder, no pruning logic yet)",
		handler: async (_args, ctx) => {
			notify(ctx, "Dynamic context pruning is not implemented yet.", "info");
		},
	});
}
