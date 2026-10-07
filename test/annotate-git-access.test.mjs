import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function importGitModule() {
  const sourcePath = path.join(repoRoot, "extensions/annotate-git-diff/git.ts");
  const sourceText = await readFile(sourcePath, "utf8");
  const transpiled = ts.transpileModule(sourceText, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  assert.deepEqual(transpiled.diagnostics ?? [], []);
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText, "utf8").toString("base64")}`
  );
}

const { getCommitFiles, loadReviewFileContents } = await importGitModule();

async function createRealGitPi() {
  return {
    async exec(command, args, options) {
      try {
        const result = await execFileAsync(command, args, {
          cwd: options?.cwd,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
        return { code: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        return {
          code: typeof error?.code === "number" ? error.code : 1,
          stdout: typeof error?.stdout === "string" ? error.stdout : "",
          stderr: typeof error?.stderr === "string" ? error.stderr : "",
        };
      }
    },
  };
}

function createReviewFile(kind) {
  return {
    id: `${kind}-file`,
    path: "package.json",
    worktreeStatus: "modified",
    hasWorkingTreeFile: false,
    inGitDiff: true,
    gitDiff: {
      status: "modified",
      oldPath: "package.json",
      newPath: "package.json",
      displayPath: "package.json",
      hasOriginal: true,
      hasModified: true,
    },
    kind,
    mimeType: kind === "image" ? "image/png" : null,
  };
}

async function assertSentinelUnchanged(tempRoot, sentinelPath) {
  assert.equal(await readFile(sentinelPath, "utf8"), "sentinel contents\n");
  assert.deepEqual(await readdir(tempRoot), ["sentinel"]);
}

test("annotate-git-diff terminates Git revision parsing before diff-tree and text/binary reads", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-annotate-git-access-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const sentinelPath = path.join(tempRoot, "sentinel");
  await writeFile(sentinelPath, "sentinel contents\n", "utf8");
  const maliciousSha = `--output=${sentinelPath}`;
  const pi = await createRealGitPi();

  assert.deepEqual(await getCommitFiles(pi, repoRoot, maliciousSha), []);
  await assertSentinelUnchanged(tempRoot, sentinelPath);

  const textContents = await loadReviewFileContents(
    pi,
    repoRoot,
    createReviewFile("text"),
    "commits",
    maliciousSha,
  );
  assert.equal(textContents.kind, "text");
  await assertSentinelUnchanged(tempRoot, sentinelPath);

  const binaryContents = await loadReviewFileContents(
    pi,
    repoRoot,
    createReviewFile("binary"),
    "commits",
    maliciousSha,
  );
  assert.equal(binaryContents.kind, "binary");
  await assertSentinelUnchanged(tempRoot, sentinelPath);
});
