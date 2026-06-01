import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const EXTENSION_ID = "claude-fast";
const PROVIDER_ID = "anthropic";
const API_ID = "anthropic-messages";
const FAST_SPEED = "fast";
const FAST_BETA = "fast-mode-2026-02-01";
const CLAUDE_CODE_OAUTH_BETAS = ["claude-code-20250219", "oauth-2025-04-20"];
const SUPPORTED_MODELS = new Set(["claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8"]);

const DEFAULT_CONFIG: ClaudeFastConfig = {
	enabled: false,
	showStatus: true,
};

type FastOverride = "auto" | "on" | "off";

type ClaudeFastConfig = {
	/** Default Fast-mode state when there is no session override. */
	enabled: boolean;
	/** Show a compact `fast` status when Fast mode is active for the current model. */
	showStatus: boolean;
};

type SessionState = {
	config: ClaudeFastConfig;
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

type HeaderModel = {
	headers?: Record<string, string>;
};

function readConfigFile(path: string): RecursivePartial<ClaudeFastConfig> {
	if (!existsSync(path)) return {};

	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return isPayloadRecord(parsed) ? (parsed as RecursivePartial<ClaudeFastConfig>) : {};
	} catch (error) {
		console.error(`Warning: Could not parse ${path}: ${error}`);
		return {};
	}
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function mergeConfig(
	base: ClaudeFastConfig,
	overrides: RecursivePartial<ClaudeFastConfig>,
): ClaudeFastConfig {
	return {
		enabled: normalizeBoolean(overrides.enabled, base.enabled),
		showStatus: normalizeBoolean(overrides.showStatus, base.showStatus),
	};
}

function findProjectConfigPath(cwd: string): string {
	let current = cwd;
	while (true) {
		const candidate = join(current, ".pi", "claude-fast.json");
		if (existsSync(candidate)) return candidate;

		const parent = dirname(current);
		if (parent === current) return join(cwd, ".pi", "claude-fast.json");
		current = parent;
	}
}

function loadConfig(cwd: string): ClaudeFastConfig {
	const globalConfig = readConfigFile(join(getAgentDir(), "extensions", "claude-fast.json"));
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
			reason: "Fast mode is only enabled for Claude Opus 4.6, 4.7, and 4.8",
		};
	}

	return { eligible: true, modelKey: key };
}

function splitBetaHeader(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function syncModelBetaHeader(ctx: ExtensionContext, state: SessionState): void {
	const model = ctx.model as (typeof ctx.model & HeaderModel) | undefined;
	if (!model || model.provider !== PROVIDER_ID || model.api !== API_ID) return;

	const shouldEnable = isFastEnabled(state) && getEligibility(ctx).eligible;
	const headers = { ...(model.headers ?? {}) };
	const existing = splitBetaHeader(headers["anthropic-beta"] ?? headers["Anthropic-Beta"]);
	const requiredBase = ctx.modelRegistry.isUsingOAuth(model) ? CLAUDE_CODE_OAUTH_BETAS : [];
	const next = shouldEnable
		? Array.from(new Set([...existing, ...requiredBase, FAST_BETA]))
		: existing.filter((beta) => beta !== FAST_BETA && !CLAUDE_CODE_OAUTH_BETAS.includes(beta));

	delete headers["Anthropic-Beta"];
	if (next.length > 0) headers["anthropic-beta"] = next.join(",");
	else delete headers["anthropic-beta"];
	model.headers = headers;
}

function updateStatus(ctx: ExtensionContext, state: SessionState): void {
	syncModelBetaHeader(ctx, state);
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
		return `Claude Fast mode is ${describeMode(state)} and active for ${eligibility.modelKey}; requests will use speed=${FAST_SPEED}.${injected}`;
	}

	if (enabled) {
		return `Claude Fast mode is ${describeMode(state)}, but inactive for ${eligibility.modelKey}: ${eligibility.reason}.${injected}`;
	}

	return `Claude Fast mode is ${describeMode(state)}. Current model: ${eligibility.modelKey}.${injected}`;
}

function injectFastSpeed(
	payload: unknown,
	ctx: ExtensionContext,
	state: SessionState,
): PayloadRecord | undefined {
	if (!isFastEnabled(state)) return undefined;
	if (!getEligibility(ctx).eligible) return undefined;
	if (!isPayloadRecord(payload)) return undefined;
	if (payload.model !== ctx.model?.id) return undefined;
	if ("speed" in payload) return undefined;

	state.lastInjectedAt = Date.now();
	state.lastInjectedModel = modelKey(ctx);
	return {
		...payload,
		speed: FAST_SPEED,
	};
}

export default function claudeFastExtension(pi: ExtensionAPI) {
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
		const nextPayload = injectFastSpeed(event.payload, ctx, state);
		updateStatus(ctx, state);
		return nextPayload;
	});

	pi.registerCommand("claude-fast", {
		description: "Toggle Claude Fast mode for supported Anthropic Claude Opus models",
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

			ctx.ui.notify("Usage: /claude-fast", "warning");
		},
	});
}
