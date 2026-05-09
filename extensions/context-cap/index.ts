import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model, Api } from "@earendil-works/pi-ai";

const DEFAULT_MAX_CONTEXT_WINDOW = 200_000;
type AnyModel = Model<Api> | Model<any>;

const originalContextWindows = new WeakMap<AnyModel, number>();
const touchedModels = new Set<AnyModel>();

type ApplyResult = {
	changed: boolean;
	key: string;
	original: number;
	effective: number;
};

function modelKey(model: AnyModel): string {
	return `${model.provider}/${model.id}`;
}

function getOriginalContextWindow(model: AnyModel): number {
	const existing = originalContextWindows.get(model);
	if (typeof existing === "number") return existing;

	originalContextWindows.set(model, model.contextWindow);
	touchedModels.add(model);
	return model.contextWindow;
}

function getEffectiveContextWindow(model: AnyModel): number {
	return Math.min(getOriginalContextWindow(model), DEFAULT_MAX_CONTEXT_WINDOW);
}

function applyContextCap(model: AnyModel | undefined): ApplyResult | undefined {
	if (!model) return undefined;

	const key = modelKey(model);
	const original = getOriginalContextWindow(model);
	const effective = Math.min(original, DEFAULT_MAX_CONTEXT_WINDOW);
	const changed = model.contextWindow !== effective;
	model.contextWindow = effective;

	return { changed, key, original, effective };
}

function restoreContextWindow(model: AnyModel | undefined): boolean {
	if (!model) return false;

	const original = originalContextWindows.get(model);
	if (typeof original !== "number" || model.contextWindow === original) return false;

	model.contextWindow = original;
	return true;
}

function forEachRegistryModel(ctx: ExtensionContext, callback: (model: AnyModel) => void): void {
	try {
		for (const model of ctx.modelRegistry.getAll()) {
			callback(model);
		}
	} catch {
		// Best effort only. The active ctx.model is handled separately by callers.
	}
}

function applyContextCapToSession(ctx: ExtensionContext): number {
	let changed = 0;

	forEachRegistryModel(ctx, (model) => {
		if (applyContextCap(model)?.changed) changed++;
	});

	if (applyContextCap(ctx.model)?.changed) changed++;
	return changed;
}

function restoreContextCapForSession(ctx: ExtensionContext): number {
	let changed = 0;

	forEachRegistryModel(ctx, (model) => {
		if (restoreContextWindow(model)) changed++;
	});

	if (restoreContextWindow(ctx.model)) changed++;
	return changed;
}

function formatTokens(tokens: number): string {
	return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);
}

export default function contextCapExtension(pi: ExtensionAPI) {
	let enabled = true;

	pi.on("session_start", async (_event, ctx) => {
		if (enabled) applyContextCapToSession(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		if (!enabled) return;

		const result = applyContextCap(event.model);
		if (!result || !ctx.hasUI) return;

		ctx.ui.setStatus(
			"context-cap",
			result.original > DEFAULT_MAX_CONTEXT_WINDOW
				? `ctx cap ${formatTokens(result.effective)}/${formatTokens(result.original)}`
				: undefined,
		);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		restoreContextCapForSession(ctx);
		for (const model of touchedModels) restoreContextWindow(model);
	});

	pi.registerCommand("context-cap", {
		description: "Toggle the 200k effective context-window cap for auto-compaction",
		getArgumentCompletions: (prefix) => {
			const commands = ["on", "off", "toggle", "status"];
			const matches = commands.filter((command) => command.startsWith(prefix.trim()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase() || "toggle";

			if (action === "on" || action === "enable") {
				enabled = true;
				const changed = applyContextCapToSession(ctx);
				ctx.ui.setStatus("context-cap", `ctx cap ${formatTokens(DEFAULT_MAX_CONTEXT_WINDOW)}`);
				ctx.ui.notify(`Context cap enabled (${changed} model window(s) capped/restored).`, "info");
				return;
			}

			if (action === "off" || action === "disable") {
				enabled = false;
				const changed = restoreContextCapForSession(ctx);
				ctx.ui.setStatus("context-cap", undefined);
				ctx.ui.notify(`Context cap disabled for this extension session (${changed} model window(s) restored).`, "info");
				return;
			}

			if (action === "toggle") {
				if (enabled) {
					enabled = false;
					const changed = restoreContextCapForSession(ctx);
					ctx.ui.setStatus("context-cap", undefined);
					ctx.ui.notify(`Context cap disabled for this extension session (${changed} model window(s) restored).`, "info");
				} else {
					enabled = true;
					const changed = applyContextCapToSession(ctx);
					ctx.ui.setStatus("context-cap", `ctx cap ${formatTokens(DEFAULT_MAX_CONTEXT_WINDOW)}`);
					ctx.ui.notify(`Context cap enabled (${changed} model window(s) capped/restored).`, "info");
				}
				return;
			}

			if (action === "status") {
				const model = ctx.model;
				const status = enabled ? "enabled" : "disabled";
				if (!model) {
					ctx.ui.notify(`Context cap is ${status}. No model selected.`, "info");
					return;
				}

				const original = getOriginalContextWindow(model);
				const effective = enabled ? getEffectiveContextWindow(model) : model.contextWindow;
				ctx.ui.notify(
					`Context cap is ${status}. Current model: ${modelKey(model)} (${formatTokens(effective)}/${formatTokens(original)} effective/original).`,
					"info",
				);
				return;
			}

			ctx.ui.notify("Usage: /context-cap on | off | toggle | status", "warning");
		},
	});
}
