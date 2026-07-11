import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const EXTENSION_ID = "context-inspector";
const IMAGE_TOKEN_ESTIMATE = 1200;
const DETAIL_TEXT_LIMIT = 16_000;
const PREVIEW_TEXT_LIMIT = 700;
const COMPACTION_SUMMARY_PREFIX = "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
const COMPACTION_SUMMARY_SUFFIX = "\n</summary>";
const BRANCH_SUMMARY_PREFIX = "The following is a summary of a branch that this conversation came back from:\n\n<summary>\n";
const BRANCH_SUMMARY_SUFFIX = "</summary>";

const CATEGORY_META = {
	system: {
		label: "System prompt",
		shortLabel: "System",
		color: "#8b5cf6",
		description: "Current system prompt, project instructions, loaded guidance, and extension-added prompt text.",
	},
	toolSchemas: {
		label: "Tool schemas",
		shortLabel: "Tools",
		color: "#06b6d4",
		description: "Active tool definitions, descriptions, and JSON schemas sent to the provider.",
	},
	user: {
		label: "User messages",
		shortLabel: "User",
		color: "#22c55e",
		description: "Your prompts and user-role text that stays in the active conversation.",
	},
	assistant: {
		label: "Assistant responses",
		shortLabel: "Assistant",
		color: "#60a5fa",
		description: "Visible assistant text responses kept in context.",
	},
	thinking: {
		label: "Assistant thinking",
		shortLabel: "Thinking",
		color: "#f97316",
		description: "Reasoning/thinking blocks returned by reasoning models when present in the session.",
	},
	toolCalls: {
		label: "Tool calls",
		shortLabel: "Calls",
		color: "#facc15",
		description: "Assistant tool-call arguments, including paths, commands, and edit payloads.",
	},
	toolResults: {
		label: "Tool results",
		shortLabel: "Results",
		color: "#ef4444",
		description: "Tool output returned to the model, usually the largest contributor in coding sessions.",
	},
	bash: {
		label: "User bash",
		shortLabel: "Bash",
		color: "#a3e635",
		description: "User-run ! bash commands and their outputs when included in model context.",
	},
	summaries: {
		label: "Summaries",
		shortLabel: "Summaries",
		color: "#ec4899",
		description: "Compaction and branch summaries replacing earlier history.",
	},
	custom: {
		label: "Custom context",
		shortLabel: "Custom",
		color: "#14b8a6",
		description: "Extension-injected custom messages that participate in context.",
	},
	images: {
		label: "Images",
		shortLabel: "Images",
		color: "#f59e0b",
		description: "Image blocks, estimated conservatively because providers tokenize images differently.",
	},
	providerDelta: {
		label: "Provider / serialization delta",
		shortLabel: "Delta",
		color: "#64748b",
		description: "Unattributed difference between local estimates and pi's footer-compatible provider total.",
	},
} as const;

type CategoryId = keyof typeof CATEGORY_META;

type CommandOptions = {
	open: boolean;
	keep: boolean;
	redact: boolean;
	defaultDataset: DatasetId;
	help: boolean;
};

type DatasetId = "current" | "full";

type MinimalContentBlock = {
	type?: string;
	text?: string;
	thinking?: string;
	name?: string;
	id?: string;
	arguments?: Record<string, unknown>;
	data?: string;
	mimeType?: string;
	source?: {
		type?: string;
		mediaType?: string;
		data?: string;
	};
};

type MinimalMessage = {
	role?: string;
	content?: unknown;
	timestamp?: number;
	provider?: string;
	model?: string;
	stopReason?: string;
	usage?: unknown;
	toolCallId?: string;
	toolName?: string;
	details?: unknown;
	customType?: string;
	display?: boolean;
	summary?: string;
	fromId?: string;
	tokensBefore?: number;
	command?: string;
	output?: string;
	exitCode?: number;
	cancelled?: boolean;
	truncated?: boolean;
	fullOutputPath?: string;
	excludeFromContext?: boolean;
};

type MinimalEntry = {
	type?: string;
	id?: string;
	parentId?: string | null;
	timestamp?: string;
	message?: MinimalMessage;
	customType?: string;
	content?: unknown;
	display?: boolean;
	details?: unknown;
	summary?: string;
	fromId?: string;
	tokensBefore?: number;
	firstKeptEntryId?: string;
};

type Segment = {
	id: string;
	category: CategoryId;
	label: string;
	source: string;
	role: string;
	tokens: number;
	chars: number;
	turn: number;
	sequence: number;
	entryId?: string;
	timestamp?: string;
	toolName?: string;
	toolCallId?: string;
	path?: string;
	command?: string;
	excluded?: boolean;
	displayOnly?: boolean;
	preview: string;
	detail: string;
	note?: string;
};

type CategoryStat = {
	id: CategoryId;
	label: string;
	shortLabel: string;
	color: string;
	description: string;
	tokens: number;
	displayTokens: number;
	percent: number;
	segments: number;
};

type AggregateStat = {
	key: string;
	label: string;
	tokens: number;
	segments: number;
	percent: number;
};

type DatasetStats = {
	tokens: number;
	rawTokens: number;
	visibleRawTokens: number;
	excludedTokens: number;
	providerDeltaTokens: number;
	estimatorOverageTokens: number;
	reconciliationScale: number;
	segmentCount: number;
	messageCount: number;
	categories: CategoryStat[];
	topSegments: Segment[];
	topTools: AggregateStat[];
	topPaths: AggregateStat[];
	topTurns: AggregateStat[];
};

type Dataset = {
	id: DatasetId;
	label: string;
	description: string;
	segments: Segment[];
	stats: DatasetStats;
};

type ReportData = {
	generatedAt: string;
	cwd: string;
	session: {
		id?: string;
		name?: string;
		file?: string;
	};
	model: {
		provider?: string;
		id?: string;
		contextWindow?: number;
		thinkingLevel?: string;
	};
	contextUsage: {
		tokens: number | null;
		contextWindow: number | null;
		percent: number | null;
	};
	options: {
		redacted: boolean;
		defaultDataset: DatasetId;
	};
	categoryMeta: typeof CATEGORY_META;
	datasets: Record<DatasetId, Dataset>;
	notes: string[];
};

type AnalyzerState = {
	segments: Segment[];
	sequence: number;
	turn: number;
	redact: boolean;
};

function parseArgs(args: string): CommandOptions {
	const options: CommandOptions = {
		open: true,
		keep: false,
		redact: false,
		defaultDataset: "current",
		help: false,
	};

	for (const token of args.split(/\s+/).map((part) => part.trim()).filter(Boolean)) {
		switch (token) {
			case "--no-open":
			case "--no-browser":
				options.open = false;
				break;
			case "--keep":
				options.keep = true;
				break;
			case "--redact":
				options.redact = true;
				break;
			case "--full":
				options.defaultDataset = "full";
				break;
			case "--current":
				options.defaultDataset = "current";
				break;
			case "--help":
			case "-h":
				helpOption(options);
				break;
		}
	}

	return options;
}

