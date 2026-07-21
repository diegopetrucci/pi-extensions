# Release preparation

`scripts/prepare-release.mjs` performs deterministic release bookkeeping only. It cannot publish, use token helpers, commit, tag, push, or create a GitHub release itself. npm lifecycle scripts are disabled for every operation.

The tool discovers the root package and workspaces from the root `workspaces` configuration and derives package names from their manifests. It compares each local `npm pack --dry-run --json` artifact with the exact currently-versioned artifact on the pinned public registry. This makes packed untracked files and root/workspace overlap visible instead of relying on Git path prefixes. Only exact npm not-found responses (`E404`/`404 Not Found`, or `ETARGET` with `No matching version found` from `npm pack`) mean absent; other registry failures stop the run.

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

Run the default, non-mutating dry-run:

```bash
npm run prepare-release -- --input /tmp/release-input.json
```

The stable JSON report lists selected packages in internal dependency order (lexical tie-break, umbrella root last), target versions, packed/unpacked bytes, file counts, and document actions. A changed root may be selected alongside a changed workspace because each package's actual artifact is evaluated independently.

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

Existing generated documents are preserved byte-for-byte, so human prose is never overwritten. Each scaffold carries a managed package-evidence marker. Reusing the same document paths with a different ordered package/version set aborts before mutation rather than leaving stale release evidence. Keep that marker when editing prose. The generated GitHub body begins with a short factual summary followed by `Highlights`, `Packages`, and `Install`; it has no internal title. The generated checklist separates agent-safe follow-up actions (commit/tag/push/GitHub release outside this script) from the sole human-only action (`npm publish`, which this script cannot perform). Placeholders and checklist items deliberately do not claim validation or release work was completed.

Rerunning with identical input is idempotent. To undo a successful write mode, restore the affected manifests, `package-lock.json`, optional fleet markers, and newly created `docs/*-v<version>.md` files with your normal version-control workflow.
