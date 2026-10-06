import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEPRECATION_NOTICE =
	"openai-fast is deprecated and no longer changes provider requests. Use the unified fast extension (/fast) instead.";

/**
 * Deprecated leftover of the provider-specific Fast stack.
 * The collection loads extensions/fast only. This package keeps the published
 * npm name working and does not read config, register commands, set status,
 * or mutate requests.
 */
export default function openAIFastExtension(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.notify(DEPRECATION_NOTICE, "warning");
	});
}
