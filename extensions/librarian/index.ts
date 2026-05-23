import type { Dirent } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { ExtensionAPI, ExtensionContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
	DefaultResourceLoader,
	SessionManager,
	createAgentSession,
	getAgentDir,
	getMarkdownTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const DEFAULT_MAX_SEARCH_RESULTS = 30;
const MAX_SEARCH_RESULTS = 100;
const MAX_TURNS = 10;
const MAX_TOOL_CALLS_TO_KEEP = 80;
const DEFAULT_BASH_TIMEOUT_SECONDS = 60;
const MAX_RUN_MS = 10 * 60 * 1000;
const CACHE_TTL_DAYS = 7;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
const CACHE_METADATA_FILE = ".pi-librarian-cache.json";
const CACHE_MARKER_FILE = ".pi-librarian-cache-used";
const CACHE_CONFIG_FILE = "librarian.json";

type LibrarianStatus = "running" | "done" | "error" | "aborted";

type CacheMode = "disabled" | "enabled";

const DEFAULT_CACHE_MODE: CacheMode = "enabled";

type ToolCall = {
	id: string;
	name: string;
	args: unknown;
	startedAt: number;
	endedAt?: number;
	isError?: boolean;
};

type CacheDetails = {
	mode: CacheMode;
	root: string;
	ttlDays: number;
	cleanupDeleted: number;
	cleanupErrors: string[];
	decisionReason: string;
};

type LibrarianDetails = {
	status: LibrarianStatus;
	workspace: string;
	cache: CacheDetails;
	turns: number;
	toolCalls: ToolCall[];
	startedAt: number;
	endedAt?: number;
	error?: string;
};

const LibrarianParams = Type.Object({
	query: Type.String({
		description: [
			"Describe exactly what to find in GitHub code.",
			"Include known context in the query when you have it (symbols/behavior, repo or owner hints, refs/branches, paths, and desired output).",
			"Do not guess unknown details; if scope is uncertain, say that explicitly and let Librarian discover it.",
			"Librarian returns concise path-first findings with line-ranged evidence from GitHub files.",
		].join("\n"),
	}),
	repos: Type.Optional(
		Type.Array(Type.String({ description: "Optional owner/repo filters (e.g. octocat/hello-world)" }), {
			description: "Optional explicit repository scope.",
			maxItems: 30,
		}),
	),
	owners: Type.Optional(
		Type.Array(Type.String({ description: "Optional owner/org filters" }), {
			description: "Optional owner/org scope.",
			maxItems: 30,
		}),
	),
	maxSearchResults: Type.Optional(
		Type.Number({
			description: `Maximum GitHub search hits per query (1-${MAX_SEARCH_RESULTS}, default ${DEFAULT_MAX_SEARCH_RESULTS})`,
			minimum: 1,
			maximum: MAX_SEARCH_RESULTS,
			default: DEFAULT_MAX_SEARCH_RESULTS,
		}),
	),
});

function asStringArray(value: unknown, maxItems = 30): string[] {
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (!trimmed) continue;
		out.push(trimmed);
		if (out.length >= maxItems) break;
	}
	return out;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function shorten(text: string, max: number): string {
	const oneLine = text.replace(/\s+/g, " ").trim();
	if (oneLine.length <= max) return oneLine;
	return `${oneLine.slice(0, Math.max(1, max - 1))}…`;
}

function getUserCacheReposRoot(): string {
	if (process.env.PI_LIBRARIAN_CACHE_ROOT?.trim()) {
		return path.resolve(expandHome(process.env.PI_LIBRARIAN_CACHE_ROOT.trim()));
	}

	if (process.platform === "darwin") {
		return path.join(os.homedir(), "Library", "Caches", "pi-librarian", "repos");
	}

	if (process.platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
		return path.join(localAppData, "pi-librarian", "repos");
	}

	const xdgCacheHome = process.env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), ".cache");
	return path.join(xdgCacheHome, "pi-librarian", "repos");
}

