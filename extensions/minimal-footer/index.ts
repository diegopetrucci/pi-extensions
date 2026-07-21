import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import {
	CONFIG_DIR_NAME,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	fetchOpenAICodexUsage,
	formatUsageSummary,
	isOpenAICodexProvider,
	type UsageSnapshot,
} from "./openai-usage.ts";


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
	experimentalMarker: {
		enabled: true,
		label: "xp",
		color: "warning",
	},
	gitStatus: {
		enabled: true,
		refreshIntervalMs: 8_000,
		gitTimeoutMs: 1_500,
		ghTimeoutMs: 3_000,
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
	experimentalMarker: {
		enabled: boolean;
		label: string;
		color: DumbZoneColor;
	};
	gitStatus: {
		enabled: boolean;
		refreshIntervalMs: number;
		gitTimeoutMs: number;
		ghTimeoutMs: number;
	};
}

type UsageSessionState = {
	config: MinimalFooterConfig;
	snapshot?: UsageSnapshot;
	lastFetchedAt?: number;
	loading: boolean;
	error?: string;
	inflight?: Promise<void>;
	requestRender?: () => void;
	gitCache?: GitFooterCache;
};

type ProjectConfigContext = {
	cwd: string;
	isProjectTrusted?: () => boolean;
};

type GitStatusSnapshot = {
	branch?: string;
	staged: number;
	unstaged: number;
	untracked: number;
	conflict: number;
	ahead: number;
	behind: number;
};

type PullRequestSnapshot = {
	number?: number | string;
	state?: string;
	isDraft?: boolean;
	url?: string;
	title?: string;
};

type CommandResult = {
	stdout: string;
	stderr: string;
	exitCode: number | null;
};

type CommandRunner = (
	command: string,
	args: readonly string[],
	options: { cwd: string; signal: AbortSignal },
) => Promise<CommandResult>;

type RunCommandSafelyResult =
	| { kind: "ok"; result: CommandResult }
	| { kind: "transient" }
	| { kind: "unavailable" };

type TimerHandle = unknown;

type Clock = {
	setInterval(callback: () => void, ms: number): TimerHandle;
	clearInterval(handle: TimerHandle): void;
};

type GitFooterCacheOptions = {
	cwd: () => string;
	canRun?: () => boolean;
	runner?: CommandRunner;
	clock?: Clock;
	refreshIntervalMs?: number;
	gitTimeoutMs?: number;
	ghTimeoutMs?: number;
	onChange?: () => void;
};

