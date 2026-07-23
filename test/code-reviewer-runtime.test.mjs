import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

let tempDir;
let runtime;

async function loadRuntime() {
	if (runtime) return runtime;
	const sourcePath = path.resolve("extensions/code-reviewer/index.ts");
	const source = await readFile(sourcePath, "utf8");
	const compiled = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.ES2022,
			target: ts.ScriptTarget.ES2022,
		},
	}).outputText;
	tempDir = await mkdtemp(path.join(path.resolve("test"), ".tmp-code-reviewer-"));
	const compiledPath = path.join(tempDir, "index.mjs");
	await writeFile(compiledPath, compiled, "utf8");
	runtime = await import(pathToFileURL(compiledPath).href);
	return runtime;
}

test.after(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

function createGuardHandlers(factory) {
	const handlers = new Map();
	factory({
		on(eventName, handler) {
			handlers.set(eventName, handler);
		},
	});
	return handlers;
}

test("aggregates usage across assistant and compaction session events", async () => {
	const mod = await loadRuntime();
	const { aggregateAssistantUsage, addAssistantMessageUsage, addSessionEventUsage } = mod.__test__;

	assert.deepEqual(
		aggregateAssistantUsage([
			{ role: 'user', usage: { input: 999 } },
			{
				role: 'assistant',
				usage: {
					input: 10,
					output: 20,
					cacheRead: 1,
					cacheWrite: 2,
					cacheWrite1h: 1,
					reasoning: 3,
					totalTokens: 30,
					cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.02, total: 0.33 },
				},
			},
			{
				role: 'assistant',
				usage: {
					input: 4,
					output: 5,
					cacheRead: 6,
					cacheWrite: 7,
					totalTokens: 9,
					cost: { input: 0.4, output: 0.5, cacheRead: 0.6, cacheWrite: 0.7, total: 2.2 },
				},
			},
		]),
		{
			input: 14,
			output: 25,
			cacheRead: 7,
			cacheWrite: 9,
			cacheWrite1h: 1,
			reasoning: 3,
			totalTokens: 39,
			cost: { input: 0.5, output: 0.7, cacheRead: 0.61, cacheWrite: 0.72, total: 2.5300000000000002 },
		},
	);
	const explicitZeros = aggregateAssistantUsage([{ role: 'assistant', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, reasoning: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }]);
	assert.equal(explicitZeros.cacheWrite1h, 0);
	assert.equal(explicitZeros.reasoning, 0);
	const unreported = aggregateAssistantUsage([]);
	assert.equal('cacheWrite1h' in unreported, false);
	assert.equal('reasoning' in unreported, false);

	const eventTotal = aggregateAssistantUsage([]);
	addSessionEventUsage(eventTotal, {
		type: 'compaction_end',
		result: {
			usage: {
				input: 2,
				output: 3,
				cacheRead: 4,
				cacheWrite: 5,
				cacheWrite1h: 6,
				reasoning: 7,
				totalTokens: 8,
				cost: { input: 0.2, output: 0.3, cacheRead: 0.4, cacheWrite: 0.5, total: 1.4 },
			},
		},
	});
	addSessionEventUsage(eventTotal, {
		type: 'message_end',
		message: {
			role: 'assistant',
			usage: { input: 7, output: 11, cacheRead: 0, cacheWrite: 0, totalTokens: 18, cost: { input: 0.7, output: 1.1, cacheRead: 0, cacheWrite: 0, total: 1.8 } },
		},
	});
	assert.equal(eventTotal.input, 9);
	assert.equal(eventTotal.output, 14);
	assert.equal(eventTotal.cacheRead, 4);
	assert.equal(eventTotal.cacheWrite, 5);
	assert.equal(eventTotal.cacheWrite1h, 6);
	assert.equal(eventTotal.reasoning, 7);
	assert.equal(eventTotal.totalTokens, 26);
	assert.equal(eventTotal.cost.total, 3.2);
});

