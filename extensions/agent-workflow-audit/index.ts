import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { AgentSession, ExtensionAPI, ExtensionCommandContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
	createAgentSession,
	getAgentDir,
	getMarkdownTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";

const CUSTOM_TYPE = "agent-workflow-audit";
const STATUS_ID = "agent-workflow-audit";
const WIDGET_ID = "agent-workflow-audit";

const MAX_TURNS = 12;
const MAX_TOOL_CALLS_TO_KEEP = 120;
const MAX_RUN_MS = 12 * 60 * 1000;
const DEFAULT_BASH_TIMEOUT_SECONDS = 120;
const MAX_BASH_TIMEOUT_SECONDS = 300;
const COLLAPSED_REPORT_LINES = 24;
const GIT_STATUS_TIMEOUT_MS = 15_000;

const USAGE = `Usage: /agent-workflow-audit [--yes] [--plan-only] [focus notes]

Runs an isolated Agent Workflow Audit subagent. The subagent does the noisy repo inspection, command execution, failures, and retries in an in-memory child session, then returns only its final report to the main session.

Options:
  --yes, -y       Skip the interactive safety confirmation.
  --plan-only     Read docs/manifests and report the intended workflow without running project commands.
  --help, -h      Show this help.`;

type AuditStatus = "running" | "done" | "error" | "aborted";
type AuditMode = "execute" | "plan-only";

type ToolCall = {
	id: string;
	name: string;
	args: unknown;
	startedAt: number;
	endedAt?: number;
	isError?: boolean;
};

type AuditDetails = {
	status: AuditStatus;
	mode: AuditMode;
	cwd: string;
	focus?: string;
	turns: number;
	toolCalls: ToolCall[];
	startedAt: number;
	endedAt?: number;
	error?: string;
	initialGitStatus?: string;
	finalGitStatus?: string;
	reportLength?: number;
	toolCallCount?: number;
};

type ParsedArgs = {
	help: boolean;
	yes: boolean;
	planOnly: boolean;
	focus?: string;
	error?: string;
};

type CreateAgentSessionOptions = NonNullable<Parameters<typeof createAgentSession>[0]>;

function getModelRuntimeOption(ctx: { modelRegistry?: unknown }): Pick<CreateAgentSessionOptions, "modelRuntime"> {
	const modelRuntime = (ctx.modelRegistry as { runtime?: CreateAgentSessionOptions["modelRuntime"] } | undefined)?.runtime;
	return modelRuntime ? { modelRuntime } : {};
}

function parseArgs(args: string): ParsedArgs {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const focusParts: string[] = [];
	const parsed: ParsedArgs = { help: false, yes: false, planOnly: false };

	for (const part of parts) {
		if (part === "--help" || part === "-h" || part === "help") {
			parsed.help = true;
			continue;
		}
		if (part === "--yes" || part === "-y") {
			parsed.yes = true;
			continue;
		}
		if (part === "--plan-only" || part === "--dry-run") {
			parsed.planOnly = true;
			continue;
		}
		if (part.startsWith("-")) {
			return { ...parsed, error: `Unknown /agent-workflow-audit option: ${part}\n${USAGE}` };
		}
		focusParts.push(part);
	}

	const focus = focusParts.join(" ").trim();
	if (focus) parsed.focus = focus;
	return parsed;
}

function notifyCommand(
	ctx: ExtensionCommandContext,
	message: string,
	type: "info" | "warning" | "error" = "info",
): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, type);
		return;
	}

	const writer = type === "error" ? console.error : console.log;
	writer(message);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function shorten(text: string, max: number): string {
	const oneLine = text.replace(/\s+/g, " ").trim();
	if (oneLine.length <= max) return oneLine;
	return `${oneLine.slice(0, Math.max(1, max - 1))}…`;
}

function formatDuration(durationMs: number): string {
	if (durationMs < 1000) return `${durationMs}ms`;
	if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
	return `${(durationMs / 60_000).toFixed(1)}m`;
}

function messageContentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
			const text = (part as { text?: unknown }).text;
			if (typeof text === "string") parts.push(text);
		}
	}
	return parts.join("\n").trim();
}

function extractLastAssistantText(messages: unknown[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i] as { role?: string; content?: unknown };
		if (message?.role !== "assistant") continue;
		const text = messageContentToText(message.content);
		if (text.trim()) return text.trim();
	}
	return "";
}

