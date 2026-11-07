import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

const { getCommitFiles, getReviewWindowData, loadReviewFileContents } = await importGitModule();

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

async function createIsolatedGitFixture(scratchDir) {
  const configPath = path.join(scratchDir, "empty-gitconfig");
  const templatePath = path.join(scratchDir, "empty-template");
  await writeFile(configPath, "");
  await mkdir(templatePath);

  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "BASH_ENV"),
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: configPath,
    GIT_ATTR_NOSYSTEM: "1",
    BASH_ENV: configPath,
  });

  const pi = {
    async exec(command, args, options) {
      const effectiveArgs =
        command === "bash" && args[0] === "-lc" ? ["--noprofile", "--norc", "-c", args[1]] : args;
      try {
        const result = await execFileAsync(command, effectiveArgs, {
          cwd: options?.cwd,
          env,
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

  function git(dir, ...args) {
    try {
      return execFileSync("git", args, { cwd: dir, env, encoding: "utf8" }).trimEnd();
    } catch (error) {
      throw new Error(`git ${args.join(" ")} in ${dir}: ${error.stderr ?? error.message}`);
    }
  }

  return { pi, git, templatePath };
}

async function initIsolatedRepo(git, dir, templatePath) {
  git(dir, "init", "-b", "main", `--template=${templatePath}`);
  for (const [key, value] of Object.entries({
    "user.name": "Diagnostic",
    "user.email": "diagnostic@example.invalid",
    "commit.gpgsign": "false",
    "tag.gpgsign": "false",
    "core.quotePath": "true",
    "core.autocrlf": "false",
  })) {
    git(dir, "config", key, value);
  }
}

async function createRepo(scratchDir) {
  const { pi, git, templatePath } = await createIsolatedGitFixture(scratchDir);
  const repoDir = path.join(scratchDir, "repo");
  await mkdir(repoDir);
  await initIsolatedRepo(git, repoDir, templatePath);
  return { pi, git, repoDir };
}

function sortedPaths(files) {
  return files.map((file) => file.path).sort((a, b) => a.localeCompare(b));
}

const MINIMAL_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082",
  "hex",
);

test("preserves quoted, backslash, whitespace, and non-ASCII filenames with their contents", async (t) => {
  if (process.platform === "win32") {
    t.skip("backslash and double quote are not valid filename characters on Windows");
    return;
  }
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "pi-annotate-special-paths-"));
  t.after(() => rm(scratchDir, { recursive: true, force: true }));

  const { pi, git, repoDir } = await createRepo(scratchDir);
  const names = ["café.txt", "tail .txt ", "tab\there.txt", 'quote"back\\slash.txt'];
  for (const name of names) await writeFile(path.join(repoDir, name), "old\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "base");

  for (const name of names) await writeFile(path.join(repoDir, name), "new\n");

  const data = await getReviewWindowData(pi, repoDir);
  const branchFiles = data.files.filter((file) => file.inGitDiff);
  assert.deepEqual(
    sortedPaths(branchFiles),
    [...names].sort((a, b) => a.localeCompare(b)),
  );
  for (const name of names) {
    const file = branchFiles.find((entry) => entry.path === name);
    assert.ok(file, `missing branch file ${JSON.stringify(name)}`);
    const contents = await loadReviewFileContents(
      pi,
      repoDir,
      file,
      "branch",
      null,
      data.branchMergeBaseSha,
    );
    assert.equal(contents.originalContent, "old\n");
    assert.equal(contents.modifiedContent, "new\n");
    assert.equal(contents.originalExists, true);
    assert.equal(contents.modifiedExists, true);
  }

  const workingTreeFiles = await getCommitFiles(pi, repoDir, "__tlh_working_tree__");
  assert.deepEqual(
    sortedPaths(workingTreeFiles),
    [...names].sort((a, b) => a.localeCompare(b)),
  );
  const workingTreeFile = workingTreeFiles.find((file) => file.path === names[0]);
  const workingTreeContents = await loadReviewFileContents(
    pi,
    repoDir,
    workingTreeFile,
    "commits",
    "__tlh_working_tree__",
  );
  assert.equal(workingTreeContents.originalContent, "old\n");
  assert.equal(workingTreeContents.modifiedContent, "new\n");

  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "modify");
  const commitFiles = await getCommitFiles(pi, repoDir, git(repoDir, "rev-parse", "HEAD"));
  assert.deepEqual(
    sortedPaths(commitFiles),
    [...names].sort((a, b) => a.localeCompare(b)),
  );
  const commitFile = commitFiles.find((file) => file.path === names[0]);
  const commitContents = await loadReviewFileContents(
    pi,
    repoDir,
    commitFile,
    "commits",
    git(repoDir, "rev-parse", "HEAD"),
  );
  assert.equal(commitContents.originalContent, "old\n");
  assert.equal(commitContents.modifiedContent, "new\n");
});

test("returns the working tree for all file kinds in an unborn repository", async (t) => {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "pi-annotate-unborn-"));
  t.after(() => rm(scratchDir, { recursive: true, force: true }));

  const { pi, git, repoDir } = await createRepo(scratchDir);
  await writeFile(path.join(repoDir, "unstaged.txt"), "unstaged content\n");
  await writeFile(path.join(repoDir, "staged.txt"), "staged content\n");
  git(repoDir, "add", "staged.txt");
  await writeFile(path.join(repoDir, "empty.txt"), "");
  await writeFile(path.join(repoDir, "photo.png"), MINIMAL_PNG);

  const data = await getReviewWindowData(pi, repoDir);
  assert.equal(data.repositoryHasHead, false);
  assert.equal(data.branchMergeBaseSha, null);
  const branchFiles = data.files.filter((file) => file.inGitDiff);
  const workingTreeFiles = await getCommitFiles(pi, repoDir, "__tlh_working_tree__");

  for (const name of ["unstaged.txt", "staged.txt", "empty.txt", "photo.png"]) {
    const branchFile = branchFiles.find((file) => file.path === name);
    const workingTreeFile = workingTreeFiles.find((file) => file.path === name);
    assert.ok(branchFile, `${name} missing from Branch scope`);
    assert.ok(workingTreeFile, `${name} missing from working-tree scope`);

    const branchContents = await loadReviewFileContents(
      pi,
      repoDir,
      branchFile,
      "branch",
      null,
      data.branchMergeBaseSha,
    );
    const workingTreeContents = await loadReviewFileContents(
      pi,
      repoDir,
      workingTreeFile,
      "commits",
      "__tlh_working_tree__",
    );
    assert.equal(branchContents.originalExists, false);
    assert.equal(branchContents.originalContent, "");
    assert.equal(branchContents.modifiedExists, true);
    assert.equal(branchContents.modifiedContent, workingTreeContents.modifiedContent);
    assert.equal(branchContents.modifiedExists, workingTreeContents.modifiedExists);
    assert.equal(branchContents.modifiedPreviewUrl, workingTreeContents.modifiedPreviewUrl);
  }

  const imageFile = branchFiles.find((file) => file.path === "photo.png");
  const imageContents = await loadReviewFileContents(
    pi,
    repoDir,
    imageFile,
    "branch",
    null,
    data.branchMergeBaseSha,
  );
  assert.match(imageContents.modifiedPreviewUrl, /^data:image\/png;/);
});

