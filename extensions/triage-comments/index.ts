import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { AgentSession, ExecResult, ExtensionAPI, ExtensionCommandContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import {
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
	createAgentSession,
	getAgentDir,
	getMarkdownTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const MAX_COMMENTS = 50;
const MAX_TOOL_CALLS_TO_KEEP = 80;
const MAX_TURNS = 8;
const MAX_RUN_MS = 8 * 60 * 1000;
const DEFAULT_BASH_TIMEOUT_SECONDS = 30;
const COLLAPSED_PREVIEW_LINES = 18;
const GH_COMMAND_TIMEOUT_MS = 30_000;
const GH_PR_METADATA_FIELDS = 'number,title,url,headRefName,headRefOid,baseRefName,baseRefOid';
const GH_REVIEW_THREADS_GRAPHQL_QUERY = `
query TriageCommentsReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 100) {
            nodes {
              id
              databaseId
            }
          }
        }
      }
    }
  }
}`;
const COMMENT_DISPLAY_BODY_LIMIT = 1200;
const TRIAGE_COMMAND_USAGE =
	"Usage: /triage-comments [paste | pr [<PR URL or number>] | <PR URL or number>]\nInteractive UI mode lets you paste feedback or fetch PR comments, optionally hide resolved/outdated inline review comments, then confirm all displayed comments or choose a subset such as 1,3-5. PR mode without a target first tries to detect an open PR for the current non-main branch.";
const IMPLEMENTATION_NOTE =
	"Do not implement changes from this triage automatically; ask the parent/user which option to take before implementation.";

const READ_ONLY_TOOL_NAMES = new Set(["read", "grep", "find", "ls", "bash"]);
const READ_ONLY_BASH_COMMANDS = new Set(["gh", "git", "pwd"]);
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
	"blame",
	"cat-file",
	"describe",
	"diff",
	"for-each-ref",
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
const SAFE_GIT_GLOBAL_FLAGS = new Set(["--no-pager", "--no-optional-locks"]);
const GH_GLOBAL_OPTIONS_WITH_VALUE = new Set(["--repo", "-R", "--hostname", "--jq", "-q", "--template"]);
const MUTATING_GH_API_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type TriageStatus = "running" | "done" | "error" | "aborted";

type CreateAgentSessionOptions = NonNullable<Parameters<typeof createAgentSession>[0]>;

function getModelRuntimeOption(ctx: { modelRegistry?: unknown }): Pick<CreateAgentSessionOptions, "modelRuntime"> {
	const modelRuntime = (ctx.modelRegistry as { runtime?: CreateAgentSessionOptions["modelRuntime"] } | undefined)?.runtime;
	return modelRuntime ? { modelRuntime } : {};
}

type ToolCall = {
	id: string;
	name: string;
	args: unknown;
	startedAt: number;
	endedAt?: number;
	isError?: boolean;
};

type TriageDetails = {
	status: TriageStatus;
	cwd: string;
	commentCount: number;
	turns: number;
	toolCalls: ToolCall[];
	startedAt: number;
	endedAt?: number;
	error?: string;
};

type NormalizedComment = {
	index: number;
	id?: string;
	body: string;
	path?: string;
	line?: number;
	startLine?: number;
	side?: string;
	diffHunk?: string;
	author?: string;
	url?: string;
	createdAt?: string;
	context?: string;
	metadata?: Record<string, unknown>;
};

type NormalizedInput = {
	comments: NormalizedComment[];
	pr?: Record<string, unknown>;
	base?: Record<string, unknown>;
	diff?: string;
	context?: string;
};

const CommentSchema = Type.Object({
	id: Type.Optional(Type.String({ description: "Stable comment identifier from GitHub or the caller." })),
	body: Type.String({ description: "The review comment text to triage." }),
	path: Type.Optional(Type.String({ description: "Repository-relative file path the comment refers to, when known." })),
	line: Type.Optional(Type.Number({ description: "1-indexed line number the comment refers to, when known." })),
	startLine: Type.Optional(Type.Number({ description: "Start line for a multi-line comment, when known." })),
	side: Type.Optional(Type.String({ description: "Diff side or thread side, for example RIGHT, LEFT, base, or head." })),
	diffHunk: Type.Optional(Type.String({ description: "GitHub diff hunk attached to the comment, when available." })),
	author: Type.Optional(Type.String({ description: "Review comment author, when available." })),
	url: Type.Optional(Type.String({ description: "Permalink to the review comment, when available." })),
	createdAt: Type.Optional(Type.String({ description: "Comment creation timestamp, when available." })),
	context: Type.Optional(Type.String({ description: "Any extra per-comment context supplied by the caller." })),
	metadata: Type.Optional(
		Type.Record(Type.String(), Type.Unknown({ description: "Structured per-comment metadata from the caller." })),
	),
});

const TriageCommentsParams = Type.Object({
	comments: Type.Array(Type.Union([Type.String(), CommentSchema]), {
		description: "Selected PR review comments to classify. Prefer objects with body, path, line, diffHunk, author, and url when available; plain strings are accepted for quick manual calls.",
		minItems: 1,
		maxItems: MAX_COMMENTS,
	}),
	pr: Type.Optional(
		Type.Object({
			number: Type.Optional(Type.Number({ description: "Pull request number." })),
			title: Type.Optional(Type.String({ description: "Pull request title." })),
			url: Type.Optional(Type.String({ description: "Pull request URL." })),
			repository: Type.Optional(Type.String({ description: "Repository in owner/name form, when known." })),
			headRef: Type.Optional(Type.String({ description: "PR head ref name, when known." })),
			headSha: Type.Optional(Type.String({ description: "PR head SHA, when known." })),
			baseRef: Type.Optional(Type.String({ description: "PR base ref name, when known." })),
			baseSha: Type.Optional(Type.String({ description: "PR base SHA, when known." })),
		}),
	),
	base: Type.Optional(
		Type.Object({
			branch: Type.Optional(Type.String({ description: "Base branch name, when known." })),
			sha: Type.Optional(Type.String({ description: "Base SHA, when known." })),
			mergeBase: Type.Optional(Type.String({ description: "Merge-base SHA, when known." })),
		}),
	),
	diff: Type.Optional(
		Type.String({
			description: "Optional PR diff, selected hunks, or command output that helps locate comments. The triage agent still verifies against the local checkout when possible.",
			maxLength: 200000,
		}),
	),
	context: Type.Optional(
		Type.String({
			description: "Optional caller notes, constraints, or already-collected read-only context for this triage run.",
			maxLength: 50000,
		}),
	),
});

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asTrimmedString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function normalizeComment(raw: unknown, index: number): NormalizedComment | undefined {
	if (typeof raw === "string") {
		const body = raw.trim();
		return body ? { index, body } : undefined;
	}

	const record = asRecord(raw);
	if (!record) return undefined;
	const body = asTrimmedString(record.body ?? record.text ?? record.comment);
	if (!body) return undefined;

	return {
		index,
		id: asStableIdPart(record.id, record.databaseId, record.nodeId),
		body,
		path: asTrimmedString(record.path ?? record.file ?? record.filePath),
		line: asFiniteNumber(record.line ?? record.position),
		startLine: asFiniteNumber(record.startLine ?? record.start_line),
		side: asTrimmedString(record.side),
		diffHunk: asTrimmedString(record.diffHunk ?? record.diff_hunk ?? record.hunk),
		author: githubLogin(record.author) ?? githubLogin(record.user) ?? asTrimmedString(record.login),
		url: asTrimmedString(record.url ?? record.htmlUrl ?? record.html_url),
		createdAt: asTrimmedString(record.createdAt ?? record.created_at),
		context: asTrimmedString(record.context ?? record.extraContext),
		metadata: asRecord(record.metadata ?? record.meta),
	};
}

function normalizeInput(params: unknown): NormalizedInput {
	const record = asRecord(params) ?? {};
	const rawComments = Array.isArray(record.comments) ? record.comments : [];
	const comments = rawComments
		.map((comment, index) => normalizeComment(comment, index + 1))
		.filter((comment): comment is NormalizedComment => Boolean(comment));

	if (comments.length === 0) {
		throw new Error("Invalid parameters: expected comments to include at least one non-empty comment body.");
	}

	return {
		comments,
		pr: asRecord(record.pr),
		base: asRecord(record.base),
		diff: asTrimmedString(record.diff ?? record.diffContext),
		context: asTrimmedString(record.context ?? record.extraContext),
	};
}

function prepareArguments(args: unknown): any {
	const record = asRecord(args);
	if (!record) return args;
	const prepared: Record<string, unknown> = { ...record };
	if (!("comments" in prepared) && "selectedComments" in prepared) prepared.comments = prepared.selectedComments;
	if (!("comments" in prepared) && "comment" in prepared) prepared.comments = [prepared.comment];
	if (!("pr" in prepared) && "prContext" in prepared) prepared.pr = prepared.prContext;
	if (!("base" in prepared) && "baseContext" in prepared) prepared.base = prepared.baseContext;
	if (!("diff" in prepared) && "diffContext" in prepared) prepared.diff = prepared.diffContext;
	return prepared;
}

function shorten(text: string, max: number): string {
	const oneLine = text.replace(/\s+/g, " ").trim();
	if (oneLine.length <= max) return oneLine;
	return `${oneLine.slice(0, Math.max(1, max - 1))}…`;
}

function formatJsonForPrompt(value: unknown): string {
	if (value === undefined) return "(not provided)";
	return JSON.stringify(value, null, 2);
}

function formatCommentForPrompt(comment: NormalizedComment): string {
	const fields = [
		`index: ${comment.index}`,
		comment.id ? `id: ${comment.id}` : undefined,
		comment.author ? `author: ${comment.author}` : undefined,
		comment.path ? `path: ${comment.path}` : undefined,
		comment.startLine ? `startLine: ${comment.startLine}` : undefined,
		comment.line ? `line: ${comment.line}` : undefined,
		comment.side ? `side: ${comment.side}` : undefined,
		comment.url ? `url: ${comment.url}` : undefined,
		comment.createdAt ? `createdAt: ${comment.createdAt}` : undefined,
	]
		.filter(Boolean)
		.join("\n");

	const sections = [`Comment ${comment.index}:`, fields, `body:\n${comment.body}`];
	if (comment.diffHunk) sections.push(`diffHunk:\n${comment.diffHunk}`);
	if (comment.metadata) sections.push(`metadata:\n${formatJsonForPrompt(comment.metadata)}`);
	if (comment.context) sections.push(`extraContext:\n${comment.context}`);
	return sections.filter(Boolean).join("\n");
}

function buildSystemPrompt(options: { cwd: string; maxTurns: number; maxRunSeconds: number }): string {
	return `You are Triage Comments, an isolated read-only code-review investigation agent running inside The Last Harness. Your job is to evaluate selected PR review comments against the local checkout and local git context.\n\nWorking directory: ${options.cwd}\nTurn budget: ${options.maxTurns} turns total, including your final answer.\nWall-clock budget: ${options.maxRunSeconds} seconds.\n\nAvailable tools are intended to be read-only: read, grep, find, ls, and bash. Use the built-in read, grep, find, and ls tools for local file inspection. Use bash only for a single read-only git, gh, or pwd invocation, such as git status/diff/show/log/blame, gh pr view/diff/list/status/checks, gh api GET calls, or pwd. A runtime guard blocks write/edit tools, shell pipelines/control operators, local filesystem utility commands, mutating git, and mutating gh/GitHub API calls.\n\nNon-negotiable constraints:\n- Never implement changes. Never edit, write, move, delete, format, commit, checkout, reset, clean, push, publish, or mutate GitHub.\n- Keep all inspection local to the checkout unless a read-only gh call is necessary for supplied PR metadata.\n- Treat the supplied comments as claims to verify, not as facts. Cite file paths, line ranges, git diff/status/log output, or supplied diff hunks as evidence.\n- If evidence is missing, stale, contradictory, or the local checkout does not match the PR context, say so and classify accordingly.\n- Distinguish objective correctness issues from style/preferences.\n- For valid or partially valid comments, propose one or more handling options, but do not choose implementation without parent/user confirmation.\n\nVerdicts must be one of: valid, invalid, partially valid, subjective, needs clarification.\n\nOutput format, exact order:\n## Summary\n1-3 concise sentences summarizing the triage.\n\n## Per-comment triage\nFor each selected comment, use:\n### Comment <index or id> — <verdict>\n- **What the reviewer asked:** concise paraphrase.\n- **Evidence:** path/line or command-output citations. If evidence is insufficient, state exactly what is missing.\n- **Reasoning:** why the evidence supports the verdict.\n- **Suggested response:** a short review-thread reply the parent/user can post or adapt.\n- **Handling options:** one or more options for valid/partially valid comments; for invalid/subjective/unclear comments, give the appropriate response/clarification path.\n\n## Read-only checks performed\nList the files/commands/probes used, or \`- (none)\`.\n\n## Before implementation\nState explicitly: \"Do not implement changes from this triage automatically; ask the parent/user which option to take before implementation.\"`;
}

function buildUserPrompt(input: NormalizedInput, cwd: string): string {
	return `Task: triage the selected PR review comments against the local checkout.\n\nLocal checkout: ${cwd}\n\nSelected comments:\n${input.comments.map(formatCommentForPrompt).join("\n\n---\n\n")}\n\nPR context:\n${formatJsonForPrompt(input.pr)}\n\nBase context:\n${formatJsonForPrompt(input.base)}\n\nOptional diff context:\n${input.diff ?? "(not provided)"}\n\nOptional caller context:\n${input.context ?? "(not provided)"}\n\nInspect only as much as needed to classify each comment with evidence. Do not implement anything. Respond using the required triage format.`;
}

function ensureImplementationNote(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return trimmed;
	if (trimmed.toLowerCase().includes(IMPLEMENTATION_NOTE.toLowerCase())) return trimmed;
	return `${trimmed}\n\n---\n${IMPLEMENTATION_NOTE}`;
}

function createEmptyUsage(): Usage {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

function addUsage(total: Usage, usage: Usage): void {
	total.input += usage.input || 0;
	total.output += usage.output || 0;
	total.cacheRead += usage.cacheRead || 0;
	total.cacheWrite += usage.cacheWrite || 0;
	if (usage.cacheWrite1h !== undefined) total.cacheWrite1h = (total.cacheWrite1h ?? 0) + usage.cacheWrite1h;
	if (usage.reasoning !== undefined) total.reasoning = (total.reasoning ?? 0) + usage.reasoning;
	total.totalTokens += usage.totalTokens || 0;
	total.cost.input += usage.cost?.input || 0;
	total.cost.output += usage.cost?.output || 0;
	total.cost.cacheRead += usage.cost?.cacheRead || 0;
	total.cost.cacheWrite += usage.cost?.cacheWrite || 0;
	total.cost.total += usage.cost?.total || 0;
}

type AssistantLikeMessage = { role?: string; content?: unknown; stopReason?: unknown; errorMessage?: unknown; usage?: unknown };

function addAssistantMessageUsage(total: Usage, message: unknown): void {
	const assistant = message as AssistantLikeMessage;
	if (assistant?.role !== "assistant" || !assistant.usage || typeof assistant.usage !== "object") return;
	addUsage(total, assistant.usage as Usage);
}

function aggregateAssistantUsage(messages: unknown[]): Usage {
	const total = createEmptyUsage();
	for (const message of messages) addAssistantMessageUsage(total, message);
	return total;
}

function addSessionEventUsage(total: Usage, event: unknown): void {
	const sessionEvent = event as { type?: string; message?: unknown; result?: { usage?: Usage } };
	if (sessionEvent?.type === "message_end") return void addAssistantMessageUsage(total, sessionEvent.message);
	if (sessionEvent?.type === "compaction_end" && sessionEvent.result?.usage) addUsage(total, sessionEvent.result.usage);
}

function inspectFinalAssistant(messages: unknown[]):
	| { ok: true; answer: string; stopReason?: string }
	| { ok: false; reason: string; stopReason?: string; errorMessage?: string } {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i] as AssistantLikeMessage;
		if (message?.role !== "assistant") continue;
		const stopReason = typeof message.stopReason === "string" ? message.stopReason.trim() : "";
		const errorMessage = typeof message.errorMessage === "string" ? message.errorMessage.trim() : "";
		const answer = Array.isArray(message.content)
			? message.content
				.map((part) => (part && typeof part === "object" && (part as { type?: string }).type === "text" && typeof (part as { text?: unknown }).text === "string"
					? (part as { text: string }).text
					: ""))
				.join("")
				.trim()
			: "";
		if (stopReason === "error") return { ok: false, reason: `triage_comments subagent error: ${errorMessage || "provider/model error"}`, stopReason, errorMessage };
		if (stopReason === "aborted") return { ok: false, reason: "triage_comments subagent aborted before producing a usable answer", stopReason };
		if (answer) return { ok: true, answer, stopReason: stopReason || undefined };
		return { ok: false, reason: stopReason ? `triage_comments subagent produced no final assistant text (stopReason: ${stopReason})` : "triage_comments subagent produced no final assistant text", stopReason: stopReason || undefined, errorMessage: errorMessage || undefined };
	}
	return { ok: false, reason: "triage_comments subagent produced no assistant message" };
}

function classifyRunFailure(error: unknown, aborted: boolean): { status: "aborted" | "error"; message: string; error?: string } {
	const message = aborted ? "Aborted" : error instanceof Error ? error.message : String(error);
	return { status: aborted ? "aborted" : "error", message, error: aborted ? undefined : message };
}

function isInside(parent: string, child: string): boolean {
	const parentResolved = path.resolve(parent);
	const childResolved = path.resolve(child);
	return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${path.sep}`);
}

function resolveToolPath(cwd: string, rawPath: string | undefined): string {
	const input = rawPath?.trim() || ".";
	const normalized = input.startsWith("@") ? input.slice(1) : input;
	return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(cwd, normalized);
}

async function assertToolPathInsideCwd(cwd: string, rawPath: unknown, toolName: string): Promise<string | undefined> {
	if (rawPath !== undefined && typeof rawPath !== "string") return `${toolName} path must be a string.`;
	const root = await fs.realpath(cwd).catch(() => path.resolve(cwd));
	const resolved = resolveToolPath(cwd, rawPath);
	const realPath = await fs.realpath(resolved).catch(() => resolved);
	if (!isInside(root, realPath)) return `${toolName} is limited to the local checkout: ${realPath}`;
	return undefined;
}

function getUnsafePathPatternReason(value: unknown, label: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") return `${label} must be a string.`;
	if (path.isAbsolute(value)) return `${label} must be relative to the local checkout.`;
	if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(value)) return `${label} must not traverse outside the local checkout.`;
	return undefined;
}

function stripTokenQuotes(token: string): string {
	if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
		return token.slice(1, -1);
	}
	return token;
}

type ShellTokenizeResult = {
	tokens: string[];
	reason?: string;
};

function tokenizeShellCommand(command: string): ShellTokenizeResult {
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

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		const next = command[index + 1] ?? "";

		if (inSingleQuote) {
			if (char === "'") {
				inSingleQuote = false;
				continue;
			}
			token += char;
			tokenStarted = true;
			continue;
		}

		if (char === "\\") {
			return {
				tokens,
				reason: "Triage bash blocks shell escape sequences; pass plain git, gh, or pwd arguments without backslashes.",
			};
		}

		if (inDoubleQuote) {
			if (char === '"') {
				inDoubleQuote = false;
				continue;
			}
			if (char === "`" || char === "$") {
				return {
					tokens,
					reason:
						char === "`" || next === "("
							? "Triage bash blocks command substitution."
							: "Triage bash blocks shell expansion in double quotes.",
				};
			}
			token += char;
			tokenStarted = true;
			continue;
		}

		if (char === "\n" || char === "\r") {
			return {
				tokens,
				reason:
					"Triage bash allows one git, gh, or pwd invocation only; pipelines, shell control operators, and multiple commands are blocked.",
			};
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
		if (char === "`") {
			return { tokens, reason: "Triage bash blocks command substitution." };
		}
		if (char === "$") {
			return {
				tokens,
				reason:
					next === "'" || next === '"'
						? "Triage bash blocks ANSI-C and localized shell quotes."
						: next === "("
							? "Triage bash blocks command substitution."
							: "Triage bash blocks shell expansion.",
			};
		}
		if (/[;&|()]/.test(char)) {
			return {
				tokens,
				reason:
					"Triage bash allows one git, gh, or pwd invocation only; pipelines, shell control operators, and multiple commands are blocked.",
			};
		}
		if (char === ">" || char === "<") {
			return { tokens, reason: "Triage bash blocks shell redirection to keep inspection read-only." };
		}
		if (char === "{" || char === "}") {
			return { tokens, reason: "Triage bash blocks shell brace expansion." };
		}
		if (char === "*" || char === "?" || char === "[" || char === "]") {
			return { tokens, reason: "Triage bash blocks shell glob expansion." };
		}
		if (char === "~" && !tokenStarted) {
			return { tokens, reason: "Triage bash blocks shell home-directory expansion." };
		}

		token += char;
		tokenStarted = true;
	}

	if (inSingleQuote || inDoubleQuote) return { tokens, reason: "Triage bash blocks unterminated or malformed shell quoting." };
	pushToken();
	return { tokens };
}

