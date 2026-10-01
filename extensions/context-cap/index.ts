import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model, Api } from "@earendil-works/pi-ai";

const DEFAULT_MAX_CONTEXT_WINDOW = 200_000;
const DEFAULT_RESERVE_TOKENS = 16_384;
const PROCESS_STATE_KEY = Symbol.for("pi-extensions.context-cap.model-holds.v1");
type AnyModel = Model<Api> | Model<any>;

type ModelWindow = number | undefined;
type HolderToken = object;
type ModelHold = {
	original: number;
	cap: number;
	holders: Set<HolderToken>;
};

type GlobalSymbolTable = typeof globalThis & { [key: symbol]: unknown };

// Pi can load the same extension source once per session. Keep coordination in
// a Symbol.for slot so separately loaded module copies share one WeakMap, while
// the WeakMap itself does not retain model objects after every holder releases.
function getProcessModelHolds(): WeakMap<AnyModel, ModelHold> {
	const globalObject = globalThis as GlobalSymbolTable;
	const existing = globalObject[PROCESS_STATE_KEY];
	if (existing instanceof WeakMap) return existing as WeakMap<AnyModel, ModelHold>;

	const created = new WeakMap<AnyModel, ModelHold>();
	globalObject[PROCESS_STATE_KEY] = created;
	return created;
}

const processModelHolds = getProcessModelHolds();

type CapReason = "virtual" | "unknown" | "reserve" | "modelOverride" | "settingsUnavailable";
type ApplyResult = {
	changed: boolean;
	key: string;
	original?: number;
	effective?: number;
	reserveTokens?: number;
	holders?: number;
	reason?: CapReason;
};
type CapGuard =
	| { allowed: true }
	| { allowed: false; reason: Exclude<CapReason, "virtual" | "unknown">; reserveTokens?: number };