function isAbortLikeError(error: unknown): boolean {
	if (error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError") return true;
	const message = error instanceof Error ? error.message : String(error);
	return /aborted|cancelled|canceled/i.test(message);
}

function renderCollapsedReport(report: string, lineLimit = COLLAPSED_REPORT_LINES): string {
	const lines = report.trim().split("\n");
	if (lines.length <= lineLimit) return lines.join("\n");
	return [...lines.slice(0, lineLimit), `… (${lines.length - lineLimit} more lines; expand to view)`].join("\n");
}

function summarizeGitStatus(status: string | undefined): { lineCount: number; dirtyCount: number } {
	const lines = status?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
	const dirty = lines.filter((line) => !line.startsWith("##"));
	return { lineCount: lines.length, dirtyCount: dirty.length };
}

function appendRunBoundary(report: string, details: AuditDetails): string {
	const initial = summarizeGitStatus(details.initialGitStatus);
	const final = summarizeGitStatus(details.finalGitStatus);
	const statusChanged = (details.initialGitStatus ?? "") !== (details.finalGitStatus ?? "");
	const duration = details.endedAt ? formatDuration(details.endedAt - details.startedAt) : "unknown duration";
	const lines = [
		"---",
		"## Audit run boundary",
		`- Ran in an isolated in-memory Agent Workflow Audit subagent; intermediate tool transcript, raw command output, errors, retries, and search path were not added to the main session.`,
		`- Child run: ${details.turns} turn(s), ${details.toolCalls.length} tool call(s), ${duration}.`,
	];

	if (details.initialGitStatus !== undefined || details.finalGitStatus !== undefined) {
		lines.push(
			`- Git status check: ${statusChanged ? "changed" : "unchanged"} (${initial.dirtyCount} dirty item(s) before, ${final.dirtyCount} dirty item(s) after).`,
		);
	}

	return `${report.trim()}\n\n${lines.join("\n")}`.trim();
}

async function gitStatusShort(pi: ExtensionAPI, cwd: string, signal: AbortSignal | undefined): Promise<string | undefined> {
	const result = await pi.exec("git", ["status", "--short", "--branch"], {
		cwd,
		signal,
		timeout: GIT_STATUS_TIMEOUT_MS,
	});
	if (result.killed || result.code !== 0) return undefined;
	return result.stdout.trim();
}

function resolveToolPath(cwd: string, rawPath: unknown): string {
	const input = typeof rawPath === "string" && rawPath.trim() ? rawPath.trim() : ".";
	const normalized = input.startsWith("@") ? input.slice(1) : input;
	return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(cwd, normalized);
}

function isInside(parent: string, child: string): boolean {
	const parentResolved = path.resolve(parent);
	const childResolved = path.resolve(child);
	return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${path.sep}`);
}

async function assertToolPathInsideCwd(cwd: string, rawPath: unknown, toolName: string): Promise<string | undefined> {
	if (rawPath !== undefined && typeof rawPath !== "string") return `${toolName} path must be a string.`;
	const root = await fs.realpath(cwd).catch(() => path.resolve(cwd));
	const resolved = resolveToolPath(cwd, rawPath);
	const realPath = await fs.realpath(resolved).catch(() => resolved);
	if (!isInside(root, realPath)) return `${toolName} is limited to the audited checkout: ${realPath}`;
	return undefined;
}

function getUnsafePatternReason(value: unknown, label: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") return `${label} must be a string.`;
	if (path.isAbsolute(value)) return `${label} must be relative to the audited checkout.`;
	if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(value)) return `${label} must not traverse outside the audited checkout.`;
	return undefined;
}

type TokenizedSegment = { tokens: string[]; reason?: string };

const SAFE_DIRECT_COMMANDS = new Set([
	"bun",
	"cargo",
	"dotnet",
	"gh",
	"git",
	"go",
	"gradle",
	"gradlew",
	"just",
	"make",
	"mvn",
	"npm",
	"pnpm",
	"pwd",
	"pytest",
	"ruff",
	"swift",
	"task",
	"tox",
	"yarn",
]);

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
	"blame",
	"branch",
	"cat-file",
	"describe",
	"diff",
	"for-each-ref",
	"grep",
	"log",
	"ls-files",
	"ls-tree",
	"merge-base",
	"name-rev",
	"remote",
	"rev-parse",
	"shortlog",
	"show",
	"show-ref",
	"status",
	"whatchanged",
]);

const SAFE_GIT_GLOBAL_FLAGS = new Set(["--no-pager", "--no-optional-locks"]);
const SAFE_GIT_BRANCH_FLAGS = new Set([
	"-a",
	"--all",
	"-r",
	"--remotes",
	"-v",
	"-vv",
	"--show-current",
	"--list",
	"--contains",
	"--merged",
	"--no-merged",
]);
const GH_GLOBAL_OPTIONS_WITH_VALUE = new Set(["--repo", "-R", "--hostname", "--jq", "-q", "--template"]);
const GH_API_FIELD_FLAGS = new Set(["-f", "-F", "--field", "--raw-field", "--input"]);
const MUTATING_GH_API_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_ONLY_GH_SUBCOMMANDS: Record<string, Set<string> | undefined> = {
	api: undefined,
	auth: new Set(["status"]),
	issue: new Set(["view", "list", "status"]),
	label: new Set(["list"]),
	milestone: new Set(["list"]),
	pr: new Set(["view", "list", "diff", "status", "checks"]),
	release: new Set(["view", "list"]),
	repo: new Set(["view", "list"]),
	run: new Set(["view", "list"]),
	search: undefined,
	status: undefined,
	workflow: new Set(["view", "list"]),
};

function splitShellSegments(command: string): string[] | { reason: string } {
	if (/[`<>|;\n\r]/.test(command) || /\$\(/.test(command)) {
		return { reason: "Agent Workflow Audit bash blocks shell substitution, redirection, pipes, semicolons, and multi-line commands." };
	}
	if (/(^|[^&])&(?!&)|&&&/.test(command)) {
		return { reason: "Agent Workflow Audit bash allows only simple commands optionally joined by &&." };
	}
	return command.split(/&&/).map((segment) => segment.trim()).filter(Boolean);
}

function tokenizeSegment(segment: string): TokenizedSegment {
	const tokens: string[] = [];
	let token = "";
	let tokenStarted = false;
	let inSingleQuote = false;
	let inDoubleQuote = false;

	const pushToken = () => {
		if (!tokenStarted) return;
		tokens.push(token);
		token = "";
		tokenStarted = false;
	};

	for (let index = 0; index < segment.length; index += 1) {
		const char = segment[index];
		if (inSingleQuote) {
			if (char === "'") {
				inSingleQuote = false;
				continue;
			}
			token += char;
			tokenStarted = true;
			continue;
		}
		if (inDoubleQuote) {
			if (char === '"') {
				inDoubleQuote = false;
				continue;
			}
			if (char === "`" || char === "$") {
				return { tokens, reason: "Agent Workflow Audit bash blocks shell expansion inside quoted arguments." };
			}
			token += char;
			tokenStarted = true;
			continue;
		}
		if (/\s/.test(char)) {
			pushToken();
			continue;
		}
		if (char === "'") {
			inSingleQuote = true;
			tokenStarted = true;
			continue;
		}
		if (char === '"') {
			inDoubleQuote = true;
			tokenStarted = true;
			continue;
		}
		if (char === "\\") return { tokens, reason: "Agent Workflow Audit bash blocks shell escape sequences." };
		if (char === "$") return { tokens, reason: "Agent Workflow Audit bash blocks shell variable expansion." };
		if (/[{}[\]*?]/.test(char)) return { tokens, reason: "Agent Workflow Audit bash blocks shell glob and brace metacharacters." };
		token += char;
		tokenStarted = true;
	}

	if (inSingleQuote || inDoubleQuote) return { tokens, reason: "Agent Workflow Audit bash blocks unterminated shell quotes." };
	pushToken();
	return { tokens };
}

function getUnsafeShellFlagReason(token: string): string | undefined {
	const lower = token.toLowerCase();
	if (
		lower === "-c" || lower.startsWith("-c") ||
		lower === "-p" || lower.startsWith("-p") ||
		lower === "-f" || lower.startsWith("-f") ||
		lower === "--dir" || lower.startsWith("--dir=") ||
		lower === "--directory" || lower.startsWith("--directory=") ||
		lower === "--working-directory" || lower.startsWith("--working-directory=") ||
		lower === "--project-dir" || lower.startsWith("--project-dir=") ||
		lower === "--build-file" || lower.startsWith("--build-file=") ||
		lower === "--file" || lower.startsWith("--file=") ||
		lower === "--prefix" || lower.startsWith("--prefix=") ||
		lower === "--cwd" || lower.startsWith("--cwd=")
	) {
		return "Agent Workflow Audit bash blocks path-changing flags to avoid symlink/path escapes.";
	}
	return undefined;
}