function tokenizeSegment(segment: string): string[] {
	return tokenizeShellCommand(segment).tokens;
}

function getExecutableName(token: string): string {
	return path.basename(token).toLowerCase();
}

function getShellSyntaxReason(command: string): string | undefined {
	return tokenizeShellCommand(command).reason;
}

function getUnsafeGitTokenPathReason(token: string): string | undefined {
	const valueParts = [token];
	const equalsIndex = token.indexOf("=");
	if (equalsIndex >= 0 && equalsIndex < token.length - 1) valueParts.push(token.slice(equalsIndex + 1));
	for (const value of valueParts) {
		const normalized = value.startsWith("@") ? value.slice(1) : value;
		if (normalized === "~" || normalized.startsWith("~/") || /^~[^/\\]*/.test(normalized)) {
			return "Triage bash git arguments must not use home-directory paths; use built-in read/grep/find/ls for local files.";
		}
		if (path.isAbsolute(normalized)) {
			return "Triage bash git arguments must not use absolute filesystem paths; use built-in read/grep/find/ls for local files.";
		}
		if (/(^|[/\\])\.\.(?:[/\\]|$)/.test(normalized)) {
			return "Triage bash git arguments must not traverse outside the local checkout.";
		}
	}
	return undefined;
}

function getBlockedPwdReason(tokens: string[]): string | undefined {
	const args = tokens.slice(1);
	if (args.length === 0) return undefined;
	if (args.length === 1 && (args[0] === "-P" || args[0] === "-L")) return undefined;
	return "Triage bash allows pwd only with no arguments or -P/-L.";
}

