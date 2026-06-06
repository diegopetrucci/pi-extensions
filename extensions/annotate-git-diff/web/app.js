/* global window, document, alert, requestAnimationFrame, ResizeObserver */

let suppressAutoSubmitOnClose = false;

const reviewData = JSON.parse(document.getElementById("annotate-git-diff-data").textContent || "{}");
const reviewAssetConfig = window.__reviewAssetConfig || {};
if (!Array.isArray(reviewData.files)) reviewData.files = [];
if (!Array.isArray(reviewData.commits)) reviewData.commits = [];

const defaultScope = reviewData.files.some((file) => file.inGitDiff)
	? "branch"
	: reviewData.commits.length > 0
		? "commits"
		: "all";

const state = {
	activeFileId: null,
	currentScope: defaultScope,
	selectedCommitSha: reviewData.commits[0]?.sha ?? null,
	commitFilesBySha: {}, // sha -> ReviewFile[]
	commitRequestIds: {}, // sha -> requestId (in-flight)
	commitErrors: {}, // sha -> error message
	reviewDataRequestId: null,
	reviewDataRequestStartedAt: null,
	comments: [],
	overallComment: "",
	hideUnchanged: true,
	wrapLines: true,
	collapsedDirs: {},
	reviewedFiles: {},
	scrollPositions: {},
	sidebarCollapsed: false,
	fileFilter: "",
	fileContents: {},
	fileErrors: {},
	pendingRequestIds: {},
	lastWorkingTreeLoadAt: null,
	localChangesDetected: false,
	lastLocalChangeDetectedAt: null,
	lastLocalChangeObservedAt: null,
	assetInitFailed: false,
};

const sidebarEl = document.getElementById("sidebar");
const sidebarTitleEl = document.getElementById("sidebar-title");
const sidebarSearchInputEl = document.getElementById("sidebar-search-input");
const toggleSidebarButton = document.getElementById("toggle-sidebar-button");
const scopeBranchButton = document.getElementById("scope-branch-button");
const scopeCommitsButton = document.getElementById("scope-commits-button");
const scopeAllButton = document.getElementById("scope-all-button");
const commitPickerEl = document.getElementById("commit-picker");
const commitListEl = document.getElementById("commit-list");
const windowTitleEl = document.getElementById("window-title");
const repoRootEl = document.getElementById("repo-root");
const fileTreeEl = document.getElementById("file-tree");
const summaryEl = document.getElementById("summary");
const currentFileLabelEl = document.getElementById("current-file-label");
const modeHintEl = document.getElementById("mode-hint");
const fileCommentsContainer = document.getElementById("file-comments-container");
const editorContainerEl = document.getElementById("editor-container");
const diffEditorHostEl = document.getElementById("diff-editor-host");
const singleEditorHostEl = document.getElementById("single-editor-host");
const refreshReviewButton = document.getElementById("refresh-review-button");
const submitButton = document.getElementById("submit-button");
const cancelButton = document.getElementById("cancel-button");
const overallCommentButton = document.getElementById("overall-comment-button");
const fileCommentButton = document.getElementById("file-comment-button");
const toggleReviewedButton = document.getElementById("toggle-reviewed-button");
const toggleUnchangedButton = document.getElementById("toggle-unchanged-button");
const toggleWrapButton = document.getElementById("toggle-wrap-button");
const fileStatusBadgeEl = document.getElementById("file-status-badge");
const fileDiffStatsEl = document.getElementById("file-diff-stats");
const editorCoverEl = document.getElementById("editor-cover");
const binaryPreviewEl = document.getElementById("binary-preview");
const assetFailurePanelEl = document.getElementById("asset-failure-panel");
const assetFailureTitleEl = document.getElementById("asset-failure-title");
const assetFailureMessageEl = document.getElementById("asset-failure-message");
const assetFailureDetailEl = document.getElementById("asset-failure-detail");

// Octicon-style inline SVGs used by the GitHub-style sidebar tree.
const OCTICON_CHEVRON_DOWN =
	'<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 1 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/></svg>';
const OCTICON_CHEVRON_RIGHT =
	'<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>';
const OCTICON_FOLDER =
	'<svg class="gh-dir-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2A1.75 1.75 0 0 0 5 1H1.75Z"/></svg>';
const OCTICON_FILE =
	'<svg class="gh-file-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25V1.75Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5H3.75Zm6.75.5v2.25c0 .138.112.25.25.25h2.25a.25.25 0 0 0 .177-.427L10.927 1.573a.25.25 0 0 0-.427.177Z"/></svg>';

repoRootEl.textContent = reviewData.repoRoot || "";
windowTitleEl.textContent = "Review";

let monacoApi = null;
let diffEditor = null;
let singleEditor = null;
let originalModel = null;
let modifiedModel = null;
let singleModel = null;
let pendingDiffReveal = null; // { dispose: Disposable, timeoutId: number }
let originalDecorations = [];
let modifiedDecorations = [];
let singleDecorations = [];
let activeViewZones = [];
let editorResizeObserver = null;
let requestSequence = 0;

