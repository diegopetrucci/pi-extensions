import type { DiffReviewComment, ReviewFile, ReviewSubmitPayload } from "./types.js";

function formatScopeLabel(comment: DiffReviewComment): string {
	switch (comment.scope) {
		case "branch":
			return "branch diff";
		case "commits":
			return comment.commitKind === "working-tree"
				? "working tree changes"
				: comment.commitShort
					? `commit ${comment.commitShort}`
					: "commit";
		default:
			return "all files";
	}
}

function getCommentFilePath(file: ReviewFile | undefined): string {
	if (file == null) return "(unknown file)";
	return file.gitDiff?.displayPath ?? file.path;
}

function formatLocation(comment: DiffReviewComment, file: ReviewFile | undefined): string {
	const filePath = getCommentFilePath(file);
	const scopePrefix = `[${formatScopeLabel(comment)}] `;

	if (comment.side === "file" || comment.startLine == null) {
		return `${scopePrefix}${filePath}`;
	}

	const range =
		comment.endLine != null && comment.endLine !== comment.startLine
			? `${comment.startLine}-${comment.endLine}`
			: `${comment.startLine}`;

	if (comment.scope === "all") {
		return `${scopePrefix}${filePath}:${range}`;
	}

	const suffix = comment.side === "original" ? " (old)" : " (new)";
	return `${scopePrefix}${filePath}:${range}${suffix}`;
}

export function composeReviewPrompt(files: ReviewFile[], payload: ReviewSubmitPayload): string {
	const fileMap = new Map(files.map((file) => [file.id, file]));
	const lines: string[] = [];

	lines.push("Please address the following feedback");
	lines.push("");

	const overallComment = payload.overallComment.trim();
	if (overallComment.length > 0) {
		lines.push(overallComment);
		lines.push("");
	}

	payload.comments.forEach((comment, index) => {
		const file = fileMap.get(comment.fileId);
		lines.push(`${index + 1}. ${formatLocation(comment, file)}`);
		lines.push(`   ${comment.body.trim()}`);
		lines.push("");
	});

	return lines.join("\n").trim();
}
