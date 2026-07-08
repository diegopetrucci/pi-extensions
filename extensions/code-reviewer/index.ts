import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { AgentSession, ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
	createAgentSession,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MAX_TOOL_CALLS_TO_KEEP = 80;
const MAX_TURNS = 8;
const MAX_RUN_MS = 8 * 60 * 1000;
const DEFAULT_BASH_TIMEOUT_SECONDS = 30;
const DEFAULT_THINKING_LEVEL = "high";
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

type ThinkingLevel = (typeof THINKING_LEVELS)[number];
type ThinkingLevelMap = Partial<Record<ThinkingLevel, unknown | null>>;
const CODE_REVIEWER_MODEL_PREFERENCES = [
	"gpt-5.5",
	"claude-opus-4-8",
	"claude-opus-4.8",
	"claude-sonnet-5-0",
	"claude-sonnet-5.0",
	"claude-sonnet-5",
	"claude-sonnet-4-6",
	"claude-sonnet-4.6",
	"claude-sonnet-4-5",
	"claude-sonnet-4.5",
	"claude-sonnet-4-0",
	"claude-sonnet-4",
];
const PROVIDER_MODEL_PREFERENCES: Record<string, string[]> = {
	"amazon-bedrock": [
		"claude-fable-5",
		"claude-opus-4-8",
		"claude-opus-4.8",
		"claude-sonnet-5",
		"claude-sonnet-4-6",
		"claude-sonnet-4.6",
		"claude-sonnet-4-5",
		"claude-sonnet-4.5",
		"claude-sonnet-4",
	],
	anthropic: [
		"claude-fable-5",
		"claude-opus-4-8",
		"claude-opus-4.8",
		"claude-sonnet-5",
		"claude-sonnet-4-6",
		"claude-sonnet-4.6",
		"claude-sonnet-4-5",
		"claude-sonnet-4.5",
		"claude-sonnet-4",
	],
	openai: ["gpt-5.5", "gpt-5", "gpt-4.1", "o3", "o4-mini", "o4"],
	"vercel-ai-gateway": [
		"gpt-5.5",
		"anthropic/claude-fable-5",
		"anthropic/claude-opus-4.1",
		"anthropic/claude-opus-4",
		"anthropic/claude-sonnet-5",
		"anthropic/claude-sonnet-4",
	],
};

const READ_ONLY_TOOL_NAMES = new Set(["read", "grep", "find", "ls", "bash"]);
const READ_ONLY_BASH_COMMANDS = new Set(["gh", "git", "pwd"]);
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
	"blame",
	"cat-file",
	"describe",
	"diff",
	"for-each-ref",
	"log",
	"ls-files",
	"ls-tree",
	"merge-base",
	"name-rev",
	"remote",
	"rev-parse",
	"shortlog",
	"show",
	"show-ref",
	"status",
	"whatchanged",
]);
const SAFE_GIT_BRANCH_FLAGS = new Set([
	"-a",
	"--all",
	"-r",
	"--remotes",
	"-v",
	"-vv",
	"--show-current",
	"--list",
	"--contains",
	"--merged",
	"--no-merged",
]);
const SAFE_GIT_GLOBAL_FLAGS = new Set(["--no-pager", "--no-optional-locks"]);
const SAFE_GIT_CONFIG_OVERRIDES = ["core.pager=cat", "core.fsmonitor=false", "diff.external="];
const GIT_SUBCOMMAND_SAFE_FLAGS: Partial<Record<string, string[]>> = {
	blame: ["--no-textconv"],
	diff: ["--no-ext-diff", "--no-textconv"],
	log: ["--no-ext-diff", "--no-textconv"],
	show: ["--no-ext-diff", "--no-textconv"],
	whatchanged: ["--no-ext-diff", "--no-textconv"],
};
const GIT_OPTIONS_REQUIRING_LOCAL_FILE = [
	{
		flag: "--contents",
		blockedPrefixes: ["--con"],
		reason: "Code Reviewer bash blocks git --contents because it can read local files outside built-in path guards.",
	},
	{
		flag: "--pathspec-from-file",
		blockedPrefixes: ["--pathspec"],
		reason: "Code Reviewer bash blocks git --pathspec-from-file because it can read local files outside built-in path guards.",
	},
	{
		flag: "--ignore-revs-file",
		blockedPrefixes: ["--ignore-rev"],
		reason: "Code Reviewer bash blocks git --ignore-revs-file because it can read local files outside built-in path guards.",
	},
] as const;
const GIT_SUBCOMMAND_OPTIONS_REQUIRING_LOCAL_FILE: Partial<Record<string, Array<{ reason: string; matches: (token: string) => boolean }>>> = {
	blame: [
		{
			reason: "Code Reviewer bash blocks git blame -S because it can read local revs files outside built-in path guards.",
			matches: (token) => token === "-S" || (token.startsWith("-S") && token.length > 2),
		},
	],
	"ls-files": [
		{
			reason: "Code Reviewer bash blocks git ls-files -X/--exclude-from because it can read local files outside built-in path guards.",
			matches: (token) => token === "-X" || (token.startsWith("-X") && token.length > 2),
		},
		{
			reason: "Code Reviewer bash blocks git ls-files -X/--exclude-from because it can read local files outside built-in path guards.",
			matches: (token) => {
				if (!token.startsWith("--")) return false;
				const option = token.split("=", 1)[0]?.toLowerCase() ?? "";
				return option === "--exclude-from" || option.startsWith("--exclude-f");
			},
		},
	],
};
const GH_GLOBAL_OPTIONS_WITH_VALUE = new Set(["--repo", "-R", "--hostname", "--jq", "-q", "--template"]);
const MUTATING_GH_API_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CodeReviewerParams = Type.Object({
	task: Type.String({
		description: "What change to review, what ticket/story it should satisfy, and any specific review focus.",
	}),
	diff: Type.Optional(
		Type.String({
			description: "Optional diff, patch, or change summary to treat as the primary review target.",
		}),
	),
	context: Type.Optional(
		Type.String({
			description: "Optional caller context such as constraints, known risks, or expected behavior.",
		}),
	),
});

type ToolCall = {
	id: string;
	name: string;
	args: unknown;
	startedAt: number;
	endedAt?: number;
	isError?: boolean;
};