function escapeHtml(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatAssetErrorDetail(error) {
	if (error == null) return "";
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.stack || error.message;
	try {
		return JSON.stringify(error, null, 2);
	} catch {
		return String(error);
	}
}

function showAssetFailure(title, message, detail = "") {
	state.assetInitFailed = true;
	if (editorContainerEl) {
		editorContainerEl.dataset.assetFailure = "true";
	}
	if (assetFailurePanelEl) {
		assetFailurePanelEl.setAttribute("aria-hidden", "false");
	}
	if (assetFailureTitleEl) {
		assetFailureTitleEl.textContent = title;
	}
	if (assetFailureMessageEl) {
		assetFailureMessageEl.textContent = message;
	}
	if (assetFailureDetailEl) {
		const detailText = String(detail || "").trim();
		assetFailureDetailEl.textContent = detailText;
		assetFailureDetailEl.hidden = detailText.length === 0;
	}
	hideBinaryPreview();
	modeHintEl.textContent = message;
	overallCommentButton.disabled = true;
	fileCommentButton.disabled = true;
	toggleReviewedButton.disabled = true;
	toggleWrapButton.disabled = true;
	toggleUnchangedButton.style.display = "none";
	submitButton.disabled = true;
}

function clearAssetFailure() {
	state.assetInitFailed = false;
	if (editorContainerEl) {
		editorContainerEl.dataset.assetFailure = "false";
	}
	if (assetFailurePanelEl) {
		assetFailurePanelEl.setAttribute("aria-hidden", "true");
	}
	if (assetFailureDetailEl) {
		assetFailureDetailEl.textContent = "";
		assetFailureDetailEl.hidden = true;
	}
}

function inferLanguage(path) {
	if (!path) return "plaintext";
	const lower = path.toLowerCase();
	const fileName = lower.split(/[\\/]/).pop() || lower;

	if (fileName === "dockerfile" || fileName === "containerfile") return "dockerfile";

	const extensionLanguagePairs = [
		[[".ts", ".tsx", ".mts", ".cts"], "typescript"],
		[[".js", ".jsx", ".mjs", ".cjs"], "javascript"],
		[[".json", ".jsonc", ".json5"], "json"],
		[[".md"], "markdown"],
		[[".mdx"], "mdx"],
		[[".css"], "css"],
		[[".scss", ".sass"], "scss"],
		[[".less"], "less"],
		[[".html", ".htm", ".vue", ".svelte"], "html"],
		[[".xml", ".xhtml", ".svg"], "xml"],
		[[".sh", ".bash", ".zsh", ".fish", ".env"], "shell"],
		[[".ps1", ".psm1", ".psd1"], "powershell"],
		[[".bat", ".cmd"], "bat"],
		[[".yml", ".yaml"], "yaml"],
		[[".rs"], "rust"],
		[[".java"], "java"],
		[[".kt", ".kts"], "kotlin"],
		[[".swift"], "swift"],
		[[".m", ".mm"], "objective-c"],
		[[".py", ".pyw"], "python"],
		[[".go"], "go"],
		[[".c"], "c"],
		[[".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx"], "cpp"],
		[[".cs"], "csharp"],
		[[".php"], "php"],
		[[".rb"], "ruby"],
		[[".sql"], "sql"],
		[[".mysql"], "mysql"],
		[[".pgsql"], "pgsql"],
		[[".graphql", ".gql"], "graphql"],
		[[".dart"], "dart"],
		[[".lua"], "lua"],
		[[".r"], "r"],
		[[".pl", ".pm"], "perl"],
		[[".scala", ".sc"], "scala"],
		[[".clj", ".cljs", ".cljc"], "clojure"],
		[[".ex", ".exs"], "elixir"],
		[[".fs", ".fsx", ".fsi"], "fsharp"],
		[[".vb"], "vb"],
		[[".tf", ".tfvars", ".hcl"], "hcl"],
		[[".proto"], "protobuf"],
		[[".sol"], "solidity"],
		[[".wgsl"], "wgsl"],
	];

	for (const [extensions, language] of extensionLanguagePairs) {
		if (extensions.some((extension) => lower.endsWith(extension))) return language;
	}
	return "plaintext";
}

function scopeLabel(scope) {
	switch (scope) {
		case "branch":
			return "Branch";
		case "commits":
			return "Commits";
		default:
			return "All files";
	}
}

function commitInfoBySha(sha) {
	if (!sha) return null;
	return reviewData.commits.find((c) => c.sha === sha) ?? null;
}

function selectedCommitInfo() {
	return commitInfoBySha(state.selectedCommitSha);
}

function selectedCommitKind() {
	return selectedCommitInfo()?.kind ?? "commit";
}

function hasRepositoryHead() {
	return reviewData.repositoryHasHead === true;
}

function workingTreeOriginalLabel() {
	return hasRepositoryHead() ? "HEAD" : "Empty tree";
}

function workingTreeRangeLabel() {
	return hasRepositoryHead() ? "HEAD → working tree" : "Empty tree → working tree";
}

function isWorkingTreeCommit(sha) {
	return commitInfoBySha(sha)?.kind === "working-tree";
}

function isSelectedWorkingTreeCommit() {
	return state.currentScope === "commits" && isWorkingTreeCommit(state.selectedCommitSha);
}

function scopeHint(scope) {
	if (state.localChangesDetected) {
		return "Local file changes detected. Click Refresh changes to reload the diff when you are ready.";
	}
	const baseRefLabel = reviewData.branchBaseRef || "the selected base";
	switch (scope) {
		case "branch":
			return `Review current branch changes against ${baseRefLabel}. This view can include uncommitted working tree edits. Hover or click line numbers in the gutter to add an inline comment.`;
		case "commits": {
			const info = selectedCommitInfo();
			if (!info) return "Pick a branch commit from the list to review its diff.";
			if (info.kind === "working-tree") {
				return hasRepositoryHead()
					? "Review uncommitted working tree changes against HEAD. Use Refresh changes when local edits are detected."
					: "Review uncommitted working tree changes against the empty tree in this new repository. Use Refresh changes when local edits are detected.";
			}
			return `Review commit ${info.shortSha} — ${info.subject}`;
		}
		default:
			return "Review repository file snapshots across tracked and untracked files. Unchanged files open as single-file snapshots; changed files remain available in the Branch and Commits scopes for diff-based comments.";
	}
}

function currentModeHint() {
	const file = activeFile();
	if (!file) return scopeHint(state.currentScope);
	if (file.kind === "image") {
		return state.currentScope === "all"
			? "Review the current image snapshot. File-level comments are supported; inline line comments are unavailable for image previews."
			: "Review image changes side by side. File-level comments are supported; inline line comments are unavailable for image previews.";
	}
	if (file.kind === "binary") {
		return "Binary files show side existence instead of a text diff. File-level comments are supported; inline line comments are unavailable.";
	}
	return scopeHint(state.currentScope);
}

function statusLabel(status) {
	if (!status) return "";
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusBadgeClass(status) {
	switch (status) {
		case "added":
			return "gh-status gh-status-added";
		case "deleted":
			return "gh-status gh-status-deleted";
		case "renamed":
			return "gh-status gh-status-renamed";
		case "modified":
			return "gh-status gh-status-modified";
		default:
			return "gh-status gh-status-modified";
	}
}

function statusCode(status) {
	if (!status) return "";
	if (status === "renamed") return "R";
	return status.charAt(0).toUpperCase();
}

function isFileReviewed(fileId) {
	return state.reviewedFiles[fileId] === true;
}

function annotateCommentWithCommit(comment) {
	if (comment.scope !== "commits") return comment;
	const info = selectedCommitInfo();
	if (!info) return comment;
	return { ...comment, commitSha: info.sha, commitShort: info.shortSha, commitKind: info.kind };
}

function activeFileList() {
	if (state.currentScope === "commits") {
		const sha = state.selectedCommitSha;
		if (!sha) return [];
		return state.commitFilesBySha[sha] ?? [];
	}
	return reviewData.files;
}

function getScopedFiles() {
	switch (state.currentScope) {
		case "branch":
			return reviewData.files.filter((file) => file.inGitDiff);
		case "commits":
			return activeFileList();
		default:
			return reviewData.files;
	}
}

function ensureActiveFileForScope() {
	const scopedFiles = getScopedFiles();
	if (scopedFiles.length === 0) {
		state.activeFileId = null;
		return;
	}
	if (scopedFiles.some((file) => file.id === state.activeFileId)) {
		return;
	}
	state.activeFileId = scopedFiles[0].id;
}

function activeFile() {
	const list = activeFileList();
	return list.find((file) => file.id === state.activeFileId) ?? null;
}

function getScopeComparison(file, scope = state.currentScope) {
	if (!file) return null;
	if (scope === "branch" || scope === "commits") return file.gitDiff;
	return null;
}

function activeComparison() {
	return getScopeComparison(activeFile(), state.currentScope);
}

function isAddedOnlyComparison(comparison) {
	return comparison != null && comparison.status === "added";
}

function activeFileIsAddedOnly() {
	return isAddedOnlyComparison(activeComparison());
}

function activeFileShowsDiff() {
	const file = activeFile();
	if (file == null || file.kind !== "text") return false;
	const comparison = activeComparison();
	if (comparison == null) return false;
	if (isAddedOnlyComparison(comparison)) return false;
	return true;
}

function activeFileUsesSingleEditor() {
	const file = activeFile();
	return file != null && file.kind === "text" && activeFileIsAddedOnly();
}

function setTextEditorMode(mode) {
	if (!editorContainerEl) return;
	editorContainerEl.dataset.textEditorMode = mode;
}

function activeFileUsesBinaryPreview() {
	const file = activeFile();
	return file != null && file.kind !== "text";
}

function fileKindBadgeMarkup(file) {
	if (!file || file.kind === "text") return "";
	const label = file.kind === "image" ? "IMG" : "BIN";
	return `<span class="gh-kind-badge">${label}</span>`;
}

function hideBinaryPreview() {
	if (!editorContainerEl || !binaryPreviewEl) return;
	editorContainerEl.dataset.previewActive = "false";
	binaryPreviewEl.dataset.active = "false";
	binaryPreviewEl.innerHTML = "";
}

function previewSideLabel(file, side) {
	if (state.currentScope === "commits") {
		return selectedCommitKind() === "working-tree"
			? side === "original"
				? workingTreeOriginalLabel()
				: "Working tree"
			: side === "original"
				? "Parent"
				: "Commit";
	}
	if (state.currentScope === "branch") {
		if (side === "original") return reviewData.branchBaseRef ? `Base (${reviewData.branchBaseRef})` : "Base";
		return file.hasWorkingTreeFile ? "Working tree" : "HEAD";
	}
	return "Snapshot";
}

function renderBinaryPreview(file, contents) {
	if (!editorContainerEl || !binaryPreviewEl) return;
	editorContainerEl.dataset.previewActive = "true";
	binaryPreviewEl.dataset.active = "true";
	const requestState = getRequestState(file.id, state.currentScope);
	if (requestState.error) {
		binaryPreviewEl.innerHTML = `<div class="binary-preview-note">Failed to load ${escapeHtml(getScopeDisplayPath(file, state.currentScope))}<br><br>${escapeHtml(requestState.error)}</div>`;
		return;
	}
	if (requestState.requestId != null && requestState.contents == null) {
		binaryPreviewEl.innerHTML = `<div class="binary-preview-note">Loading preview for ${escapeHtml(getScopeDisplayPath(file, state.currentScope))}...</div>`;
		return;
	}

	const showComparison = state.currentScope !== "all";
	const cards = [];
	const pushCard = (label, exists, previewUrl) => {
		const body = exists
			? file.kind === "image" && previewUrl
				? `<img class="binary-preview-image" src="${previewUrl}" alt="${escapeHtml(label)} preview">`
				: `<div class="binary-preview-empty">Binary file present</div>`
			: `<div class="binary-preview-empty">Not present in this side</div>`;
		cards.push(`
			<div class="binary-preview-card">
				<div class="binary-preview-card-header">
					<span>${escapeHtml(label)}</span>
					<span>${exists ? "present" : "absent"}</span>
				</div>
				<div class="binary-preview-card-body">${body}</div>
			</div>
		`);
	};

	if (showComparison) {
		pushCard(previewSideLabel(file, "original"), contents.originalExists, contents.originalPreviewUrl);
		pushCard(previewSideLabel(file, "modified"), contents.modifiedExists, contents.modifiedPreviewUrl);
	} else {
		pushCard(previewSideLabel(file, "modified"), contents.modifiedExists, contents.modifiedPreviewUrl);
	}

	const note =
		file.kind === "image"
			? "Image files are rendered directly in the review pane."
			: "Binary files do not have a text diff here. The review pane shows whether each side exists.";
	binaryPreviewEl.innerHTML = `<div class="binary-preview-grid">${cards.join("")}</div><div class="binary-preview-note">${escapeHtml(note)}</div>`;
}

function getScopeFilePath(file) {
	const comparison = getScopeComparison(file, state.currentScope);
	return comparison?.newPath || comparison?.oldPath || file?.path || "";
}

function getScopeDisplayPath(file, scope = state.currentScope) {
	const comparison = getScopeComparison(file, scope);
	return comparison?.displayPath || file?.path || "";
}

function getFileSearchPath(file) {
	return file?.path || "";
}

function getBaseName(path) {
	const parts = path.split("/");
	return parts[parts.length - 1] || path;
}

function getActiveStatus(file) {
	const comparison = getScopeComparison(file, state.currentScope);
	return comparison?.status ?? file?.worktreeStatus ?? null;
}

function normalizeQuery(query) {
	return String(query || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "");
}

function scoreSubsequence(query, candidate) {
	if (!query) return 0;
	let queryIndex = 0;
	let score = 0;
	let firstMatchIndex = -1;
	let previousMatchIndex = -2;

	for (let i = 0; i < candidate.length && queryIndex < query.length; i += 1) {
		if (candidate[i] !== query[queryIndex]) continue;

		if (firstMatchIndex === -1) firstMatchIndex = i;
		score += 10;

		if (i === previousMatchIndex + 1) {
			score += 8;
		}

		const previousChar = i > 0 ? candidate[i - 1] : "";
		if (i === 0 || previousChar === "/" || previousChar === "_" || previousChar === "-" || previousChar === ".") {
			score += 12;
		}

		previousMatchIndex = i;
		queryIndex += 1;
	}

	if (queryIndex !== query.length) return -1;
	if (firstMatchIndex >= 0) score += Math.max(0, 20 - firstMatchIndex);
	return score;
}

function getFileSearchScore(query, file) {
	const normalizedQuery = normalizeQuery(query);
	if (!normalizedQuery) return 0;

	const path = getFileSearchPath(file).toLowerCase();
	const baseName = getBaseName(path);
	const pathScore = scoreSubsequence(normalizedQuery, path);
	const baseScore = scoreSubsequence(normalizedQuery, baseName);
	let score = Math.max(pathScore, baseScore >= 0 ? baseScore + 40 : -1);

	if (score < 0) return -1;
	if (baseName === normalizedQuery) score += 200;
	else if (baseName.startsWith(normalizedQuery)) score += 120;
	else if (path.includes(normalizedQuery)) score += 35;

	return score;
}

function getFilteredFiles() {
	const scopedFiles = getScopedFiles();
	const query = state.fileFilter.trim();
	if (!query) return [...scopedFiles];

	return scopedFiles
		.map((file) => ({ file, score: getFileSearchScore(query, file) }))
		.filter((entry) => entry.score >= 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return getFileSearchPath(a.file).localeCompare(getFileSearchPath(b.file));
		})
		.map((entry) => entry.file);
}

function collapseTreeNode(node, isRoot = false) {
	if (node.kind === "file") return node;

	const collapsedChildren = [...node.children.values()].map((child) => collapseTreeNode(child));
	let collapsed = {
		...node,
		children: new Map(collapsedChildren.map((child) => [child.name, child])),
	};

	if (isRoot) return collapsed;

	while (collapsed.children.size === 1) {
		const [onlyChild] = collapsed.children.values();
		if (!onlyChild || onlyChild.kind !== "dir") break;
		collapsed = {
			name: `${collapsed.name}/${onlyChild.name}`,
			path: onlyChild.path,
			kind: "dir",
			children: onlyChild.children,
			file: null,
		};
	}

	return collapsed;
}

function buildTree(files) {
	const root = { name: "", path: "", kind: "dir", children: new Map(), file: null };
	for (const file of files) {
		const path = getFileSearchPath(file);
		const parts = path.split("/");
		let node = root;
		let currentPath = "";
		for (let i = 0; i < parts.length; i += 1) {
			const part = parts[i];
			const isLeaf = i === parts.length - 1;
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			if (!node.children.has(part)) {
				node.children.set(part, {
					name: part,
					path: currentPath,
					kind: isLeaf ? "file" : "dir",
					children: new Map(),
					file: isLeaf ? file : null,
				});
			}
			node = node.children.get(part);
			if (isLeaf) node.file = file;
		}
	}
	return collapseTreeNode(root, true);
}

function cacheKey(scope, fileId, commitSha = null) {
	if (scope === "commits") {
		return `commits:${commitSha ?? state.selectedCommitSha ?? ""}:${fileId}`;
	}
	return `${scope}:${fileId}`;
}

function scrollKey(scope, fileId, commitSha = null) {
	if (scope === "commits") {
		return `commits:${commitSha ?? state.selectedCommitSha ?? ""}:${fileId}`;
	}
	return `${scope}:${fileId}`;
}

function saveCurrentScrollPosition() {
	if (!diffEditor || !state.activeFileId) return;
	const originalEditor = diffEditor.getOriginalEditor();
	const modifiedEditor = diffEditor.getModifiedEditor();
	state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)] = {
		originalTop: originalEditor.getScrollTop(),
		originalLeft: originalEditor.getScrollLeft(),
		modifiedTop: modifiedEditor.getScrollTop(),
		modifiedLeft: modifiedEditor.getScrollLeft(),
	};
}

