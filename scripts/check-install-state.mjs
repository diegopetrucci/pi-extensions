#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lockPath = path.join(root, "package-lock.json");

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isOptionalPackage(packageInfo) {
	return packageInfo.optional === true || packageInfo.devOptional === true;
}

function packageJsonPathFromLockPath(lockPackagePath) {
	return path.join(root, lockPackagePath, "package.json");
}

const lock = readJson(lockPath);
const packages = lock.packages ?? {};
const mismatches = [];
const missing = [];
let checked = 0;
let skippedOptionalMissing = 0;

for (const [lockPackagePath, packageInfo] of Object.entries(packages)) {
	if (!lockPackagePath.startsWith("node_modules/")) continue;
	if (packageInfo.link) continue;
	if (!packageInfo.version) continue;

	const installedPackageJsonPath = packageJsonPathFromLockPath(lockPackagePath);
	if (!fs.existsSync(installedPackageJsonPath)) {
		if (isOptionalPackage(packageInfo)) {
			skippedOptionalMissing += 1;
			continue;
		}
		missing.push({ name: lockPackagePath.replace(/^node_modules\//, ""), expected: packageInfo.version });
		continue;
	}

	const installed = readJson(installedPackageJsonPath);
	checked += 1;
	if (installed.version !== packageInfo.version) {
		mismatches.push({
			name: installed.name ?? lockPackagePath.replace(/^node_modules\//, ""),
			expected: packageInfo.version,
			actual: installed.version ?? "(missing version)",
		});
	}
}

if (missing.length || mismatches.length) {
	console.error("Installed dependency state does not match package-lock.json. Run `npm ci`, then rerun this check.\n");
	for (const item of missing) {
		console.error(`missing: ${item.name} expected ${item.expected}`);
	}
	for (const item of mismatches) {
		console.error(`mismatch: ${item.name} installed ${item.actual}, lockfile ${item.expected}`);
	}
	process.exit(1);
}

console.log(`Installed dependency state matches package-lock.json (${checked} packages checked${skippedOptionalMissing ? `, ${skippedOptionalMissing} optional packages not installed` : ""}).`);
