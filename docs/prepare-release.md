# Release preparation

`scripts/prepare-release.mjs` performs deterministic release bookkeeping only. It cannot publish, use token helpers, commit, tag, push, or create a GitHub release itself. npm lifecycle scripts are disabled for every operation.

The tool discovers the root package and workspaces from the root `workspaces` configuration and derives package names from their manifests. It compares each local package artifact with the exact currently-versioned artifact on the pinned public registry. This makes packed untracked files and root/workspace overlap visible instead of relying on Git path prefixes.

## Changed-package detection

For each package, the tool first runs local and registry `npm pack --dry-run --json` checks with lifecycle scripts disabled and `--registry=https://registry.npmjs.org`. When the local `shasum` matches the registry `shasum`, that shasum fast path treats the package as unchanged without a tarball-payload comparison. A shasum mismatch (or missing local shasum) temporarily falls back to creating local and exact-version registry tarballs with `npm pack`, then comparing their decompressed tar payload bytes. This canonical comparison means gzip recompression alone does not select a package as changed.

The fallback downloads the exact-version tarball from the pinned registry, so dry-run requires network access to `https://registry.npmjs.org` when the registry baseline is checked and, on a shasum mismatch, when the canonical fallback runs. Each temporary tarball is limited to 8 MiB compressed and its decompressed payload to 16 MiB. Missing, malformed, oversized, or genuinely different payloads compare unequal and therefore remain changed. Temporary fallback directories are removed after comparison, including when comparison or `npm pack` fails.

Only exact npm not-found responses (`E404`/`404 Not Found`, or `ETARGET` with `No matching version found` from the initial registry check) mean an absent baseline. Other registry errors, including a non-zero canonical fallback tarball download, fail closed and abort the run rather than silently selecting or skipping a package.

## Input and dry-run

Create an explicit input file (for example `/tmp/release-input.json`):

```json
{
  "releaseVersion": "0.1.58",
  "versions": {
    "@diegopetrucci/pi-extensions": "0.1.58",
    "pi-dynamic-context-pruning": "0.1.2"
  },
  "fleetMarkers": {
    "pi-dynamic-context-pruning": "0.80.6"
  }
}
```

Every changed package must have an exact target version. Unknown package names and published target versions are rejected. When the changed root package is selected, omit `releaseVersion` to derive it from the root target or set the same exact version explicitly; when the root stays unchanged, `releaseVersion` remains independently required. `fleetMarkers` is optional and only applies in write mode.

Run the default dry-run:

```bash
npm run prepare-release -- --input /tmp/release-input.json
```

Dry-run makes no repository mutation: it does not write manifests, `package-lock.json`, fleet markers, or release documents. It does perform the pinned-registry checks described above and may create temporary fallback tarballs outside the repository before cleaning them up. The stable JSON report lists selected packages in internal dependency order (lexical tie-break, umbrella root last), target versions, packed/unpacked bytes, file counts, and document actions. A changed root may be selected alongside a changed workspace because each package's actual artifact is evaluated independently.

## Write mode

After reviewing the dry-run:

```bash
npm run prepare-release -- --input /tmp/release-input.json --write
```

Write mode updates only selected manifests and requested `.pi-fleet-tested-version` markers, creates missing release-notes/GitHub-body/announcement/checklist scaffolds, and runs:

```text
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
```

This lock synchronization step ignores npmrc registry configuration and always targets the pinned public registry. It then verifies the top-level lock version, root lock entry, and every local workspace lock entry against their manifests. All potentially touched manifests, lock metadata, requested markers, and document paths are snapshotted first; an install or verification failure restores their exact prior contents and removes files created by the failed run.

Existing generated documents are preserved byte-for-byte, so human prose is never overwritten. Each scaffold carries a managed package-evidence marker. Reusing the same document paths with a different ordered package/version set aborts before mutation rather than leaving stale release evidence. Keep that marker when editing prose. The generated GitHub body begins with a short factual summary followed by `Highlights`, `Packages`, and `Install`; it has no internal title. The generated checklist separates agent-safe follow-up actions (commit/tag/push/GitHub release outside this script) from the human-only trusted-publishing actions: dispatching `publish.yml`, inspecting its verified plan, and approving the protected `npm-release` environment deployment. Placeholders and checklist items deliberately do not claim validation or release work was completed.

Rerunning with identical input is idempotent. To undo a successful write mode, restore the affected manifests, `package-lock.json`, optional fleet markers, and newly created `docs/*-v<version>.md` files with your normal version-control workflow.