function restoreFileScrollPosition() {
	if (!diffEditor || !state.activeFileId) return;
	const scrollState = state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)];
	if (!scrollState) return;
	const originalEditor = diffEditor.getOriginalEditor();
	const modifiedEditor = diffEditor.getModifiedEditor();
	originalEditor.setScrollTop(scrollState.originalTop);
	originalEditor.setScrollLeft(scrollState.originalLeft);
	modifiedEditor.setScrollTop(scrollState.modifiedTop);
	modifiedEditor.setScrollLeft(scrollState.modifiedLeft);
}

function captureScrollState() {
	if (!diffEditor) return null;
	const originalEditor = diffEditor.getOriginalEditor();
	const modifiedEditor = diffEditor.getModifiedEditor();
	return {
		originalTop: originalEditor.getScrollTop(),
		originalLeft: originalEditor.getScrollLeft(),
		modifiedTop: modifiedEditor.getScrollTop(),
		modifiedLeft: modifiedEditor.getScrollLeft(),
	};
}

function restoreScrollState(scrollState) {
	if (!diffEditor || !scrollState) return;
	const originalEditor = diffEditor.getOriginalEditor();
	const modifiedEditor = diffEditor.getModifiedEditor();
	originalEditor.setScrollTop(scrollState.originalTop);
	originalEditor.setScrollLeft(scrollState.originalLeft);
	modifiedEditor.setScrollTop(scrollState.modifiedTop);
	modifiedEditor.setScrollLeft(scrollState.modifiedLeft);
}

function getRequestState(fileId, scope = state.currentScope, commitSha = null) {
	const key = cacheKey(scope, fileId, commitSha);
	return {
		contents: state.fileContents[key],
		error: state.fileErrors[key],
		requestId: state.pendingRequestIds[key],
	};
}

function ensureFileLoaded(fileId, scope = state.currentScope, commitSha = null, options = {}) {
	if (!fileId) return;
	const forceRefresh = options.forceRefresh === true;
	const resolvedCommitSha = scope === "commits" ? (commitSha ?? state.selectedCommitSha ?? null) : null;
	const key = cacheKey(scope, fileId, resolvedCommitSha);
	if (!forceRefresh) {
		if (state.fileContents[key] != null) return;
		if (state.fileErrors[key] != null) return;
		if (state.pendingRequestIds[key] != null) return;
	}

	const requestId = `request:${Date.now()}:${++requestSequence}`;
	state.pendingRequestIds[key] = requestId;
	renderTree();
	if (window.glimpse?.send) {
		const payload = { type: "request-file", requestId, fileId, scope };
		if (scope === "commits" && resolvedCommitSha) {
			payload.commitSha = resolvedCommitSha;
		}
		window.glimpse.send(payload);
	}
}

function ensureCommitFilesLoaded(sha, options = {}) {
	if (!sha) return;
	const forceRefresh = options.forceRefresh === true;
	if (!forceRefresh) {
		if (state.commitFilesBySha[sha] != null) return;
		if (state.commitErrors[sha] != null) return;
	}
	if (state.commitRequestIds[sha] != null) return;

	if (forceRefresh) {
		delete state.commitErrors[sha];
	}
	const requestId = `commit-request:${Date.now()}:${++requestSequence}`;
	state.commitRequestIds[sha] = requestId;
	if (window.glimpse?.send) {
		window.glimpse.send({ type: "request-commit", requestId, sha });
	}
	renderCommitList();
}