function getGitSubcommand(tokens: string[]): { subcommand?: string; index: number; reason?: string } {
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];
		if (!token.startsWith("-")) break;
		if (token === "--git-dir" || token.startsWith("--git-dir=")) {
			return { index, reason: "Triage bash blocks git --git-dir because it can inspect or mutate outside the checkout." };
		}
		if (token === "--work-tree" || token.startsWith("--work-tree=")) {
			return { index, reason: "Triage bash blocks git --work-tree because it can inspect or mutate outside the checkout." };
		}
		if (token === "-C") {
			const gitCwd = tokens[index + 1];
			if (gitCwd !== ".") {
				return { index, reason: "Triage bash only allows git -C .; run git from the local checkout." };
			}
			index += 2;
			continue;
		}
		if (token.startsWith("-C")) {
			if (token !== "-C.") {
				return { index, reason: "Triage bash only allows git -C .; run git from the local checkout." };
			}
			index += 1;
			continue;
		}
		if (token === "--paginate" || token === "-p") {
			return { index, reason: "Triage bash blocks git pagination because pagers can execute local utilities." };
		}
		if (SAFE_GIT_GLOBAL_FLAGS.has(token)) {
			index += 1;
			continue;
		}
		return { index, reason: `Triage bash blocks git global option ${token}; use direct read-only git inspection commands from the checkout.` };
	}
	return { subcommand: tokens[index]?.toLowerCase(), index };
}

function isSafeGitBranchCommand(tokens: string[], subcommandIndex: number): boolean {
	const args = tokens.slice(subcommandIndex + 1);
	if (args.length === 0) return true;
	if (args.some((arg) => /^-(?:d|D|m|M|c|C|f)$/.test(arg) || /^--(?:delete|move|copy|force|set-upstream-to|unset-upstream)$/.test(arg))) {
		return false;
	}
	return args.some((arg) => SAFE_GIT_BRANCH_FLAGS.has(arg) || arg.startsWith("--contains=") || arg.startsWith("--merged=") || arg.startsWith("--no-merged="));
}

function isSafeGitRemoteCommand(tokens: string[], subcommandIndex: number): boolean {
	const args = tokens.slice(subcommandIndex + 1);
	if (args.length === 0) return true;
	if (args.length === 1 && (args[0] === "-v" || args[0] === "--verbose")) return true;
	const remoteAction = args.find((arg) => !arg.startsWith("-"));
	return remoteAction === "show" || remoteAction === "get-url";
}

function getUnsafeGitArgumentReason(tokens: string[]): string | undefined {
	for (const token of tokens.slice(1)) {
		if (token === "--no-index" || token.startsWith("--no-index=")) {
			return "Triage bash blocks git --no-index because it can inspect arbitrary filesystem paths outside the checkout.";
		}
		if (token === "--paginate" || token.startsWith("--paginate=")) {
			return "Triage bash blocks git --paginate because pagers can execute local utilities.";
		}
		if (token === "--open-files-in-pager" || token.startsWith("--open-files-in-pager=")) {
			return "Triage bash blocks git --open-files-in-pager because it can execute local utilities.";
		}
		if (token === "-O" || token.startsWith("-O")) {
			return "Triage bash blocks git -O because it can execute local utilities for some subcommands.";
		}
		if (token === "--ext-diff" || token.startsWith("--ext-diff=")) {
			return "Triage bash blocks git --ext-diff because it can execute external diff helpers.";
		}
		if (token === "--textconv" || token.startsWith("--textconv=")) {
			return "Triage bash blocks git --textconv because it can execute external text conversion filters.";
		}
		if (token === "--output" || token.startsWith("--output=")) {
			return "Triage bash blocks git output-writing flags.";
		}
		const pathReason = getUnsafeGitTokenPathReason(token);
		if (pathReason) return pathReason;
	}
	return undefined;
}

function getBlockedGitReason(command: string): string | undefined {
	const tokens = tokenizeSegment(command);
	if (getExecutableName(tokens[0] ?? "") !== "git") return undefined;
	const parsed = getGitSubcommand(tokens);
	if (parsed.reason) return parsed.reason;
	const argumentReason = getUnsafeGitArgumentReason(tokens);
	if (argumentReason) return argumentReason;
	if (!parsed.subcommand) return undefined;
	if (parsed.subcommand === "branch") {
		if (!isSafeGitBranchCommand(tokens, parsed.index)) {
			return "Triage bash allows git branch only for read-only listing/show-current/contains/merged queries.";
		}
		return undefined;
	}
	if (parsed.subcommand === "remote") {
		if (!isSafeGitRemoteCommand(tokens, parsed.index)) {
			return "Triage bash allows git remote only for read-only list/show/get-url queries.";
		}
		return undefined;
	}
	if (!READ_ONLY_GIT_SUBCOMMANDS.has(parsed.subcommand)) {
		return `Triage bash blocks git ${parsed.subcommand}; only known read-only git subcommands are allowed.`;
	}
	return undefined;
}

function getGhCommand(tokens: string[]): { command?: string; subcommand?: string } {
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];
		if (!token.startsWith("-")) break;
		if (GH_GLOBAL_OPTIONS_WITH_VALUE.has(token)) {
			index += 2;
			continue;
		}
		index += 1;
	}
	return { command: tokens[index]?.toLowerCase(), subcommand: tokens[index + 1]?.toLowerCase() };
}

function normalizeFlagValue(value: string | undefined): string | undefined {
	return value ? stripTokenQuotes(value).trim() : undefined;
}

function getBlockedGhApiReason(tokens: string[]): string | undefined {
	const parsed = getGhCommand(tokens);
	if (parsed.command !== "api") return undefined;
	if (tokens.find((token) => token.toLowerCase() === "graphql")) {
		return "Triage bash blocks gh api graphql because it uses POST/body fields.";
	}
	for (let index = 1; index < tokens.length; index += 1) {
		const token = tokens[index];
		const lowerToken = token.toLowerCase();
		if (
			token === "-f" ||
			token === "-F" ||
			token === "--field" ||
			token === "--raw-field" ||
			token === "--input" ||
			lowerToken.startsWith("-f") ||
			lowerToken.startsWith("--field=") ||
			lowerToken.startsWith("--raw-field=") ||
			lowerToken.startsWith("--input=")
		) {
			return "Triage bash allows read-only gh api calls only; request fields and input files are blocked.";
		}

		let method: string | undefined;
		if (lowerToken === "-x" || lowerToken === "--method") {
			method = normalizeFlagValue(tokens[index + 1]);
		} else if (lowerToken.startsWith("-x") && token.length > 2) {
			method = normalizeFlagValue(token.slice(2).replace(/^=/, ""));
		} else if (lowerToken.startsWith("--method=")) {
			method = normalizeFlagValue(token.slice("--method=".length));
		}
		if (method && MUTATING_GH_API_METHODS.has(method.toUpperCase())) {
			return "Triage bash allows read-only gh api calls only; mutating methods are blocked.";
		}
	}
	return undefined;
}

function isReadOnlyGhCommand(command: string | undefined, subcommand: string | undefined): boolean {
	if (!command) return true;
	if (command === "api") return true;
	if (command === "search") return true;
	if (command === "repo") return subcommand === "view" || subcommand === "list";
	if (command === "pr") return subcommand === "view" || subcommand === "list" || subcommand === "diff" || subcommand === "status" || subcommand === "checks";
	if (command === "issue") return subcommand === "view" || subcommand === "list" || subcommand === "status";
	if (command === "release") return subcommand === "view" || subcommand === "list";
	if (command === "run") return subcommand === "view" || subcommand === "list";
	if (command === "workflow") return subcommand === "view" || subcommand === "list";
	if (command === "label") return subcommand === "list";
	if (command === "milestone") return subcommand === "list";
	return false;
}

function getBlockedGhReason(command: string): string | undefined {
	const tokens = tokenizeSegment(command);
	if (getExecutableName(tokens[0] ?? "") !== "gh") return undefined;
	if (/\bgh\s+auth\s+(?:login|logout|refresh|setup-git|token)\b/i.test(command)) {
		return "Triage bash blocks gh auth commands and token inspection.";
	}
	const apiReason = getBlockedGhApiReason(tokens);
	if (apiReason) return apiReason;
	if (/\bgh\s+(?:repo\s+(?:archive|clone|create|delete|edit|fork|rename|sync)|pr\s+(?:checkout|close|comment|create|edit|lock|merge|ready|reopen|review|unlock)|issue\s+(?:close|comment|create|delete|edit|lock|reopen|transfer|unlock)|release\s+(?:create|delete|edit|upload)|workflow\s+run|run\s+(?:cancel|delete|rerun)|gist\s+(?:create|delete|edit))\b/i.test(command)) {
		return "Triage bash blocks mutating gh commands.";
	}
	const parsed = getGhCommand(tokens);
	if (!isReadOnlyGhCommand(parsed.command, parsed.subcommand)) {
		return `Triage bash blocks gh ${[parsed.command, parsed.subcommand].filter(Boolean).join(" ")}; only known read-only gh commands are allowed.`;
	}
	return undefined;
}