type ReviewStatus = "running" | "done" | "error" | "aborted";

type ReviewDetails = {
	status: ReviewStatus;
	cwd: string;
	task: string;
	turns: number;
	toolCalls: ToolCall[];
	startedAt: number;
	endedAt?: number;
	error?: string;
	modelRef?: string;
	modelName?: string;
	requestedThinkingLevel?: ThinkingLevel;
	effectiveThinkingLevel?: ThinkingLevel;
	thinkingLevelClamped?: boolean;
	thinkingLevelNote?: string;
};

type PiModel = {
	provider: string;
	id: string;
	name?: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
	thinkingLevelMap?: ThinkingLevelMap;
};

type ModelRegistryContext = {
	model?: PiModel;
	modelRegistry: { getAvailable(): PiModel[] | Promise<PiModel[]> };
};

type CreateAgentSessionModel = NonNullable<Parameters<typeof createAgentSession>[0]>["model"];

const MODEL_AVAILABILITY_ERROR_PATTERN =
	/\b(?:404|403|not[_ ]?found(?:[_ ]?error)?|model[_ ]?not[_ ]?found(?:[_ ]?error)?|no such model|unknown model|does not exist|is not available|not available|model[_ ]?not[_ ]?available|unsupported model|invalid model|forbidden|access[ _-]?denied|permission[ _-]?denied|not[ _-]?entitled|do(?:es)? not have access)\b/i;

function isModelAvailabilityError(message: string | undefined): boolean {
	if (!message) return false;
	return MODEL_AVAILABILITY_ERROR_PATTERN.test(message);
}

