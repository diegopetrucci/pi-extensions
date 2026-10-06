import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
];

function compareByCodePoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function findRoot(start) {
  let current = path.resolve(start);
  while (true) {
    const manifestPath = path.join(current, "package.json");
    if (await exists(manifestPath)) {
      const manifest = await readJson(manifestPath);
      if (manifest.workspaces) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Could not find a workspace root from ${start}`);
    current = parent;
  }
}

function workspacePatterns(manifest) {
  if (Array.isArray(manifest.workspaces)) return manifest.workspaces;
  if (Array.isArray(manifest.workspaces?.packages)) return manifest.workspaces.packages;
  return [];
}

export async function walkDirectories(base) {
  const result = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") continue;
    const child = path.join(base, entry.name);
    result.push(child, ...(await walkDirectories(child)));
  }
  return result;
}

export function globRegex(pattern) {
  const escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${escaped.replace(/\/$/, "")}$`);
}

export async function discoverPackages(root) {
  const rootManifest = await readJson(path.join(root, "package.json"));
  const directories = await walkDirectories(root);
  const matches = [];
  for (const pattern of workspacePatterns(rootManifest)) {
    const regex = globRegex(pattern);
    for (const directory of directories) {
      const relative = path.relative(root, directory).split(path.sep).join("/");
      if (!regex.test(relative) || !(await exists(path.join(directory, "package.json")))) continue;
      matches.push(directory);
    }
  }
  const packages = [
    { name: rootManifest.name, root, relative: ".", manifest: rootManifest, umbrella: true },
  ];
  for (const directory of [...new Set(matches)].sort()) {
    const manifest = await readJson(path.join(directory, "package.json"));
    if (!manifest.name || !manifest.version)
      throw new Error(`${path.relative(root, directory)}/package.json needs name and version`);
    packages.push({
      name: manifest.name,
      root: directory,
      relative: path.relative(root, directory).split(path.sep).join("/"),
      manifest,
      umbrella: false,
    });
  }
  return packages;
}

export function releaseOrder(selected) {
  const selectedNames = new Set(selected.map((pkg) => pkg.name));
  const outgoing = new Map(selected.map((pkg) => [pkg.name, new Set()]));
  const indegree = new Map(selected.map((pkg) => [pkg.name, 0]));
  for (const pkg of selected) {
    const internalDependencies = new Set(
      DEPENDENCY_SECTIONS.flatMap((section) => Object.keys(pkg.manifest[section] ?? {})).filter(
        (dependency) => selectedNames.has(dependency),
      ),
    );
    for (const dependency of internalDependencies) {
      outgoing.get(dependency).add(pkg.name);
      indegree.set(pkg.name, indegree.get(pkg.name) + 1);
    }
  }
  const ordered = [];
  while (ordered.length < selected.length) {
    const available = selected
      .filter((pkg) => !ordered.includes(pkg) && indegree.get(pkg.name) === 0 && !pkg.umbrella)
      .sort((a, b) => compareByCodePoint(a.name, b.name));
    if (available.length === 0) {
      const umbrella = selected.find(
        (pkg) => pkg.umbrella && !ordered.includes(pkg) && indegree.get(pkg.name) === 0,
      );
      if (!umbrella) throw new Error("Internal package dependency cycle detected");
      available.push(umbrella);
    }
    for (const pkg of available) {
      ordered.push(pkg);
      for (const dependent of outgoing.get(pkg.name) ?? [])
        indegree.set(dependent, indegree.get(dependent) - 1);
    }
  }
  const umbrella = ordered.find((pkg) => pkg.umbrella);
  return umbrella ? [...ordered.filter((pkg) => !pkg.umbrella), umbrella] : ordered;
}

export function isExactNotFound(result) {
  if (result.code === 0) return false;
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  const codes = [
    ...output.matchAll(
      /(?:npm\s+(?:(?:error|ERR!)\s+)?code\s+|["']code["']\s*:\s*["'])(E[0-9A-Z]+)/gim,
    ),
  ].map((match) => match[1].toUpperCase());
  const hasOnly404Codes = codes.length > 0 && codes.every((code) => code === "E404");
  const hasOnlyTargetCodes =
    codes.length > 0 &&
    codes.every((code) => code === "ETARGET") &&
    /No matching version found/i.test(output);
  return (hasOnly404Codes || hasOnlyTargetCodes) && !/\b(?!404\b)[45]\d\d\b/.test(output);
}
