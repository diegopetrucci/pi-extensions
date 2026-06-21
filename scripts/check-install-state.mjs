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
	return lockPackagePath ? path.join(root, lockPackagePath, "package.json") : path.join(root, "package.json");
}

function packageNameFromLockPath(lockPackagePath) {
	if (!lockPackagePath) return "root package";
	return lockPackagePath.replace(/^node_modules\//, "");
}

let lock;
try {
	lock = readJson(lockPath);
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Could not read package-lock.json at ${lockPath}: ${message}`);
	console.error("Run `npm install` or `npm ci` first, then rerun this check.");
	process.exit(1);
}

if (!lock.lockfileVersion || lock.lockfileVersion < 2 || !lock.packages) {
	console.error("Cannot verify install state: package-lock.json must be lockfileVersion 2 or newer with a packages table.");
	console.error("Regenerate the lockfile with a modern npm version, then rerun this check.");
	process.exit(1);
}

const packages = lock.packages;
const mismatches = [];
const missing = [];
let checkedInstalled = 0;
let checkedLocalPackages = 0;
let skippedOptionalMissing = 0;

for (const [lockPackagePath, packageInfo] of Object.entries(packages)) {
	if (packageInfo.link) continue;
	if (!packageInfo.version) continue;

	const packageJsonPath = packageJsonPathFromLockPath(lockPackagePath);
	if (!fs.existsSync(packageJsonPath)) {
		if (lockPackagePath.startsWith("node_modules/") && isOptionalPackage(packageInfo)) {
			skippedOptionalMissing += 1;
			continue;
		}
		missing.push({ name: packageNameFromLockPath(lockPackagePath), expected: packageInfo.version });
		continue;
	}

	const actualPackage = readJson(packageJsonPath);
	if (lockPackagePath.startsWith("node_modules/")) checkedInstalled += 1;
	else checkedLocalPackages += 1;

	if (actualPackage.version !== packageInfo.version) {
		mismatches.push({
			name: actualPackage.name ?? packageNameFromLockPath(lockPackagePath),
			expected: packageInfo.version,
			actual: actualPackage.version ?? "(missing version)",
		});
	}
}

if (missing.length || mismatches.length) {
	console.error("Package state does not match package-lock.json. Run `npm ci` or refresh package-lock.json, then rerun this check.\n");
	for (const item of missing) {
		console.error(`missing: ${item.name} expected ${item.expected}`);
	}
	for (const item of mismatches) {
		console.error(`mismatch: ${item.name} package.json ${item.actual}, lockfile ${item.expected}`);
	}
	process.exit(1);
}

console.log(
	`Package state matches package-lock.json (${checkedInstalled} installed packages and ${checkedLocalPackages} local package entries checked${
		skippedOptionalMissing ? `, ${skippedOptionalMissing} optional packages not installed` : ""
	}).`,
);