function formatWorkingTreeLoadLabel(timestamp) {
	if (!timestamp) return "Not loaded yet";
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "Not loaded yet";
	return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatLocalChangeLabel(timestamp) {
	if (!timestamp) return "just now";
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "just now";
	return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function updateReviewRefreshButton() {
	if (!refreshReviewButton) return;
	const shouldShow = state.localChangesDetected || state.currentScope === "commits";
	if (!shouldShow) {
		refreshReviewButton.style.display = "none";
		refreshReviewButton.disabled = true;
		return;
	}
	const sha = state.currentScope === "commits" ? state.selectedCommitSha : null;
	const commitLoading = sha ? state.commitRequestIds[sha] != null : false;
	const reviewDataLoading = state.reviewDataRequestId != null;
	const loading = commitLoading || reviewDataLoading;
	refreshReviewButton.style.display = "inline-flex";
	refreshReviewButton.disabled = loading;
	refreshReviewButton.style.borderColor = state.localChangesDetected && !loading ? "rgba(210,153,34,0.65)" : "";
	refreshReviewButton.style.color = state.localChangesDetected && !loading ? "#d29922" : "";
	refreshReviewButton.textContent = loading
		? "Refreshing…"
		: state.localChangesDetected
			? "Changes detected · Refresh"
			: isSelectedWorkingTreeCommit()
				? "Refresh live diff"
				: "Refresh review";
	refreshReviewButton.title = state.localChangesDetected
		? `Local file changes detected at ${formatLocalChangeLabel(state.lastLocalChangeDetectedAt)}. Click to reload review data.`
		: isSelectedWorkingTreeCommit()
			? `Working tree diff. Last loaded ${formatWorkingTreeLoadLabel(state.lastWorkingTreeLoadAt)}.`
			: "Refresh review data for all scopes.";
}

function clearFileRequestStateByPrefixes(prefixes) {
	const matchesPrefix = (key) => prefixes.some((prefix) => key.startsWith(prefix));
	for (const key of Object.keys(state.fileContents)) {
		if (matchesPrefix(key)) delete state.fileContents[key];
	}
	for (const key of Object.keys(state.fileErrors)) {
		if (matchesPrefix(key)) delete state.fileErrors[key];
	}
	for (const key of Object.keys(state.pendingRequestIds)) {
		if (matchesPrefix(key)) delete state.pendingRequestIds[key];
	}
}

function clearCommitScopedState(sha) {
	clearFileRequestStateByPrefixes([`commits:${sha}:`]);
}

function clearRefreshableFileState() {
	const prefixes = ["branch:", "all:"];
	for (const commit of reviewData.commits) {
		if (commit.kind === "working-tree") {
			prefixes.push(`commits:${commit.sha}:`);
		}
	}
	clearFileRequestStateByPrefixes(prefixes);
}

function clearWorkingTreeReviewArtifacts(sha) {
	state.comments = state.comments.filter((comment) => !(comment.scope === "commits" && comment.commitSha === sha));
	const previousFiles = state.commitFilesBySha[sha] ?? [];
	for (const file of previousFiles) {
		delete state.reviewedFiles[file.id];
		delete state.scrollPositions[scrollKey("commits", file.id, sha)];
	}
}

function clearWorkingTreeCommitState() {
	for (const commit of reviewData.commits) {
		if (commit.kind !== "working-tree") continue;
		clearWorkingTreeReviewArtifacts(commit.sha);
		clearCommitScopedState(commit.sha);
		delete state.commitFilesBySha[commit.sha];
		delete state.commitErrors[commit.sha];
		delete state.commitRequestIds[commit.sha];
	}
}

function requestLatestReviewData() {
	if (!window.glimpse?.send) return;
	if (state.reviewDataRequestId != null) return;
	const requestStartedAt = Date.now();
	const requestId = `review-data-request:${requestStartedAt}:${++requestSequence}`;
	state.reviewDataRequestId = requestId;
	state.reviewDataRequestStartedAt = requestStartedAt;
	updateReviewRefreshButton();
	window.glimpse.send({ type: "request-review-data", requestId });
}

function refreshReviewData() {
	requestLatestReviewData();
}

function openFile(fileId) {
	if (state.activeFileId === fileId) {
		ensureFileLoaded(fileId, state.currentScope);
		return;
	}
	saveCurrentScrollPosition();
	state.activeFileId = fileId;
	renderAll({ restoreFileScroll: true });
	ensureFileLoaded(fileId, state.currentScope);
}

function renderTreeNode(node, depth) {
	const children = [...node.children.values()].sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	const indentPx = 12;

	for (const child of children) {
		if (child.kind === "dir") {
			const collapsed = state.collapsedDirs[child.path] === true;
			const row = document.createElement("button");
			row.type = "button";
			row.className = "gh-tree-row";
			row.style.paddingLeft = `${depth * indentPx + 8}px`;
			row.innerHTML = `
        <span class="flex h-3 w-3 items-center justify-center text-review-muted">${collapsed ? OCTICON_CHEVRON_RIGHT : OCTICON_CHEVRON_DOWN}</span>
        ${OCTICON_FOLDER}
        <span class="gh-row-name">${escapeHtml(child.name)}</span>
      `;
			row.addEventListener("click", () => {
				state.collapsedDirs[child.path] = !collapsed;
				renderTree();
			});
			fileTreeEl.appendChild(row);
			if (!collapsed) renderTreeNode(child, depth + 1);
			continue;
		}

		const file = child.file;
		const count = state.comments.filter(
			(comment) => comment.fileId === file.id && comment.scope === state.currentScope,
		).length;
		const reviewed = isFileReviewed(file.id);
		const requestState = getRequestState(file.id, state.currentScope);
		const loading = requestState.requestId != null && requestState.contents == null;
		const errored = requestState.error != null;
		const status = getActiveStatus(file);
		const button = document.createElement("button");
		button.type = "button";
		button.className = "gh-tree-row";
		button.dataset.selected = file.id === state.activeFileId ? "true" : "false";
		if (reviewed) button.style.opacity = "0.6";
		button.style.paddingLeft = `${depth * indentPx + 26}px`;
		const loadingBadge = loading
			? '<span class="text-[10px] text-review-accent">…</span>'
			: errored
				? '<span class="text-[10px] text-review-danger">!</span>'
				: "";
		button.innerHTML = `
			${OCTICON_FILE}
			<span class="gh-row-name">${escapeHtml(child.name)}</span>
			<span class="gh-row-trail">
				${fileKindBadgeMarkup(file)}
				${loadingBadge}
				${count > 0 ? `<span class="gh-comment-count">${count}</span>` : ""}
				${status ? `<span class="${statusBadgeClass(status)}">${escapeHtml(statusCode(status))}</span>` : ""}
			</span>
		`;
		button.addEventListener("click", () => openFile(file.id));
		fileTreeEl.appendChild(button);
	}
}

function renderSearchResults(files) {
	files.forEach((file) => {
		const path = getFileSearchPath(file);
		const baseName = getBaseName(path);
		const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		const count = state.comments.filter(
			(comment) => comment.fileId === file.id && comment.scope === state.currentScope,
		).length;
		const reviewed = isFileReviewed(file.id);
		const requestState = getRequestState(file.id, state.currentScope);
		const loading = requestState.requestId != null && requestState.contents == null;
		const errored = requestState.error != null;
		const status = getActiveStatus(file);
		const button = document.createElement("button");
		button.type = "button";
		button.className = "gh-tree-row";
		button.dataset.selected = file.id === state.activeFileId ? "true" : "false";
		if (reviewed) button.style.opacity = "0.6";
		button.style.alignItems = "flex-start";
		button.style.padding = "6px 8px";
		const loadingBadge = loading
			? '<span class="text-[10px] text-review-accent">…</span>'
			: errored
				? '<span class="text-[10px] text-review-danger">!</span>'
				: "";
		button.innerHTML = `
			${OCTICON_FILE}
			<span class="min-w-0 flex-1">
				<span class="block truncate text-[13px]">${escapeHtml(baseName)}</span>
				<span class="block truncate text-[11px] text-review-muted">${escapeHtml(parentPath || path)}</span>
			</span>
			<span class="gh-row-trail">
				${fileKindBadgeMarkup(file)}
				${loadingBadge}
				${count > 0 ? `<span class="gh-comment-count">${count}</span>` : ""}
				${status ? `<span class="${statusBadgeClass(status)}">${escapeHtml(statusCode(status))}</span>` : ""}
			</span>
		`;
		button.addEventListener("click", () => openFile(file.id));
		fileTreeEl.appendChild(button);
	});
}

function updateSidebarLayout() {
	const collapsed = state.sidebarCollapsed;
	sidebarEl.style.width = collapsed ? "0px" : "280px";
	sidebarEl.style.minWidth = collapsed ? "0px" : "280px";
	sidebarEl.style.flexBasis = collapsed ? "0px" : "280px";
	sidebarEl.style.borderRightWidth = collapsed ? "0px" : "1px";
	sidebarEl.style.pointerEvents = collapsed ? "none" : "auto";
	toggleSidebarButton.dataset.active = collapsed ? "false" : "true";
	toggleSidebarButton.title = collapsed ? "Show sidebar" : "Hide sidebar";
}

function updateScopeButtons() {
	const counts = {
		branch: reviewData.files.filter((file) => file.inGitDiff).length,
		commits: reviewData.commits.length,
		all: reviewData.files.length,
	};

	const applyButtonClasses = (button, active, disabled) => {
		button.disabled = disabled;
		button.className = disabled
			? "cursor-default rounded-md border border-review-border bg-review-bg px-2.5 py-1 text-[11px] font-medium text-review-muted opacity-60"
			: active
				? "cursor-pointer rounded-md border border-review-success-emphasis/40 bg-review-success-emphasis/15 px-2.5 py-1 text-[11px] font-medium text-review-success hover:bg-review-success-emphasis/25"
				: "cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#1f242c]";
	};

	scopeBranchButton.textContent = `Branch${counts.branch > 0 ? ` (${counts.branch})` : ""}`;
	scopeCommitsButton.textContent = `Commits${counts.commits > 0 ? ` (${counts.commits})` : ""}`;
	scopeAllButton.textContent = `All${counts.all > 0 ? ` (${counts.all})` : ""}`;

	applyButtonClasses(scopeBranchButton, state.currentScope === "branch", counts.branch === 0);
	applyButtonClasses(scopeCommitsButton, state.currentScope === "commits", counts.commits === 0);
	applyButtonClasses(scopeAllButton, state.currentScope === "all", counts.all === 0);

	if (commitPickerEl) {
		commitPickerEl.style.display = state.currentScope === "commits" ? "" : "none";
	}
}

function renderCommitList() {
	if (!commitListEl) return;
	commitListEl.innerHTML = "";
	if (reviewData.commits.length === 0) {
		commitListEl.innerHTML = '<div class="px-3 py-2 text-[11px] text-review-muted">No commits to review.</div>';
		updateReviewRefreshButton();
		return;
	}
	for (const commit of reviewData.commits) {
		const row = document.createElement("button");
		row.type = "button";
		row.className = "commit-row";
		row.dataset.selected = commit.sha === state.selectedCommitSha ? "true" : "false";
		const loading = state.commitRequestIds[commit.sha] != null && state.commitFilesBySha[commit.sha] == null;
		const errored = state.commitErrors[commit.sha] != null;
		const isWorkingTreeCommit = commit.kind === "working-tree";
		const date = !isWorkingTreeCommit && commit.authorDate ? new Date(commit.authorDate) : null;
		const dateLabel =
			date && !Number.isNaN(date.getTime())
				? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
				: "";
		const metaLabel = isWorkingTreeCommit
			? `Live · ${workingTreeRangeLabel()}`
			: `${commit.authorName || ""}${dateLabel ? ` · ${dateLabel}` : ""}`;
		row.innerHTML = `
      <span class="commit-row-sha">${escapeHtml(commit.shortSha)}</span>
      <span class="commit-row-body">
        <span class="commit-row-subject">${escapeHtml(commit.subject)}</span>
        <span class="commit-row-meta">${escapeHtml(metaLabel)}</span>
      </span>
      <span class="commit-row-status">${loading ? "…" : errored ? "!" : ""}</span>
    `;
		row.addEventListener("click", () => selectCommit(commit.sha));
		commitListEl.appendChild(row);
	}
	updateReviewRefreshButton();
}

function selectCommit(sha) {
	if (!sha) return;
	if (state.selectedCommitSha === sha && state.commitFilesBySha[sha] != null) return;
	saveCurrentScrollPosition();
	state.selectedCommitSha = sha;
	state.activeFileId = null;
	ensureCommitFilesLoaded(sha);
	renderAll({ restoreFileScroll: false });
	const file = activeFile();
	if (file) ensureFileLoaded(file.id, state.currentScope);
}

function updateToggleButtons() {
	const file = activeFile();
	const reviewed = file ? isFileReviewed(file.id) : false;
	const usesBinaryPreview = activeFileUsesBinaryPreview();
	toggleReviewedButton.dataset.active = reviewed ? "true" : "false";
	toggleReviewedButton.title = reviewed ? "Viewed (click to unmark)" : "Mark this file as viewed";
	if (state.assetInitFailed) {
		overallCommentButton.disabled = true;
		toggleReviewedButton.disabled = true;
		fileCommentButton.disabled = true;
		toggleWrapButton.disabled = true;
		toggleUnchangedButton.style.display = "none";
		updateScopeButtons();
		updateReviewRefreshButton();
		submitButton.disabled = true;
		updateFileHeaderMeta(file);
		return;
	}
	overallCommentButton.disabled = false;
	toggleReviewedButton.disabled = !file;
	fileCommentButton.disabled = !file;
	toggleWrapButton.dataset.active = !usesBinaryPreview && state.wrapLines ? "true" : "false";
	toggleWrapButton.disabled = !file || usesBinaryPreview;
	toggleWrapButton.title = usesBinaryPreview
		? "Wrap is unavailable for binary previews"
		: `Wrap long lines (${state.wrapLines ? "on" : "off"})`;
	toggleUnchangedButton.dataset.active = state.hideUnchanged ? "true" : "false";
	toggleUnchangedButton.title = state.hideUnchanged
		? "Showing changed areas only — click to show full file"
		: "Show changed areas only";
	toggleUnchangedButton.style.display = !usesBinaryPreview && activeFileShowsDiff() ? "inline-flex" : "none";
	updateScopeButtons();
	updateReviewRefreshButton();
	modeHintEl.textContent = currentModeHint();
	submitButton.disabled = false;
	updateFileHeaderMeta(file);
}

function applyEditorOptions() {
	const addedOnly = activeFileIsAddedOnly();
	const showDiff = activeFileShowsDiff();
	const wrapMode = state.wrapLines ? "on" : "off";
	editorContainerEl.dataset.addedOnly = addedOnly ? "true" : "false";
	if (singleEditor) {
		singleEditor.updateOptions({
			wordWrap: wrapMode,
			wordWrapOverride1: wrapMode,
			wordWrapOverride2: wrapMode,
		});
	}
	if (!diffEditor) return;
	// Why both `wordWrap` and `wordWrapOverride1/2`:
	// Monaco's diff editor internally applies `wordWrapOverride1` (and sometimes
	// `wordWrapOverride2`) on the original/modified sides to enforce diff-specific
	// behavior. Those overrides take precedence over `wordWrap`, so setting only
	// `wordWrap` on each side leaves the effective wrapping column out of sync
	// (original keeps wrap off, modified honors wrap on -> asymmetric rendering).
	// Setting both overrides to the same value forces the effective wrap to match.
	diffEditor.updateOptions({
		renderSideBySide: showDiff,
		diffWordWrap: "inherit",
		hideUnchangedRegions: {
			enabled: showDiff && state.hideUnchanged,
			contextLineCount: 4,
			minimumLineCount: 2,
			revealLineCount: 12,
		},
	});
	// For added-only files, hide the original editor's line numbers so the inline diff
	// gutter doesn't paint a redundant two-column layout alongside the modified numbers.
	diffEditor.getOriginalEditor().updateOptions({
		wordWrap: wrapMode,
		wordWrapOverride1: wrapMode,
		wordWrapOverride2: wrapMode,
		lineNumbers: addedOnly ? "off" : "on",
	});
	diffEditor.getModifiedEditor().updateOptions({
		wordWrap: wrapMode,
		wordWrapOverride1: wrapMode,
		wordWrapOverride2: wrapMode,
	});
}

function renderTree() {
	ensureActiveFileForScope();
	fileTreeEl.innerHTML = "";
	const scopedFiles = getScopedFiles();
	const visibleFiles = getFilteredFiles();

	if (visibleFiles.length === 0) {
		const message = state.fileFilter.trim()
			? `No files match <span class="text-review-text">${escapeHtml(state.fileFilter.trim())}</span>.`
			: `No files in <span class="text-review-text">${escapeHtml(scopeLabel(state.currentScope).toLowerCase())}</span>.`;
		fileTreeEl.innerHTML = `
      <div class="px-3 py-4 text-sm text-review-muted">
        ${message}
      </div>
    `;
	} else if (state.fileFilter.trim()) {
		renderSearchResults(visibleFiles);
	} else {
		renderTreeNode(buildTree(visibleFiles), 0);
	}

	sidebarTitleEl.textContent = scopeLabel(state.currentScope);
	const comments = state.comments.length;
	const filteredSuffix = state.fileFilter.trim() ? ` • ${visibleFiles.length} shown` : "";
	const liveSuffix = isSelectedWorkingTreeCommit() ? " • live working tree" : "";
	const staleSuffix = state.localChangesDetected ? " • local changes detected" : "";
	summaryEl.textContent = `${scopedFiles.length} file(s) • ${comments} comment(s)${state.overallComment ? " • overall note" : ""}${filteredSuffix}${liveSuffix}${staleSuffix}`;
	updateToggleButtons();
	updateSidebarLayout();
}

let activePopover = null;

function closeActivePopover() {
	if (!activePopover) return;
	activePopover.dispose();
	activePopover = null;
}

function showTextPopover(trigger, options) {
	if (activePopover && activePopover.trigger === trigger) {
		closeActivePopover();
		return;
	}
	closeActivePopover();

	const popover = document.createElement("div");
	popover.className = "review-popover";
	popover.innerHTML = `
    <div class="mb-1 text-[13px] font-semibold text-review-text">${escapeHtml(options.title)}</div>
    <div class="mb-2 text-[11px] text-review-muted">${escapeHtml(options.description)}</div>
    <textarea id="review-popover-text" class="scrollbar-thin w-full resize-y rounded-md border border-review-border bg-[#010409] px-2.5 py-1.5 text-[13px] text-review-text outline-none focus:border-review-accent focus:ring-1 focus:ring-review-accent" placeholder="${escapeHtml(options.placeholder ?? "")}">${escapeHtml(options.initialValue ?? "")}</textarea>
    <div class="mt-2 flex items-center justify-between gap-2">
      <div class="text-[10px] text-review-subtle">↵ to save · Esc to close</div>
      <div class="flex gap-2">
        <button id="review-popover-cancel" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-[12px] font-medium text-review-text hover:bg-review-panel-hover">Cancel</button>
        <button id="review-popover-save" class="cursor-pointer rounded-md border border-[rgba(240,246,252,0.1)] bg-review-success-emphasis px-3 py-1 text-[12px] font-medium text-white hover:bg-review-success">${escapeHtml(options.saveLabel ?? "Save")}</button>
      </div>
    </div>
  `;
	document.body.appendChild(popover);

	// Position anchored to trigger button, preferring below-right alignment.
	const rect = trigger.getBoundingClientRect();
	const popRect = popover.getBoundingClientRect();
	const viewportW = document.documentElement.clientWidth;
	const margin = 8;
	const gap = 6;
	const top = rect.bottom + gap;
	let left = rect.right - popRect.width;
	if (left < margin) left = margin;
	if (left + popRect.width > viewportW - margin) left = viewportW - margin - popRect.width;
	popover.style.top = `${top}px`;
	popover.style.left = `${left}px`;
	popover.dataset.arrow = rect.right - left > popRect.width / 2 ? "right" : "left";

	const textarea = popover.querySelector("#review-popover-text");
	const save = () => {
		const value = textarea.value.trim();
		options.onSave(value);
		closePopover();
	};
	const closePopover = () => {
		popover.remove();
		document.removeEventListener("mousedown", onOutside, true);
		document.removeEventListener("keydown", onKey, true);
		if (activePopover && activePopover.element === popover) activePopover = null;
	};
	const onOutside = (event) => {
		if (popover.contains(event.target) || trigger.contains(event.target)) return;
		closePopover();
	};
	const onKey = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			closePopover();
			trigger.focus?.();
		} else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			save();
		}
	};
	popover.querySelector("#review-popover-cancel").addEventListener("click", closePopover);
	popover.querySelector("#review-popover-save").addEventListener("click", save);
	document.addEventListener("mousedown", onOutside, true);
	document.addEventListener("keydown", onKey, true);

	activePopover = { trigger, element: popover, dispose: closePopover };
	requestAnimationFrame(() => textarea.focus());
}