function parseVersionScore(text: string): number {
	const matches = text.match(/\d+(?:[._-]\d+)*/g) ?? [];
	let best = 0;
	for (const rawMatch of matches) {
		const match = rawMatch.replace(/[_-]/g, ".");
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

function modelText(model: PiModel): string {
	return `${model.provider} ${model.id} ${model.name ?? ""}`.toLowerCase();
}

function isAnthropicFamily(model: PiModel): boolean {
	return /\b(anthropic|claude|opus|sonnet|haiku|fable)\b/.test(modelText(model));
}

function isOpenAiFamily(model: PiModel): boolean {
	return /\b(openai|codex|chatgpt|gpt[-_. ]?\d|o[1345](?:\b|-|_))\b/.test(modelText(model));
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

function selectPreferredAcrossProviders(models: PiModel[]): PiModel | undefined {
	const lowered = models.map((model) => ({ model, haystack: `${model.id} ${model.name ?? ""}`.toLowerCase() }));
	for (const pattern of CODE_REVIEWER_MODEL_PREFERENCES) {
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

function orderPreferredModels(candidates: PiModel[], providerForPreferences?: string): PiModel[] {
	const sorted = [...candidates].sort((a, b) => rankModel(b) - rankModel(a));
	const preferred = providerForPreferences
		? selectPreferredModel(candidates, providerForPreferences)
		: selectPreferredAcrossProviders(candidates);
	return preferred ? [preferred, ...sorted.filter((model) => model !== preferred)] : sorted;
}

function getModelKey(model: PiModel): string {
	return `${model.provider}::${model.id}`;
}

function appendOrderedCandidates(
	ordered: PiModel[],
	seen: Set<string>,
	candidates: PiModel[],
	providerForPreferences?: string,
): void {
	for (const model of orderPreferredModels(candidates, providerForPreferences)) {
		const key = getModelKey(model);
		if (seen.has(key)) continue;
		seen.add(key);
		ordered.push(model);
	}
}

async function selectCodeReviewerModel(
	ctx: ModelRegistryContext,
): Promise<{ ok: true; selection: PiModel; ordered: PiModel[] } | { ok: false; error: string }> {
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

	const ordered: PiModel[] = [];
	const seen = new Set<string>();
	appendOrderedCandidates(ordered, seen, oppositeProviderFamilyReasoning);
	appendOrderedCandidates(ordered, seen, oppositeProviderFamily);
	appendOrderedCandidates(ordered, seen, oppositeProviderReasoning);
	appendOrderedCandidates(ordered, seen, oppositeProvider);
	appendOrderedCandidates(ordered, seen, sameProviderOppositeFamilyReasoning);
	appendOrderedCandidates(ordered, seen, sameProviderOppositeFamily);
	appendOrderedCandidates(ordered, seen, oppositeFamilyReasoning);
	appendOrderedCandidates(ordered, seen, sameProviderReasoning, currentProvider);
	appendOrderedCandidates(ordered, seen, sameProvider, currentProvider);
	appendOrderedCandidates(ordered, seen, allReasoning);
	appendOrderedCandidates(ordered, seen, available);

	return { ok: true, selection: ordered[0], ordered };
}

function normalizeThinkingLevel(value: unknown): ThinkingLevel | undefined {
	return typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel) ? (value as ThinkingLevel) : undefined;
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
	for (let index = requestedIndex + 1; index < THINKING_LEVELS.length; index += 1) {
		const level = THINKING_LEVELS[index];
		if (isThinkingLevelSupported(model, level)) return level;
	}
	for (let index = requestedIndex - 1; index >= 0; index -= 1) {
		const level = THINKING_LEVELS[index];
		if (isThinkingLevelSupported(model, level)) return level;
	}

	return "off";
}

function resolveThinkingLevel(
	model: PiModel | undefined,
	requestedThinkingLevel: ThinkingLevel | undefined,
): { requested: ThinkingLevel; effective: ThinkingLevel; clamped: boolean; note: string } {
	const requested = requestedThinkingLevel ?? (model?.reasoning ? DEFAULT_THINKING_LEVEL : "off");
	const effective = model ? clampThinkingLevel(model, requested) : requested;
	const clamped = effective !== requested;
	if (clamped) {
		return {
			requested,
			effective,
			clamped,
			note: `requested ${requested}; clamped to ${effective}`,
		};
	}
	if (requestedThinkingLevel) {
		return { requested, effective, clamped, note: `requested ${requested}` };
	}
	return {
		requested,
		effective,
		clamped,
		note: model?.reasoning ? `defaulted to ${effective}` : `defaulted to off for non-reasoning model`,
	};
}

function applyModelAttemptDetails(details: ReviewDetails, model: PiModel, thinking: ReturnType<typeof resolveThinkingLevel>): void {
	details.modelRef = `${model.provider}/${model.id}`;
	details.modelName = model.name;
	details.requestedThinkingLevel = thinking.requested;
	details.effectiveThinkingLevel = thinking.effective;
	details.thinkingLevelClamped = thinking.clamped || undefined;
	details.thinkingLevelNote = thinking.note;
}

function extractLastAssistantText(messages: unknown[]): string {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i] as { role?: string; content?: unknown };
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		const parts: string[] = [];
		for (const part of message.content) {
			if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
				const text = (part as { text?: unknown }).text;
				if (typeof text === "string") parts.push(text);
			}
		}
		if (parts.length > 0) return parts.join("").trim();
	}
	return "";
}

function isAbortLikeError(error: unknown): boolean {
	if (error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError") return true;
	const message = error instanceof Error ? error.message : String(error);
	return /aborted|cancelled|canceled/i.test(message);
}

function isInside(parent: string, child: string): boolean {
	const parentResolved = path.resolve(parent);
	const childResolved = path.resolve(child);
	return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${path.sep}`);
}

function resolveToolPath(cwd: string, rawPath: string | undefined): string {
	const input = rawPath?.trim() || ".";
	const normalized = input.startsWith("@") ? input.slice(1) : input;
	return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(cwd, normalized);
}

async function assertToolPathInsideCwd(cwd: string, rawPath: unknown, toolName: string): Promise<string | undefined> {
	if (rawPath !== undefined && typeof rawPath !== "string") return `${toolName} path must be a string.`;
	if (typeof rawPath === "string") {
		const normalizedInput = rawPath.trim().startsWith("@") ? rawPath.trim().slice(1) : rawPath.trim();
		if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(normalizedInput)) {
			return `${toolName} path must not traverse outside the local checkout.`;
		}
	}
	const root = await fs.realpath(cwd).catch(() => path.resolve(cwd));
	const resolved = resolveToolPath(cwd, rawPath);
	const realPath = await fs.realpath(resolved).catch(() => resolved);
	if (!isInside(root, realPath)) return `${toolName} is limited to the local checkout: ${realPath}`;
	return undefined;
}

function getUnsafePathPatternReason(value: unknown, label: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") return `${label} must be a string.`;
	if (path.isAbsolute(value)) return `${label} must be relative to the local checkout.`;
	if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(value)) return `${label} must not traverse outside the local checkout.`;
	return undefined;
}

function stripTokenQuotes(token: string): string {
	if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
		return token.slice(1, -1);
	}
	return token;
}

type ShellTokenizeResult = {
	tokens: string[];
	reason?: string;
};

function tokenizeShellCommand(command: string): ShellTokenizeResult {
	const tokens: string[] = [];
	let token = "";
	let tokenStarted = false;
	let inSingleQuote = false;
	let inDoubleQuote = false;

	const pushToken = () => {
		if (!tokenStarted) return;
		tokens.push(token);
		token = "";
		tokenStarted = false;
	};

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		const next = command[index + 1] ?? "";

		if (inSingleQuote) {
			if (char === "'") {
				inSingleQuote = false;
				continue;
			}
			token += char;
			tokenStarted = true;
			continue;
		}

		if (char === "\\") {
			return {
				tokens,
				reason: "Code Reviewer bash blocks shell escape sequences; pass plain git, gh, or pwd arguments without backslashes.",
			};
		}

		if (inDoubleQuote) {
			if (char === '"') {
				inDoubleQuote = false;
				continue;
			}
			if (char === "`" || char === "$") {
				return {
					tokens,
					reason:
						char === "`" || next === "("
							? "Code Reviewer bash blocks command substitution."
							: "Code Reviewer bash blocks shell expansion in double quotes.",
				};
			}
			token += char;
			tokenStarted = true;
			continue;
		}

		if (char === "\n" || char === "\r") {
			return {
				tokens,
				reason:
					"Code Reviewer bash allows one git, gh, or pwd invocation only; pipelines, shell control operators, and multiple commands are blocked.",
			};
		}
		if (/\s/.test(char)) {
			pushToken();
			continue;
		}
		if (char === "'") {
			inSingleQuote = true;
			tokenStarted = true;
			continue;
		}
		if (char === '"') {
			inDoubleQuote = true;
			tokenStarted = true;
			continue;
		}
		if (char === "`") return { tokens, reason: "Code Reviewer bash blocks command substitution." };
		if (char === "$") {
			return {
				tokens,
				reason:
					next === "'" || next === '"'
						? "Code Reviewer bash blocks ANSI-C and localized shell quotes."
						: next === "("
							? "Code Reviewer bash blocks command substitution."
							: "Code Reviewer bash blocks shell expansion.",
			};
		}
		if (/[;&|()]/.test(char)) {
			return {
				tokens,
				reason:
					"Code Reviewer bash allows one git, gh, or pwd invocation only; pipelines, shell control operators, and multiple commands are blocked.",
			};
		}
		if (char === ">" || char === "<") {
			return { tokens, reason: "Code Reviewer bash blocks shell redirection to keep inspection read-only." };
		}
		if (char === "{" || char === "}") return { tokens, reason: "Code Reviewer bash blocks shell brace expansion." };
		if (char === "*" || char === "?" || char === "[" || char === "]") {
			return { tokens, reason: "Code Reviewer bash blocks shell glob expansion." };
		}
		if (char === "~" && !tokenStarted) return { tokens, reason: "Code Reviewer bash blocks shell home-directory expansion." };

		token += char;
		tokenStarted = true;
	}

	if (inSingleQuote || inDoubleQuote) return { tokens, reason: "Code Reviewer bash blocks unterminated or malformed shell quoting." };
	pushToken();
	return { tokens };
}

function tokenizeSegment(segment: string): string[] {
	return tokenizeShellCommand(segment).tokens;
}

function shellQuoteToken(token: string): string {
	return `'${token.replace(/'/g, `'"'"'`)}'`;
}

function getExecutableName(token: string): string {
	return path.basename(token).toLowerCase();
}

function getShellSyntaxReason(command: string): string | undefined {
	return tokenizeShellCommand(command).reason;
}