const BRANCH_HEAD_PREFIX = "# branch.head ";
const BRANCH_AB_PREFIX = "# branch.ab ";
const STATUS_SEPARATOR = " • ";
const GIT_STATUS_ARGS = [
	"--no-optional-locks",
	"-c",
	"core.fsmonitor=false",
	"status",
	"--porcelain=v2",
	"--branch",
] as const;
const GH_PR_VIEW_ARGS = ["pr", "view", "--json", "number,state,isDraft,url,title"] as const;

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
	const experimentalMarker = overrides.experimentalMarker;
	const gitStatus = overrides.gitStatus;

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
		experimentalMarker: {
			enabled: normalizeBoolean(
				experimentalMarker?.enabled,
				base.experimentalMarker.enabled,
			),
			label: normalizeLabel(experimentalMarker?.label, base.experimentalMarker.label),
			color: normalizeDumbZoneColor(
				experimentalMarker?.color,
				base.experimentalMarker.color,
			),
		},
		gitStatus: {
			enabled: normalizeBoolean(gitStatus?.enabled, base.gitStatus.enabled),
			refreshIntervalMs: normalizePositiveNumber(
				gitStatus?.refreshIntervalMs,
				base.gitStatus.refreshIntervalMs,
			),
			gitTimeoutMs: normalizePositiveNumber(
				gitStatus?.gitTimeoutMs,
				base.gitStatus.gitTimeoutMs,
			),
			ghTimeoutMs: normalizePositiveNumber(
				gitStatus?.ghTimeoutMs,
				base.gitStatus.ghTimeoutMs,
			),
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

function canReadProjectConfig(ctx: ProjectConfigContext): boolean {
	return typeof ctx.isProjectTrusted === "function" && ctx.isProjectTrusted();
}

function findProjectConfigPath(cwd: string): string {
	let current = cwd;
	while (true) {
		const candidate = join(current, CONFIG_DIR_NAME, "minimal-footer.json");
		if (existsSync(candidate)) return candidate;

		const parent = dirname(current);
		if (parent === current) return join(cwd, CONFIG_DIR_NAME, "minimal-footer.json");
		current = parent;
	}
}

function loadConfig(ctx: ProjectConfigContext): MinimalFooterConfig {
	const globalConfig = readConfigFile(join(getAgentDir(), "extensions", "minimal-footer.json"));
	const projectConfig = canReadProjectConfig(ctx) ? readConfigFile(findProjectConfigPath(ctx.cwd)) : {};
	return mergeConfig(mergeConfig(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function shouldShowCodexUsage(config: MinimalFooterConfig): boolean {
	return (
		config.codexUsage.enabled &&
		(config.codexUsage.windows.primary.enabled || config.codexUsage.windows.secondary.enabled)
	);
}

function shouldShowExperimentalMarker(config: MinimalFooterConfig): boolean {
	return config.experimentalMarker.enabled && process.env.PI_EXPERIMENTAL === "1";
}

function shouldShowGitStatus(config: MinimalFooterConfig): boolean {
	return config.gitStatus.enabled;
}

function canRunProjectGit(ctx: ProjectConfigContext): boolean {
	return canReadProjectConfig(ctx);
}

function createEmptyGitStatus(): GitStatusSnapshot {
	return {
		branch: undefined,
		staged: 0,
		unstaged: 0,
		untracked: 0,
		conflict: 0,
		ahead: 0,
		behind: 0,
	};
}

function positiveCount(value: number): number {
	return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function addTrackedStatusCounts(status: GitStatusSnapshot, xy: string): void {
	if (xy.length !== 2) return;
	if (xy[0] !== ".") status.staged += 1;
	if (xy[1] !== ".") status.unstaged += 1;
}

function parseBranchAheadBehind(line: string, status: GitStatusSnapshot): void {
	const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line);
	if (!match) return;
	status.ahead = Number.parseInt(match[1]!, 10);
	status.behind = Number.parseInt(match[2]!, 10);
}

function normalizeBranchHead(value: string): string {
	const branch = value.trim();
	return branch === "(detached)" ? "detached" : branch;
}

function parseGitStatusPorcelainV2(output: string): GitStatusSnapshot {
	const status = createEmptyGitStatus();

	for (const rawLine of output.split("\n")) {
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
		if (!line) continue;

		if (line.startsWith(BRANCH_HEAD_PREFIX)) {
			status.branch = normalizeBranchHead(line.slice(BRANCH_HEAD_PREFIX.length)) || undefined;
			continue;
		}

		if (line.startsWith(BRANCH_AB_PREFIX)) {
			parseBranchAheadBehind(line, status);
			continue;
		}

		if (line.startsWith("1 ") || line.startsWith("2 ")) {
			addTrackedStatusCounts(status, line.slice(2, 4));
			continue;
		}

		if (line.startsWith("u ")) {
			status.conflict += 1;
			continue;
		}

		if (line.startsWith("? ")) status.untracked += 1;
	}

	return status;
}

function formatGitStatusFooterSegment(status: GitStatusSnapshot | undefined): string | undefined {
	if (!status) return undefined;

	const parts: string[] = [];
	const indicators: Array<[string, number]> = [
		["!", positiveCount(status.conflict)],
		["+", positiveCount(status.staged)],
		["~", positiveCount(status.unstaged)],
		["?", positiveCount(status.untracked)],
		["↑", positiveCount(status.ahead)],
		["↓", positiveCount(status.behind)],
	];

	for (const [prefix, count] of indicators) {
		if (count > 0) parts.push(`${prefix}${count}`);
	}

	return parts.length > 0 ? parts.join(" ") : undefined;
}

function formatPullRequestFooterSegment(pullRequest: PullRequestSnapshot | undefined): string | undefined {
	const value = pullRequest?.number;
	if (Number.isSafeInteger(value) && Number(value) > 0) return `PR #${value}`;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (/^[1-9]\d*$/.test(trimmed)) return `PR #${trimmed}`;
	}
	return undefined;
}

function formatGitFooterStatus(
	status: GitStatusSnapshot | undefined,
	pullRequest: PullRequestSnapshot | undefined,
): string | undefined {
	const parts = [
		formatGitStatusFooterSegment(status),
		formatPullRequestFooterSegment(pullRequest),
	].filter((part): part is string => !!part);
	return parts.length > 0 ? parts.join(STATUS_SEPARATOR) : undefined;
}

function parsePullRequestJson(stdout: string): PullRequestSnapshot | undefined {
	const trimmed = stdout.trim();
	if (!trimmed) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

	const record = parsed as Record<string, unknown>;
	const snapshot: PullRequestSnapshot = {};
	if (typeof record.number === "number" || typeof record.number === "string") {
		snapshot.number = record.number;
	}
	if (typeof record.state === "string") snapshot.state = record.state;
	if (typeof record.isDraft === "boolean") snapshot.isDraft = record.isDraft;
	if (typeof record.url === "string") snapshot.url = record.url;
	if (typeof record.title === "string") snapshot.title = record.title;
	return snapshot;
}

function gitStatusSnapshotsEqual(
	left: GitStatusSnapshot | undefined,
	right: GitStatusSnapshot | undefined,
): boolean {
	return (
		left?.branch === right?.branch
		&& left?.staged === right?.staged
		&& left?.unstaged === right?.unstaged
		&& left?.untracked === right?.untracked
		&& left?.conflict === right?.conflict
		&& left?.ahead === right?.ahead
		&& left?.behind === right?.behind
	);
}

function pullRequestSnapshotsEqual(
	left: PullRequestSnapshot | undefined,
	right: PullRequestSnapshot | undefined,
): boolean {
	return (
		left?.number === right?.number
		&& left?.state === right?.state
		&& left?.isDraft === right?.isDraft
		&& left?.url === right?.url
		&& left?.title === right?.title
	);
}

function defaultRunner(
	command: string,
	args: readonly string[],
	options: { cwd: string; signal: AbortSignal },
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		let child;
		try {
			child = spawn(command, [...args], {
				cwd: options.cwd,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});
		} catch (error) {
			reject(error);
			return;
		}

		let stdout = "";
		let stderr = "";
		let settled = false;

		const finish = (result: CommandResult | Error) => {
			if (settled) return;
			settled = true;
			options.signal.removeEventListener("abort", onAbort);
			if (result instanceof Error) reject(result);
			else resolve(result);
		};

		const onAbort = () => {
			try {
				child.kill("SIGTERM");
			} catch {
				// Ignore: process may already be gone.
			}
			finish(new Error("aborted"));
		};

		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		});
		child.on("error", finish);
		child.on("close", (code) => finish({ stdout, stderr, exitCode: code }));

		if (options.signal.aborted) {
			onAbort();
			return;
		}
		options.signal.addEventListener("abort", onAbort, { once: true });
	});
}