function getBlockedBashReason(command: string): string | undefined {
	const trimmed = command.trim();
	if (!trimmed) return "Triage bash requires a non-empty command.";
	if (/`|\$\(/.test(trimmed)) return "Triage bash blocks command substitution.";
	const syntaxReason = getShellSyntaxReason(trimmed);
	if (syntaxReason) return syntaxReason;

	const tokens = tokenizeSegment(trimmed);
	if (tokens.length === 0) return "Triage bash requires a non-empty command.";
	if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) return "Triage bash blocks inline environment assignment.";
	if (/[\\/]/.test(tokens[0])) {
		return "Triage bash requires direct git, gh, or pwd invocation without path-qualified executables.";
	}

	const executable = getExecutableName(tokens[0]);
	if (!READ_ONLY_BASH_COMMANDS.has(executable)) {
		return `Triage bash blocks ${executable || "this command"}; use built-in read/grep/find/ls for local files or read-only git/gh inspection commands.`;
	}
	if (executable === "pwd") return getBlockedPwdReason(tokens);
	if (executable === "git") return getBlockedGitReason(trimmed);
	if (executable === "gh") return getBlockedGhReason(trimmed);
	return undefined;
}

function createTriageRuntimeGuardExtension(options: { cwd: string; maxTurns: number }): ExtensionFactory {
	return (pi) => {
		let currentTurn = 0;

		pi.on("turn_start", async (event) => {
			currentTurn = event.turnIndex;
		});

		pi.on("tool_call", async (event) => {
			if (!READ_ONLY_TOOL_NAMES.has(event.toolName)) {
				return { block: true, reason: `triage_comments exposes read-only tools only; ${event.toolName} is not allowed.` };
			}

			if (currentTurn >= options.maxTurns - 1) {
				return {
					block: true,
					reason: `Tool use is disabled on final triage_comments turn ${options.maxTurns}/${options.maxTurns}. Answer now with the evidence already gathered.`,
				};
			}

			if (event.toolName === "read") {
				const reason = await assertToolPathInsideCwd(options.cwd, (event.input as { path?: unknown }).path, "read");
				if (reason) return { block: true, reason };
			}

			if (event.toolName === "grep" || event.toolName === "find" || event.toolName === "ls") {
				const reason = await assertToolPathInsideCwd(options.cwd, (event.input as { path?: unknown }).path, event.toolName);
				if (reason) return { block: true, reason };
				if (event.toolName === "grep") {
					const globReason = getUnsafePathPatternReason((event.input as { glob?: unknown }).glob, "grep glob");
					if (globReason) return { block: true, reason: globReason };
				}
				if (event.toolName === "find") {
					const patternReason = getUnsafePathPatternReason((event.input as { pattern?: unknown }).pattern, "find pattern");
					if (patternReason) return { block: true, reason: patternReason };
				}
			}

			if (event.toolName === "bash") {
				const input = event.input as { command?: unknown; timeout?: unknown };
				if (typeof input.timeout !== "number") input.timeout = DEFAULT_BASH_TIMEOUT_SECONDS;
				const command = typeof input.command === "string" ? input.command : "";
				const reason = getBlockedBashReason(command);
				if (reason) return { block: true, reason };
			}

			return undefined;
		});

		pi.on("tool_result", async (event) => ({
			content: [
				...(event.content ?? []),
				{
					type: "text",
					text: `\n\n[triage_comments turn budget] turn ${Math.min(currentTurn + 1, options.maxTurns)}/${options.maxTurns}`,
				},
			],
		}));
	};
}

function formatToolCall(call: ToolCall): string {
	const args = call.args && typeof call.args === "object" ? (call.args as Record<string, unknown>) : {};
	if (call.name === "read") {
		const readPath = typeof args.path === "string" ? args.path : "";
		const offset = typeof args.offset === "number" ? args.offset : undefined;
		const limit = typeof args.limit === "number" ? args.limit : undefined;
		const range = offset || limit ? `:${offset ?? 1}${limit ? `-${(offset ?? 1) + limit - 1}` : ""}` : "";
		return `read ${readPath}${range}`.trim();
	}
	if (call.name === "grep") {
		const pattern = typeof args.pattern === "string" ? args.pattern : "";
		const grepPath = typeof args.path === "string" ? args.path : ".";
		return `grep ${shorten(pattern, 50)} ${grepPath}`.trim();
	}
	if (call.name === "find") {
		const pattern = typeof args.pattern === "string" ? args.pattern : "";
		const findPath = typeof args.path === "string" ? args.path : ".";
		return `find ${shorten(pattern, 50)} ${findPath}`.trim();
	}
	if (call.name === "ls") {
		return `ls ${typeof args.path === "string" ? args.path : "."}`.trim();
	}
	if (call.name === "bash") {
		const command = typeof args.command === "string" ? args.command : "";
		return `bash ${shorten(command, 120)}`.trim();
	}
	return call.name;
}

function renderAnswer(details: TriageDetails): string {
	if (details.error) return details.error;
	return details.status === "running" ? "(triaging comments...)" : "(no output)";
}

type TriageCommandMode = 'paste' | 'pr';

type ParsedTriageCommandArgs = {
	mode?: TriageCommandMode;
	target?: string;
	pastePrefill?: string;
	help?: boolean;
	error?: string;
};

type PullRequestUrlParts = {
	host: string;
	owner: string;
	repo: string;
	number: number;
};

type PullRequestContext = {
	number: number;
	title?: string;
	url?: string;
	repository: string;
	host?: string;
	headRef?: string;
	headSha?: string;
	baseRef?: string;
	baseSha?: string;
};

type ReviewThreadState = {
	threadId?: string;
	isResolved?: boolean;
	isOutdated?: boolean;
	metadataAvailable: boolean;
};

type ReviewThreadStateLookup = {
	byDatabaseId: Map<number, ReviewThreadState>;
	byNodeId: Map<string, ReviewThreadState>;
};

type InlineCommentFilter = {
	hideResolved: boolean;
	hideOutdated: boolean;
	label: string;
};

type AppliedInlineCommentFilter = {
	filter: InlineCommentFilter;
	originalCount: number;
	displayedCount: number;
	hiddenInlineCount: number;
	hiddenResolvedInlineCount: number;
	hiddenOutdatedInlineCount: number;
	keptInlineWithoutThreadMetadataCount: number;
};

type CommandComment = {
	id: string;
	body: string;
	path?: string;
	line?: number;
	startLine?: number;
	side?: string;
	diffHunk?: string;
	author?: string;
	url?: string;
	createdAt?: string;
	reviewThread?: ReviewThreadState;
	metadata: Record<string, unknown>;
	sourceLabel: string;
	displayNumber?: number;
	sortTimestamp?: string;
	sortIndex: number;
};

type SelectionParseResult = { ok: true; indices: number[] } | { ok: false; error: string };

type TriageCommandPayload = {
	comments: Record<string, unknown>[];
	pr?: Record<string, unknown>;
	base?: Record<string, unknown>;
	context?: string;
};

function notifyCommand(
	ctx: ExtensionCommandContext,
	message: string,
	type: 'info' | 'warning' | 'error' = 'info',
): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, type);
		return;
	}

	const writer = type === 'error' ? console.error : console.log;
	writer(message);
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
	const compacted: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.trim() === '') continue;
		if (Array.isArray(value) && value.length === 0) continue;
		if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) {
			continue;
		}
		compacted[key] = value;
	}
	return compacted;
}

function optionalRecord(record: Record<string, unknown>): Record<string, unknown> | undefined {
	const compacted = compactRecord(record);
	return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function asStableIdPart(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) return String(value);
		const trimmed = asTrimmedString(value);
		if (trimmed) return trimmed;
	}
	return undefined;
}

function parsePullRequestUrl(raw: string): PullRequestUrlParts | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;

	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
		const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
		if (segments.length < 4 || segments[2] !== 'pull') return undefined;
		const number = Number(segments[3]);
		if (!Number.isInteger(number) || number <= 0) return undefined;
		return {
			host: url.hostname.replace(/^www\./i, ''),
			owner: segments[0],
			repo: segments[1],
			number,
		};
	} catch {
		return undefined;
	}
}

function looksLikePrTarget(value: string): boolean {
	const trimmed = value.trim();
	return /^#?\d+$/.test(trimmed) || Boolean(parsePullRequestUrl(trimmed));
}

function normalizePrTarget(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (/^#?\d+$/.test(trimmed)) return trimmed.replace(/^#/, '');
	if (parsePullRequestUrl(trimmed)) return trimmed;
	return undefined;
}

function parseTriageCommandArgs(args: string): ParsedTriageCommandArgs {
	const trimmed = args.trim();
	if (!trimmed) return {};

	const [first = ''] = trimmed.split(/\s+/, 1);
	const normalized = first.toLowerCase();
	const rest = trimmed.slice(first.length).trim();

	if (normalized === '--help' || normalized === '-h' || normalized === 'help') return { help: true };
	if (normalized === 'paste' || normalized === 'manual') return { mode: 'paste', pastePrefill: rest || undefined };
	if (normalized === 'pr' || normalized === 'pull' || normalized === 'pull-request') return { mode: 'pr', target: rest || undefined };
	if (looksLikePrTarget(trimmed)) return { mode: 'pr', target: trimmed };

	return { error: `Unknown /triage-comments option: ${first}\n${TRIAGE_COMMAND_USAGE}` };
}

function formatExecFailure(result: ExecResult): string {
	const details = (result.stderr || result.stdout).trim();
	if (!details) return `exit code ${result.code}`;
	const lines = details.split('\n').filter(Boolean);
	return lines.slice(-6).join('\n');
}

async function execChecked(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	command: string,
	args: string[],
	label: string,
): Promise<string> {
	const result = await pi.exec(command, args, { cwd: ctx.cwd, signal: ctx.signal, timeout: GH_COMMAND_TIMEOUT_MS });
	if (result.killed) throw new Error(`${label} timed out or was cancelled.`);
	if (result.code !== 0) throw new Error(`${label} failed: ${formatExecFailure(result)}`);
	return result.stdout;
}

async function assertGitRepo(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const result = await pi.exec('git', ['rev-parse', '--show-toplevel'], {
		cwd: ctx.cwd,
		signal: ctx.signal,
		timeout: GH_COMMAND_TIMEOUT_MS,
	});
	if (result.killed) throw new Error('Checking the git repository timed out or was cancelled.');
	if (result.code !== 0) {
		throw new Error('/triage-comments PR mode must run inside a git repository. Open The Last Harness in a checkout and retry.');
	}
}

async function assertGhReady(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const version = await pi.exec('gh', ['--version'], { cwd: ctx.cwd, signal: ctx.signal, timeout: GH_COMMAND_TIMEOUT_MS });
	if (version.killed) throw new Error('Checking GitHub CLI availability timed out or was cancelled.');
	if (version.code !== 0) {
		throw new Error('GitHub CLI `gh` is required for PR mode but was not found or could not run. Install `gh`, then authenticate with `gh auth login`.');
	}

	const auth = await pi.exec('gh', ['auth', 'status'], { cwd: ctx.cwd, signal: ctx.signal, timeout: GH_COMMAND_TIMEOUT_MS });
	if (auth.killed) throw new Error('Checking GitHub CLI authentication timed out or was cancelled.');
	if (auth.code !== 0) {
		throw new Error(`GitHub CLI ` + '`gh`' + ` is not authenticated. Run ` + '`gh auth login`' + ` and retry. Details: ${formatExecFailure(auth)}`);
	}
}

function parseJsonOutput(stdout: string, label: string): unknown {
	const trimmed = stdout.trim();
	if (!trimmed) throw new Error(`${label} returned empty output; expected JSON.`);
	try {
		return JSON.parse(trimmed);
	} catch (error) {
		throw new Error(`${label} returned invalid JSON: ${formatErrorMessage(error)}`);
	}
}

function flattenGhArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) throw new Error(`${label} returned JSON that was not an array.`);
	if (value.every((item) => Array.isArray(item))) return value.flatMap((item) => item as unknown[]);
	return value;
}

function normalizePullRequestContext(raw: unknown, target: string): PullRequestContext {
	const record = asRecord(raw);
	if (!record) throw new Error('Could not parse PR metadata from `gh pr view`: expected a JSON object.');

	const number = asFiniteNumber(record.number) ?? parsePullRequestUrl(target)?.number;
	const url = asTrimmedString(record.url);
	const parsedUrl = (url ? parsePullRequestUrl(url) : undefined) ?? parsePullRequestUrl(target);
	if (!number || !Number.isInteger(number) || number <= 0) {
		throw new Error('Could not parse the PR number from `gh pr view` output.');
	}
	if (!parsedUrl) {
		throw new Error('Could not parse the PR repository from `gh pr view` output. Use a GitHub PR URL or run from a checkout with a GitHub remote.');
	}

	return {
		number,
		title: asTrimmedString(record.title),
		url,
		repository: `${parsedUrl.owner}/${parsedUrl.repo}`,
		host: parsedUrl.host,
		headRef: asTrimmedString(record.headRefName ?? record.headRef),
		headSha: asTrimmedString(record.headRefOid ?? record.headSha),
		baseRef: asTrimmedString(record.baseRefName ?? record.baseRef),
		baseSha: asTrimmedString(record.baseRefOid ?? record.baseSha),
	};
}

async function ghApiArray(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	pr: PullRequestContext,
	endpointSuffix: string,
	label: string,
): Promise<unknown[]> {
	const [owner, repo] = pr.repository.split('/');
	if (!owner || !repo) throw new Error(`Could not build GitHub API path from repository ${pr.repository}.`);
	const endpoint = `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${endpointSuffix}`;
	const args = ['api'];
	if (pr.host) args.push('--hostname', pr.host);
	args.push('--paginate', '--slurp', endpoint);
	const stdout = await execChecked(pi, ctx, 'gh', args, `Fetching ${label} with gh`);
	return flattenGhArray(parseJsonOutput(stdout, `Fetching ${label} with gh`), label);
}

function githubLogin(value: unknown): string | undefined {
	if (typeof value === 'string') return asTrimmedString(value);
	const record = asRecord(value);
	return record ? asTrimmedString(record.login ?? record.name) : undefined;
}

function reviewHtmlUrl(record: Record<string, unknown>): string | undefined {
	const links = asRecord(record._links);
	const html = asRecord(links?.html);
	return asTrimmedString(record.html_url ?? record.htmlUrl ?? html?.href);
}

function createReviewThreadStateLookup(): ReviewThreadStateLookup {
	return { byDatabaseId: new Map(), byNodeId: new Map() };
}

function reviewThreadStateForComment(raw: unknown, lookup: ReviewThreadStateLookup): ReviewThreadState {
	const record = asRecord(raw);
	const databaseId = asFiniteNumber(record?.id);
	const nodeId = asTrimmedString(record?.node_id ?? record?.nodeId);
	return (
		(databaseId !== undefined ? lookup.byDatabaseId.get(databaseId) : undefined) ??
		(nodeId ? lookup.byNodeId.get(nodeId) : undefined) ??
		{ metadataAvailable: false }
	);
}

async function fetchReviewThreadStateLookup(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	pr: PullRequestContext,
): Promise<ReviewThreadStateLookup> {
	const [owner, repo] = pr.repository.split('/');
	if (!owner || !repo) throw new Error(`Could not build GitHub GraphQL variables from repository ${pr.repository}.`);

	const lookup = createReviewThreadStateLookup();
	let after: string | undefined;

	while (true) {
		const args = ['api'];
		if (pr.host) args.push('--hostname', pr.host);
		args.push(
			'graphql',
			'-f',
			`owner=${owner}`,
			'-f',
			`name=${repo}`,
			'-F',
			`number=${pr.number}`,
			'-f',
			`query=${GH_REVIEW_THREADS_GRAPHQL_QUERY}`,
		);
		if (after) args.push('-f', `after=${after}`);

		const label = 'Fetching review thread resolved/outdated metadata with gh';
		const stdout = await execChecked(pi, ctx, 'gh', args, label);
		const raw = parseJsonOutput(stdout, label);
		const data = asRecord(raw)?.data;
		const repository = asRecord(asRecord(data)?.repository);
		const pullRequest = asRecord(repository?.pullRequest);
		const reviewThreads = asRecord(pullRequest?.reviewThreads);
		if (!reviewThreads) throw new Error('GitHub GraphQL response did not include reviewThreads.');

		const nodes = Array.isArray(reviewThreads.nodes) ? reviewThreads.nodes : [];
		for (const rawThread of nodes) {
			const thread = asRecord(rawThread);
			if (!thread) continue;
			const state: ReviewThreadState = {
				threadId: asTrimmedString(thread.id),
				isResolved: asBoolean(thread.isResolved),
				isOutdated: asBoolean(thread.isOutdated),
				metadataAvailable: true,
			};
			const comments = asRecord(thread.comments);
			const commentNodes = Array.isArray(comments?.nodes) ? comments.nodes : [];
			for (const rawComment of commentNodes) {
				const comment = asRecord(rawComment);
				if (!comment) continue;
				const databaseId = asFiniteNumber(comment.databaseId);
				const nodeId = asTrimmedString(comment.id);
				if (databaseId !== undefined) lookup.byDatabaseId.set(databaseId, state);
				if (nodeId) lookup.byNodeId.set(nodeId, state);
			}
		}

		const pageInfo = asRecord(reviewThreads.pageInfo);
		if (!asBoolean(pageInfo?.hasNextPage)) break;
		const endCursor = asTrimmedString(pageInfo?.endCursor);
		if (!endCursor) break;
		after = endCursor;
	}

	return lookup;
}

async function fetchReviewThreadStateLookupBestEffort(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	pr: PullRequestContext,
): Promise<ReviewThreadStateLookup> {
	try {
		return await fetchReviewThreadStateLookup(pi, ctx, pr);
	} catch (error) {
		notifyCommand(
			ctx,
			`Could not fetch inline review-thread resolved/outdated metadata; inline review comments without thread metadata will stay visible. ${formatErrorMessage(error)}`,
			'warning',
		);
		return createReviewThreadStateLookup();
	}
}

function normalizeReviewComment(raw: unknown, pr: PullRequestContext, sortIndex: number, reviewThread: ReviewThreadState): CommandComment | undefined {
	const record = asRecord(raw);
	if (!record) return undefined;
	const body = asTrimmedString(record.body);
	if (!body) return undefined;

	const databaseId = asFiniteNumber(record.id);
	const nodeId = asTrimmedString(record.node_id ?? record.nodeId);
	const stableId = asStableIdPart(record.id, nodeId) ?? `${pr.repository}#${pr.number}:review-comment:${sortIndex}`;
	const createdAt = asTrimmedString(record.created_at ?? record.createdAt);
	const originalLine = asFiniteNumber(record.original_line ?? record.originalLine);
	const originalStartLine = asFiniteNumber(record.original_start_line ?? record.originalStartLine);
	const line = asFiniteNumber(record.line) ?? originalLine;
	const startLine = asFiniteNumber(record.start_line ?? record.startLine) ?? originalStartLine;

	return {
		id: `github-review-comment:${stableId}`,
		body,
		path: asTrimmedString(record.path),
		line,
		startLine,
		side: asTrimmedString(record.side ?? record.start_side ?? record.startSide),
		diffHunk: asTrimmedString(record.diff_hunk ?? record.diffHunk),
		author: githubLogin(record.user),
		url: asTrimmedString(record.html_url ?? record.htmlUrl),
		createdAt,
		reviewThread,
		metadata: compactRecord({
			source: 'pull_request_review_comment',
			repository: pr.repository,
			prNumber: pr.number,
			host: pr.host,
			databaseId,
			nodeId,
			reviewThread: compactRecord({
				threadId: reviewThread.threadId,
				isResolved: reviewThread.isResolved,
				isOutdated: reviewThread.isOutdated,
				metadataAvailable: reviewThread.metadataAvailable,
			}),
			pullRequestReviewId: asFiniteNumber(record.pull_request_review_id ?? record.pullRequestReviewId),
			commitId: asTrimmedString(record.commit_id ?? record.commitId),
			originalCommitId: asTrimmedString(record.original_commit_id ?? record.originalCommitId),
			originalLine,
			originalStartLine,
			position: asFiniteNumber(record.position),
			originalPosition: asFiniteNumber(record.original_position ?? record.originalPosition),
			subjectType: asTrimmedString(record.subject_type ?? record.subjectType),
			authorAssociation: asTrimmedString(record.author_association ?? record.authorAssociation),
			inReplyToId: asFiniteNumber(record.in_reply_to_id ?? record.inReplyToId),
			updatedAt: asTrimmedString(record.updated_at ?? record.updatedAt),
		}),
		sourceLabel: 'review comment',
		sortTimestamp: createdAt,
		sortIndex,
	};
}

function normalizeIssueComment(raw: unknown, pr: PullRequestContext, sortIndex: number): CommandComment | undefined {
	const record = asRecord(raw);
	if (!record) return undefined;
	const body = asTrimmedString(record.body);
	if (!body) return undefined;

	const databaseId = asFiniteNumber(record.id);
	const nodeId = asTrimmedString(record.node_id ?? record.nodeId);
	const stableId = asStableIdPart(record.id, nodeId) ?? `${pr.repository}#${pr.number}:issue-comment:${sortIndex}`;
	const createdAt = asTrimmedString(record.created_at ?? record.createdAt);

	return {
		id: `github-issue-comment:${stableId}`,
		body,
		author: githubLogin(record.user),
		url: asTrimmedString(record.html_url ?? record.htmlUrl),
		createdAt,
		metadata: compactRecord({
			source: 'pull_request_issue_comment',
			repository: pr.repository,
			prNumber: pr.number,
			host: pr.host,
			databaseId,
			nodeId,
			authorAssociation: asTrimmedString(record.author_association ?? record.authorAssociation),
			updatedAt: asTrimmedString(record.updated_at ?? record.updatedAt),
		}),
		sourceLabel: 'issue comment',
		sortTimestamp: createdAt,
		sortIndex,
	};
}

function normalizeReviewBody(raw: unknown, pr: PullRequestContext, sortIndex: number): CommandComment | undefined {
	const record = asRecord(raw);
	if (!record) return undefined;
	const body = asTrimmedString(record.body);
	if (!body) return undefined;

	const databaseId = asFiniteNumber(record.id);
	const nodeId = asTrimmedString(record.node_id ?? record.nodeId);
	const stableId = asStableIdPart(record.id, nodeId) ?? `${pr.repository}#${pr.number}:review:${sortIndex}`;
	const submittedAt = asTrimmedString(record.submitted_at ?? record.submittedAt);
	const createdAt = submittedAt ?? asTrimmedString(record.created_at ?? record.createdAt);

	return {
		id: `github-review:${stableId}`,
		body,
		author: githubLogin(record.user),
		url: reviewHtmlUrl(record),
		createdAt,
		metadata: compactRecord({
			source: 'pull_request_review_body',
			repository: pr.repository,
			prNumber: pr.number,
			host: pr.host,
			databaseId,
			nodeId,
			state: asTrimmedString(record.state),
			commitId: asTrimmedString(record.commit_id ?? record.commitId),
			submittedAt,
			authorAssociation: asTrimmedString(record.author_association ?? record.authorAssociation),
		}),
		sourceLabel: 'review body',
		sortTimestamp: createdAt,
		sortIndex,
	};
}

function compareCommandComments(a: CommandComment, b: CommandComment): number {
	const aTime = a.sortTimestamp ? Date.parse(a.sortTimestamp) : NaN;
	const bTime = b.sortTimestamp ? Date.parse(b.sortTimestamp) : NaN;
	if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
	if (Number.isFinite(aTime) && !Number.isFinite(bTime)) return -1;
	if (!Number.isFinite(aTime) && Number.isFinite(bTime)) return 1;
	return a.sortIndex - b.sortIndex;
}

function assignDisplayNumbers(comments: CommandComment[]): CommandComment[] {
	return comments.map((comment, index) => ({
		...comment,
		displayNumber: index + 1,
		metadata: compactRecord({ ...comment.metadata, displayNumber: index + 1 }),
	}));
}

function prContextFallbackTarget(raw: unknown, explicitTarget?: string): string {
	const record = asRecord(raw);
	const number = asFiniteNumber(record?.number);
	return explicitTarget ?? asTrimmedString(record?.url) ?? (number ? String(number) : '');
}

async function fetchPullRequestMetadata(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	label: string,
	target?: string,
): Promise<PullRequestContext> {
	const args = ['pr', 'view'];
	if (target) args.push(target);
	args.push('--json', GH_PR_METADATA_FIELDS);

	const stdout = await execChecked(pi, ctx, 'gh', args, label);
	const raw = parseJsonOutput(stdout, label);
	return normalizePullRequestContext(raw, prContextFallbackTarget(raw, target));
}

async function detectCurrentBranchPullRequest(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<PullRequestContext | undefined> {
	try {
		const branch = await pi.exec('git', ['branch', '--show-current'], {
			cwd: ctx.cwd,
			signal: ctx.signal,
			timeout: GH_COMMAND_TIMEOUT_MS,
		});
		if (branch.killed || branch.code !== 0) return undefined;

		const branchName = branch.stdout.trim();
		if (!branchName || branchName === 'main') return undefined;

		return await fetchPullRequestMetadata(pi, ctx, 'Detecting current branch PR with gh');
	} catch {
		return undefined;
	}
}

async function fetchCommentsForPullRequest(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	pr: PullRequestContext,
): Promise<CommandComment[]> {
	const reviewComments = await ghApiArray(pi, ctx, pr, `pulls/${pr.number}/comments?per_page=100`, 'review comments');
	const reviewThreadLookup = reviewComments.length > 0
		? await fetchReviewThreadStateLookupBestEffort(pi, ctx, pr)
		: createReviewThreadStateLookup();
	const issueComments = await ghApiArray(pi, ctx, pr, `issues/${pr.number}/comments?per_page=100`, 'issue comments');
	const reviews = await ghApiArray(pi, ctx, pr, `pulls/${pr.number}/reviews?per_page=100`, 'review bodies');

	let sortIndex = 0;
	const comments: CommandComment[] = [];
	for (const raw of reviewComments) {
		const comment = normalizeReviewComment(raw, pr, ++sortIndex, reviewThreadStateForComment(raw, reviewThreadLookup));
		if (comment) comments.push(comment);
	}
	for (const raw of issueComments) {
		const comment = normalizeIssueComment(raw, pr, ++sortIndex);
		if (comment) comments.push(comment);
	}
	for (const raw of reviews) {
		const comment = normalizeReviewBody(raw, pr, ++sortIndex);
		if (comment) comments.push(comment);
	}

	return assignDisplayNumbers(comments.sort(compareCommandComments));
}

async function fetchPrCommentsForTriage(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	target: string,
): Promise<{ pr: PullRequestContext; comments: CommandComment[] }> {
	const normalizedTarget = normalizePrTarget(target);
	if (!normalizedTarget) {
		throw new Error('PR input must be a PR number (for example, 123 or #123) or a GitHub pull request URL.');
	}

	await assertGitRepo(pi, ctx);
	await assertGhReady(pi, ctx);

	const pr = await fetchPullRequestMetadata(pi, ctx, 'Fetching PR metadata with gh', normalizedTarget);
	const comments = await fetchCommentsForPullRequest(pi, ctx, pr);
	return { pr, comments };
}

function truncateForDisplay(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, Math.max(1, max)).trimEnd()}\n… (truncated; full text will be sent to triage_comments)`;
}

function indentLines(text: string, prefix: string): string {
	return text.split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function formatCommentLocation(comment: CommandComment): string {
	if (!comment.path) return 'PR discussion';
	const lineRange = comment.startLine && comment.line && comment.startLine !== comment.line
		? `${comment.startLine}-${comment.line}`
		: comment.line ?? comment.startLine;
	return lineRange ? `${comment.path}:${lineRange}` : comment.path;
}

function isInlineReviewComment(comment: CommandComment): boolean {
	return asTrimmedString(comment.metadata.source) === 'pull_request_review_comment';
}

function formatReviewThreadState(comment: CommandComment): string | undefined {
	if (!isInlineReviewComment(comment)) return undefined;
	const reviewThread = comment.reviewThread;
	if (!reviewThread?.metadataAvailable) return 'thread: resolved/outdated state unavailable (kept visible)';
	const resolved = reviewThread.isResolved === true
		? 'resolved'
		: reviewThread.isResolved === false
			? 'unresolved'
			: 'resolved state unavailable';
	const outdated = reviewThread.isOutdated === true
		? 'outdated'
		: reviewThread.isOutdated === false
			? 'current'
			: 'outdated state unavailable';
	return `thread: ${resolved}, ${outdated}`;
}

function formatInlineFilterNotice(summary: AppliedInlineCommentFilter): string {
	const scope = 'Only inline review comments can be filtered; PR issue comments, review bodies, and inline comments without thread metadata remain visible.';
	if (!summary.filter.hideResolved && !summary.filter.hideOutdated) {
		return `Filter: showing all fetched comments. ${scope}`;
	}
	const hiddenParts = [
		summary.hiddenResolvedInlineCount > 0 ? `${summary.hiddenResolvedInlineCount} resolved` : undefined,
		summary.hiddenOutdatedInlineCount > 0 ? `${summary.hiddenOutdatedInlineCount} outdated` : undefined,
	]
		.filter(Boolean)
		.join(', ');
	const hiddenDetail = hiddenParts ? ` (${hiddenParts})` : '';
	return `Filter: ${summary.filter.label}. Hidden ${summary.hiddenInlineCount} inline review comment(s)${hiddenDetail}; displaying ${summary.displayedCount} of ${summary.originalCount} fetched comment(s). ${scope}`;
}

function formatInlineFilterContext(summary: AppliedInlineCommentFilter): string {
	return `${formatInlineFilterNotice(summary)} Inline comments kept without thread metadata: ${summary.keptInlineWithoutThreadMetadataCount}.`;
}

function formatFetchedCommentsForSelection(pr: PullRequestContext, comments: CommandComment[], filterSummary?: AppliedInlineCommentFilter): string {
	const title = pr.title ? ` — ${pr.title}` : '';
	const limitNotice = comments.length > MAX_COMMENTS
		? `\n\ntriage_comments can investigate at most ${MAX_COMMENTS} comments per run, so choose a subset.`
		: '\n\nChoose whether to investigate all displayed comments or select a subset.';
	const fetchedCount = filterSummary?.originalCount ?? comments.length;
	const displayedCount = comments.length;
	const countSummary = filterSummary
		? `Fetched ${fetchedCount} comment(s) from ${pr.repository}#${pr.number}${title}; displaying ${displayedCount} numbered comment(s) after filtering.`
		: `Fetched ${displayedCount} numbered comment(s) from ${pr.repository}#${pr.number}${title}.`;
	const filterNotice = filterSummary ? `\n\n${formatInlineFilterNotice(filterSummary)}` : '';
	const header = `${countSummary}${filterNotice}${limitNotice}`;
	const body = comments.map((comment) => {
		const author = comment.author ? ` by @${comment.author}` : '';
		const url = comment.url ? `\n   url: ${comment.url}` : '';
		const threadState = formatReviewThreadState(comment);
		const threadLine = threadState ? `\n   ${threadState}` : '';
		const preview = indentLines(truncateForDisplay(comment.body, COMMENT_DISPLAY_BODY_LIMIT), '   ');
		return `${comment.displayNumber ?? '?'}. ${comment.sourceLabel}${author} — ${formatCommentLocation(comment)}\n   id: ${comment.id}${url}${threadLine}\n${preview}`;
	});
	return [header, ...body].join('\n\n');
}

