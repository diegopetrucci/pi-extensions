import assert from "node:assert/strict";
import test from "node:test";
import {
  CHANGELOG_PLACEHOLDER_BULLET,
  compareVersions,
  formatChangelogHeading,
  parseChangelogEntries,
} from "../scripts/changelog.mjs";

test("parseChangelogEntries returns versions in file order", () => {
  const content = [
    "# Changelog",
    "",
    "## [1.2.10] - 2026-01-02",
    "- a",
    "## 1.2.9",
    "### Fixed",
    "##  [0.1.0]",
    "",
  ].join("\n");
  const entries = parseChangelogEntries(content);
  assert.deepEqual(
    entries.map((entry) => entry.version),
    ["1.2.10", "1.2.9", "0.1.0"],
  );
  assert.equal(entries[0].line, 3);
  assert.equal(entries[0].major, 1);
});

test("parseChangelogEntries flags non-version headings and ignores other lines", () => {
  const entries = parseChangelogEntries("## Unreleased\n#### 1.0.0\n### 2.0.0\r\n## [3.0.0]\r\n");
  assert.deepEqual(
    entries.map((entry) => entry.version),
    [null, "3.0.0"],
  );
});

test("compareVersions compares numerically", () => {
  assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
  assert.ok(compareVersions("0.1.86", "0.1.87") < 0);
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0);
});

test("formatChangelogHeading round-trips through the parser and validates input", () => {
  const heading = formatChangelogHeading("0.1.87", "2026-11-11");
  assert.equal(heading, "## [0.1.87] - 2026-11-11");
  assert.equal(parseChangelogEntries(heading)[0].version, "0.1.87");
  assert.throws(() => formatChangelogHeading("1.2", "2026-11-11"));
  assert.throws(() => formatChangelogHeading("1.2.3", "11/11/2026"));
});

test("placeholder bullet is a single list item", () => {
  assert.match(CHANGELOG_PLACEHOLDER_BULLET, /^- TODO\(changelog\)/);
});
