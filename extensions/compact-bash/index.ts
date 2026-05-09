import {
	createBashToolDefinition,
	DEFAULT_MAX_BYTES,
	formatSize,
	keyHint,
	SettingsManager,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Container, Text, truncateToWidth } from "@earendil-works/pi-tui";

const COLLAPSED_PREVIEW_LINES = 1;

type BashToolDefinition = ReturnType<typeof createBashToolDefinition>;
type BashRenderResult = NonNullable<BashToolDefinition["renderResult"]>;
type BashRenderResultParams = Parameters<BashRenderResult>;
type BashRenderState = {
	endedAt?: number;
	interval?: ReturnType<typeof setInterval>;
};

function getTextOutput(result: BashRenderResultParams[0]): string {
	return result.content
		.filter((content) => content.type === "text")
		.map((content) => content.text ?? "")
		.join("\n")
		.trim();
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function visibleLength(text: string): number {
	return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").length;
}

function renderCollapsedLine(
	line: string,
	hiddenLines: number,
	theme: BashRenderResultParams[2],
	width: number,
): string {
	if (width <= 0) return "";

	const styledLine = theme.fg("toolOutput", line);
	if (hiddenLines <= 0) {
		return truncateToWidth(styledLine, width, "...");
	}

	const hint = theme.fg(
		"muted",
		`  ... ${hiddenLines} more line${hiddenLines === 1 ? "" : "s"} (${keyHint("app.tools.expand", "to expand")})`,
	);
	const hintWidth = visibleLength(hint);
	if (hintWidth + 8 > width) {
		return truncateToWidth(`${styledLine}${hint}`, width, "...");
	}

	return `${truncateToWidth(styledLine, width - hintWidth, "...")}${hint}`;
}

function getTruncationWarnings(result: BashRenderResultParams[0]): string[] {
	const details = result.details as
		| {
				truncation?: {
					truncated?: boolean;
					truncatedBy?: "lines" | "bytes";
					outputLines?: number;
					totalLines?: number;
					maxBytes?: number;
				};
				fullOutputPath?: string;
		  }
		| undefined;
	const truncation = details?.truncation;
	const warnings: string[] = [];

	if (details?.fullOutputPath) {
		warnings.push(`Full output: ${details.fullOutputPath}`);
	}

	if (truncation?.truncated) {
		if (truncation.truncatedBy === "lines") {
			warnings.push(`Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`);
		} else {
			warnings.push(
				`Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit)`,
			);
		}
	}

	return warnings;
}

function syncElapsedTimer(options: BashRenderResultParams[1], context: BashRenderResultParams[3]): BashRenderState {
	const state = context.state as BashRenderState & { startedAt?: number };

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

const renderCompactBashResult: BashRenderResult = (result, options, theme, context) => {
	const state = syncElapsedTimer(options, context);
	const component = (context.lastComponent as Container | undefined) ?? new Container();
	component.clear();

	const output = getTextOutput(result);
	const outputLines = output ? output.split("\n") : [];

	if (outputLines.length > 0) {
		if (options.expanded) {
			const displayText = outputLines.map((line) => theme.fg("toolOutput", line)).join("\n");
			component.addChild(new Text(displayText, 0, 0));
		} else {
			const firstLine = outputLines[0] ?? "";
			const hiddenLines = Math.max(0, outputLines.length - COLLAPSED_PREVIEW_LINES);
			component.addChild({
				render: (width) => [renderCollapsedLine(firstLine, hiddenLines, theme, width)],
				invalidate: () => undefined,
			});
		}
	} else if (options.isPartial) {
		component.addChild(new Text(theme.fg("muted", "Running..."), 0, 0));
	}

	const warnings = getTruncationWarnings(result);
	if (warnings.length > 0) {
		component.addChild(new Text(theme.fg("warning", `[${warnings.join(". ")}]`), 0, 0));
	}

	if (options.expanded) {
		const statusParts: string[] = [];
		if (outputLines.length > COLLAPSED_PREVIEW_LINES) {
			statusParts.push(`(${keyHint("app.tools.expand", "to collapse")})`);
		}
		if (state.startedAt !== undefined) {
			const endTime = state.endedAt ?? Date.now();
			statusParts.push(theme.fg("muted", `${options.isPartial ? "Elapsed" : "Took"} ${formatDuration(endTime - state.startedAt)}`));
		}
		if (statusParts.length > 0) {
			component.addChild(new Text(statusParts.join("\n"), 0, 0));
		}
	}

	component.invalidate();
	return component;
};

function createBaseBashToolDefinition(cwd: string): BashToolDefinition {
	try {
		const settings = SettingsManager.create(cwd);
		return createBashToolDefinition(cwd, {
			commandPrefix: settings.getShellCommandPrefix(),
			shellPath: settings.getShellPath(),
		});
	} catch {
		return createBashToolDefinition(cwd);
	}
}

function createCompactBashToolDefinition(cwd: string, enabled: boolean): BashToolDefinition {
	const base = createBaseBashToolDefinition(cwd);
	if (!enabled) return base;

	return {
		...base,
		renderResult: renderCompactBashResult,
	};
}

export default function compactBashExtension(pi: ExtensionAPI) {
	let enabled = true;

	function registerBashTool(cwd: string): void {
		pi.registerTool(createCompactBashToolDefinition(cwd, enabled));
	}

	pi.on("session_start", async (_event, ctx) => {
		registerBashTool(ctx.cwd);
	});

	pi.registerCommand("compact-bash", {
		description: "Toggle one-line collapsed previews for bash tool output",
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
				registerBashTool(ctx.cwd);
				ctx.ui.notify("Compact bash previews enabled: collapsed bash output shows one line.", "info");
				return;
			}

			if (action === "off" || action === "disable") {
				enabled = false;
				registerBashTool(ctx.cwd);
				ctx.ui.notify("Compact bash previews disabled: restored pi's standard bash renderer.", "info");
				return;
			}

			if (action === "toggle") {
				enabled = !enabled;
				registerBashTool(ctx.cwd);
				ctx.ui.notify(
					enabled
						? "Compact bash previews enabled: collapsed bash output shows one line."
						: "Compact bash previews disabled: restored pi's standard bash renderer.",
					"info",
				);
				return;
			}

			if (action === "status") {
				ctx.ui.notify(
					`Compact bash previews are ${enabled ? "enabled" : "disabled"}. Collapsed preview lines: ${enabled ? COLLAPSED_PREVIEW_LINES : "pi default"}.`,
					"info",
				);
				return;
			}

			ctx.ui.notify("Usage: /compact-bash on | off | toggle | status", "warning");
		},
	});
}
