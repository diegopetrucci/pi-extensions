import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createReadToolDefinition } from '@earendil-works/pi-coding-agent';
import { getImageDimensions } from '@earendil-works/pi-tui';
import { repoRoot } from './workspace-package-helpers.mjs';

const illustrationExamplesDir = path.join(
  repoRoot,
  'extensions/illustrations-to-explain-things/skills/illustrations-to-explain-things/assets/examples',
);

const packageBudgets = [
  {
    label: 'root collection',
    args: ['pack', '--dry-run', '--json'],
    limits: {
      size: 1_350_000,
      // Bounded headroom for the approved subagent runtime audit fixes.
      unpackedSize: 2_125_000,
    },
  },
  {
    label: 'illustrations workspace',
    args: ['pack', '--dry-run', '--json', '--workspace', '@diegopetrucci/pi-illustrations-to-explain-things'],
    limits: {
      size: 900_000,
      unpackedSize: 900_000,
    },
  },
];

function readPackSummary(args) {
  const stdout = execFileSync('npm', args, { cwd: repoRoot, encoding: 'utf8' });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.length, 1, `expected one npm pack result for ${args.join(' ')}`);
  return parsed[0];
}

const readTool = createReadToolDefinition(repoRoot);

async function readImageAttachment(relativePath) {
  const result = await readTool.execute('test-read-webp', { path: relativePath }, undefined, undefined, undefined);

  assert.ok(Array.isArray(result.content), `${relativePath} should return tool content`);
  assert.equal(result.content.length, 2, `${relativePath} should return a text note and an image attachment`);
  assert.deepEqual(result.content[0], { type: 'text', text: 'Read image file [image/webp]' });
  assert.equal(result.content[1].type, 'image', `${relativePath} should return an image attachment`);
  assert.equal(result.content[1].mimeType, 'image/webp', `${relativePath} should stay a webp attachment`);

  return Buffer.from(result.content[1].data, 'base64');
}

test('illustration calibration assets stay runtime-readable and use compressed runtime-supported formats', async () => {
  const exampleFiles = readdirSync(illustrationExamplesDir).sort();

  assert.equal(exampleFiles.length, 14, 'expected the illustration skill to keep its 14 calibration examples');
  assert.ok(exampleFiles.every((file) => file.endsWith('.webp')), 'expected calibration assets to use .webp');

  for (const file of exampleFiles) {
    const relativePath = path.relative(repoRoot, path.join(illustrationExamplesDir, file));
    const originalBuffer = readFileSync(path.join(illustrationExamplesDir, file));
    const attachmentBuffer = await readImageAttachment(relativePath);
    const originalDimensions = getImageDimensions(originalBuffer, 'image/webp');
    const attachmentDimensions = getImageDimensions(attachmentBuffer, 'image/webp');

    assert.deepEqual(originalDimensions, { widthPx: 1672, heightPx: 941 }, `${file} should remain a 16:9 calibration image`);
    assert.deepEqual(attachmentDimensions, originalDimensions, `${file} attachment should preserve expected dimensions through read tool handling`);
  }
});

test('root and illustration packages stay within deterministic size budgets', () => {
  for (const packageBudget of packageBudgets) {
    const summary = readPackSummary(packageBudget.args);

    assert.ok(
      summary.size <= packageBudget.limits.size,
      `${packageBudget.label} packed size ${summary.size} exceeds budget ${packageBudget.limits.size}`,
    );
    assert.ok(
      summary.unpackedSize <= packageBudget.limits.unpackedSize,
      `${packageBudget.label} unpacked size ${summary.unpackedSize} exceeds budget ${packageBudget.limits.unpackedSize}`,
    );
  }
});

test('illustration package dry-run publishes compressed assets and excludes legacy png examples', () => {
  const summary = readPackSummary([
    'pack',
    '--dry-run',
    '--json',
    '--workspace',
    '@diegopetrucci/pi-illustrations-to-explain-things',
  ]);
  const publishedPaths = summary.files.map((file) => file.path).sort();
  const examplePaths = publishedPaths.filter((file) => file.startsWith('skills/illustrations-to-explain-things/assets/examples/'));

  assert.equal(examplePaths.length, 14, 'expected all calibration assets to remain published');
  assert.ok(examplePaths.every((file) => file.endsWith('.webp')), 'expected published calibration assets to be .webp');
  assert.deepEqual(
    examplePaths.filter((file) => file.endsWith('.png')),
    [],
    'expected illustration package to exclude legacy .png calibration assets',
  );
});