function showOverallCommentPopover() {
	showTextPopover(overallCommentButton, {
		title: "Overall review note",
		description: "Prepended to the generated prompt above inline comments.",
		initialValue: state.overallComment,
		placeholder: "High-level notes for this review...",
		saveLabel: "Save note",
		onSave: (value) => {
			state.overallComment = value;
			renderTree();
		},
	});
}

function showFileCommentPopover() {
	const file = activeFile();
	if (!file) return;
	showTextPopover(fileCommentButton, {
		title: `File comment — ${getScopeDisplayPath(file, state.currentScope)}`,
		description: `Applies to the whole file in ${scopeLabel(state.currentScope).toLowerCase()}.`,
		initialValue: "",
		placeholder: "Comment on the whole file...",
		saveLabel: "Add comment",
		onSave: (value) => {
			if (!value) return;
			state.comments.push(
				annotateCommentWithCommit({
					id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
					fileId: file.id,
					scope: state.currentScope,
					side: "file",
					startLine: null,
					endLine: null,
					body: value,
				}),
			);
			submitButton.disabled = false;
			updateCommentsUI();
		},
	});
}

function layoutEditor() {
	const width = editorContainerEl.clientWidth;
	const height = editorContainerEl.clientHeight;
	if (width <= 0 || height <= 0) return;
	if (diffEditor) diffEditor.layout({ width, height });
	if (singleEditor) singleEditor.layout({ width, height });
}

function clearViewZones() {
	if (activeViewZones.length === 0) return;
	const zonesByEditor = new Map();
	for (const zone of activeViewZones) {
		if (!zone.editor) continue;
		const zones = zonesByEditor.get(zone.editor) ?? [];
		zones.push(zone.id);
		zonesByEditor.set(zone.editor, zones);
	}
	for (const [editor, zoneIds] of zonesByEditor.entries()) {
		editor.changeViewZones((accessor) => {
			for (const id of zoneIds) accessor.removeZone(id);
		});
	}
	activeViewZones = [];
}

function renderCommentDOM(comment, onDelete) {
	const container = document.createElement("div");
	container.className = "view-zone-container";
	const title =
		comment.side === "file"
			? `File comment • ${scopeLabel(comment.scope)}`
			: `${comment.side === "original" ? "Original" : "Modified"} line ${comment.startLine} • ${scopeLabel(comment.scope)}`;

	container.innerHTML = `
    <div class="mb-2 flex items-center justify-between gap-3">
      <div class="text-xs font-semibold text-review-text">${escapeHtml(title)}</div>
      <button data-action="delete" class="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-red-500/10 hover:text-red-400">Delete</button>
    </div>
    <textarea data-comment-id="${escapeHtml(comment.id)}" class="scrollbar-thin min-h-[76px] w-full resize-y rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-review-accent focus:ring-1 focus:ring-review-accent" placeholder="Leave a comment"></textarea>
  `;
	const textarea = container.querySelector("textarea");
	textarea.value = comment.body || "";
	textarea.addEventListener("input", () => {
		comment.body = textarea.value;
	});
	container.querySelector("[data-action='delete']").addEventListener("click", onDelete);
	if (!comment.body) setTimeout(() => textarea.focus(), 50);
	return container;
}

function canCommentOnSide(file, side) {
	if (!file || file.kind !== "text") return false;
	const comparison = activeComparison();
	if (side === "original") {
		return comparison?.hasOriginal ?? false;
	}
	return comparison != null ? comparison.hasModified : file.hasWorkingTreeFile;
}

function isActiveFileReady() {
	const file = activeFile();
	if (!file) return false;
	const requestState = getRequestState(file.id, state.currentScope);
	return requestState.contents != null && requestState.error == null;
}