function getUnsafeShellTokenReason(token: string): string | undefined {
	const values = [token];
	const equalsIndex = token.indexOf("=");
	if (equalsIndex >= 0 && equalsIndex < token.length - 1) values.push(token.slice(equalsIndex + 1));

	for (const value of values) {
		const normalized = value.startsWith("@") ? value.slice(1) : value;
		if (normalized === "~" || normalized.startsWith("~/") || /^~[^/\\]*/.test(normalized)) {
			return "Agent Workflow Audit bash blocks home-directory paths.";
		}
		if (path.isAbsolute(normalized)) return "Agent Workflow Audit bash blocks absolute paths; stay inside the audited checkout.";
		if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(normalized)) {
			return "Agent Workflow Audit bash blocks path traversal outside the audited checkout.";
		}
	}
	return undefined;
}

function getCommandName(token: string): string {
	return path.basename(token).toLowerCase();
}

function getBlockedCdReason(_tokens: string[]): string | undefined {
	return "Agent Workflow Audit blocks shell cd to keep bash execution pinned to the audited checkout root. Report documented subdirectory cd steps as manual or workflow friction.";
}

const PACKAGE_VALUE_FLAGS = new Set(["--filter", "--workspace", "-w", "--prefix", "-c", "--cwd"]);

function skipPackageFlagValue(lowerTokens: string[], index: number): number {
	const token = lowerTokens[index];
	if (PACKAGE_VALUE_FLAGS.has(token)) return index + 2;
	if (token.startsWith("--filter=") || token.startsWith("--workspace=") || token.startsWith("--prefix=") || token.startsWith("--cwd=")) return index + 1;
	return token.startsWith("-") ? index + 1 : index;
}

function getPackageFirstCommand(lowerTokens: string[]): { command?: string; index: number } {
	let index = 1;
	while (index < lowerTokens.length) {
		const next = skipPackageFlagValue(lowerTokens, index);
		if (next !== index) {
			index = next;
			continue;
		}
		return { command: lowerTokens[index], index };
	}
	return { index };
}

function getPackageRunScript(lowerTokens: string[], runIndex: number, commandName: string): string | undefined {
	if (runIndex < 0) return commandName === "yarn" ? getPackageFirstCommand(lowerTokens).command : undefined;
	for (let index = runIndex + 1; index < lowerTokens.length;) {
		const token = lowerTokens[index];
		if (token === "--") return lowerTokens[index + 1];
		const next = skipPackageFlagValue(lowerTokens, index);
		if (next !== index) {
			index = next;
			continue;
		}
		return token;
	}
	return undefined;
}

function getBlockedPackageManagerReason(commandName: string, tokens: string[]): string | undefined {
	const lowerTokens = tokens.map((token) => token.toLowerCase());
	if (lowerTokens.some((token) => token === "--prefix" || token.startsWith("--prefix=") || token === "--cwd" || token.startsWith("--cwd=") || token === "-c" || token === "--workspace" || token.startsWith("--workspace=") || token === "-w")) {
		return "Agent Workflow Audit blocks package-manager path/workspace flags to avoid symlink/path escapes.";
	}
	if (lowerTokens.some((token) => ["publish", "unpublish", "version", "deprecate", "dist-tag", "owner", "access", "token", "login", "logout", "adduser", "team", "profile", "org", "hook", "config"].includes(token))) {
		return "Agent Workflow Audit blocks package registry/account/config mutation commands.";
	}
	if (lowerTokens.some((token) => ["exec", "x", "dlx", "create"].includes(token))) {
		return "Agent Workflow Audit blocks package-manager arbitrary execution commands such as exec, dlx, x, and create.";
	}
	const { command: firstCommand, index: firstCommandIndex } = getPackageFirstCommand(lowerTokens);
	const allowedCommands = new Set(["install", "ci", "test", "run", "start", "build", "lint", "check"]);
	if (firstCommand && !allowedCommands.has(firstCommand)) {
		return `Agent Workflow Audit blocks ${commandName} ${firstCommand}; only install/ci/test/run/start/build/lint/check are allowed.`;
	}
	if (firstCommand === "install" || firstCommand === "ci") {
		if (lowerTokens.some((token) => token === "-f" || token === "--force" || token.startsWith("--force="))) return "Agent Workflow Audit blocks forced package installs.";
		if (lowerTokens.some((token) => token === "-g" || token === "--global" || token.startsWith("--global=") || token === "--location=global" || token === "--location")) return "Agent Workflow Audit blocks global package installs.";
	}
	if (firstCommand === "install") {
		for (let index = firstCommandIndex + 1; index < lowerTokens.length;) {
			const next = skipPackageFlagValue(lowerTokens, index);
			if (next !== index) {
				index = next;
				continue;
			}
			if (!lowerTokens[index].startsWith("-")) return "Agent Workflow Audit blocks package install operands; run documented dependency install commands without adding packages.";
			index += 1;
		}
	}
	const runnerIndex = lowerTokens.findIndex((token) => ["node", "python", "python3", "ruby", "php"].includes(token));
	if (runnerIndex >= 0) {
		const runnerReason = getBlockedInterpreterReason(lowerTokens[runnerIndex], lowerTokens.slice(runnerIndex));
		if (runnerReason) return runnerReason;
	}
	const runIndex = lowerTokens.indexOf("run");
	const script = getPackageRunScript(lowerTokens, runIndex, commandName);
	if (script && /(^|[:_-])(deploy|release|publish|clean|reset|fix|format)(?:$|[:_-])/.test(script)) {
		return "Agent Workflow Audit blocks deploy/release/publish/clean/reset/fix/format package scripts.";
	}
	if (lowerTokens.some((token) => token === "--fix" || token.startsWith("--fix="))) return "Agent Workflow Audit blocks package-script fix flags.";
	return undefined;
}

function getBlockedTaskRunnerReason(commandName: string, tokens: string[]): string | undefined {
	const lowerTokens = tokens.map((token) => token.toLowerCase());
	if (lowerTokens.some((token) => token === "-c" || token === "--directory" || token.startsWith("--directory="))) {
		return `Agent Workflow Audit blocks ${commandName} directory-changing flags to avoid symlink/path escapes.`;
	}
	const targets = lowerTokens.slice(1).filter((token) => !token.startsWith("-"));
	if (targets.some((target) => /(^|[:_-])(deploy|release|publish|install|clean|reset|fix|format)(?:$|[:_-])/.test(target))) {
		return `Agent Workflow Audit blocks ${commandName} deploy/release/publish/install/clean/reset/fix/format targets.`;
	}
	return undefined;
}

