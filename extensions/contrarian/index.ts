import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { StringEnum, type Usage } from "@earendil-works/pi-ai";
import { getAgentDir, getMarkdownTheme, type AgentToolResult, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
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
	cacheWrite1h?: number;
	reasoning?: number;
	totalTokens: number;
	cost: number;
	costInput: number;
	costOutput: number;
	costCacheRead: number;
	costCacheWrite: number;
	turns: number;
	contextTokens: number;
}

interface ContrarianSelection {
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

interface ContrarianDetails extends ContrarianSelection {
	includeBash: boolean;
	usage: UsageStats;
	stderr: string;
	exitCode: number;
	durationMs: number;
	cwd: string;
}

interface ContrarianUiRun {
	task: string;
	includeBash: boolean;
	startedAt: number;
	selection?: ContrarianSelection;
	preview?: string;
}

interface ContrarianPreferences {
	model?: string;
	thinkingLevel?: ThinkingLevel;
}

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];
const READ_ONLY_PLUS_BASH_TOOLS = [...READ_ONLY_TOOLS, "bash"];
const DEFAULT_THINKING_LEVEL: ThinkingLevel = "high";
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const COLLAPSED_LINE_LIMIT = 8;
const CONTRARIAN_STATUS_ID = "contrarian";
const CONTRARIAN_WIDGET_ID = "contrarian";
const CONTRARIAN_CONFIG_FILE = "contrarian.json";
const CONTRARIAN_MODEL_PREFERENCES = [
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
	"gpt-5.5",
	"claude-opus-4-8",
	"claude-opus-4.8",
	"claude-sonnet-5",
	"claude-sonnet-4-6",
	"claude-sonnet-4.6",
	"claude-sonnet-4-5",
	"claude-sonnet-4.5",
	"claude-sonnet-4",
	"grok-4.5",
	"gemini-3.5-flash",
];

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
		"claude-opus-4-7",
		"claude-opus-4-6",
		"claude-opus-4-5",
		"claude-opus-4-1",
		"claude-sonnet-5",
		"claude-sonnet-4-6",
		"claude-sonnet-4-5",
	],
	"ant-ling": ["Ling-2.6-1T", "Ling-2.6-flash"],
	"azure-openai-responses": [
		"gpt-5.6-sol",
		"gpt-5.6-terra",
		"gpt-5.6-luna",
		"gpt-5.5-pro",
		"gpt-5.5",
		"gpt-5.4-pro",
		"gpt-5.4",
		"gpt-5.3-codex",
		"gpt-5-pro",
		"gpt-5-chat-latest",
		"gpt-5.2-pro",
		"gpt-5.2",
		"gpt-5.2-codex",
		"gpt-5.1-codex-max",
		"gpt-5.1-codex",
		"gpt-5.1",
		"gpt-5.1-chat-latest",
		"o3-pro",
		"o3-deep-research",
		"o1-pro",
		"gpt-5.4-mini",
		"gpt-5-mini",
	],
	cerebras: ["gpt-oss-120b", "zai-glm-4.7", "gemma-4-31b"],
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
		"@cf/openai/gpt-oss-120b",
		"@cf/qwen/qwen3-30b-a3b-fp8",
		"@cf/zai-org/glm-4.7-flash",
	],
	deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
	fireworks: [
		"accounts/fireworks/models/deepseek-v4-pro",
		"accounts/fireworks/models/kimi-k2p7-code",
		"accounts/fireworks/routers/kimi-k2p7-code-fast",
		"accounts/fireworks/models/glm-5p2",
		"accounts/fireworks/routers/glm-5p2-fast",
		"accounts/fireworks/models/minimax-m3",
		"accounts/fireworks/models/glm-5p1",
		"accounts/fireworks/routers/glm-5p1-fast",
		"accounts/fireworks/models/kimi-k2p6",
		"accounts/fireworks/routers/kimi-k2p6-turbo",
		"accounts/fireworks/routers/kimi-k2p6-fast",
		"accounts/fireworks/models/minimax-m2p7",
		"accounts/fireworks/models/qwen3p7-plus",
		"accounts/fireworks/models/gpt-oss-120b",
		"accounts/fireworks/models/gpt-oss-20b",
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
		"gpt-5.2-codex",
		"gpt-5.2",
		"gemini-3.1-pro-preview",
		"gemini-3.5-flash",
		"gemini-3-flash-preview",
		"claude-sonnet-5",
		"claude-sonnet-4.6",
		"claude-sonnet-4.5",
		"gemini-2.5-pro",
		"gpt-5-mini",
		"kimi-k2.7-code",
	],
	google: [
		"gemini-3.1-pro-preview-customtools",
		"gemini-3.1-pro-preview",
		"gemini-3-pro-preview",
		"gemini-3.5-flash",
		"gemini-2.5-pro",
		"gemini-2.5-flash",
		"gemini-3.1-flash-lite-preview",
		"gemini-3.1-flash-lite",
		"gemini-2.5-flash-lite",
		"gemini-2.0-flash",
	],
	"google-vertex": [
		"gemini-3.1-pro-preview-customtools",
		"gemini-3.1-pro-preview",
		"gemini-3.5-flash",
		"gemini-3-flash-preview",
		"gemini-2.5-pro",
		"gemini-2.5-flash",
		"gemini-3.1-flash-lite",
		"gemini-2.5-flash-lite",
	],
	groq: [
		"openai/gpt-oss-120b",
		"qwen/qwen3-32b",
		"meta-llama/llama-4-scout-17b-16e-instruct",
		"llama-3.3-70b-versatile",
		"openai/gpt-oss-20b",
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
	"kimi-coding": ["k3", "kimi-for-coding", "kimi-for-coding-highspeed"],
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
		"gpt-5.6-sol",
		"gpt-5.6-terra",
		"gpt-5.6-luna",
		"gpt-5.5-pro",
		"gpt-5.5",
		"gpt-5.4-pro",
		"gpt-5.4",
		"gpt-5.3-codex",
		"gpt-5-pro",
		"gpt-5-chat-latest",
		"gpt-5.2-pro",
		"gpt-5.2",
		"gpt-5.2-codex",
		"gpt-5.1-codex-max",
		"gpt-5.1-codex",
		"gpt-5.1",
		"gpt-5.1-chat-latest",
		"o3-pro",
		"o3-deep-research",
		"o1-pro",
		"gpt-5.4-mini",
		"gpt-5-mini",
	],
	"openai-codex": [
		"gpt-5.6-sol",
		"gpt-5.6-terra",
		"gpt-5.6-luna",
		"gpt-5.5",
		"gpt-5.4",
		"gpt-5.4-mini",
		"gpt-5.3-codex-spark",
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
		"grok-4.5",
		"gemini-3.5-flash",
		"gemini-3.1-pro",
		"glm-5.2",
		"glm-5.1",
		"glm-5",
		"kimi-k2.7-code",
		"kimi-k2.6",
		"kimi-k2.5",
		"qwen3.6-plus",
		"qwen3.5-plus",
		"minimax-m3",
		"minimax-m2.7",
	],
	"opencode-go": [
		"deepseek-v4-pro",
		"glm-5.2",
		"glm-5.1",
		"qwen3.7-max",
		"qwen3.7-plus",
		"qwen3.6-plus",
		"mimo-v2.5-pro",
		"mimo-v2.5",
		"minimax-m3",
		"minimax-m2.7",
		"kimi-k2.7-code",
		"kimi-k2.6",
	],
	openrouter: [
		"anthropic/claude-fable-5",
		"~anthropic/claude-fable-latest",
		"anthropic/claude-opus-4.8",
		"anthropic/claude-opus-4.8-fast",
		"anthropic/claude-opus-4.7",
		"anthropic/claude-opus-4.7-fast",
		"anthropic/claude-opus-4.6",
		"anthropic/claude-opus-4.5",
		"anthropic/claude-opus-4.1",
		"openai/gpt-5.6-sol-pro",
		"openai/gpt-5.6-sol",
		"openai/gpt-5.6-terra-pro",
		"openai/gpt-5.6-terra",
		"openai/gpt-5.6-luna-pro",
		"openai/gpt-5.6-luna",
		"openai/gpt-5.5-pro",
		"openai/gpt-5.5",
		"~openai/gpt-latest",
		"google/gemini-3.1-pro-preview-customtools",
		"google/gemini-3.1-pro-preview",
		"~google/gemini-pro-latest",
		"google/gemini-3.5-flash",
		"google/gemini-2.5-pro",
		"moonshotai/kimi-k2.7-code",
		"~moonshotai/kimi-latest",
		"moonshotai/kimi-k2.6",
		"moonshotai/kimi-k2-thinking",
		"x-ai/grok-4.5",
		"~x-ai/grok-latest",
		"deepseek/deepseek-v4-pro",
		"deepseek/deepseek-r1",
		"deepseek/deepseek-v3.2",
		"minimax/minimax-m3",
		"minimax/minimax-m2.7",
		"minimax/minimax-m2.1",
		"z-ai/glm-5.2",
		"z-ai/glm-5.1",
	],
	"qwen-token-plan": [
		"qwen3.8-max-preview",
		"qwen3.7-max",
		"qwen3.7-plus",
		"qwen3.6-plus",
		"deepseek-v4-pro",
		"glm-5.2",
		"kimi-k2.7-code",
		"minimax-m2.5",
	],
	"qwen-token-plan-cn": [
		"qwen3.8-max-preview",
		"qwen3.7-max",
		"qwen3.7-plus",
		"qwen3.6-plus",
		"deepseek-v4-pro",
		"glm-5.2",
		"kimi-k2.7-code",
		"minimax-m2.5",
	],
	together: [
		"deepseek-ai/DeepSeek-V4-Pro",
		"zai-org/GLM-5.2",
		"moonshotai/Kimi-K2.7-Code",
		"moonshotai/Kimi-K2.6",
		"Qwen/Qwen3.7-Max",
		"Qwen/Qwen3.6-Plus",
		"MiniMaxAI/MiniMax-M3",
		"MiniMaxAI/MiniMax-M2.7",
		"openai/gpt-oss-120b",
		"openai/gpt-oss-20b",
		"nvidia/nemotron-3-ultra-550b-a55b",
		"google/gemma-4-31B-it",
	],
	"vercel-ai-gateway": [
		"anthropic/claude-fable-5",
		"anthropic/claude-opus-4.8",
		"anthropic/claude-opus-4.7",
		"anthropic/claude-opus-4.6",
		"anthropic/claude-opus-4.5",
		"anthropic/claude-opus-4.1",
		"anthropic/claude-sonnet-5",
		"anthropic/claude-sonnet-4.6",
		"openai/gpt-5.6-sol",
		"openai/gpt-5.6-terra",
		"openai/gpt-5.6-luna",
		"openai/gpt-5.5-pro",
		"openai/gpt-5.5",
		"openai/gpt-5.4-pro",
		"openai/gpt-5.4",
		"openai/gpt-5.3-codex",
		"openai/gpt-5.2-codex",
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
		"alibaba/qwen3.6-plus",
		"alibaba/qwen3.5-plus",
		"alibaba/qwen3-max-thinking",
		"google/gemini-3.1-pro-preview",
		"google/gemini-3.5-flash",
		"google/gemini-3-flash",
		"xai/grok-4.5",
		"xai/grok-4.20-reasoning",
		"minimax/minimax-m3",
		"zai/glm-5.2",
		"zai/glm-5.1",
	],
	xai: [
		"grok-4.5",
		"grok-4.3",
		"grok-build-0.1",
	],
	xiaomi: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro", "mimo-v2-omni", "mimo-v2-flash"],
	"xiaomi-token-plan-ams": ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro"],
	"xiaomi-token-plan-cn": ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro"],
	"xiaomi-token-plan-sgp": ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro"],
	nvidia: [
		"nvidia/nemotron-3-ultra-550b-a55b",
		"nvidia/nemotron-3-super-120b-a12b",
		"moonshotai/kimi-k2.6",
		"z-ai/glm-5.2",
		"minimaxai/minimax-m3",
		"mistralai/mistral-large-3-675b-instruct-2512",
		"openai/gpt-oss-120b",
		"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
		"nvidia/nemotron-3-nano-30b-a3b",
	],
	zai: [
		"glm-5.2",
		"glm-5.1",
		"glm-5-turbo",
		"glm-5v-turbo",
		"glm-4.7",
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

const CONTRARIAN_SYSTEM_PROMPT = [
	"You are the Contrarian: an independent, read-only adversarial analyst.",
	"Your job is to stress-test a proposal, plan, design, assumption, bug hypothesis, review conclusion, product direction, or decision by developing the strongest credible opposing case for the delegating primary agent.",
	"You are read-only. Never modify files, create patches, install dependencies, change configuration, implement fixes, or delegate work to other agents. Your output is adversarial analysis, evidence, and recommendations only.",
	"Use the available tools to inspect the repository and gather evidence. If bash is available, use it only for non-mutating inspection commands.",
	"Analysis process:",
	"1. Identify the core claim, decision, or direction being challenged.",
	"2. Gather the local read-only context needed to evaluate it accurately.",
	"3. Steelman the strongest credible opposing position before judging whether it holds.",
	"4. Identify hidden assumptions, failure modes, alternative interpretations, tradeoffs, and disconfirming evidence.",
	"5. Clearly separate confirmed objections, plausible concerns, and unresolved unknowns.",
	"6. Do not implement fixes or produce patches.",
	"If blocked by missing context, missing access, or a decision the delegating primary agent must make, state the blocker explicitly and continue with caveated analysis where possible.",
	"Return a concise markdown report with: Core claim or proposal being challenged; Strongest opposing case; Evidence reviewed; Which objections are confirmed, speculative, or unresolved; Residual risks, caveats, and recommended next steps, without implementing fixes.",
].join("\n");

const ContrarianParams = Type.Object({
	task: Type.String({
		description: "Question or task for the contrarian. Include enough context for a stand-alone review or analysis.",
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
				"Optional exact model or model pattern override. If omitted, the extension prefers a strong reasoning model on the opposite model family/provider when available, then falls back to the current provider/subscription.",
		}),
	),
	thinkingLevel: Type.Optional(
		StringEnum(THINKING_LEVELS, {
			description:
				"Optional reasoning level override for the contrarian subprocess. Defaults request high for reasoning models and off for non-reasoning models, then clamp to matched model capabilities.",
		}),
	),
	cwd: Type.Optional(Type.String({ description: "Optional working directory for the contrarian subprocess." })),
});

