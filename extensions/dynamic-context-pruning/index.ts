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

const DEFAULT_RECENT_TURNS = 4;

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
	 * Minimum characters a prune must remove to be worth persisting.
	 * Reserved for the net-benefit gate landing in a follow-up ticket; not
	 * enforced by this pipeline yet.
	 */
	minCharsSaved: number;
}

export interface DynamicContextPruningConfig {
	enabled: boolean;
	protections: PruneProtections;
	thresholds: PruneThresholds;
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

/** What a strategy proposes. The pipeline decides whether/how to apply it. */
export interface ProposedPrune {
	strategyId: string;
	toolCallId: string;
	kind: PruneTargetKind;
	reason: string;
	placeholder?: string;
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
}

export interface PipelineResult {
	messages: MinimalMessage[];
	/** Decisions that were applied this call and are not yet persisted; caller should appendEntry these once. */
	newlyAppliedDecisions: PruneDecisionRecord[];
}

/**
 * Centrally applies persisted + freshly-proposed prune decisions to a deep
 * copy of the messages array. Strategies only propose; this function is the
 * single place that mutates content. Pairing invariants are preserved by
 * construction: messages/blocks are never added or removed, only replaced.
 */
export function runDynamicContextPruningPipeline(input: PipelineInput): PipelineResult {
	if (!input.config.enabled) {
		return { messages: input.messages, newlyAppliedDecisions: [] };
	}

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

	const allCandidates = [...input.persistedDecisions, ...dedupedFresh];
	const newlyAppliedDecisions: PruneDecisionRecord[] = [];

	for (const decision of allCandidates) {
		if (isDecisionProtected(decision, messages, input.config.protections, recencyBoundaryIndex)) continue;
		const result = applyPruneDecision(messages, decision);
		if (!result.applied) continue; // graceful no-op: target absent/already safe
		if (!input.knownIdempotencyKeys.has(decision.idempotencyKey)) {
			newlyAppliedDecisions.push(decision);
		}
	}

	return { messages, newlyAppliedDecisions };
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

	const rebuildState = (ctx: ExtensionContext) => {
		const branchEntries = ctx.sessionManager.getBranch() as unknown as MinimalSessionEntry[];
		const rebuilt = rebuildDecisionStateFromEntries(branchEntries);
		persistedDecisions = rebuilt.decisions;
		knownIdempotencyKeys = rebuilt.idempotencyKeys;
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