async function promptForInlineCommentFilter(ctx: ExtensionCommandContext): Promise<InlineCommentFilter | undefined> {
	const prompt = [
		'/triage-comments: filter inline review comments before display',
		'GitHub exposes resolved/outdated state only for inline review threads. PR issue comments and review bodies will stay visible, and inline comments without thread metadata will stay visible.',
	].join('\n\n');
	const showAll = 'Show all fetched comments';
	const hideResolved = 'Hide resolved inline review comments';
	const hideOutdated = 'Hide outdated inline review comments';
	const hideBoth = 'Hide resolved and outdated inline review comments';
	const cancel = 'Cancel';
	const decision = await ctx.ui.select(prompt, [showAll, hideResolved, hideOutdated, hideBoth, cancel]);
	if (!decision || decision === cancel) return undefined;
	if (decision === hideResolved) return { hideResolved: true, hideOutdated: false, label: 'hiding resolved inline review comments' };
	if (decision === hideOutdated) return { hideResolved: false, hideOutdated: true, label: 'hiding outdated inline review comments' };
	if (decision === hideBoth) return { hideResolved: true, hideOutdated: true, label: 'hiding resolved or outdated inline review comments' };
	return { hideResolved: false, hideOutdated: false, label: 'showing all fetched comments' };
}

