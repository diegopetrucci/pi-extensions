import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	keyHint,
	SettingsManager,
	type ExtensionAPI,
	type ToolDefinition as PiToolDefinition,
	type ToolsOptions,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, Text, truncateToWidth } from "@earendil-works/pi-tui";

const COLLAPSED_PREVIEW_LINES = 1;
const QUIET_CALL_TOOL_NAMES = new Set(["edit", "write"]);

type ToolDefinition = PiToolDefinition<any, any, any>;
type ToolRenderCall = NonNullable<ToolDefinition["renderCall"]>;
type ToolRenderResult = NonNullable<ToolDefinition["renderResult"]>;
type ToolRenderCallParams = Parameters<ToolRenderCall>;
type ToolRenderResultParams = Parameters<ToolRenderResult>;
type RenderTheme = ToolRenderResultParams[2];
type ToolRenderContext = ToolRenderResultParams[3];

type TimerRenderState = {
	startedAt?: number;
	endedAt?: number;
	interval?: ReturnType<typeof setInterval>;
};

type TruncationLike = {
	truncated?: boolean;
	truncatedBy?: "lines" | "bytes";
	firstLineExceedsLimit?: boolean;
	outputLines?: number;
	totalLines?: number;
	maxBytes?: number;
	maxLines?: number;
};

class QuietResultRenderComponent extends Container {}

function sanitizePreviewText(text: string): string {
	return text
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
}

function getTextOutput(result: ToolRenderResultParams[0]): string {
	return sanitizePreviewText(
		result.content
			.filter((content) => content.type === "text")
			.map((content) => content.text ?? "")
			.join("\n")
			.trim(),
	);
}

function visibleLength(text: string): number {
	return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").length;
}

