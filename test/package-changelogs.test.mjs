import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CHANGELOG_FILE_NAME,
  CHANGELOG_PLACEHOLDER_BULLET,
  compareVersions,
  parseChangelogEntries,
} from "../scripts/changelog.mjs";
import { getWorkspacePackageDefs, repoRoot } from "./workspace-package-helpers.mjs";

// Explicit exclusions: skill-only and deprecated packages do not ship changelogs.
const changelogExcludedPackages = [
  "extensions/illustrations-to-explain-things",
  "extensions/claude-fast",
  "extensions/openai-fast",
];

const packages = [
  { dir: ".", manifestPath: "package.json", packageRoot: repoRoot },
  ...getWorkspacePackageDefs().map((def) => ({
    dir: path.relative(repoRoot, def.packageRoot).split(path.sep).join("/"),
    manifestPath: def.manifestPath,
    packageRoot: def.packageRoot,
  })),
].map((pkg) => ({
  ...pkg,
  manifest: JSON.parse(readFileSync(path.join(repoRoot, pkg.manifestPath), "utf8")),
}));

const enabled = packages.filter((pkg) => pkg.manifest.files?.includes(CHANGELOG_FILE_NAME));
const excluded = packages.filter((pkg) => !pkg.manifest.files?.includes(CHANGELOG_FILE_NAME));

test("changelog-enabled set is exactly all packages except the explicit exclusions", () => {
  assert.deepEqual(excluded.map((pkg) => pkg.dir).sort(), [...changelogExcludedPackages].sort());
  assert.equal(enabled.length, 31);
  for (const pkg of excluded) {
    assert.equal(existsSync(path.join(pkg.packageRoot, CHANGELOG_FILE_NAME)), false, pkg.dir);
  }
});

test("npm pack output includes CHANGELOG.md for each enabled package", () => {
  const stdout = execFileSync(
    "npm",
    ["pack", "--dry-run", "--ignore-scripts", "--json", "--workspaces", "--include-workspace-root"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const filesByName = new Map(
    JSON.parse(stdout).map((result) => [result.name, new Set(result.files.map((f) => f.path))]),
  );
  for (const pkg of packages) {
    const files = filesByName.get(pkg.manifest.name);
    assert.ok(files, `expected pack output for ${pkg.manifest.name}`);
    assert.equal(files.has(CHANGELOG_FILE_NAME), enabled.includes(pkg), pkg.dir);
  }
});

for (const pkg of enabled) {
  test(`${pkg.dir} CHANGELOG.md is well formed`, () => {
    const file = path.join(pkg.packageRoot, CHANGELOG_FILE_NAME);
    assert.ok(existsSync(file), `${pkg.dir} is missing ${CHANGELOG_FILE_NAME}`);
    const content = readFileSync(file, "utf8");
    assert.ok(content.startsWith("# Changelog"), `${pkg.dir} should start with "# Changelog"`);
    assert.equal(content.includes(CHANGELOG_PLACEHOLDER_BULLET), false, `${pkg.dir} placeholder`);

    const entries = parseChangelogEntries(content);
    for (const entry of entries) {
      assert.ok(entry.version, `${pkg.dir} line ${entry.line} heading has no version`);
    }
    for (let i = 1; i < entries.length; i += 1) {
      assert.ok(
        compareVersions(entries[i - 1].version, entries[i].version) > 0,
        `${pkg.dir} versions must be strictly descending (${entries[i - 1].version} then ${entries[i].version})`,
      );
    }
    if (entries.length > 0) {
      assert.equal(entries[0].version, pkg.manifest.version, `${pkg.dir} newest entry`);
    }
  });
}