function applyInlineCommentFilter(
	comments: CommandComment[],
	filter: InlineCommentFilter,
): { comments: CommandComment[]; summary: AppliedInlineCommentFilter } {
	const kept: CommandComment[] = [];
	let hiddenInlineCount = 0;
	let hiddenResolvedInlineCount = 0;
	let hiddenOutdatedInlineCount = 0;
	let keptInlineWithoutThreadMetadataCount = 0;

	for (const comment of comments) {
		if (!isInlineReviewComment(comment)) {
			kept.push(comment);
			continue;
		}

		const reviewThread = comment.reviewThread;
		const hasThreadMetadata = Boolean(reviewThread?.metadataAvailable);
		const hideForResolved = filter.hideResolved && reviewThread?.isResolved === true;
		const hideForOutdated = filter.hideOutdated && reviewThread?.isOutdated === true;
		if (hideForResolved || hideForOutdated) {
			hiddenInlineCount += 1;
			if (hideForResolved) hiddenResolvedInlineCount += 1;
			if (hideForOutdated) hiddenOutdatedInlineCount += 1;
			continue;
		}

		if (!hasThreadMetadata) keptInlineWithoutThreadMetadataCount += 1;
		kept.push(comment);
	}

	const commentsWithFilterMetadata = kept.map((comment) => ({
		...comment,
		metadata: compactRecord({
			...comment.metadata,
			preFilterDisplayNumber: comment.displayNumber,
		}),
	}));

	const summary: AppliedInlineCommentFilter = {
		filter,
		originalCount: comments.length,
		displayedCount: kept.length,
		hiddenInlineCount,
		hiddenResolvedInlineCount,
		hiddenOutdatedInlineCount,
		keptInlineWithoutThreadMetadataCount,
	};

	return { comments: assignDisplayNumbers(commentsWithFilterMetadata), summary };
}