function plural(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function renderCollapsedLine(line: string, hiddenLines: number, theme: RenderTheme, width: number): string {
	if (width <= 0) return "";

	const styledLine = theme.fg("toolOutput", line);
	if (hiddenLines <= 0) {
		return truncateToWidth(styledLine, width, "...");
	}

	const hint = theme.fg(
		"muted",
		`  ... ${plural(hiddenLines, "more line")} (${keyHint("app.tools.expand", "to expand")})`,
	);
	const hintWidth = visibleLength(hint);
	if (hintWidth + 8 > width) {
		return truncateToWidth(`${styledLine}${hint}`, width, "...");
	}

	return `${truncateToWidth(styledLine, width - hintWidth, "...")}${hint}`;
}

function formatLimitWarning(label: string, count: unknown): string | undefined {
	return typeof count === "number" ? `${count} ${label} limit` : undefined;
}

function getTruncationWarnings(result: ToolRenderResultParams[0]): string[] {
	const details = result.details as
		| {
				truncation?: TruncationLike;
				fullOutputPath?: string;
				matchLimitReached?: number;
				resultLimitReached?: number;
				entryLimitReached?: number;
				linesTruncated?: boolean;
		  }
		| undefined;
	const truncation = details?.truncation;
	const warnings: string[] = [];

	if (details?.fullOutputPath) {
		warnings.push(`Full output: ${details.fullOutputPath}`);
	}

	if (truncation?.truncated) {
		if (truncation.firstLineExceedsLimit) {
			warnings.push(`First line exceeds ${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit`);
		} else if (truncation.truncatedBy === "lines") {
			warnings.push(
				`Truncated: showing ${truncation.outputLines ?? "some"} of ${truncation.totalLines ?? "?"} lines (${truncation.maxLines ?? DEFAULT_MAX_LINES} line limit)`,
			);
		} else {
			warnings.push(
				`Truncated: ${truncation.outputLines ?? "some"} lines shown (${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit)`,
			);
		}
	}

	const matchLimitWarning = formatLimitWarning("matches", details?.matchLimitReached);
	if (matchLimitWarning) warnings.push(matchLimitWarning);

	const resultLimitWarning = formatLimitWarning("results", details?.resultLimitReached);
	if (resultLimitWarning) warnings.push(resultLimitWarning);

	const entryLimitWarning = formatLimitWarning("entries", details?.entryLimitReached);
	if (entryLimitWarning) warnings.push(entryLimitWarning);

	if (details?.linesTruncated) warnings.push("Some lines truncated");

	return warnings;
}

function syncElapsedTimer(options: ToolRenderResultParams[1], context: ToolRenderContext): TimerRenderState {
	const state = context.state as TimerRenderState;

	if (state.startedAt !== undefined && options.isPartial && !state.interval) {
		state.interval = setInterval(() => context.invalidate(), 1000);
	}

	if (!options.isPartial || context.isError) {
		state.endedAt ??= Date.now();
		if (state.interval) {
			clearInterval(state.interval);
			state.interval = undefined;
		}
	}

	return state;
}

function renderQuietCollapsedResult(
	result: ToolRenderResultParams[0],
	options: ToolRenderResultParams[1],
	theme: RenderTheme,
	context: ToolRenderContext,
): Container {
	const state = syncElapsedTimer(options, context);
	const component = context.lastComponent instanceof QuietResultRenderComponent
		? context.lastComponent
		: new QuietResultRenderComponent();
	component.clear();

	const output = getTextOutput(result);
	const outputLines = output ? output.split("\n") : [];

	if (outputLines.length > 0) {
		const firstLine = outputLines[0] ?? "";
		const hiddenLines = Math.max(0, outputLines.length - COLLAPSED_PREVIEW_LINES);
		component.addChild({
			render: (width) => [renderCollapsedLine(firstLine, hiddenLines, theme, width)],
			invalidate: () => undefined,
		});
	} else if (options.isPartial) {
		component.addChild(new Text(theme.fg("muted", "Running..."), 0, 0));
	}

	const warnings = getTruncationWarnings(result);
	if (warnings.length > 0) {
		component.addChild(new Text(theme.fg("warning", `[${warnings.join(". ")}]`), 0, 0));
	}

	if (state.startedAt !== undefined && options.isPartial) {
		component.addChild(new Text(theme.fg("muted", `Elapsed ${formatDuration(Date.now() - state.startedAt)}`), 0, 0));
	}

	component.invalidate();
	return component;
}

function getPathArg(args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const values = args as { path?: unknown; file_path?: unknown };
	return typeof values.file_path === "string"
		? values.file_path
		: typeof values.path === "string"
			? values.path
			: undefined;
}

function formatQuietEditCall(args: unknown, theme: ToolRenderCallParams[1]): string {
	const path = getPathArg(args);
	const edits = args && typeof args === "object" && Array.isArray((args as { edits?: unknown }).edits)
		? (args as { edits: unknown[] }).edits.length
		: undefined;
	const editSummary = typeof edits === "number" && edits > 0 ? `${plural(edits, "edit block")} hidden` : "preview hidden";
	return `${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", path ?? "...")}${theme.fg(
		"muted",
		`  ... ${editSummary} (${keyHint("app.tools.expand", "to expand")})`,
	)}`;
}

function formatQuietWriteCall(args: unknown, theme: ToolRenderCallParams[1]): string {
	const path = getPathArg(args);
	const content = args && typeof args === "object" ? (args as { content?: unknown }).content : undefined;
	const contentSummary = typeof content === "string"
		? `${plural(content.split("\n").length, "line")}, ${formatSize(Buffer.byteLength(content, "utf8"))} hidden`
		: "content hidden";
	return `${theme.fg("toolTitle", theme.bold("write"))} ${theme.fg("accent", path ?? "...")}${theme.fg(
		"muted",
		`  ... ${contentSummary} (${keyHint("app.tools.expand", "to expand")})`,
	)}`;
}

function renderQuietCall(
	toolName: string,
	base: ToolDefinition,
	args: ToolRenderCallParams[0],
	theme: ToolRenderCallParams[1],
	context: ToolRenderCallParams[2],
) {
	if (context.expanded || !QUIET_CALL_TOOL_NAMES.has(toolName)) {
		return base.renderCall?.(args, theme, context) ?? new Text(theme.fg("toolTitle", theme.bold(toolName)), 0, 0);
	}

	if (toolName === "edit") {
		const component = context.lastComponent instanceof Box ? context.lastComponent : new Box(1, 1);
		const bgColor = context.isError
			? "toolErrorBg"
			: context.executionStarted && !context.isPartial
				? "toolSuccessBg"
				: "toolPendingBg";
		component.setBgFn((text) => theme.bg(bgColor, text));
		component.clear();
		component.addChild(new Text(formatQuietEditCall(args, theme), 0, 0));
		component.invalidate();
		return component;
	}

	const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
	text.setText(formatQuietWriteCall(args, theme));
	return text;
}

function createQuietToolDefinition(base: ToolDefinition): ToolDefinition {
	const baseRenderResult = base.renderResult;

	return {
		...base,
		renderCall(args, theme, context) {
			return renderQuietCall(base.name, base, args, theme, context);
		},
		renderResult(result, options, theme, context) {
			if (options.expanded && baseRenderResult) {
				const delegateContext = context.lastComponent instanceof QuietResultRenderComponent
					? { ...context, lastComponent: undefined }
					: context;
				return baseRenderResult(result, options, theme, delegateContext);
			}

			return renderQuietCollapsedResult(result, options, theme, context);
		},
	};
}

function createBaseToolOptions(cwd: string): ToolsOptions | undefined {
	try {
		const settings = SettingsManager.create(cwd);
		return {
			read: { autoResizeImages: settings.getImageAutoResize() },
			bash: {
				commandPrefix: settings.getShellCommandPrefix(),
				shellPath: settings.getShellPath(),
			},
		};
	} catch {
		return undefined;
	}
}

function createBaseToolDefinitions(cwd: string): ToolDefinition[] {
	const options = createBaseToolOptions(cwd);
	return [
		createReadToolDefinition(cwd, options?.read),
		createBashToolDefinition(cwd, options?.bash),
		createEditToolDefinition(cwd, options?.edit),
		createWriteToolDefinition(cwd, options?.write),
		createGrepToolDefinition(cwd, options?.grep),
		createFindToolDefinition(cwd, options?.find),
		createLsToolDefinition(cwd, options?.ls),
	] as ToolDefinition[];
}

function createQuietToolDefinitions(cwd: string, enabled: boolean): ToolDefinition[] {
	const baseDefinitions = createBaseToolDefinitions(cwd);
	return enabled ? baseDefinitions.map(createQuietToolDefinition) : baseDefinitions;
}

export default function quietToolsExtension(pi: ExtensionAPI) {
	let enabled = true;

	function registerTools(cwd: string): void {
		for (const tool of createQuietToolDefinitions(cwd, enabled)) {
			pi.registerTool(tool);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		registerTools(ctx.cwd);
	});

	pi.registerCommand("quiet-tools", {
		description: "Toggle compact collapsed previews for built-in tool rows",
		getArgumentCompletions: (prefix) => {
			const commands = ["on", "off", "toggle", "status"];
			const query = prefix.trim().toLowerCase();
			const matches = commands.filter((command) => command.startsWith(query));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase() || "toggle";

			if (action === "on" || action === "enable") {
				enabled = true;
				registerTools(ctx.cwd);
				ctx.ui.notify("Quiet tool previews enabled: collapsed built-in tool rows show one-line output.", "info");
				return;
			}

			if (action === "off" || action === "disable") {
				enabled = false;
				registerTools(ctx.cwd);
				ctx.ui.notify("Quiet tool previews disabled: restored pi's standard built-in tool renderers.", "info");
				return;
			}

			if (action === "toggle") {
				enabled = !enabled;
				registerTools(ctx.cwd);
				ctx.ui.notify(
					enabled
						? "Quiet tool previews enabled: collapsed built-in tool rows show one-line output."
						: "Quiet tool previews disabled: restored pi's standard built-in tool renderers.",
					"info",
				);
				return;
			}

			if (action === "status") {
				ctx.ui.notify(
					`Quiet tool previews are ${enabled ? "enabled" : "disabled"}. Collapsed preview lines: ${enabled ? COLLAPSED_PREVIEW_LINES : "pi default"}. Model-visible tool results are unchanged.`,
					"info",
				);
				return;
			}

			ctx.ui.notify("Usage: /quiet-tools on | off | toggle | status", "warning");
		},
	});
}
