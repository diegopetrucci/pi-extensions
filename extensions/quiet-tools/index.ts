import { homedir } from "node:os";

import {
  keyHint,
  type ExtensionAPI,
  type ToolRendererResolver,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const QUIET_TOOL_NAMES = new Set(["bash", "edit", "find", "grep", "ls", "read", "write"]);
const MAX_MCP_ARG_LENGTH = 2000;

type ToolRenderCall = NonNullable<ToolRenderers["renderCall"]>;
type ToolRenderResult = NonNullable<ToolRenderers["renderResult"]>;
type ToolRenderCallParams = Parameters<ToolRenderCall>;
type ToolRenderResultParams = Parameters<ToolRenderResult>;
type RenderTheme = ToolRenderCallParams[1];
type ToolRenderContext = ToolRenderCallParams[2];
type QuietToolRenderContext = ToolRenderContext & {
  durationMs?: number;
  outputPad?: number;
};
type BashRenderState = {
  startedAt?: number;
  endedAt?: number;
  interval?: ReturnType<typeof setInterval>;
};

type QuietLinesRenderer = (width: number) => string[];

class QuietLinesRenderComponent extends Container {
  private linesRenderer: QuietLinesRenderer | undefined;

  setLinesRenderer(linesRenderer: QuietLinesRenderer): void {
    this.linesRenderer = linesRenderer;
    this.invalidate();
  }

  protected renderLines(width: number): string[] {
    return this.linesRenderer?.(width).filter((line) => line) ?? [];
  }

  render(width: number): string[] {
    return this.renderLines(width);
  }
}

class QuietCallRenderComponent extends QuietLinesRenderComponent {
  private frame: Box | undefined;
  private framePaddingX: number | undefined;

  private readonly frameBody = {
    render: (width: number) => this.renderLines(width),
    invalidate: () => {},
  };

  setNativeFrame(theme: RenderTheme, context: QuietToolRenderContext): void {
    const outputPad = getOutputPad(context);
    if (!this.frame || this.framePaddingX !== outputPad) {
      this.frame = new Box(outputPad, 1);
      this.framePaddingX = outputPad;
    }

    const themeWithBackground = theme as RenderTheme & {
      bg?: (kind: string, text: string) => string;
    };
    const backgroundKind = context.isPartial
      ? "toolPendingBg"
      : context.isError
        ? "toolErrorBg"
        : "toolSuccessBg";
    const background = themeWithBackground.bg;
    this.frame.setBgFn(
      background ? (text) => background.call(themeWithBackground, backgroundKind, text) : undefined,
    );
  }

  clearNativeFrame(): void {
    this.frame = undefined;
    this.framePaddingX = undefined;
  }

  render(width: number): string[] {
    if (!this.frame) return super.render(width);

    this.frame.clear();
    this.frame.addChild(this.frameBody);
    return this.frame.render(width);
  }

  invalidate(): void {
    super.invalidate();
    this.frame?.invalidate();
  }
}

class QuietResultRenderComponent extends QuietLinesRenderComponent {}

/**
 * Thrown from a delegating renderCall/renderResult slot when next() did not supply that slot.
 * Pi's ToolExecutionComponent catches renderer errors and falls back to its native
 * createCallFallback/createResultFallback, which preserve the host's expanded behavior.
 */
class QuietToolsDelegateToDefault extends Error {
  constructor() {
    super("quiet-tools: delegate to Pi default renderer");
    this.name = "QuietToolsDelegateToDefault";
  }
}

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
  const commandDisplay =
    command === null
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

function formatQuietPathOnlyCall(
  toolName: "edit" | "write",
  args: unknown,
  theme: RenderTheme,
): string {
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

function formatMcpCallLine(toolName: string, args: unknown, theme: RenderTheme): string {
  let argsStr = "";
  if (args != null) {
    let raw: string | undefined;
    try {
      raw = JSON.stringify(args);
    } catch {
      // circular references, BigInt, etc.
    }
    if (raw === undefined) {
      argsStr = "[\u2026]";
    } else {
      const capped = raw.length > MAX_MCP_ARG_LENGTH ? raw.slice(0, MAX_MCP_ARG_LENGTH) : raw;
      argsStr = sanitizeInlineText(capped);
    }
  }
  return `${formatToolTitle(toolName, theme)}${argsStr ? ` ${theme.fg("toolOutput", argsStr)}` : ""}`;
}

function formatExpandHint(theme: RenderTheme): string {
  return `${theme.fg("muted", "(")}${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;
}

function formatFailedMarker(theme: RenderTheme): string {
  return theme.fg("error", " [failed]");
}

function truncateQuietCallLine(line: string, status: string, width: number): string {
  if (!status) return truncateToWidth(line, width, "...");
  const statusWidth = visibleWidth(status);
  if (statusWidth >= width) return truncateToWidth(status, width, "");
  return `${truncateToWidth(line, width - statusWidth, "...")}${status}`;
}

function getOutputPad(context: QuietToolRenderContext): number {
  const outputPad = context.outputPad;
  if (typeof outputPad !== "number" || !Number.isFinite(outputPad)) return 1;
  return Math.max(0, Math.floor(outputPad));
}

function finishBashTiming(
  options: ToolRenderResultParams[1],
  context: QuietToolRenderContext,
): void {
  const state = context.state as BashRenderState;

  if (!options.isPartial || context.isError) {
    state.endedAt ??= Date.now();
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = undefined;
    }
  }
}

function renderQuietCollapsedResult(
  toolName: string,
  _result: ToolRenderResultParams[0],
  options: ToolRenderResultParams[1],
  _theme: RenderTheme,
  context: QuietToolRenderContext,
): QuietResultRenderComponent {
  if (toolName === "bash") finishBashTiming(options, context);
  const component =
    context.lastComponent instanceof QuietResultRenderComponent
      ? context.lastComponent
      : new QuietResultRenderComponent();
  component.setLinesRenderer(() => []);
  return component;
}

function delegateCall(
  nextRenderers: ToolRenderers | undefined,
  args: ToolRenderCallParams[0],
  theme: RenderTheme,
  context: ToolRenderContext,
): ReturnType<ToolRenderCall> {
  if (!nextRenderers?.renderCall) throw new QuietToolsDelegateToDefault();
  const delegateContext =
    context.lastComponent instanceof QuietCallRenderComponent
      ? { ...context, lastComponent: undefined }
      : context;
  return nextRenderers.renderCall(args, theme, delegateContext);
}

function delegateResult(
  nextRenderers: ToolRenderers | undefined,
  result: ToolRenderResultParams[0],
  options: ToolRenderResultParams[1],
  theme: RenderTheme,
  context: ToolRenderContext,
): ReturnType<ToolRenderResult> {
  if (!nextRenderers?.renderResult) throw new QuietToolsDelegateToDefault();
  const delegateContext =
    context.lastComponent instanceof QuietResultRenderComponent
      ? { ...context, lastComponent: undefined }
      : context;
  return nextRenderers.renderResult(result, options, theme, delegateContext);
}

export function createQuietResolver(): ToolRendererResolver {
  return (toolName, next) => {
    const isBuiltin = QUIET_TOOL_NAMES.has(toolName);
    const isMcp = toolName.startsWith("mcp__");

    if (!isBuiltin && !isMcp) return next();

    const nextRenderers = next();
    const usesNativeShell = nextRenderers?.renderShell === "self";

    return {
      renderShell: nextRenderers?.renderShell,
      renderCall(args, theme, context) {
        if (context.expanded) return delegateCall(nextRenderers, args, theme, context);

        const quietContext = context as QuietToolRenderContext;
        if (toolName === "bash") {
          const state = quietContext.state as BashRenderState;
          if (quietContext.executionStarted && state.startedAt === undefined) {
            state.startedAt = Date.now();
            state.endedAt = undefined;
          }
        }

        const component =
          context.lastComponent instanceof QuietCallRenderComponent
            ? context.lastComponent
            : new QuietCallRenderComponent();
        if (usesNativeShell) component.setNativeFrame(theme, quietContext);
        else component.clearNativeFrame();

        const line = isBuiltin
          ? formatQuietCallLine(toolName, args, theme)
          : formatMcpCallLine(toolName, args, theme);
        const status = quietContext.isError ? formatFailedMarker(theme) : "";
        const hint = formatExpandHint(theme);
        component.setLinesRenderer((width) => [
          truncateQuietCallLine(line, status, width),
          truncateToWidth(hint, width, "..."),
        ]);
        return component;
      },
      renderResult(result, options, theme, context) {
        if (options.expanded) return delegateResult(nextRenderers, result, options, theme, context);
        return renderQuietCollapsedResult(
          toolName,
          result,
          options,
          theme,
          context as QuietToolRenderContext,
        );
      },
    };
  };
}

export const __testing = {
  sanitizeInlineText,
  formatQuietCallLine,
  formatMcpCallLine,
  createQuietResolver,
  QuietCallRenderComponent,
  QuietToolsDelegateToDefault,
};

const STATUS_MESSAGE =
  "Quiet tool previews are always on. Collapsed built-in and MCP tool rows show a one-line invocation and hide output until expanded. Model-visible tool results are unchanged.";
const FALLBACK_STATUS_MESSAGE =
  "Quiet tool previews are inactive: this Pi host lacks registerToolRenderer (requires Pi >=1.0.1).";
const STATUS_USAGE = "Usage: /quiet-tools status";

export default function quietToolsExtension(pi: ExtensionAPI) {
  let notifiedFallback = false;

  const hasRenderer = typeof (pi as any).registerToolRenderer === "function";

  if (hasRenderer) pi.registerToolRenderer(createQuietResolver());

  pi.on("session_start", async (_event, ctx) => {
    if (!hasRenderer && !notifiedFallback) {
      notifiedFallback = true;
      ctx.ui.notify(
        "quiet-tools needs Pi >=1.0.1 to customise tool renderers. Quiet rendering is inactive.",
        "warning",
      );
    }
  });

  pi.registerCommand("quiet-tools", {
    description: "Show always-on one-line collapsed invocations for built-in and MCP tool rows",
    getArgumentCompletions: (prefix) => {
      const query = prefix.trim().toLowerCase();
      return "status".startsWith(query) ? [{ value: "status", label: "status" }] : null;
    },
    handler: async (args, ctx) => {
      if (!args.trim() || args.trim().toLowerCase() === "status") {
        ctx.ui.notify(hasRenderer ? STATUS_MESSAGE : FALLBACK_STATUS_MESSAGE, "info");
        return;
      }
      ctx.ui.notify(STATUS_USAGE, "warning");
    },
  });
}
