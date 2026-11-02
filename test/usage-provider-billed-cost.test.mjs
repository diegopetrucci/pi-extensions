import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import ts from "typescript";

import { accumulateAssistantMessages } from "./support/usage-accumulator.mjs";
import { loadRoleTestUtils } from "./support/provider-policy-contract-support.mjs";

const tempDirs = [];

test.after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function loadExtensionTestUtils(name) {
  const source = await readFile(path.resolve(`extensions/${name}/index.ts`), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = await mkdtemp(path.join(path.resolve("test"), `.tmp-usage-${name}-`));
  tempDirs.push(dir);
  const file = path.join(dir, "index.mjs");
  await writeFile(file, compiled, "utf8");
  return (await import(pathToFileURL(file).href)).__test__;
}

function usageRecord(total, totalFromProvider) {
  return {
    input: 1,
    output: 2,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 3,
    cost: {
      input: total / 2,
      output: total / 2,
      cacheRead: 0,
      cacheWrite: 0,
      total,
      ...(totalFromProvider === undefined ? {} : { totalFromProvider }),
    },
  };
}

const assistant = (usage) => ({ role: "assistant", usage });

const subprocessExtensions = [
  "code-reviewer",
  "developer",
  "diff-summarizer",
  "librarian",
  "repo-scout",
  "test-runner",
  "triage-comments",
  "web-scout",
];

for (const name of subprocessExtensions) {
  test(`${name} propagates provider-billed cost only when every record is billed`, async () => {
    const { createEmptyUsage, addSessionEventUsage } = await loadExtensionTestUtils(name);
    const run = (records) =>
      accumulateAssistantMessages(createEmptyUsage, addSessionEventUsage, records.map(assistant));

    const allBilled = run([usageRecord(1, true), usageRecord(2, true)]);
    assert.equal(allBilled.cost.totalFromProvider, true);
    assert.equal(allBilled.cost.total, 3);

    for (const records of [
      [usageRecord(1, true), usageRecord(2, false)],
      [usageRecord(1, false), usageRecord(2, true)],
      [usageRecord(1, true), usageRecord(2)],
      [usageRecord(1)],
      [usageRecord(1, true), { ...usageRecord(2), cost: undefined }, usageRecord(4, true)],
    ]) {
      const mixed = run(records);
      assert.equal("totalFromProvider" in mixed.cost, false);
    }
    const mixedTotal = run([usageRecord(1, true), usageRecord(2, false), usageRecord(4, true)]);
    assert.equal(mixedTotal.cost.total, 7);
    assert.equal(mixedTotal.totalTokens, 9);

    const empty = run([]);
    assert.equal("totalFromProvider" in empty.cost, false);
    assert.equal(empty.cost.total, 0);
  });
}

for (const role of ["oracle", "contrarian"]) {
  test(`${role} propagates provider-billed cost through usage stats`, async () => {
    const { createEmptyUsage, addUsageStats, mergeUsageStats, usageStatsToToolUsage } =
      await loadRoleTestUtils(role);
    const run = (records) => {
      const stats = createEmptyUsage();
      for (const record of records) addUsageStats(stats, record);
      return stats;
    };
    const emit = (stats) => usageStatsToToolUsage(stats).cost;

    const billed = emit(run([usageRecord(1, true), usageRecord(2, true)]));
    assert.equal(billed.totalFromProvider, true);
    assert.equal(billed.total, 3);

    const mixed = emit(run([usageRecord(1, true), usageRecord(2, false), usageRecord(4, true)]));
    assert.equal("totalFromProvider" in mixed, false);
    assert.equal(mixed.total, 7);
    assert.equal("totalFromProvider" in emit(run([usageRecord(1)])), false);

    const empty = emit(run([]));
    assert.equal("totalFromProvider" in empty, false);
    assert.equal(empty.total, 0);

    // Merging attempts: empty attempts do not poison the flag; unbilled ones clear it.
    const merged = createEmptyUsage();
    mergeUsageStats(merged, run([]));
    mergeUsageStats(merged, run([usageRecord(1, true)]));
    mergeUsageStats(merged, run([usageRecord(2, true)]));
    assert.equal(emit(merged).totalFromProvider, true);
    assert.equal(emit(merged).total, 3);
    mergeUsageStats(merged, run([usageRecord(4, false)]));
    assert.equal("totalFromProvider" in emit(merged), false);
    assert.equal(emit(merged).total, 7);
  });
}