function getUnsafeGitTokenPathReason(token: string): string | undefined {
	const valueParts = [token];
	const equalsIndex = token.indexOf("=");
	if (equalsIndex >= 0 && equalsIndex < token.length - 1) valueParts.push(token.slice(equalsIndex + 1));
	for (const value of valueParts) {
		const normalized = value.startsWith("@") ? value.slice(1) : value;
		if (normalized === "~" || normalized.startsWith("~/") || /^~[^/\\]*/.test(normalized)) {
			return "Code Reviewer bash git arguments must not use home-directory paths; use built-in read/grep/find/ls for local files.";
		}
		if (path.isAbsolute(normalized)) {
			return "Code Reviewer bash git arguments must not use absolute filesystem paths; use built-in read/grep/find/ls for local files.";
		}
		if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(normalized)) {
			return "Code Reviewer bash git arguments must not traverse outside the local checkout.";
		}
	}
	return undefined;
}

function getBlockedPwdReason(tokens: string[]): string | undefined {
	const args = tokens.slice(1);
	if (args.length === 0) return undefined;
	if (args.length === 1 && (args[0] === "-P" || args[0] === "-L")) return undefined;
	return "Code Reviewer bash allows pwd only with no arguments or -P/-L.";
}

function getGitSubcommand(tokens: string[]): { subcommand?: string; index: number; reason?: string } {
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];
		if (!token.startsWith("-")) break;
		if (token === "--git-dir" || token.startsWith("--git-dir=")) {
			return { index, reason: "Code Reviewer bash blocks git --git-dir because it can inspect or mutate outside the checkout." };
		}
		if (token === "--work-tree" || token.startsWith("--work-tree=")) {
			return { index, reason: "Code Reviewer bash blocks git --work-tree because it can inspect or mutate outside the checkout." };
		}
		if (token === "-C") {
			const gitCwd = tokens[index + 1];
			if (gitCwd !== ".") return { index, reason: "Code Reviewer bash only allows git -C .; run git from the local checkout." };
			index += 2;
			continue;
		}
		if (token.startsWith("-C")) {
			if (token !== "-C.") return { index, reason: "Code Reviewer bash only allows git -C .; run git from the local checkout." };
			index += 1;
			continue;
		}
		if (token === "--paginate" || token === "-p") {
			return { index, reason: "Code Reviewer bash blocks git pagination because pagers can execute local utilities." };
		}
		if (SAFE_GIT_GLOBAL_FLAGS.has(token)) {
			index += 1;
			continue;
		}
		return { index, reason: `Code Reviewer bash blocks git global option ${token}; use direct read-only git inspection commands from the checkout.` };
	}
	return { subcommand: tokens[index]?.toLowerCase(), index };
}

function isSafeGitBranchCommand(tokens: string[], subcommandIndex: number): boolean {
	const args = tokens.slice(subcommandIndex + 1);
	if (args.length === 0) return true;
	if (args.some((arg) => /^(?:-(?:d|D|m|M|c|C|f)|--(?:delete|move|copy|force|set-upstream-to|unset-upstream))$/.test(arg))) {
		return false;
	}
	return args.some((arg) => SAFE_GIT_BRANCH_FLAGS.has(arg) || arg.startsWith("--contains=") || arg.startsWith("--merged=") || arg.startsWith("--no-merged="));
}

function isSafeGitRemoteCommand(tokens: string[], subcommandIndex: number): boolean {
	const args = tokens.slice(subcommandIndex + 1);
	if (args.length === 0) return true;
	if (args.length === 1 && (args[0] === "-v" || args[0] === "--verbose")) return true;
	const remoteAction = args.find((arg) => !arg.startsWith("-"));
	if (remoteAction !== "get-url") return false;
	return true;
}

function isBlockedGitLocalFileOption(token: string, flag: string, blockedPrefixes: readonly string[]): boolean {
	if (!token.startsWith("--")) return false;
	const option = token.split("=", 1)[0]?.toLowerCase() ?? "";
	if (option === flag) return true;
	return blockedPrefixes.some((prefix) => option.startsWith(prefix));
}

function getUnsafeGitArgumentReason(tokens: string[], parsed: { subcommand?: string; index: number }): string | undefined {
	for (let index = 1; index < tokens.length; index += 1) {
		const token = tokens[index];
		const lowerToken = token.toLowerCase();
		if (token === "--no-index" || token.startsWith("--no-index=")) {
			return "Code Reviewer bash blocks git --no-index because it can inspect arbitrary filesystem paths outside the checkout.";
		}
		if (token === "--paginate" || token.startsWith("--paginate=")) {
			return "Code Reviewer bash blocks git --paginate because pagers can execute local utilities.";
		}
		if (token === "--open-files-in-pager" || token.startsWith("--open-files-in-pager=")) {
			return "Code Reviewer bash blocks git --open-files-in-pager because it can execute local utilities.";
		}
		if (token === "-O" || token.startsWith("-O")) {
			return "Code Reviewer bash blocks git -O because it can execute local utilities for some subcommands.";
		}
		if (token === "--ext-diff" || token.startsWith("--ext-diff=")) {
			return "Code Reviewer bash blocks git --ext-diff because it can execute external diff helpers.";
		}
		if (token === "--textconv" || token.startsWith("--textconv=")) {
			return "Code Reviewer bash blocks git --textconv because it can execute external text conversion filters.";
		}
		if (token === "--filters" || token.startsWith("--filters=")) {
			return "Code Reviewer bash blocks git --filters because it can execute clean/smudge filters from local config.";
		}
		if (token === "--show-signature" || lowerToken.startsWith("--show-signat")) {
			return "Code Reviewer bash blocks git signature verification flags because they can execute configured GPG helpers.";
		}
		if (token === "--help" || token.startsWith("--help=")) {
			return "Code Reviewer bash blocks git help output because it can execute configured help, man, or browser helpers.";
		}
		if (token.includes("%G") || /%\((?:[^)]*signature[^)]*)\)/i.test(token)) {
			return "Code Reviewer bash blocks git signature format atoms because they can execute configured GPG helpers.";
		}
		if (token === "--output" || token.startsWith("--output=")) {
			return "Code Reviewer bash blocks git output-writing flags.";
		}
		for (const { flag, blockedPrefixes, reason } of GIT_OPTIONS_REQUIRING_LOCAL_FILE) {
			if (isBlockedGitLocalFileOption(token, flag, blockedPrefixes)) return reason;
		}
		if (index > parsed.index) {
			for (const option of GIT_SUBCOMMAND_OPTIONS_REQUIRING_LOCAL_FILE[parsed.subcommand ?? ""] ?? []) {
				if (option.matches(token)) return option.reason;
			}
		}
		const pathReason = getUnsafeGitTokenPathReason(token);
		if (pathReason) return pathReason;
	}
	return undefined;
}