function parseSelectionList(input: string, max: number): SelectionParseResult {
	const trimmed = input.trim();
	if (!trimmed) return { ok: false, error: 'Enter comment numbers such as 1,3-5.' };
	if (trimmed.toLowerCase() === 'all') return { ok: true, indices: Array.from({ length: max }, (_value, index) => index) };

	const selected: number[] = [];
	const seen = new Set<number>();
	const addNumber = (value: number): string | undefined => {
		if (!Number.isInteger(value) || value <= 0) return `Invalid comment number: ${value}`;
		if (value > max) return `Comment number ${value} is outside the available range 1-${max}.`;
		const index = value - 1;
		if (!seen.has(index)) {
			seen.add(index);
			selected.push(index);
		}
		return undefined;
	};

	for (const rawPart of trimmed.split(',')) {
		const part = rawPart.trim();
		if (!part) return { ok: false, error: 'Selection contains an empty item. Use a format like 1,3-5.' };
		const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
		if (range) {
			const start = Number(range[1]);
			const end = Number(range[2]);
			if (start > end) return { ok: false, error: `Range ${part} goes backwards; use ${end}-${start} instead.` };
			for (let value = start; value <= end; value += 1) {
				const error = addNumber(value);
				if (error) return { ok: false, error };
			}
			continue;
		}

		if (/^\d+$/.test(part)) {
			const error = addNumber(Number(part));
			if (error) return { ok: false, error };
			continue;
		}

		return { ok: false, error: `Could not parse selection item: ${part}. Use numbers and ranges like 1,3-5.` };
	}

	return selected.length > 0 ? { ok: true, indices: selected } : { ok: false, error: 'Select at least one comment.' };
}

async function promptForCommentSubset(
	ctx: ExtensionCommandContext,
	comments: CommandComment[],
	selectionPrompt: string,
): Promise<CommandComment[] | undefined> {
	const inputPrompt = `${selectionPrompt}\n\nEnter comment numbers to investigate.`;
	const inputHint = comments.length <= MAX_COMMENTS
		? `Examples: 1,3-5 or all (max ${MAX_COMMENTS})`
		: `Examples: 1,3-5 (choose up to ${MAX_COMMENTS})`;

	while (true) {
		const input = await ctx.ui.input(inputPrompt, inputHint);
		if (input === undefined) return undefined;
		const parsed = parseSelectionList(input, comments.length);
		if (!parsed.ok) {
			notifyCommand(ctx, parsed.error, 'error');
			continue;
		}
		if (parsed.indices.length > MAX_COMMENTS) {
			notifyCommand(ctx, `triage_comments accepts at most ${MAX_COMMENTS} comments per run; choose a smaller subset.`, 'error');
			continue;
		}
		return parsed.indices.map((index) => comments[index]);
	}
}

async function choosePrComments(
	ctx: ExtensionCommandContext,
	pr: PullRequestContext,
	comments: CommandComment[],
	filterSummary?: AppliedInlineCommentFilter,
): Promise<CommandComment[] | undefined> {
	const options = comments.length <= MAX_COMMENTS
		? ['Investigate all displayed comments', 'Choose a subset', 'Cancel']
		: ['Choose a subset', 'Cancel'];
	const selectionPrompt = formatFetchedCommentsForSelection(pr, comments, filterSummary);
	const decision = await ctx.ui.select(selectionPrompt, options);
	if (!decision || decision === 'Cancel') return undefined;
	if (decision === 'Investigate all displayed comments') return comments;
	return promptForCommentSubset(ctx, comments, selectionPrompt);
}

function createPastedComment(body: string): CommandComment {
	return {
		id: 'pasted-feedback:1',
		body,
		metadata: {
			source: 'pasted_feedback',
			displayNumber: 1,
			capturedBy: '/triage-comments',
		},
		sourceLabel: 'pasted feedback',
		displayNumber: 1,
		sortIndex: 1,
	};
}

function toPayloadComment(comment: CommandComment): Record<string, unknown> {
	return compactRecord({
		id: comment.id,
		body: comment.body,
		path: comment.path,
		line: comment.line,
		startLine: comment.startLine,
		side: comment.side,
		diffHunk: comment.diffHunk,
		author: comment.author,
		url: comment.url,
		createdAt: comment.createdAt,
		metadata: comment.metadata,
	});
}

function buildCommandPayload(
	comments: CommandComment[],
	options: { pr?: PullRequestContext; totalDisplayed: number; source: 'paste' | 'pr'; filterSummary?: AppliedInlineCommentFilter },
): TriageCommandPayload {
	const prSelectionContext = options.filterSummary
		? `Selected by /triage-comments after fetching ${options.filterSummary.originalCount} PR comment(s), applying the inline review-comment filter, displaying ${options.totalDisplayed} comment(s), and receiving explicit user selection. ${formatInlineFilterContext(options.filterSummary)}`
		: `Selected by /triage-comments after displaying ${options.totalDisplayed} fetched PR comment(s) and receiving explicit user selection.`;
	const payload: TriageCommandPayload = {
		comments: comments.map(toPayloadComment),
		context:
			options.source === 'pr'
				? `${prSelectionContext} Do not implement changes until the user chooses a handling option.`
				: 'Pasted feedback captured by /triage-comments. Do not implement changes until the user chooses a handling option.',
	};

	if (options.pr) {
		payload.pr = compactRecord({
			number: options.pr.number,
			title: options.pr.title,
			url: options.pr.url,
			repository: options.pr.repository,
			headRef: options.pr.headRef,
			headSha: options.pr.headSha,
			baseRef: options.pr.baseRef,
			baseSha: options.pr.baseSha,
		});
		const base = optionalRecord({ branch: options.pr.baseRef, sha: options.pr.baseSha });
		if (base) payload.base = base;
	}

	return payload;
}

function buildTriageUserPrompt(payload: TriageCommandPayload, selectedCount: number, totalDisplayed: number): string {
	const selectionNote = selectedCount === totalDisplayed ? `${selectedCount} selected item(s)` : `${selectedCount} selected item(s) out of ${totalDisplayed} displayed`;
	return `Task: start read-only review-feedback triage for ${selectionNote}.\n\nCall the triage_comments tool with exactly this JSON payload before doing any analysis:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nDo not edit files or implement changes as part of this request. After triage_comments returns, summarize its findings and ask which handling option to take before any implementation.`;
}

function sendTriageUserMessage(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	payload: TriageCommandPayload,
	selectedCount: number,
	totalDisplayed: number,
): void {
	const prompt = buildTriageUserPrompt(payload, selectedCount, totalDisplayed);
	if (ctx.isIdle()) pi.sendUserMessage(prompt);
	else pi.sendUserMessage(prompt, { deliverAs: 'followUp' });
	notifyCommand(ctx, `Sent ${selectedCount} selected comment(s) to the main agent for triage_comments.`, 'info');
}

async function runPasteMode(pi: ExtensionAPI, ctx: ExtensionCommandContext, prefill?: string): Promise<void> {
	const feedback = await ctx.ui.editor('Paste feedback for /triage-comments', prefill ?? '');
	if (feedback === undefined) return;
	const body = feedback.trim();
	if (!body) {
		notifyCommand(ctx, 'No feedback was provided; /triage-comments paste mode was cancelled.', 'warning');
		return;
	}

	const comments = [createPastedComment(body)];
	const payload = buildCommandPayload(comments, { totalDisplayed: 1, source: 'paste' });
	sendTriageUserMessage(pi, ctx, payload, comments.length, 1);
}

async function runPrMode(pi: ExtensionAPI, ctx: ExtensionCommandContext, target?: string): Promise<void> {
	let prTarget = target?.trim();
	let detectedPr: PullRequestContext | undefined;

	if (!prTarget) {
		ctx.ui.setStatus('triage-comments', 'triage-comments: checking current branch PR…');
		detectedPr = await detectCurrentBranchPullRequest(pi, ctx);
		ctx.ui.setStatus('triage-comments', undefined);
		if (detectedPr) {
			prTarget = detectedPr.url ?? String(detectedPr.number);
			notifyCommand(ctx, `Detected PR ${detectedPr.repository}#${detectedPr.number} from the current branch.`, 'info');
		}
	}

	if (!prTarget) {
		const input = await ctx.ui.input('PR URL or number', 'For example: 123, #123, or https://github.com/owner/repo/pull/123');
		if (input === undefined) return;
		prTarget = input.trim();
	}

	if (!normalizePrTarget(prTarget)) {
		notifyCommand(ctx, 'PR input must be a PR number (for example, 123 or #123) or a GitHub pull request URL.', 'error');
		return;
	}

	ctx.ui.setStatus('triage-comments', 'triage-comments: fetching PR comments…');
	try {
		notifyCommand(ctx, 'Fetching PR comments with gh (read-only)…', 'info');
		const { pr, comments } = detectedPr
			? { pr: detectedPr, comments: await fetchCommentsForPullRequest(pi, ctx, detectedPr) }
			: await fetchPrCommentsForTriage(pi, ctx, prTarget);
		if (comments.length === 0) {
			notifyCommand(ctx, `No review comments, issue comments, or review bodies were found for ${pr.repository}#${pr.number}.`, 'info');
			return;
		}

		const filter = await promptForInlineCommentFilter(ctx);
		if (!filter) return;
		const filtered = applyInlineCommentFilter(comments, filter);
		if (filtered.comments.length === 0) {
			notifyCommand(ctx, `${formatInlineFilterNotice(filtered.summary)} No comments remain to send to triage_comments.`, 'info');
			return;
		}

		const selected = await choosePrComments(ctx, pr, filtered.comments, filtered.summary);
		if (!selected || selected.length === 0) return;
		const payload = buildCommandPayload(selected, { pr, totalDisplayed: filtered.comments.length, source: 'pr', filterSummary: filtered.summary });
		sendTriageUserMessage(pi, ctx, payload, selected.length, filtered.comments.length);
	} catch (error) {
		notifyCommand(ctx, formatErrorMessage(error), 'error');
	} finally {
		ctx.ui.setStatus('triage-comments', undefined);
	}
}