test("code-reviewer classifies final assistant outcomes", async () => {
	const mod = await loadRuntime();
	const { inspectFinalAssistant } = mod.__test__;

	assert.deepEqual(inspectFinalAssistant([]), {
		ok: false,
		reason: 'code_reviewer subagent produced no assistant message',
	});
	assert.deepEqual(
		inspectFinalAssistant([{ role: 'assistant', stopReason: 'error', errorMessage: '404 model not found', content: [{ type: 'text', text: 'partial' }] }]),
		{
			ok: false,
			reason: 'code_reviewer subagent error: 404 model not found',
			stopReason: 'error',
			errorMessage: '404 model not found',
		},
	);
	assert.deepEqual(inspectFinalAssistant([{ role: 'assistant', stopReason: 'aborted', content: [{ type: 'text', text: 'partial' }] }]), {
		ok: false,
		reason: 'code_reviewer subagent aborted before producing a usable answer',
		stopReason: 'aborted',
	});
	assert.deepEqual(inspectFinalAssistant([{ role: 'assistant', stopReason: 'stop', content: [] }]), {
		ok: false,
		reason: 'code_reviewer subagent produced no final assistant text (stopReason: stop)',
		stopReason: 'stop',
		errorMessage: undefined,
	});
	assert.deepEqual(inspectFinalAssistant([{ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'ok' }] }]), {
		ok: true,
		answer: 'ok',
		stopReason: 'stop',
	});
});

test("code-reviewer distinguishes caller aborts from internal timeouts", async () => {
	const mod = await loadRuntime();
	const { classifyRunFailure } = mod.__test__;

	assert.deepEqual(classifyRunFailure(new Error('code_reviewer timed out after 480 seconds.'), false), {
		status: 'error',
		message: 'code_reviewer timed out after 480 seconds.',
		error: 'code_reviewer timed out after 480 seconds.',
	});
	assert.deepEqual(classifyRunFailure(new Error('code_reviewer subagent aborted before producing a usable answer'), false), {
		status: 'error',
		message: 'code_reviewer subagent aborted before producing a usable answer',
		error: 'code_reviewer subagent aborted before producing a usable answer',
	});
	assert.deepEqual(classifyRunFailure(Object.assign(new Error('unexpected abort'), { name: 'AbortError' }), false), {
		status: 'error',
		message: 'unexpected abort',
		error: 'unexpected abort',
	});
	assert.deepEqual(classifyRunFailure(new Error('provider error after caller abort'), true), {
		status: 'aborted',
		message: 'Aborted',
		error: undefined,
	});
});

test("code_reviewer tool_result marks only terminal failures as errors", async () => {
	const mod = await loadRuntime();
	const handlers = new Map();
	mod.default({
		on(eventName, handler) {
			handlers.set(eventName, handler);
		},
		registerTool() {},
	});
	const toolResult = handlers.get('tool_result');
	assert.equal(typeof toolResult, 'function');
	assert.deepEqual(await toolResult({ toolName: 'code_reviewer', details: { status: 'error' } }), { isError: true });
	assert.equal(await toolResult({ toolName: 'code_reviewer', details: { status: 'aborted' } }), undefined);
	assert.equal(await toolResult({ toolName: 'code_reviewer', details: { status: 'done' } }), undefined);
	assert.equal(await toolResult({ toolName: 'bash', details: { status: 'error' } }), undefined);
});

test("blocks git local-file options that bypass tool path guards", async () => {
	const mod = await loadRuntime();
	const { getBlockedBashReason } = mod.__test__;

	assert.match(getBlockedBashReason("git blame --contents=.git/config src/index.ts") ?? "", /--contents/);
	assert.match(getBlockedBashReason("git blame --content=.git/config src/index.ts") ?? "", /--contents/);
	assert.match(getBlockedBashReason("git blame --cont=.git/config src/index.ts") ?? "", /--contents/);
	assert.match(getBlockedBashReason("git show --pathspec-from-file=.gitmodules HEAD") ?? "", /--pathspec-from-file/);
	assert.match(getBlockedBashReason("git show --pathspec-from-f=.gitmodules HEAD") ?? "", /--pathspec-from-file/);
	assert.match(getBlockedBashReason("git show --pathspec=.gitmodules HEAD") ?? "", /--pathspec-from-file/);
	assert.match(getBlockedBashReason("git blame --ignore-revs-file=.git-blame-ignore-revs src/index.ts") ?? "", /--ignore-revs-file/);
	assert.match(getBlockedBashReason("git blame --ignore-revs-f=.git-blame-ignore-revs src/index.ts") ?? "", /--ignore-revs-file/);
	assert.match(getBlockedBashReason("git blame --ignore-rev=.git-blame-ignore-revs src/index.ts") ?? "", /--ignore-revs-file/);
	assert.match(getBlockedBashReason("git blame -S .git-blame-ignore-revs src/index.ts") ?? "", /git blame -S/);
	assert.match(getBlockedBashReason("git blame -S.git-blame-ignore-revs src/index.ts") ?? "", /git blame -S/);
	assert.match(getBlockedBashReason("git ls-files -X .git/info/exclude") ?? "", /git ls-files -X\/--exclude-from/);
	assert.match(getBlockedBashReason("git ls-files --exclude-from=.git/info/exclude") ?? "", /git ls-files -X\/--exclude-from/);
	assert.match(getBlockedBashReason("git ls-files --exclude-f=.git/info/exclude") ?? "", /git ls-files -X\/--exclude-from/);
});

