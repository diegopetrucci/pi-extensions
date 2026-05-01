import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
	AuthStorage,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
	fetchOpenAICodexUsage,
	formatUsageSummary,
	isOpenAICodexProvider,
	type UsageSnapshot,
} from "./openai-usage";

const DEFAULT_CONFIG: MinimalFooterConfig = {
	context: {
		showPercent: true,
		dumbZone: {
			enabled: true,
			thresholdTokens: 200_000,
			label: "DUMB ZONE",
			color: "error",
		},
	},
	codexUsage: {
		enabled: true,
		cacheTtlMs: 5 * 60 * 1000,
		requestTimeoutMs: 10 * 1000,
		windows: {
			primary: {
				enabled: true,
				label: "5h",
			},
			secondary: {
				enabled: true,
				label: "7d",
			},
		},
	},
};

const DUMB_ZONE_COLORS = new Set<DumbZoneColor>([
	"error",
	"warning",
	"accent",
	"text",
	"dim",
]);

type RecursivePartial<T> = {
	[P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : T[P];
};

type DumbZoneColor = "error" | "warning" | "accent" | "text" | "dim";

interface MinimalFooterConfig {
	context: {
		showPercent: boolean;
		dumbZone: {
			enabled: boolean;
			thresholdTokens: number;
			label: string;
			color: DumbZoneColor;
		};
	};
	codexUsage: {
		enabled: boolean;
		cacheTtlMs: number;
		requestTimeoutMs: number;
		windows: {
			primary: {
				enabled: boolean;
				label: string;
			};
			secondary: {
				enabled: boolean;
				label: string;
			};
		};
	};
}

type UsageSessionState = {
	authStorage: AuthStorage;
	config: MinimalFooterConfig;
	snapshot?: UsageSnapshot;
	lastFetchedAt?: number;
	loading: boolean;
	error?: string;
	inflight?: Promise<void>;
	requestRender?: () => void;
};

function readConfigFile(path: string): RecursivePartial<MinimalFooterConfig> {
	if (!existsSync(path)) return {};

	try {
		return JSON.parse(readFileSync(path, "utf-8")) as RecursivePartial<MinimalFooterConfig>;
	} catch (error) {
		console.error(`Warning: Could not parse ${path}: ${error}`);
		return {};
	}
}

function mergeConfig(
	base: MinimalFooterConfig,
	overrides: RecursivePartial<MinimalFooterConfig>,
): MinimalFooterConfig {
	const context = overrides.context;
	const dumbZone = context?.dumbZone;
	const codexUsage = overrides.codexUsage;
	const primaryWindow = codexUsage?.windows?.primary;
	const secondaryWindow = codexUsage?.windows?.secondary;

	return {
		context: {
			showPercent: normalizeBoolean(context?.showPercent, base.context.showPercent),
			dumbZone: {
				enabled: normalizeBoolean(dumbZone?.enabled, base.context.dumbZone.enabled),
				thresholdTokens: normalizeNonNegativeNumber(
					dumbZone?.thresholdTokens,
					base.context.dumbZone.thresholdTokens,
				),
				label: normalizeLabel(dumbZone?.label, base.context.dumbZone.label),
				color: normalizeDumbZoneColor(dumbZone?.color, base.context.dumbZone.color),
			},
		},
		codexUsage: {
			enabled: normalizeBoolean(codexUsage?.enabled, base.codexUsage.enabled),
			cacheTtlMs: normalizeNonNegativeNumber(
				codexUsage?.cacheTtlMs,
				base.codexUsage.cacheTtlMs,
			),
			requestTimeoutMs: normalizePositiveNumber(
				codexUsage?.requestTimeoutMs,
				base.codexUsage.requestTimeoutMs,
			),
			windows: {
				primary: {
					enabled: normalizeBoolean(
						primaryWindow?.enabled,
						base.codexUsage.windows.primary.enabled,
					),
					label: normalizeLabel(primaryWindow?.label, base.codexUsage.windows.primary.label),
				},
				secondary: {
					enabled: normalizeBoolean(
						secondaryWindow?.enabled,
						base.codexUsage.windows.secondary.enabled,
					),
					label: normalizeLabel(secondaryWindow?.label, base.codexUsage.windows.secondary.label),
				},
			},
		},
	};
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeLabel(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeDumbZoneColor(value: unknown, fallback: DumbZoneColor): DumbZoneColor {
	return DUMB_ZONE_COLORS.has(value as DumbZoneColor) ? (value as DumbZoneColor) : fallback;
}

function findProjectConfigPath(cwd: string): string {
	let current = cwd;
	while (true) {
		const candidate = join(current, ".pi", "minimal-footer.json");
		if (existsSync(candidate)) return candidate;

		const parent = dirname(current);
		if (parent === current) return join(cwd, ".pi", "minimal-footer.json");
		current = parent;
	}
}

function loadConfig(cwd: string): MinimalFooterConfig {
	const globalConfig = readConfigFile(join(getAgentDir(), "extensions", "minimal-footer.json"));
	const projectConfig = readConfigFile(findProjectConfigPath(cwd));
	return mergeConfig(mergeConfig(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function shouldShowCodexUsage(config: MinimalFooterConfig): boolean {
	return (
		config.codexUsage.enabled &&
		(config.codexUsage.windows.primary.enabled || config.codexUsage.windows.secondary.enabled)
	);
}

function clearUsageState(state: UsageSessionState): void {
	state.snapshot = undefined;
	state.lastFetchedAt = undefined;
	state.loading = false;
	state.error = undefined;
}

async function refreshUsageIfNeeded(
	ctx: ExtensionContext,
	state: UsageSessionState,
	force = false,
): Promise<void> {
	const config = state.config;
	if (!shouldShowCodexUsage(config) || !isOpenAICodexProvider(ctx.model?.provider)) {
		clearUsageState(state);
		state.requestRender?.();
		return;
	}

	const now = Date.now();
	if (
		!force &&
		state.lastFetchedAt &&
		now - state.lastFetchedAt < config.codexUsage.cacheTtlMs
	) {
		return;
	}

	if (state.inflight) {
		return state.inflight;
	}

	state.loading = true;
	state.requestRender?.();
	state.inflight = (async () => {
		try {
			const snapshot = await fetchOpenAICodexUsage(state.authStorage, {
				timeoutMs: config.codexUsage.requestTimeoutMs,
			});
			if (snapshot) {
				state.snapshot = snapshot;
				state.lastFetchedAt = snapshot.fetchedAt;
				state.error = undefined;
			} else {
				state.snapshot = undefined;
				state.lastFetchedAt = Date.now();
				state.error = undefined;
			}
		} catch (error) {
			state.error = error instanceof Error ? error.message : String(error);
		} finally {
			state.loading = false;
			state.inflight = undefined;
			state.requestRender?.();
		}
	})();

	return state.inflight;
}

export default function (pi: ExtensionAPI) {
	const states = new WeakMap<object, UsageSessionState>();

	pi.on("session_start", (_event, ctx) => {
		const state: UsageSessionState = {
			authStorage: AuthStorage.create(),
			config: loadConfig(ctx.cwd),
			loading: false,
		};
		states.set(ctx.sessionManager, state);

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			state.requestRender = () => tui.requestRender();
			void refreshUsageIfNeeded(ctx, state);

			return {
				dispose() {
					if (state.requestRender) state.requestRender = undefined;
					unsub();
				},
				invalidate() {},
				render(width: number): string[] {
					const repo = basename(ctx.cwd);
					const branch = footerData.getGitBranch() ?? "";

					const usage = ctx.getContextUsage();
					const context = usage?.percent == null ? "?" : `${usage.percent.toFixed(1)}%`;
					const dumbZone = state.config.context.dumbZone;
					const inDumbZone = dumbZone.enabled && (usage?.tokens ?? 0) > dumbZone.thresholdTokens;
					const usageSummary = shouldShowCodexUsage(state.config) && isOpenAICodexProvider(ctx.model?.provider)
						? formatUsageSummary(state.snapshot, state.config.codexUsage.windows)
						: undefined;

					const model = ctx.model?.id ?? "no-model";
					const thinking = pi.getThinkingLevel();
					const modelText = thinking === "off" ? model : `${model} ${thinking}`;

					const branchStyled = theme.fg("dim", branch);
					const repoStyled = theme.fg("dim", repo);
					const contextParts: string[] = [];
					if (state.config.context.showPercent) contextParts.push(theme.fg("dim", context));
					if (inDumbZone) contextParts.push(theme.fg(dumbZone.color, dumbZone.label));
					if (usageSummary) contextParts.push(theme.fg("dim", usageSummary));
					const contextStyled = contextParts.join(theme.fg("dim", " · "));
					const modelStyled = theme.fg("dim", modelText);

					const renderSplitLine = (left: string, right: string): string => {
						const gap = " ".repeat(Math.max(2, width - visibleWidth(left) - visibleWidth(right)));
						return truncateToWidth(left + gap + right, width);
					};

					const line1Fits = visibleWidth(branchStyled) + visibleWidth(repoStyled) + 2 <= width;
					const line2Fits = visibleWidth(contextStyled) + visibleWidth(modelStyled) + 2 <= width;

					if (line1Fits && line2Fits) {
						return [
							renderSplitLine(branchStyled, repoStyled),
							renderSplitLine(contextStyled, modelStyled),
						];
					}

					return [
						truncateToWidth(branchStyled, width),
						truncateToWidth(repoStyled, width),
						truncateToWidth(contextStyled, width),
						truncateToWidth(modelStyled, width),
					];
				},
			};
		});
	});

	pi.on("model_select", (_event, ctx) => {
		const state = states.get(ctx.sessionManager);
		if (!state) return;
		void refreshUsageIfNeeded(ctx, state, true);
	});

	pi.on("turn_end", (_event, ctx) => {
		const state = states.get(ctx.sessionManager);
		if (!state) return;
		void refreshUsageIfNeeded(ctx, state);
	});
}
