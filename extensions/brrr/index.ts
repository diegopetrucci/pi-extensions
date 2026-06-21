/**
 * Pi brrr Extension
 *
 * Sends a brrr push notification when pi finishes an agent turn and is ready
 * for more input.
 *
 * Config files (project overrides global):
 * - ~/.pi/agent/extensions/brrr.json
 * - <cwd>/.pi/brrr.json, when the project is trusted
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const CONFIG_DIR_NAME = ".pi";

interface BrrrConfig {
	enabled: boolean;
	onlyWhenInteractive: boolean;
	webhook: string;
	idleSeconds: number | null;
	title: string;
	message: string;
	includeLastAssistantMessage: boolean;
	sound: string;
	openUrl: string;
	imageUrl: string;
}

interface BrrrPayload {
	message: string;
	title?: string;
	subtitle?: string;
	expiration_date?: string;
	sound?: string;
	open_url?: string;
	image_url?: string;
}

type ProjectConfigContext = {
	cwd: string;
	isProjectTrusted?: () => boolean;
};

const DEFAULT_CONFIG: BrrrConfig = {
	enabled: true,
	onlyWhenInteractive: true,
	webhook: "$BRRR_WEBHOOK_URL",
	idleSeconds: 20,
	title: "Pi finished",
	message: "Pi finished working in '{project}'.",
	includeLastAssistantMessage: true,
	sound: "",
	openUrl: "",
	imageUrl: "",
};

function readConfigFile(path: string): Partial<BrrrConfig> {
	if (!existsSync(path)) return {};

	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Partial<BrrrConfig>;
	} catch (error) {
		console.error(`Warning: Could not parse ${path}: ${error}`);
		return {};
	}
}

function mergeConfig(base: BrrrConfig, overrides: Partial<BrrrConfig>): BrrrConfig {
	return {
		...base,
		...overrides,
	};
}

function canReadProjectConfig(ctx: ProjectConfigContext): boolean {
	return typeof ctx.isProjectTrusted === "function" && ctx.isProjectTrusted();
}

function loadConfig(ctx: ProjectConfigContext): BrrrConfig {
	const globalConfig = readConfigFile(join(getAgentDir(), "extensions", "brrr.json"));
	const projectConfig = canReadProjectConfig(ctx)
		? readConfigFile(join(ctx.cwd, CONFIG_DIR_NAME, "brrr.json"))
		: {};
	return mergeConfig(mergeConfig(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function resolveWebhook(raw: string): string | undefined {
	const value = raw.trim();
	if (!value) return undefined;

	const envMatch = value.match(/^\$([A-Z0-9_]+)$/) ?? value.match(/^\$\{([A-Z0-9_]+)\}$/);
	if (envMatch) return process.env[envMatch[1]]?.trim() || undefined;

	return value;
}

function isBrrrWebhookUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			(url.hostname === "api.brrr.now" || url.hostname === "dev.api.brrr.now") &&
			/^\/v1\/br_[A-Za-z0-9_]+$/.test(url.pathname)
		);
	} catch {
		return false;
	}
}

async function getMacOsIdleSeconds(): Promise<number | null> {
	if (process.platform !== "darwin") return null;

	try {
		const { stdout } = await execFileAsync("ioreg", ["-c", "IOHIDSystem"], {
			timeout: 1000,
			maxBuffer: 1024 * 1024,
		});
		const match = stdout.match(/HIDIdleTime"\s*=\s*(\d+)/) ?? stdout.match(/HIDIdleTime\s+=\s+(\d+)/);
		if (!match) return null;

		const idleNanoseconds = Number(match[1]);
		if (!Number.isFinite(idleNanoseconds)) return null;

		return Math.floor(idleNanoseconds / 1_000_000_000);
	} catch {
		return null;
	}
}

async function shouldSkipForIdleThreshold(idleSeconds: number | null): Promise<boolean> {
	if (idleSeconds === null) return false;
	if (!Number.isFinite(idleSeconds) || idleSeconds < 0) return false;

	const currentIdleSeconds = await getMacOsIdleSeconds();
	if (currentIdleSeconds === null) return false;

	return currentIdleSeconds < idleSeconds;
}

function formatTemplate(template: string, cwd: string): string {
	const project = basename(cwd || process.cwd());
	return template.replaceAll("{project}", project).replaceAll("{cwd}", cwd);
}

function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const parts: string[] = [];
	for (const part of content) {
		if (typeof part === "string") {
			parts.push(part);
			continue;
		}
		if (typeof part !== "object" || part === null) continue;

		const maybeText = (part as { text?: unknown }).text;
		if (typeof maybeText === "string") parts.push(maybeText);
	}

	return parts.join("\n");
}

function lastAssistantMessage(messages: readonly unknown[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (typeof message !== "object" || message === null) continue;
		if ((message as { role?: unknown }).role !== "assistant") continue;

		const text = extractTextContent((message as { content?: unknown }).content).trim();
		if (text) return text;
	}

	return undefined;
}

function truncateMessage(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length <= 800) return trimmed;
	return `${trimmed.slice(0, 797).trimEnd()}...`;
}

async function sendBrrr(webhook: string, payload: BrrrPayload): Promise<{ ok: boolean; error?: string }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2_000);

	try {
		const body: Record<string, string> = { message: payload.message };
		if (payload.title) body.title = payload.title;
		if (payload.subtitle) body.subtitle = payload.subtitle;
		if (payload.expiration_date) body.expiration_date = payload.expiration_date;
		if (payload.sound) body.sound = payload.sound;
		if (payload.open_url) body.open_url = payload.open_url;
		if (payload.image_url) body.image_url = payload.image_url;

		const response = await fetch(webhook, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		if (response.status === 202) return { ok: true };
		return { ok: false, error: `Unexpected response status ${response.status}.` };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : "Unknown webhook failure." };
	} finally {
		clearTimeout(timeout);
	}
}

function notify(ctx: ExtensionCommandContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(message, type);
}

function describeConfig(config: BrrrConfig, webhook: string | undefined): string {
	const webhookStatus = webhook ? (isBrrrWebhookUrl(webhook) ? "configured" : "invalid") : "missing";
	const idle = config.idleSeconds === null ? "off" : `${config.idleSeconds}s`;
	return `brrr is ${config.enabled ? "enabled" : "disabled"}; webhook ${webhookStatus}; idle threshold ${idle}.`;
}

export default function brrrExtension(pi: ExtensionAPI) {
	pi.registerCommand("brrr", {
		description: "Show brrr notification status",
		handler: async (_args, ctx) => {
			const config = loadConfig(ctx);
			notify(ctx, describeConfig(config, resolveWebhook(config.webhook)));
		},
	});

	pi.on("agent_end", async (event, ctx) => {
		const config = loadConfig(ctx);
		if (!config.enabled) return;
		if (config.onlyWhenInteractive && !ctx.hasUI) return;

		const webhook = resolveWebhook(config.webhook);
		if (!webhook || !isBrrrWebhookUrl(webhook)) return;
		if (await shouldSkipForIdleThreshold(config.idleSeconds)) return;

		const assistantMessage = config.includeLastAssistantMessage ? lastAssistantMessage(event.messages as readonly unknown[]) : undefined;
		const message = truncateMessage(assistantMessage || formatTemplate(config.message, ctx.cwd));
		const result = await sendBrrr(webhook, {
			title: formatTemplate(config.title, ctx.cwd),
			message,
			sound: config.sound.trim() || undefined,
			open_url: config.openUrl.trim() || undefined,
			image_url: config.imageUrl.trim() || undefined,
		});

		if (!result.ok && result.error) {
			console.error(`brrr notification failed: ${result.error}`);
		}
	});
}
