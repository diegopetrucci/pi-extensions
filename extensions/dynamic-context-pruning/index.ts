import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function dynamicContextPruningExtension(pi: ExtensionAPI) {
	pi.registerCommand("context-pruning", {
		description: "Dynamic context pruning (placeholder, no pruning logic yet)",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Dynamic context pruning is not implemented yet.", "info");
		},
	});
}
