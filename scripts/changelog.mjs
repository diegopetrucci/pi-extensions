// Shared changelog helpers. Heading parsing mirrors Pi 1.5.0+, which treats lines starting
// with "## " as entries and extracts the version with CHANGELOG_VERSION_PATTERN.
export const CHANGELOG_FILE_NAME = "CHANGELOG.md";
export const CHANGELOG_PLACEHOLDER_BULLET = "- TODO(changelog): describe user-facing changes.";

const CHANGELOG_VERSION_PATTERN = /##\s+\[?(\d+)\.(\d+)\.(\d+)\]?/;

/** Returns entries in file order; `version` is null when a "## " heading has no version. */
export function parseChangelogEntries(content) {
  const entries = [];
  for (const [index, line] of String(content).split(/\r?\n/).entries()) {
    if (!line.startsWith("## ")) continue;
    const match = CHANGELOG_VERSION_PATTERN.exec(line);
    entries.push({
      heading: line,
      line: index + 1,
      version: match ? `${match[1]}.${match[2]}.${match[3]}` : null,
      major: match ? Number(match[1]) : null,
      minor: match ? Number(match[2]) : null,
      patch: match ? Number(match[3]) : null,
    });
  }
  return entries;
}

/** Compares "x.y.z" strings numerically; returns negative, zero, or positive. */
export function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export function formatChangelogHeading(version, date) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version: ${version}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date (YYYY-MM-DD): ${date}`);
  return `## [${version}] - ${date}`;
}