test("blocks git blame --con abbreviation for --contents", async () => {
	const mod = await loadRuntime();
	const { getBlockedBashReason } = mod.__test__;

	assert.match(getBlockedBashReason("git blame --con=.git/config src/index.ts") ?? "", /--contents/);
});

test("blocks git helpers that can execute local filters", async () => {
	const mod = await loadRuntime();
	const { getBlockedBashReason } = mod.__test__;

	assert.match(getBlockedBashReason("git cat-file --filters HEAD:README.md") ?? "", /--filters/);
	assert.match(getBlockedBashReason("git diff --ext-diff") ?? "", /--ext-diff/);
});

test("blocks git signature verification and help helper paths", async () => {
	const mod = await loadRuntime();
	const { getBlockedBashReason } = mod.__test__;

	assert.match(getBlockedBashReason("git show --show-signature HEAD") ?? "", /signature verification flags/);
	assert.match(getBlockedBashReason("git log --show-signat HEAD") ?? "", /signature verification flags/);
	assert.match(getBlockedBashReason("git log '--pretty=format:%G?' HEAD") ?? "", /signature format atoms/);
	assert.match(getBlockedBashReason("git for-each-ref '--format=%(signature)' refs/heads") ?? "", /signature format atoms/);
	assert.match(getBlockedBashReason("git show --help") ?? "", /git help output/);
	assert.match(getBlockedBashReason("git help show") ?? "", /git help/);
});


test("blocks gh side-effecting flags on read-only commands", async () => {
	const mod = await loadRuntime();
	const { getBlockedBashReason } = mod.__test__;

	assert.match(getBlockedBashReason("gh api repos/owner/repo --cache 1h") ?? "", /gh api --cache/);
	assert.match(getBlockedBashReason("gh api repos/owner/repo --cache=1h") ?? "", /gh api --cache/);
	assert.match(getBlockedBashReason("gh pr view 123 --web") ?? "", /gh --web/);
	assert.match(getBlockedBashReason("gh repo view -w") ?? "", /gh --web/);
	assert.match(getBlockedBashReason("gh pr view 123 --web=true") ?? "", /gh --web/);
	assert.match(getBlockedBashReason("gh repo view -w=true") ?? "", /gh --web/);
	assert.equal(getBlockedBashReason("gh pr view 123"), undefined);
});