function getGitSubcommand(tokens: string[]): { subcommand?: string; index: number; reason?: string } {
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];
		if (!token.startsWith("-")) break;
		if (token === "-C" || token.startsWith("-C")) {
			return { index, reason: "Agent Workflow Audit blocks git -C to keep git inspection pinned to the audited checkout root." };
		}
		if (token === "--git-dir" || token.startsWith("--git-dir=") || token === "--work-tree" || token.startsWith("--work-tree=")) {
			return { index, reason: "Agent Workflow Audit blocks git options that can target repositories outside the audited checkout." };
		}
		if (token === "-c" || token.startsWith("-c")) {
			return { index, reason: "Agent Workflow Audit blocks git -c because aliases/config can change command behavior." };
		}
		if (SAFE_GIT_GLOBAL_FLAGS.has(token)) {
			index += 1;
			continue;
		}
		return { index, reason: `Agent Workflow Audit blocks git global option ${token}; use a direct read-only git command.` };
	}
	return { subcommand: tokens[index]?.toLowerCase(), index };
}

function isSafeGitBranchCommand(tokens: string[], subcommandIndex: number): boolean {
	const args = tokens.slice(subcommandIndex + 1);
	if (args.length === 0) return true;
	if (args.some((arg) => /^-(?:d|D|m|M|c|C|f)$/.test(arg) || /^--(?:delete|move|copy|force|set-upstream-to|unset-upstream)$/.test(arg))) {
		return false;
	}
	const hasReadOnlyMode = args.some((arg) => SAFE_GIT_BRANCH_FLAGS.has(arg) || arg.startsWith("--contains=") || arg.startsWith("--merged=") || arg.startsWith("--no-merged="));
	return hasReadOnlyMode && args.every((arg) => SAFE_GIT_BRANCH_FLAGS.has(arg) || arg.startsWith("--contains=") || arg.startsWith("--merged=") || arg.startsWith("--no-merged=") || !arg.startsWith("-"));
}

function isSafeGitRemoteCommand(tokens: string[], subcommandIndex: number): boolean {
	const args = tokens.slice(subcommandIndex + 1);
	if (args.length === 0) return true;
	if (args.length === 1 && (args[0] === "-v" || args[0] === "--verbose")) return true;
	const action = args.find((arg) => !arg.startsWith("-"));
	return action === "show" || action === "get-url";
}

function getUnsafeGitFlagReason(tokens: string[]): string | undefined {
	for (const token of tokens.slice(1)) {
		const lower = token.toLowerCase();
		if (lower === "--output" || lower.startsWith("--output=")) return "Agent Workflow Audit blocks git output-writing flags.";
		if (lower === "-o" || lower.startsWith("-o")) return "Agent Workflow Audit blocks git output-order/pager helper flags that can write or execute helpers.";
		if (lower === "--open-files-in-pager" || lower.startsWith("--open-files-in-pager=")) {
			return "Agent Workflow Audit blocks git pager-opening flags because pagers can execute local utilities.";
		}
		if (lower === "--ext-diff" || lower.startsWith("--ext-diff=") || lower === "--textconv" || lower.startsWith("--textconv=")) {
			return "Agent Workflow Audit blocks git external diff/text conversion flags because they can execute helpers.";
		}
		if (lower === "--no-index" || lower.startsWith("--no-index=")) return "Agent Workflow Audit blocks git --no-index because it can inspect arbitrary filesystem paths.";
		if (lower === "--exec-path" || lower.startsWith("--exec-path=")) return "Agent Workflow Audit blocks git exec-path overrides.";
	}
	return undefined;
}

function getBlockedGitReason(tokens: string[]): string | undefined {
	const unsafeFlagReason = getUnsafeGitFlagReason(tokens);
	if (unsafeFlagReason) return unsafeFlagReason;
	const parsed = getGitSubcommand(tokens);
	if (parsed.reason) return parsed.reason;
	if (!parsed.subcommand) return undefined;
	if (!READ_ONLY_GIT_SUBCOMMANDS.has(parsed.subcommand)) {
		return `Agent Workflow Audit blocks git ${parsed.subcommand}; only known read-only git subcommands are allowed.`;
	}
	if (parsed.subcommand === "branch" && !isSafeGitBranchCommand(tokens, parsed.index)) {
		return "Agent Workflow Audit allows git branch only for read-only listing/show-current/contains/merged queries.";
	}
	if (parsed.subcommand === "remote" && !isSafeGitRemoteCommand(tokens, parsed.index)) {
		return "Agent Workflow Audit allows git remote only for read-only list/show/get-url queries.";
	}
	return undefined;
}

function getGhCommand(tokens: string[]): { command?: string; subcommand?: string; index: number } {
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];
		if (!token.startsWith("-")) break;
		if (GH_GLOBAL_OPTIONS_WITH_VALUE.has(token)) {
			index += 2;
			continue;
		}
		if (["--repo=", "--hostname=", "--jq=", "--template="].some((prefix) => token.startsWith(prefix))) {
			index += 1;
			continue;
		}
		index += 1;
	}
	return { command: tokens[index]?.toLowerCase(), subcommand: tokens[index + 1]?.toLowerCase(), index };
}

function getBlockedGhApiReason(tokens: string[]): string | undefined {
	const parsed = getGhCommand(tokens);
	if (parsed.command !== "api") return undefined;
	const endpoint = tokens[parsed.index + 1]?.toLowerCase();
	if (endpoint === "graphql") return "Agent Workflow Audit blocks gh api graphql because it uses POST/body fields.";
	for (let index = parsed.index + 1; index < tokens.length; index += 1) {
		const token = tokens[index];
		const lower = token.toLowerCase();
		if (GH_API_FIELD_FLAGS.has(token) || lower.startsWith("--field=") || lower.startsWith("--raw-field=") || lower.startsWith("--input=") || /^-[fF]/.test(token)) {
			return "Agent Workflow Audit allows read-only gh api calls only; request fields and input files are blocked.";
		}
		let method: string | undefined;
		if (lower === "-x" || lower === "--method") method = tokens[index + 1];
		else if (lower.startsWith("-x") && token.length > 2) method = token.slice(2).replace(/^=/, "");
		else if (lower.startsWith("--method=")) method = token.slice("--method=".length);
		if (method && MUTATING_GH_API_METHODS.has(method.toUpperCase())) {
			return "Agent Workflow Audit allows read-only gh api calls only; mutating methods are blocked.";
		}
	}
	return undefined;
}