function modelKey(model: AnyModel): string {
	return `${model.provider}/${model.id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownContextWindow(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isVirtualModel(model: AnyModel): boolean {
	return (model as AnyModel & { api?: string }).api === "pi-virtual";
}

function readCapGuard(pi: ExtensionAPI, model: AnyModel): CapGuard {
	const getSettings = (pi as ExtensionAPI & { getSettings?: () => unknown }).getSettings;
	// Pi before getSettings existed has no way to expose the effective
	// compaction settings. Preserve the older-host cap behavior there.
	if (typeof getSettings !== "function") return { allowed: true };

	try {
		const settings = getSettings.call(pi);
		if (!isRecord(settings)) return { allowed: false, reason: "settingsUnavailable" };
		const compactionValue = settings.compaction;
		if (compactionValue === undefined) return { allowed: true };
		if (!isRecord(compactionValue)) return { allowed: false, reason: "settingsUnavailable" };

		const overridesValue = compactionValue.modelOverrides;
		if (overridesValue !== undefined && !isRecord(overridesValue)) {
			return { allowed: false, reason: "settingsUnavailable" };
		}
		if (overridesValue && Object.prototype.hasOwnProperty.call(overridesValue, modelKey(model))) {
			return { allowed: false, reason: "modelOverride" };
		}

		const ordinaryReserve = compactionValue.reserveTokens;
		if (ordinaryReserve !== undefined && !isNonNegativeSafeInteger(ordinaryReserve)) {
			return { allowed: false, reason: "settingsUnavailable" };
		}
		const reserveTokens = ordinaryReserve ?? DEFAULT_RESERVE_TOKENS;
		return reserveTokens >= DEFAULT_MAX_CONTEXT_WINDOW
			? { allowed: false, reason: "reserve", reserveTokens }
			: { allowed: true };
	} catch {
		// A host settings implementation that cannot return a coherent snapshot
		// must not be guessed at: leave the model unmodified and report why.
		return { allowed: false, reason: "settingsUnavailable" };
	}
}

function originalContextWindow(model: AnyModel): ModelWindow {
	const hold = processModelHolds.get(model);
	return hold?.original ?? (isKnownContextWindow(model.contextWindow) ? model.contextWindow : undefined);
}

function releaseContextCap(model: AnyModel | undefined, holderToken: HolderToken, heldModels: Set<AnyModel>): boolean {
	if (!model || !heldModels.delete(model)) return false;

	const hold = processModelHolds.get(model);
	if (!hold) return false;
	hold.holders.delete(holderToken);
	if (hold.holders.size > 0) return false;

	processModelHolds.delete(model);
	// Do not overwrite a value changed by the host or another extension while
	// this holder was active. Equality is the only safe signal available here.
	if (model.contextWindow !== hold.cap) return false;
	model.contextWindow = hold.original;
	return true;
}

function applyContextCap(
	pi: ExtensionAPI,
	model: AnyModel | undefined,
	holderToken: HolderToken,
	heldModels: Set<AnyModel>,
): ApplyResult | undefined {
	if (!model) return undefined;

	const key = modelKey(model);
	if (isVirtualModel(model)) {
		return { changed: false, key, reason: "virtual" };
	}

	const hold = processModelHolds.get(model);
	if (!isKnownContextWindow(model.contextWindow) && !hold) {
		return { changed: false, key, reason: "unknown" };
	}

	const original = hold?.original ?? model.contextWindow;
	if (!isKnownContextWindow(original)) {
		return { changed: false, key, reason: "unknown" };
	}
	const effective = hold?.cap ?? Math.min(original, DEFAULT_MAX_CONTEXT_WINDOW);
	if (!hold && original <= DEFAULT_MAX_CONTEXT_WINDOW) {
		return { changed: false, key, original, effective };
	}

	const guard = readCapGuard(pi, model);
	if (!guard.allowed) {
		if (heldModels.has(model)) releaseContextCap(model, holderToken, heldModels);
		return {
			changed: false,
			key,
			original,
			effective,
			reserveTokens: guard.reserveTokens,
			reason: guard.reason,
			holders: hold?.holders.size,
		};
	}

	const activeHold = hold ?? { original, cap: effective, holders: new Set<HolderToken>() };
	if (!hold) processModelHolds.set(model, activeHold);
	const alreadyHeld = heldModels.has(model);
	if (!alreadyHeld) {
		activeHold.holders.add(holderToken);
		heldModels.add(model);
	}

	// Only the first holder writes the cap. If the host changed a shared model
	// after that, later holders join the reference count without clobbering it.
	const changed = !hold && model.contextWindow !== activeHold.cap;
	if (changed) model.contextWindow = activeHold.cap;

	return {
		changed,
		key,
		original: activeHold.original,
		effective: activeHold.cap,
		holders: activeHold.holders.size,
	};
}

function restoreTouchedModels(holderToken: HolderToken, heldModels: Set<AnyModel>): number {
	let changed = 0;
	for (const model of [...heldModels]) {
		if (releaseContextCap(model, holderToken, heldModels)) changed++;
	}
	return changed;
}

function applyContextCapToSession(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	holderToken: HolderToken,
	heldModels: Set<AnyModel>,
): number {
	return applyContextCap(pi, ctx.model, holderToken, heldModels)?.changed ? 1 : 0;
}

function formatTokens(tokens: number): string {
	return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);
}

function formatWindow(window: ModelWindow): string {
	return isKnownContextWindow(window) ? formatTokens(window) : "unknown";
}

function unavailableReason(result: ApplyResult | undefined): string | undefined {
	if (result?.reason === "virtual") {
		return "virtual selection; routed physical limit is unavailable to this extension";
	}
	if (result?.reason === "unknown") {
		return "physical model has no compatible context-window limit";
	}
	if (result?.reason === "reserve") {
		return `compaction reserveTokens (${formatTokens(result.reserveTokens ?? DEFAULT_MAX_CONTEXT_WINDOW)}) is at least 200k; the auto-compaction threshold would be zero or negative`;
	}
	if (result?.reason === "modelOverride") {
		return `compaction.modelOverrides[\"${result.key}\"] is configured; leaving the model window unchanged`;
	}
	if (result?.reason === "settingsUnavailable") {
		return "compaction settings could not be resolved safely";
	}
	return undefined;
}

function holdStatus(model: AnyModel, heldModels: Set<AnyModel>): string {
	const hold = processModelHolds.get(model);
	if (!hold) return " No process-wide context-cap hold is active.";

	const otherHolders = Math.max(hold.holders.size - (heldModels.has(model) ? 1 : 0), 0);
	const holderWord = otherHolders === 1 ? "holder" : "holders";
	const holderVerb = otherHolders === 1 ? "holds" : "hold";
	return ` Process-wide cap holders: ${hold.holders.size}; ${otherHolders} other ${holderWord} still ${holderVerb} the cap.`;
}

