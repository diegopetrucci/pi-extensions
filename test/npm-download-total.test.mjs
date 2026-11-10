import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWindows,
  collectPackageNames,
  computeTotal,
  encodePackageName,
  formatMessage,
  getPackageDownloads,
} from "../scripts/npm-download-total.mjs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const res = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
const noSleep = { sleep: async () => {} };

test("buildWindows chunks without overlap or gaps", () => {
  assert.deepEqual(buildWindows("2025-01-01", "2025-01-01"), [
    { start: "2025-01-01", end: "2025-01-01" },
  ]);
  const w = buildWindows("2020-01-01", "2023-01-01");
  assert.equal(w[0].start, "2020-01-01");
  assert.equal(w[0].end, "2021-06-23"); // 540 days inclusive
  assert.equal(w[1].start, "2021-06-24");
  assert.equal(w.at(-1).end, "2023-01-01");
  assert.equal(buildWindows("2020-01-01", "2021-06-23").length, 1);
  assert.equal(buildWindows("2020-01-01", "2021-06-24").length, 2);
});

test("encodePackageName encodes scoped names only", () => {
  assert.equal(encodePackageName("@a/b"), "@a%2Fb");
  assert.equal(encodePackageName("plain"), "plain");
});

test("formatMessage is compact lowercase", () => {
  assert.equal(formatMessage(999), "999");
  assert.equal(formatMessage(1000), "1k");
  assert.equal(formatMessage(132568), "132.6k");
  assert.equal(formatMessage(2_500_000), "2.5m");
  assert.equal(formatMessage(999_949), "999.9k");
  assert.equal(formatMessage(999_950), "1m");
  assert.equal(formatMessage(999_949_999), "999.9m");
  assert.equal(formatMessage(999_950_000), "1b");
});

test("sums across windows and encodes scoped names", async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    if (url.startsWith("https://registry"))
      return res(200, { time: { created: "2020-01-01T10:00:00Z" } });
    return res(200, { downloads: 10 });
  };
  const n = await getPackageDownloads("@s/p", { fetch, today: "2023-01-01" });
  assert.equal(n, 30);
  assert.equal(urls[0], "https://registry.npmjs.org/@s%2Fp");
  assert.equal(urls[1], "https://api.npmjs.org/downloads/point/2020-01-01:2021-06-23/@s%2Fp");
});

test("404 registry counts 0; other errors throw; 5xx retried", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await getPackageDownloads("x", { fetch: async () => res(404) }), 0);
  } finally {
    console.warn = warn;
  }
  await assert.rejects(getPackageDownloads("x", { fetch: async () => res(403), ...noSleep }));
  let calls = 0;
  const fetch = async (url) => {
    if (url.startsWith("https://registry")) return res(200, { time: { created: "2025-01-01" } });
    return ++calls < 3 ? res(503) : res(200, { downloads: 5 });
  };
  assert.equal(await getPackageDownloads("x", { fetch, today: "2025-02-01", ...noSleep }), 5);
  await assert.rejects(
    computeTotal(["a"], { fetch: async () => res(500), retries: 1, ...noSleep }),
  );
});

test("any 5xx (e.g. 520) is retried then succeeds", async () => {
  let calls = 0;
  const fetch = async (url) => {
    if (url.startsWith("https://registry")) return res(200, { time: { created: "2025-01-01" } });
    return ++calls < 2 ? res(520) : res(200, { downloads: 7 });
  };
  assert.equal(await getPackageDownloads("x", { fetch, today: "2025-02-01", ...noSleep }), 7);
  assert.equal(calls, 2);
});

test("collectPackageNames skips private and dedupes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "npmdl-"));
  const put = async (dir, pkg) => {
    await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(path.join(root, dir, "package.json"), JSON.stringify(pkg));
  };
  await put(".", { name: "root" });
  await put("extensions/a", { name: "a" });
  await put("extensions/b", { name: "a" });
  await put("extensions/c", { name: "c", private: true });
  assert.deepEqual((await collectPackageNames(root)).sort(), ["a", "root"]);
});

test("computeTotal sums packages", async () => {
  const fetch = async (url) =>
    url.startsWith("https://registry")
      ? res(200, { time: { created: "2025-01-01" } })
      : res(200, { downloads: 7 });
  const r = await computeTotal(["a", "b"], { fetch, today: "2025-01-02" });
  assert.equal(r.total, 14);
});
