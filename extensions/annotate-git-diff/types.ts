export type ReviewScope = "branch" | "commits" | "all";

export type ChangeStatus = "modified" | "added" | "deleted" | "renamed";

export type ReviewFileKind = "text" | "binary" | "image";

export type ReviewCommitKind = "commit" | "working-tree";

export interface ReviewFileComparison {
	status: ChangeStatus;
	oldPath: string | null;
	newPath: string | null;
	displayPath: string;
	hasOriginal: boolean;
	hasModified: boolean;
}

export interface ReviewFile {
	id: string;
	path: string;
	worktreeStatus: ChangeStatus | null;
	hasWorkingTreeFile: boolean;
	/** True when the file is touched by the current branch diff (merge-base/base ref vs HEAD). */
	inGitDiff: boolean;
	/** Diff comparison to render for the file in the current scope.
	 *  - branch scope: merge-base/base ref vs HEAD
	 *  - commits scope: commit vs commit^ (populated when loaded via request-commit) */
	gitDiff: ReviewFileComparison | null;
	kind: ReviewFileKind;
	mimeType: string | null;
}

export interface ReviewCommitInfo {
	sha: string;
	shortSha: string;
	subject: string;
	authorName: string;
	authorDate: string;
	kind: ReviewCommitKind;
}

export interface ReviewFileContents {
	originalContent: string;
	modifiedContent: string;
	kind: ReviewFileKind;
	mimeType: string | null;
	originalExists: boolean;
	modifiedExists: boolean;
	originalPreviewUrl: string | null;
	modifiedPreviewUrl: string | null;
}

export type CommentSide = "original" | "modified" | "file";

export interface DiffReviewComment {
	id: string;
	fileId: string;
	scope: ReviewScope;
	/** Commit SHA when scope === "commits". */
	commitSha?: string | null;
	/** Short commit identifier to render in the prompt (e.g. first 7 chars of SHA). */
	commitShort?: string | null;
	commitKind?: ReviewCommitKind | null;
	side: CommentSide;
	startLine: number | null;
	endLine: number | null;
	body: string;
}

export interface ReviewSubmitPayload {
	type: "submit";
	overallComment: string;
	comments: DiffReviewComment[];
}

export interface ReviewCancelPayload {
	type: "cancel";
}

export interface ReviewRequestFilePayload {
	type: "request-file";
	requestId: string;
	fileId: string;
	scope: ReviewScope;
	commitSha?: string | null;
}

export interface ReviewRequestCommitPayload {
	type: "request-commit";
	requestId: string;
	sha: string;
}

export interface ReviewRequestReviewDataPayload {
	type: "request-review-data";
	requestId: string;
}

export interface ReviewClipboardReadPayload {
	type: "clipboard-read";
	requestId: string;
}

export interface ReviewClipboardWritePayload {
	type: "clipboard-write";
	text: string;
}

export type ReviewWindowMessage =
	| ReviewSubmitPayload
	| ReviewCancelPayload
	| ReviewRequestFilePayload
	| ReviewRequestCommitPayload
	| ReviewRequestReviewDataPayload
	| ReviewClipboardReadPayload
	| ReviewClipboardWritePayload;

export interface ReviewFileDataMessage {
	type: "file-data";
	requestId: string;
	fileId: string;
	scope: ReviewScope;
	commitSha?: string | null;
	originalContent: string;
	modifiedContent: string;
	kind: ReviewFileKind;
	mimeType: string | null;
	originalExists: boolean;
	modifiedExists: boolean;
	originalPreviewUrl: string | null;
	modifiedPreviewUrl: string | null;
}

export interface ReviewFileErrorMessage {
	type: "file-error";
	requestId: string;
	fileId: string;
	scope: ReviewScope;
	commitSha?: string | null;
	message: string;
}

export interface ReviewCommitDataMessage {
	type: "commit-data";
	requestId: string;
	sha: string;
	files: ReviewFile[];
}

export interface ReviewCommitErrorMessage {
	type: "commit-error";
	requestId: string;
	sha: string;
	message: string;
}

export interface ReviewReviewDataMessage {
	type: "review-data";
	requestId: string;
	files: ReviewFile[];
	commits: ReviewCommitInfo[];
	branchBaseRef: string | null;
	branchMergeBaseSha: string | null;
	repositoryHasHead: boolean;
}

export interface ReviewReviewDataErrorMessage {
	type: "review-data-error";
	requestId: string;
	message: string;
}

export interface ReviewClipboardDataMessage {
	type: "clipboard-data";
	requestId: string;
	text: string;
	message?: string;
}

export interface ReviewWorkingTreeChangedMessage {
	type: "working-tree-changed";
	changedAt: number;
}

export type ReviewHostMessage =
	| ReviewFileDataMessage
	| ReviewFileErrorMessage
	| ReviewCommitDataMessage
	| ReviewCommitErrorMessage
	| ReviewReviewDataMessage
	| ReviewReviewDataErrorMessage
	| ReviewClipboardDataMessage
	| ReviewWorkingTreeChangedMessage;

export interface ReviewWindowData {
	repoRoot: string;
	files: ReviewFile[];
	commits: ReviewCommitInfo[];
	branchBaseRef: string | null;
	branchMergeBaseSha: string | null;
	repositoryHasHead: boolean;
}