function buildSafeGitCommand(tokens: string[]): string {
	const parsed = getGitSubcommand(tokens);
	const prefix = ["git", "--no-pager", "--no-optional-locks", ...SAFE_GIT_CONFIG_OVERRIDES.flatMap((value) => ["-c", value])];
	const subcommand = parsed.subcommand;
	if (!subcommand) return prefix.map(shellQuoteToken).join(" ");
	const args = tokens.slice(parsed.index + 1);
	const injectedFlags = (GIT_SUBCOMMAND_SAFE_FLAGS[subcommand] ?? []).filter((flag) => !args.includes(flag));
	return [...prefix, subcommand, ...injectedFlags, ...args].map(shellQuoteToken).join(" ");
}

function getBlockedGitReason(tokens: string[]): string | undefined {
	if (getExecutableName(tokens[0] ?? "") !== "git") return undefined;
	const parsed = getGitSubcommand(tokens);
	if (parsed.reason) return parsed.reason;
	if (parsed.subcommand === "help") {
		return "Code Reviewer bash blocks git help because it can execute configured help, man, or browser helpers.";
	}
	const argumentReason = getUnsafeGitArgumentReason(tokens, parsed);
	if (argumentReason) return argumentReason;
	if (!parsed.subcommand) return undefined;
	if (parsed.subcommand === "branch") {
		if (!isSafeGitBranchCommand(tokens, parsed.index)) {
			return "Code Reviewer bash allows git branch only for read-only listing/show-current/contains/merged queries.";
		}
		return undefined;
	}
	if (parsed.subcommand === "remote") {
		if (!isSafeGitRemoteCommand(tokens, parsed.index)) {
			return "Code Reviewer bash allows git remote only for read-only list or get-url queries.";
		}
		return undefined;
	}
	if (!READ_ONLY_GIT_SUBCOMMANDS.has(parsed.subcommand)) {
		return `Code Reviewer bash blocks git ${parsed.subcommand}; only known read-only git subcommands are allowed.`;
	}
	return undefined;
}

function getGhCommand(tokens: string[]): { command?: string; subcommand?: string } {
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];
		if (!token.startsWith("-")) break;
		if (GH_GLOBAL_OPTIONS_WITH_VALUE.has(token)) {
			index += 2;
			continue;
		}
		index += 1;
	}
	return { command: tokens[index]?.toLowerCase(), subcommand: tokens[index + 1]?.toLowerCase() };
}

function normalizeFlagValue(value: string | undefined): string | undefined {
	return value ? stripTokenQuotes(value).trim() : undefined;
}

function getBlockedGhApiReason(tokens: string[]): string | undefined {
	const parsed = getGhCommand(tokens);
	if (parsed.command !== "api") return undefined;
	if (tokens.find((token) => token.toLowerCase() === "graphql")) {
		return "Code Reviewer bash blocks gh api graphql because it uses POST/body fields.";
	}
	for (let index = 1; index < tokens.length; index += 1) {
		const token = tokens[index];
		const lowerToken = token.toLowerCase();
		if (
			token === "-f" ||
			token === "-F" ||
			token === "--field" ||
			token === "--raw-field" ||
			token === "--input" ||
			lowerToken.startsWith("-f") ||
			lowerToken.startsWith("--field=") ||
			lowerToken.startsWith("--raw-field=") ||
			lowerToken.startsWith("--input=")
		) {
			return "Code Reviewer bash allows read-only gh api calls only; request fields and input files are blocked.";
		}
		if (token === "--cache" || lowerToken.startsWith("--cache=")) {
			return "Code Reviewer bash blocks gh api --cache because it writes local cache files.";
		}

		let method: string | undefined;
		if (lowerToken === "-x" || lowerToken === "--method") method = normalizeFlagValue(tokens[index + 1]);
		else if (lowerToken.startsWith("-x") && token.length > 2) method = normalizeFlagValue(token.slice(2).replace(/^=/, ""));
		else if (lowerToken.startsWith("--method=")) method = normalizeFlagValue(token.slice("--method=".length));
		if (method && MUTATING_GH_API_METHODS.has(method.toUpperCase())) {
			return "Code Reviewer bash allows read-only gh api calls only; mutating methods are blocked.";
		}
	}
	return undefined;
}

function isReadOnlyGhCommand(command: string | undefined, subcommand: string | undefined): boolean {
	if (!command) return true;
	if (command === "api") return true;
	if (command === "search") return true;
	if (command === "repo") return subcommand === "view" || subcommand === "list";
	if (command === "pr") return subcommand === "view" || subcommand === "list" || subcommand === "diff" || subcommand === "status" || subcommand === "checks";
	if (command === "issue") return subcommand === "view" || subcommand === "list" || subcommand === "status";
	if (command === "release") return subcommand === "view" || subcommand === "list";
	if (command === "run") return subcommand === "view" || subcommand === "list";
	if (command === "workflow") return subcommand === "view" || subcommand === "list";
	if (command === "label") return subcommand === "list";
	if (command === "milestone") return subcommand === "list";
	return false;
}