test("compares a conflict-resolved merge with its first parent", async (t) => {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "pi-annotate-merge-conflict-"));
  t.after(() => rm(scratchDir, { recursive: true, force: true }));

  const { pi, git, repoDir } = await createRepo(scratchDir);
  await writeFile(path.join(repoDir, "shared.txt"), "original\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "base");
  git(repoDir, "checkout", "-b", "topic");
  await writeFile(path.join(repoDir, "shared.txt"), "topic version\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "topic");
  git(repoDir, "checkout", "main");
  await writeFile(path.join(repoDir, "shared.txt"), "main version\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "main");

  try {
    git(repoDir, "merge", "--no-ff", "topic", "-m", "merge");
  } catch {
    await writeFile(path.join(repoDir, "shared.txt"), "resolved\n");
    git(repoDir, "add", "shared.txt");
    git(repoDir, "commit", "--no-edit");
  }

  const mergeSha = git(repoDir, "rev-parse", "HEAD");
  const files = await getCommitFiles(pi, repoDir, mergeSha);
  const file = files.find((entry) => entry.path === "shared.txt");
  assert.ok(file);
  const contents = await loadReviewFileContents(pi, repoDir, file, "commits", mergeSha);
  assert.equal(contents.originalContent, "main version\n");
  assert.equal(contents.modifiedContent, "resolved\n");
  assert.equal(contents.originalExists, true);
  assert.equal(contents.modifiedExists, true);
});

test("compares an octopus merge with its first parent", async (t) => {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "pi-annotate-merge-octopus-"));
  t.after(() => rm(scratchDir, { recursive: true, force: true }));

  const { pi, git, repoDir } = await createRepo(scratchDir);
  await writeFile(path.join(repoDir, "base.txt"), "base\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "base");
  git(repoDir, "checkout", "-b", "topic1");
  await writeFile(path.join(repoDir, "topic1.txt"), "topic1\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "topic1");
  git(repoDir, "checkout", "main");
  git(repoDir, "checkout", "-b", "topic2");
  await writeFile(path.join(repoDir, "topic2.txt"), "topic2\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "topic2");
  git(repoDir, "checkout", "main");
  await writeFile(path.join(repoDir, "main-change.txt"), "main change\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "main change");
  git(repoDir, "merge", "--no-ff", "topic1", "topic2", "-m", "octopus");

  const mergeSha = git(repoDir, "rev-parse", "HEAD");
  const files = await getCommitFiles(pi, repoDir, mergeSha);
  assert.deepEqual(sortedPaths(files), ["topic1.txt", "topic2.txt"]);
  for (const file of files) {
    const contents = await loadReviewFileContents(pi, repoDir, file, "commits", mergeSha);
    assert.equal(contents.originalContent, "");
    assert.equal(contents.modifiedContent, git(repoDir, "show", `${mergeSha}:${file.path}`) + "\n");
    assert.equal(contents.originalExists, false);
    assert.equal(contents.modifiedExists, true);
  }
});

test("retains root and single-parent commit comparisons", async (t) => {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "pi-annotate-commit-boundaries-"));
  t.after(() => rm(scratchDir, { recursive: true, force: true }));

  const { pi, git, repoDir } = await createRepo(scratchDir);
  await writeFile(path.join(repoDir, "init.txt"), "initial\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "root");
  const rootSha = git(repoDir, "rev-parse", "HEAD");
  const rootFile = (await getCommitFiles(pi, repoDir, rootSha)).find(
    (file) => file.path === "init.txt",
  );
  assert.ok(rootFile);
  const rootContents = await loadReviewFileContents(pi, repoDir, rootFile, "commits", rootSha);
  assert.equal(rootContents.originalContent, "");
  assert.equal(rootContents.modifiedContent, "initial\n");
  assert.equal(rootContents.originalExists, false);
  assert.equal(rootContents.modifiedExists, true);

  await writeFile(path.join(repoDir, "init.txt"), "modified\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "second");
  const singleSha = git(repoDir, "rev-parse", "HEAD");
  const singleFile = (await getCommitFiles(pi, repoDir, singleSha)).find(
    (file) => file.path === "init.txt",
  );
  assert.ok(singleFile);
  const singleContents = await loadReviewFileContents(
    pi,
    repoDir,
    singleFile,
    "commits",
    singleSha,
  );
  assert.equal(singleContents.originalContent, "initial\n");
  assert.equal(singleContents.modifiedContent, "modified\n");
  assert.equal(singleContents.originalExists, true);
  assert.equal(singleContents.modifiedExists, true);
});