function createEmptyUsage(): UsageStats {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: 0,
		costInput: 0,
		costOutput: 0,
		costCacheRead: 0,
		costCacheWrite: 0,
		turns: 0,
		contextTokens: 0,
	};
}

function cloneUsageStats(stats: UsageStats): UsageStats {
	return { ...stats };
}

function mergeUsageStats(target: UsageStats, source: UsageStats | undefined): UsageStats {
	if (!source) return target;
	target.input += source.input;
	target.output += source.output;
	target.cacheRead += source.cacheRead;
	target.cacheWrite += source.cacheWrite;
	if (source.cacheWrite1h !== undefined) {
		target.cacheWrite1h = (target.cacheWrite1h ?? 0) + source.cacheWrite1h;
	}
	if (source.reasoning !== undefined) {
		target.reasoning = (target.reasoning ?? 0) + source.reasoning;
	}
	target.totalTokens += source.totalTokens;
	target.cost += source.cost;
	target.costInput += source.costInput;
	target.costOutput += source.costOutput;
	target.costCacheRead += source.costCacheRead;
	target.costCacheWrite += source.costCacheWrite;
	target.turns += source.turns;
	target.contextTokens = source.contextTokens || target.contextTokens;
	return target;
}

function usageStatsToToolUsage(stats: UsageStats): Usage {
	return {
		input: stats.input,
		output: stats.output,
		cacheRead: stats.cacheRead,
		cacheWrite: stats.cacheWrite,
		...(stats.cacheWrite1h !== undefined ? { cacheWrite1h: stats.cacheWrite1h } : {}),
		...(stats.reasoning !== undefined ? { reasoning: stats.reasoning } : {}),
		totalTokens: stats.totalTokens,
		cost: {
			input: stats.costInput,
			output: stats.costOutput,
			cacheRead: stats.costCacheRead,
			cacheWrite: stats.costCacheWrite,
			total: stats.cost,
		},
	};
}

