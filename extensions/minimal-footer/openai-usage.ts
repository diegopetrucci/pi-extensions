import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "openai-codex";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

/**
 * Usage status is deliberately separate from a snapshot. A direct OpenAI
 * ChatGPT OAuth credential is sent to api.openai.com by Pi, while this module
 * only knows the legacy openai-codex WHAM contract. Keeping that distinction
 * explicit prevents an unsupported account from reusing legacy data.
 */
export type UsageAvailability = "unsupported" | "unavailable";

interface WhamUsageWindow {
  limit_window_seconds?: number;
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
  windowSeconds?: number;
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

function normalizeWindowSeconds(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function normalizeResetAt(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value * 1000;
}

function parseUsageWindow(window?: WhamUsageWindow): UsageWindow | undefined {
  if (!window) return undefined;
  const usedPercent = normalizeUsedPercent(window.used_percent);
  const windowSeconds = normalizeWindowSeconds(window.limit_window_seconds);
  const resetAt = normalizeResetAt(window.reset_at);
  if (usedPercent === undefined && windowSeconds === undefined && resetAt === undefined)
    return undefined;
  return { usedPercent, windowSeconds, resetAt };
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
    const result = await (
      authSource as {
        getProviderAuth(providerId: string): Promise<unknown>;
      }
    ).getProviderAuth(PROVIDER_ID);
    if (isRecord(result) && isRecord(result.auth) && typeof result.auth.apiKey === "string") {
      return result.auth.apiKey;
    }
  }

  if (isRecord(authSource) && typeof authSource.getApiKey === "function") {
    const token = await (
      authSource as {
        getApiKey(providerId: string, options: { includeFallback: boolean }): Promise<unknown>;
      }
    ).getApiKey(PROVIDER_ID, { includeFallback: false });
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
  return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
}

function getAccountIdFromAccessToken(accessToken: string): string | undefined {
  try {
    // Keep this parser aligned with Pi's openai-codex OAuth implementation:
    // the account identity is the exact JWT claim used when credentials are
    // created, not a separately loaded account option.
    const parts = accessToken.split(".");
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(atob(parts[1] ?? "")) as unknown;
    if (!isRecord(payload)) return undefined;
    const auth = payload[JWT_CLAIM_PATH];
    if (!isRecord(auth)) return undefined;
    const accountId = auth.chatgpt_account_id;
    return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
  } catch {
    return undefined;
  }
}

export function getOpenAICodexAccountId(authSource: unknown): string | undefined {
  try {
    return getOAuthAccountId(authSource);
  } catch {
    return undefined;
  }
}

function formatUsagePercent(value?: number): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${Math.round(value)}%`;
}

// Primary/secondary describe positions, not fixed periods. Match each reported
// duration the same way Codex does, allowing small backend rounding differences.
const KNOWN_WINDOW_LABELS: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 5 * 60 * 60, label: "5h" },
  { seconds: 24 * 60 * 60, label: "1d" },
  { seconds: 7 * 24 * 60 * 60, label: "7d" },
  { seconds: 30 * 24 * 60 * 60, label: "30d" },
  { seconds: 365 * 24 * 60 * 60, label: "365d" },
];

function isApproximateWindow(actualSeconds: number, expectedSeconds: number): boolean {
  return Math.abs(actualSeconds - expectedSeconds) <= expectedSeconds * 0.05;
}

function formatUsageWindowLabel(
  window: UsageWindow | undefined,
  configuredLabel: string,
  fallbackLabel: string,
): string {
  if (configuredLabel.toLowerCase() !== "auto") return configuredLabel;
  const windowSeconds = window?.windowSeconds;
  if (windowSeconds !== undefined) {
    const knownWindow = KNOWN_WINDOW_LABELS.find(({ seconds }) =>
      isApproximateWindow(windowSeconds, seconds),
    );
    if (knownWindow) return knownWindow.label;
  }
  return fallbackLabel;
}

export function isOpenAICodexProvider(provider?: string): boolean {
  return provider === PROVIDER_ID;
}

export function isOpenAIProvider(provider?: string): boolean {
  return provider === "openai";
}

export function formatUsageStatus(status?: UsageAvailability): string | undefined {
  if (status === "unsupported") return "usage unsupported";
  if (status === "unavailable") return "usage unavailable";
  return undefined;
}

export function formatUsageSummary(
  snapshot: UsageSnapshot | undefined,
  windows: UsageSummaryWindowsConfig,
): string | undefined {
  if (!snapshot) return undefined;

  const primary = formatUsagePercent(snapshot.primary?.usedPercent);
  const secondary = formatUsagePercent(snapshot.secondary?.usedPercent);
  const parts: string[] = [];

  if (windows.primary.enabled && primary) {
    const label = formatUsageWindowLabel(snapshot.primary, windows.primary.label, "usage");
    parts.push(`${label} ${primary}`);
  }
  if (windows.secondary.enabled && secondary) {
    const label = formatUsageWindowLabel(
      snapshot.secondary,
      windows.secondary.label,
      "secondary usage",
    );
    parts.push(`${label} ${secondary}`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export async function fetchOpenAICodexUsage(
  authSource: unknown,
  options?: { timeoutMs?: number; accountId?: string },
): Promise<UsageSnapshot | undefined> {
  const accessToken = await getAccessToken(authSource);
  if (!accessToken) return undefined;

  // Pi derives the Codex credential's accountId from this access-token claim.
  // Resolve it before constructing the request so a stale account option can
  // never become the header, and reject credentials that cannot be bound to an
  // account at all.
  const tokenAccountId = getAccountIdFromAccessToken(accessToken);
  if (!tokenAccountId) return undefined;

  // A lifecycle caller may provide the account identity observed at the
  // refresh boundary. It is only an expected identity: the token claim remains
  // authoritative, and any mismatch fails closed before fetch is called.
  if (options && "accountId" in options && options.accountId !== tokenAccountId) {
    return undefined;
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };
    headers["ChatGPT-Account-Id"] = tokenAccountId;

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
