#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_WINDOW_DAYS = 540;
const DAY_MS = 86_400_000;
const isRetryable = (status) => status === 429 || (status >= 500 && status < 600);

export function encodePackageName(name) {
  return name.startsWith("@") ? name.replace("/", "%2F") : name;
}

const toDate = (ms) => new Date(ms).toISOString().slice(0, 10);

export function buildWindows(startDate, endDate, maxDays = MAX_WINDOW_DAYS) {
  let cursor = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const windows = [];
  while (cursor <= end) {
    const windowEnd = Math.min(cursor + (maxDays - 1) * DAY_MS, end);
    windows.push({ start: toDate(cursor), end: toDate(windowEnd) });
    cursor = windowEnd + DAY_MS;
  }
  return windows;
}

export function formatMessage(total) {
  if (total < 1000) return String(total);
  const units = [
    [1e9, "b"],
    [1e6, "m"],
    [1e3, "k"],
  ];
  for (const [i, [size, suffix]] of units.entries()) {
    if (total >= size) {
      const value = Math.round((total / size) * 10) / 10;
      if (value >= 1000 && i > 0) return `1${units[i - 1][1]}`;
      return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
    }
  }
  return String(total);
}

export async function collectPackageNames(root) {
  const manifests = [path.join(root, "package.json")];
  const extDir = path.join(root, "extensions");
  for (const entry of await readdir(extDir, { withFileTypes: true })) {
    if (entry.isDirectory()) manifests.push(path.join(extDir, entry.name, "package.json"));
  }
  const names = new Set();
  for (const file of manifests) {
    let pkg;
    try {
      pkg = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (pkg.private === true || !pkg.name) continue;
    names.add(pkg.name);
  }
  return [...names];
}

async function fetchJson(url, fetchImpl, { retries = 3, delayMs = 500, sleep } = {}) {
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url);
    if (response.status === 404) return null;
    if (response.ok) return response.json();
    if (isRetryable(response.status) && attempt < retries) {
      await wait(delayMs * 2 ** attempt);
      continue;
    }
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
}

export async function getPackageDownloads(name, { fetch: fetchImpl = fetch, today, ...opts } = {}) {
  const encoded = encodePackageName(name);
  const meta = await fetchJson(`https://registry.npmjs.org/${encoded}`, fetchImpl, opts);
  if (!meta) {
    console.warn(`warning: ${name} not found on npm registry; counting 0`);
    return 0;
  }
  const created = meta.time?.created;
  if (!created || Number.isNaN(Date.parse(created))) {
    throw new Error(`Missing time.created for ${name}`);
  }
  const end = today ?? toDate(Date.now());
  const start = toDate(Date.parse(created));
  let sum = 0;
  for (const window of buildWindows(start, end)) {
    const data = await fetchJson(
      `https://api.npmjs.org/downloads/point/${window.start}:${window.end}/${encoded}`,
      fetchImpl,
      opts,
    );
    if (!data) throw new Error(`Downloads API returned 404 for ${name}`);
    if (!Number.isFinite(data.downloads)) throw new Error(`Invalid downloads for ${name}`);
    sum += data.downloads;
  }
  return sum;
}

export async function computeTotal(names, options = {}) {
  const counts = [];
  let total = 0;
  for (const name of names) {
    const downloads = await getPackageDownloads(name, options);
    counts.push({ name, downloads });
    total += downloads;
  }
  return { counts, total };
}

export function buildBadge(total) {
  return {
    schemaVersion: 1,
    label: "total npm downloads",
    message: formatMessage(total),
    color: "brightgreen",
  };
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const idx = argv.indexOf("--output");
  const output = idx === -1 ? undefined : argv[idx + 1];
  if (idx !== -1 && !output) throw new Error("--output requires a path");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const names = await collectPackageNames(root);
  const { counts, total } = await computeTotal(names, options);
  for (const { name, downloads } of counts) console.log(`${name}: ${downloads}`);
  console.log(`total: ${total} across ${counts.length} packages`);
  if (output) {
    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await writeFile(output, `${JSON.stringify(buildBadge(total))}\n`);
  }
  return total;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
