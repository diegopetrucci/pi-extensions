export interface LastAssistantMessageLine {
	number: number;
	text: string;
}

export interface LastAssistantMessageSection {
	id: string;
	index: number;
	startLine: number;
	endLine: number;
	preview: string;
	text: string;
}

export interface LastAssistantMessageData {
	text: string;
	lines: LastAssistantMessageLine[];
	sections: LastAssistantMessageSection[];
}

export type LastAssistantMessageLookupResult =
	| { ok: true; data: LastAssistantMessageData }
	| { ok: false; code: "missing" | "incomplete" | "empty"; message: string };

export interface AnnotateLastMessageInlineComment {
	line: number;
	body: string;
}

export interface AnnotateLastMessageSectionComment {
	sectionId: string;
	body: string;
}

export interface AnnotateLastMessageSubmitPayload {
	type: "submit";
	overallComment: string;
	inlineComments: AnnotateLastMessageInlineComment[];
	sectionComments: AnnotateLastMessageSectionComment[];
}

export interface AnnotateLastMessageCancelPayload {
	type: "cancel";
}

export type AnnotateLastMessageWindowMessage = AnnotateLastMessageSubmitPayload | AnnotateLastMessageCancelPayload;
