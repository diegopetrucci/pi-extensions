/* global window, document */

const messageData = JSON.parse(document.getElementById("annotate-last-message-data").textContent || "{}");

if (!Array.isArray(messageData.lines)) messageData.lines = [];
if (!Array.isArray(messageData.sections)) messageData.sections = [];

const state = {
	overallComment: "",
	inlineComments: new Map(),
	sectionComments: new Map(),
};

const elements = {
	messageLines: document.getElementById("message-lines"),
	overallComment: document.getElementById("overall-comment"),
	sectionComments: document.getElementById("section-comments"),
	status: document.getElementById("status"),
	submitButton: document.getElementById("submit-button"),
	cancelButton: document.getElementById("cancel-button"),
};

function feedbackCount() {
	let count = state.overallComment.trim().length > 0 ? 1 : 0;
	for (const value of state.inlineComments.values()) {
		if (value.trim().length > 0) count += 1;
	}
	for (const value of state.sectionComments.values()) {
		if (value.trim().length > 0) count += 1;
	}
	return count;
}

function setStatus(message, status = "idle") {
	elements.status.textContent = message;
	elements.status.dataset.state = status;
}

function updateSubmitState() {
	const count = feedbackCount();
	elements.submitButton.disabled = count === 0;
	if (count === 0) {
		setStatus("Add any feedback you want to send back to the editor.");
		return;
	}
	const noun = count === 1 ? "item" : "items";
	setStatus(`Ready to submit ${count} feedback ${noun}.`, "ready");
}

function setInlineComment(lineNumber, value) {
	state.inlineComments.set(lineNumber, value);
	updateSubmitState();
}

function setSectionComment(sectionId, value) {
	state.sectionComments.set(sectionId, value);
	updateSubmitState();
}

function createInlineEditor(line) {
	const container = document.createElement("div");
	container.className = "inline-editor";
	container.hidden = true;

	const meta = document.createElement("p");
	meta.className = "line-meta";
	meta.textContent = `Inline note for line ${line.number}`;
	container.append(meta);

	const textarea = document.createElement("textarea");
	textarea.placeholder = "Explain what should change here, what is unclear, or what planning detail is missing.";
	textarea.value = state.inlineComments.get(line.number) || "";
	container.append(textarea);

	return { container, textarea };
}

function createLineRow(line) {
	const wrapper = document.createElement("div");
	wrapper.className = "message-line";

	const row = document.createElement("div");
	row.className = "message-line-row";

	const lineNumber = document.createElement("div");
	lineNumber.className = "line-number";
	lineNumber.textContent = String(line.number);
	row.append(lineNumber);

	const lineText = document.createElement("pre");
	lineText.className = "line-text";
	lineText.textContent = line.text.length > 0 ? line.text : " ";
	row.append(lineText);

	const toggle = document.createElement("button");
	toggle.className = "inline-toggle";
	toggle.type = "button";
	toggle.textContent = "Add inline note";
	row.append(toggle);

	const editor = createInlineEditor(line);
	const syncToggle = () => {
		const hasValue = (state.inlineComments.get(line.number) || "").trim().length > 0;
		toggle.dataset.active = hasValue || !editor.container.hidden ? "true" : "false";
		toggle.textContent = hasValue ? "Edit inline note" : "Add inline note";
	};

	editor.textarea.addEventListener("input", () => {
		setInlineComment(line.number, editor.textarea.value);
		syncToggle();
	});

	toggle.addEventListener("click", () => {
		editor.container.hidden = !editor.container.hidden;
		syncToggle();
		if (!editor.container.hidden) {
			editor.textarea.focus();
		}
	});

	wrapper.append(row);
	wrapper.append(editor.container);
	syncToggle();
	return wrapper;
}

function createSectionCard(section) {
	const card = document.createElement("div");
	card.className = "section-card";

	const title = document.createElement("h3");
	const lineRange = section.startLine === section.endLine
		? `line ${section.startLine}`
		: `lines ${section.startLine}-${section.endLine}`;
	title.textContent = `Section ${section.index}`;
	card.append(title);

	const meta = document.createElement("p");
	meta.className = "section-meta";
	meta.textContent = lineRange;
	card.append(meta);

	const preview = document.createElement("div");
	preview.className = "section-preview";
	preview.textContent = section.text;
	card.append(preview);

	const textarea = document.createElement("textarea");
	textarea.placeholder = "Describe what should change across this section or what larger concern should be addressed.";
	textarea.value = state.sectionComments.get(section.id) || "";
	textarea.addEventListener("input", () => {
		setSectionComment(section.id, textarea.value);
	});
	card.append(textarea);

	return card;
}

function renderMessageLines() {
	elements.messageLines.replaceChildren();
	for (const line of messageData.lines) {
		elements.messageLines.append(createLineRow(line));
	}
}

function renderSectionComments() {
	elements.sectionComments.replaceChildren();
	if (messageData.sections.length === 0) {
		const empty = document.createElement("p");
		empty.className = "empty-hint";
		empty.textContent = "This message does not have any non-empty sections to annotate.";
		elements.sectionComments.append(empty);
		return;
	}
	for (const section of messageData.sections) {
		elements.sectionComments.append(createSectionCard(section));
	}
}

function collectPayload() {
	return {
		type: "submit",
		overallComment: state.overallComment,
		inlineComments: Array.from(state.inlineComments.entries()).map(([line, body]) => ({ line, body })),
		sectionComments: Array.from(state.sectionComments.entries()).map(([sectionId, body]) => ({ sectionId, body })),
	};
}

function sendPayload(payload) {
	window.glimpse?.send?.(payload);
	window.glimpse?.close?.();
}

function submit() {
	if (feedbackCount() === 0) {
		setStatus("Add at least one comment before submitting.", "error");
		return;
	}
	sendPayload(collectPayload());
}

function cancel() {
	sendPayload({ type: "cancel" });
}

elements.overallComment.addEventListener("input", () => {
	state.overallComment = elements.overallComment.value;
	updateSubmitState();
});

elements.submitButton.addEventListener("click", submit);

elements.cancelButton.addEventListener("click", cancel);

document.addEventListener("keydown", (event) => {
	if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
		event.preventDefault();
		submit();
		return;
	}
	if (event.key === "Escape") {
		event.preventDefault();
		cancel();
	}
});

renderMessageLines();
renderSectionComments();
updateSubmitState();