export default function contextCapExtension(pi: ExtensionAPI) {
	let enabled = true;
	const holderToken: HolderToken = {};
	const heldModels = new Set<AnyModel>();

	pi.on("session_start", async (_event, ctx) => {
		// A reload/session replacement can reuse model objects. Release only this
		// extension instance's holds before capturing the new active model.
		restoreTouchedModels(holderToken, heldModels);
		if (enabled) applyContextCapToSession(pi, ctx, holderToken, heldModels);
	});

	pi.on("model_select", async (event, ctx) => {
		// Selection changes are the narrowest reliable boundary available to an
		// extension. Release this instance's previous handle before applying the
		// new physical model, and never infer a virtual route from its metadata.
		releaseContextCap(event.previousModel, holderToken, heldModels);
		if (!enabled) return;

		const result = applyContextCap(pi, event.model, holderToken, heldModels);
		if (!result || !ctx.hasUI) return;

		const unavailable = unavailableReason(result);
		ctx.ui.setStatus(
			"context-cap",
			unavailable
				? "ctx cap unavailable"
				: result.original !== undefined && result.original > DEFAULT_MAX_CONTEXT_WINDOW
					? `ctx cap ${formatTokens(result.effective ?? result.original)}/${formatTokens(result.original)}`
					: undefined,
		);
	});

	pi.on("session_tree", async (_event, ctx) => {
		// Branch changes do not expose a different routed model. Reapply only to
		// the active physical handle after releasing this instance's old hold.
		restoreTouchedModels(holderToken, heldModels);
		if (enabled) applyContextCapToSession(pi, ctx, holderToken, heldModels);
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		restoreTouchedModels(holderToken, heldModels);
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
				const result = applyContextCap(pi, ctx.model, holderToken, heldModels);
				const changed = result?.changed ? 1 : 0;
				const unavailable = unavailableReason(result);
				ctx.ui.setStatus("context-cap", unavailable ? "ctx cap unavailable" : `ctx cap ${formatTokens(DEFAULT_MAX_CONTEXT_WINDOW)}`);
				ctx.ui.notify(
					unavailable
						? `Context cap enabled, but unavailable: ${unavailable}.`
						: `Context cap enabled (${changed} active model window(s) capped/restored).`,
					"info",
				);
				return;
			}

			if (action === "off" || action === "disable") {
				enabled = false;
				const changed = restoreTouchedModels(holderToken, heldModels);
				ctx.ui.setStatus("context-cap", undefined);
				ctx.ui.notify(`Context cap disabled for this extension session (${changed} active model window(s) restored).`, "info");
				return;
			}

			if (action === "toggle") {
				if (enabled) {
					enabled = false;
					const changed = restoreTouchedModels(holderToken, heldModels);
					ctx.ui.setStatus("context-cap", undefined);
					ctx.ui.notify(`Context cap disabled for this extension session (${changed} active model window(s) restored).`, "info");
				} else {
					enabled = true;
					const result = applyContextCap(pi, ctx.model, holderToken, heldModels);
					const changed = result?.changed ? 1 : 0;
					const unavailable = unavailableReason(result);
					ctx.ui.setStatus("context-cap", unavailable ? "ctx cap unavailable" : `ctx cap ${formatTokens(DEFAULT_MAX_CONTEXT_WINDOW)}`);
					ctx.ui.notify(
						unavailable
							? `Context cap enabled, but unavailable: ${unavailable}.`
							: `Context cap enabled (${changed} active model window(s) capped/restored).`,
						"info",
					);
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

				if (isVirtualModel(model)) {
					ctx.ui.notify(
						`Context cap is ${status}. Current model: ${modelKey(model)} is a virtual selection; the routed physical limit is unavailable to this extension.`,
						"info",
					);
					return;
				}

				const hold = processModelHolds.get(model);
				const original = originalContextWindow(model);
				const shouldCheckGuard = enabled && (hold !== undefined || (isKnownContextWindow(model.contextWindow) && model.contextWindow > DEFAULT_MAX_CONTEXT_WINDOW));
				const guard = shouldCheckGuard ? readCapGuard(pi, model) : { allowed: true as const };
				const unavailable = !guard.allowed
					? unavailableReason({
							changed: false,
							key: modelKey(model),
							reason: guard.reason,
							reserveTokens: guard.reserveTokens,
						})
					: undefined;
				const prefix = unavailable
					? `Context cap is ${status}, but unavailable: ${unavailable}.`
					: `Context cap is ${status}.`;
				ctx.ui.notify(
					`${prefix} Current model: ${modelKey(model)} (${formatWindow(model.contextWindow)}/${formatWindow(original)} effective/original).${holdStatus(model, heldModels)}`,
					"info",
				);
				return;
			}

			ctx.ui.notify("Usage: /context-cap on | off | toggle | status", "warning");
		},
	});
}
