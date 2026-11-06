#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

// Keep this allowlist explicit: only these package-local copies are generated.
export const SYNC_PAIRS = Object.freeze([
  Object.freeze({
    source: "shared/footer/git-status.ts",
    destination: "extensions/git-footer/git-status.ts",
  }),
  Object.freeze({
    source: "shared/footer/git-status.ts",
    destination: "extensions/minimal-footer/git-status.ts",
  }),
  Object.freeze({
    source: "shared/glimpse/quiet-glimpse.ts",
    destination: "extensions/annotate-git-diff/quiet-glimpse.ts",
  }),
  Object.freeze({
    source: "shared/glimpse/quiet-glimpse.ts",
    destination: "extensions/annotate-last-message/quiet-glimpse.ts",
  }),
  Object.freeze({
    source: "shared/glimpse/glimpseui.d.ts",
    destination: "extensions/annotate-git-diff/glimpseui.d.ts",
  }),
  Object.freeze({
    source: "shared/glimpse/glimpseui.d.ts",
    destination: "extensions/annotate-last-message/glimpseui.d.ts",
  }),
]);

function generatedHeader(source) {
  return [
    `// Generated copy of ${source}.`,
    "// Edit the canonical source, then run `npm run sync:shared`.",
    "// Do not edit this package-local copy directly.",
    "",
  ].join("\n");
}

export function generatedCopy(source, canonicalContent) {
  return `${generatedHeader(source)}${canonicalContent}`;
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function absolutePath(root, relativePath) {
  return path.join(root, relativePath);
}

export async function syncShared({ root = REPO_ROOT, check = false } = {}) {
  const repoRoot = path.resolve(root);
  const issues = [];
  const sources = new Map();

  for (const pair of SYNC_PAIRS) {
    if (sources.has(pair.source)) continue;
    const sourcePath = absolutePath(repoRoot, pair.source);
    const sourceContent = await readText(sourcePath);
    if (sourceContent === null) issues.push(`missing canonical source: ${pair.source}`);
    else sources.set(pair.source, sourceContent);
  }

  // Do not partially synchronize package copies when a canonical source is missing.
  if (issues.length) return { check, changed: [], unchanged: [], issues };

  const changed = [];
  const unchanged = [];
  for (const pair of SYNC_PAIRS) {
    const destinationPath = absolutePath(repoRoot, pair.destination);
    const expected = generatedCopy(pair.source, sources.get(pair.source));
    const actual = await readText(destinationPath);
    if (actual === expected) {
      unchanged.push(pair.destination);
      continue;
    }

    if (check) {
      issues.push(
        actual === null
          ? `missing generated copy: ${pair.destination}`
          : `stale generated copy: ${pair.destination}`,
      );
      continue;
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, expected, "utf8");
    changed.push(pair.destination);
  }

  return { check, changed, unchanged, issues };
}

export async function main(
  argv = process.argv.slice(2),
  {
    root = REPO_ROOT,
    stdout = (...args) => console.log(...args),
    stderr = (...args) => console.error(...args),
  } = {},
) {
  const unknownArgs = argv.filter((argument) => argument !== "--check");
  if (unknownArgs.length) {
    stderr(`Usage: node scripts/sync-shared.mjs [--check]`);
    return 2;
  }

  const check = argv.includes("--check");
  try {
    const result = await syncShared({ root, check });
    for (const destination of result.changed) stdout(`synced ${destination}`);
    for (const issue of result.issues) stderr(issue);

    if (result.issues.length) return 1;
    if (check) stdout("Shared copies are synchronized.");
    else if (result.changed.length === 0) stdout("Shared copies are already synchronized.");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`sync-shared failed: ${message}`);
    return 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