function syncViewZones() {
	clearViewZones();
	if (!isActiveFileReady()) return;
	const file = activeFile();
	if (!file) return;

	const usingSingleEditor = activeFileUsesSingleEditor();
	const originalEditor = usingSingleEditor ? null : diffEditor?.getOriginalEditor?.();
	const modifiedEditor = usingSingleEditor ? singleEditor : diffEditor?.getModifiedEditor?.();
	if (!modifiedEditor || (!usingSingleEditor && !originalEditor)) return;

	const inlineComments = state.comments.filter(
		(comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side !== "file",
	);

	inlineComments.forEach((item) => {
		const editor = item.side === "original" ? originalEditor : modifiedEditor;
		if (!editor) return;
		const domNode = renderCommentDOM(item, () => {
			state.comments = state.comments.filter((comment) => comment.id !== item.id);
			updateCommentsUI();
		});

		editor.changeViewZones((accessor) => {
			const lineCount = typeof item.body === "string" && item.body.length > 0 ? item.body.split("\n").length : 1;
			const id = accessor.addZone({
				afterLineNumber: item.startLine,
				heightInPx: Math.max(150, lineCount * 22 + 86),
				domNode,
			});
			activeViewZones.push({ id, editor });
		});
	});
}

function updateDecorations() {
	if (!monacoApi) return;
	const file = activeFile();
	const comments = file
		? state.comments.filter(
				(comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side !== "file",
			)
		: [];
	const originalRanges = [];
	const modifiedRanges = [];

	for (const comment of comments) {
		const range = {
			range: new monacoApi.Range(comment.startLine, 1, comment.startLine, 1),
			options: {
				isWholeLine: true,
				className: comment.side === "original" ? "review-comment-line-original" : "review-comment-line-modified",
				glyphMarginClassName:
					comment.side === "original" ? "review-comment-glyph-original" : "review-comment-glyph-modified",
			},
		};
		if (comment.side === "original") originalRanges.push(range);
		else modifiedRanges.push(range);
	}

	if (diffEditor) {
		originalDecorations = diffEditor.getOriginalEditor().deltaDecorations(originalDecorations, originalRanges);
		modifiedDecorations = diffEditor
			.getModifiedEditor()
			.deltaDecorations(modifiedDecorations, activeFileUsesSingleEditor() ? [] : modifiedRanges);
	}
	singleDecorations = singleEditor
		? singleEditor.deltaDecorations(singleDecorations, activeFileUsesSingleEditor() ? modifiedRanges : [])
		: [];
}

function renderFileComments() {
	fileCommentsContainer.innerHTML = "";
	const file = activeFile();
	if (!file) {
		fileCommentsContainer.className = "hidden overflow-hidden px-0 py-0";
		return;
	}

	const fileComments = state.comments.filter(
		(comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side === "file",
	);

	if (fileComments.length === 0) {
		fileCommentsContainer.className = "hidden overflow-hidden px-0 py-0";
		return;
	}

	fileCommentsContainer.className = "border-b border-review-border bg-[#0d1117] px-4 py-4 space-y-4";
	fileComments.forEach((comment) => {
		const dom = renderCommentDOM(comment, () => {
			state.comments = state.comments.filter((item) => item.id !== comment.id);
			updateCommentsUI();
		});
		dom.className = "rounded-lg border border-review-border bg-review-panel p-4";
		fileCommentsContainer.appendChild(dom);
	});
}

function getPlaceholderContents(file, scope) {
	const path = getScopeDisplayPath(file, scope);
	const requestState = getRequestState(file.id, scope);
	if (requestState.error) {
		const body = `Failed to load ${path}\n\n${requestState.error}`;
		return {
			originalContent: body,
			modifiedContent: body,
			kind: file.kind,
			mimeType: file.mimeType,
			originalExists: false,
			modifiedExists: false,
			originalPreviewUrl: null,
			modifiedPreviewUrl: null,
		};
	}
	const body = `Loading ${path}...`;
	return {
		originalContent: body,
		modifiedContent: body,
		kind: file.kind,
		mimeType: file.mimeType,
		originalExists: false,
		modifiedExists: false,
		originalPreviewUrl: null,
		modifiedPreviewUrl: null,
	};
}

function getMountedContents(file, scope = state.currentScope) {
	return getRequestState(file.id, scope).contents || getPlaceholderContents(file, scope);
}

function renderFilePathLabel(path) {
	if (!path) {
		currentFileLabelEl.textContent = "";
		return;
	}
	const idx = path.lastIndexOf("/");
	if (idx < 0) {
		currentFileLabelEl.textContent = path;
		return;
	}
	const dir = path.slice(0, idx + 1);
	const base = path.slice(idx + 1);
	currentFileLabelEl.innerHTML = `<span class="gh-file-path-dir">${escapeHtml(dir)}</span>${escapeHtml(base)}`;
}

function updateFileHeaderMeta(file) {
	if (!file) {
		fileStatusBadgeEl.style.display = "none";
		fileDiffStatsEl.style.display = "none";
		return;
	}
	const status = getActiveStatus(file);
	if (status) {
		fileStatusBadgeEl.style.display = "inline-flex";
		fileStatusBadgeEl.className = statusBadgeClass(status);
		fileStatusBadgeEl.textContent = statusCode(status);
		fileStatusBadgeEl.title = statusLabel(status);
	} else {
		fileStatusBadgeEl.style.display = "none";
	}
	if (file.kind !== "text") {
		fileDiffStatsEl.style.display = "none";
		return;
	}
	const contents = getRequestState(file.id, state.currentScope).contents;
	if (!contents || !activeFileShowsDiff()) {
		fileDiffStatsEl.style.display = "none";
		return;
	}
	const originalLines = contents.originalContent ? contents.originalContent.split("\n").length : 0;
	const modifiedLines = contents.modifiedContent ? contents.modifiedContent.split("\n").length : 0;
	// Cheap estimate — we don't compute a full diff; the counts are naive line
	// deltas, which is enough for the GitHub-style badge.
	const added = Math.max(0, modifiedLines - originalLines);
	const removed = Math.max(0, originalLines - modifiedLines);
	if (added === 0 && removed === 0) {
		fileDiffStatsEl.style.display = "none";
		return;
	}
	fileDiffStatsEl.style.display = "inline-flex";
	fileDiffStatsEl.innerHTML = `${added > 0 ? `<span class="gh-diff-stats-plus">+${added}</span>` : ""}${removed > 0 ? `<span class="gh-diff-stats-minus">−${removed}</span>` : ""}`;
}

// Hide the diff editor while Monaco is computing the diff, then reveal once
// `onDidUpdateDiff` fires AND Monaco has painted the folded layout. Monaco paints
// models asynchronously relative to diff computation — before the diff is ready
// `hideUnchangedRegions` has nothing to fold, so the first frame always shows the
// full file and only collapses on the next tick. That's the layout shift.
function cancelPendingReveal() {
	if (!pendingDiffReveal) return;
	try {
		pendingDiffReveal.dispose?.dispose();
	} catch {
		// Ignore stale Monaco disposables during remounts.
	}
	clearTimeout(pendingDiffReveal.timeoutId);
	pendingDiffReveal = null;
}

function hideEditorForMount() {
	// Paint an opaque cover OVER Monaco (not on the container itself). This keeps
	// Monaco fully visible to the browser's layout engine so it renders, computes
	// its diff, inserts hide-unchanged view zones and paints the final folded
	// geometry at normal speed. Hiding the container via opacity:0 can make WebKit
	// skip paints/compositing for Monaco's nested absolute children, which in turn
	// makes `onDidUpdateDiff` + RAF reveal land while the fold is still settling.
	if (editorCoverEl) editorCoverEl.dataset.active = "true";
}

function armDiffRevealListener(onSettled) {
	// Attach listener BEFORE setModel to avoid missing a synchronously-fired
	// onDidUpdateDiff event (Monaco can compute diffs synchronously for small files).
	cancelPendingReveal();
	if (!diffEditor || typeof diffEditor.onDidUpdateDiff !== "function") {
		pendingDiffReveal = { dispose: null, timeoutId: setTimeout(onSettled, 0) };
		return;
	}
	let fired = false;
	const settleOnce = () => {
		if (fired) return;
		fired = true;
		onSettled();
	};
	const dispose = diffEditor.onDidUpdateDiff(() => {
		// onDidUpdateDiff only signals that diff DATA is ready. Monaco still needs
		// follow-up frames to insert hide-unchanged view zones and repaint the
		// folded geometry. Wait RAF → force layout → RAF → small setTimeout so the
		// paint pipeline is guaranteed to have flushed before we drop the cover.
		requestAnimationFrame(() => {
			try {
				layoutEditor();
			} catch {
				// Ignore transient layout failures while Monaco settles.
			}
			requestAnimationFrame(() => {
				setTimeout(settleOnce, 40);
			});
		});
	});
	// Safety net: force-reveal after 600ms so the UI never stays hidden on edge
	// cases where onDidUpdateDiff doesn't fire (identical models, Monaco quirks).
	const timeoutId = setTimeout(settleOnce, 600);
	pendingDiffReveal = { dispose: { dispose: () => dispose.dispose() }, timeoutId };
}

function revealEditorNow() {
	if (editorCoverEl) editorCoverEl.dataset.active = "false";
}

function mountFile(options = {}) {
	if (!diffEditor || !singleEditor || !monacoApi) return;
	const file = activeFile();
	if (!file) {
		hideBinaryPreview();
		setTextEditorMode("diff");
		currentFileLabelEl.textContent = "No file selected";
		updateFileHeaderMeta(null);
		clearViewZones();
		if (singleModel) {
			singleEditor.setModel(null);
			singleModel.dispose();
			singleModel = null;
		}
		if (originalModel) originalModel.dispose();
		if (modifiedModel) modifiedModel.dispose();
		originalModel = null;
		modifiedModel = null;
		originalModel = monacoApi.editor.createModel("", "plaintext");
		modifiedModel = monacoApi.editor.createModel("", "plaintext");
		// Apply options BEFORE setModel so Monaco renders the first frame with the
		// correct hideUnchangedRegions / renderSideBySide / added-only state.
		applyEditorOptions();
		hideEditorForMount();
		armDiffRevealListener(() => {
			cancelPendingReveal();
			revealEditorNow();
		});
		diffEditor.setModel({ original: originalModel, modified: modifiedModel });
		updateDecorations();
		renderFileComments();
		requestAnimationFrame(layoutEditor);
		return;
	}

	ensureFileLoaded(file.id, state.currentScope);

	const preserveScroll = options.preserveScroll === true;
	const scrollState = preserveScroll ? captureScrollState() : null;
	const language = inferLanguage(getScopeFilePath(file) || file.path);
	const contents = getMountedContents(file, state.currentScope);

	clearViewZones();
	renderFilePathLabel(getScopeDisplayPath(file, state.currentScope));
	updateFileHeaderMeta(file);

	if (file.kind !== "text") {
		cancelPendingReveal();
		revealEditorNow();
		renderBinaryPreview(file, contents);
		renderFileComments();
		requestAnimationFrame(layoutEditor);
		return;
	}

	hideBinaryPreview();
	if (originalModel) originalModel.dispose();
	if (modifiedModel) modifiedModel.dispose();
	originalModel = null;
	modifiedModel = null;

	if (activeFileUsesSingleEditor()) {
		cancelPendingReveal();
		setTextEditorMode("single");
		if (singleModel) {
			singleEditor.setModel(null);
			singleModel.dispose();
		}
		singleModel = monacoApi.editor.createModel(contents.modifiedContent, language);
		singleEditor.setModel(singleModel);
		applyEditorOptions();
		hideEditorForMount();
		syncViewZones();
		updateDecorations();
		renderFileComments();
		requestAnimationFrame(() => {
			layoutEditor();
			requestAnimationFrame(() => {
				layoutEditor();
				revealEditorNow();
			});
		});
		return;
	}

	setTextEditorMode("diff");
	if (singleModel) {
		singleEditor.setModel(null);
		singleModel.dispose();
		singleModel = null;
	}

	originalModel = monacoApi.editor.createModel(contents.originalContent, language);
	modifiedModel = monacoApi.editor.createModel(contents.modifiedContent, language);

	// Apply options BEFORE setModel. Otherwise Monaco first renders the new diff
	// using the PREVIOUS file's options (e.g. hideUnchangedRegions off because the
	// last file was added-only, or a stale renderSideBySide value) and only collapses
	// once updateOptions runs a frame later — causing a visible layout shift.
	applyEditorOptions();
	hideEditorForMount();
	// Arm the reveal listener BEFORE setModel so a synchronously-fired
	// onDidUpdateDiff (possible for small files) can't be missed.
	armDiffRevealListener(() => {
		cancelPendingReveal();
		revealEditorNow();
	});
	diffEditor.setModel({ original: originalModel, modified: modifiedModel });
	// Re-apply editor options AFTER setModel: Monaco can derive original-side
	// wrap overrides (`wordWrapOverride1`) from the swapped-in model, leaving the
	// pre-setModel `applyEditorOptions()` call partially overridden. A second
	// call ensures both sides observe the user's wrap toggle symmetrically.
	applyEditorOptions();
	syncViewZones();
	updateDecorations();
	renderFileComments();
	requestAnimationFrame(() => {
		layoutEditor();
		if (options.restoreFileScroll) restoreFileScrollPosition();
		if (options.preserveScroll) restoreScrollState(scrollState);
		setTimeout(() => {
			layoutEditor();
			if (options.restoreFileScroll) restoreFileScrollPosition();
			if (options.preserveScroll) restoreScrollState(scrollState);
		}, 50);
	});
}

function syncCommentBodiesFromDOM() {
	const textareas = document.querySelectorAll("textarea[data-comment-id]");
	textareas.forEach((textarea) => {
		const commentId = textarea.getAttribute("data-comment-id");
		const comment = state.comments.find((item) => item.id === commentId);
		if (comment) comment.body = textarea.value;
	});
}

function buildSubmitPayload() {
	syncCommentBodiesFromDOM();
	return {
		type: "submit",
		overallComment: state.overallComment.trim(),
		comments: state.comments
			.map((comment) => ({ ...comment, body: comment.body.trim() }))
			.filter((comment) => comment.body.length > 0),
	};
}

function hasSubmitPayloadContent(payload) {
	return payload.overallComment.length > 0 || payload.comments.length > 0;
}

function submitDraftOnClose() {
	if (suppressAutoSubmitOnClose) return;
	const payload = buildSubmitPayload();
	if (!hasSubmitPayloadContent(payload)) return;
	suppressAutoSubmitOnClose = true;
	window.glimpse?.send?.(payload);
}

function updateCommentsUI() {
	renderTree();
	syncViewZones();
	updateDecorations();
	renderFileComments();
}

function renderAll(options = {}) {
	renderTree();
	renderCommitList();
	submitButton.disabled = state.assetInitFailed;
	if (state.assetInitFailed) {
		renderFileComments();
		return;
	}
	if (diffEditor && singleEditor && monacoApi) {
		mountFile(options);
		requestAnimationFrame(() => {
			layoutEditor();
			setTimeout(layoutEditor, 50);
		});
	} else {
		renderFileComments();
	}
}

function getFocusedTextEditor() {
	const editors = [singleEditor, diffEditor?.getModifiedEditor?.(), diffEditor?.getOriginalEditor?.()].filter(Boolean);
	return editors.find((editor) => editor?.hasTextFocus?.() || editor?.hasWidgetFocus?.()) ?? null;
}

function getEditorSelectionText(editor) {
	const model = editor?.getModel?.();
	const selections = editor?.getSelections?.() ?? [];
	if (!model || selections.length === 0) return "";
	return selections
		.filter((selection) => !selection.isEmpty())
		.map((selection) => model.getValueInRange(selection))
		.join("\n");
}

window.__reviewClipboard = {
	getSelectedText() {
		const editor = getFocusedTextEditor();
		return editor ? getEditorSelectionText(editor) : "";
	},
	selectAll() {
		const editor = getFocusedTextEditor();
		const model = editor?.getModel?.();
		if (!editor || !model) return false;
		editor.setSelection(model.getFullModelRange());
		return true;
	},
};

function createGlyphHoverActions(editor, side) {
	let hoverDecoration = [];

	function openDraftAtLine(line) {
		const file = activeFile();
		if (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) return;
		state.comments.push(
			annotateCommentWithCommit({
				id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
				fileId: file.id,
				scope: state.currentScope,
				side,
				startLine: line,
				endLine: line,
				body: "",
			}),
		);
		updateCommentsUI();
		editor.revealLineInCenter(line);
	}

	editor.onMouseMove((event) => {
		const file = activeFile();
		if (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) {
			hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
			return;
		}

		const target = event.target;
		if (
			target.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
			target.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS
		) {
			const line = target.position?.lineNumber;
			if (!line) return;
			hoverDecoration = editor.deltaDecorations(hoverDecoration, [
				{
					range: new monacoApi.Range(line, 1, line, 1),
					options: { glyphMarginClassName: "review-glyph-plus" },
				},
			]);
		} else {
			hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
		}
	});

	editor.onMouseLeave(() => {
		hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
	});

	editor.onMouseDown((event) => {
		const file = activeFile();
		if (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) return;

		const target = event.target;
		if (
			target.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
			target.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS
		) {
			const line = target.position?.lineNumber;
			if (!line) return;
			openDraftAtLine(line);
		}
	});
}

window.__reviewReceive = (message) => {
	if (!message || typeof message !== "object") return;

	if (message.type === "clipboard-data") {
		window.__reviewReceiveClipboardData?.(message);
		return;
	}

	if (message.type === "working-tree-changed") {
		const observedAt = Date.now();
		state.localChangesDetected = true;
		state.lastLocalChangeDetectedAt = message.changedAt ?? observedAt;
		state.lastLocalChangeObservedAt = observedAt;
		renderTree();
		return;
	}

	if (message.type === "review-data") {
		if (state.reviewDataRequestId !== message.requestId) return;
		clearRefreshableFileState();
		clearWorkingTreeCommitState();
		reviewData.files = Array.isArray(message.files) ? message.files : [];
		reviewData.commits = Array.isArray(message.commits) ? message.commits : [];
		reviewData.branchBaseRef = message.branchBaseRef ?? null;
		reviewData.branchMergeBaseSha = message.branchMergeBaseSha ?? null;
		reviewData.repositoryHasHead = message.repositoryHasHead === true;
		const requestStartedAt = state.reviewDataRequestStartedAt;
		state.reviewDataRequestId = null;
		state.reviewDataRequestStartedAt = null;
		state.lastWorkingTreeLoadAt = null;
		const localChangeAfterRequest =
			requestStartedAt == null ||
			(state.lastLocalChangeObservedAt != null && state.lastLocalChangeObservedAt > requestStartedAt);
		if (!localChangeAfterRequest) {
			state.localChangesDetected = false;
			state.lastLocalChangeDetectedAt = null;
			state.lastLocalChangeObservedAt = null;
		}
		if (!reviewData.commits.some((commit) => commit.sha === state.selectedCommitSha)) {
			state.selectedCommitSha = reviewData.commits[0]?.sha ?? null;
		}
		renderCommitList();
		renderAll({ restoreFileScroll: false });
		if (state.currentScope === "commits" && state.selectedCommitSha) {
			ensureCommitFilesLoaded(state.selectedCommitSha, {
				forceRefresh: isWorkingTreeCommit(state.selectedCommitSha),
			});
		}
		return;
	}

	if (message.type === "review-data-error") {
		if (state.reviewDataRequestId !== message.requestId) return;
		state.reviewDataRequestId = null;
		state.reviewDataRequestStartedAt = null;
		updateReviewRefreshButton();
		alert(`Failed to refresh review data: ${message.message || "Unknown error"}`);
		return;
	}

	if (message.type === "commit-data") {
		if (state.commitRequestIds[message.sha] !== message.requestId) return;
		state.commitFilesBySha[message.sha] = Array.isArray(message.files) ? message.files : [];
		delete state.commitErrors[message.sha];
		delete state.commitRequestIds[message.sha];
		if (isWorkingTreeCommit(message.sha)) {
			state.lastWorkingTreeLoadAt = Date.now();
		}
		renderCommitList();
		if (state.currentScope === "commits" && state.selectedCommitSha === message.sha) {
			ensureActiveFileForScope();
			renderAll({ restoreFileScroll: false });
			const file = activeFile();
			if (file) {
				ensureFileLoaded(file.id, state.currentScope, message.sha, {
					forceRefresh: isWorkingTreeCommit(message.sha),
				});
			}
		}
		return;
	}

	if (message.type === "commit-error") {
		if (state.commitRequestIds[message.sha] !== message.requestId) return;
		state.commitErrors[message.sha] = message.message || "Unknown error";
		delete state.commitRequestIds[message.sha];
		renderCommitList();
		updateReviewRefreshButton();
		return;
	}

	const key = cacheKey(message.scope, message.fileId, message.commitSha ?? null);

	if (message.type === "file-data") {
		if (state.pendingRequestIds[key] !== message.requestId) return;
		state.fileContents[key] = {
			originalContent: message.originalContent,
			modifiedContent: message.modifiedContent,
			kind: message.kind,
			mimeType: message.mimeType,
			originalExists: message.originalExists,
			modifiedExists: message.modifiedExists,
			originalPreviewUrl: message.originalPreviewUrl,
			modifiedPreviewUrl: message.modifiedPreviewUrl,
		};
		delete state.fileErrors[key];
		delete state.pendingRequestIds[key];
		renderTree();
		if (state.activeFileId === message.fileId && state.currentScope === message.scope) {
			mountFile({ restoreFileScroll: true });
		}
		return;
	}

	if (message.type === "file-error") {
		if (state.pendingRequestIds[key] !== message.requestId) return;
		state.fileErrors[key] = message.message || "Unknown error";
		delete state.pendingRequestIds[key];
		renderTree();
		if (state.activeFileId === message.fileId && state.currentScope === message.scope) {
			mountFile({ preserveScroll: false });
		}
	}
};

function resolveMonacoWorkerPath(vsBaseUrl, label) {
	switch (label) {
		case "json":
			return `${vsBaseUrl}/language/json/jsonWorker.js`;
		case "css":
		case "scss":
		case "less":
			return `${vsBaseUrl}/language/css/cssWorker.js`;
		case "html":
		case "handlebars":
		case "razor":
			return `${vsBaseUrl}/language/html/htmlWorker.js`;
		case "typescript":
		case "javascript":
			return `${vsBaseUrl}/language/typescript/tsWorker.js`;
		default:
			return `${vsBaseUrl}/base/worker/workerMain.js`;
	}
}

function setupMonaco() {
	if (reviewAssetConfig.bootstrapError) {
		showAssetFailure(
			"The review window could not finish loading.",
			"TLH could not load its packaged review assets. Close this window and rerun /annotate-git-diff after reinstalling or updating TLH.",
			reviewAssetConfig.bootstrapError,
		);
		return;
	}

	const vsBaseUrl = typeof reviewAssetConfig.monacoVsBaseUrl === "string" ? reviewAssetConfig.monacoVsBaseUrl : "";
	if (!vsBaseUrl) {
		showAssetFailure(
			"The review window could not finish loading.",
			"TLH could not locate its packaged Monaco assets. Close this window and rerun /annotate-git-diff after reinstalling or updating TLH.",
		);
		return;
	}

	if (!window.require || typeof window.require.config !== "function") {
		showAssetFailure(
			"The review window could not finish loading.",
			"TLH could not initialize the packaged Monaco loader. Close this window and rerun /annotate-git-diff.",
		);
		return;
	}

	const workerBaseUrl = vsBaseUrl.endsWith("/") ? vsBaseUrl : `${vsBaseUrl}/`;
	const workerUrls = new Map();
	window.MonacoEnvironment = {
		baseUrl: workerBaseUrl,
		getWorkerUrl(_moduleId, label) {
			const cacheKey = label || "default";
			if (!workerUrls.has(cacheKey)) {
				const workerSource = [
					`self.MonacoEnvironment = { baseUrl: ${JSON.stringify(workerBaseUrl)} };`,
					`importScripts(${JSON.stringify(resolveMonacoWorkerPath(vsBaseUrl, label))});`,
				].join("\n");
				workerUrls.set(
					cacheKey,
					URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })),
				);
			}
			return workerUrls.get(cacheKey);
		},
	};
	window.addEventListener(
		"unload",
		() => {
			for (const workerUrl of workerUrls.values()) {
				URL.revokeObjectURL(workerUrl);
			}
			workerUrls.clear();
		},
		{ once: true },
	);

	let settled = false;
	const settleFailure = (message, error) => {
		if (settled) return;
		settled = true;
		showAssetFailure(
			"The review window could not finish loading.",
			message,
			formatAssetErrorDetail(error),
		);
		updateToggleButtons();
	};
	const settleSuccess = () => {
		if (settled) return false;
		settled = true;
		clearTimeout(loadTimeoutId);
		clearAssetFailure();
		return true;
	};
	const loadTimeoutId = setTimeout(() => {
		settleFailure(
			"TLH timed out while loading the packaged Monaco editor. Close this window and rerun /annotate-git-diff.",
			"Timed out waiting for Monaco to finish loading.",
		);
	}, 10000);

	try {
		window.require.config({
			paths: {
				vs: vsBaseUrl,
			},
		});
	} catch (error) {
		clearTimeout(loadTimeoutId);
		settleFailure(
			"TLH could not configure the packaged Monaco editor. Close this window and rerun /annotate-git-diff.",
			error,
		);
		return;
	}

	window.require(
		["vs/editor/editor.main"],
		() => {
			if (!settleSuccess()) return;
			monacoApi = window.monaco;

			// GitHub-style diff colors.
			monacoApi.editor.defineTheme("review-dark", {
				base: "vs-dark",
				inherit: true,
				rules: [],
				colors: {
					"editor.background": "#0d1117",
					"editor.foreground": "#f0f6fc",
					"editorLineNumber.foreground": "#6e7681",
					"editorLineNumber.activeForeground": "#c9d1d9",
					"editorGutter.background": "#0d1117",
					"diffEditor.insertedLineBackground": "#1c7c3c33",
					"diffEditor.insertedTextBackground": "#2ea04366",
					"diffEditor.removedLineBackground": "#b62a2233",
					"diffEditor.removedTextBackground": "#f8514966",
					"diffEditor.border": "#30363d",
					"editorOverviewRuler.border": "#30363d",
				},
			});
			monacoApi.editor.setTheme("review-dark");

			diffEditor = monacoApi.editor.createDiffEditor(diffEditorHostEl, {
				automaticLayout: true,
				renderSideBySide: activeFileShowsDiff(),
				readOnly: true,
				originalEditable: false,
				// GitHub-style review: no minimap and no diff overview ruler on the side.
				// Those were the panels that visibly flashed during remount because Monaco
				// repaints them as hide-unchanged view zones settle.
				minimap: { enabled: false },
				renderOverviewRuler: false,
				overviewRulerLanes: 0,
				diffWordWrap: "on",
				scrollBeyondLastLine: false,
				lineNumbersMinChars: 4,
				glyphMargin: true,
				folding: true,
				lineDecorationsWidth: 10,
				overviewRulerBorder: false,
				wordWrap: "on",
			});

			singleEditor = monacoApi.editor.create(singleEditorHostEl, {
				automaticLayout: true,
				readOnly: true,
				minimap: { enabled: false },
				renderOverviewRuler: false,
				overviewRulerLanes: 0,
				scrollBeyondLastLine: false,
				lineNumbersMinChars: 4,
				glyphMargin: true,
				folding: true,
				lineDecorationsWidth: 10,
				overviewRulerBorder: false,
				wordWrap: state.wrapLines ? "on" : "off",
			});

			createGlyphHoverActions(diffEditor.getOriginalEditor(), "original");
			createGlyphHoverActions(diffEditor.getModifiedEditor(), "modified");
			createGlyphHoverActions(singleEditor, "modified");

			if (typeof ResizeObserver !== "undefined") {
				editorResizeObserver = new ResizeObserver(() => {
					layoutEditor();
				});
				editorResizeObserver.observe(editorContainerEl);
			}

			requestAnimationFrame(() => {
				layoutEditor();
				setTimeout(layoutEditor, 50);
				setTimeout(layoutEditor, 150);
			});

			mountFile();
			updateToggleButtons();
		},
		(error) => {
			clearTimeout(loadTimeoutId);
			settleFailure(
				"TLH could not load the packaged Monaco editor. Close this window and rerun /annotate-git-diff.",
				error,
			);
		},
	);
}

