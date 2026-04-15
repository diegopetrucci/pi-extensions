import { basename } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					const repo = basename(ctx.cwd);
					const branch = footerData.getGitBranch() ?? "";

					const usage = ctx.getContextUsage();
					const context = usage?.percent == null ? "?" : `${usage.percent.toFixed(1)}%`;

					const model = ctx.model?.id ?? "no-model";
					const thinking = pi.getThinkingLevel();
					const modelText = thinking === "off" ? model : `${model} ${thinking}`;

					const branchStyled = theme.fg("dim", branch);
					const repoStyled = theme.fg("dim", repo);
					const contextStyled = theme.fg("dim", context);
					const modelStyled = theme.fg("dim", modelText);

					const renderSplitLine = (left: string, right: string): string => {
						const gap = " ".repeat(Math.max(2, width - visibleWidth(left) - visibleWidth(right)));
						return truncateToWidth(left + gap + right, width);
					};

					const line1Fits = visibleWidth(branchStyled) + visibleWidth(repoStyled) + 2 <= width;
					const line2Fits = visibleWidth(contextStyled) + visibleWidth(modelStyled) + 2 <= width;

					if (line1Fits && line2Fits) {
						return [
							renderSplitLine(branchStyled, repoStyled),
							renderSplitLine(contextStyled, modelStyled),
						];
					}

					return [
						truncateToWidth(branchStyled, width),
						truncateToWidth(repoStyled, width),
						truncateToWidth(contextStyled, width),
						truncateToWidth(modelStyled, width),
					];
				},
			};
		});
	});
}