function defaultClock(): Clock {
	return {
		setInterval(callback, ms) {
			const handle = setInterval(callback, ms);
			(handle as { unref?: () => void }).unref?.();
			return handle;
		},
		clearInterval(handle) {
			clearInterval(handle as ReturnType<typeof setInterval>);
		},
	};
}

function isCommandUnavailableError(error: unknown): boolean {
	return !!error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT";
}

class GitFooterCache {
	private readonly cwd: () => string;
	private readonly canRun: () => boolean;
	private readonly runner: CommandRunner;
	private readonly clock: Clock;
	private readonly refreshIntervalMs: number;
	private readonly gitTimeoutMs: number;
	private readonly ghTimeoutMs: number;
	private readonly onChange: (() => void) | undefined;

	private intervalHandle: TimerHandle | undefined;
	private readonly inflightControllers = new Set<AbortController>();
	private disposed = false;
	private refreshInFlight: Promise<void> | undefined;
	private statusSnapshot: GitStatusSnapshot | undefined;
	private pullRequestSnapshot: PullRequestSnapshot | undefined;
	private lastSeenBranch: string | undefined;

	constructor(options: GitFooterCacheOptions) {
		this.cwd = options.cwd;
		this.canRun = options.canRun ?? (() => true);
		this.runner = options.runner ?? defaultRunner;
		this.clock = options.clock ?? defaultClock();
		this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_CONFIG.gitStatus.refreshIntervalMs;
		this.gitTimeoutMs = options.gitTimeoutMs ?? DEFAULT_CONFIG.gitStatus.gitTimeoutMs;
		this.ghTimeoutMs = options.ghTimeoutMs ?? DEFAULT_CONFIG.gitStatus.ghTimeoutMs;
		this.onChange = options.onChange;

		this.intervalHandle = this.clock.setInterval(() => {
			void this.refresh();
		}, this.refreshIntervalMs);
		void this.refresh();
	}