function switchScope(scope) {
	const hasScopeFiles = {
		branch: reviewData.files.some((file) => file.inGitDiff),
		commits: reviewData.commits.length > 0,
		all: reviewData.files.length > 0,
	};
	if (!hasScopeFiles[scope] || state.currentScope === scope) return;
	saveCurrentScrollPosition();
	state.currentScope = scope;
	state.activeFileId = null;
	if (scope === "commits") {
		if (!state.selectedCommitSha && reviewData.commits[0]) {
			state.selectedCommitSha = reviewData.commits[0].sha;
		}
		if (state.selectedCommitSha) ensureCommitFilesLoaded(state.selectedCommitSha);
	}
	renderAll({ restoreFileScroll: true });
	const file = activeFile();
	if (file) ensureFileLoaded(file.id, state.currentScope);
}

window.addEventListener("beforeunload", submitDraftOnClose);
window.addEventListener("pagehide", submitDraftOnClose);

submitButton.addEventListener("click", () => {
	const payload = buildSubmitPayload();
	suppressAutoSubmitOnClose = true;
	window.glimpse.send(payload);
	window.glimpse.close();
});

cancelButton.addEventListener("click", () => {
	suppressAutoSubmitOnClose = true;
	window.glimpse.send({ type: "cancel" });
	window.glimpse.close();
});