function addUsageStats(
	target: UsageStats,
	source: Usage | undefined,
	options: { countTurn?: boolean; updateContextTokens?: boolean } = {},
): void {
	if (!source) return;
	if (options.countTurn) target.turns += 1;
	target.input += source.input || 0;
	target.output += source.output || 0;
	target.cacheRead += source.cacheRead || 0;
	target.cacheWrite += source.cacheWrite || 0;
	if (source.cacheWrite1h !== undefined) {
		target.cacheWrite1h = (target.cacheWrite1h ?? 0) + source.cacheWrite1h;
	}
	if (source.reasoning !== undefined) {
		target.reasoning = (target.reasoning ?? 0) + source.reasoning;
	}
	target.totalTokens += source.totalTokens || 0;
	target.cost += source.cost?.total || 0;
	target.costInput += source.cost?.input || 0;
	target.costOutput += source.cost?.output || 0;
	target.costCacheRead += source.cost?.cacheRead || 0;
	target.costCacheWrite += source.cost?.cacheWrite || 0;
	if (options.updateContextTokens) {
		target.contextTokens = source.totalTokens || target.contextTokens;
	}
}

function getContrarianConfigPath(): string {
	return path.join(getAgentDir(), "extensions", CONTRARIAN_CONFIG_FILE);
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
	const match = model.match(/^(.*):(off|minimal|low|medium|high|xhigh|max)$/i);
	if (!match?.[1]) return { model };
	return { model: match[1], thinkingLevel: parseThinkingLevel(match[2]) };
}