export const __test__ = {
	assertToolPathInsideCwd,
	buildCommandPayload,
	buildSystemPrompt,
	buildUserPrompt,
	createTriageRuntimeGuardExtension,
	ensureImplementationNote,
	formatFetchedCommentsForSelection,
	formatInlineFilterContext,
	formatToolCall,
	getBlockedBashReason,
	normalizeComment,
	normalizeInput,
	parseSelectionList,
	parseTriageCommandArgs,
	prepareArguments,
	aggregateAssistantUsage,
	addAssistantMessageUsage,
	addSessionEventUsage,
	inspectFinalAssistant,
	classifyRunFailure,
};

export default function triageCommentsExtension(pi: ExtensionAPI) {
	pi.on("tool_result", async (event) => {
		if (event.toolName !== "triage_comments") return undefined;
		const details = event.details as { status?: unknown } | undefined;
		if (details?.status !== "error") return undefined;
		return { isError: true };
	});

	pi.registerCommand("triage-comments", {
		description: "Collect pasted feedback or PR comments, then start a triage_comments investigation",
		getArgumentCompletions: (prefix) => {
			const commands = ["paste", "pr", "help"];
			const normalized = prefix.trim().toLowerCase();
			const matches = commands.filter((command) => command.startsWith(normalized));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const parsed = parseTriageCommandArgs(args);
			if (parsed.help) {
				notifyCommand(ctx, TRIAGE_COMMAND_USAGE, "info");
				return;
			}

			if (parsed.error) {
				notifyCommand(ctx, parsed.error, "error");
				return;
			}

			if (!ctx.hasUI) {
				notifyCommand(
					ctx,
					`${TRIAGE_COMMAND_USAGE}\n\nThis intake flow requires The Last Harness interactive UI for the editor, PR comment display, and all/subset confirmation.`,
					"warning",
				);
				return;
			}

			let mode = parsed.mode;
			if (!mode) {
				const selection = await ctx.ui.select("/triage-comments: choose feedback source", [
					"Paste feedback",
					"Fetch comments from a PR",
					"Cancel",
				]);
				if (!selection || selection === "Cancel") return;
				mode = selection === "Paste feedback" ? "paste" : "pr";
			}

			if (mode === "paste") {
				await runPasteMode(pi, ctx, parsed.pastePrefill);
				return;
			}

			await runPrMode(pi, ctx, parsed.target);
		},
	});

	pi.registerTool({
		name: "triage_comments",
		label: "Triage comments",
		description:
			"Read-only subagent that triages selected PR review comments against the local checkout and git context. It classifies each comment with evidence, suggests review responses, and proposes handling options without implementing changes.",
		promptSnippet:
			"Triage selected PR review comments in a read-only isolated subagent; returns verdicts, evidence, response text, and handling options without editing files.",
		promptGuidelines: [
			"Use triage_comments when selected PR review comments need evidence-based classification against the local checkout.",
			"Do not use triage_comments to implement changes; ask the user which valid handling option to take after triage.",
		],
		parameters: TriageCommentsParams,
		prepareArguments,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (!ctx.model) throw new Error("triage_comments needs an active model, but ctx.model is unavailable.");
			const input = normalizeInput(params);
			const cwd = path.resolve(ctx.cwd);
			const details: TriageDetails = {
				status: "running",
				cwd,
				commentCount: input.comments.length,
				turns: 0,
				toolCalls: [],
				startedAt: Date.now(),
			};

			let lastContent = "(triaging comments...)";
			let session: AgentSession | undefined;
			let unsubscribe: (() => void) | undefined;
			let runTimeout: NodeJS.Timeout | undefined;
			let abortListenerAdded = false;
			let callerAborted = Boolean(signal?.aborted);
			const usage = createEmptyUsage();

			const emit = () => {
				onUpdate?.({ content: [{ type: "text", text: lastContent }], details });
			};

			const abortForCleanup = () => {
				void session?.abort();
			};

			const abortFromCaller = () => {
				callerAborted = true;
				details.status = "aborted";
				details.endedAt = Date.now();
				lastContent = "Aborted";
				emit();
				abortForCleanup();
			};

			if (signal?.aborted) abortFromCaller();
			if (signal && !signal.aborted) {
				signal.addEventListener("abort", abortFromCaller);
				abortListenerAdded = true;
			}

			try {
				emit();

				const systemPrompt = buildSystemPrompt({
					cwd,
					maxTurns: MAX_TURNS,
					maxRunSeconds: Math.round(MAX_RUN_MS / 1000),
				});

				// Keep the guarded subagent from inheriting user/project shell prefix or shell path settings.
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
					extensionFactories: [createTriageRuntimeGuardExtension({ cwd, maxTurns: MAX_TURNS })],
					systemPromptOverride: () => systemPrompt,
					appendSystemPromptOverride: () => [],
					skillsOverride: () => ({ skills: [], diagnostics: [] }),
					promptsOverride: () => ({ prompts: [], diagnostics: [] }),
					themesOverride: () => ({ themes: [], diagnostics: [] }),
					agentsFilesOverride: () => ({ agentsFiles: [] }),
				});

				await resourceLoader.reload();

				const created = await createAgentSession({
					cwd,
					...getModelRuntimeOption(ctx),
					resourceLoader,
					settingsManager: isolatedSettingsManager,
					sessionManager: SessionManager.inMemory(cwd),
					model: ctx.model,
					thinkingLevel: pi.getThinkingLevel(),
					tools: ["read", "grep", "find", "ls", "bash"],
				});

				session = created.session;
				unsubscribe = session.subscribe((event) => {
					addSessionEventUsage(usage, event);
					switch (event.type) {
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

				if (!callerAborted) {
					const promptPromise = session.prompt(buildUserPrompt(input, cwd), { expandPromptTemplates: false });
					const timeoutPromise = new Promise<never>((_resolve, reject) => {
						runTimeout = setTimeout(() => {
							abortForCleanup();
							reject(new Error(`triage_comments timed out after ${Math.round(MAX_RUN_MS / 1000)} seconds.`));
						}, MAX_RUN_MS);
					});
					await Promise.race([promptPromise, timeoutPromise]);
				}

				const outcome = session ? inspectFinalAssistant(session.state.messages) : { ok: false as const, reason: "the isolated triage_comments session produced no assistant message" };
				if (outcome.ok) {
					lastContent = ensureImplementationNote(outcome.answer);
					details.status = "done";
				} else if (callerAborted) {
					lastContent = "Aborted";
					details.status = "aborted";
				} else {
					throw new Error(outcome.reason);
				}
				details.endedAt = Date.now();
				emit();

				return {
					content: [{ type: "text", text: lastContent }],
					details,
					usage,
				};
			} catch (error) {
				const failure = classifyRunFailure(error, callerAborted);
				const { message } = failure;
				details.status = failure.status;
				details.error = failure.error;
				details.endedAt = Date.now();
				lastContent = message;
				emit();

				return {
					content: [{ type: "text", text: message }],
					details,
					usage,
				};
			} finally {
				if (runTimeout) clearTimeout(runTimeout);
				if (signal && abortListenerAdded) signal.removeEventListener("abort", abortFromCaller);
				unsubscribe?.();
				session?.dispose();
			}
		},

		renderCall(args, theme) {
			const comments = Array.isArray((args as { comments?: unknown })?.comments) ? (args as { comments: unknown[] }).comments : [];
			const first = comments[0];
			const body = typeof first === "string" ? first : asTrimmedString(asRecord(first)?.body) ?? "";
			const pr = asRecord((args as { pr?: unknown })?.pr);
			const prLabel = pr?.number ? `PR #${pr.number}` : pr?.url ? "PR context" : "no PR context";
			return new Text(
				`${theme.fg("muted", `${comments.length} comments • ${prLabel}`)} · ${theme.fg("toolOutput", shorten(body, 90))}`,
				0,
				0,
			);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as TriageDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "(no output)", 0, 0);
			}

			const status = isPartial ? "running" : details.status;
			const icon =
				status === "done"
					? theme.fg("success", "✓")
					: status === "error"
						? theme.fg("error", "✗")
						: status === "aborted"
							? theme.fg("warning", "◼")
							: theme.fg("warning", "⏳");
			const header = `${icon} ${theme.fg("toolTitle", theme.bold("triage_comments "))}${theme.fg(
				"dim",
				`${details.commentCount} comments • ${details.turns} turns • ${details.toolCalls.length} tools`,
			)}`;
			const cwdLine = `${theme.fg("muted", "checkout: ")}${theme.fg("toolOutput", details.cwd)}`;
			const answer =
				(result.content[0]?.type === "text" ? result.content[0].text : renderAnswer(details)).trim() || "(no output)";

			const toolLines = details.toolCalls.slice(expanded ? 0 : -6).map((call) => {
				const callIcon = call.isError ? theme.fg("error", "✗") : theme.fg("dim", "→");
				return `${callIcon} ${theme.fg("toolOutput", formatToolCall(call))}`;
			});
			if (!expanded && details.toolCalls.length > 6) toolLines.unshift(theme.fg("muted", "…"));

			if (status === "running") {
				const parts = [header, cwdLine];
				if (toolLines.length) parts.push("", theme.fg("muted", "Read-only checks:"), ...toolLines);
				parts.push("", theme.fg("muted", "Triaging comments…"));
				return new Text(parts.join("\n"), 0, 0);
			}

			if (!expanded) {
				const lines = answer.split("\n");
				const previewLines = lines.slice(0, COLLAPSED_PREVIEW_LINES);
				const parts = [header, cwdLine, "", theme.fg("toolOutput", previewLines.join("\n"))];
				if (lines.length > previewLines.length) parts.push(theme.fg("muted", "(Ctrl+O to expand)"));
				if (toolLines.length) parts.push("", theme.fg("muted", "Read-only checks:"), ...toolLines);
				return new Text(parts.join("\n"), 0, 0);
			}

			const container = new Container();
			container.addChild(new Text(header, 0, 0));
			container.addChild(new Text(cwdLine, 0, 0));
			if (toolLines.length) {
				container.addChild(new Spacer(1));
				container.addChild(new Text([theme.fg("muted", "Read-only checks:"), ...toolLines].join("\n"), 0, 0));
			}
			container.addChild(new Spacer(1));
			container.addChild(new Markdown(answer, 0, 0, getMarkdownTheme()));
			return container;
		},
	});
}
