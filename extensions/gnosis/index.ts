import { StringEnum } from "@earendil-works/pi-ai";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateTail,
	type ExtensionAPI,
	type ToolExecutionMode,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

const GNOSIS_TIMEOUT_MS = 30_000;

const GnosisParams = Type.Object({
	action: StringEnum(["plan", "review", "search", "latest", "show", "topics", "write", "reindex"] as const, {
		description: "The gnosis operation to run.",
	}),
	query: Type.Optional(Type.String({ minLength: 1, description: "Search query for action=search. Use uppercase OR/NOT for FTS operators." })),
	target: Type.Optional(Type.String({ minLength: 1, description: "Entry ID prefix or topic for action=show." })),
	topics: Type.Optional(
		Type.Array(Type.String({ minLength: 1 }), {
			minItems: 1,
			description: "Topics for action=write. Each normalized topic must be at least 7 chars.",
		}),
	),
	text: Type.Optional(Type.String({ minLength: 1, description: "Knowledge text for action=write." })),
	related: Type.Optional(
		Type.Array(Type.String({ minLength: 1 }), { description: "Related entry IDs or unique prefixes for action=write." }),
	),
	limit: Type.Optional(Type.Integer({ minimum: 1, description: "Positive result limit for action=search or action=latest." })),
});

type GnosisParams = Static<typeof GnosisParams>;

function positiveInteger(value: number | undefined, name: string): string | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
	return String(value);
}

function requireString(value: string | undefined, name: string): string {
	const trimmed = value?.trim();
	if (!trimmed) throw new Error(`${name} is required.`);
	return trimmed;
}

function buildGnosisArgs(params: GnosisParams): string[] {
	switch (params.action) {
		case "plan":
			return ["help", "plan"];
		case "review":
			return ["help", "review"];
		case "search": {
			const args = ["search", requireString(params.query, "query")];
			const limit = positiveInteger(params.limit, "limit");
			if (limit) args.push("--limit", limit);
			return args;
		}
		case "latest": {
			const args = ["latest"];
			const limit = positiveInteger(params.limit, "limit");
			if (limit) args.push("--limit", limit);
			return args;
		}
		case "show":
			return ["show", requireString(params.target, "target")];
		case "topics":
			return ["topics"];
		case "write": {
			const topics = params.topics?.map((topic) => topic.trim()).filter(Boolean) ?? [];
			if (topics.length === 0) throw new Error("topics is required for action=write.");
			const args = ["write", topics.join(","), requireString(params.text, "text")];
			const related = params.related?.map((id) => id.trim()).filter(Boolean) ?? [];
			if (related.length > 0) args.push("--related", related.join(","));
			return args;
		}
		case "reindex":
			return ["reindex"];
		default: {
			const exhaustive: never = params.action;
			throw new Error(`Unsupported gnosis action: ${exhaustive}`);
		}
	}
}

function installHint(): string {
	return [
		"The `gn` CLI is required for the gnosis extension.",
		"Install it with one of:",
		"  brew install --cask skorokithakis/tap/gnosis",
		"  go install github.com/skorokithakis/gnosis/cmd/gn@latest",
	].join("\n");
}

function formatOutput(stdout: string, stderr: string): { text: string; truncated: boolean } {
	const raw = [stdout, stderr].filter(Boolean).join(stderr && stdout ? "\n" : "").trimEnd();
	if (!raw) return { text: "(no output)", truncated: false };

	const truncation = truncateTail(raw, {
		maxBytes: DEFAULT_MAX_BYTES,
		maxLines: DEFAULT_MAX_LINES,
	});

	let text = truncation.content;
	if (truncation.truncated) {
		text += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
		text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).]`;
	}
	return { text, truncated: truncation.truncated };
}

export default function gnosisExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "gnosis",
		label: "Gnosis",
		description:
			"Search and record repo-local project knowledge using the `gn` CLI. Supports plan/review doctrine, search, latest, show, topics, write, and reindex. Does not support edit/rm; use shell only with explicit user intent for destructive gnosis maintenance.",
		executionMode: "sequential" as ToolExecutionMode,
		promptSnippet: "Search and record repo-local project knowledge through gnosis (`gn`).",
		promptGuidelines: [
			"Use the gnosis tool before implementing changes that may touch prior architecture, project decisions, rejected alternatives, or human constraints.",
			"Use gnosis with action=\"search\" and uppercase OR between likely topic keywords, for example `auth OR token OR session`.",
			"Use gnosis with action=\"write\" only for durable, non-obvious project knowledge that is not already captured in code, comments, docs, or the commit message.",
			"Prefer code comments over gnosis with action=\"write\" when the knowledge has an obvious specific code anchor.",
		],
		parameters: GnosisParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const args = buildGnosisArgs(params);

			let result: Awaited<ReturnType<typeof pi.exec>>;
			try {
				result = await pi.exec("gn", args, {
					cwd: ctx.cwd,
					signal,
					timeout: GNOSIS_TIMEOUT_MS,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`${installHint()}\n\nExecution error: ${message}`);
			}

			const output = formatOutput(result.stdout ?? "", result.stderr ?? "");
			if (result.killed) throw new Error(`gnosis ${params.action} timed out or was cancelled.\n\n${output.text}`);
			if (result.code !== 0) {
				throw new Error(`gnosis ${params.action} failed with exit code ${result.code}.\n\n${output.text}\n\n${installHint()}`);
			}

			return {
				content: [{ type: "text", text: output.text }],
				details: {
					action: params.action,
					args,
					truncated: output.truncated,
				},
			};
		},
	});
}
