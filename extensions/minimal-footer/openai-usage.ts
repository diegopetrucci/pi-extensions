import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "openai-codex";

interface WhamUsageWindow {
	reset_at?: number;
	used_percent?: number;
}

interface WhamUsageResponse {
	rate_limit?: {
		primary_window?: WhamUsageWindow;
		secondary_window?: WhamUsageWindow;
	};
}

export interface UsageWindow {
	usedPercent?: number;
	resetAt?: number;
}

export interface UsageSnapshot {
	primary?: UsageWindow;
	secondary?: UsageWindow;
	fetchedAt: number;
}

export interface UsageSummaryWindowsConfig {
	primary: {
		enabled: boolean;
		label: string;
	};
	secondary: {
		enabled: boolean;
		label: string;
	};
}

function normalizeUsedPercent(value?: number): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return Math.min(100, Math.max(0, value));
}

function normalizeResetAt(value?: number): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value * 1000;
}

function parseUsageWindow(window?: WhamUsageWindow): UsageWindow | undefined {
	if (!window) return undefined;
	const usedPercent = normalizeUsedPercent(window.used_percent);
	const resetAt = normalizeResetAt(window.reset_at);
	if (usedPercent === undefined && resetAt === undefined) return undefined;
	return { usedPercent, resetAt };
}

function parseUsageSnapshot(data: WhamUsageResponse): Omit<UsageSnapshot, "fetchedAt"> {
	return {
		primary: parseUsageWindow(data.rate_limit?.primary_window),
		secondary: parseUsageWindow(data.rate_limit?.secondary_window),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readStoredProviderCredential(providerId: string): unknown {
	try {
		const data = JSON.parse(readFileSync(join(getAgentDir(), "auth.json"), "utf-8")) as unknown;
		if (!isRecord(data)) return undefined;
		return data[providerId];
	} catch {
		return undefined;
	}
}

async function getAccessToken(authSource: unknown): Promise<string | undefined> {
	if (isRecord(authSource) && typeof authSource.getProviderAuth === "function") {
		const result = await (authSource as {
			getProviderAuth(providerId: string): Promise<unknown>;
		}).getProviderAuth(PROVIDER_ID);
		if (isRecord(result) && isRecord(result.auth) && typeof result.auth.apiKey === "string") {
			return result.auth.apiKey;
		}
	}

	if (isRecord(authSource) && typeof authSource.getApiKey === "function") {
		const token = await (authSource as {
			getApiKey(providerId: string, options: { includeFallback: boolean }): Promise<unknown>;
		}).getApiKey(PROVIDER_ID, { includeFallback: false });
		return typeof token === "string" ? token : undefined;
	}

	const credential = readStoredProviderCredential(PROVIDER_ID);
	if (!isRecord(credential) || credential.type !== "oauth") return undefined;
	return typeof credential.access === "string" ? credential.access : undefined;
}

function getOAuthAccountId(authSource: unknown): string | undefined {
	let credential: unknown;

	if (
		isRecord(authSource) &&
		typeof authSource.getApiKey === "function" &&
		typeof authSource.get === "function"
	) {
		if (typeof authSource.reload === "function") authSource.reload();
		credential = (authSource as { get(providerId: string): unknown }).get(PROVIDER_ID);
	} else {
		credential = readStoredProviderCredential(PROVIDER_ID);
	}

	if (!isRecord(credential) || credential.type !== "oauth") return undefined;
	const accountId = credential.accountId;
	return typeof accountId === "string" && accountId.trim()
		? accountId.trim()
		: undefined;
}

function formatUsagePercent(value?: number): string | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return `${Math.round(value)}%`;
}

export function isOpenAICodexProvider(provider?: string): boolean {
	return provider === PROVIDER_ID;
}

export function formatUsageSummary(
	snapshot: UsageSnapshot | undefined,
	windows: UsageSummaryWindowsConfig,
): string | undefined {
	if (!snapshot) return undefined;

	const primary = formatUsagePercent(snapshot.primary?.usedPercent);
	const secondary = formatUsagePercent(snapshot.secondary?.usedPercent);
	const parts: string[] = [];

	if (windows.primary.enabled && primary) parts.push(`${windows.primary.label} ${primary}`);
	if (windows.secondary.enabled && secondary) parts.push(`${windows.secondary.label} ${secondary}`);

	return parts.length > 0 ? parts.join(" · ") : undefined;
}

export async function fetchOpenAICodexUsage(
	authSource: unknown,
	options?: { timeoutMs?: number },
): Promise<UsageSnapshot | undefined> {
	const accessToken = await getAccessToken(authSource);
	if (!accessToken) return undefined;

	const accountId = getOAuthAccountId(authSource);
	const controller = new AbortController();
	const timeoutMs = options?.timeoutMs ?? 10_000;
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
		};
		if (accountId) {
			headers["ChatGPT-Account-Id"] = accountId;
		}

		const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
			headers,
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`Usage request failed: ${response.status}`);
		}

		const data = (await response.json()) as WhamUsageResponse;
		return { ...parseUsageSnapshot(data), fetchedAt: Date.now() };
	} finally {
		clearTimeout(timeout);
	}
}