function getBlockedGhReason(command: string): string | undefined {
	const tokens = tokenizeSegment(command);
	if (getExecutableName(tokens[0] ?? "") !== "gh") return undefined;
	if (/\bgh\s+auth\s+(?:login|logout|refresh|setup-git|token)\b/i.test(command)) {
		return "Code Reviewer bash blocks gh auth commands and token inspection.";
	}
	if (
		tokens.some((token) => {
			const lowerToken = token.toLowerCase();
			return lowerToken === "--web" || lowerToken === "-w" || lowerToken.startsWith("--web=") || lowerToken.startsWith("-w=");
		})
	) {
		return "Code Reviewer bash blocks gh --web because it can launch external browser helpers.";
	}
	const apiReason = getBlockedGhApiReason(tokens);
	if (apiReason) return apiReason;
	if (/\bgh\s+(?:repo\s+(?:archive|clone|create|delete|edit|fork|rename|sync)|pr\s+(?:checkout|close|comment|create|edit|lock|merge|ready|reopen|review|unlock)|issue\s+(?:close|comment|create|delete|edit|lock|reopen|transfer|unlock)|release\s+(?:create|delete|edit|upload)|workflow\s+run|run\s+(?:cancel|delete|rerun)|gist\s+(?:create|delete|edit))\b/i.test(command)) {
		return "Code Reviewer bash blocks mutating gh commands.";
	}
	const parsed = getGhCommand(tokens);
	if (!isReadOnlyGhCommand(parsed.command, parsed.subcommand)) {
		return `Code Reviewer bash blocks gh ${[parsed.command, parsed.subcommand].filter(Boolean).join(" ")}; only known read-only gh commands are allowed.`;
	}
	return undefined;
}