function getBlockedGhReason(tokens: string[]): string | undefined {
	const apiReason = getBlockedGhApiReason(tokens);
	if (apiReason) return apiReason;
	const parsed = getGhCommand(tokens);
	const command = parsed.command;
	if (!command) return undefined;
	if (!(command in READ_ONLY_GH_SUBCOMMANDS)) {
		return `Agent Workflow Audit blocks gh ${command}; only known read-only gh commands are allowed.`;
	}
	const allowedSubcommands = READ_ONLY_GH_SUBCOMMANDS[command];
	if (allowedSubcommands && (!parsed.subcommand || !allowedSubcommands.has(parsed.subcommand))) {
		return `Agent Workflow Audit blocks gh ${command}${parsed.subcommand ? ` ${parsed.subcommand}` : ""}; only known read-only gh subcommands are allowed.`;
	}
	if (command === "auth" && tokens.some((token) => {
		const lower = token.toLowerCase();
		return lower === "-t" || lower === "--show-token" || lower.startsWith("--show-token=");
	})) {
		return "Agent Workflow Audit blocks gh auth status --show-token because it reveals credentials.";
	}
	return undefined;
}

function hasInlineFlag(tokens: string[], flags: string[]): boolean {
	return tokens.some((token) => {
		const lower = token.toLowerCase();
		return flags.some((flag) => lower === flag || lower.startsWith(`${flag}=`) || (flag.length === 2 && lower.startsWith(flag) && lower !== flag.slice(0, 1)));
	});
}

function getBlockedInterpreterReason(commandName: string, tokens: string[]): string | undefined {
	const lowerTokens = tokens.map((token) => token.toLowerCase());
	if (["node", "deno", "bun"].includes(commandName) && hasInlineFlag(lowerTokens, ["-e", "--eval", "eval", "-p", "--print", "-r", "--require", "--import", "--preload", "--loader", "--experimental-loader"])) {
		return `Agent Workflow Audit blocks inline/preload ${commandName} execution; run documented project scripts instead.`;
	}
	if (["python", "python3"].includes(commandName) && hasInlineFlag(lowerTokens, ["-c"])) {
		return "Agent Workflow Audit blocks inline Python execution; run documented project scripts instead.";
	}
	if (["ruby", "php"].includes(commandName) && hasInlineFlag(lowerTokens, ["-e", "-r"])) {
		return `Agent Workflow Audit blocks inline/preload ${commandName} execution; run documented project scripts instead.`;
	}
	return undefined;
}

function getBlockedLocalToolReason(commandName: string, tokens: string[]): string | undefined {
	const lowerTokens = tokens.map((token) => token.toLowerCase());
	const firstCommand = lowerTokens.slice(1).find((token) => !token.startsWith("-"));
	if (commandName === "go") {
		if (!firstCommand || !["test", "build", "vet", "list", "version"].includes(firstCommand)) return `Agent Workflow Audit blocks go ${firstCommand ?? ""}; only test/build/vet/list/version are allowed.`;
	}
	if (commandName === "cargo") {
		if (!firstCommand || !["test", "build", "check", "clippy", "doc", "metadata", "tree", "version"].includes(firstCommand)) return `Agent Workflow Audit blocks cargo ${firstCommand ?? ""}; only test/build/check/clippy/doc/metadata/tree/version are allowed.`;
	}
	if (commandName === "ruff") {
		if (lowerTokens.some((token) => token === "--fix" || token.startsWith("--fix=") || token === "--fix-only" || token.startsWith("--fix-only=")) || firstCommand === "format") return "Agent Workflow Audit blocks ruff source-mutating fix/format commands.";
	}
	if (commandName === "dotnet") {
		if (firstCommand && ["add", "remove", "format", "tool", "new", "nuget"].includes(firstCommand)) return `Agent Workflow Audit blocks dotnet ${firstCommand} mutation commands.`;
	}
	if (commandName === "swift") {
		if (firstCommand && !["test", "build", "--version", "-version"].includes(firstCommand)) return `Agent Workflow Audit blocks swift ${firstCommand}; only test/build/version are allowed.`;
	}
	return undefined;
}

function getBlockedExecutableReason(tokens: string[]): string | undefined {
	const executable = tokens[0];
	if (!executable) return "Agent Workflow Audit bash requires a command.";
	if (executable.startsWith("/")) return "Agent Workflow Audit bash blocks absolute-path executables.";
	if (/[\\/]/.test(executable)) return "Agent Workflow Audit bash blocks path-qualified executables to avoid symlink/path escapes; use direct project/package commands.";

	const commandName = getCommandName(executable);
	if (commandName === "cd") return getBlockedCdReason(tokens);
	if (executable.startsWith("./")) return "Agent Workflow Audit blocks relative executables to avoid symlink/path escapes; use package-manager scripts or report the documented command as manual.";
	if (!SAFE_DIRECT_COMMANDS.has(commandName)) {
		return `Agent Workflow Audit bash blocks direct ${commandName || "shell"} commands; use read/grep/find/ls for inspection or documented project commands.`;
	}
	const interpreterReason = getBlockedInterpreterReason(commandName, tokens);
	if (interpreterReason) return interpreterReason;
	const localToolReason = getBlockedLocalToolReason(commandName, tokens);
	if (localToolReason) return localToolReason;
	if (["npm", "pnpm", "yarn", "bun"].includes(commandName)) return getBlockedPackageManagerReason(commandName, tokens);
	if (["make", "just", "task"].includes(commandName)) return getBlockedTaskRunnerReason(commandName, tokens);
	if (commandName === "cargo" && tokens.slice(1).some((token) => /^(publish|login|owner|yank|install|release)(?:$|[:_-])/i.test(token))) return "Agent Workflow Audit blocks cargo registry/user mutation commands.";
	if (commandName === "mvn") {
		const goals = tokens.slice(1).filter((token) => !token.startsWith("-")).map((token) => token.toLowerCase());
		const allowedGoals = new Set(["test", "verify", "package", "compile", "validate", "dependency:tree", "help:effective-pom", "--version"]);
		if (goals.some((goal) => !allowedGoals.has(goal))) return "Agent Workflow Audit allows mvn only for test/verify/package/compile/validate/dependency:tree/help:effective-pom.";
	}
	if (["gradle", "gradlew"].includes(commandName)) {
		const lowerTokens = tokens.map((token) => token.toLowerCase());
		if (lowerTokens.some((token) => token === "-p" || token === "--project-dir" || token.startsWith("--project-dir="))) return "Agent Workflow Audit blocks Gradle project-dir flags to avoid symlink/path escapes.";
		const tasks = lowerTokens.slice(1).filter((token) => !token.startsWith("-"));
		const allowedTasks = new Set(["test", "build", "check", "assemble", "tasks", "projects", "properties", "dependencies"]);
		if (tasks.some((task) => !allowedTasks.has(task))) return "Agent Workflow Audit allows Gradle only for test/build/check/assemble/tasks/projects/properties/dependencies.";
	}
	if (commandName === "dotnet" && tokens.slice(1).some((token, index, items) => token.toLowerCase() === "nuget" && ["push", "delete"].includes(items[index + 1]?.toLowerCase()))) return "Agent Workflow Audit blocks dotnet nuget mutation commands.";
	if (commandName === "git") return getBlockedGitReason(tokens);
	if (commandName === "gh") return getBlockedGhReason(tokens);
	return undefined;
}

