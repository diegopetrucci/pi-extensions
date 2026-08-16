import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	CONFIG_DIR_NAME,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const EXTENSION_ID = "fast";
const ANTHROPIC_PROVIDER_ID = "anthropic";
const ANTHROPIC_API_ID = "anthropic-messages";
const ANTHROPIC_FAST_SPEED = "fast";
const ANTHROPIC_FAST_BETA = "fast-mode-2026-02-01";
const CLAUDE_CODE_OAUTH_BETAS = ["claude-code-20250219", "oauth-2025-04-20"];
const FINE_GRAINED_TOOL_STREAMING_BETA = "fine-grained-tool-streaming-2025-05-14";
const INTERLEAVED_THINKING_BETA = "interleaved-thinking-2025-05-14";
const ANTHROPIC_SUPPORTED_MODELS = new Set(["claude-opus-4-8", "claude-opus-5"]);

const OPENAI_PROVIDER_ID = "openai-codex";
const OPENAI_API_ID = "openai-codex-responses";
const OPENAI_FAST_SERVICE_TIER = "priority";
const OPENAI_SUPPORTED_MODELS = new Set([
	"gpt-5.5",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
]);

const DEFAULT_CONFIG: FastConfig = {
	enabled: false,
	showStatus: true,
};

type FastOverride = "auto" | "on" | "off";
type FastProvider = "anthropic" | "openai";

type FastConfig = {
	/** Default Fast-mode state when there is no session override. */
	enabled: boolean;
	/** Show a compact `fast` status when Fast mode is active for the current model. */
	showStatus: boolean;
};

type SessionState = {
	config: FastConfig;
	override: FastOverride;
	lastInjectedAt?: number;
	lastInjectedModel?: string;
};

type ProjectConfigContext = {
	cwd: string;
	isProjectTrusted?: () => boolean;
};