function expandHome(value: string): string {
	if (value === "~") return os.homedir();
	if (value.startsWith(`~${path.sep}`)) return path.join(os.homedir(), value.slice(2));
	if (path.sep === "/" && value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
	return value;
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function safeReadDir(dir: string): Promise<Dirent[]> {
	try {
		return await fs.readdir(dir, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

function isInside(parent: string, child: string): boolean {
	const parentResolved = path.resolve(parent);
	const childResolved = path.resolve(child);
	return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${path.sep}`);
}

function parseLastUsedAt(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric;
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

async function getRepoLastUsedAt(repoDir: string): Promise<number | undefined> {
	const metadataPath = path.join(repoDir, CACHE_METADATA_FILE);
	try {
		const raw = await fs.readFile(metadataPath, "utf8");
		const parsed = JSON.parse(raw) as { lastUsedAt?: unknown; updatedAt?: unknown; createdAt?: unknown };
		const fromMetadata =
			parseLastUsedAt(parsed.lastUsedAt) ?? parseLastUsedAt(parsed.updatedAt) ?? parseLastUsedAt(parsed.createdAt);
		if (fromMetadata !== undefined) return fromMetadata;
	} catch {
		// Fall through to marker mtime for older managed caches.
	}

	const markerPath = path.join(repoDir, CACHE_MARKER_FILE);
	try {
		return (await fs.stat(markerPath)).mtimeMs;
	} catch {
		return undefined;
	}
}

async function isManagedRepoCache(repoDir: string): Promise<boolean> {
	return (await pathExists(path.join(repoDir, ".git"))) &&
		((await pathExists(path.join(repoDir, CACHE_METADATA_FILE))) ||
			(await pathExists(path.join(repoDir, CACHE_MARKER_FILE))));
}

async function cleanupExpiredCache(cacheRoot: string): Promise<{ deleted: number; errors: string[] }> {
	const errors: string[] = [];
	let deleted = 0;
	const now = Date.now();
	const root = path.resolve(cacheRoot);
	const lockPath = path.join(root, ".cleanup.lock");
	let lock: FileHandle | undefined;

	try {
		lock = await fs.open(lockPath, "wx");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") return { deleted, errors };
		throw error;
	}

	try {
		const hosts = await safeReadDir(root);
		for (const host of hosts) {
			if (!host.isDirectory()) continue;
			const hostDir = path.join(root, host.name);
			const owners = await safeReadDir(hostDir);
			for (const owner of owners) {
				if (!owner.isDirectory()) continue;
				const ownerDir = path.join(hostDir, owner.name);
				const repos = await safeReadDir(ownerDir);
				for (const repo of repos) {
					if (!repo.isDirectory()) continue;
					const repoDir = path.join(ownerDir, repo.name);
					if (!isInside(root, repoDir)) continue;

					try {
						if (!(await isManagedRepoCache(repoDir))) continue;
						const lastUsedAt = await getRepoLastUsedAt(repoDir);
						if (lastUsedAt === undefined || now - lastUsedAt <= CACHE_TTL_MS) continue;
						await fs.rm(repoDir, { recursive: true, force: true });
						deleted += 1;
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						errors.push(`${repoDir}: ${message}`);
					}
				}
			}
		}

		return { deleted, errors };
	} finally {
		await lock?.close().catch(() => undefined);
		await fs.rm(lockPath, { force: true }).catch(() => undefined);
	}
}

function getCacheConfigPath(): string {
	return path.join(getAgentDir(), "extensions", CACHE_CONFIG_FILE);
}

function parseCacheMode(value: unknown): CacheMode | undefined {
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "enabled" || normalized === "on" || normalized === "true") return "enabled";
		if (normalized === "disabled" || normalized === "off" || normalized === "false") return "disabled";
	}
	if (value === true) return "enabled";
	if (value === false) return "disabled";
	return undefined;
}

async function readCachePreference(): Promise<CacheMode> {
	try {
		const raw = await fs.readFile(getCacheConfigPath(), "utf8");
		const parsed = JSON.parse(raw) as {
			cacheMode?: unknown;
			cacheEnabled?: unknown;
			cache?: { mode?: unknown; enabled?: unknown };
		};
		return (
			parseCacheMode(parsed.cacheMode) ??
			parseCacheMode(parsed.cache?.mode) ??
			parseCacheMode(parsed.cacheEnabled) ??
			parseCacheMode(parsed.cache?.enabled) ??
			DEFAULT_CACHE_MODE
		);
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ENOENT" ? DEFAULT_CACHE_MODE : "disabled";
	}
}

async function writeCachePreference(preference: CacheMode): Promise<void> {
	const configPath = getCacheConfigPath();
	const config = {
		cacheMode: preference,
		cacheEnabled: preference === "enabled",
		updatedAt: new Date().toISOString(),
	};

	await fs.mkdir(path.dirname(configPath), { recursive: true });
	await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function resolveCacheDecision(preference: CacheMode): { enabled: boolean; reason: string } {
	if (preference === "enabled") {
		return { enabled: true, reason: "cache preference enabled; using cached local checkouts" };
	}

	return { enabled: false, reason: "cache preference disabled; using GitHub API/temp files only" };
}

function formatCachePreference(preference: CacheMode): string {
	return preference === "enabled" ? "on" : "off";
}

function notifyCommand(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, type);
		return;
	}

	console.error(message);
}

function resolveToolPath(cwd: string, rawPath: string): string {
	const normalized = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
	return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(cwd, normalized);
}

function getBlockedBashReason(command: string, options: { workspace: string; cacheRoot: string; cacheEnabled: boolean }): string | undefined {
	if (!options.cacheEnabled && command.includes(options.cacheRoot)) {
		return "Local repo checkout cache is disabled for this Librarian call.";
	}

	let scan = command.split(options.workspace).join("<WORKSPACE>");
	if (options.cacheEnabled) scan = scan.split(options.cacheRoot).join("<CACHE>");
	if (/(^|[\n;&|()])\s*\//.test(scan)) return "Librarian bash blocks absolute-path executables.";

	const destructiveLocal = /(^|[\n;&|()])\s*(?:sudo|su|rm|rmdir|mv|cp|chmod|chown|dd|truncate|killall|pkill|launchctl|osascript|pbcopy|pbpaste|eval|exec|xargs)(?=$|[\s;&|()])/;
	if (destructiveLocal.test(scan)) return "Librarian bash blocks destructive/local side-effect commands.";

	const extraNetworkOrShell = /(^|[\n;&|()])\s*(?:curl|wget|nc|netcat|ssh|scp|sftp|rsync|bash|sh|zsh|fish|python|python3|perl|ruby|node|deno)(?=$|[\s;&|()])/;
	if (extraNetworkOrShell.test(scan)) return "Librarian bash is limited to gh/git and simple local inspection commands.";

	if (/(^|[\s"'=])(?:~\/|\$HOME\b|\/etc\/|\/var\/|\/private\/|\/root\/|\/Users\/|\/home\/|\/opt\/)/.test(scan)) {
		return "Librarian bash may only access its workspace and approved cache root.";
	}

	if (/\bgh\s+auth\s+token\b/.test(scan) || /(^|[\n;&|()])\s*(?:env|printenv|set|export|declare|echo|printf)(?=$|[\s;&|()])/.test(scan)) {
		return "Librarian bash blocks credential/environment inspection.";
	}

	if (/\bgh\s+api\b(?=.*(?:(?:-X|--method)\s*(?:POST|PUT|PATCH|DELETE)\b|(?:-f|--field|-F|--raw-field|--input)\b))/i.test(scan)) {
		return "Librarian bash allows read-only GitHub API calls only.";
	}

	if (/\bgh\s+(?:repo\s+(?:delete|edit|archive|fork|create)|pr\s+(?:merge|close|edit)|issue\s+(?:close|edit|delete)|release\s+(?:create|delete|upload)|workflow\s+run|gist\s+(?:create|delete|edit))\b/.test(scan)) {
		return "Librarian bash blocks mutating gh commands.";
	}

	if (/\bgit\b[^\n;&|]*\b(?:push|commit|merge|rebase|clean|reset|tag)\b/.test(scan)) {
		return "Librarian bash blocks mutating git commands except local checkout/fetch for cache use.";
	}

	return undefined;
}

function createLibrarianRuntimeGuardExtension(options: {
	maxTurns: number;
	workspace: string;
	cacheRoot: string;
	cacheEnabled: boolean;
}): ExtensionFactory {
	return (pi) => {
		let currentTurn = 0;

		pi.on("turn_start", async (event) => {
			currentTurn = event.turnIndex;
		});

		pi.on("tool_call", async (event) => {
			if (currentTurn >= options.maxTurns - 1) {
				return {
					block: true,
					reason: `Tool use is disabled on final Librarian turn ${options.maxTurns}/${options.maxTurns}. Answer now with the evidence already gathered.`,
				};
			}

			if (event.toolName === "read") {
				const input = event.input as { path?: unknown };
				if (typeof input.path !== "string") return undefined;
				const resolved = resolveToolPath(options.workspace, input.path);
				const realPath = await fs.realpath(resolved).catch(() => resolved);
				const allowed =
					isInside(options.workspace, realPath) ||
					(options.cacheEnabled && isInside(options.cacheRoot, realPath));
				if (!allowed) return { block: true, reason: `Librarian read is limited to its workspace/cache: ${realPath}` };
			}

			if (event.toolName === "bash") {
				const input = event.input as { command?: unknown; timeout?: unknown };
				if (typeof input.timeout !== "number") input.timeout = DEFAULT_BASH_TIMEOUT_SECONDS;

				const command = typeof input.command === "string" ? input.command : "";
				if (!options.cacheEnabled && /\b(?:git\s+clone|gh\s+repo\s+clone)\b/.test(command)) {
					return { block: true, reason: "Local repo checkout cache is disabled for this Librarian call." };
				}

				const blockedReason = getBlockedBashReason(command, options);
				if (blockedReason) return { block: true, reason: blockedReason };
			}

			return undefined;
		});

		pi.on("tool_result", async (event) => ({
			content: [
				...(event.content ?? []),
				{
					type: "text",
					text: `\n\n[librarian turn budget] turn ${Math.min(currentTurn + 1, options.maxTurns)}/${options.maxTurns}`,
				},
			],
		}));
	};
}

function buildSystemPrompt(options: {
	workspace: string;
	maxSearchResults: number;
	cacheEnabled: boolean;
	cacheRoot: string;
}): string {
	const cacheSection = options.cacheEnabled
		? `\nLocal checkout cache is ENABLED for this call.\n- Cache root: ${options.cacheRoot}\n- Use checkout path pattern: ${options.cacheRoot}/github.com/<owner>/<repo>\n- Reuse an existing checkout when it has a .git directory. Fetch/prune before relying on it: git -C "$DIR" fetch --all --prune --tags --quiet\n- If missing, clone with gh repo clone "$REPO" "$DIR" (or git clone https://github.com/$REPO.git "$DIR").\n- If a ref/branch/SHA is requested, fetch it and check it out locally before citing files from that ref.\n- After using a checkout, update its cache marker: touch "$DIR/${CACHE_MARKER_FILE}"\n- Prefer local rg/read inside cached checkouts once a repo is cloned, and cite absolute cached paths with line ranges.\n- Clone only repositories that are relevant to the query; do not bulk-clone broad owner/org scopes unless necessary.`
		: `\nLocal checkout cache is DISABLED for this call.\n- Do not clone repositories.\n- Use gh search/API/tree/contents calls and cache only necessary proof files under ${options.workspace}/repos/<owner>/<repo>/<path>.`;

	return `You are Librarian, an evidence-first GitHub code scout running inside pi.\n\nUse only the available bash/read tools. Use gh, jq, rg, find/fd, ls, stat, mkdir, base64, and nl -ba for GitHub reconnaissance and numbered evidence. Use read for focused local file inspection.\n\nWorkspace: ${options.workspace}\nDefault gh search limit: ${options.maxSearchResults}\nTurn budget: ${MAX_TURNS} turns total, including your final answer. Stop searching once you have enough evidence.\n${cacheSection}\n\nNon-negotiable constraints:\n- Never treat gh search snippets as proof by themselves. Use fetched files or local checkouts for code-content claims.\n- Keep temporary workspace writes under ${options.workspace}/repos unless local checkout cache is enabled, in which case writes under the cache root are also allowed.
- A runtime guard blocks destructive shell commands, credential/environment inspection, and reads outside the workspace/cache.\n- Never paste whole files. Use short snippets only when they clarify the evidence.\n- If evidence is partial or access fails (404/403), state the limitation clearly.\n- Do not present anything as fact unless it appeared in tool output or in a file you read.\n\nRecommended search flow:\n1. If symbols/text are known, start with gh search code and the provided repo/owner filters.\n2. If a repo is known but paths are unclear, resolve the default branch and inspect the git tree or contents API.\n3. Fetch or clone only the files/repos required to prove the answer.\n4. Use rg/read/nl -ba locally to produce stable path and line evidence.\n\nUseful gh patterns:\n- gh repo view "$REPO" --json defaultBranchRef --jq '.defaultBranchRef.name'\n- gh search code '<terms>' --json path,repository,sha,url,textMatches --limit ${options.maxSearchResults}\n- gh api "repos/$REPO/git/trees/$REF?recursive=1" > tree.json\n- gh api "repos/$REPO/contents/$FILE?ref=$REF" --jq .content | tr -d '\\n' | base64 --decode > "repos/$REPO/$FILE"\n- rg -n '<pattern>' '<local path>'\n- nl -ba '<local file>' | sed -n '10,30p'\n\nOutput format, exact order:\n## Summary\n1-3 concise sentences.\n## Locations\n- \`path\` or \`path:lineStart-lineEnd\` — what is here and why it matters; include GitHub URL when useful. If nothing relevant is found, write \`- (none)\`.\n## Evidence\n- \`path\` or \`path:lineStart-lineEnd\` — what this proves. Include concise snippets only if useful.\n## Searched\nOnly include when incomplete/not found or when the search path matters. List queries, filters, and probes used.\n## Next steps\nOptional: 1-3 narrow follow-up checks for remaining ambiguity.`;
}

function buildUserPrompt(query: string, repos: string[], owners: string[], maxSearchResults: number, cache: CacheDetails): string {
	return `Task: locate and cite exact GitHub code locations that answer the query.\n\nQuery: ${query}\nRepository filters: ${repos.length ? repos.join(", ") : "(none)"}\nOwner filters: ${owners.length ? owners.join(", ") : "(none)"}\nMax search results per gh search call: ${maxSearchResults}\nLocal checkout cache: ${cache.mode === "enabled" ? `enabled at ${cache.root}` : "disabled"}\nCache decision: ${cache.decisionReason}\n\nRespond directly with concise, citation-heavy findings. Always pass --limit ${maxSearchResults} to gh search code unless a narrower command is clearly better.`;
}

function extractLastAssistantText(messages: unknown[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i] as { role?: string; content?: unknown };
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		const parts: string[] = [];
		for (const part of message.content) {
			if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
				const text = (part as { text?: unknown }).text;
				if (typeof text === "string") parts.push(text);
			}
		}
		if (parts.length) return parts.join("").trim();
	}
	return "";
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
	if (call.name === "bash") {
		const command = typeof args.command === "string" ? args.command : "";
		return `bash ${shorten(command, 120)}`.trim();
	}
	return call.name;
}

function renderAnswer(details: LibrarianDetails): string {
	if (details.error) return details.error;
	return details.status === "running" ? "(searching GitHub...)" : "(no output)";
}

function isAbortLikeError(error: unknown): boolean {
	if (error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError") return true;
	const message = error instanceof Error ? error.message : String(error);
	return /aborted|cancelled|canceled/i.test(message);
}

export default function librarianExtension(pi: ExtensionAPI) {
	let cachePreference: CacheMode = DEFAULT_CACHE_MODE;

	pi.on("session_start", async () => {
		cachePreference = await readCachePreference();
	});

	pi.registerCommand("librarian-cache", {
		description: "Toggle Librarian local checkout cache for future librarian calls",
		getArgumentCompletions: (prefix) => {
			const commands = ["on", "off", "toggle", "status"];
			const query = prefix.trim().toLowerCase();
			const matches = commands.filter((command) => command.startsWith(query));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase() || "status";
			const cacheRoot = getUserCacheReposRoot();
			const configPath = getCacheConfigPath();

			const setPreference = async (mode: CacheMode): Promise<string | undefined> => {
				cachePreference = mode;
				try {
					await writeCachePreference(mode);
					return undefined;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return `Preference changed for this process, but could not save ${configPath}: ${message}`;
				}
			};

			const formatSetMessage = (mode: CacheMode, warning?: string): string => {
				const main = mode === "enabled"
					? `Librarian cache enabled. Future librarian calls will reuse local checkouts under ${cacheRoot}.`
					: "Librarian cache disabled. Future librarian calls will use GitHub API/search and temporary fetched files only.";
				return warning ? `${main} ${warning}` : main;
			};

			if (action === "on" || action === "enable") {
				const warning = await setPreference("enabled");
				notifyCommand(ctx, formatSetMessage("enabled", warning), warning ? "warning" : "info");
				return;
			}

			if (action === "off" || action === "disable") {
				const warning = await setPreference("disabled");
				notifyCommand(ctx, formatSetMessage("disabled", warning), warning ? "warning" : "info");
				return;
			}

			if (action === "toggle") {
				const next = cachePreference === "enabled" ? "disabled" : "enabled";
				const warning = await setPreference(next);
				notifyCommand(ctx, formatSetMessage(next, warning), warning ? "warning" : "info");
				return;
			}

			if (action === "status") {
				notifyCommand(
					ctx,
					`Librarian cache is ${formatCachePreference(cachePreference)}. Cache directory: ${cacheRoot}. Config: ${configPath}. Repos unused for ${CACHE_TTL_DAYS} days are removed lazily.`,
				);
				return;
			}

			notifyCommand(ctx, "Usage: /librarian-cache on | off | toggle | status", "warning");
		},
	});

	pi.registerTool({
		name: "librarian",
		label: "Librarian",
		description:
			"GitHub research scout for coding and personal-assistant tasks. Use when the answer likely lives in GitHub repos, exact repo/path locations are unknown, or you'd otherwise do exploratory gh search/tree probes plus local rg/read inspection. Librarian uses an optional 7-day local checkout cache by default; toggle it with /librarian-cache.",
		promptSnippet:
			"Research GitHub repositories with evidence-first path and line citations; local checkout cache is enabled by default and user-toggleable with /librarian-cache.",
		promptGuidelines: [
			"Use librarian when the answer likely requires exploratory GitHub repository search or line-cited evidence from external repos.",
			"Do not use librarian for files already present in the current workspace unless the user asks for external GitHub research.",
		],
		parameters: LibrarianParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const rawQuery = (params as { query?: unknown }).query;
			const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
			if (!query) throw new Error("Invalid parameters: expected query to be a non-empty string.");
			if (!ctx.model) throw new Error("Librarian needs an active pi model, but ctx.model is unavailable.");

			const repos = asStringArray((params as { repos?: unknown }).repos);
			const owners = asStringArray((params as { owners?: unknown }).owners);
			const maxSearchResults = clampNumber(
				(params as { maxSearchResults?: unknown }).maxSearchResults,
				1,
				MAX_SEARCH_RESULTS,
				DEFAULT_MAX_SEARCH_RESULTS,
			);

			const workspaceBase = path.join(os.tmpdir(), "pi-librarian");
			await fs.mkdir(workspaceBase, { recursive: true });
			const workspace = await fs.mkdtemp(path.join(workspaceBase, "run-"));
			await fs.mkdir(path.join(workspace, "repos"), { recursive: true });

			const cacheRoot = getUserCacheReposRoot();
			let cacheDecision = resolveCacheDecision(cachePreference);
			let cleanup: { deleted: number; errors: string[] } = { deleted: 0, errors: [] };
			if (cacheDecision.enabled) {
				try {
					await fs.mkdir(cacheRoot, { recursive: true });
					cleanup = await cleanupExpiredCache(cacheRoot);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					cacheDecision = {
						enabled: false,
						reason: `cache setup failed (${message}); using GitHub API/temp files only`,
					};
					cleanup = { deleted: 0, errors: [`cache setup: ${message}`] };
				}
			}

			const details: LibrarianDetails = {
				status: "running",
				workspace,
				cache: {
					mode: cacheDecision.enabled ? "enabled" : "disabled",
					root: cacheRoot,
					ttlDays: CACHE_TTL_DAYS,
					cleanupDeleted: cleanup.deleted,
					cleanupErrors: cleanup.errors,
					decisionReason: cacheDecision.reason,
				},
				turns: 0,
				toolCalls: [],
				startedAt: Date.now(),
			};

			let lastContent = "(searching GitHub...)";
			let session: { abort: () => Promise<void>; dispose: () => void; state: { messages: unknown[] }; prompt: Function } | undefined;
			let unsubscribe: (() => void) | undefined;
			let runTimeout: NodeJS.Timeout | undefined;
			let abortListenerAdded = false;
			let aborted = Boolean(signal?.aborted);

			const emit = (force = false) => {
				void force;
				onUpdate?.({ content: [{ type: "text", text: lastContent }], details });
			};

			const abort = () => {
				aborted = true;
				details.status = "aborted";
				details.endedAt = Date.now();
				lastContent = "Aborted";
				emit(true);
				void session?.abort();
			};

			if (signal?.aborted) abort();
			if (signal && !signal.aborted) {
				signal.addEventListener("abort", abort);
				abortListenerAdded = true;
			}

			try {
				emit(true);

				const systemPrompt = buildSystemPrompt({
					workspace,
					maxSearchResults,
					cacheEnabled: cacheDecision.enabled,
					cacheRoot,
				});

				const resourceLoader = new DefaultResourceLoader({
					cwd: workspace,
					agentDir: getAgentDir(),
					noExtensions: true,
					noSkills: true,
					noPromptTemplates: true,
					noThemes: true,
					noContextFiles: true,
					extensionFactories: [
						createLibrarianRuntimeGuardExtension({
							maxTurns: MAX_TURNS,
							workspace,
							cacheRoot,
							cacheEnabled: cacheDecision.enabled,
						}),
					],
					systemPromptOverride: () => systemPrompt,
					skillsOverride: () => ({ skills: [], diagnostics: [] }),
					agentsFilesOverride: () => ({ agentsFiles: [] }),
				});

				await resourceLoader.reload();

				const created = await createAgentSession({
					cwd: workspace,
					modelRegistry: ctx.modelRegistry,
					resourceLoader,
					sessionManager: SessionManager.inMemory(workspace),
					model: ctx.model,
					thinkingLevel: pi.getThinkingLevel(),
					tools: ["read", "bash"],
				});

				session = created.session as typeof session;
				unsubscribe = (created.session as any).subscribe((event: any) => {
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
							emit(true);
							break;
						case "tool_execution_end": {
							const call = details.toolCalls.find((item) => item.id === event.toolCallId);
							if (call) {
								call.endedAt = Date.now();
								call.isError = event.isError;
							}
							emit(true);
							break;
						}
					}
				});

				if (!aborted) {
					const promptPromise = created.session.prompt(buildUserPrompt(query, repos, owners, maxSearchResults, details.cache), {
						expandPromptTemplates: false,
					});
					const timeoutPromise = new Promise<never>((_resolve, reject) => {
						runTimeout = setTimeout(() => {
							abort();
							reject(new Error(`Librarian timed out after ${Math.round(MAX_RUN_MS / 1000)} seconds.`));
						}, MAX_RUN_MS);
					});
					await Promise.race([promptPromise, timeoutPromise]);
				}

				const answer = session ? extractLastAssistantText(session.state.messages) : "";
				lastContent = answer || (aborted ? "Aborted" : "(no output)");
				details.status = aborted ? "aborted" : "done";
				details.endedAt = Date.now();
				emit(true);

				return {
					content: [{ type: "text", text: lastContent }],
					details,
				};
			} catch (error) {
				const wasAbort = aborted || isAbortLikeError(error);
				const message = wasAbort ? "Aborted" : error instanceof Error ? error.message : String(error);
				details.status = wasAbort ? "aborted" : "error";
				details.error = wasAbort ? undefined : message;
				details.endedAt = Date.now();
				lastContent = message;
				emit(true);

				return {
					content: [{ type: "text", text: message }],
					details,
				};
			} finally {
				if (runTimeout) clearTimeout(runTimeout);
				if (signal && abortListenerAdded) signal.removeEventListener("abort", abort);
				unsubscribe?.();
				session?.dispose();
			}
		},

		renderCall(args, theme) {
			const query = typeof (args as { query?: unknown })?.query === "string" ? (args as { query: string }).query : "";
			const repos = Array.isArray((args as { repos?: unknown })?.repos) ? (args as { repos: unknown[] }).repos.length : 0;
			const owners = Array.isArray((args as { owners?: unknown })?.owners)
				? (args as { owners: unknown[] }).owners.length
				: 0;
			return new Text(
				`${theme.fg("muted", `repos:${repos} owners:${owners}`)} · ${theme.fg("toolOutput", shorten(query, 80))}`,
				0,
				0,
			);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as LibrarianDetails | undefined;
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

			const cacheLabel =
				details.cache.mode === "enabled"
					? theme.fg("success", "cache:on")
					: theme.fg("muted", "cache:off");
			const header = `${icon} ${theme.fg("toolTitle", theme.bold("librarian "))}${theme.fg(
				"dim",
				`${details.turns} turns • ${details.toolCalls.length} tools • `,
			)}${cacheLabel}`;

			const workspaceLine = `${theme.fg("muted", "workspace: ")}${theme.fg("toolOutput", details.workspace)}`;
			const cacheLine = `${theme.fg("muted", "cache: ")}${theme.fg("toolOutput", details.cache.root)} ${theme.fg(
				"dim",
				`(${details.cache.mode}, ${details.cache.ttlDays}d TTL, cleaned ${details.cache.cleanupDeleted})`,
			)}`;

			const answer =
				(result.content[0]?.type === "text" ? result.content[0].text : renderAnswer(details)).trim() || "(no output)";

			const toolLines = details.toolCalls.slice(expanded ? 0 : -6).map((call) => {
				const callIcon = call.isError ? theme.fg("error", "✗") : theme.fg("dim", "→");
				return `${callIcon} ${theme.fg("toolOutput", formatToolCall(call))}`;
			});
			if (!expanded && details.toolCalls.length > 6) toolLines.unshift(theme.fg("muted", "…"));

			if (status === "running") {
				const parts = [header, workspaceLine, cacheLine];
				if (toolLines.length) parts.push("", theme.fg("muted", "Tools:"), ...toolLines);
				parts.push("", theme.fg("muted", "Searching GitHub…"));
				return new Text(parts.join("\n"), 0, 0);
			}

			if (!expanded) {
				const previewLines = answer.split("\n").slice(0, 18);
				const parts = [header, workspaceLine, cacheLine, "", theme.fg("toolOutput", previewLines.join("\n"))];
				if (answer.split("\n").length > previewLines.length) parts.push(theme.fg("muted", "(Ctrl+O to expand)"));
				if (toolLines.length) parts.push("", theme.fg("muted", "Tools:"), ...toolLines);
				return new Text(parts.join("\n"), 0, 0);
			}

			const container = new Container();
			container.addChild(new Text(header, 0, 0));
			container.addChild(new Text(workspaceLine, 0, 0));
			container.addChild(new Text(cacheLine, 0, 0));
			if (details.cache.cleanupErrors.length) {
				container.addChild(
					new Text(theme.fg("warning", `cache cleanup warnings: ${details.cache.cleanupErrors.length}`), 0, 0),
				);
			}
			if (toolLines.length) {
				container.addChild(new Spacer(1));
				container.addChild(new Text([theme.fg("muted", "Tools:"), ...toolLines].join("\n"), 0, 0));
			}
			container.addChild(new Spacer(1));
			container.addChild(new Markdown(answer, 0, 0, getMarkdownTheme()));
			return container;
		},
	});
}