function getBlockedBashReason(command: string, options: { planOnly: boolean }): string | undefined {
	const trimmed = command.trim();
	if (!trimmed) return "Agent Workflow Audit bash requires a non-empty command.";
	if (options.planOnly) return "Plan-only Agent Workflow Audit mode blocks bash/project command execution.";

	const segments = splitShellSegments(trimmed);
	if (!Array.isArray(segments)) return segments.reason;
	for (const segment of segments) {
		const tokenized = tokenizeSegment(segment);
		if (tokenized.reason) return tokenized.reason;
		const tokens = tokenized.tokens;
		if (tokens.length === 0) return "Agent Workflow Audit bash requires non-empty command segments.";
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) return "Agent Workflow Audit bash blocks inline environment assignments.";
		for (const token of tokens) {
			const flagReason = getUnsafeShellFlagReason(token);
			if (flagReason) return flagReason;
			const pathReason = getUnsafeShellTokenReason(token);
			if (pathReason) return pathReason;
		}
		const executableReason = getBlockedExecutableReason(tokens);
		if (executableReason) return executableReason;
	}

	return undefined;
}

function createAuditRuntimeGuardExtension(options: { cwd: string; maxTurns: number; planOnly: boolean }): ExtensionFactory {
	return (pi) => {
		let currentTurn = 0;

		pi.on("turn_start", async (event) => {
			currentTurn = event.turnIndex;
		});

		pi.on("tool_call", async (event) => {
			if (!["read", "grep", "find", "ls", "bash"].includes(event.toolName)) {
				return { block: true, reason: `agent-workflow-audit exposes only read, grep, find, ls, and guarded bash; ${event.toolName} is not allowed.` };
			}

			if (currentTurn >= options.maxTurns - 1) {
				return {
					block: true,
					reason: `Tool use is disabled on final agent-workflow-audit turn ${options.maxTurns}/${options.maxTurns}. Answer now with the evidence already gathered.`,
				};
			}

			if (event.toolName === "read") {
				const reason = await assertToolPathInsideCwd(options.cwd, (event.input as { path?: unknown }).path, "read");
				if (reason) return { block: true, reason };
			}

			if (event.toolName === "grep" || event.toolName === "find" || event.toolName === "ls") {
				const input = asRecord(event.input) ?? {};
				const reason = await assertToolPathInsideCwd(options.cwd, input.path, event.toolName);
				if (reason) return { block: true, reason };
				if (event.toolName === "grep") {
					const globReason = getUnsafePatternReason(input.glob, "grep glob");
					if (globReason) return { block: true, reason: globReason };
				}
				if (event.toolName === "find") {
					const patternReason = getUnsafePatternReason(input.pattern, "find pattern");
					if (patternReason) return { block: true, reason: patternReason };
				}
			}

			if (event.toolName === "bash") {
				const input = event.input as { command?: unknown; timeout?: unknown };
				if (typeof input.timeout !== "number") input.timeout = DEFAULT_BASH_TIMEOUT_SECONDS;
				else input.timeout = Math.min(MAX_BASH_TIMEOUT_SECONDS, Math.max(1, Math.floor(input.timeout)));
				const command = typeof input.command === "string" ? input.command : "";
				const reason = getBlockedBashReason(command, { planOnly: options.planOnly });
				if (reason) return { block: true, reason };
			}

			return undefined;
		});

		pi.on("tool_result", async (event) => ({
			content: [
				...(event.content ?? []),
				{
					type: "text",
					text: `\n\n[agent-workflow-audit turn budget] turn ${Math.min(currentTurn + 1, options.maxTurns)}/${options.maxTurns}`,
				},
			],
		}));
	};
}

function buildSystemPrompt(options: { cwd: string; maxTurns: number; maxRunSeconds: number; planOnly: boolean }): string {
	const executionMode = options.planOnly
		? "Plan-only mode is active. Do not run project commands with bash. Read instructions and manifests, infer the likely workflow, and report what would be tried plus remaining uncertainty."
		: "Execution mode is active. Try documented setup, build, lint, test, run, and other obvious project commands when they are safe and relevant. A runtime guard blocks deploy/publish/VCS-mutating/destructive commands; if a command is blocked, report it as a workflow/safety finding instead of trying to bypass it.";

	return `You are Agent Workflow Audit, an isolated subagent running inside The Last Harness. Your job is to stress-test how efficiently an agent can operate in the current repository and return a concise final audit report to the parent session.

Working directory: ${options.cwd}
Turn budget: ${options.maxTurns} turns total, including your final answer.
Wall-clock budget: ${options.maxRunSeconds} seconds.
${executionMode}

Goal:
Find ways to make the agent workflow more efficient, including vague instructions, broad or imprecise commands, unnecessary exploration, undocumented prerequisites, missing environment variables/services, mismatches between docs and actual scripts, contradictory instructions, and repeated context an agent should not need to rediscover.

Workflow:
1. Read agent-facing instructions in priority order: AGENTS.md, user-supplied focus notes, README files, package/tool manifests, and obvious config files.
2. Infer the intended workflow: install, environment setup, build, lint, test, run, smoke checks, release safety, or other standard checks.
3. Run documented commands first, exactly as written, unless plan-only mode is active or the runtime guard blocks them.
4. If a necessary step is undocumented but strongly implied, take the most conservative reasonable next step and label it as an inference and workflow gap.
5. Keep track of inefficiencies: missing prerequisites, unclear command names/order, undocumented tools/services/files/env vars, incomplete instructions, non-obvious scripts, contradictions, avoidable searches, retries, and command failures.
6. Distinguish instruction/prompt-design problems, command design problems, environment problems, and actual code/test failures.
7. If one command fails, continue adjacent non-destructive checks when they can still reveal workflow inefficiencies.

Constraints:
- Do not fix application code or failing tests. Do not edit, write, move, delete, commit, checkout, reset, clean, push, publish, deploy, or mutate GitHub.
- Use built-in read/grep/find/ls for file inspection. Use bash only for safe documented project commands or read-only local inspection.
- Do not paste raw full logs. Summarize command output and include short excerpts only when needed to prove a finding.
- Never present a command as successful unless tool output showed success.
- Mark inferred steps as assumptions.
- Optimize for agent efficiency, not a human-friendly narrative.

Your final answer is the only content intentionally returned to the main session. Intermediate tool transcript, command output, errors, retries, and search path stay in this isolated child session. Make the final answer useful enough for the main agent/user to act on without needing the raw transcript.

Output format, exact order:
## Summary
1-3 concise sentences.

## Commands attempted
For each attempted or deliberately skipped command: command, source (documented or inferred), result, and one-line evidence. If plan-only, list proposed commands instead.

## Workflow friction
Bullets grouped by instruction/prompt-design, command-design, environment, and code/test-failure causes where applicable.

## Recommended instruction improvements
Concrete changes to AGENTS.md/README/scripts. Prefer explicit shell commands and direct wording.

## Remaining assumptions or unknowns
Unresolved prerequisites, missing context, or checks that were unsafe/blocked/not worth running.

## Suggested next steps
1-5 concise next actions. If product code or tests need fixing, say that separately from instruction improvements.`;
}

