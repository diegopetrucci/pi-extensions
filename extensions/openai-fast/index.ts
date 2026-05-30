import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const EXTENSION_ID = "openai-fast";
const PROVIDER_ID = "openai-codex";
const API_ID = "openai-codex-responses";
const FAST_SERVICE_TIER = "priority";
const SUPPORTED_MODELS = new Set(["gpt-5.4", "gpt-5.5"]);
const COMMANDS = ["on", "off"];

const DEFAULT_CONFIG: OpenAIFastConfig = {
	enabled: false,
	showStatus: true,
};

type FastOverride = "auto" | "on" | "off";

type OpenAIFastConfig = {
	/** Default Fast-mode state when there is no session override. */
	enabled: boolean;
	/** Show a compact `fast` status when Fast mode is active for the current model. */
	showStatus: boolean;
};

type SessionState = {
	config: OpenAIFastConfig;
	override: FastOverride;
	lastInjectedAt?: number;
	lastInjectedModel?: string;
};

type RecursivePartial<T> = {
	[P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : T[P];
};

type PayloadRecord = Record<string, unknown>;

type Eligibility = {
	eligible: boolean;
	modelKey: string;
	reason?: string;
};

function readConfigFile(path: string): RecursivePartial<OpenAIFastConfig> {
	if (!existsSync(path)) return {};

	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return isPayloadRecord(parsed) ? (parsed as RecursivePartial<OpenAIFastConfig>) : {};
	} catch (error) {
		console.error(`Warning: Could not parse ${path}: ${error}`);
		return {};
	}
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function mergeConfig(
	base: OpenAIFastConfig,
	overrides: RecursivePartial<OpenAIFastConfig>,
): OpenAIFastConfig {
	return {
		enabled: normalizeBoolean(overrides.enabled, base.enabled),
		showStatus: normalizeBoolean(overrides.showStatus, base.showStatus),
	};
}

function findProjectConfigPath(cwd: string): string {
	let current = cwd;
	while (true) {
		const candidate = join(current, ".pi", "openai-fast.json");
		if (existsSync(candidate)) return candidate;

		const parent = dirname(current);
		if (parent === current) return join(cwd, ".pi", "openai-fast.json");
		current = parent;
	}
}

function loadConfig(cwd: string): OpenAIFastConfig {
	const globalConfig = readConfigFile(join(getAgentDir(), "extensions", "openai-fast.json"));
	const projectConfig = readConfigFile(findProjectConfigPath(cwd));
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
	if (model.provider !== PROVIDER_ID) {
		return {
			eligible: false,
			modelKey: key,
			reason: `current provider is ${model.provider}, not ${PROVIDER_ID}`,
		};
	}

	if (model.api !== API_ID) {
		return {
			eligible: false,
			modelKey: key,
			reason: `current API is ${model.api}, not ${API_ID}`,
		};
	}

	if (!SUPPORTED_MODELS.has(model.id)) {
		return {
			eligible: false,
			modelKey: key,
			reason: "Fast mode is only enabled for gpt-5.4 and gpt-5.5",
		};
	}

	if (!ctx.modelRegistry.isUsingOAuth(model)) {
		return {
			eligible: false,
			modelKey: key,
			reason: "ChatGPT OAuth auth is required; API-key auth is intentionally not used",
		};
	}

	return { eligible: true, modelKey: key };
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
		return `OpenAI Fast mode is ${describeMode(state)} and active for ${eligibility.modelKey}; requests will use service_tier=${FAST_SERVICE_TIER}.${injected}`;
	}

	if (enabled) {
		return `OpenAI Fast mode is ${describeMode(state)}, but inactive for ${eligibility.modelKey}: ${eligibility.reason}.${injected}`;
	}

	return `OpenAI Fast mode is ${describeMode(state)}. Current model: ${eligibility.modelKey}.${injected}`;
}

function injectFastServiceTier(
	payload: unknown,
	ctx: ExtensionContext,
	state: SessionState,
): PayloadRecord | undefined {
	if (!isFastEnabled(state)) return undefined;
	if (!getEligibility(ctx).eligible) return undefined;
	if (!isPayloadRecord(payload)) return undefined;
	if (payload.model !== ctx.model?.id) return undefined;
	if ("service_tier" in payload) return undefined;

	state.lastInjectedAt = Date.now();
	state.lastInjectedModel = modelKey(ctx);
	return {
		...payload,
		service_tier: FAST_SERVICE_TIER,
	};
}

export default function openAIFastExtension(pi: ExtensionAPI) {
	const states = new WeakMap<object, SessionState>();

	function getState(ctx: ExtensionContext): SessionState {
		let state = states.get(ctx.sessionManager);
		if (!state) {
			state = {
				config: loadConfig(ctx.cwd),
				override: "auto",
			};
			states.set(ctx.sessionManager, state);
		}
		return state;
	}

	pi.on("session_start", (_event, ctx) => {
		const state: SessionState = {
			config: loadConfig(ctx.cwd),
			override: "auto",
		};
		states.set(ctx.sessionManager, state);
		updateStatus(ctx, state);
	});

	pi.on("model_select", (_event, ctx) => {
		updateStatus(ctx, getState(ctx));
	});

	pi.on("before_provider_request", (event, ctx) => {
		const state = getState(ctx);
		const nextPayload = injectFastServiceTier(event.payload, ctx, state);
		updateStatus(ctx, state);
		return nextPayload;
	});

	pi.registerCommand("fast", {
		description: "Set OpenAI Codex Fast mode on or off for ChatGPT-auth GPT-5.4/GPT-5.5",
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.trim().toLowerCase();
			const matches = COMMANDS.filter((command) => command.startsWith(normalized));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const state = getState(ctx);
			let action = args.trim().toLowerCase();

			if (!action) {
				if (!ctx.hasUI) {
					ctx.ui.notify("Usage: /fast on | off", "warning");
					return;
				} else {
					const selection = await ctx.ui.select("OpenAI Fast mode", COMMANDS);
					if (!selection) return;
					action = selection;
				}
			}

			if (action === "on" || action === "enable") {
				state.override = "on";
				updateStatus(ctx, state);
				ctx.ui.notify(getStatusMessage(ctx, state), "info");
				return;
			}

			if (action === "off" || action === "disable") {
				state.override = "off";
				updateStatus(ctx, state);
				ctx.ui.notify(getStatusMessage(ctx, state), "info");
				return;
			}

			ctx.ui.notify("Usage: /fast on | off", "warning");
		},
	});
}