test("rejects raw dot-dot traversal before path normalization", async (t) => {
	const mod = await loadRuntime();
	const { assertToolPathInsideCwd } = mod.__test__;
	const root = await mkdtemp(path.join(os.tmpdir(), "code-reviewer-path-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "code-reviewer-path-outside-"));

	t.after(async () => {
		await rm(root, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	});

	await symlink(outside, path.join(root, "link"));
	await writeFile(path.join(outside, "outside-file"), "secret\n", "utf8");

	assert.match(
		(await assertToolPathInsideCwd(root, "link/../outside-file", "read")) ?? "",
		/must not traverse outside the local checkout/,
	);
});

test("injects safe git flags for allowed read-only commands", async () => {
	const mod = await loadRuntime();
	const { buildSafeGitCommand, getBlockedBashReason } = mod.__test__;

	assert.equal(getBlockedBashReason("git diff HEAD~1 -- README.md"), undefined);
	assert.equal(
		buildSafeGitCommand(["git", "diff", "HEAD~1", "--", "README.md"]),
		"'git' '--no-pager' '--no-optional-locks' '-c' 'core.pager=cat' '-c' 'core.fsmonitor=false' '-c' 'diff.external=' 'diff' '--no-ext-diff' '--no-textconv' 'HEAD~1' '--' 'README.md'",
	);
	assert.equal(
		buildSafeGitCommand(["git", "show", "--stat", "foo bar.ts"]),
		"'git' '--no-pager' '--no-optional-locks' '-c' 'core.pager=cat' '-c' 'core.fsmonitor=false' '-c' 'diff.external=' 'show' '--no-ext-diff' '--no-textconv' '--stat' 'foo bar.ts'",
	);
	assert.equal(
		buildSafeGitCommand(["git", "status", "x>review.out"]),
		"'git' '--no-pager' '--no-optional-locks' '-c' 'core.pager=cat' '-c' 'core.fsmonitor=false' '-c' 'diff.external=' 'status' 'x>review.out'",
	);
	assert.equal(
		buildSafeGitCommand(["git", "status", "a'b"]),
		"'git' '--no-pager' '--no-optional-locks' '-c' 'core.pager=cat' '-c' 'core.fsmonitor=false' '-c' 'diff.external=' 'status' 'a'\"'\"'b'",
	);
	assert.equal(
		buildSafeGitCommand(["git", "show", "HEAD"]),
		"'git' '--no-pager' '--no-optional-locks' '-c' 'core.pager=cat' '-c' 'core.fsmonitor=false' '-c' 'diff.external=' 'show' '--no-ext-diff' '--no-textconv' 'HEAD'",
	);
});

test("blocks git remote show because it can contact remotes or execute helpers", async () => {
	const mod = await loadRuntime();
	const { getBlockedBashReason } = mod.__test__;

	assert.equal(getBlockedBashReason("git remote"), undefined);
	assert.equal(getBlockedBashReason("git remote -v"), undefined);
	assert.equal(getBlockedBashReason("git remote --verbose"), undefined);
	assert.equal(getBlockedBashReason("git remote get-url origin"), undefined);
	assert.match(getBlockedBashReason("git remote show origin") ?? "", /git remote only for read-only list or get-url queries/);
	assert.match(getBlockedBashReason("git remote show -n origin") ?? "", /git remote only for read-only list or get-url queries/);
});

test("runtime guard blocks unsafe calls, rewrites git bash commands, and enforces turn budget", async (t) => {
	const mod = await loadRuntime();
	const { createCodeReviewerRuntimeGuardExtension } = mod.__test__;
	const root = await mkdtemp(path.join(os.tmpdir(), "code-reviewer-runtime-"));
	const outside = await mkdtemp(path.join(os.tmpdir(), "code-reviewer-runtime-outside-"));
	await writeFile(path.join(root, "README.md"), "ok\n", "utf8");
	await writeFile(path.join(outside, "secret.txt"), "nope\n", "utf8");

	t.after(async () => {
		await rm(root, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	});

	const handlers = createGuardHandlers(createCodeReviewerRuntimeGuardExtension({ cwd: root, maxTurns: 2 }));
	const turnStart = handlers.get("turn_start");
	const toolCall = handlers.get("tool_call");
	const toolResult = handlers.get("tool_result");

	assert.equal(typeof turnStart, "function");
	assert.equal(typeof toolCall, "function");
	assert.equal(typeof toolResult, "function");

	assert.deepEqual(await toolCall({ toolName: "write", input: { path: "x" } }), {
		block: true,
		reason: "code_reviewer exposes read-only tools only; write is not allowed.",
	});

	await turnStart({ turnIndex: 0 });
	const blockedRead = await toolCall({ toolName: "read", input: { path: outside } });
	assert.equal(blockedRead?.block, true);
	assert.match(blockedRead?.reason ?? "", /^read is limited to the local checkout: /);

	const bashInput = { command: "git diff HEAD~1 -- README.md" };
	assert.equal(await toolCall({ toolName: "bash", input: bashInput }), undefined);
	assert.equal(bashInput.timeout, 30);
	assert.equal(
		bashInput.command,
		"'git' '--no-pager' '--no-optional-locks' '-c' 'core.pager=cat' '-c' 'core.fsmonitor=false' '-c' 'diff.external=' 'diff' '--no-ext-diff' '--no-textconv' 'HEAD~1' '--' 'README.md'",
	);

	assert.deepEqual(await toolResult({ content: [{ type: "text", text: "ok" }] }), {
		content: [
			{ type: "text", text: "ok" },
			{ type: "text", text: "\n\n[code_reviewer turn budget] turn 1/2" },
		],
	});

	await turnStart({ turnIndex: 1 });
	assert.deepEqual(await toolCall({ toolName: "read", input: { path: "README.md" } }), {
		block: true,
		reason: "Tool use is disabled on final code_reviewer turn 2/2. Answer now with the evidence already gathered.",
	});
});
