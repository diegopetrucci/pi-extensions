import { homedir } from "node:os";

import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	keyHint,
	SettingsManager,
	type ExtensionAPI,
	type ToolDefinition as PiToolDefinition,
	type ToolsOptions,
} from "@earendil-works/pi-coding-agent";
import { Container, Text, truncateToWidth } from "@earendil-works/pi-tui";

const QUIET_CALL_TOOL_NAMES = new Set(["bash", "edit", "find", "grep", "ls", "read", "write"]);

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

class QuietLinesRenderComponent extends Container {
	private linesRenderer: ((width: number) => string[]) | undefined;

	setLinesRenderer(linesRenderer: (width: number) => string[]): void {
		this.linesRenderer = linesRenderer;
		this.invalidate();
	}

	render(width: number): string[] {
		return this.linesRenderer?.(width).filter((line) => line) ?? [];
	}
}

class QuietCallRenderComponent extends QuietLinesRenderComponent {}
class QuietResultRenderComponent extends QuietLinesRenderComponent {}

function sanitizeInlineText(text: string): string {
	return text
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/[\r\n\t]+/g, " ")
		.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
}

function str(value: unknown): string | null {
	if (typeof value === "string") return sanitizeInlineText(value);
	if (value == null) return "";
	return null;
}

function asRecord(args: unknown): Record<string, unknown> | undefined {
	return args && typeof args === "object" ? (args as Record<string, unknown>) : undefined;
}

function firstStringArg(args: unknown, names: string[]): string | null {
	const record = asRecord(args);
	if (!record) return "";
	for (const name of names) {
		if (Object.prototype.hasOwnProperty.call(record, name)) {
			return str(record[name]);
		}
	}
	return "";
}

function numberArg(args: unknown, name: string): number | undefined {
	const value = asRecord(args)?.[name];
	return typeof value === "number" ? value : undefined;
}

function invalidArgText(theme: RenderTheme): string {
	return theme.fg("error", "[invalid arg]");
}

