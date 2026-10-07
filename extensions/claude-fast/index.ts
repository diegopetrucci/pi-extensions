import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXTENSION_ID = "claude-fast";
const FAST_BETA = "fast-mode-2026-02-01";
const DEPRECATION_NOTICE =
  "claude-fast is deprecated and no longer changes provider requests. Use the unified fast extension (/fast) instead.";

/**
 * Deprecated leftover of the provider-specific Fast stack.
 * The collection loads extensions/fast only. This package keeps the published
 * npm name working. It does not read config, register commands, or inject Fast
 * fields. Startup only clears leftover footer status and the Fast beta header,
 * which /reload otherwise keeps from the previous extension runtime.
 */
function stripFastBeta(headers: Record<string, string> | undefined): void {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== "anthropic-beta") continue;
    const next = headers[key]
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && part !== FAST_BETA);
    if (next.length === 0) delete headers[key];
    else headers[key] = next.join(",");
  }
}

export default function claudeFastExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    stripFastBeta(ctx.model?.headers);
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(EXTENSION_ID, undefined);
    ctx.ui.notify(DEPRECATION_NOTICE, "warning");
  });
}
