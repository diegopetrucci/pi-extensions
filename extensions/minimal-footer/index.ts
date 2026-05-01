import { basename } from "node:path";
import {
	AuthStorage,
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

const USAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const USAGE_REQUEST_TIMEOUT_MS = 10 * 1000;

type UsageSessionState = {
	authStorage: AuthStorage;
	snapshot?: UsageSnapshot;
	lastFetchedAt?: number;
	loading: boolean;
	error?: string;
	inflight?: Promise<void>;
	requestRender?: () => void;
};

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
	if (!isOpenAICodexProvider(ctx.model?.provider)) {
		clearUsageState(state);
		state.requestRender?.();
		return;
	}

	const now = Date.now();
	if (
		!force &&
		state.lastFetchedAt &&
		now - state.lastFetchedAt < USAGE_CACHE_TTL_MS
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
				timeoutMs: USAGE_REQUEST_TIMEOUT_MS,
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
					const usageSummary = isOpenAICodexProvider(ctx.model?.provider)
						? formatUsageSummary(state.snapshot)
						: undefined;
					const contextText = usageSummary ? `${context} · ${usageSummary}` : context;

					const model = ctx.model?.id ?? "no-model";
					const thinking = pi.getThinkingLevel();
					const modelText = thinking === "off" ? model : `${model} ${thinking}`;

					const branchStyled = theme.fg("dim", branch);
					const repoStyled = theme.fg("dim", repo);
					const contextStyled = theme.fg("dim", contextText);
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