function getBlockedBashReason(command: string): string | undefined {
	const trimmed = command.trim();
	if (!trimmed) return "Code Reviewer bash requires a non-empty command.";
	if (/`|\$\(/.test(trimmed)) return "Code Reviewer bash blocks command substitution.";
	const syntaxReason = getShellSyntaxReason(trimmed);
	if (syntaxReason) return syntaxReason;

	const tokens = tokenizeSegment(trimmed);
	if (tokens.length === 0) return "Code Reviewer bash requires a non-empty command.";
	if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) return "Code Reviewer bash blocks inline environment assignment.";
	if (/[\\/]/.test(tokens[0])) {
		return "Code Reviewer bash requires direct git, gh, or pwd invocation without path-qualified executables.";
	}

	const executable = getExecutableName(tokens[0]);
	if (!READ_ONLY_BASH_COMMANDS.has(executable)) {
		return `Code Reviewer bash blocks ${executable || "this command"}; use built-in read/grep/find/ls for local files or read-only git/gh inspection commands.`;
	}
	if (executable === "pwd") return getBlockedPwdReason(tokens);
	if (executable === "git") return getBlockedGitReason(tokens);
	if (executable === "gh") return getBlockedGhReason(trimmed);
	return undefined;
}

function createCodeReviewerRuntimeGuardExtension(options: { cwd: string; maxTurns: number }): ExtensionFactory {
	return (pi) => {
		let currentTurn = 0;

		pi.on("turn_start", async (event) => {
			currentTurn = event.turnIndex;
		});

		pi.on("tool_call", async (event) => {
			if (!READ_ONLY_TOOL_NAMES.has(event.toolName)) {
				return { block: true, reason: `code_reviewer exposes read-only tools only; ${event.toolName} is not allowed.` };
			}

			if (currentTurn >= options.maxTurns - 1) {
				return {
					block: true,
					reason: `Tool use is disabled on final code_reviewer turn ${options.maxTurns}/${options.maxTurns}. Answer now with the evidence already gathered.`,
				};
			}

			if (event.toolName === "read") {
				const reason = await assertToolPathInsideCwd(options.cwd, (event.input as { path?: unknown }).path, "read");
				if (reason) return { block: true, reason };
			}

			if (event.toolName === "grep" || event.toolName === "find" || event.toolName === "ls") {
				const reason = await assertToolPathInsideCwd(options.cwd, (event.input as { path?: unknown }).path, event.toolName);
				if (reason) return { block: true, reason };
				if (event.toolName === "grep") {
					const globReason = getUnsafePathPatternReason((event.input as { glob?: unknown }).glob, "grep glob");
					if (globReason) return { block: true, reason: globReason };
				}
				if (event.toolName === "find") {
					const patternReason = getUnsafePathPatternReason((event.input as { pattern?: unknown }).pattern, "find pattern");
					if (patternReason) return { block: true, reason: patternReason };
				}
			}

			if (event.toolName === "bash") {
				const input = event.input as { command?: unknown; timeout?: unknown };
				if (typeof input.timeout !== "number") input.timeout = DEFAULT_BASH_TIMEOUT_SECONDS;
				const command = typeof input.command === "string" ? input.command : "";
				const reason = getBlockedBashReason(command);
				if (reason) return { block: true, reason };
				const tokens = tokenizeSegment(command.trim());
				if (getExecutableName(tokens[0] ?? "") === "git") input.command = buildSafeGitCommand(tokens);
			}

			return undefined;
		});

		pi.on("tool_result", async (event) => ({
			content: [
				...(event.content ?? []),
				{
					type: "text",
					text: `\n\n[code_reviewer turn budget] turn ${Math.min(currentTurn + 1, options.maxTurns)}/${options.maxTurns}`,
				},
			],
		}));
	};
}

function buildSystemPrompt(options: { cwd: string; maxTurns: number; maxRunSeconds: number }): string {
	return `You are Code Reviewer, an isolated read-only review agent running inside The Last Harness. Review the proposed change against the stated task and the local checkout, then return a concise evidence-based review report.\n\nWorking directory: ${options.cwd}\nTurn budget: ${options.maxTurns} turns total, including your final answer.\nWall-clock budget: ${options.maxRunSeconds} seconds.\n\nAvailable tools are intended to be read-only: read, grep, find, ls, and bash. Use the built-in read, grep, find, and ls tools for local file inspection. Use bash only for a single read-only git, gh, or pwd invocation, such as git status/diff/show/log/blame, gh pr view/diff/list/status/checks, gh api GET calls, or pwd. A runtime guard blocks write/edit tools, shell pipelines/control operators, redirection, mutating git/gh commands, npm/publish commands, path traversal outside the checkout, and other filesystem mutation.\n\nReview priorities, in order:\n1. Ticket fit: does the change actually satisfy the requested task and stay in scope?\n2. Diff accuracy: do the files and edits match what the task claims changed?\n3. Correctness: could the change fail, regress behavior, mishandle errors, or break edge cases?\n4. Security and safety: look for unsafe command use, path handling issues, secret exposure, injection risks, destructive behavior, and policy violations.\n5. Simplicity and maintainability: call out unnecessary complexity, unclear behavior, or avoidable duplication.\n6. Tests and validation: check whether meaningful verification exists and whether gaps matter for this task.\n\nNon-negotiable constraints:\n- Never implement changes. Never edit, write, move, delete, format, install, commit, checkout, reset, clean, push, publish, or mutate GitHub.\n- Treat the supplied task and diff/context as claims to verify, not as facts. Cite file paths, line ranges, git diff/status output, or supplied diff excerpts as evidence.\n- Prefer the built-in file tools over bash when local file inspection is enough.\n- If evidence is missing, stale, or contradictory, say so plainly.\n- Keep the final review concise and actionable. Report the most important findings first; do not pad with non-findings.\n\nOutput format, exact order:\n## Verdict\nOne short paragraph with the overall review outcome.\n\n## Findings\nUse bullets ordered by severity. For each finding include: severity ('blocker', 'major', or 'minor'), a short title, evidence, and why it matters. If there are no findings, write '- none'.\n\n## Validation\nList the read-only checks you performed, or '- none'.\n\n## Scope check\nState whether the change appears to match the requested task and note any missing or extra scope.\n\n## Run details\nList concise run details such as key files inspected, notable git/gh commands, and any uncertainty that limited the review.`;
}

function buildUserPrompt(input: { task: string; diff?: string; context?: string }, cwd: string): string {
	return `Task to review:\n${input.task}\n\nLocal checkout: ${cwd}\n\nOptional diff or patch:\n${input.diff?.trim() ? input.diff : "(not provided)"}\n\nOptional caller context:\n${input.context?.trim() ? input.context : "(not provided)"}\n\nInspect only as much as needed to review the change against the task. Do not implement anything. Respond using the required review format.`;
}

function formatToolCall(call: ToolCall): string {
	const args = call.args && typeof call.args === "object" ? (call.args as Record<string, unknown>) : {};
	if (call.name === "read") {
		const readPath = typeof args.path === "string" ? args.path : "";
		const offset = typeof args.offset === "number" ? args.offset : undefined;
		const limit = typeof args.limit === "number" ? args.limit : undefined;
		const range = offset || limit ? `:${offset ?? 1}${limit ? `-${(offset ?? 1) + limit - 1}` : ""}` : "";
		return `read ${readPath}${range}`.trim();
	}
	if (call.name === "grep") {
		const pattern = typeof args.pattern === "string" ? args.pattern : "";
		const grepPath = typeof args.path === "string" ? args.path : ".";
		return `grep ${pattern.slice(0, 50)} ${grepPath}`.trim();
	}
	if (call.name === "find") {
		const pattern = typeof args.pattern === "string" ? args.pattern : "";
		const findPath = typeof args.path === "string" ? args.path : ".";
		return `find ${pattern.slice(0, 50)} ${findPath}`.trim();
	}
	if (call.name === "ls") return `ls ${typeof args.path === "string" ? args.path : "."}`.trim();
	if (call.name === "bash") {
		const command = typeof args.command === "string" ? args.command : "";
		return `bash ${command.slice(0, 120)}`.trim();
	}
	return call.name;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.round(ms / 100) / 10;
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round((seconds % 60) * 10) / 10;
	return `${minutes}m ${remainingSeconds}s`;
}

function appendRunDetails(report: string, details: ReviewDetails): string {
	const trimmed = report.trim();
	const toolSummary = details.toolCalls.length > 0 ? details.toolCalls.map(formatToolCall).join("; ") : "none";
	const duration = formatDuration((details.endedAt ?? Date.now()) - details.startedAt);
	const modelSummary = details.modelRef ? `model ${details.modelRef}` : "model unknown";
	const thinkingSummary = details.effectiveThinkingLevel
		? `thinking ${details.effectiveThinkingLevel}${details.thinkingLevelNote ? ` (${details.thinkingLevelNote})` : ""}`
		: "thinking unknown";
	const suffix = `\n\n---\nRun details: ${modelSummary}; ${thinkingSummary}; ${details.turns} turn(s); ${details.toolCalls.length} tool call(s); duration ${duration}; cwd ${details.cwd}; tools ${toolSummary}.`;
	if (!trimmed) return `## Verdict\nNo review output was produced.\n\n## Findings\n- major — Missing review output. Evidence: the isolated code_reviewer session returned no assistant text. Why it matters: the review could not be completed.\n\n## Validation\n- none\n\n## Scope check\nReview could not be completed.\n\n## Run details\n- ${suffix.trim()}`;
	return `${trimmed}${suffix}`;
}

export const __test__ = {
	assertToolPathInsideCwd,
	buildSystemPrompt,
	buildUserPrompt,
	createCodeReviewerRuntimeGuardExtension,
	buildSafeGitCommand,
	formatToolCall,
	getBlockedBashReason,
	normalizeThinkingLevel,
	resolveThinkingLevel,
	selectCodeReviewerModel,
};

export default function codeReviewerExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "code_reviewer",
		label: "Code reviewer",
		description:
			"Read-only isolated reviewer that checks a proposed change for ticket fit, diff accuracy, correctness, security, simplicity, and validation gaps without implementing anything.",
		promptSnippet:
			"Run an isolated read-only code review against the local checkout and optional diff; returns concise findings with evidence and run details.",
		promptGuidelines: [
			"Use code_reviewer when you want an independent read-only review of a proposed change or task implementation.",
			"Provide the requested task and any relevant diff/context. Do not use code_reviewer to implement or edit files.",
		],
		parameters: CodeReviewerParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const task = typeof params.task === "string" ? params.task.trim() : "";
			if (!task) throw new Error("Invalid parameters: expected task to be a non-empty string.");

			const input = {
				task,
				diff: typeof params.diff === "string" ? params.diff : undefined,
				context: typeof params.context === "string" ? params.context : undefined,
			};
			const cwd = path.resolve(ctx.cwd);
			const details: ReviewDetails = {
				status: "running",
				cwd,
				task,
				turns: 0,
				toolCalls: [],
				startedAt: Date.now(),
			};

			let lastContent = "(reviewing change...)";
			let session: AgentSession | undefined;
			let unsubscribe: (() => void) | undefined;
			let runTimeout: NodeJS.Timeout | undefined;
			let abortListenerAdded = false;
			let aborted = Boolean(signal?.aborted);

			const emit = () => {
				onUpdate?.({ content: [{ type: "text", text: lastContent }], details });
			};

			const abort = () => {
				aborted = true;
				details.status = "aborted";
				details.endedAt = Date.now();
				lastContent = "Aborted";
				emit();
				void session?.abort();
			};

			if (signal?.aborted) abort();
			if (signal && !signal.aborted) {
				signal.addEventListener("abort", abort);
				abortListenerAdded = true;
			}

			try {
				emit();

				const isolatedSettingsManager = SettingsManager.inMemory({});
				const resourceLoader = new DefaultResourceLoader({
					cwd,
					agentDir: getAgentDir(),
					settingsManager: isolatedSettingsManager,
					noExtensions: true,
					noSkills: true,
					noPromptTemplates: true,
					noThemes: true,
					noContextFiles: true,
					extensionFactories: [createCodeReviewerRuntimeGuardExtension({ cwd, maxTurns: MAX_TURNS })],
					systemPromptOverride: () => buildSystemPrompt({ cwd, maxTurns: MAX_TURNS, maxRunSeconds: Math.round(MAX_RUN_MS / 1000) }),
					appendSystemPromptOverride: () => [],
					skillsOverride: () => ({ skills: [], diagnostics: [] }),
					promptsOverride: () => ({ prompts: [], diagnostics: [] }),
					themesOverride: () => ({ themes: [], diagnostics: [] }),
					agentsFilesOverride: () => ({ agentsFiles: [] }),
				});

				await resourceLoader.reload();

				const modelSelection = await selectCodeReviewerModel(ctx);
				if (!modelSelection.ok) throw new Error(modelSelection.error);

				let answer = "";
				let lastAttemptError: string | undefined;
				const activeThinkingLevel = normalizeThinkingLevel(pi.getThinkingLevel());
				for (let index = 0; index < modelSelection.ordered.length; index += 1) {
					const candidate = modelSelection.ordered[index];
					const thinking = resolveThinkingLevel(candidate, activeThinkingLevel);
					applyModelAttemptDetails(details, candidate, thinking);
					let attemptSession: AgentSession | undefined;
					let attemptUnsubscribe: (() => void) | undefined;
					let succeeded = false;
					lastContent = "(reviewing change...)";
					try {
						const created = await createAgentSession({
							cwd,
							modelRegistry: ctx.modelRegistry,
							resourceLoader,
							settingsManager: isolatedSettingsManager,
							sessionManager: SessionManager.inMemory(cwd),
							model: candidate as CreateAgentSessionModel,
							thinkingLevel: thinking.effective,
							tools: ["read", "grep", "find", "ls", "bash"],
						});
						attemptSession = created.session;
						session = attemptSession;
						attemptUnsubscribe = attemptSession.subscribe((event) => {
							switch (event.type) {
								case "turn_end":
									details.turns += 1;
									emit();
									break;
								case "tool_execution_start":
									details.toolCalls.push({
										id: event.toolCallId,
										name: event.toolName,
										args: event.args,
										startedAt: Date.now(),
									});
									if (details.toolCalls.length > MAX_TOOL_CALLS_TO_KEEP) {
										details.toolCalls.splice(0, details.toolCalls.length - MAX_TOOL_CALLS_TO_KEEP);
									}
									emit();
									break;
								case "tool_execution_end": {
									const call = details.toolCalls.find((item) => item.id === event.toolCallId);
									if (call) {
										call.endedAt = Date.now();
										call.isError = event.isError;
									}
									emit();
									break;
								}
								case "message_update":
									if (event.assistantMessageEvent?.type === "text_delta") {
										lastContent += event.assistantMessageEvent.delta ?? "";
										emit();
									}
									break;
							}
						});
						unsubscribe = attemptUnsubscribe;

						if (!aborted) {
							const promptPromise = attemptSession.prompt(buildUserPrompt(input, cwd), { expandPromptTemplates: false });
							const timeoutPromise = new Promise<never>((_resolve, reject) => {
								runTimeout = setTimeout(() => {
									abort();
									reject(new Error(`code_reviewer timed out after ${Math.round(MAX_RUN_MS / 1000)} seconds.`));
								}, MAX_RUN_MS);
							});
							await Promise.race([promptPromise, timeoutPromise]);
						}

						answer = extractLastAssistantText(attemptSession.state.messages);
						succeeded = true;
						break;
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						lastAttemptError = message;
						const canFallBack = index < modelSelection.ordered.length - 1 && isModelAvailabilityError(message);
						if (!canFallBack) throw error;
					} finally {
						if (runTimeout) {
							clearTimeout(runTimeout);
							runTimeout = undefined;
						}
						if (attemptSession && !succeeded) {
							attemptUnsubscribe?.();
							if (unsubscribe === attemptUnsubscribe) unsubscribe = undefined;
							attemptSession.dispose();
							if (session === attemptSession) session = undefined;
						}
					}
				}
				if (!answer && !session && lastAttemptError) throw new Error(lastAttemptError);
				lastContent = answer || (aborted ? "Aborted" : "(no output)");
				details.status = aborted ? "aborted" : "done";
				details.endedAt = Date.now();
				const report = appendRunDetails(lastContent, details);
				lastContent = report;
				emit();
				return { content: [{ type: "text", text: report }], details };
			} catch (error) {
				const wasAbort = aborted || isAbortLikeError(error);
				const message = wasAbort ? "Aborted" : error instanceof Error ? error.message : String(error);
				details.status = wasAbort ? "aborted" : "error";
				details.error = wasAbort ? undefined : message;
				details.endedAt = Date.now();
				lastContent = appendRunDetails(`## Verdict\nReview failed.\n\n## Findings\n- major — Review execution failed. Evidence: ${message}. Why it matters: the requested read-only review did not complete.\n\n## Validation\n- none\n\n## Scope check\nReview could not be completed.\n\n## Run details\n- failure: ${message}`, details);
				emit();
				return { content: [{ type: "text", text: lastContent }], details };
			} finally {
				if (runTimeout) clearTimeout(runTimeout);
				if (signal && abortListenerAdded) signal.removeEventListener("abort", abort);
				unsubscribe?.();
				session?.dispose();
			}
		},
	});
}