async function readContrarianPreferences(): Promise<ContrarianPreferences> {
	try {
		const raw = await fs.readFile(getContrarianConfigPath(), "utf8");
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

async function writeContrarianPreferences(preferences: ContrarianPreferences): Promise<void> {
	const configPath = getContrarianConfigPath();
	const config = {
		...(preferences.model ? { model: preferences.model } : {}),
		...(preferences.thinkingLevel ? { thinkingLevel: preferences.thinkingLevel } : {}),
		updatedAt: new Date().toISOString(),
	};
	await fs.mkdir(path.dirname(configPath), { recursive: true });
	await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function formatContrarianPreferences(preferences: ContrarianPreferences): string {
	const model = preferences.model ?? "auto";
	const thinkingLevel = preferences.thinkingLevel ?? "auto";
	return `Contrarian defaults: model=${model}, thinkingLevel=${thinkingLevel}. Config: ${getContrarianConfigPath()}`;
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
	if (stats.reasoning) parts.push(`T${formatTokens(stats.reasoning)}`);
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

function formatContrarianModelError(stopReason: "error" | "aborted", errorMessage: string | undefined): string {
	const trimmed = errorMessage?.trim();
	if (stopReason === "aborted") {
		return trimmed ? `Contrarian model turn aborted: ${trimmed}` : "Contrarian model turn aborted.";
	}
	if (!trimmed) return "Contrarian model error (no detail provided by provider).";
	const base = `Contrarian model error: ${trimmed}`;
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

function modelText(model: PiModel): string {
	return `${model.provider} ${model.id} ${model.name ?? ""}`.toLowerCase();
}

function isAnthropicFamily(model: PiModel): boolean {
	return /\b(anthropic|claude|opus|sonnet|haiku|fable)\b/.test(modelText(model));
}

function isOpenAiFamily(model: PiModel): boolean {
	return /\b(openai|codex|chatgpt|gpt[-_. ]?\d|o[1345](?:\b|-|_))\b/.test(modelText(model));
}

function selectPreferredAcrossProviders(models: PiModel[]): PiModel | undefined {
	const lowered = models.map((model) => ({ model, haystack: `${model.id} ${model.name ?? ""}`.toLowerCase() }));
	for (const pattern of CONTRARIAN_MODEL_PREFERENCES) {
		const match = lowered.find((entry) => entry.haystack.includes(pattern.toLowerCase()));
		if (match) return match.model;
	}
	for (const preferences of Object.values(PROVIDER_MODEL_PREFERENCES)) {
		for (const pattern of preferences) {
			const match = lowered.find((entry) => entry.haystack.includes(pattern.toLowerCase()));
			if (match) return match.model;
		}
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
	if (/(?:^|\/)[^:]+:(off|minimal|low|medium|high|xhigh|max)$/i.test(modelRef)) return modelRef;
	return `${modelRef}:${thinkingLevel}`;
}

// Keep these local so the extension stays compatible with older pi peer installs that do not export clamp helpers.
function isThinkingLevelSupported(model: PiModel, level: ThinkingLevel): boolean {
	if (!model.reasoning) return level === "off";

	const map = model.thinkingLevelMap;
	if (level === "xhigh" || level === "max") {
		return !!map && Object.prototype.hasOwnProperty.call(map, level) && map[level] != null;
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

function toContrarianSelection(
	model: PiModel,
	thinkingLevelOverride: ThinkingLevel | undefined,
	reason: string,
): ContrarianSelection {
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
): ContrarianSelection | undefined {
	const model = ctx.model;
	if (!model) return undefined;
	return toContrarianSelection(
		model,
		thinkingLevelOverride,
		`Used the current session model ${model.provider}/${model.id} as a final fallback.`,
	);
}

function withFallbackReason(selection: ContrarianSelection, previous: ContrarianSelection): ContrarianSelection {
	return {
		...selection,
		selectionReason: `${selection.selectionReason} (Fell back from ${previous.modelRef} after a model-availability error.)`,
	};
}

async function selectContrarianModel(
	ctx: { model?: PiModel; modelRegistry: { getAvailable(): PiModel[] | Promise<PiModel[]> } },
	thinkingLevelOverride?: ThinkingLevel,
): Promise<{ ok: true; selection: ContrarianSelection; ordered: ContrarianSelection[] } | { ok: false; error: string }> {
	const available = await ctx.modelRegistry.getAvailable();
	if (available.length === 0) {
		return {
			ok: false,
			error: "No authenticated models are available. Log in or configure an API key first.",
		};
	}

	const currentModel = ctx.model;
	const currentProvider = currentModel?.provider;
	const sameProvider = currentProvider ? available.filter((model) => model.provider === currentProvider) : [];
	const sameProviderReasoning = sameProvider.filter((model) => model.reasoning);
	const allReasoning = available.filter((model) => model.reasoning);
	const oppositeFamily = currentModel
		? isAnthropicFamily(currentModel)
			? available.filter(isOpenAiFamily)
			: isOpenAiFamily(currentModel)
				? available.filter(isAnthropicFamily)
				: []
		: [];
	const oppositeProvider = currentProvider ? available.filter((model) => model.provider !== currentProvider) : [];
	const oppositeProviderFamily = currentProvider
		? oppositeFamily.filter((model) => model.provider !== currentProvider)
		: oppositeFamily;
	const sameProviderOppositeFamily = currentProvider
		? oppositeFamily.filter((model) => model.provider === currentProvider)
		: [];
	const oppositeProviderFamilyReasoning = oppositeProviderFamily.filter((model) => model.reasoning);
	const sameProviderOppositeFamilyReasoning = sameProviderOppositeFamily.filter((model) => model.reasoning);
	const oppositeFamilyReasoning = oppositeFamily.filter((model) => model.reasoning);
	const oppositeProviderReasoning = oppositeProvider.filter((model) => model.reasoning);

	let candidates = oppositeProviderFamilyReasoning;
	let reason = "Selected the top-ranked reasoning model from the opposite model family on a different provider for an independent adversarial pass.";
	let providerForPreferences: string | undefined = undefined;

	if (candidates.length === 0 && oppositeProviderFamily.length > 0) {
		candidates = oppositeProviderFamily;
		reason = "No reasoning models were available in the opposite model family on a different provider, so the top-ranked opposite-family model on a different provider was used.";
	} else if (candidates.length === 0 && oppositeProviderReasoning.length > 0) {
		candidates = oppositeProviderReasoning;
		reason = "No recognized opposite-family model was available, so the top-ranked reasoning model on a different provider was used.";
	} else if (candidates.length === 0 && oppositeProvider.length > 0) {
		candidates = oppositeProvider;
		reason = "No recognized opposite-family reasoning model was available, so the top-ranked model on a different provider was used.";
	} else if (candidates.length === 0 && sameProviderOppositeFamilyReasoning.length > 0) {
		candidates = sameProviderOppositeFamilyReasoning;
		reason = "No different provider was available, so the top-ranked reasoning model from the opposite model family on the current provider was used.";
	} else if (candidates.length === 0 && sameProviderOppositeFamily.length > 0) {
		candidates = sameProviderOppositeFamily;
		reason = "No different provider or opposite-family reasoning model was available, so the top-ranked opposite-family model on the current provider was used.";
	} else if (candidates.length === 0 && oppositeFamilyReasoning.length > 0) {
		candidates = oppositeFamilyReasoning;
		reason = "Selected the top-ranked reasoning model from the opposite model family for an independent adversarial pass.";
	} else if (candidates.length === 0 && sameProviderReasoning.length > 0) {
		candidates = sameProviderReasoning;
		providerForPreferences = currentProvider;
		reason = "No opposite provider/model family was available, so the top-ranked reasoning model on the current provider was used.";
	} else if (candidates.length === 0 && sameProvider.length > 0) {
		candidates = sameProvider;
		providerForPreferences = currentProvider;
		reason = "No opposite provider/model family or current-provider reasoning model was available, so the top-ranked model on the current provider was used.";
	} else if (candidates.length === 0 && allReasoning.length > 0) {
		candidates = allReasoning;
		reason = "No current model/provider was active, so the top-ranked reasoning model across all available providers was used.";
	} else if (candidates.length === 0) {
		candidates = available;
		reason = "No reasoning models were available, so the top-ranked model across all available providers was used.";
	}

	const sorted = [...candidates].sort((a, b) => rankModel(b) - rankModel(a));
	const preferred = providerForPreferences
		? selectPreferredModel(candidates, providerForPreferences)
		: selectPreferredAcrossProviders(candidates);
	const orderedModels = preferred ? [preferred, ...sorted.filter((model) => model !== preferred)] : sorted;

	const ordered = orderedModels.map((model, index) =>
		toContrarianSelection(
			model,
			thinkingLevelOverride,
			index === 0
				? preferred
					? `Selected ${model.id} via the hardcoded preference lists while preferring an opposite provider/model family.`
					: reason
				: `Auto-selected ${model.provider}/${model.id} as a lower-ranked fallback.`,
		),
	);

	return { ok: true, selection: ordered[0], ordered };
}

function updateContrarianUi(ctx: ExtensionContext, activeRuns: Map<string, ContrarianUiRun>): void {
	if (!ctx.hasUI) return;
	const theme = ctx.ui.theme;
	if (activeRuns.size === 0) {
		ctx.ui.setStatus(CONTRARIAN_STATUS_ID, undefined);
		ctx.ui.setWidget(CONTRARIAN_WIDGET_ID, undefined);
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
		theme.fg("accent", "🔮 contrarian") +
		theme.fg("dim", ` ${modelText}${thinkingText} · ${mode} · ${elapsed}`) +
		(activeCount > 1 ? theme.fg("warning", ` · ${activeCount} active`) : "");
	ctx.ui.setStatus(CONTRARIAN_STATUS_ID, status);

	const lines = [
		`🔮 Contrarian ${activeCount > 1 ? `(${activeCount} active)` : ""}`.trim(),
		`${primary.selection?.modelRef ?? "selecting model…"} · ${mode} · ${elapsed}`,
		`task: ${shorten(primary.task, 110)}`,
	];
	if (primary.preview && primary.preview.trim()) lines.push(`preview: ${shorten(primary.preview, 110)}`);
	ctx.ui.setWidget(CONTRARIAN_WIDGET_ID, lines, { placement: "belowEditor" });
}

async function runContrarian(
	selection: ContrarianSelection,
	params: { task: string; includeBash?: boolean; cwd?: string },
	signal: AbortSignal | undefined,
	onUpdate: ((result: { content: Array<{ type: "text"; text: string }>; details: ContrarianDetails }) => void) | undefined,
	defaultCwd: string,
	spawnImpl: typeof spawn = spawn,
): Promise<{ ok: true; output: string; details: ContrarianDetails } | { ok: false; error: string; details: ContrarianDetails }> {
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

	const details: ContrarianDetails = {
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
			content: [{ type: "text", text: currentText || finalOutput || "Consulting contrarian..." }],
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
		CONTRARIAN_SYSTEM_PROMPT,
		params.task,
	];

	const invocation = getPiInvocation(args);
	let wasAborted = false;

	const exitCode = await new Promise<number>((resolve) => {
		const proc = spawnImpl(invocation.command, invocation.args, {
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

				addUsageStats(usage, event.message.usage as Usage | undefined, {
					countTurn: true,
					updateContextTokens: true,
				});
				emit();
				return;
			}

			if (event.type === "compaction_end") {
				addUsageStats(usage, event.result?.usage as Usage | undefined);
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

		let closed = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		let abortListener: (() => void) | undefined;

		const childHasExited = () => proc.exitCode !== null || proc.signalCode !== null;
		const clearEscalation = () => {
			if (killTimer) {
				clearTimeout(killTimer);
				killTimer = undefined;
			}
		};
		const cleanup = () => {
			clearEscalation();
			if (signal && abortListener) {
				signal.removeEventListener("abort", abortListener);
				abortListener = undefined;
			}
		};

		proc.on("exit", () => {
			clearEscalation();
		});

		proc.on("close", (code) => {
			closed = true;
			cleanup();
			if (buffer.trim()) processLine(buffer);
			resolve(code ?? 0);
		});

		proc.on("error", (error) => {
			cleanup();
			stderr += `${error instanceof Error ? error.message : String(error)}\n`;
			resolve(1);
		});

		if (signal) {
			abortListener = () => {
				wasAborted = true;
				proc.kill("SIGTERM");
				if (closed || childHasExited()) return;
				killTimer = setTimeout(() => {
					if (!closed && !childHasExited()) proc.kill("SIGKILL");
				}, 5000);
			};
			if (signal.aborted) abortListener();
			else signal.addEventListener("abort", abortListener, { once: true });
		}
	});

	details.stderr = stderr.trim();
	details.exitCode = exitCode;
	details.durationMs = Date.now() - startedAt;

	if (wasAborted) {
		if (details.exitCode === 0) details.exitCode = 1;
		return { ok: false, error: "Contrarian was aborted.", details };
	}

	// The pi subprocess in `--mode json` does not promote an errored assistant
	// turn to a non-zero exit code or stderr; the error is only carried on the
	// streamed assistant message via stopReason/errorMessage. Surface that here
	// so callers can distinguish transient provider errors from a genuinely
	// empty response.
	if (lastStopReason === "error" || lastStopReason === "aborted") {
		if (details.exitCode === 0) details.exitCode = 1;
		return {
			ok: false,
			error: formatContrarianModelError(lastStopReason, lastErrorMessage),
			details,
		};
	}

	if (exitCode !== 0) {
		return {
			ok: false,
			error: details.stderr || finalOutput || "Contrarian subprocess failed.",
			details,
		};
	}

	if (!finalOutput.trim()) {
		if (details.exitCode === 0) details.exitCode = 1;
		return {
			ok: false,
			error: details.stderr || "Contrarian finished without returning any text.",
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

type ContrarianExtensionDeps = {
	spawnImpl?: typeof spawn;
};

export const __test__ = {
	createContrarianExtension,
	findAvailableModel,
	isModelAvailabilityError,
	parseModelPreference,
	runContrarian,
	resolveThinkingLevel,
	selectContrarianModel,
};

export default function contrarianExtension(pi: ExtensionAPI) {
	createContrarianExtension(pi);
}

function createContrarianExtension(pi: ExtensionAPI, deps: ContrarianExtensionDeps = {}) {
	const spawnImpl = deps.spawnImpl ?? spawn;
	const activeRuns = new Map<string, ContrarianUiRun>();
	let preferences: ContrarianPreferences = {};

	pi.on("session_start", async (_event, ctx) => {
		preferences = await readContrarianPreferences();
		activeRuns.clear();
		updateContrarianUi(ctx, activeRuns);
	});

	pi.registerCommand("contrarian", {
		description: "Configure Contrarian default model and thinking level for future contrarian tool calls",
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
			const configPath = getContrarianConfigPath();

			const save = async (next: ContrarianPreferences): Promise<string | undefined> => {
				preferences = next;
				try {
					await writeContrarianPreferences(preferences);
					return undefined;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return `Preference changed for this process, but could not save ${configPath}: ${message}`;
				}
			};

			if (action === "status" || action === "show") {
				notifyCommand(ctx, formatContrarianPreferences(preferences));
				return;
			}

			if (action === "model") {
				const model = rest.join(" ").trim();
				const normalizedModelAction = model.toLowerCase();
				if (!model) {
					notifyCommand(ctx, "Usage: /contrarian model <provider/model|auto>", "warning");
					return;
				}
				if (normalizedModelAction === "auto" || normalizedModelAction === "clear" || normalizedModelAction === "default") {
					const warning = await save({ ...preferences, model: undefined });
					notifyCommand(ctx, `Contrarian default model cleared; future contrarian calls will auto-select. ${warning ?? formatContrarianPreferences(preferences)}`, warning ? "warning" : "info");
					return;
				}
				const parsedModel = parseModelPreference(model);
				const next = {
					...preferences,
					model: parsedModel.model,
					thinkingLevel: parsedModel.thinkingLevel ?? preferences.thinkingLevel,
				};
				const warning = await save(next);
				notifyCommand(ctx, `Contrarian default model set to ${parsedModel.model}. ${warning ?? formatContrarianPreferences(preferences)}`, warning ? "warning" : "info");
				return;
			}

			if (action === "thinking" || action === "think" || action === "thinking-level") {
				const value = rest[0]?.trim().toLowerCase();
				if (!value) {
					notifyCommand(ctx, `Usage: /contrarian thinking ${THINKING_LEVELS.join(" | ")} | auto`, "warning");
					return;
				}
				if (value === "auto" || value === "clear" || value === "default") {
					const warning = await save({ ...preferences, thinkingLevel: undefined });
					notifyCommand(ctx, `Contrarian default thinking level cleared; future contrarian calls will use built-in defaults. ${warning ?? formatContrarianPreferences(preferences)}`, warning ? "warning" : "info");
					return;
				}
				const thinkingLevel = parseThinkingLevel(value);
				if (!thinkingLevel) {
					notifyCommand(ctx, `Usage: /contrarian thinking ${THINKING_LEVELS.join(" | ")} | auto`, "warning");
					return;
				}
				const warning = await save({ ...preferences, thinkingLevel });
				notifyCommand(ctx, `Contrarian default thinking level set to ${thinkingLevel}. ${warning ?? formatContrarianPreferences(preferences)}`, warning ? "warning" : "info");
				return;
			}

			if (action === "clear" || action === "reset") {
				const target = rest[0]?.trim().toLowerCase() || "all";
				let next: ContrarianPreferences;
				if (target === "all") next = {};
				else if (target === "model") next = { ...preferences, model: undefined };
				else if (target === "thinking" || target === "thinking-level") next = { ...preferences, thinkingLevel: undefined };
				else {
					notifyCommand(ctx, "Usage: /contrarian clear [all|model|thinking]", "warning");
					return;
				}
				const warning = await save(next);
				notifyCommand(ctx, `Contrarian defaults cleared (${target}). ${warning ?? formatContrarianPreferences(preferences)}`, warning ? "warning" : "info");
				return;
			}

			notifyCommand(ctx, "Usage: /contrarian status | model <provider/model|auto> | thinking <off|minimal|low|medium|high|xhigh|max|auto> | clear [all|model|thinking]", "warning");
		},
	});

	pi.registerCommand("contrarian-model", {
		description: "Show which model the contrarian would use right now",
		handler: async (_args, ctx) => {
			const defaultModel = parseModelPreference(preferences.model);
			if (defaultModel.model) {
				const matched = await findAvailableModel(ctx, defaultModel.model);
				const thinking = resolveThinkingLevel(matched, preferences.thinkingLevel ?? defaultModel.thinkingLevel);
				const modelRef = matched ? `${matched.provider}/${matched.id}` : defaultModel.model;
				const suffix = matched
					? appendThinkingLevelClampReason("Configured default contrarian model is active.", thinking)
					: "Configured default contrarian model is active, but it was not matched against the authenticated model list.";
				notifyCommand(ctx, `Contrarian: ${modelRef} (${thinking.effective}) — ${suffix}`);
				return;
			}
			const selectionResult = await selectContrarianModel(ctx, preferences.thinkingLevel);
			if (!selectionResult.ok) {
				notifyCommand(ctx, selectionResult.error, "error");
				return;
			}

			const { selection } = selectionResult;
			const message = `Contrarian: ${selection.modelRef} (${selection.thinkingLevel}) — ${selection.selectionReason}`;
			notifyCommand(ctx, message);
		},
	});

	pi.on("tool_result", async (event) => {
		if (event.toolName !== "contrarian") return undefined;
		const details = event.details as ContrarianDetails | undefined;
		if ((details?.exitCode ?? 0) === 0) return undefined;
		return { isError: true };
	});

	pi.registerTool({
		name: "contrarian",
		label: "Contrarian",
		description:
			"Consult a separate read-only contrarian subprocess that stress-tests plans, designs, assumptions, bug hypotheses, and conclusions by steelmanning the strongest opposing case.",
		promptSnippet:
			"Consult a read-only contrarian that prefers a strong opposite-family/provider model for adversarial analysis.",
		promptGuidelines: [
			"Use contrarian when you need to stress-test a proposal, implementation plan, design, assumption, bug hypothesis, review conclusion, or product direction.",
			"Ask contrarian to steelman the strongest opposing case and separate confirmed objections, plausible concerns, and unresolved unknowns.",
			"Do not use contrarian for routine low-value work; contrarian is slower than the main agent.",
			"The contrarian tool is read-only by default and only exposes read, grep, find, and ls unless contrarian includeBash is enabled.",
			"Set contrarian includeBash only when the extra bash inspection tool is genuinely useful; keep contrarian relying on read, grep, find, and ls otherwise.",
			"The contrarian tool requests high by default for reasoning models; contrarian defaults and explicit thinkingLevel overrides are clamped to the effective model-supported level when the model is matched.",
		],
		parameters: ContrarianParams,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const rawTask = (params as { task?: unknown }).task;
			const task = typeof rawTask === "string" ? rawTask.trim() : "";
			if (!task) throw new Error("Invalid parameters: expected task to be a non-empty string.");

			const explicitModel = parseModelPreference(params.model);
			const defaultModel = parseModelPreference(preferences.model);
			const configuredModel = explicitModel.model ?? defaultModel.model;
			const configuredThinkingLevel =
				params.thinkingLevel ?? explicitModel.thinkingLevel ?? preferences.thinkingLevel ?? defaultModel.thinkingLevel;
			const uiRun: ContrarianUiRun = {
				task,
				includeBash: params.includeBash ?? false,
				startedAt: Date.now(),
			};
			activeRuns.set(toolCallId, uiRun);
			updateContrarianUi(ctx, activeRuns);

			try {
				const attempts: ContrarianSelection[] = [];
				const seen = new Set<string>();
				const aggregateUsage = createEmptyUsage();
				const finalizeResult = (
					result: { content: Array<{ type: "text"; text: string }>; details: ContrarianDetails },
				): AgentToolResult<ContrarianDetails> => ({
					...result,
					details: { ...result.details, usage: cloneUsageStats(aggregateUsage) },
					usage: usageStatsToToolUsage(aggregateUsage),
				});
				const pushAttempt = (candidate: ContrarianSelection | undefined) => {
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
								: "Used the configured default contrarian model.",
							thinking,
						)
						: usedToolOverride
							? "Used the explicit model override provided in the tool call. The model was not matched against the authenticated model list, so the reasoning level fallback was applied."
							: "Used the configured default contrarian model. The model was not matched against the authenticated model list, so the reasoning level fallback was applied.";
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
					const selectionResult = await selectContrarianModel(ctx, configuredThinkingLevel);
					if (!selectionResult.ok) {
						return finalizeResult({
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
						});
					}
					for (const candidate of selectionResult.ordered) pushAttempt(candidate);
				}

				// Keep the known-good session model as a final fallback: the catalog can
				// advertise models the active provider/subscription cannot actually serve
				// (legacy snapshots, access-gated tiers), which fail with a not-found/404
				// error. Falling back lets the run degrade gracefully instead of hard-failing.
				pushAttempt(buildSessionFallbackSelection(ctx, configuredThinkingLevel));

				const handleUpdate = (partial: { content: Array<{ type: "text"; text: string }>; details: ContrarianDetails }) => {
					uiRun.preview = partial.content[0]?.text ?? uiRun.preview;
					updateContrarianUi(ctx, activeRuns);
					onUpdate?.(partial);
				};

				let lastErrorResult: { ok: false; error: string; details: ContrarianDetails } | undefined;
				for (let index = 0; index < attempts.length; index++) {
					const previous = index > 0 ? attempts[index - 1] : undefined;
					const attempt = previous ? withFallbackReason(attempts[index], previous) : attempts[index];
					uiRun.selection = attempt;
					updateContrarianUi(ctx, activeRuns);

					const result = await runContrarian(attempt, { ...params, task }, signal, handleUpdate, ctx.cwd, spawnImpl);
					mergeUsageStats(aggregateUsage, result.details.usage);
					if (result.ok) {
						return finalizeResult({
							content: [{ type: "text", text: result.output }],
							details: result.details,
						});
					}

					lastErrorResult = result;
					const canFallBack = index < attempts.length - 1 && isModelAvailabilityError(result.error);
					if (!canFallBack) {
						return finalizeResult({
							content: [{ type: "text", text: result.error }],
							details: result.details,
						});
					}
				}

				return finalizeResult({
					content: [
						{ type: "text", text: lastErrorResult?.error ?? "Contrarian could not select an available model." },
					],
					details:
						lastErrorResult?.details ?? {
							modelRef: "",
							provider: ctx.model?.provider ?? "unknown",
							modelId: "",
							modelName: undefined,
							thinkingLevel: configuredThinkingLevel ?? DEFAULT_THINKING_LEVEL,
							autoSelected: true,
							selectionReason: "No authenticated models were available to run the contrarian.",
							includeBash: params.includeBash ?? false,
							usage: createEmptyUsage(),
							stderr: "",
							exitCode: 1,
							durationMs: 0,
							cwd: params.cwd ?? ctx.cwd,
						},
				});
			} finally {
				activeRuns.delete(toolCallId);
				updateContrarianUi(ctx, activeRuns);
			}
		},

		renderCall(args, theme) {
			const task = args.task.length > 90 ? `${args.task.slice(0, 90)}...` : args.task;
			const mode = args.includeBash ? "read-only+bash" : "read-only";
			const override = args.model ? ` ${theme.fg("muted", `[${args.model}]`)}` : "";
			const thinking = args.thinkingLevel ? ` ${theme.fg("warning", `(${args.thinkingLevel})`)}` : "";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("contrarian "))}${theme.fg("accent", mode)}${override}${thinking}\n  ${theme.fg("dim", task)}`,
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as ContrarianDetails | undefined;
			const body = result.content[0]?.type === "text" ? result.content[0].text : "(no output)";
			if (!details) return new Text(body, 0, 0);

			const isError = (details.exitCode ?? 0) !== 0;
			const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
			const header = `${icon} ${theme.fg("toolTitle", theme.bold("contrarian "))}${theme.fg("accent", details.modelRef || "(auto)")}`;
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