type RecursivePartial<T> = {
	[P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : T[P];
};

type PayloadRecord = Record<string, unknown>;

type AnthropicHeaderCompat = {
	forceAdaptiveThinking?: boolean;
	supportsEagerToolInputStreaming?: boolean;
};

type Eligibility = {
	eligible: boolean;
	modelKey: string;
	provider?: FastProvider;
	reason?: string;
};

function readConfigFile(path: string): RecursivePartial<FastConfig> {
	if (!existsSync(path)) return {};

	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return isPayloadRecord(parsed) ? (parsed as RecursivePartial<FastConfig>) : {};
	} catch (error) {
		console.error(`Warning: Could not parse ${path}: ${error}`);
		return {};
	}
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function mergeConfig(base: FastConfig, overrides: RecursivePartial<FastConfig>): FastConfig {
	return {
		enabled: normalizeBoolean(overrides.enabled, base.enabled),
		showStatus: normalizeBoolean(overrides.showStatus, base.showStatus),
	};
}

function canReadProjectConfig(ctx: ProjectConfigContext): boolean {
	return typeof ctx.isProjectTrusted === "function" && ctx.isProjectTrusted();
}

function findProjectConfigPath(cwd: string): string {
	let current = cwd;
	while (true) {
		const candidate = join(current, CONFIG_DIR_NAME, "fast.json");
		if (existsSync(candidate)) return candidate;

		const parent = dirname(current);
		if (parent === current) return join(cwd, CONFIG_DIR_NAME, "fast.json");
		current = parent;
	}
}

function loadConfig(ctx: ProjectConfigContext): FastConfig {
	const globalConfig = readConfigFile(join(getAgentDir(), "extensions", "fast.json"));
	const projectConfig = canReadProjectConfig(ctx) ? readConfigFile(findProjectConfigPath(ctx.cwd)) : {};
	return mergeConfig(mergeConfig(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function isPayloadRecord(payload: unknown): payload is PayloadRecord {
	return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}

function modelKey(ctx: ExtensionContext): string {
	const model = ctx.model;
	return model ? `${model.provider}/${model.id}` : "no-model";
}

function isFastEnabled(state: SessionState): boolean {
	if (state.override === "on") return true;
	if (state.override === "off") return false;
	return state.config.enabled;
}

function describeMode(state: SessionState): string {
	if (state.override === "on") return "on (session override)";
	if (state.override === "off") return "off (session override)";
	return state.config.enabled ? "on (config default)" : "off (config default)";
}

function getEligibility(ctx: ExtensionContext): Eligibility {
	const model = ctx.model;
	if (!model) {
		return { eligible: false, modelKey: "no-model", reason: "no model is selected" };
	}

	const key = `${model.provider}/${model.id}`;
	if (model.provider === ANTHROPIC_PROVIDER_ID) {
		if (model.api !== ANTHROPIC_API_ID) {
			return {
				eligible: false,
				modelKey: key,
				reason: `current API is ${model.api}, not ${ANTHROPIC_API_ID}`,
			};
		}

		if (!ANTHROPIC_SUPPORTED_MODELS.has(model.id)) {
			return {
				eligible: false,
				modelKey: key,
				reason: "Fast mode is only enabled for Claude Opus 4.8 and Claude Opus 5",
			};
		}

		return { eligible: true, modelKey: key, provider: "anthropic" };
	}

	if (model.provider === OPENAI_PROVIDER_ID) {
		if (model.api !== OPENAI_API_ID) {
			return {
				eligible: false,
				modelKey: key,
				reason: `current API is ${model.api}, not ${OPENAI_API_ID}`,
			};
		}

		if (!OPENAI_SUPPORTED_MODELS.has(model.id)) {
			return {
				eligible: false,
				modelKey: key,
				reason: "Fast mode is not enabled for this OpenAI Codex model",
			};
		}

		if (!ctx.modelRegistry.isUsingOAuth(model)) {
			return {
				eligible: false,
				modelKey: key,
				reason: "ChatGPT OAuth auth is required; API-key auth is intentionally not used",
			};
		}

		return { eligible: true, modelKey: key, provider: "openai" };
	}

	return {
		eligible: false,
		modelKey: key,
		reason: `current provider ${model.provider} does not support this extension's Fast mode`,
	};
}

function updateStatus(ctx: ExtensionContext, state: SessionState): void {
	if (!ctx.hasUI) return;
	if (!state.config.showStatus) {
		ctx.ui.setStatus(EXTENSION_ID, undefined);
		return;
	}

	const eligibility = getEligibility(ctx);
	ctx.ui.setStatus(
		EXTENSION_ID,
		isFastEnabled(state) && eligibility.eligible ? "fast" : undefined,
	);
}

function getStatusMessage(ctx: ExtensionContext, state: SessionState): string {
	const enabled = isFastEnabled(state);
	const eligibility = getEligibility(ctx);
	const active = enabled && eligibility.eligible;
	const injected = state.lastInjectedAt
		? ` Last injected for ${state.lastInjectedModel ?? "unknown model"} ${Math.max(0, Math.round((Date.now() - state.lastInjectedAt) / 1000))}s ago.`
		: "";

	if (active) {
		const wireSetting =
			eligibility.provider === "anthropic"
				? `speed=${ANTHROPIC_FAST_SPEED}`
				: `service_tier=${OPENAI_FAST_SERVICE_TIER}`;
		return `Fast mode is ${describeMode(state)} and active for ${eligibility.modelKey}; requests will use ${wireSetting}.${injected}`;
	}

	if (enabled) {
		return `Fast mode is ${describeMode(state)}, but inactive for ${eligibility.modelKey}: ${eligibility.reason}.${injected}`;
	}

	return `Fast mode is ${describeMode(state)}. Current model: ${eligibility.modelKey}.${injected}`;
}

function splitBetaHeader(value: string | null | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

async function isAnthropicOAuth(ctx: ExtensionContext): Promise<boolean> {
	try {
		const resolution = await ctx.modelRegistry.getProviderAuth(ANTHROPIC_PROVIDER_ID);
		const apiKey = resolution?.auth.apiKey;
		if (typeof apiKey === "string") return apiKey.includes("sk-ant-oat");
	} catch {
		// Fall back to the synchronous registry snapshot below.
	}

	return ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
}

function getAnthropicProviderBetas(ctx: ExtensionContext, hasActiveTools: boolean): string[] {
	const model = ctx.model;
	if (!model) return [];
	const compat = model.compat as AnthropicHeaderCompat | undefined;

	const betas: string[] = [];
	if (hasActiveTools && compat?.supportsEagerToolInputStreaming === false) {
		betas.push(FINE_GRAINED_TOOL_STREAMING_BETA);
	}
	if (compat?.forceAdaptiveThinking !== true) {
		betas.push(INTERLEAVED_THINKING_BETA);
	}
	return betas;
}

async function injectAnthropicFastHeader(
	headers: Record<string, string | null>,
	ctx: ExtensionContext,
	state: SessionState,
	hasActiveTools: boolean,
): Promise<void> {
	if (!isFastEnabled(state)) return;
	const eligibility = getEligibility(ctx);
	if (!eligibility.eligible || eligibility.provider !== "anthropic") return;

	const matchingKeys = Object.keys(headers).filter((name) => name.toLowerCase() === "anthropic-beta");
	const existing = matchingKeys.flatMap((name) => splitBetaHeader(headers[name]));
	const matchingModelEntries = Object.entries(ctx.model?.headers ?? {}).filter(
		([name]) => name.toLowerCase() === "anthropic-beta",
	);
	const modelBetas = matchingModelEntries.flatMap(([, value]) => splitBetaHeader(value));
	const providerBetas = getAnthropicProviderBetas(ctx, hasActiveTools);
	const oauthBetas = (await isAnthropicOAuth(ctx)) ? CLAUDE_CODE_OAUTH_BETAS : [];
	const next = Array.from(
		new Set([...modelBetas, ...existing, ...oauthBetas, ...providerBetas, ANTHROPIC_FAST_BETA]),
	);

	for (const key of matchingKeys) delete headers[key];
	const outputKey = matchingModelEntries.at(-1)?.[0] ?? "anthropic-beta";
	headers[outputKey] = next.join(",");
}

function injectFastPayload(
	payload: unknown,
	ctx: ExtensionContext,
	state: SessionState,
): PayloadRecord | undefined {
	if (!isFastEnabled(state)) return undefined;
	const eligibility = getEligibility(ctx);
	if (!eligibility.eligible || !eligibility.provider) return undefined;
	if (!isPayloadRecord(payload)) return undefined;
	if (payload.model !== ctx.model?.id) return undefined;

	if (eligibility.provider === "anthropic") {
		if ("speed" in payload) return undefined;
		state.lastInjectedAt = Date.now();
		state.lastInjectedModel = eligibility.modelKey;
		return { ...payload, speed: ANTHROPIC_FAST_SPEED };
	}

	if ("service_tier" in payload) return undefined;
	state.lastInjectedAt = Date.now();
	state.lastInjectedModel = eligibility.modelKey;
	return { ...payload, service_tier: OPENAI_FAST_SERVICE_TIER };
}

export default function fastExtension(pi: ExtensionAPI) {
	const states = new WeakMap<object, SessionState>();

	function getState(ctx: ExtensionContext): SessionState {
		let state = states.get(ctx.sessionManager);
		if (!state) {
			state = {
				config: loadConfig(ctx),
				override: "auto",
			};
			states.set(ctx.sessionManager, state);
		}
		return state;
	}

	pi.on("session_start", (_event, ctx) => {
		const state: SessionState = {
			config: loadConfig(ctx),
			override: "auto",
		};
		states.set(ctx.sessionManager, state);
		updateStatus(ctx, state);
	});

	pi.on("model_select", (_event, ctx) => {
		updateStatus(ctx, getState(ctx));
	});

	pi.on("before_provider_headers", async (event, ctx) => {
		const hasActiveTools = typeof pi.getActiveTools === "function" && pi.getActiveTools().length > 0;
		await injectAnthropicFastHeader(event.headers, ctx, getState(ctx), hasActiveTools);
	});

	pi.on("before_provider_request", (event, ctx) => {
		const state = getState(ctx);
		const nextPayload = injectFastPayload(event.payload, ctx, state);
		updateStatus(ctx, state);
		return nextPayload;
	});

	pi.registerCommand("fast", {
		description: "Toggle Fast mode for supported OpenAI Codex and Anthropic Claude models",
		getArgumentCompletions: () => null,
		handler: async (args, ctx) => {
			const state = getState(ctx);
			const action = args.trim();

			if (!action) {
				state.override = isFastEnabled(state) ? "off" : "on";
				updateStatus(ctx, state);
				ctx.ui.notify(getStatusMessage(ctx, state), "info");
				return;
			}

			ctx.ui.notify("Usage: /fast", "warning");
		},
	});
}