function buildUserPrompt(options: { cwd: string; focus?: string; initialGitStatus?: string; planOnly: boolean }): string {
	return `Task: audit the current repository for agent workflow efficiency.

Local checkout: ${options.cwd}
Mode: ${options.planOnly ? "plan-only (do not execute project commands)" : "execute safe documented/inferred workflow commands"}
Focus notes: ${options.focus ?? "(none)"}
Initial git status --short --branch:
${options.initialGitStatus ?? "(not a git repo or status unavailable)"}

Read the repo instructions/manifests, try or plan the workflow according to the mode, then produce the required final audit report. Do not fix code or edit files.`;
}

function formatToolCall(call: ToolCall): string {
	const args = asRecord(call.args) ?? {};
	if (call.name === "read") {
		const readPath = typeof args.path === "string" ? args.path : "";
		const offset = typeof args.offset === "number" ? args.offset : undefined;
		const limit = typeof args.limit === "number" ? args.limit : undefined;
		const range = offset || limit ? `:${offset ?? 1}${limit ? `-${(offset ?? 1) + limit - 1}` : ""}` : "";
		return `read ${readPath}${range}`.trim();
	}
	if (call.name === "grep") {
		return `grep ${shorten(String(args.pattern ?? ""), 60)} ${String(args.path ?? ".")}`.trim();
	}
	if (call.name === "find") {
		return `find ${shorten(String(args.pattern ?? ""), 60)} ${String(args.path ?? ".")}`.trim();
	}
	if (call.name === "ls") return `ls ${String(args.path ?? ".")}`.trim();
	if (call.name === "bash") return `bash ${shorten(String(args.command ?? ""), 140)}`.trim();
	return call.name;
}

function updateAuditUi(ctx: ExtensionCommandContext, details: AuditDetails | undefined, preview?: string): void {
	if (!ctx.hasUI) return;
	if (!details || details.status !== "running") {
		ctx.ui.setStatus(STATUS_ID, undefined);
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}

	const theme = ctx.ui.theme;
	const elapsed = formatDuration(Date.now() - details.startedAt);
	ctx.ui.setStatus(
		STATUS_ID,
		`${theme.fg("accent", "🧭 workflow audit")} ${theme.fg("dim", `${details.mode} · ${details.turns} turns · ${details.toolCalls.length} tools · ${elapsed}`)}`,
	);

	const lastTool = details.toolCalls[details.toolCalls.length - 1];
	const lines = [
		"🧭 Agent Workflow Audit",
		`${details.mode} · ${details.turns} turn(s) · ${details.toolCalls.length} tool call(s) · ${elapsed}`,
	];
	if (lastTool) lines.push(`last tool: ${formatToolCall(lastTool)}`);
	if (preview?.trim()) lines.push(`preview: ${shorten(preview, 120)}`);
	ctx.ui.setWidget(WIDGET_ID, lines, { placement: "belowEditor" });
}

async function runAudit(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	options: { focus?: string; planOnly: boolean; initialGitStatus?: string },
): Promise<{ report: string; details: AuditDetails }> {
	if (!ctx.model) throw new Error("/agent-workflow-audit needs an active model, but ctx.model is unavailable.");

	const cwd = path.resolve(ctx.cwd);
	const mode: AuditMode = options.planOnly ? "plan-only" : "execute";
	const details: AuditDetails = {
		status: "running",
		mode,
		cwd,
		focus: options.focus,
		turns: 0,
		toolCalls: [],
		startedAt: Date.now(),
		initialGitStatus: options.initialGitStatus,
	};

	let lastContent = "(auditing agent workflow...)";
	let session: AgentSession | undefined;
	let unsubscribe: (() => void) | undefined;
	let runTimeout: NodeJS.Timeout | undefined;
	let abortListenerAdded = false;
	let aborted = Boolean(ctx.signal?.aborted);

	const emit = () => updateAuditUi(ctx, details, lastContent);
	const abort = () => {
		aborted = true;
		details.status = "aborted";
		details.endedAt = Date.now();
		lastContent = "Aborted";
		emit();
		void session?.abort();
	};

	if (ctx.signal?.aborted) abort();
	if (ctx.signal && !ctx.signal.aborted) {
		ctx.signal.addEventListener("abort", abort);
		abortListenerAdded = true;
	}

	try {
		emit();
		const isolatedSettingsManager = SettingsManager.inMemory({});
		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir: getAgentDir(),
			settingsManager: isolatedSettingsManager,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			extensionFactories: [createAuditRuntimeGuardExtension({ cwd, maxTurns: MAX_TURNS, planOnly: options.planOnly })],
			systemPromptOverride: () =>
				buildSystemPrompt({
					cwd,
					maxTurns: MAX_TURNS,
					maxRunSeconds: Math.round(MAX_RUN_MS / 1000),
					planOnly: options.planOnly,
				}),
			appendSystemPromptOverride: () => [],
			skillsOverride: () => ({ skills: [], diagnostics: [] }),
			promptsOverride: () => ({ prompts: [], diagnostics: [] }),
			themesOverride: () => ({ themes: [], diagnostics: [] }),
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		});

		await resourceLoader.reload();

		const tools = options.planOnly ? ["read", "grep", "find", "ls"] : ["read", "grep", "find", "ls", "bash"];
		const created = await createAgentSession({
			cwd,
			...getModelRuntimeOption(ctx),
			resourceLoader,
			settingsManager: isolatedSettingsManager,
			sessionManager: SessionManager.inMemory(cwd),
			model: ctx.model,
			thinkingLevel: pi.getThinkingLevel(),
			tools,
		});

		session = created.session;
		unsubscribe = session.subscribe((event) => {
			switch (event.type) {
				case "message_update":
					if (event.assistantMessageEvent?.type === "text_delta") {
						lastContent += event.assistantMessageEvent.delta ?? "";
						emit();
					}
					break;
				case "turn_end":
					details.turns += 1;
					emit();
					break;
				case "tool_execution_start":
					details.toolCalls.push({
						id: event.toolCallId,
						name: event.toolName,
						args: event.args,
						startedAt: Date.now(),
					});
					if (details.toolCalls.length > MAX_TOOL_CALLS_TO_KEEP) {
						details.toolCalls.splice(0, details.toolCalls.length - MAX_TOOL_CALLS_TO_KEEP);
					}
					emit();
					break;
				case "tool_execution_end": {
					const call = details.toolCalls.find((item) => item.id === event.toolCallId);
					if (call) {
						call.endedAt = Date.now();
						call.isError = event.isError;
					}
					emit();
					break;
				}
			}
		});

		if (!aborted) {
			const promptPromise = session.prompt(
				buildUserPrompt({
					cwd,
					focus: options.focus,
					initialGitStatus: options.initialGitStatus,
					planOnly: options.planOnly,
				}),
				{ expandPromptTemplates: false },
			);
			const timeoutPromise = new Promise<never>((_resolve, reject) => {
				runTimeout = setTimeout(() => {
					abort();
					reject(new Error(`/agent-workflow-audit timed out after ${Math.round(MAX_RUN_MS / 1000)} seconds.`));
				}, MAX_RUN_MS);
			});
			await Promise.race([promptPromise, timeoutPromise]);
		}

		const answer = session ? extractLastAssistantText(session.state.messages) : "";
		lastContent = answer || (aborted ? "Aborted" : "(no output)");
		details.status = aborted ? "aborted" : "done";
		details.endedAt = Date.now();
		details.reportLength = lastContent.length;
		emit();
		return { report: lastContent, details };
	} catch (error) {
		const wasAbort = aborted || isAbortLikeError(error);
		const message = wasAbort ? "Aborted" : error instanceof Error ? error.message : String(error);
		details.status = wasAbort ? "aborted" : "error";
		details.error = wasAbort ? undefined : message;
		details.endedAt = Date.now();
		lastContent = message;
		details.reportLength = lastContent.length;
		emit();
		return { report: `## Agent Workflow Audit failed\n\n${message}`, details };
	} finally {
		if (runTimeout) clearTimeout(runTimeout);
		if (ctx.signal && abortListenerAdded) ctx.signal.removeEventListener("abort", abort);
		unsubscribe?.();
		session?.dispose();
	}
}

