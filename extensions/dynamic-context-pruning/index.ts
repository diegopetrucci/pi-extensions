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
}

export interface PruneStrategy {
	id: string;
	propose(input: StrategyProposeInput): ProposedPrune[];
}

/**
 * Strategies PROPOSE prunes; only this pipeline ever APPLIES them. Empty
 * until follow-up tickets register concrete strategies here.
 */
export const STRATEGIES: PruneStrategy[] = [];

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
