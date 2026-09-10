import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { listOvertureNormalizationBaselinesForTest as list } from './overture-normalization-baselines.mjs';
async function fixture(t) {
  const parent = path.join(APP_ROOT, 'data/tmp/normalization-baseline-list-tests'), root = path.join(parent, randomUUID());
  await mkdir(root, { recursive: true });
  t.after(async () => { assert.equal(path.dirname(root), parent); await rm(root, { recursive: true, force: true }); });
  return root;
}
async function manifest(root, name, extra = {}) {
  await mkdir(path.join(root, name));
  const raw = JSON.stringify({ dataset_id: 'census-zbp-baseline', release_id: name, status: 'published', complete_national_release: true, reference_year: 2023, ...extra });
  await writeFile(path.join(root, name, 'manifest.json'), raw); return createHash('sha256').update(raw).digest('hex');
}
test('baseline choices expose exact manifest hashes, never artifact or publisher verification', async t => {
  const root = await fixture(t), sha = await manifest(root, 'release-a');
  const result = await list(root);
  assert.deepEqual(result, { baselines: [{ releaseId: 'release-a', sha256: sha, referenceYear: 2023 }], unavailable: 0, truncated: false, verification: 'manifest-only' });
});
test('baseline choices separate missing and invalid releases and cap directory scanning', async t => {
  const root = await fixture(t);
  assert.deepEqual((await list(path.join(root, 'missing'))).baselines, []);
  await manifest(root, 'wrong', { release_id: 'other' });
  await manifest(root, 'pending', { status: 'staging' });
  assert.equal((await list(root)).unavailable, 2);
  for (let i = 0; i < 35; i++) await manifest(root, `release-${i}`);
  const result = await list(root); assert.equal(result.truncated, true);
  assert.equal(result.baselines.length + result.unavailable, 32);
});