	getStatusSnapshot(): GitStatusSnapshot | undefined {
		return this.statusSnapshot;
	}

	getPullRequestSnapshot(): PullRequestSnapshot | undefined {
		return this.pullRequestSnapshot;
	}

	refresh(): Promise<void> {
		if (this.disposed) return Promise.resolve();
		if (!this.canRun()) {
			const previousStatusSnapshot = this.statusSnapshot;
			const previousPullRequestSnapshot = this.pullRequestSnapshot;
			this.statusSnapshot = undefined;
			this.pullRequestSnapshot = undefined;
			this.lastSeenBranch = undefined;
			this.emitChangeIfSnapshotsChanged(previousStatusSnapshot, previousPullRequestSnapshot);
			return Promise.resolve();
		}
		if (this.refreshInFlight) return this.refreshInFlight;
		const run = this.runRefresh()
			.finally(() => {
				this.refreshInFlight = undefined;
			})
			.catch(() => undefined);
		this.refreshInFlight = run;
		return run;
	}

	private async runRefresh(): Promise<void> {
		const previousStatusSnapshot = this.statusSnapshot;
		const previousPullRequestSnapshot = this.pullRequestSnapshot;

		const result = await this.fetchGitStatus();
		if (this.disposed) return;
		if (result.kind === "transient") return;
		if (result.kind === "not-a-repo" || result.kind === "unavailable") {
			this.statusSnapshot = undefined;
			this.pullRequestSnapshot = undefined;
			this.lastSeenBranch = undefined;
			this.emitChangeIfSnapshotsChanged(previousStatusSnapshot, previousPullRequestSnapshot);
			return;
		}

		const status = result.status;
		this.statusSnapshot = status;

		const branch = typeof status.branch === "string" ? status.branch : undefined;
		const isValidBranch = !!branch && branch !== "detached";
		const branchChanged = branch !== this.lastSeenBranch;

		if (branchChanged) this.pullRequestSnapshot = undefined;
		this.lastSeenBranch = branch;

		if (!isValidBranch) {
			this.pullRequestSnapshot = undefined;
			this.emitChangeIfSnapshotsChanged(previousStatusSnapshot, previousPullRequestSnapshot);
			return;
		}

		const pr = await this.fetchPullRequest();
		if (this.disposed) return;
		if (pr.kind === "ok") this.pullRequestSnapshot = pr.pullRequest;
		else if (pr.kind === "not-found" || pr.kind === "unavailable") this.pullRequestSnapshot = undefined;

		this.emitChangeIfSnapshotsChanged(previousStatusSnapshot, previousPullRequestSnapshot);
	}

