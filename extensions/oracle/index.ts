import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { getAgentDir, getMarkdownTheme, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
type ThinkingLevelMap = Partial<Record<ThinkingLevel, unknown | null>>;

type PiModel = {
	provider: string;
	id: string;
	name?: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
	thinkingLevelMap?: ThinkingLevelMap;
};

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
	contextTokens: number;
}

interface OracleSelection {
	modelRef: string;
	provider: string;
	modelId: string;
	modelName?: string;
	thinkingLevel: ThinkingLevel;
	requestedThinkingLevel?: ThinkingLevel;
	thinkingLevelClamped?: boolean;
	autoSelected: boolean;
	selectionReason: string;
}

interface OracleDetails extends OracleSelection {
	includeBash: boolean;
	usage: UsageStats;
	stderr: string;
	exitCode: number;
	durationMs: number;
	cwd: string;
}

interface OracleUiRun {
	task: string;
	includeBash: boolean;
	startedAt: number;
	selection?: OracleSelection;
	preview?: string;
}

interface OraclePreferences {
	model?: string;
	thinkingLevel?: ThinkingLevel;
}

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];
const READ_ONLY_PLUS_BASH_TOOLS = [...READ_ONLY_TOOLS, "bash"];
const DEFAULT_THINKING_LEVEL: ThinkingLevel = "xhigh";
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const COLLAPSED_LINE_LIMIT = 8;
const ORACLE_STATUS_ID = "oracle";
const ORACLE_WIDGET_ID = "oracle";
const ORACLE_CONFIG_FILE = "oracle.json";