overallCommentButton.addEventListener("click", () => {
	showOverallCommentPopover();
});

fileCommentButton.addEventListener("click", () => {
	showFileCommentPopover();
});

if (refreshReviewButton) {
	refreshReviewButton.addEventListener("click", () => {
		refreshReviewData();
	});
}

toggleUnchangedButton.addEventListener("click", () => {
	state.hideUnchanged = !state.hideUnchanged;
	applyEditorOptions();
	updateToggleButtons();
	requestAnimationFrame(layoutEditor);
});

toggleWrapButton.addEventListener("click", () => {
	state.wrapLines = !state.wrapLines;
	applyEditorOptions();
	updateToggleButtons();
	requestAnimationFrame(() => {
		layoutEditor();
		setTimeout(layoutEditor, 50);
	});
});

toggleReviewedButton.addEventListener("click", () => {
	const file = activeFile();
	if (!file) return;
	state.reviewedFiles[file.id] = !isFileReviewed(file.id);
	renderTree();
});

scopeBranchButton.addEventListener("click", () => {
	switchScope("branch");
});

scopeCommitsButton.addEventListener("click", () => {
	switchScope("commits");
});

scopeAllButton.addEventListener("click", () => {
	switchScope("all");
});

toggleSidebarButton.addEventListener("click", () => {
	state.sidebarCollapsed = !state.sidebarCollapsed;
	updateSidebarLayout();
	requestAnimationFrame(() => {
		layoutEditor();
		setTimeout(layoutEditor, 50);
	});
});

const fileCollapseButton = document.getElementById("file-collapse-button");
if (fileCollapseButton) {
	fileCollapseButton.addEventListener("click", () => {
		const collapsed = editorContainerEl.style.display === "none";
		editorContainerEl.style.display = collapsed ? "" : "none";
		fileCollapseButton.dataset.active = collapsed ? "true" : "false";
		fileCollapseButton.title = collapsed ? "Collapse file" : "Expand file";
		const svg = fileCollapseButton.querySelector("svg path");
		if (svg) {
			svg.setAttribute(
				"d",
				collapsed
					? "M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 1 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"
					: "M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z",
			);
		}
		requestAnimationFrame(() => {
			layoutEditor();
			setTimeout(layoutEditor, 50);
		});
	});
}

sidebarSearchInputEl.addEventListener("input", () => {
	state.fileFilter = sidebarSearchInputEl.value;
	renderTree();
});

sidebarSearchInputEl.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		sidebarSearchInputEl.value = "";
		state.fileFilter = "";
		renderTree();
	}
});

if (state.currentScope === "commits" && state.selectedCommitSha) {
	ensureCommitFilesLoaded(state.selectedCommitSha);
}
ensureActiveFileForScope();
renderTree();
renderCommitList();
renderFileComments();
updateSidebarLayout();
setupMonaco();