	private emitChangeIfSnapshotsChanged(
		previousStatusSnapshot: GitStatusSnapshot | undefined,
		previousPullRequestSnapshot: PullRequestSnapshot | undefined,
	): void {
		if (this.disposed) return;
		if (
			gitStatusSnapshotsEqual(previousStatusSnapshot, this.statusSnapshot)
			&& pullRequestSnapshotsEqual(previousPullRequestSnapshot, this.pullRequestSnapshot)
		) {
			return;
		}
		try {
			this.onChange?.();
		} catch {
			// Rendering hooks should not break refreshes.
		}
	}

	private async fetchGitStatus(): Promise<
		| { kind: "ok"; status: GitStatusSnapshot }
		| { kind: "not-a-repo" }
		| { kind: "transient" }
		| { kind: "unavailable" }
	> {
		const result = await this.runCommandSafely("git", GIT_STATUS_ARGS, this.gitTimeoutMs);
		if (result.kind !== "ok") return result;
		if (result.result.exitCode !== 0) return { kind: "not-a-repo" };
		return { kind: "ok", status: parseGitStatusPorcelainV2(result.result.stdout) };
	}

	private async fetchPullRequest(): Promise<
		| { kind: "ok"; pullRequest: PullRequestSnapshot | undefined }
		| { kind: "not-found" }
		| { kind: "transient" }
		| { kind: "unavailable" }
	> {
		const result = await this.runCommandSafely("gh", GH_PR_VIEW_ARGS, this.ghTimeoutMs);
		if (result.kind !== "ok") return result;
		if (result.result.exitCode !== 0) return { kind: "not-found" };
		return { kind: "ok", pullRequest: parsePullRequestJson(result.result.stdout) };
	}

	private async runCommandSafely(
		command: string,
		args: readonly string[],
		timeoutMs: number,
	): Promise<RunCommandSafelyResult> {
		if (this.disposed) return { kind: "transient" };
		const controller = new AbortController();
		this.inflightControllers.add(controller);
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const result = await this.runner(command, args, { cwd: this.cwd(), signal: controller.signal });
			return { kind: "ok", result };
		} catch (error) {
			return isCommandUnavailableError(error) ? { kind: "unavailable" } : { kind: "transient" };
		} finally {
			clearTimeout(timeoutId);
			this.inflightControllers.delete(controller);
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.intervalHandle !== undefined) {
			this.clock.clearInterval(this.intervalHandle);
			this.intervalHandle = undefined;
		}
		for (const controller of this.inflightControllers) controller.abort();
		this.inflightControllers.clear();
	}
}