const PROVIDER_MODEL_PREFERENCES: Record<string, string[]> = {
	"amazon-bedrock": [
		"claude-fable-5",
		"claude-opus-4-8",
		"claude-opus-4-7",
		"claude-opus-4-6",
		"claude-opus-4-5",
		"claude-opus-4-1",
		"claude-opus-4",
		"claude-sonnet-5",
		"claude-sonnet-4-6",
		"claude-sonnet-4-5",
		"claude-sonnet-4",
		"deepseek.v3.2",
		"deepseek.r1",
		"kimi-k2.5",
		"minimax-m2.5",
		"minimax-m2.1",
		"zai.glm-5",
	],
	anthropic: [
		"claude-fable-5",
		"claude-opus-4-8",
		"claude-opus-4.8",
		"claude-opus-4-7",
		"claude-opus-4.7",
		"claude-opus-4-6",
		"claude-opus-4.6",
		"claude-opus-4-5",
		"claude-opus-4.5",
		"claude-opus-4-1",
		"claude-opus-4.1",
		"claude-opus-4-0",
		"claude-opus-4",
		"claude-sonnet-5-0",
		"claude-sonnet-5.0",
		"claude-sonnet-5",
		"claude-sonnet-4-6",
		"claude-sonnet-4.6",
		"claude-sonnet-4-5",
		"claude-sonnet-4.5",
		"claude-sonnet-4-0",
		"claude-sonnet-4",
		"claude-3-7-sonnet",
	],
	"ant-ling": ["Ling-2.6-1T", "Ling-2.6-flash"],
	"azure-openai-responses": [
		"gpt-5.5-pro",
		"gpt-5.5",
		"gpt-5.4-pro",
		"gpt-5.4",
		"gpt-5.3-codex",
		"gpt-5-pro",
		"gpt-5.2-pro",
		"gpt-5.2",
		"gpt-5.2-codex",
		"gpt-5.1-codex-max",
		"gpt-5.1-chat-latest",
		"o3-pro",
		"o3-deep-research",
		"o1-pro",
		"gpt-5.4-mini",
		"gpt-5-mini",
	],
	cerebras: ["gpt-oss-120b", "zai-glm-4.7", "llama3.1-8b"],
	"cloudflare-ai-gateway": [
		"claude-fable-5",
		"claude-opus-4-7",
		"claude-opus-4-6",
		"claude-opus-4-5",
		"gpt-5.5",
		"gpt-5.4",
		"gpt-5.3-codex",
		"workers-ai/@cf/moonshotai/kimi-k2.6",
		"workers-ai/@cf/nvidia/nemotron-3-120b-a12b",
		"workers-ai/@cf/zai-org/glm-4.7-flash",
	],
	"cloudflare-workers-ai": [
		"@cf/moonshotai/kimi-k2.7-code",
		"@cf/zai-org/glm-5.2",
		"@cf/moonshotai/kimi-k2.6",
		"@cf/nvidia/nemotron-3-120b-a12b",
		"@cf/moonshotai/kimi-k2.5",
		"@cf/openai/gpt-oss-120b",
		"@cf/zai-org/glm-4.7-flash",
	],
	deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
	fireworks: [
		"accounts/fireworks/models/deepseek-v4-pro",
		"accounts/fireworks/models/kimi-k2p7-code",
		"accounts/fireworks/routers/kimi-k2p7-code-fast",
		"accounts/fireworks/models/glm-5p2",
		"accounts/fireworks/models/minimax-m3",
		"accounts/fireworks/models/glm-5p1",
		"accounts/fireworks/models/kimi-k2p6",
		"accounts/fireworks/models/minimax-m2p7",
		"accounts/fireworks/models/qwen3p7-plus",
		"accounts/fireworks/models/qwen3p6-plus",
		"accounts/fireworks/models/gpt-oss-120b",
	],
	"github-copilot": [
		"claude-fable-5",
		"claude-opus-4.8",
		"claude-opus-4.7",
		"claude-opus-4.6",
		"claude-opus-4.5",
		"gpt-5.5",
		"gpt-5.4",
		"gpt-5.3-codex",
		"gpt-5.2",
		"gpt-5.1-codex-max",
		"gpt-5.1",
		"gpt-5",
		"gemini-3.1-pro-preview",
		"gemini-3-pro-preview",
		"claude-sonnet-5.0",
		"claude-sonnet-5",
		"claude-sonnet-4.6",
		"claude-sonnet-4.5",
		"gemini-2.5-pro",
	],
	google: [
		"gemini-3.1-pro-preview-customtools",
		"gemini-3.1-pro-preview",
		"gemini-3-pro-preview",
		"gemini-2.5-pro-preview",
		"gemini-2.5-pro",
		"gemini-2.5-flash-preview",
		"gemini-2.5-flash-lite-preview",
		"gemini-2.5-flash-lite",
	],
	"google-vertex": [
		"gemini-3.1-pro-preview-customtools",
		"gemini-3.1-pro-preview",
		"gemini-3-pro-preview",
		"gemini-2.5-pro",
		"gemini-2.5-flash-lite",
		"gemini-2.0-flash-lite",
	],
	groq: [
		"openai/gpt-oss-120b",
		"groq/compound-mini",
		"qwen/qwen3-32b",
		"moonshotai/kimi-k2-instruct",
		"meta-llama/llama-4-scout",
	],
	huggingface: [
		"zai-org/GLM-5.1",
		"deepseek-ai/DeepSeek-V4-Pro",
		"moonshotai/Kimi-K2.6",
		"MiniMaxAI/MiniMax-M2.7",
		"Qwen/Qwen3.5-397B-A17B",
		"Qwen/Qwen3-235B-A22B-Thinking-2507",
		"moonshotai/Kimi-K2.5",
		"deepseek-ai/DeepSeek-V3.2",
		"MiniMaxAI/MiniMax-M2.5",
		"Qwen/Qwen3-Coder-Next",
	],
	"kimi-coding": ["k2p7", "kimi-k2-thinking", "kimi-for-coding"],
	minimax: ["MiniMax-M3", "MiniMax-M2.7-highspeed", "MiniMax-M2.7"],
	"minimax-cn": ["MiniMax-M3", "MiniMax-M2.7-highspeed", "MiniMax-M2.7"],
	mistral: [
		"mistral-medium-2604",
		"mistral-medium-3.5",
		"mistral-medium-latest",
		"magistral-medium-latest",
		"devstral-medium-latest",
		"mistral-large-latest",
		"mistral-large-2411",
		"mistral-medium-2508",
		"mistral-small-2603",
		"devstral-2512",
	],
	openai: [
		"gpt-5.5-pro",
		"gpt-5.5",
		"gpt-5.4-pro",
		"gpt-5.4",
		"gpt-5.3-codex",
		"gpt-5-pro",
		"gpt-5.2-pro",
		"gpt-5.2",
		"gpt-5.2-codex",
		"gpt-5.1-codex-max",
		"gpt-5.1-chat-latest",
		"o3-pro",
		"o3-deep-research",
		"o1-pro",
		"gpt-5.4-mini",
		"gpt-5-mini",
	],
	"openai-codex": [
		"gpt-5.5",
		"gpt-5.4",
		"gpt-5.3-codex",
		"gpt-5.2",
		"gpt-5.1-codex-max",
		"gpt-5.4-mini",
		"gpt-5.1-codex-mini",
		"big-pickle",
	],
	opencode: [
		"claude-fable-5",
		"gpt-5.5-pro",
		"gpt-5.5",
		"gpt-5.4-pro",
		"gpt-5.4",
		"claude-opus-4-8",
		"claude-opus-4-7",
		"claude-opus-4-6",
		"claude-opus-4-5",
		"gpt-5.3-codex",
		"gpt-5.2-codex",
		"gpt-5.1-codex",
		"gemini-3.1-pro",
		"glm-5.1",
		"glm-5",
		"kimi-k2.6",
		"kimi-k2.5",
		"qwen3.6-plus",
		"qwen3.5-plus",
		"minimax-m2.7",
		"minimax-m2.5-free",
	],
	"opencode-go": [
		"deepseek-v4-pro",
		"glm-5.2",
		"glm-5.1",
		"qwen3.7-max",
		"qwen3.7-plus",
		"qwen3.6-plus",
		"mimo-v2.5-pro",
		"mimo-v2-pro",
		"minimax-m3",
		"minimax-m2.7",
		"kimi-k2.7-code",
		"kimi-k2.6",
		"kimi-k2.5",
	],
	openrouter: [
		"anthropic/claude-fable-5",
		"~anthropic/claude-fable-latest",
		"anthropic/claude-opus-4.8",
		"anthropic/claude-opus-4.8-fast",
		"anthropic/claude-opus-4.7",
		"anthropic/claude-opus-4.6-fast",
		"anthropic/claude-opus-4.6",
		"anthropic/claude-opus-4.5",
		"anthropic/claude-opus-4",
		"openai/gpt-5.5-pro",
		"openai/gpt-5.5",
		"openai/gpt-5.4-pro",
		"openai/gpt-5.4",
		"google/gemini-3.1-pro-preview-customtools",
		"google/gemini-3.1-pro-preview",
		"google/gemini-2.5-pro",
		"moonshotai/kimi-k2.7-code",
		"moonshotai/kimi-k2.6",
		"moonshotai/kimi-k2-thinking",
		"deepseek/deepseek-v4-pro",
		"deepseek/deepseek-r1",
		"deepseek/deepseek-v3.2",
		"minimax/minimax-m3",
		"minimax/minimax-m2.7",
		"minimax/minimax-m2.1",
		"z-ai/glm-5.2",
		"z-ai/glm-5.1",
	],
	together: [
		"deepseek-ai/DeepSeek-V4-Pro",
		"zai-org/GLM-5.1",
		"moonshotai/Kimi-K2.7-Code",
		"moonshotai/Kimi-K2.6",
		"Qwen/Qwen3.7-Max",
		"Qwen/Qwen3.6-Plus",
		"MiniMaxAI/MiniMax-M3",
		"MiniMaxAI/MiniMax-M2.7",
		"Qwen/Qwen3.5-397B-A17B",
		"Qwen/Qwen3-Coder-Next-FP8",
		"Qwen/Qwen3-235B-A22B-Instruct-2507-tput",
		"openai/gpt-oss-120b",
		"moonshotai/Kimi-K2.5",
		"deepseek-ai/DeepSeek-V3-1",
		"MiniMaxAI/MiniMax-M2.5",
	],
	"vercel-ai-gateway": [
		"anthropic/claude-fable-5",
		"anthropic/claude-opus-4.8",
		"anthropic/claude-opus-4.7",
		"anthropic/claude-opus-4.6",
		"anthropic/claude-opus-4.5",
		"anthropic/claude-opus-4.1",
		"anthropic/claude-sonnet-5.0",
		"anthropic/claude-sonnet-5",
		"anthropic/claude-sonnet-4.6",
		"openai/gpt-5.5-pro",
		"openai/gpt-5.5",
		"openai/gpt-5.4-pro",
		"openai/gpt-5.4",
		"openai/gpt-5.1-codex",
		"openai/gpt-5-codex",
		"moonshotai/kimi-k2.7-code",
		"moonshotai/kimi-k2.7-code-highspeed",
		"moonshotai/kimi-k2.6",
		"moonshotai/kimi-k2-thinking",
		"deepseek/deepseek-v4-pro",
		"deepseek/deepseek-v3.2-thinking",
		"alibaba/qwen3.7-max",
		"alibaba/qwen3.7-plus",
		"alibaba/qwen3.5-plus",
		"alibaba/qwen3-max-thinking",
		"google/gemini-3.1-pro-preview",
		"google/gemini-3-flash",
		"xai/grok-4.3",
		"minimax/minimax-m3",
		"zai/glm-5.2",
		"zai/glm-5.1",
	],
	xai: [
		"grok-4.3",
		"grok-4.20-0309-reasoning",
		"grok-4-1-fast",
		"grok-4-fast",
		"grok-4",
		"grok-3-mini-latest",
		"grok-3-mini-fast",
		"grok-3-latest",
	],
	xiaomi: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro", "mimo-v2-omni", "mimo-v2-flash"],
	"xiaomi-token-plan-ams": [
		"mimo-v2.5-pro",
		"mimo-v2.5",
		"mimo-v2-pro",
		"mimo-v2-omni",
		"mimo-v2-flash",
	],
	"xiaomi-token-plan-cn": [
		"mimo-v2.5-pro",
		"mimo-v2.5",
		"mimo-v2-pro",
		"mimo-v2-omni",
		"mimo-v2-flash",
	],
	"xiaomi-token-plan-sgp": [
		"mimo-v2.5-pro",
		"mimo-v2.5",
		"mimo-v2-pro",
		"mimo-v2-omni",
		"mimo-v2-flash",
	],
	nvidia: [
		"nvidia/nemotron-3-ultra-550b-a55b",
		"nvidia/nemotron-3-super-120b-a12b",
		"moonshotai/kimi-k2.6",
		"z-ai/glm-5.1",
		"qwen/qwen3.5-122b-a10b",
		"openai/gpt-oss-120b",
		"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
		"nvidia/nemotron-3-nano-30b-a3b",
	],
	zai: [
		"glm-5.2",
		"glm-5.1",
		"glm-5-turbo",
		"glm-5v-turbo",
		"glm-5",
		"glm-4.7",
		"glm-4.7-flash",
		"glm-4.6v",
		"glm-4.5v",
		"glm-4.5-air",
	],
	"zai-coding-cn": [
		"glm-5.2",
		"glm-5.1",
		"glm-5-turbo",
		"glm-5v-turbo",
		"glm-5",
		"glm-4.7",
		"glm-4.5-air",
	],
	moonshotai: ["kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6", "kimi-k2-thinking-turbo", "kimi-k2-thinking", "kimi-k2.5"],
	"moonshotai-cn": ["kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6", "kimi-k2-thinking-turbo", "kimi-k2-thinking", "kimi-k2.5"],
};

