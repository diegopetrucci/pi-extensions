import type { AnnotateLastMessageInlineComment, AnnotateLastMessageSectionComment, AnnotateLastMessageSubmitPayload, LastAssistantMessageData, LastAssistantMessageLine, LastAssistantMessageSection } from "./types.js";

const EXCERPT_LIMIT = 120;

function truncateExcerpt(value: string, limit = EXCERPT_LIMIT): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length === 0) return "(blank line)";
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function formatLineLabel(line: number): string {
	return `line ${line}`;
}

function formatLineComment(comment: AnnotateLastMessageInlineComment, line: LastAssistantMessageLine | undefined): string {
	const excerpt = truncateExcerpt(line?.text ?? "");
	return `${formatLineLabel(comment.line)} — “${excerpt}”`;
}

function formatSectionLineRange(section: LastAssistantMessageSection): string {
	return section.startLine === section.endLine
		? `line ${section.startLine}`
		: `lines ${section.startLine}-${section.endLine}`;
}

function formatSectionComment(comment: AnnotateLastMessageSectionComment, section: LastAssistantMessageSection | undefined): string {
	if (section == null) {
		return "Unknown section";
	}
	return `Section ${section.index} (${formatSectionLineRange(section)}) — “${truncateExcerpt(section.preview)}”`;
}

export function hasAnnotateLastMessageFeedback(payload: AnnotateLastMessageSubmitPayload): boolean {
	if (payload.overallComment.trim().length > 0) {
		return true;
	}
	if (payload.inlineComments.some((comment) => comment.body.trim().length > 0)) {
		return true;
	}
	return payload.sectionComments.some((comment) => comment.body.trim().length > 0);
}

export function composeAnnotateLastMessagePrompt(
	message: LastAssistantMessageData,
	payload: AnnotateLastMessageSubmitPayload,
): string {
	const lineMap = new Map(message.lines.map((line) => [line.number, line]));
	const sectionMap = new Map(message.sections.map((section) => [section.id, section]));
	const inlineComments = payload.inlineComments
		.filter((comment) => comment.body.trim().length > 0)
		.sort((left, right) => left.line - right.line);
	const sectionComments = payload.sectionComments
		.filter((comment) => comment.body.trim().length > 0)
		.sort((left, right) => (sectionMap.get(left.sectionId)?.index ?? Number.MAX_SAFE_INTEGER) - (sectionMap.get(right.sectionId)?.index ?? Number.MAX_SAFE_INTEGER));
	const lines: string[] = [];

	lines.push("Please revisit your last assistant message using the annotation feedback below.");
	lines.push("");
	lines.push("Treat this as planning-oriented feedback:");
	lines.push("- update your explanation, plan, or proposed approach in chat;");
	lines.push("- do not assume any code or file changes have already been applied;");
	lines.push("- do not auto-apply anything outside the normal response flow.");
	lines.push("");

	const overallComment = payload.overallComment.trim();
	if (overallComment.length > 0) {
		lines.push("## Overall guidance");
		lines.push(overallComment);
		lines.push("");
	}

	if (sectionComments.length > 0) {
		lines.push("## Section comments");
		sectionComments.forEach((comment, index) => {
			lines.push(`${index + 1}. ${formatSectionComment(comment, sectionMap.get(comment.sectionId))}`);
			lines.push(`   ${comment.body.trim()}`);
			lines.push("");
		});
	}

	if (inlineComments.length > 0) {
		lines.push("## Inline comments");
		inlineComments.forEach((comment, index) => {
			lines.push(`${index + 1}. ${formatLineComment(comment, lineMap.get(comment.line))}`);
			lines.push(`   ${comment.body.trim()}`);
			lines.push("");
		});
	}

	lines.push("Please respond by revising your last message or its plan in chat, incorporating the feedback above.");
	return lines.join("\n").trim();
}