function shortenPath(path: string): string {
	const home = homedir();
	return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function formatToolTitle(toolName: string, theme: RenderTheme): string {
	return theme.fg("toolTitle", theme.bold(toolName));
}

function formatPathArg(args: unknown, theme: RenderTheme, placeholder = "..."): string {
	const path = firstStringArg(args, ["file_path", "path"]);
	if (path === null) return invalidArgText(theme);
	return path ? theme.fg("accent", shortenPath(path)) : theme.fg("toolOutput", placeholder);
}

function formatReadLineRange(args: unknown, theme: RenderTheme): string {
	const offset = numberArg(args, "offset");
	const limit = numberArg(args, "limit");
	if (offset === undefined && limit === undefined) return "";
	const startLine = offset ?? 1;
	const endLine = limit !== undefined ? startLine + limit - 1 : "";
	return theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
}

function formatQuietReadCall(args: unknown, theme: RenderTheme): string {
	return `${formatToolTitle("read", theme)} ${formatPathArg(args, theme)}${formatReadLineRange(args, theme)}`;
}

function formatQuietBashCall(args: unknown, theme: RenderTheme): string {
	const command = str(asRecord(args)?.command);
	const timeout = numberArg(args, "timeout");
	const commandDisplay = command === null
		? invalidArgText(theme)
		: command
			? theme.fg("toolTitle", theme.bold(command))
			: theme.fg("toolOutput", "...");
	const timeoutSuffix = timeout ? theme.fg("muted", ` (timeout ${timeout}s)`) : "";
	return `${theme.fg("toolTitle", theme.bold("$"))} ${commandDisplay}${timeoutSuffix}`;
}

function formatSearchPath(rawPath: string | null, theme: RenderTheme): string {
	return rawPath === null ? invalidArgText(theme) : shortenPath(rawPath || ".");
}

function formatQuietGrepCall(args: unknown, theme: RenderTheme): string {
	const pattern = str(asRecord(args)?.pattern);
	const rawPath = str(asRecord(args)?.path);
	const glob = str(asRecord(args)?.glob);
	const limit = numberArg(args, "limit");
	let text = `${formatToolTitle("grep", theme)} ${
		pattern === null ? invalidArgText(theme) : theme.fg("accent", `/${pattern || ""}/`)
	}${theme.fg("toolOutput", ` in ${formatSearchPath(rawPath, theme)}`)}`;
	if (glob) text += theme.fg("toolOutput", ` (${glob})`);
	if (glob === null) text += ` ${invalidArgText(theme)}`;
	if (limit !== undefined) text += theme.fg("toolOutput", ` limit ${limit}`);
	return text;
}

function formatQuietFindCall(args: unknown, theme: RenderTheme): string {
	const pattern = str(asRecord(args)?.pattern);
	const rawPath = str(asRecord(args)?.path);
	const limit = numberArg(args, "limit");
	let text = `${formatToolTitle("find", theme)} ${
		pattern === null ? invalidArgText(theme) : theme.fg("accent", pattern || "")
	}${theme.fg("toolOutput", ` in ${formatSearchPath(rawPath, theme)}`)}`;
	if (limit !== undefined) text += theme.fg("toolOutput", ` (limit ${limit})`);
	return text;
}

function formatQuietLsCall(args: unknown, theme: RenderTheme): string {
	const rawPath = str(asRecord(args)?.path);
	const limit = numberArg(args, "limit");
	let text = `${formatToolTitle("ls", theme)} ${
		rawPath === null ? invalidArgText(theme) : theme.fg("accent", shortenPath(rawPath || "."))
	}`;
	if (limit !== undefined) text += theme.fg("toolOutput", ` (limit ${limit})`);
	return text;
}

function formatQuietPathOnlyCall(toolName: "edit" | "write", args: unknown, theme: RenderTheme): string {
	return `${formatToolTitle(toolName, theme)} ${formatPathArg(args, theme)}`;
}

function formatQuietCallLine(toolName: string, args: unknown, theme: RenderTheme): string {
	switch (toolName) {
		case "bash":
			return formatQuietBashCall(args, theme);
		case "edit":
			return formatQuietPathOnlyCall("edit", args, theme);
		case "find":
			return formatQuietFindCall(args, theme);
		case "grep":
			return formatQuietGrepCall(args, theme);
		case "ls":
			return formatQuietLsCall(args, theme);
		case "read":
			return formatQuietReadCall(args, theme);
		case "write":
			return formatQuietPathOnlyCall("write", args, theme);
		default:
			return formatToolTitle(toolName, theme);
	}
}

function formatExpandHint(theme: RenderTheme): string {
	return `${theme.fg("muted", "(")}${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;
}

function markToolTiming(options: ToolRenderResultParams[1], context: ToolRenderContext): void {
	const state = context.state as TimerRenderState;

	if ((!options.isPartial || context.isError) && state.startedAt !== undefined) {
		state.endedAt ??= Date.now();
	}

	if ((!options.isPartial || context.isError) && state.interval) {
		clearInterval(state.interval);
		state.interval = undefined;
	}
}

function renderQuietCollapsedResult(
	_result: ToolRenderResultParams[0],
	options: ToolRenderResultParams[1],
	_theme: RenderTheme,
	context: ToolRenderContext,
): QuietResultRenderComponent {
	markToolTiming(options, context);
	const component = context.lastComponent instanceof QuietResultRenderComponent
		? context.lastComponent
		: new QuietResultRenderComponent();
	component.setLinesRenderer(() => []);
	return component;
}

function renderQuietCall(
	toolName: string,
	base: ToolDefinition,
	args: ToolRenderCallParams[0],
	theme: ToolRenderCallParams[1],
	context: ToolRenderCallParams[2],
) {
	const state = context.state as TimerRenderState;
	if (context.executionStarted && state.startedAt === undefined) {
		state.startedAt = Date.now();
		state.endedAt = undefined;
	}

	if (context.expanded || !QUIET_CALL_TOOL_NAMES.has(toolName)) {
		const delegateContext = context.lastComponent instanceof QuietCallRenderComponent
			? { ...context, lastComponent: undefined }
			: context;
		return base.renderCall?.(args, theme, delegateContext) ?? new Text(theme.fg("toolTitle", theme.bold(toolName)), 0, 0);
	}

	const component = context.lastComponent instanceof QuietCallRenderComponent
		? context.lastComponent
		: new QuietCallRenderComponent();
	const line = formatQuietCallLine(toolName, args, theme);
	const hint = formatExpandHint(theme);
	component.setLinesRenderer((width) => [
		truncateToWidth(line, width, "..."),
		truncateToWidth(hint, width, "..."),
	]);
	return component;
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

export const __testing = {
	sanitizeInlineText,
	formatQuietCallLine,
	createQuietToolDefinition,
};

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
		description: "Toggle one-line collapsed invocations for built-in tool rows",
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
				ctx.ui.notify("Quiet tool previews enabled: collapsed built-in tool rows show a one-line invocation plus an expand hint.", "info");
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
						? "Quiet tool previews enabled: collapsed built-in tool rows show a one-line invocation plus an expand hint."
						: "Quiet tool previews disabled: restored pi's standard built-in tool renderers.",
					"info",
				);
				return;
			}

			if (action === "status") {
				ctx.ui.notify(
					`Quiet tool previews are ${enabled ? "enabled" : "disabled"}. Collapsed tool rows ${enabled ? "show a one-line invocation and hide output until expanded" : "use pi's default rendering"}. Model-visible tool results are unchanged.`,
					"info",
				);
				return;
			}

			ctx.ui.notify("Usage: /quiet-tools on | off | toggle | status", "warning");
		},
	});
}