const ORACLE_SYSTEM_PROMPT = [
	"You are Oracle, a read-only high-reasoning coding assistant.",
	"Your job is analysis, debugging, planning, review, and second opinions.",
	"Use the available tools to inspect the repository and gather evidence.",
	"Never claim to have changed files or run mutating actions.",
	"If bash is available, use it only for non-mutating inspection commands.",
	"Be concrete. Reference file paths, symbols, commands, and risks when helpful.",
	"Prefer short sections and finish with a concise 'Bottom line' summary.",
].join("\n");

const OracleParams = Type.Object({
	task: Type.String({
		description: "Question or task for the oracle. Include enough context for a stand-alone review or analysis.",
	}),
	includeBash: Type.Optional(
		Type.Boolean({
			description: "Allow non-mutating bash inspection in addition to read/grep/find/ls. Default: false.",
			default: false,
		}),
	),
	model: Type.Optional(
		Type.String({
			description:
				"Optional exact model or model pattern override. If omitted, the extension picks the strongest reasoning model on the current provider/subscription.",
		}),
	),
	thinkingLevel: Type.Optional(
		StringEnum(THINKING_LEVELS, {
			description:
				"Optional reasoning level override for the oracle subprocess. Defaults request xhigh for reasoning models and off for non-reasoning models, then clamp to matched model capabilities.",
		}),
	),
	cwd: Type.Optional(Type.String({ description: "Optional working directory for the oracle subprocess." })),
});

function createEmptyUsage(): UsageStats {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		turns: 0,
		contextTokens: 0,
	};
}

function getOracleConfigPath(): string {
	return path.join(getAgentDir(), "extensions", ORACLE_CONFIG_FILE);
}

function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	return (THINKING_LEVELS as readonly string[]).includes(normalized) ? (normalized as ThinkingLevel) : undefined;
}

