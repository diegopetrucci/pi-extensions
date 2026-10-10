/**
 * Parity tests: every local resolveToCwd mirror must produce the same result
 * as Pi's resolveToCwd for a fixed corpus of path inputs.
 *
 * Mirrors tested: permission-gate (exported directly), code-reviewer,
 * triage-comments, agent-workflow-audit, librarian (all via __test__).
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

const piPathUtils = await import(
  pathToFileURL(
    path.join(
      repoRoot,
      "node_modules/@earendil-works/pi-coding-agent/dist/core/tools/path-utils.js",
    ),
  ).href
);
const piResolveToCwd = piPathUtils.resolveToCwd;

async function loadModule(relativePath) {
  const url = pathToFileURL(path.join(repoRoot, relativePath)).href;
  return import(url);
}

const pgMod = await loadModule("extensions/permission-gate/index.ts");
const crMod = await loadModule("extensions/code-reviewer/index.ts");
const tcMod = await loadModule("extensions/triage-comments/index.ts");
const awaMod = await loadModule("extensions/agent-workflow-audit/index.ts");
const libMod = await loadModule("extensions/librarian/index.ts");

/** All five mirrors keyed by name */
const mirrors = {
  "permission-gate": pgMod.resolveToCwd,
  "code-reviewer": crMod.__test__.resolveToCwd,
  "triage-comments": tcMod.__test__.resolveToCwd,
  "agent-workflow-audit": awaMod.__test__.resolveToCwd,
  librarian: libMod.__test__.resolveToCwd,
};

const CWD = "/some/project";

/**
 * Cases where all mirrors should agree with Pi's resolveToCwd.
 * Each entry is [description, rawPath, cwd].
 */
const parityCorpus = [
  ["plain relative", "foo.txt", CWD],
  ["plain relative nested", "a/b/c.ts", CWD],
  ["absolute path", "/tmp/foo.txt", CWD],
  ["absolute path at root", "/etc/hosts", CWD],
  ["@-prefixed relative", "@.env", CWD],
  ["@-prefixed absolute", "@/tmp/.env", CWD],
  ["tilde alone", "~", CWD],
  ["tilde slash file", "~/.env", CWD],
  ["tilde slash nested", "~/project/src/index.ts", CWD],
  ["file:// URL plain", "file:///tmp/safe.txt", CWD],
  ["file:// URL nested", "file:///home/user/docs/readme.md", CWD],
  ["percent-encoded file URL (.env)", `file:///tmp/${encodeURIComponent(".env")}`, CWD],
  ["percent-encoded file URL (dot)", `file:///tmp/%2Eenv`, CWD],
  ["unicode space in path (NBSP)", "/tmp/my\u00A0file.txt", CWD],
  ["unicode space in path (em-space)", "/tmp/my\u2003file.txt", CWD],
  ["unicode space in relative", "my\u00A0docs/note.txt", CWD],
  ["dot-relative", "./src/index.ts", CWD],
  ["empty string (resolves to cwd)", "", CWD],
  ["cwd with trailing slash", "foo.txt", "/project/"],
  // .. traversal cases
  ["parent traversal: ../x", "../x", CWD],
  ["double traversal: a/../../x", "a/../../x", CWD],
  ["triple traversal stays at root: ../../x", "../../x", CWD],
  ["file URL with .. segment", "file:///tmp/../tmp/safe.txt", CWD],
  ["absolute with .. in middle", "/some/project/../other/x.txt", CWD],
];

/** Cases that should throw in all mirrors (non-local file:// host) */
const throwingCorpus = [["non-local file URL host", "file://notlocalhost/.env", CWD]];

for (const [description, rawPath, cwd] of parityCorpus) {
  test(`parity: ${description}`, () => {
    const expected = piResolveToCwd(rawPath, cwd);
    for (const [name, mirror] of Object.entries(mirrors)) {
      assert.equal(
        mirror(rawPath, cwd),
        expected,
        `${name} mirror produced different result for "${description}"`,
      );
    }
  });
}

for (const [description, rawPath, cwd] of throwingCorpus) {
  test(`parity (throws): ${description}`, () => {
    assert.throws(() => piResolveToCwd(rawPath, cwd), { name: "TypeError" });
    for (const [name, mirror] of Object.entries(mirrors)) {
      assert.throws(
        () => mirror(rawPath, cwd),
        { name: "TypeError" },
        `${name} mirror should throw for "${description}"`,
      );
    }
  });
}