function helpOption(options: CommandOptions): void {
	options.help = true;
}

function usageText(): string {
	return [
		"Usage: /context [--no-open] [--keep] [--redact] [--full]",
		"",
		"Opens a local HTML report showing where the current session context is going.",
		"",
		"Options:",
		"  --no-open   Write the report but do not open a browser.",
		"  --keep      Save under .pi/context-reports/ instead of the OS temp directory.",
		"  --redact    Hide message/tool contents while keeping token attribution.",
		"  --full      Open the report on the full active branch tab instead of current context.",
	].join("\n");
}

function formatTokens(tokens: number | null | undefined): string {
	if (tokens == null || !Number.isFinite(tokens)) return "?";
	const rounded = Math.round(tokens);
	if (Math.abs(rounded) < 1000) return rounded.toLocaleString();
	if (Math.abs(rounded) < 10_000) return `${(rounded / 1000).toFixed(1)}k`;
	if (Math.abs(rounded) < 1_000_000) return `${Math.round(rounded / 1000).toLocaleString()}k`;
	return `${(rounded / 1_000_000).toFixed(1)}M`;
}

function estimateTextTokens(text: string): number {
	if (!text) return 0;
	return Math.max(1, Math.ceil(text.length / 4));
}

function makeDetail(text: string, redact: boolean): string {
	if (redact) return text ? `[redacted ${text.length.toLocaleString()} characters]` : "";
	if (text.length <= DETAIL_TEXT_LIMIT) return text;
	return `${text.slice(0, DETAIL_TEXT_LIMIT)}\n\n[… ${(
		text.length - DETAIL_TEXT_LIMIT
	).toLocaleString()} more characters omitted from the report]`;
}

function makePreview(text: string, redact: boolean): string {
	if (redact) return text ? `[redacted ${text.length.toLocaleString()} chars]` : "";
	const compact = text.replace(/\s+/g, " ").trim();
	if (compact.length <= PREVIEW_TEXT_LIMIT) return compact;
	return `${compact.slice(0, PREVIEW_TEXT_LIMIT)}…`;
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2) ?? "";
	} catch {
		return String(value);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getContentBlocks(content: unknown): MinimalContentBlock[] {
	if (typeof content === "string") return [{ type: "text", text: content }];
	if (!Array.isArray(content)) return [];
	return content.filter(isRecord) as MinimalContentBlock[];
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (!isRecord(block)) continue;
		if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
	}
	return parts.join("\n");
}

function isoTimestamp(message: MinimalMessage, entry?: MinimalEntry): string | undefined {
	if (typeof message.timestamp === "number" && Number.isFinite(message.timestamp)) {
		return new Date(message.timestamp).toISOString();
	}
	return entry?.timestamp;
}