function normalizeModelPreference(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function parseModelPreference(value: unknown): { model?: string; thinkingLevel?: ThinkingLevel } {
	const model = normalizeModelPreference(value);
	if (!model) return {};
	const match = model.match(/^(.*):(off|minimal|low|medium|high|xhigh)$/i);
	if (!match?.[1]) return { model };
	return { model: match[1], thinkingLevel: parseThinkingLevel(match[2]) };
}

async function readOraclePreferences(): Promise<OraclePreferences> {
	try {
		const raw = await fs.readFile(getOracleConfigPath(), "utf8");
		const parsed = JSON.parse(raw) as {
			model?: unknown;
			defaultModel?: unknown;
			thinkingLevel?: unknown;
			defaultThinkingLevel?: unknown;
		};
		return {
			model: parseModelPreference(parsed.model).model ?? parseModelPreference(parsed.defaultModel).model,
			thinkingLevel:
				parseThinkingLevel(parsed.thinkingLevel) ??
				parseThinkingLevel(parsed.defaultThinkingLevel) ??
				parseModelPreference(parsed.model).thinkingLevel ??
				parseModelPreference(parsed.defaultModel).thinkingLevel,
		};
	} catch {
		return {};
	}
}

async function writeOraclePreferences(preferences: OraclePreferences): Promise<void> {
	const configPath = getOracleConfigPath();
	const config = {
		...(preferences.model ? { model: preferences.model } : {}),
		...(preferences.thinkingLevel ? { thinkingLevel: preferences.thinkingLevel } : {}),
		updatedAt: new Date().toISOString(),
	};
	await fs.mkdir(path.dirname(configPath), { recursive: true });
	await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function formatOraclePreferences(preferences: OraclePreferences): string {
	const model = preferences.model ?? "auto";
	const thinkingLevel = preferences.thinkingLevel ?? "auto";
	return `Oracle defaults: model=${model}, thinkingLevel=${thinkingLevel}. Config: ${getOracleConfigPath()}`;
}

function notifyCommand(ctx: any, message: string, kind = "info"): void {
	if (ctx.hasUI && ctx.ui) ctx.ui.notify(message, kind);
	else console.log(message);
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatDuration(durationMs: number): string {
	if (durationMs < 1000) return `${durationMs}ms`;
	if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
	return `${(durationMs / 60_000).toFixed(1)}m`;
}

function formatUsage(stats: UsageStats): string {
	const parts: string[] = [];
	if (stats.turns) parts.push(`${stats.turns} turn${stats.turns === 1 ? "" : "s"}`);
	if (stats.input) parts.push(`↑${formatTokens(stats.input)}`);
	if (stats.output) parts.push(`↓${formatTokens(stats.output)}`);
	if (stats.cacheRead) parts.push(`R${formatTokens(stats.cacheRead)}`);
	if (stats.cacheWrite) parts.push(`W${formatTokens(stats.cacheWrite)}`);
	if (stats.cost) parts.push(`$${stats.cost.toFixed(4)}`);
	if (stats.contextTokens) parts.push(`ctx:${formatTokens(stats.contextTokens)}`);
	return parts.join(" ");
}

function extractTextFromContent(content: unknown): string {
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
			const text = (part as { text?: string }).text;
			if (typeof text === "string" && text.trim()) parts.push(text);
		}
	}
	return parts.join("\n\n").trim();
}

// Errors that typically resolve on retry: provider overload, rate limiting,
// transient 5xx, gateway/network failures, and request timeouts. Keep this list
// pattern-based so we recognize variants across providers without enumerating them.
const TRANSIENT_ERROR_PATTERN =
	/\b(overload(?:ed)?|rate[ _-]?limit(?:ed)?|too many requests|429|500|502|503|504|bad gateway|service unavailable|gateway timeout|temporarily unavailable|timed?[ _-]?out|timeout|econnreset|econnrefused|etimedout|enetunreach|socket hang up|fetch failed)\b/i;

function isTransientErrorMessage(message: string): boolean {
	return TRANSIENT_ERROR_PATTERN.test(message);
}

// A model the catalog advertises but the active provider/subscription cannot
// serve surfaces as a not-found/404-style error (legacy snapshots or
// access-gated tiers). These are NOT transient: the same model keeps failing,
// so callers should fall back to a different model instead of retrying it.
const MODEL_AVAILABILITY_ERROR_PATTERN =
	/\b(?:404|403|not[_ ]?found(?:[_ ]?error)?|model[_ ]?not[_ ]?found(?:[_ ]?error)?|no such model|unknown model|does not exist|is not available|not available|model[_ ]?not[_ ]?available|unsupported model|invalid model|forbidden|access[ _-]?denied|permission[ _-]?denied|not[ _-]?entitled|do(?:es)? not have access)\b/i;

function isModelAvailabilityError(message: string | undefined): boolean {
	if (!message) return false;
	if (isTransientErrorMessage(message)) return false;
	return MODEL_AVAILABILITY_ERROR_PATTERN.test(message);
}

function formatOracleModelError(stopReason: "error" | "aborted", errorMessage: string | undefined): string {
	const trimmed = errorMessage?.trim();
	if (stopReason === "aborted") {
		return trimmed ? `Oracle model turn aborted: ${trimmed}` : "Oracle model turn aborted.";
	}
	if (!trimmed) return "Oracle model error (no detail provided by provider).";
	const base = `Oracle model error: ${trimmed}`;
	return isTransientErrorMessage(trimmed) ? `${base} (transient; retry may succeed)` : base;
}

function parseVersionScore(text: string): number {
	const matches = text.match(/\d+(?:\.\d+){0,2}/g) ?? [];
	let best = 0;
	for (const match of matches) {
		const [major = "0", minor = "0", patch = "0"] = match.split(".");
		const score = Number(major) * 1_000_000 + Number(minor) * 1_000 + Number(patch);
		if (score > best) best = score;
	}
	return best;
}

function rankModel(model: PiModel): number {
	const text = `${model.id} ${model.name ?? ""}`.toLowerCase();
	const has = (regex: RegExp): boolean => regex.test(text);
	let score = 0;

	if (model.reasoning) score += 10_000_000;
	score += parseVersionScore(text) * 1_000;
	score += Math.min(model.maxTokens ?? 0, 200_000);
	score += Math.floor(Math.min(model.contextWindow ?? 0, 1_000_000) / 100);

	if (has(/\bopus\b/)) score += 350_000;
	if (has(/\bpro\b/)) score += 180_000;
	if (has(/\bmax\b/)) score += 60_000;
	if (has(/\bultra\b/)) score += 150_000;
	if (has(/\bsonnet\b/)) score += 120_000;
	if (has(/\bcodex\b|\bcoder\b|\bcode\b/)) score += 40_000;
	if (has(/\breasoning\b|\bthink(?:ing)?\b/)) score += 60_000;

	if (has(/\bhaiku\b/)) score -= 420_000;
	if (has(/\bmini\b/)) score -= 520_000;
	if (has(/\bnano\b/)) score -= 700_000;
	if (has(/\bflash\b/)) score -= 520_000;
	if (has(/\bspark\b/)) score -= 650_000;
	if (has(/\blite\b|\bsmall\b|\bfast\b|\binstant\b/)) score -= 300_000;

	return score;
}

function shorten(text: string, max: number): string {
	const singleLine = text.replace(/\s+/g, " ").trim();
	if (singleLine.length <= max) return singleLine;
	return `${singleLine.slice(0, Math.max(1, max - 3))}...`;
}

function getProviderPreferenceList(provider: string | undefined): string[] | undefined {
	if (!provider) return undefined;
	return PROVIDER_MODEL_PREFERENCES[provider.toLowerCase()];
}

function selectPreferredModel(models: PiModel[], provider: string | undefined): PiModel | undefined {
	const preferences = getProviderPreferenceList(provider);
	if (!preferences || preferences.length === 0) return undefined;
	const lowered = models.map((model) => ({ model, haystack: `${model.id} ${model.name ?? ""}`.toLowerCase() }));
	for (const pattern of preferences) {
		const match = lowered.find((entry) => entry.haystack.includes(pattern.toLowerCase()));
		if (match) return match.model;
	}
	return undefined;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

function withThinking(modelRef: string, thinkingLevel: ThinkingLevel): string {
	if (/(?:^|\/)[^:]+:(off|minimal|low|medium|high|xhigh)$/i.test(modelRef)) return modelRef;
	return `${modelRef}:${thinkingLevel}`;
}

// Keep these local so the extension stays compatible with older pi peer installs that do not export clamp helpers.
function isThinkingLevelSupported(model: PiModel, level: ThinkingLevel): boolean {
	if (!model.reasoning) return level === "off";

	const map = model.thinkingLevelMap;
	if (level === "xhigh") {
		return !!map && Object.prototype.hasOwnProperty.call(map, "xhigh") && map.xhigh != null;
	}
	return map?.[level] !== null;
}

function clampThinkingLevel(model: PiModel, requested: ThinkingLevel): ThinkingLevel {
	if (isThinkingLevelSupported(model, requested)) return requested;

	const requestedIndex = THINKING_LEVELS.indexOf(requested);
	for (let index = requestedIndex + 1; index < THINKING_LEVELS.length; index++) {
		const level = THINKING_LEVELS[index];
		if (isThinkingLevelSupported(model, level)) return level;
	}
	for (let index = requestedIndex - 1; index >= 0; index--) {
		const level = THINKING_LEVELS[index];
		if (isThinkingLevelSupported(model, level)) return level;
	}

	return "off";
}

function resolveThinkingLevel(
	model: PiModel | undefined,
	override: ThinkingLevel | undefined,
): { requested: ThinkingLevel; effective: ThinkingLevel; clamped: boolean } {
	const requested = override ?? (model?.reasoning ? DEFAULT_THINKING_LEVEL : "off");
	const effective = model ? clampThinkingLevel(model, requested) : requested;
	return { requested, effective, clamped: effective !== requested };
}

function appendThinkingLevelClampReason(
	reason: string,
	resolution: { requested: ThinkingLevel; effective: ThinkingLevel; clamped: boolean },
): string {
	if (!resolution.clamped) return reason;
	return `${reason} Requested thinking level ${resolution.requested} was clamped to ${resolution.effective} based on the matched model's capabilities.`;
}

async function findAvailableModel(
	ctx: { model?: PiModel; modelRegistry: { getAvailable(): PiModel[] | Promise<PiModel[]> } },
	modelRef: string,
): Promise<PiModel | undefined> {
	const available = await ctx.modelRegistry.getAvailable();
	const trimmed = modelRef.trim();
	const provider = trimmed.includes("/") ? trimmed.split("/")[0].toLowerCase() : ctx.model?.provider?.toLowerCase();
	const id = trimmed.includes("/") ? trimmed.split("/").slice(1).join("/").toLowerCase() : trimmed.toLowerCase();

	const exact = available.find(
		(model) => model.id.toLowerCase() === id && (!provider || model.provider.toLowerCase() === provider),
	);
	if (exact) return exact;

	const partial = available.find(
		(model) =>
			model.id.toLowerCase().includes(id) && (!provider || model.provider.toLowerCase() === provider),
	);
	if (partial) return partial;

	if (!provider) {
		const uniqueById = available.filter((model) => model.id.toLowerCase() === id);
		if (uniqueById.length === 1) return uniqueById[0];
	}

	return undefined;
}

function toOracleSelection(
	model: PiModel,
	thinkingLevelOverride: ThinkingLevel | undefined,
	reason: string,
): OracleSelection {
	const thinking = resolveThinkingLevel(model, thinkingLevelOverride);
	return {
		modelRef: `${model.provider}/${model.id}`,
		provider: model.provider,
		modelId: model.id,
		modelName: model.name,
		thinkingLevel: thinking.effective,
		...(thinking.clamped ? { requestedThinkingLevel: thinking.requested, thinkingLevelClamped: true } : {}),
		autoSelected: true,
		selectionReason: appendThinkingLevelClampReason(reason, thinking),
	};
}

function buildSessionFallbackSelection(
	ctx: { model?: PiModel },
	thinkingLevelOverride: ThinkingLevel | undefined,
): OracleSelection | undefined {
	const model = ctx.model;
	if (!model) return undefined;
	return toOracleSelection(
		model,
		thinkingLevelOverride,
		`Used the current session model ${model.provider}/${model.id} as a final fallback.`,
	);
}

function withFallbackReason(selection: OracleSelection, previous: OracleSelection): OracleSelection {
	return {
		...selection,
		selectionReason: `${selection.selectionReason} (Fell back from ${previous.modelRef} after a model-availability error.)`,
	};
}

async function selectOracleModel(
	ctx: { model?: PiModel; modelRegistry: { getAvailable(): PiModel[] | Promise<PiModel[]> } },
	thinkingLevelOverride?: ThinkingLevel,
): Promise<{ ok: true; selection: OracleSelection; ordered: OracleSelection[] } | { ok: false; error: string }> {
	const available = await ctx.modelRegistry.getAvailable();
	if (available.length === 0) {
		return {
			ok: false,
			error: "No authenticated models are available. Log in or configure an API key first.",
		};
	}

	const currentProvider = ctx.model?.provider;
	const sameProvider = currentProvider ? available.filter((model) => model.provider === currentProvider) : [];
	const sameProviderReasoning = sameProvider.filter((model) => model.reasoning);
	const allReasoning = available.filter((model) => model.reasoning);

	let candidates = sameProviderReasoning;
	let reason = "Selected the top-ranked reasoning model on the current provider.";
	let providerForPreferences = currentProvider;

	if (candidates.length === 0 && sameProvider.length > 0) {
		candidates = sameProvider;
		reason = "The current provider has no reasoning models available, so the top-ranked model on that provider was used.";
	} else if (candidates.length === 0 && allReasoning.length > 0) {
		candidates = allReasoning;
		providerForPreferences = undefined;
		reason = "No current model/provider was active, so the top-ranked reasoning model across all available providers was used.";
	} else if (candidates.length === 0) {
		candidates = available;
		providerForPreferences = undefined;
		reason = "No reasoning models were available, so the top-ranked model across all available providers was used.";
	}

	const sorted = [...candidates].sort((a, b) => rankModel(b) - rankModel(a));
	const preferred = selectPreferredModel(candidates, providerForPreferences);
	const orderedModels = preferred ? [preferred, ...sorted.filter((model) => model !== preferred)] : sorted;

	const ordered = orderedModels.map((model, index) =>
		toOracleSelection(
			model,
			thinkingLevelOverride,
			index === 0
				? preferred
					? `Selected ${model.id} via the hardcoded preference list for ${model.provider}.`
					: reason
				: `Auto-selected ${model.provider}/${model.id} as a lower-ranked fallback.`,
		),
	);

	return { ok: true, selection: ordered[0], ordered };
}

function updateOracleUi(ctx: ExtensionContext, activeRuns: Map<string, OracleUiRun>): void {
	if (!ctx.hasUI) return;
	const theme = ctx.ui.theme;
	if (activeRuns.size === 0) {
		ctx.ui.setStatus(ORACLE_STATUS_ID, undefined);
		ctx.ui.setWidget(ORACLE_WIDGET_ID, undefined);
		return;
	}

	const runs = [...activeRuns.values()].sort((a, b) => b.startedAt - a.startedAt);
	const primary = runs[0];
	const activeCount = runs.length;
	const modelText = primary.selection?.modelId ?? "selecting…";
	const thinkingText = primary.selection?.thinkingLevel && primary.selection.thinkingLevel !== "off"
		? ` ${primary.selection.thinkingLevel}`
		: "";
	const elapsed = formatDuration(Date.now() - primary.startedAt);
	const mode = primary.includeBash ? "read-only+bash" : "read-only";
	const status =
		theme.fg("accent", "🔮 oracle") +
		theme.fg("dim", ` ${modelText}${thinkingText} · ${mode} · ${elapsed}`) +
		(activeCount > 1 ? theme.fg("warning", ` · ${activeCount} active`) : "");
	ctx.ui.setStatus(ORACLE_STATUS_ID, status);

	const lines = [
		`🔮 Oracle ${activeCount > 1 ? `(${activeCount} active)` : ""}`.trim(),
		`${primary.selection?.modelRef ?? "selecting model…"} · ${mode} · ${elapsed}`,
		`task: ${shorten(primary.task, 110)}`,
	];
	if (primary.preview && primary.preview.trim()) lines.push(`preview: ${shorten(primary.preview, 110)}`);
	ctx.ui.setWidget(ORACLE_WIDGET_ID, lines, { placement: "belowEditor" });
}

async function runOracle(
	selection: OracleSelection,
	params: { task: string; includeBash?: boolean; cwd?: string },
	signal: AbortSignal | undefined,
	onUpdate: ((result: { content: Array<{ type: "text"; text: string }>; details: OracleDetails }) => void) | undefined,
	defaultCwd: string,
): Promise<{ ok: true; output: string; details: OracleDetails } | { ok: false; error: string; details: OracleDetails }> {
	const cwd = params.cwd ?? defaultCwd;
	const includeBash = params.includeBash ?? false;
	const tools = includeBash ? READ_ONLY_PLUS_BASH_TOOLS : READ_ONLY_TOOLS;
	const startedAt = Date.now();
	const usage = createEmptyUsage();
	let currentText = "";
	let finalOutput = "";
	let stderr = "";

	let lastStopReason: string | undefined;
	let lastErrorMessage: string | undefined;

	const details: OracleDetails = {
		...selection,
		includeBash,
		usage,
		stderr,
		exitCode: 0,
		durationMs: 0,
		cwd,
	};

	const emit = () => {
		details.stderr = stderr;
		details.durationMs = Date.now() - startedAt;
		onUpdate?.({
			content: [{ type: "text", text: currentText || finalOutput || "Consulting oracle..." }],
			details,
		});
	};

	const modelArg = withThinking(selection.modelRef, selection.thinkingLevel);
	const args = [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--model",
		modelArg,
		"--tools",
		tools.join(","),
		"--append-system-prompt",
		ORACLE_SYSTEM_PROMPT,
		params.task,
	];

	const invocation = getPiInvocation(args);
	let wasAborted = false;

	const exitCode = await new Promise<number>((resolve) => {
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let buffer = "";

		const processLine = (line: string) => {
			if (!line.trim()) return;
			let event: any;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}

			if (event.type === "message_start" && event.message?.role === "assistant") {
				currentText = "";
				emit();
				return;
			}

			if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
				currentText += event.assistantMessageEvent.delta ?? "";
				emit();
				return;
			}

			if (event.type === "message_end" && event.message?.role === "assistant") {
				const text = extractTextFromContent(event.message.content) || currentText;
				if (text) finalOutput = text;
				currentText = "";

				const stopReason = event.message.stopReason;
				lastStopReason = typeof stopReason === "string" ? stopReason : undefined;
				const errorMessageField = event.message.errorMessage;
				lastErrorMessage = typeof errorMessageField === "string" ? errorMessageField : undefined;

				const messageUsage = event.message.usage;
				if (messageUsage) {
					usage.turns += 1;
					usage.input += messageUsage.input || 0;
					usage.output += messageUsage.output || 0;
					usage.cacheRead += messageUsage.cacheRead || 0;
					usage.cacheWrite += messageUsage.cacheWrite || 0;
					usage.cost += messageUsage.cost?.total || 0;
					usage.contextTokens = messageUsage.totalTokens || usage.contextTokens;
				}

				emit();
			}
		};

		proc.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
			emit();
		});

		proc.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			resolve(code ?? 0);
		});

		proc.on("error", (error) => {
			stderr += `${error instanceof Error ? error.message : String(error)}\n`;
			resolve(1);
		});

		if (signal) {
			const killProc = () => {
				wasAborted = true;
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 5000);
			};
			if (signal.aborted) killProc();
			else signal.addEventListener("abort", killProc, { once: true });
		}
	});

	details.stderr = stderr.trim();
	details.exitCode = exitCode;
	details.durationMs = Date.now() - startedAt;

	if (wasAborted) {
		return { ok: false, error: "Oracle was aborted.", details };
	}

	// The pi subprocess in `--mode json` does not promote an errored assistant
	// turn to a non-zero exit code or stderr; the error is only carried on the
	// streamed assistant message via stopReason/errorMessage. Surface that here
	// so callers can distinguish transient provider errors from a genuinely
	// empty response.
	if (lastStopReason === "error" || lastStopReason === "aborted") {
		return {
			ok: false,
			error: formatOracleModelError(lastStopReason, lastErrorMessage),
			details,
		};
	}

	if (exitCode !== 0) {
		return {
			ok: false,
			error: details.stderr || finalOutput || "Oracle subprocess failed.",
			details,
		};
	}

	if (!finalOutput.trim()) {
		return {
			ok: false,
			error: details.stderr || "Oracle finished without returning any text.",
			details,
		};
	}

	return {
		ok: true,
		output: finalOutput.trim(),
		details,
	};
}

