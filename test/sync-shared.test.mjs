import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generatedCopy, main, SYNC_PAIRS, syncShared } from "../scripts/sync-shared.mjs";

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-sync-shared-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const pair of SYNC_PAIRS) {
    const sourcePath = path.join(root, pair.source);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, `fixture source for ${pair.source}\n`, "utf8");
  }
  return root;
}

async function readMaybe(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function snapshotDestinations(root) {
  return new Map(
    await Promise.all(
      SYNC_PAIRS.map(async (pair) => [
        pair.destination,
        await readMaybe(path.join(root, pair.destination)),
      ]),
    ),
  );
}

test("syncShared generates all allowlisted copies, is idempotent, and passes check mode", async (t) => {
  const root = await createFixture(t);

  const first = await syncShared({ root });
  assert.deepEqual(
    first.changed,
    SYNC_PAIRS.map((pair) => pair.destination),
  );
  assert.deepEqual(first.issues, []);

  for (const pair of SYNC_PAIRS) {
    const canonical = await readFile(path.join(root, pair.source), "utf8");
    const generated = await readFile(path.join(root, pair.destination), "utf8");
    assert.equal(generated, generatedCopy(pair.source, canonical));
  }

  const knownMtime = new Date("2000-01-01T00:00:00.000Z");
  await Promise.all(
    SYNC_PAIRS.map(async (pair) =>
      utimes(path.join(root, pair.destination), knownMtime, knownMtime),
    ),
  );
  const beforeStats = await Promise.all(
    SYNC_PAIRS.map(async (pair) => stat(path.join(root, pair.destination))),
  );
  const beforeMtimes = beforeStats.map(({ mtimeMs }) => mtimeMs);
  assert.notEqual(beforeMtimes[0], undefined);

  const second = await syncShared({ root });
  assert.deepEqual(second.changed, []);
  assert.deepEqual(second.issues, []);
  const afterStats = await Promise.all(
    SYNC_PAIRS.map(async (pair) => stat(path.join(root, pair.destination))),
  );
  assert.deepEqual(
    afterStats.map(({ mtimeMs }) => mtimeMs),
    beforeMtimes,
    "identical copies should not be rewritten",
  );

  const stdout = [];
  const stderr = [];
  assert.equal(
    await main(["--check"], {
      root,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    }),
    0,
  );
  assert.deepEqual(stderr, []);
  assert.deepEqual(stdout, ["Shared copies are synchronized."]);
});

test("check mode reports stale and missing copies without mutating the fixture", async (t) => {
  const root = await createFixture(t);
  await syncShared({ root });

  const stalePair = SYNC_PAIRS[0];
  const missingPair = SYNC_PAIRS[1];
  await writeFile(path.join(root, stalePair.destination), "stale fixture copy\n", "utf8");
  await rm(path.join(root, missingPair.destination));
  const before = await snapshotDestinations(root);

  const result = await syncShared({ root, check: true });
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.issues, [
    `stale generated copy: ${stalePair.destination}`,
    `missing generated copy: ${missingPair.destination}`,
  ]);
  assert.deepEqual(await snapshotDestinations(root), before);

  const stdout = [];
  const stderr = [];
  assert.equal(
    await main(["--check"], {
      root,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    }),
    1,
  );
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, result.issues);
  assert.deepEqual(await snapshotDestinations(root), before);
});
