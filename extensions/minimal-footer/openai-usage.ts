import { AuthStorage } from "@mariozechner/pi-coding-agent";

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

function getOAuthAccountId(authStorage: AuthStorage): string | undefined {
	const credential = authStorage.get(PROVIDER_ID);
	if (!credential || credential.type !== "oauth") return undefined;
	const accountId = (credential as { accountId?: unknown }).accountId;
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

export function formatUsageSummary(snapshot?: UsageSnapshot): string | undefined {
	if (!snapshot) return undefined;

	const primary = formatUsagePercent(snapshot.primary?.usedPercent);
	const secondary = formatUsagePercent(snapshot.secondary?.usedPercent);
	const parts: string[] = [];

	if (primary) parts.push(`5h ${primary}`);
	if (secondary) parts.push(`7d ${secondary}`);

	return parts.length > 0 ? parts.join(" · ") : undefined;
}

export async function fetchOpenAICodexUsage(
	authStorage: AuthStorage,
	options?: { timeoutMs?: number },
): Promise<UsageSnapshot | undefined> {
	const accessToken = await authStorage.getApiKey(PROVIDER_ID, {
		includeFallback: false,
	});
	if (!accessToken) return undefined;

	authStorage.reload();
	const accountId = getOAuthAccountId(authStorage);
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