function renderCollapsedText(text: string, lineLimit = COLLAPSED_LINE_LIMIT): string {
	const lines = text.trim().split("\n");
	if (lines.length <= lineLimit) return lines.join("\n");
	return [...lines.slice(0, lineLimit), `... (${lines.length - lineLimit} more lines)`].join("\n");
}

export const __test__ = {
	findAvailableModel,
	parseModelPreference,
	resolveThinkingLevel,
	selectOracleModel,
};

export default function oracleExtension(pi: ExtensionAPI) {
	const activeRuns = new Map<string, OracleUiRun>();
	let preferences: OraclePreferences = {};

	pi.on("session_start", async (_event, ctx) => {
		preferences = await readOraclePreferences();
		activeRuns.clear();
		updateOracleUi(ctx, activeRuns);
	});

	pi.registerCommand("oracle", {
		description: "Configure Oracle default model and thinking level for future oracle tool calls",
		getArgumentCompletions: (prefix) => {
			const parts = prefix.trim().toLowerCase().split(/\s+/).filter(Boolean);
			const first = parts[0] ?? "";
			if (parts.length <= 1) {
				const commands = ["status", "model", "thinking", "clear"];
				const matches = commands.filter((command) => command.startsWith(first));
				return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
			}
			if (parts[0] === "thinking") {
				const query = parts[1] ?? "";
				const values = ["auto", ...THINKING_LEVELS];
				const matches = values.filter((value) => value.startsWith(query));
				return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
			}
			if (parts[0] === "clear") {
				const query = parts[1] ?? "";
				const values = ["all", "model", "thinking"];
				const matches = values.filter((value) => value.startsWith(query));
				return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
			}
			return null;
		},
		handler: async (args, ctx) => {
			const raw = args.trim();
			const tokens = raw ? raw.split(/\s+/) : [];
			const [command = "status", ...rest] = tokens;
			const action = command.toLowerCase();
			const configPath = getOracleConfigPath();

			const save = async (next: OraclePreferences): Promise<string | undefined> => {
				preferences = next;
				try {
					await writeOraclePreferences(preferences);
					return undefined;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return `Preference changed for this process, but could not save ${configPath}: ${message}`;
				}
			};

			if (action === "status" || action === "show") {
				notifyCommand(ctx, formatOraclePreferences(preferences));
				return;
			}

			if (action === "model") {
				const model = rest.join(" ").trim();
				const normalizedModelAction = model.toLowerCase();
				if (!model) {
					notifyCommand(ctx, "Usage: /oracle model <provider/model|auto>", "warning");
					return;
				}
				if (normalizedModelAction === "auto" || normalizedModelAction === "clear" || normalizedModelAction === "default") {
					const warning = await save({ ...preferences, model: undefined });
					notifyCommand(ctx, `Oracle default model cleared; future oracle calls will auto-select. ${warning ?? formatOraclePreferences(preferences)}`, warning ? "warning" : "info");
					return;
				}
				const parsedModel = parseModelPreference(model);
				const next = {
					...preferences,
					model: parsedModel.model,
					thinkingLevel: parsedModel.thinkingLevel ?? preferences.thinkingLevel,
				};
				const warning = await save(next);
				notifyCommand(ctx, `Oracle default model set to ${parsedModel.model}. ${warning ?? formatOraclePreferences(preferences)}`, warning ? "warning" : "info");
				return;
			}

			if (action === "thinking" || action === "think" || action === "thinking-level") {
				const value = rest[0]?.trim().toLowerCase();
				if (!value) {
					notifyCommand(ctx, `Usage: /oracle thinking ${THINKING_LEVELS.join(" | ")} | auto`, "warning");
					return;
				}
				if (value === "auto" || value === "clear" || value === "default") {
					const warning = await save({ ...preferences, thinkingLevel: undefined });
					notifyCommand(ctx, `Oracle default thinking level cleared; future oracle calls will use built-in defaults. ${warning ?? formatOraclePreferences(preferences)}`, warning ? "warning" : "info");
					return;
				}
				const thinkingLevel = parseThinkingLevel(value);
				if (!thinkingLevel) {
					notifyCommand(ctx, `Usage: /oracle thinking ${THINKING_LEVELS.join(" | ")} | auto`, "warning");
					return;
				}
				const warning = await save({ ...preferences, thinkingLevel });
				notifyCommand(ctx, `Oracle default thinking level set to ${thinkingLevel}. ${warning ?? formatOraclePreferences(preferences)}`, warning ? "warning" : "info");
				return;
			}

			if (action === "clear" || action === "reset") {
				const target = rest[0]?.trim().toLowerCase() || "all";
				let next: OraclePreferences;
				if (target === "all") next = {};
				else if (target === "model") next = { ...preferences, model: undefined };
				else if (target === "thinking" || target === "thinking-level") next = { ...preferences, thinkingLevel: undefined };
				else {
					notifyCommand(ctx, "Usage: /oracle clear [all|model|thinking]", "warning");
					return;
				}
				const warning = await save(next);
				notifyCommand(ctx, `Oracle defaults cleared (${target}). ${warning ?? formatOraclePreferences(preferences)}`, warning ? "warning" : "info");
				return;
			}

			notifyCommand(ctx, "Usage: /oracle status | model <provider/model|auto> | thinking <off|minimal|low|medium|high|xhigh|auto> | clear [all|model|thinking]", "warning");
		},
	});

	pi.registerCommand("oracle-model", {
		description: "Show which model the oracle would use right now",
		handler: async (_args, ctx) => {
			const defaultModel = parseModelPreference(preferences.model);
			if (defaultModel.model) {
				const matched = await findAvailableModel(ctx, defaultModel.model);
				const thinking = resolveThinkingLevel(matched, preferences.thinkingLevel ?? defaultModel.thinkingLevel);
				const modelRef = matched ? `${matched.provider}/${matched.id}` : defaultModel.model;
				const suffix = matched
					? appendThinkingLevelClampReason("Configured default oracle model is active.", thinking)
					: "Configured default oracle model is active, but it was not matched against the authenticated model list.";
				notifyCommand(ctx, `Oracle: ${modelRef} (${thinking.effective}) — ${suffix}`);
				return;
			}
			const selectionResult = await selectOracleModel(ctx, preferences.thinkingLevel);
			if (!selectionResult.ok) {
				notifyCommand(ctx, selectionResult.error, "error");
				return;
			}

			const { selection } = selectionResult;
			const message = `Oracle: ${selection.modelRef} (${selection.thinkingLevel}) — ${selection.selectionReason}`;
			notifyCommand(ctx, message);
		},
	});

	pi.registerTool({
		name: "oracle",
		label: "Oracle",
		description:
			"Consult a separate read-only oracle subprocess for deep analysis, code review, debugging, planning, and second opinions.",
		promptSnippet:
			"Consult a read-only oracle that auto-selects the strongest reasoning model on the current provider/subscription.",
		promptGuidelines: [
			"Use this tool sparingly when you want a second opinion, deeper analysis, code review, debugging help, or a higher-reasoning pass.",
			"Do not use it for routine low-value work; it is slower than the main agent.",
			"The oracle is read-only by default. Set includeBash only when shell-based inspection is genuinely useful.",
			"The oracle requests xhigh by default for reasoning models; defaults and explicit thinkingLevel overrides are clamped to the effective model-supported level when the model is matched.",
		],
		parameters: OracleParams,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const rawTask = (params as { task?: unknown }).task;
			const task = typeof rawTask === "string" ? rawTask.trim() : "";
			if (!task) throw new Error("Invalid parameters: expected task to be a non-empty string.");

			const explicitModel = parseModelPreference(params.model);
			const defaultModel = parseModelPreference(preferences.model);
			const configuredModel = explicitModel.model ?? defaultModel.model;
			const configuredThinkingLevel =
				params.thinkingLevel ?? explicitModel.thinkingLevel ?? preferences.thinkingLevel ?? defaultModel.thinkingLevel;
			const uiRun: OracleUiRun = {
				task,
				includeBash: params.includeBash ?? false,
				startedAt: Date.now(),
			};
			activeRuns.set(toolCallId, uiRun);
			updateOracleUi(ctx, activeRuns);

			try {
				const attempts: OracleSelection[] = [];
				const seen = new Set<string>();
				const pushAttempt = (candidate: OracleSelection | undefined) => {
					if (!candidate) return;
					const key = `${candidate.provider}/${candidate.modelId}`.toLowerCase();
					if (seen.has(key)) return;
					seen.add(key);
					attempts.push(candidate);
				};

				if (configuredModel) {
					const modelRef = configuredModel;
					const matched = await findAvailableModel(ctx, modelRef);
					const provider =
						matched?.provider ?? (modelRef.includes("/") ? modelRef.split("/")[0] : ctx.model?.provider ?? "unknown");
					const modelId = matched?.id ?? (modelRef.includes("/") ? modelRef.split("/").slice(1).join("/") : modelRef);
					const thinking = resolveThinkingLevel(matched, configuredThinkingLevel);
					const usedToolOverride = !!explicitModel.model;
					const selectionReason = matched
						? appendThinkingLevelClampReason(
							usedToolOverride
								? "Used the explicit model override provided in the tool call."
								: "Used the configured default oracle model.",
							thinking,
						)
						: usedToolOverride
							? "Used the explicit model override provided in the tool call. The model was not matched against the authenticated model list, so the reasoning level fallback was applied."
							: "Used the configured default oracle model. The model was not matched against the authenticated model list, so the reasoning level fallback was applied.";
					pushAttempt({
						modelRef: matched ? `${matched.provider}/${matched.id}` : modelRef,
						provider,
						modelId,
						modelName: matched?.name,
						thinkingLevel: thinking.effective,
						...(matched && thinking.clamped
							? { requestedThinkingLevel: thinking.requested, thinkingLevelClamped: true }
							: {}),
						autoSelected: false,
						selectionReason,
					});
				} else {
					const selectionResult = await selectOracleModel(ctx, configuredThinkingLevel);
					if (!selectionResult.ok) {
						return {
							content: [{ type: "text", text: selectionResult.error }],
							details: {
								modelRef: "",
								provider: ctx.model?.provider ?? "unknown",
								modelId: "",
								modelName: undefined,
								thinkingLevel: configuredThinkingLevel ?? DEFAULT_THINKING_LEVEL,
								autoSelected: true,
								selectionReason: selectionResult.error,
								includeBash: params.includeBash ?? false,
								usage: createEmptyUsage(),
								stderr: "",
								exitCode: 1,
								durationMs: 0,
								cwd: params.cwd ?? ctx.cwd,
							},
						};
					}
					for (const candidate of selectionResult.ordered) pushAttempt(candidate);
				}

				// Keep the known-good session model as a final fallback: the catalog can
				// advertise models the active provider/subscription cannot actually serve
				// (legacy snapshots, access-gated tiers), which fail with a not-found/404
				// error. Falling back lets the run degrade gracefully instead of hard-failing.
				pushAttempt(buildSessionFallbackSelection(ctx, configuredThinkingLevel));

				const handleUpdate = (partial: { content: Array<{ type: "text"; text: string }>; details: OracleDetails }) => {
					uiRun.preview = partial.content[0]?.text ?? uiRun.preview;
					updateOracleUi(ctx, activeRuns);
					onUpdate?.(partial);
				};

				let lastErrorResult: { ok: false; error: string; details: OracleDetails } | undefined;
				for (let index = 0; index < attempts.length; index++) {
					const previous = index > 0 ? attempts[index - 1] : undefined;
					const attempt = previous ? withFallbackReason(attempts[index], previous) : attempts[index];
					uiRun.selection = attempt;
					updateOracleUi(ctx, activeRuns);

					const result = await runOracle(attempt, { ...params, task }, signal, handleUpdate, ctx.cwd);
					if (result.ok) {
						return {
							content: [{ type: "text", text: result.output }],
							details: result.details,
						};
					}

					lastErrorResult = result;
					const canFallBack = index < attempts.length - 1 && isModelAvailabilityError(result.error);
					if (!canFallBack) {
						return {
							content: [{ type: "text", text: result.error }],
							details: result.details,
						};
					}
				}

				return {
					content: [
						{ type: "text", text: lastErrorResult?.error ?? "Oracle could not select an available model." },
					],
					details:
						lastErrorResult?.details ?? {
							modelRef: "",
							provider: ctx.model?.provider ?? "unknown",
							modelId: "",
							modelName: undefined,
							thinkingLevel: configuredThinkingLevel ?? DEFAULT_THINKING_LEVEL,
							autoSelected: true,
							selectionReason: "No authenticated models were available to run the oracle.",
							includeBash: params.includeBash ?? false,
							usage: createEmptyUsage(),
							stderr: "",
							exitCode: 1,
							durationMs: 0,
							cwd: params.cwd ?? ctx.cwd,
						},
				};
			} finally {
				activeRuns.delete(toolCallId);
				updateOracleUi(ctx, activeRuns);
			}
		},

		renderCall(args, theme) {
			const task = args.task.length > 90 ? `${args.task.slice(0, 90)}...` : args.task;
			const mode = args.includeBash ? "read-only+bash" : "read-only";
			const override = args.model ? ` ${theme.fg("muted", `[${args.model}]`)}` : "";
			const thinking = args.thinkingLevel ? ` ${theme.fg("warning", `(${args.thinkingLevel})`)}` : "";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("oracle "))}${theme.fg("accent", mode)}${override}${thinking}\n  ${theme.fg("dim", task)}`,
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as OracleDetails | undefined;
			const body = result.content[0]?.type === "text" ? result.content[0].text : "(no output)";
			if (!details) return new Text(body, 0, 0);

			const isError = (details.exitCode ?? 0) !== 0;
			const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
			const header = `${icon} ${theme.fg("toolTitle", theme.bold("oracle "))}${theme.fg("accent", details.modelRef || "(auto)")}`;
			const subheader = [
				details.thinkingLevel !== "off" ? details.thinkingLevel : undefined,
				details.includeBash ? "read-only+bash" : "read-only",
				formatDuration(details.durationMs),
			]
				.filter(Boolean)
				.join(" · ");
			const usage = formatUsage(details.usage);

			if (!expanded) {
				let text = header;
				if (subheader) text += `\n${theme.fg("dim", subheader)}`;
				text += `\n\n${theme.fg("toolOutput", renderCollapsedText(body))}`;
				if (usage) text += `\n\n${theme.fg("dim", usage)}`;
				if (isError && details.stderr) text += `\n${theme.fg("error", renderCollapsedText(details.stderr, 4))}`;
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const container = new Container();
			container.addChild(new Text(header, 0, 0));
			if (subheader) container.addChild(new Text(theme.fg("dim", subheader), 0, 0));
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "Selection"), 0, 0));
			container.addChild(new Text(theme.fg("dim", details.selectionReason), 0, 0));
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "Output"), 0, 0));
			container.addChild(new Markdown(body.trim(), 0, 0, getMarkdownTheme()));
			if (usage) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", "Usage"), 0, 0));
				container.addChild(new Text(theme.fg("dim", usage), 0, 0));
			}
			if (details.stderr) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", "stderr"), 0, 0));
				container.addChild(
					new Text(isError ? theme.fg("error", details.stderr) : theme.fg("dim", details.stderr), 0, 0),
				);
			}
			return container;
		},
	});
}