function extractLikelyPath(args: Record<string, unknown> | undefined): string | undefined {
	if (!args) return undefined;
	for (const key of ["path", "file", "filePath", "target", "cwd", "glob"] as const) {
		const value = args[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return undefined;
}

function extractLikelyCommand(args: Record<string, unknown> | undefined): string | undefined {
	const value = args?.command;
	return typeof value === "string" && value.trim() ? value : undefined;
}

function addSegment(
	state: AnalyzerState,
	segment: Omit<Segment, "id" | "sequence" | "preview" | "detail"> & { text: string },
): void {
	const sequence = state.sequence++;
	const detail = makeDetail(segment.text, state.redact);
	const preview = makePreview(segment.text, state.redact);
	const { text: _text, ...rest } = segment;
	const safeRest = state.redact ? redactSegmentMetadata(rest) : rest;
	state.segments.push({
		...safeRest,
		id: `seg-${sequence}`,
		sequence,
		preview,
		detail,
	});
}

function redactSegmentMetadata<T extends Omit<Segment, "id" | "sequence" | "preview" | "detail">>(segment: T): T {
	return {
		...segment,
		entryId: segment.entryId ? "[redacted entry]" : undefined,
		timestamp: segment.timestamp ? "[redacted timestamp]" : undefined,
		toolCallId: segment.toolCallId ? "[redacted tool call]" : undefined,
		path: segment.path ? "[redacted path]" : undefined,
		command: segment.command ? "[redacted command]" : undefined,
		note: segment.note ? "[redacted note]" : undefined,
	} as T;
}

function addTextSegment(
	state: AnalyzerState,
	category: CategoryId,
	label: string,
	text: string,
	base: {
		source: string;
		role: string;
		entryId?: string;
		timestamp?: string;
		toolName?: string;
		toolCallId?: string;
		path?: string;
		command?: string;
		excluded?: boolean;
		displayOnly?: boolean;
		note?: string;
		turn?: number;
	},
): void {
	const chars = text.length;
	const tokens = estimateTextTokens(text);
	if (tokens <= 0 && chars <= 0) return;
	addSegment(state, {
		category,
		label,
		source: base.source,
		role: base.role,
		tokens,
		chars,
		turn: base.turn ?? state.turn,
		entryId: base.entryId,
		timestamp: base.timestamp,
		toolName: base.toolName,
		toolCallId: base.toolCallId,
		path: base.path,
		command: base.command,
		excluded: base.excluded,
		displayOnly: base.displayOnly,
		note: base.note,
		text,
	});
}

function addImageSegment(
	state: AnalyzerState,
	label: string,
	base: {
		source: string;
		role: string;
		entryId?: string;
		timestamp?: string;
		toolName?: string;
		toolCallId?: string;
		excluded?: boolean;
		turn?: number;
		mimeType?: string;
	},
): void {
	addSegment(state, {
		category: "images",
		label,
		source: base.source,
		role: base.role,
		tokens: IMAGE_TOKEN_ESTIMATE,
		chars: IMAGE_TOKEN_ESTIMATE * 4,
		turn: base.turn ?? state.turn,
		entryId: base.entryId,
		timestamp: base.timestamp,
		toolName: base.toolName,
		toolCallId: base.toolCallId,
		excluded: base.excluded,
		note: base.mimeType ? `Image block (${base.mimeType}); token count is a conservative estimate.` : "Image block; token count is a conservative estimate.",
		text: base.mimeType ? `[image: ${base.mimeType}]` : "[image]",
	});
}

function analyzeUserContent(state: AnalyzerState, message: MinimalMessage, entry?: MinimalEntry): void {
	state.turn++;
	const timestamp = isoTimestamp(message, entry);
	const entryId = entry?.id;
	const blocks = getContentBlocks(message.content);
	for (const block of blocks) {
		if (block.type === "text" && typeof block.text === "string") {
			addTextSegment(state, "user", "User message", block.text, {
				source: "message",
				role: "user",
				entryId,
				timestamp,
			});
		} else if (block.type === "image") {
			addImageSegment(state, "User image", {
				source: "message",
				role: "user",
				entryId,
				timestamp,
				mimeType: block.mimeType ?? block.source?.mediaType,
			});
		}
	}
}

function analyzeAssistantContent(state: AnalyzerState, message: MinimalMessage, entry?: MinimalEntry): void {
	const timestamp = isoTimestamp(message, entry);
	const entryId = entry?.id;
	const blocks = getContentBlocks(message.content);
	for (const block of blocks) {
		if (block.type === "text" && typeof block.text === "string") {
			addTextSegment(state, "assistant", "Assistant response", block.text, {
				source: "message",
				role: "assistant",
				entryId,
				timestamp,
			});
		} else if (block.type === "thinking" && typeof block.thinking === "string") {
			addTextSegment(state, "thinking", "Assistant thinking", block.thinking, {
				source: "message",
				role: "assistant",
				entryId,
				timestamp,
			});
		} else if (block.type === "toolCall" && typeof block.name === "string") {
			const args = isRecord(block.arguments) ? block.arguments : {};
			const toolCallText = `${block.name}(${safeJson(args)})`;
			addTextSegment(state, "toolCalls", `Tool call: ${block.name}`, toolCallText, {
				source: "tool-call",
				role: "assistant",
				entryId,
				timestamp,
				toolName: block.name,
				toolCallId: block.id,
				path: extractLikelyPath(args),
				command: extractLikelyCommand(args),
			});
		}
	}
}

function analyzeToolResult(state: AnalyzerState, message: MinimalMessage, entry?: MinimalEntry): void {
	const timestamp = isoTimestamp(message, entry);
	const entryId = entry?.id;
	const toolName = message.toolName ?? "tool";
	const blocks = getContentBlocks(message.content);
	for (const block of blocks) {
		if (block.type === "text" && typeof block.text === "string") {
			const noteParts: string[] = [];
			if (message.details && isRecord(message.details)) {
				if (isRecord(message.details.truncation) && message.details.truncation.truncated) noteParts.push("Result was truncated before entering context.");
				if (typeof message.details.fullOutputPath === "string") noteParts.push(`Full output: ${message.details.fullOutputPath}`);
			}
			addTextSegment(state, "toolResults", `Tool result: ${toolName}`, block.text, {
				source: "tool-result",
				role: "toolResult",
				entryId,
				timestamp,
				toolName,
				toolCallId: message.toolCallId,
				note: noteParts.join(" ") || undefined,
			});
		} else if (block.type === "image") {
			addImageSegment(state, `Tool image: ${toolName}`, {
				source: "tool-result",
				role: "toolResult",
				entryId,
				timestamp,
				toolName,
				toolCallId: message.toolCallId,
				mimeType: block.mimeType ?? block.source?.mediaType,
			});
		}
	}
}

function bashExecutionToModelText(message: MinimalMessage): string {
	let text = `Ran \`${message.command ?? ""}\`\n`;
	if (message.output) text += `\`\`\`\n${message.output}\n\`\`\``;
	else text += "(no output)";
	if (message.cancelled) text += "\n\n(command cancelled)";
	else if (message.exitCode !== null && message.exitCode !== undefined && message.exitCode !== 0) {
		text += `\n\nCommand exited with code ${message.exitCode}`;
	}
	if (message.truncated && message.fullOutputPath) {
		text += `\n\n[Output truncated. Full output: ${message.fullOutputPath}]`;
	}
	return text;
}

function analyzeBashExecution(state: AnalyzerState, message: MinimalMessage, entry?: MinimalEntry): void {
	state.turn++;
	const timestamp = isoTimestamp(message, entry);
	const text = bashExecutionToModelText(message);
	const excluded = message.excludeFromContext === true;
	addTextSegment(state, "bash", "User bash execution", text, {
		source: "bash-execution",
		role: "bashExecution",
		entryId: entry?.id,
		timestamp,
		command: message.command,
		excluded,
		note: excluded
			? "This was marked excludeFromContext by pi (!! command). It is shown as session-only context."
			: undefined,
	});
}

function analyzeCustomMessage(state: AnalyzerState, message: MinimalMessage, entry?: MinimalEntry): void {
	state.turn++;
	const timestamp = isoTimestamp(message, entry);
	const text = contentText(message.content);
	addTextSegment(state, "custom", message.customType ? `Custom context: ${message.customType}` : "Custom context", text, {
		source: "custom-message",
		role: "custom",
		entryId: entry?.id,
		timestamp,
		displayOnly: message.display === false,
		note: message.display === false ? "Hidden in TUI, but sent to the model as custom context." : undefined,
	});
	for (const block of getContentBlocks(message.content)) {
		if (block.type === "image") {
			addImageSegment(state, message.customType ? `Custom image: ${message.customType}` : "Custom image", {
				source: "custom-message",
				role: "custom",
				entryId: entry?.id,
				timestamp,
				mimeType: block.mimeType ?? block.source?.mediaType,
			});
		}
	}
}

function analyzeSummaryMessage(state: AnalyzerState, message: MinimalMessage, entry?: MinimalEntry): void {
	const isCompaction = message.role === "compactionSummary" || entry?.type === "compaction";
	const label = isCompaction ? "Compaction summary" : "Branch summary";
	const summary = message.summary ?? entry?.summary ?? "";
	const modelText = isCompaction
		? `${COMPACTION_SUMMARY_PREFIX}${summary}${COMPACTION_SUMMARY_SUFFIX}`
		: `${BRANCH_SUMMARY_PREFIX}${summary}${BRANCH_SUMMARY_SUFFIX}`;
	addTextSegment(state, "summaries", label, modelText, {
		source: isCompaction ? "compaction" : "branch-summary",
		role: message.role ?? (isCompaction ? "compactionSummary" : "branchSummary"),
		entryId: entry?.id,
		timestamp: isoTimestamp(message, entry),
		note: isCompaction && typeof message.tokensBefore === "number"
			? `This summary replaced about ${formatTokens(message.tokensBefore)} earlier tokens before compaction.`
			: undefined,
	});
}

function analyzeMessage(state: AnalyzerState, message: MinimalMessage, entry?: MinimalEntry): void {
	switch (message.role) {
		case "user":
			analyzeUserContent(state, message, entry);
			break;
		case "assistant":
			analyzeAssistantContent(state, message, entry);
			break;
		case "toolResult":
			analyzeToolResult(state, message, entry);
			break;
		case "bashExecution":
			analyzeBashExecution(state, message, entry);
			break;
		case "custom":
			analyzeCustomMessage(state, message, entry);
			break;
		case "branchSummary":
		case "compactionSummary":
			analyzeSummaryMessage(state, message, entry);
			break;
	}
}

function contextEntryToMessage(entry: MinimalEntry): MinimalMessage | undefined {
	if (entry.type === "message") return entry.message;
	if (entry.type === "custom_message") {
		return {
			role: "custom",
			customType: entry.customType,
			content: entry.content,
			display: entry.display,
			details: entry.details,
			timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined,
		};
	}
	if (entry.type === "branch_summary") {
		return {
			role: "branchSummary",
			summary: entry.summary,
			fromId: entry.fromId,
			timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined,
		};
	}
	if (entry.type === "compaction") {
		return {
			role: "compactionSummary",
			summary: entry.summary,
			tokensBefore: entry.tokensBefore,
			timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined,
		};
	}
	return undefined;
}

function isContextEntry(entry: MinimalEntry): boolean {
	return entry.type === "message" || entry.type === "custom_message" || entry.type === "branch_summary";
}

function collectCurrentContextEntries(branchEntries: MinimalEntry[]): MinimalEntry[] {
	let compactionIndex = -1;
	for (let i = branchEntries.length - 1; i >= 0; i--) {
		if (branchEntries[i]?.type === "compaction") {
			compactionIndex = i;
			break;
		}
	}

	if (compactionIndex === -1) return branchEntries.filter(isContextEntry);

	const result: MinimalEntry[] = [branchEntries[compactionIndex]];
	const compaction = branchEntries[compactionIndex];
	let foundFirstKept = false;
	for (let i = 0; i < compactionIndex; i++) {
		const entry = branchEntries[i];
		if (entry?.id === compaction?.firstKeptEntryId) foundFirstKept = true;
		if (foundFirstKept && isContextEntry(entry)) result.push(entry);
	}
	for (let i = compactionIndex + 1; i < branchEntries.length; i++) {
		const entry = branchEntries[i];
		if (isContextEntry(entry)) result.push(entry);
	}
	return result;
}

function resolveCurrentContextEntries(ctx: ExtensionCommandContext, branchEntries: MinimalEntry[]): MinimalEntry[] {
	const currentEntries = safeCall(() => ctx.sessionManager.buildContextEntries()) as MinimalEntry[] | undefined;
	if (Array.isArray(currentEntries)) return currentEntries;
	return collectCurrentContextEntries(branchEntries);
}

function analyzeEntries(entries: MinimalEntry[], redact: boolean): { segments: Segment[]; messageCount: number } {
	const state: AnalyzerState = { segments: [], sequence: 0, turn: 0, redact };
	let messageCount = 0;
	for (const entry of entries) {
		const message = contextEntryToMessage(entry);
		if (!message) continue;
		messageCount++;
		analyzeMessage(state, message, entry);
	}
	return { segments: state.segments, messageCount };
}

function collectToolSchemaText(pi: ExtensionAPI): string {
	try {
		const activeToolNames = new Set(pi.getActiveTools());
		const tools = pi.getAllTools().filter((tool) => activeToolNames.has(tool.name));
		return tools
			.map((tool) => safeJson({
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
				source: tool.sourceInfo,
			}))
			.join("\n\n");
	} catch {
		return "";
	}
}

function buildOverheadSegments(pi: ExtensionAPI, ctx: ExtensionCommandContext, redact: boolean): Segment[] {
	const state: AnalyzerState = { segments: [], sequence: -2, turn: 0, redact };
	const systemPrompt = safeCall(() => ctx.getSystemPrompt()) ?? "";
	addTextSegment(state, "system", "Current system prompt", systemPrompt, {
		source: "system-prompt",
		role: "system",
		turn: 0,
	});
	const toolSchemaText = collectToolSchemaText(pi);
	addTextSegment(state, "toolSchemas", "Active tool schemas", toolSchemaText, {
		source: "tool-schema",
		role: "system",
		turn: 0,
	});
	return state.segments.map((segment, index) => ({ ...segment, id: `overhead-${index}`, sequence: -2 + index }));
}

function safeCall<T>(fn: () => T): T | undefined {
	try {
		return fn();
	} catch {
		return undefined;
	}
}

function aggregateBy(
	segments: Segment[],
	keyFn: (segment: Segment) => string | undefined,
	labelFn: (key: string) => string = (key) => key,
): AggregateStat[] {
	const map = new Map<string, { tokens: number; segments: number }>();
	for (const segment of segments) {
		if (segment.excluded) continue;
		const key = keyFn(segment);
		if (!key) continue;
		const current = map.get(key) ?? { tokens: 0, segments: 0 };
		current.tokens += segment.tokens;
		current.segments++;
		map.set(key, current);
	}
	const total = Array.from(map.values()).reduce((sum, stat) => sum + stat.tokens, 0);
	return Array.from(map.entries())
		.map(([key, stat]) => ({
			key,
			label: labelFn(key),
			tokens: Math.round(stat.tokens),
			segments: stat.segments,
			percent: total > 0 ? (stat.tokens / total) * 100 : 0,
		}))
		.sort((a, b) => b.tokens - a.tokens)
		.slice(0, 12);
}

function finalizeDataset(
	id: DatasetId,
	label: string,
	description: string,
	segments: Segment[],
	messageCount: number,
	authoritativeTokens: number | null,
): Dataset {
	const visibleSegments = segments.filter((segment) => !segment.excluded);
	const visibleRawTokens = visibleSegments.reduce((sum, segment) => sum + segment.tokens, 0);
	const excludedTokens = segments.filter((segment) => segment.excluded).reduce((sum, segment) => sum + segment.tokens, 0);
	const providerDeltaTokens = authoritativeTokens != null ? Math.max(0, Math.round(authoritativeTokens - visibleRawTokens)) : 0;
	const estimatorOverageTokens = authoritativeTokens != null ? Math.max(0, Math.round(visibleRawTokens - authoritativeTokens)) : 0;
	const reconciliationScale = authoritativeTokens != null && visibleRawTokens > authoritativeTokens && visibleRawTokens > 0
		? authoritativeTokens / visibleRawTokens
		: 1;
	const displayTotal = authoritativeTokens ?? visibleRawTokens;

	const byCategory = new Map<CategoryId, { tokens: number; segments: number }>();
	for (const segment of visibleSegments) {
		const current = byCategory.get(segment.category) ?? { tokens: 0, segments: 0 };
		current.tokens += segment.tokens;
		current.segments++;
		byCategory.set(segment.category, current);
	}
	if (providerDeltaTokens > 0) {
		byCategory.set("providerDelta", { tokens: providerDeltaTokens, segments: 1 });
	}

	const categories = (Object.keys(CATEGORY_META) as CategoryId[])
		.map((categoryId) => {
			const current = byCategory.get(categoryId) ?? { tokens: 0, segments: 0 };
			const rawTokens = current.tokens;
			const displayTokens = categoryId === "providerDelta"
				? rawTokens
				: Math.round(rawTokens * reconciliationScale);
			const meta = CATEGORY_META[categoryId];
			return {
				id: categoryId,
				label: meta.label,
				shortLabel: meta.shortLabel,
				color: meta.color,
				description: meta.description,
				tokens: Math.round(rawTokens),
				displayTokens,
				percent: displayTotal > 0 ? (displayTokens / displayTotal) * 100 : 0,
				segments: current.segments,
			};
		})
		.filter((stat) => stat.tokens > 0 || stat.displayTokens > 0)
		.sort((a, b) => b.displayTokens - a.displayTokens);

	return {
		id,
		label,
		description,
		segments,
		stats: {
			tokens: Math.round(displayTotal),
			rawTokens: Math.round(segments.reduce((sum, segment) => sum + segment.tokens, 0)),
			visibleRawTokens: Math.round(visibleRawTokens),
			excludedTokens: Math.round(excludedTokens),
			providerDeltaTokens,
			estimatorOverageTokens,
			reconciliationScale,
			segmentCount: segments.length,
			messageCount,
			categories,
			topSegments: [...visibleSegments].sort((a, b) => b.tokens - a.tokens).slice(0, 24),
			topTools: aggregateBy(visibleSegments, (segment) => segment.toolName),
			topPaths: aggregateBy(visibleSegments, (segment) => segment.path),
			topTurns: aggregateBy(visibleSegments, (segment) => segment.turn > 0 ? String(segment.turn) : undefined, (key) => `Turn ${key}`),
		},
	};
}

function getSessionName(ctx: ExtensionCommandContext): string | undefined {
	return safeCall(() => ctx.sessionManager.getSessionName()) ?? safeCall(() => (ctx as unknown as { getSessionName?: () => string | undefined }).getSessionName?.());
}

function buildReportData(pi: ExtensionAPI, ctx: ExtensionCommandContext, options: CommandOptions): ReportData {
	const branchEntries = ctx.sessionManager.getBranch() as MinimalEntry[];
	const currentEntries = resolveCurrentContextEntries(ctx, branchEntries);
	const overhead = buildOverheadSegments(pi, ctx, options.redact);
	const currentAnalysis = analyzeEntries(currentEntries, options.redact);
	const fullAnalysis = analyzeEntries(branchEntries, options.redact);
	const usage = ctx.getContextUsage();
	const contextTokens = usage?.tokens ?? null;
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? null;
	const contextPercent = usage?.percent ?? (contextTokens != null && contextWindow ? (contextTokens / contextWindow) * 100 : null);

	const currentSegments = [...overhead, ...currentAnalysis.segments];
	const fullSegments = [...overhead, ...fullAnalysis.segments];
	const currentDataset = finalizeDataset(
		"current",
		"Current model context",
		"What pi is expected to send to the model on the next turn: latest compaction summary plus unsummarized messages, system prompt, and active tool schemas.",
		currentSegments,
		currentAnalysis.messageCount,
		contextTokens,
	);
	const fullDataset = finalizeDataset(
		"full",
		"Full active branch history",
		"Every context-bearing entry on the active branch, including pre-compaction history that may no longer be sent verbatim.",
		fullSegments,
		fullAnalysis.messageCount,
		null,
	);

	const notes: string[] = [
		"Per-component token counts are local estimates based mostly on characters/4. Providers expose aggregate usage, not exact per-message attribution.",
		"The current-context chart reconciles to pi's footer-compatible context total when that total is known.",
	];
	if (options.redact) {
		notes.push("Redaction is enabled: message contents, paths, commands, session identifiers, and timestamps are hidden in this report.");
	}
	if (usage?.tokens == null) {
		notes.push("Current context usage is unknown, usually because compaction just ran and no model response has arrived yet.");
	}
	if (currentDataset.stats.estimatorOverageTokens > 0) {
		notes.push(`Local component estimates exceed pi's footer total by ${formatTokens(currentDataset.stats.estimatorOverageTokens)} tokens, so chart slices are scaled down proportionally.`);
	}
	if (currentDataset.stats.providerDeltaTokens > 0) {
		notes.push(`${formatTokens(currentDataset.stats.providerDeltaTokens)} tokens are unattributed provider/serialization delta: system serialization, provider tokenization, cache accounting, or schema overhead not explained by local estimates.`);
	}

	return {
		generatedAt: new Date().toISOString(),
		cwd: options.redact ? "[redacted cwd]" : ctx.cwd,
		session: {
			id: options.redact ? "[redacted session]" : safeCall(() => ctx.sessionManager.getSessionId()),
			name: options.redact ? "[redacted session name]" : getSessionName(ctx),
			file: options.redact ? "[redacted session file]" : safeCall(() => ctx.sessionManager.getSessionFile()),
		},
		model: {
			provider: ctx.model?.provider,
			id: ctx.model?.id,
			contextWindow: ctx.model?.contextWindow,
			thinkingLevel: safeCall(() => pi.getThinkingLevel()),
		},
		contextUsage: {
			tokens: contextTokens,
			contextWindow,
			percent: contextPercent,
		},
		options: {
			redacted: options.redact,
			defaultDataset: options.defaultDataset,
		},
		categoryMeta: CATEGORY_META,
		datasets: {
			current: currentDataset,
			full: fullDataset,
		},
		notes,
	};
}

function sanitizeFilePart(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "session";
}

function reportPath(ctx: ExtensionCommandContext, options: CommandOptions): string {
	const rawSessionId = options.redact ? "redacted" : (safeCall(() => ctx.sessionManager.getSessionId()) ?? "session");
	const fileName = `pi-context-${sanitizeFilePart(rawSessionId)}-${Date.now()}.html`;
	if (options.keep) {
		const dir = join(ctx.cwd, ".pi", "context-reports");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		try { chmodSync(dir, 0o700); } catch { /* best effort */ }
		return join(dir, fileName);
	}
	const dir = mkdtempSync(join(tmpdir(), "pi-context-"));
	try { chmodSync(dir, 0o700); } catch { /* best effort */ }
	return join(dir, fileName);
}

async function openReport(pi: ExtensionAPI, filePath: string): Promise<{ ok: boolean; error?: string }> {
	const url = pathToFileURL(filePath).href;
	try {
		let result: { code?: number | null; stderr?: string };
		if (process.platform === "darwin") {
			result = await pi.exec("open", [url], { timeout: 5000 });
		} else if (process.platform === "win32") {
			result = await pi.exec("cmd", ["/c", "start", "", url], { timeout: 5000 });
		} else {
			result = await pi.exec("xdg-open", [url], { timeout: 5000 });
		}
		if (result.code === 0) return { ok: true };
		return { ok: false, error: result.stderr || `open command exited with code ${result.code}` };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

function notify(ctx: ExtensionCommandContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(message, type);
	else console.log(message);
}

function writeReport(data: ReportData, filePath: string): void {
	writeFileSync(filePath, buildHtml(data), { encoding: "utf8", mode: 0o600 });
}

function scriptJson(data: ReportData): string {
	return JSON.stringify(data)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}

function buildHtml(data: ReportData): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>pi context inspector</title>
<style>
:root {
	color-scheme: dark;
	--bg: #070a12;
	--panel: rgba(15, 23, 42, 0.72);
	--panel-strong: rgba(15, 23, 42, 0.94);
	--line: rgba(148, 163, 184, 0.18);
	--text: #e5edf7;
	--muted: #94a3b8;
	--dim: #64748b;
	--accent: #8b5cf6;
	--accent-2: #06b6d4;
	--good: #22c55e;
	--warn: #f59e0b;
	--bad: #ef4444;
	--shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
	margin: 0;
	min-height: 100vh;
	font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	background:
		radial-gradient(circle at 12% 0%, rgba(139, 92, 246, 0.28), transparent 31rem),
		radial-gradient(circle at 88% 8%, rgba(6, 182, 212, 0.22), transparent 28rem),
		linear-gradient(135deg, #070a12 0%, #0f172a 58%, #111827 100%);
	color: var(--text);
}
body::before {
	content: "";
	position: fixed;
	inset: 0;
	pointer-events: none;
	background-image:
		linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
		linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
	background-size: 44px 44px;
	mask-image: radial-gradient(circle at 50% 0%, black, transparent 72%);
}
.header {
	position: sticky;
	top: 0;
	z-index: 10;
	backdrop-filter: blur(22px);
	background: linear-gradient(180deg, rgba(7,10,18,.94), rgba(7,10,18,.70));
	border-bottom: 1px solid var(--line);
}
.header-inner, main { width: min(1420px, calc(100vw - 40px)); margin: 0 auto; }
.header-inner { padding: 22px 0 18px; display: flex; align-items: center; gap: 18px; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.logo {
	width: 44px; height: 44px; border-radius: 16px;
	background: conic-gradient(from 180deg, #8b5cf6, #06b6d4, #22c55e, #f59e0b, #8b5cf6);
	box-shadow: 0 0 36px rgba(139, 92, 246, .36);
}
h1 { margin: 0; font-size: clamp(24px, 3vw, 42px); letter-spacing: -0.04em; }
.subtitle { margin-top: 4px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70vw; }
.controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
button, select, input {
	font: inherit;
	color: var(--text);
	background: rgba(15, 23, 42, .82);
	border: 1px solid var(--line);
	border-radius: 999px;
	padding: 10px 14px;
	outline: none;
}
button { cursor: pointer; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
button:hover { transform: translateY(-1px); border-color: rgba(139, 92, 246, .65); background: rgba(30, 41, 59, .9); }
button.active { border-color: rgba(6, 182, 212, .75); box-shadow: inset 0 0 0 1px rgba(6,182,212,.25), 0 0 30px rgba(6,182,212,.12); }
main { padding: 28px 0 60px; }
.grid { display: grid; gap: 18px; }
.hero { grid-template-columns: minmax(300px, 0.92fr) minmax(360px, 1.28fr); align-items: stretch; }
.cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.card, .panel {
	background: var(--panel);
	border: 1px solid var(--line);
	border-radius: 28px;
	box-shadow: var(--shadow);
	backdrop-filter: blur(22px);
}
.card { padding: 20px; }
.card .label { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .12em; }
.card .value { margin-top: 10px; font-size: clamp(26px, 3vw, 42px); font-weight: 800; letter-spacing: -0.04em; }
.card .hint { margin-top: 8px; color: var(--dim); font-size: 13px; line-height: 1.45; }
.panel { padding: 22px; }
.panel h2 { margin: 0 0 16px; font-size: 18px; letter-spacing: -0.02em; }
.donut-wrap { display: grid; grid-template-columns: 230px 1fr; gap: 26px; align-items: center; }
.donut {
	width: 230px; height: 230px; border-radius: 50%;
	background: conic-gradient(var(--accent) 0deg, var(--accent-2) 360deg);
	position: relative;
	box-shadow: inset 0 0 18px rgba(255,255,255,.05), 0 26px 70px rgba(0,0,0,.32);
}
.donut::after {
	content: ""; position: absolute; inset: 34px; border-radius: 50%;
	background: radial-gradient(circle at 35% 25%, rgba(30,41,59,.98), rgba(2,6,23,.98));
	border: 1px solid rgba(255,255,255,.08);
}
.donut-center { position: absolute; inset: 54px; z-index: 1; display: grid; place-content: center; text-align: center; }
.donut-center strong { font-size: 34px; letter-spacing: -0.05em; }
.donut-center span { color: var(--muted); font-size: 12px; margin-top: 4px; }
.legend { display: grid; gap: 10px; }
.legend-item {
	display: grid; grid-template-columns: 14px minmax(120px, 1fr) auto; gap: 10px; align-items: center;
	width: 100%; border-radius: 16px; padding: 10px 12px; text-align: left; background: rgba(2, 6, 23, .32);
}
.swatch { width: 12px; height: 12px; border-radius: 999px; box-shadow: 0 0 18px currentColor; }
.legend-label { font-weight: 700; }
.legend-desc { color: var(--dim); font-size: 12px; margin-top: 2px; }
.legend-value { color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
.stack { height: 22px; border-radius: 999px; overflow: hidden; display: flex; background: rgba(15,23,42,.9); border: 1px solid var(--line); }
.stack span { min-width: 2px; }
.toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 18px 0; }
.toolbar input { flex: 1 1 280px; border-radius: 16px; }
.toolbar select { border-radius: 16px; }
.two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.list { display: grid; gap: 10px; }
.list-item { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; border: 1px solid var(--line); background: rgba(2,6,23,.32); border-radius: 16px; padding: 12px 14px; }
.list-item button { border-radius: 12px; padding: 6px 10px; color: var(--muted); }
.kicker { color: var(--dim); font-size: 12px; margin-top: 3px; }
.token { font-variant-numeric: tabular-nums; font-weight: 800; }
.table { display: grid; gap: 10px; }
.segment {
	border: 1px solid var(--line);
	background: rgba(2,6,23,.38);
	border-radius: 18px;
	overflow: hidden;
}
.segment summary { cursor: pointer; list-style: none; display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 14px; }
.segment summary::-webkit-details-marker { display: none; }
.pill { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 800; color: #020617; }
.segment-title { min-width: 0; }
.segment-title strong { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.segment-title span { display: block; color: var(--muted); font-size: 12px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.segment-body { border-top: 1px solid var(--line); padding: 14px; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; color: #cbd5e1; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.55; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.meta span { color: var(--muted); background: rgba(15,23,42,.88); border: 1px solid var(--line); border-radius: 999px; padding: 5px 8px; font-size: 12px; }
.notes { display: grid; gap: 10px; }
.note { border-left: 3px solid var(--accent-2); background: rgba(6, 182, 212, .08); border-radius: 14px; padding: 12px 14px; color: #cbd5e1; }
.empty { color: var(--muted); padding: 18px; border: 1px dashed var(--line); border-radius: 18px; text-align: center; }
.footer { margin-top: 28px; color: var(--dim); font-size: 12px; text-align: center; }
@media (max-width: 1050px) { .hero, .two-col, .cards { grid-template-columns: 1fr; } .donut-wrap { grid-template-columns: 1fr; justify-items: center; } .header-inner { align-items: flex-start; flex-direction: column; } .controls { justify-content: flex-start; } }
@media (max-width: 620px) { .header-inner, main { width: min(100vw - 24px, 1420px); } .segment summary { grid-template-columns: 1fr; } .donut { width: 190px; height: 190px; } .donut-center { inset: 48px; } }
</style>
</head>
<body>
<header class="header">
	<div class="header-inner">
		<div class="brand">
			<div class="logo" aria-hidden="true"></div>
			<div>
				<h1>Context Inspector</h1>
				<div class="subtitle" id="subtitle"></div>
			</div>
		</div>
		<div class="controls">
			<button id="dataset-current">Current context</button>
			<button id="dataset-full">Full branch</button>
		</div>
	</div>
</header>
<main>
	<section class="grid cards" id="cards"></section>
	<section class="grid hero" style="margin-top:18px">
		<div class="panel">
			<h2>At a glance</h2>
			<div class="donut-wrap">
				<div class="donut" id="donut"><div class="donut-center"><strong id="donut-percent">?</strong><span id="donut-caption">of window</span></div></div>
				<div class="legend" id="legend"></div>
			</div>
		</div>
		<div class="panel">
			<h2>Stacked breakdown</h2>
			<div class="stack" id="stack"></div>
			<div class="notes" id="notes" style="margin-top:18px"></div>
		</div>
	</section>
	<section class="grid two-col" style="margin-top:18px">
		<div class="panel"><h2>Top tools</h2><div class="list" id="top-tools"></div></div>
		<div class="panel"><h2>Top paths / globs</h2><div class="list" id="top-paths"></div></div>
	</section>
	<section class="grid two-col" style="margin-top:18px">
		<div class="panel"><h2>Top turns</h2><div class="list" id="top-turns"></div></div>
		<div class="panel"><h2>Largest segments</h2><div class="list" id="top-segments"></div></div>
	</section>
	<section class="panel" style="margin-top:18px">
		<h2>Drill down</h2>
		<div class="toolbar">
			<input id="search" type="search" placeholder="Search content, tool names, paths, commands…" />
			<select id="category-filter"><option value="">All categories</option></select>
			<select id="sort"><option value="tokens">Largest first</option><option value="timeline">Timeline</option></select>
			<button id="clear-filter">Clear</button>
		</div>
		<div class="table" id="segments"></div>
	</section>
	<div class="footer">Generated locally by pi-context-inspector. No network calls. Token attribution is approximate unless otherwise noted.</div>
</main>
<script id="report-data" type="application/json">${scriptJson(data)}</script>
<script>
(() => {
	const data = JSON.parse(document.getElementById('report-data').textContent);
	const state = {
		dataset: data.options.defaultDataset || 'current',
		category: '',
		search: '',
		sort: 'tokens',
	};
	const $ = (id) => document.getElementById(id);
	const fmt = (n) => {
		if (n === null || n === undefined || Number.isNaN(n)) return '?';
		const x = Math.round(n);
		if (Math.abs(x) < 1000) return x.toLocaleString();
		if (Math.abs(x) < 10000) return (x / 1000).toFixed(1) + 'k';
		if (Math.abs(x) < 1000000) return Math.round(x / 1000).toLocaleString() + 'k';
		return (x / 1000000).toFixed(1) + 'M';
	};
	const pct = (n) => n === null || n === undefined || Number.isNaN(n) ? '?' : n.toFixed(1) + '%';
	const el = (tag, attrs = {}, children = []) => {
		const node = document.createElement(tag);
		for (const [key, value] of Object.entries(attrs)) {
			if (key === 'class') node.className = value;
			else if (key === 'text') node.textContent = value;
			else if (key === 'html') node.innerHTML = value;
			else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
			else if (value !== undefined && value !== null) node.setAttribute(key, value);
		}
		for (const child of children) node.append(child);
		return node;
	};
	const dataset = () => data.datasets[state.dataset];
	function setDataset(id) { state.dataset = id; render(); }
	function setCategory(id) { state.category = id; $('category-filter').value = id; renderSegments(); }
	function setSearch(text) { state.search = text; $('search').value = text; renderSegments(); }
	function meta(category) { return data.categoryMeta[category] || data.categoryMeta.providerDelta; }
	function renderCards(ds) {
		const cards = $('cards'); cards.replaceChildren();
		const usage = data.contextUsage;
		const model = [data.model.provider, data.model.id].filter(Boolean).join('/') || 'no model';
		const cardData = [
			['Context used', usage.tokens == null ? fmt(ds.stats.tokens) : fmt(usage.tokens), usage.percent == null ? 'Footer percent is currently unknown.' : pct(usage.percent) + ' of ' + fmt(usage.contextWindow) + ' tokens'],
			['Dataset total', fmt(ds.stats.tokens), ds.id === 'current' ? 'Reconciled to pi footer when available.' : 'Full branch is shown as raw local estimates.'],
			['Biggest bucket', ds.stats.categories[0]?.label || '—', ds.stats.categories[0] ? fmt(ds.stats.categories[0].displayTokens) + ' tokens' : 'No context-bearing entries found.'],
			['Model', model, data.model.thinkingLevel ? 'thinking: ' + data.model.thinkingLevel : ''],
		];
		for (const [label, value, hint] of cardData) {
			cards.append(el('div', { class: 'card' }, [
				el('div', { class: 'label', text: label }),
				el('div', { class: 'value', text: value }),
				el('div', { class: 'hint', text: hint }),
			]));
		}
	}
	function renderDonut(ds) {
		const cats = ds.stats.categories.filter(c => c.displayTokens > 0);
		const total = cats.reduce((sum, c) => sum + c.displayTokens, 0) || 1;
		let cursor = 0;
		const stops = cats.map((c) => {
			const start = cursor;
			const end = cursor + (c.displayTokens / total) * 360;
			cursor = end;
			return c.color + ' ' + start.toFixed(2) + 'deg ' + end.toFixed(2) + 'deg';
		});
		$('donut').style.background = 'conic-gradient(' + (stops.join(', ') || '#334155 0deg 360deg') + ')';
		$('donut-percent').textContent = data.contextUsage.percent == null || ds.id !== 'current' ? fmt(ds.stats.tokens) : pct(data.contextUsage.percent);
		$('donut-caption').textContent = ds.id === 'current' ? 'current context' : 'estimated tokens';
		const legend = $('legend'); legend.replaceChildren();
		for (const c of cats) {
			legend.append(el('button', { class: 'legend-item' + (state.category === c.id ? ' active' : ''), onclick: () => setCategory(c.id) }, [
				el('span', { class: 'swatch', style: 'background:' + c.color + '; color:' + c.color }),
				el('span', {}, [el('span', { class: 'legend-label', text: c.label }), el('span', { class: 'legend-desc', text: c.description })]),
				el('span', { class: 'legend-value', text: fmt(c.displayTokens) + ' · ' + pct(c.percent) }),
			]));
		}
	}
	function renderStack(ds) {
		const stack = $('stack'); stack.replaceChildren();
		const total = ds.stats.categories.reduce((sum, c) => sum + c.displayTokens, 0) || 1;
		for (const c of ds.stats.categories.filter(c => c.displayTokens > 0)) {
			const span = el('span', { title: c.label + ': ' + fmt(c.displayTokens), style: 'width:' + Math.max(0.4, (c.displayTokens / total) * 100) + '%; background:' + c.color });
			stack.append(span);
		}
		const notes = $('notes'); notes.replaceChildren();
		for (const note of data.notes) notes.append(el('div', { class: 'note', text: note }));
		if (ds.stats.excludedTokens > 0) notes.append(el('div', { class: 'note', text: fmt(ds.stats.excludedTokens) + ' estimated tokens are session-only/excluded entries and are not counted in the visible chart.' }));
	}
	function renderAggregate(containerId, stats, searchPrefix) {
		const box = $(containerId); box.replaceChildren();
		if (!stats.length) { box.append(el('div', { class: 'empty', text: 'No data in this dataset.' })); return; }
		for (const item of stats) {
			box.append(el('div', { class: 'list-item' }, [
				el('div', {}, [el('strong', { text: item.label }), el('div', { class: 'kicker', text: item.segments + ' segment(s) · ' + pct(item.percent) })]),
				el('div', {}, [el('div', { class: 'token', text: fmt(item.tokens) }), el('button', { text: 'filter', onclick: () => setSearch(searchPrefix ? searchPrefix + item.key : item.key) })]),
			]));
		}
	}
	function renderTopSegments(ds) {
		const box = $('top-segments'); box.replaceChildren();
		if (!ds.stats.topSegments.length) { box.append(el('div', { class: 'empty', text: 'No segments in this dataset.' })); return; }
		for (const segment of ds.stats.topSegments.slice(0, 8)) {
			const m = meta(segment.category);
			box.append(el('div', { class: 'list-item' }, [
				el('div', {}, [el('strong', { text: segment.label }), el('div', { class: 'kicker', text: m.label + ' · ' + (segment.preview || 'No preview') })]),
				el('div', {}, [el('div', { class: 'token', text: fmt(segment.tokens) }), el('button', { text: 'filter', onclick: () => setSearch(segment.id) })]),
			]));
		}
	}
	function renderFilters(ds) {
		const select = $('category-filter');
		const selected = select.value;
		select.replaceChildren(el('option', { value: '', text: 'All categories' }));
		for (const c of ds.stats.categories) select.append(el('option', { value: c.id, text: c.label }));
		select.value = selected && ds.stats.categories.some(c => c.id === selected) ? selected : '';
		state.category = select.value;
	}
	function segmentMatches(segment) {
		if (state.category && segment.category !== state.category) return false;
		const q = state.search.trim().toLowerCase();
		if (!q) return true;
		return [segment.id, 'turn:' + segment.turn, segment.label, segment.source, segment.role, segment.toolName, segment.path, segment.command, segment.preview, segment.detail, segment.note, segment.entryId]
			.filter(Boolean).some(v => String(v).toLowerCase().includes(q));
	}
	function segmentNode(segment) {
		const m = meta(segment.category);
		const metaBits = [
			segment.role,
			segment.source,
			segment.toolName && 'tool: ' + segment.toolName,
			segment.path && 'path: ' + segment.path,
			segment.command && 'command: ' + segment.command,
			segment.entryId && 'entry: ' + segment.entryId,
			segment.timestamp,
			segment.excluded && 'excluded from context',
			segment.displayOnly && 'hidden display',
		].filter(Boolean);
		return el('details', { class: 'segment' }, [
			el('summary', {}, [
				el('span', { class: 'pill', style: 'background:' + m.color, text: m.shortLabel }),
				el('span', { class: 'segment-title' }, [el('strong', { text: segment.label }), el('span', { text: segment.preview || 'No text preview' })]),
				el('span', { class: 'token', text: fmt(segment.tokens) }),
			]),
			el('div', { class: 'segment-body' }, [
				el('div', { class: 'meta' }, metaBits.map(bit => el('span', { text: bit }))),
				segment.note ? el('div', { class: 'note', text: segment.note }) : '',
				el('pre', { text: segment.detail || segment.preview || '' }),
			]),
		]);
	}
	function renderSegments() {
		const ds = dataset();
		let rows = ds.segments.filter(segmentMatches);
		if (state.sort === 'tokens') rows = rows.sort((a, b) => b.tokens - a.tokens || a.sequence - b.sequence);
		else rows = rows.sort((a, b) => a.sequence - b.sequence);
		const box = $('segments'); box.replaceChildren();
		if (!rows.length) { box.append(el('div', { class: 'empty', text: 'No segments match your filters.' })); return; }
		for (const segment of rows.slice(0, 500)) box.append(segmentNode(segment));
		if (rows.length > 500) box.append(el('div', { class: 'empty', text: 'Showing first 500 matching segments out of ' + rows.length + '. Narrow the search to drill further.' }));
	}
	function render() {
		const ds = dataset();
		$('subtitle').textContent = [data.session.name, data.cwd, data.session.file].filter(Boolean).join(' · ');
		$('dataset-current').classList.toggle('active', state.dataset === 'current');
		$('dataset-full').classList.toggle('active', state.dataset === 'full');
		renderCards(ds);
		renderDonut(ds);
		renderStack(ds);
		renderAggregate('top-tools', ds.stats.topTools, '');
		renderAggregate('top-paths', ds.stats.topPaths, '');
		renderAggregate('top-turns', ds.stats.topTurns, 'turn:');
		renderTopSegments(ds);
		renderFilters(ds);
		renderSegments();
	}
	$('dataset-current').addEventListener('click', () => setDataset('current'));
	$('dataset-full').addEventListener('click', () => setDataset('full'));
	$('search').addEventListener('input', (event) => { state.search = event.target.value; renderSegments(); });
	$('category-filter').addEventListener('change', (event) => { state.category = event.target.value; renderSegments(); });
	$('sort').addEventListener('change', (event) => { state.sort = event.target.value; renderSegments(); });
	$('clear-filter').addEventListener('click', () => { state.category = ''; state.search = ''; $('search').value = ''; $('category-filter').value = ''; renderSegments(); });
	render();
})();
</script>
</body>
</html>`;
}

export const __testing = {
	analyzeEntries,
	buildReportData,
};

export default function contextInspectorExtension(pi: ExtensionAPI) {
	pi.registerCommand("context", {
		description: "Open a local HTML breakdown of where this session's context is going",
		getArgumentCompletions: (prefix) => {
			const flags = ["--no-open", "--keep", "--redact", "--full", "--current", "--help"];
			const trimmed = prefix.trimStart();
			const last = trimmed.split(/\s+/).pop() ?? "";
			const matches = flags.filter((flag) => flag.startsWith(last));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const options = parseArgs(args);
			if (options.help) {
				notify(ctx, usageText(), "info");
				return;
			}

			await ctx.waitForIdle();
			const data = buildReportData(pi, ctx, options);
			const filePath = reportPath(ctx, options);
			writeReport(data, filePath);

			if (!options.open) {
				notify(ctx, `Context report written: ${filePath}`, "info");
				return;
			}

			const result = await openReport(pi, filePath);
			if (result.ok) {
				notify(ctx, `Opened context report: ${filePath}`, "info");
			} else {
				notify(ctx, `Context report written, but browser open failed: ${filePath}\n${result.error ?? ""}`, "warning");
			}
		},
	});
}