function renderFooterLines(options: {
	width: number;
	cwd: string;
	config: MinimalFooterConfig;
	branch: string;
	gitStatus?: string;
	contextUsage?: { percent?: number | null; tokens?: number | null };
	modelId?: string;
	modelProvider?: string;
	thinkingLevel: string;
	theme: { fg(color: DumbZoneColor | "dim", text: string): string };
	usageSnapshot?: UsageSnapshot;
}): string[] {
	const repo = basename(options.cwd);
	const branchText = options.gitStatus
		? [options.branch, options.gitStatus].filter(Boolean).join(" · ")
		: options.branch;

	const context = options.contextUsage?.percent == null
		? "?"
		: `${options.contextUsage.percent.toFixed(1)}%`;
	const dumbZone = options.config.context.dumbZone;
	const inDumbZone = dumbZone.enabled
		&& (options.contextUsage?.tokens ?? 0) > dumbZone.thresholdTokens;
	const usageSummary = shouldShowCodexUsage(options.config)
		&& isOpenAICodexProvider(options.modelProvider)
		? formatUsageSummary(options.usageSnapshot, options.config.codexUsage.windows)
		: undefined;

	const model = options.modelId ?? "no-model";
	const modelText = options.thinkingLevel === "off"
		? model
		: `${model} ${options.thinkingLevel}`;

	const branchStyled = options.theme.fg("dim", branchText);
	const repoStyled = options.theme.fg("dim", repo);
	const contextParts: string[] = [];
	if (options.config.context.showPercent) contextParts.push(options.theme.fg("dim", context));
	if (inDumbZone) contextParts.push(options.theme.fg(dumbZone.color, dumbZone.label));
	if (usageSummary) contextParts.push(options.theme.fg("dim", usageSummary));
	if (shouldShowExperimentalMarker(options.config)) {
		const marker = options.config.experimentalMarker;
		contextParts.push(options.theme.fg(marker.color, marker.label));
	}
	const contextStyled = contextParts.join(options.theme.fg("dim", " · "));
	const modelStyled = options.theme.fg("dim", modelText);

	const renderSplitLine = (left: string, right: string): string => {
		const gap = " ".repeat(Math.max(2, options.width - visibleWidth(left) - visibleWidth(right)));
		return truncateToWidth(left + gap + right, options.width);
	};

	const line1Fits = visibleWidth(branchStyled) + visibleWidth(repoStyled) + 2 <= options.width;
	const line2Fits = visibleWidth(contextStyled) + visibleWidth(modelStyled) + 2 <= options.width;

	if (line1Fits && line2Fits) {
		return [
			renderSplitLine(branchStyled, repoStyled),
			renderSplitLine(contextStyled, modelStyled),
		];
	}

	return [
		truncateToWidth(branchStyled, options.width),
		truncateToWidth(repoStyled, options.width),
		truncateToWidth(contextStyled, options.width),
		truncateToWidth(modelStyled, options.width),
	];
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
			const snapshot = await fetchOpenAICodexUsage(ctx.modelRegistry, {
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

	function disposeGitCache(state: UsageSessionState): void {
		state.gitCache?.dispose();
		state.gitCache = undefined;
	}

	function ensureGitCache(ctx: ExtensionContext, state: UsageSessionState): void {
		if (!shouldShowGitStatus(state.config) || !canRunProjectGit(ctx)) {
			disposeGitCache(state);
			return;
		}

		if (state.gitCache) return;
		state.gitCache = new GitFooterCache({
			cwd: () => ctx.cwd,
			canRun: () => canRunProjectGit(ctx),
			refreshIntervalMs: state.config.gitStatus.refreshIntervalMs,
			gitTimeoutMs: state.config.gitStatus.gitTimeoutMs,
			ghTimeoutMs: state.config.gitStatus.ghTimeoutMs,
			onChange: () => state.requestRender?.(),
		});
	}

	pi.on("session_start", (_event, ctx) => {
		const state: UsageSessionState = {
			config: loadConfig(ctx),
			loading: false,
		};
		states.set(ctx.sessionManager, state);

		ensureGitCache(ctx, state);

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			state.requestRender = () => tui.requestRender();
			void refreshUsageIfNeeded(ctx, state);

			return {
				dispose() {
					if (state.requestRender) state.requestRender = undefined;
					disposeGitCache(state);
					unsub();
				},
				invalidate() {},
				render(width: number): string[] {
					return renderFooterLines({
						width,
						cwd: ctx.cwd,
						config: state.config,
						branch: footerData.getGitBranch() ?? state.gitCache?.getStatusSnapshot()?.branch ?? "",
						gitStatus: shouldShowGitStatus(state.config)
							? formatGitFooterStatus(
								state.gitCache?.getStatusSnapshot(),
								state.gitCache?.getPullRequestSnapshot(),
							)
							: undefined,
						contextUsage: ctx.getContextUsage(),
						modelId: ctx.model?.id,
						modelProvider: ctx.model?.provider,
						thinkingLevel: pi.getThinkingLevel(),
						theme,
						usageSnapshot: state.snapshot,
					});
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
		ensureGitCache(ctx, state);
		void state.gitCache?.refresh();
	});

	pi.on("session_shutdown", (_event, ctx) => {
		const state = states.get(ctx.sessionManager);
		if (!state) return;
		disposeGitCache(state);
	});
}

export const __testing = {
	GitFooterCache,
	GIT_STATUS_ARGS,
	GH_PR_VIEW_ARGS,
	loadConfig,
	renderFooterLines,
	parseGitStatusPorcelainV2,
	parsePullRequestJson,
	formatGitStatusFooterSegment,
	formatPullRequestFooterSegment,
	formatGitFooterStatus,
};
