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
const ANTHROPIC_SUPPORTED_MODELS = new Set(["claude-opus-4-8", "claude-opus-5", "claude-opus-5-5"]);

const OPENAI_PROVIDER_ID = "openai-codex";
const OPENAI_API_ID = "openai-codex-responses";
const OPENAI_FAST_SERVICE_TIER = "priority";
const OPENAI_SUPPORTED_MODELS = new Set([
  "gpt-5.5",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-6-astra",
  "gpt-6.1-sol",
  "gpt-6-sol",
  "gpt-6-luna",
]);
const OPENAI_API_PROVIDER_ID = "openai";
const OPENAI_API_IDS = new Set(["openai-responses", "openai-completions"]);
const OPENAI_API_FAST_SERVICE_TIER = "fast";
const OPENAI_API_SUPPORTED_MODELS = new Set([
  "gpt-6.1-sol",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
]);
const OPENAI_ULTRAFAST_MODEL = "gpt-6-astra";
const OPENAI_ULTRAFAST_API_ID = "openai-responses";
const OPENAI_ULTRAFAST_SERVICE_TIER = "ultrafast";
const OPENAI_CANONICAL_BASE_URL = "https://api.openai.com/v1";

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
  /** Session-only Ultrafast selection; never loaded from configuration. */
  ultrafast: boolean;
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
  serviceTier?: string;
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
  const projectConfig = canReadProjectConfig(ctx)
    ? readConfigFile(findProjectConfigPath(ctx.cwd))
    : {};
  return mergeConfig(mergeConfig(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function isPayloadRecord(payload: unknown): payload is PayloadRecord {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
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
        reason: "Fast mode is only enabled for Claude Opus 4.8, Claude Opus 5, and Claude Opus 5.5",
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

    return {
      eligible: true,
      modelKey: key,
      provider: "openai",
      serviceTier: OPENAI_FAST_SERVICE_TIER,
    };
  }

  if (model.provider === OPENAI_API_PROVIDER_ID) {
    if (!OPENAI_API_IDS.has(model.api)) {
      return {
        eligible: false,
        modelKey: key,
        reason: `current API is ${model.api}, not openai-responses or openai-completions`,
      };
    }

    if (!OPENAI_API_SUPPORTED_MODELS.has(model.id)) {
      return {
        eligible: false,
        modelKey: key,
        reason:
          "Fast mode is only enabled for GPT-6.1 Sol, GPT-6 Astra, GPT-6 Sol, and GPT-6 Luna on direct OpenAI APIs",
      };
    }

    return {
      eligible: true,
      modelKey: key,
      provider: "openai",
      serviceTier: OPENAI_API_FAST_SERVICE_TIER,
    };
  }

  return {
    eligible: false,
    modelKey: key,
    reason: `current provider ${model.provider} does not support this extension's Fast mode`,
  };
}

function isCanonicalOpenAIEndpoint(baseUrl: unknown): boolean {
  return baseUrl === OPENAI_CANONICAL_BASE_URL || baseUrl === `${OPENAI_CANONICAL_BASE_URL}/`;
}

function getUltrafastEligibility(ctx: ExtensionContext): Eligibility {
  const model = ctx.model;
  if (!model) {
    return { eligible: false, modelKey: "no-model", reason: "no model is selected" };
  }

  const key = `${model.provider}/${model.id}`;
  if (model.provider !== OPENAI_API_PROVIDER_ID) {
    return {
      eligible: false,
      modelKey: key,
      reason: "Ultrafast mode requires the direct OpenAI provider",
    };
  }

  if (model.api !== OPENAI_ULTRAFAST_API_ID) {
    return {
      eligible: false,
      modelKey: key,
      reason: `Ultrafast mode requires API ${OPENAI_ULTRAFAST_API_ID}`,
    };
  }

  if (model.id !== OPENAI_ULTRAFAST_MODEL) {
    return {
      eligible: false,
      modelKey: key,
      reason: `Ultrafast mode is only enabled for ${OPENAI_ULTRAFAST_MODEL}`,
    };
  }

  if (!isCanonicalOpenAIEndpoint(model.baseUrl)) {
    return {
      eligible: false,
      modelKey: key,
      reason: `Ultrafast mode requires the canonical endpoint ${OPENAI_CANONICAL_BASE_URL}`,
    };
  }

  try {
    if (ctx.modelRegistry.isUsingOAuth(model)) {
      return {
        eligible: false,
        modelKey: key,
        reason: "Ultrafast mode requires direct OpenAI API-key auth; OAuth is unsupported",
      };
    }
  } catch {
    return {
      eligible: false,
      modelKey: key,
      reason: "Ultrafast mode requires direct OpenAI API-key auth; auth could not be verified",
    };
  }

  return {
    eligible: true,
    modelKey: key,
    provider: "openai",
    serviceTier: OPENAI_ULTRAFAST_SERVICE_TIER,
  };
}

function updateStatus(ctx: ExtensionContext, state: SessionState): void {
  if (!ctx.hasUI) return;
  if (!state.config.showStatus) {
    ctx.ui.setStatus(EXTENSION_ID, undefined);
    return;
  }

  if (state.ultrafast) {
    const eligibility = getUltrafastEligibility(ctx);
    ctx.ui.setStatus(EXTENSION_ID, eligibility.eligible ? "ultrafast" : undefined);
    return;
  }

  const eligibility = getEligibility(ctx);
  ctx.ui.setStatus(EXTENSION_ID, isFastEnabled(state) && eligibility.eligible ? "fast" : undefined);
}

function getStatusMessage(ctx: ExtensionContext, state: SessionState): string {
  const injected = state.lastInjectedAt
    ? ` Last injected for ${state.lastInjectedModel ?? "unknown model"} ${Math.max(0, Math.round((Date.now() - state.lastInjectedAt) / 1000))}s ago.`
    : "";

  if (state.ultrafast) {
    const eligibility = getUltrafastEligibility(ctx);
    if (eligibility.eligible) {
      return `Ultrafast mode is on (session only) and eligible for ${eligibility.modelKey}; requested service_tier=${OPENAI_ULTRAFAST_SERVICE_TIER}. Actual API pricing is 6x Standard, but Pi's current cost display omits this premium.${injected}`;
    }
    return `Ultrafast mode is on (session only), but not eligible for ${eligibility.modelKey}: ${eligibility.reason}.${injected}`;
  }

  const enabled = isFastEnabled(state);
  const eligibility = getEligibility(ctx);
  const active = enabled && eligibility.eligible;

  if (active) {
    const wireSetting =
      eligibility.provider === "anthropic"
        ? `speed=${ANTHROPIC_FAST_SPEED}`
        : `service_tier=${eligibility.serviceTier}`;
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
  if (state.ultrafast || !isFastEnabled(state)) return;
  const eligibility = getEligibility(ctx);
  if (!eligibility.eligible || eligibility.provider !== "anthropic") return;

  const matchingKeys = Object.keys(headers).filter(
    (name) => name.toLowerCase() === "anthropic-beta",
  );
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

function injectUltrafastPayload(
  payload: unknown,
  ctx: ExtensionContext,
  state: SessionState,
): PayloadRecord | undefined {
  if (!state.ultrafast) return undefined;
  const eligibility = getUltrafastEligibility(ctx);
  if (!eligibility.eligible || !eligibility.serviceTier) return undefined;
  if (!isPayloadRecord(payload)) return undefined;
  if (payload.model !== ctx.model?.id) return undefined;
  if ("service_tier" in payload) return undefined;

  state.lastInjectedAt = Date.now();
  state.lastInjectedModel = eligibility.modelKey;
  return { ...payload, service_tier: eligibility.serviceTier };
}

function injectFastPayload(
  payload: unknown,
  ctx: ExtensionContext,
  state: SessionState,
): PayloadRecord | undefined {
  if (state.ultrafast || !isFastEnabled(state)) return undefined;
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
  if (!eligibility.serviceTier) return undefined;
  state.lastInjectedAt = Date.now();
  state.lastInjectedModel = eligibility.modelKey;
  return { ...payload, service_tier: eligibility.serviceTier };
}

function disableUltrafast(ctx: ExtensionContext, state: SessionState, reason?: string): void {
  state.ultrafast = false;
  // Do not fall back to ordinary Fast when a selected Ultrafast model becomes ineligible.
  state.override = "off";
  updateStatus(ctx, state);
  if (reason) {
    ctx.ui.notify(
      `Ultrafast mode disabled: ${reason}. It remains off until manually enabled.`,
      "warning",
    );
  }
}

function toggleUltrafast(ctx: ExtensionContext, state: SessionState): void {
  if (state.ultrafast) {
    disableUltrafast(ctx, state);
    ctx.ui.notify(
      "Ultrafast mode is off (session only); regular Fast remains off until /fast is toggled.",
      "info",
    );
    return;
  }

  const eligibility = getUltrafastEligibility(ctx);
  if (!eligibility.eligible) {
    ctx.ui.notify(
      `Cannot enable Ultrafast mode for ${eligibility.modelKey}: ${eligibility.reason}.`,
      "error",
    );
    return;
  }

  state.ultrafast = true;
  updateStatus(ctx, state);
  ctx.ui.notify(getStatusMessage(ctx, state), "info");
}

export default function fastExtension(pi: ExtensionAPI) {
  const states = new WeakMap<object, SessionState>();

  function getState(ctx: ExtensionContext): SessionState {
    let state = states.get(ctx.sessionManager);
    if (!state) {
      state = {
        config: loadConfig(ctx),
        override: "auto",
        ultrafast: false,
      };
      states.set(ctx.sessionManager, state);
    }
    return state;
  }

  pi.on("session_start", (_event, ctx) => {
    const state: SessionState = {
      config: loadConfig(ctx),
      override: "auto",
      ultrafast: false,
    };
    states.set(ctx.sessionManager, state);
    updateStatus(ctx, state);
  });

  pi.on("model_select", (_event, ctx) => {
    const state = getState(ctx);
    if (state.ultrafast) {
      const eligibility = getUltrafastEligibility(ctx);
      if (!eligibility.eligible) {
        disableUltrafast(
          ctx,
          state,
          `the selected model ${eligibility.modelKey} is unsupported (${eligibility.reason})`,
        );
        return;
      }
    }
    updateStatus(ctx, state);
  });

  pi.on("before_provider_headers", async (event, ctx) => {
    const hasActiveTools =
      typeof pi.getActiveTools === "function" && pi.getActiveTools().length > 0;
    await injectAnthropicFastHeader(event.headers, ctx, getState(ctx), hasActiveTools);
  });

  pi.on("before_provider_request", (event, ctx) => {
    const state = getState(ctx);
    if (state.ultrafast) {
      const eligibility = getUltrafastEligibility(ctx);
      if (!eligibility.eligible) {
        disableUltrafast(
          ctx,
          state,
          `the current model ${eligibility.modelKey} is unsupported (${eligibility.reason})`,
        );
        return undefined;
      }
      const nextPayload = injectUltrafastPayload(event.payload, ctx, state);
      updateStatus(ctx, state);
      return nextPayload;
    }

    const nextPayload = injectFastPayload(event.payload, ctx, state);
    updateStatus(ctx, state);
    return nextPayload;
  });

  pi.registerCommand("ultrafast", {
    description: "Toggle session-only Ultrafast mode for direct OpenAI API-key GPT-6 Astra",
    getArgumentCompletions: () => null,
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /ultrafast", "warning");
        return;
      }
      toggleUltrafast(ctx, getState(ctx));
    },
  });

  pi.registerCommand("fast", {
    description:
      "Toggle Fast mode for supported direct OpenAI, OpenAI Codex, and Anthropic Claude models",
    getArgumentCompletions: () => null,
    handler: async (args, ctx) => {
      const state = getState(ctx);
      const action = args.trim();

      if (action === "ultrafast") {
        toggleUltrafast(ctx, state);
        return;
      }

      if (!action) {
        if (state.ultrafast) {
          toggleUltrafast(ctx, state);
          return;
        }
        state.override = isFastEnabled(state) ? "off" : "on";
        updateStatus(ctx, state);
        ctx.ui.notify(getStatusMessage(ctx, state), "info");
        return;
      }

      ctx.ui.notify("Usage: /fast [ultrafast]", "warning");
    },
  });
}