export const __test__ = {
	appendRunBoundary,
	assertToolPathInsideCwd,
	buildSystemPrompt,
	buildUserPrompt,
	createAuditRuntimeGuardExtension,
	formatToolCall,
	getBlockedBashReason,
	parseArgs,
	renderCollapsedReport,
};

export default function agentWorkflowAuditExtension(pi: ExtensionAPI) {
	pi.registerMessageRenderer(CUSTOM_TYPE, (message, { expanded }, theme) => {
		const details = message.details as AuditDetails | undefined;
		const report = messageContentToText(message.content) || "(no report)";
		const status = details?.status ?? "done";
		const icon =
			status === "done"
				? theme.fg("success", "✓")
				: status === "error"
					? theme.fg("error", "✗")
					: status === "aborted"
						? theme.fg("warning", "◼")
						: theme.fg("warning", "⏳");
		const duration = details?.endedAt ? formatDuration(details.endedAt - details.startedAt) : undefined;
		const toolCount = details?.toolCallCount ?? details?.toolCalls.length ?? 0;
		const meta = details
			? `${details.mode} · ${details.turns} turns · ${toolCount} tools${duration ? ` · ${duration}` : ""}`
			: "final report";
		const header = `${icon} ${theme.fg("toolTitle", theme.bold("agent-workflow-audit "))}${theme.fg("dim", meta)}`;

		if (!expanded) {
			return new Text(`${header}\n\n${theme.fg("toolOutput", renderCollapsedReport(report))}`, 0, 0);
		}

		const container = new Container();
		container.addChild(new Text(header, 0, 0));
		if (details?.cwd) container.addChild(new Text(theme.fg("dim", `cwd: ${details.cwd}`), 0, 0));
		if (details?.focus) container.addChild(new Text(theme.fg("dim", `focus: ${details.focus}`), 0, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Markdown(report, 0, 0, getMarkdownTheme()));
		return container;
	});

	pi.registerCommand("agent-workflow-audit", {
		description: "Run an isolated repo workflow audit and return only the final report to this session",
		getArgumentCompletions: (prefix) => {
			const commands = ["--yes", "--plan-only", "--help"];
			const normalized = prefix.trim().toLowerCase();
			const matches = commands.filter((command) => command.startsWith(normalized));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const parsed = parseArgs(args);
			if (parsed.help) {
				notifyCommand(ctx, USAGE, "info");
				return;
			}
			if (parsed.error) {
				notifyCommand(ctx, parsed.error, "error");
				return;
			}
			if (!ctx.model) {
				notifyCommand(ctx, "/agent-workflow-audit needs an active model before it can run the isolated audit.", "error");
				return;
			}
			if (!parsed.planOnly && !parsed.yes) {
				if (!ctx.hasUI) {
					notifyCommand(ctx, `${USAGE}\n\nNon-interactive execution mode requires --yes or --plan-only.`, "warning");
					return;
				}
				const confirmed = await ctx.ui.confirm(
					"Run Agent Workflow Audit?",
					"An isolated subagent will read repo instructions and may execute documented setup/build/lint/test/run commands in the current checkout. Only the final audit report will be added to this session; intermediate command output, errors, retries, and tool transcript stay in the child session. Project commands may still create dependencies or build artifacts. Continue?",
				);
				if (!confirmed) return;
			}

			await ctx.waitForIdle();
			const initialGitStatus = await gitStatusShort(pi, ctx.cwd, ctx.signal).catch(() => undefined);
			let report = "";
			let details: AuditDetails | undefined;
			try {
				const result = await runAudit(pi, ctx, {
					focus: parsed.focus,
					planOnly: parsed.planOnly,
					initialGitStatus,
				});
				report = result.report;
				details = result.details;
			} finally {
				updateAuditUi(ctx, undefined);
			}

			if (!details) return;
			details.finalGitStatus = await gitStatusShort(pi, ctx.cwd, ctx.signal).catch(() => undefined);
			report = appendRunBoundary(report, details);
			details.reportLength = report.length;
			const parentDetails: AuditDetails = {
				...details,
				toolCallCount: details.toolCalls.length,
				toolCalls: [],
				initialGitStatus: undefined,
				finalGitStatus: undefined,
			};

			pi.sendMessage({
				customType: CUSTOM_TYPE,
				content: report,
				display: true,
				details: parentDetails,
			});

			if (!ctx.hasUI) console.log(report);
		},
	});
}
