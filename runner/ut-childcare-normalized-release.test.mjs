import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, writeFile, rm, mkdtemp, lstat, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {buildUtChildcareNormalizedRelease, verifyUtChildcareNormalizedRelease, assertUtNormalizedSnapshot} from './ut-childcare-normalized-release.mjs';
test('UT publication snapshot rejects an earlier artifact changed after its read', async () => {
  const parent = path.join(APP_ROOT, 'data/tmp'); await mkdir(parent, {recursive: true});
  const directory = await mkdtemp(path.join(parent, 'ut-publication-snapshot-'));
  try {
    const snapshots = new Map();
    for (const file of ['normalized.jsonl', 'summary.json', 'manifest.tmp']) {
      await writeFile(path.join(directory, file), '{}\n');
      snapshots.set(file, {identity: await lstat(path.join(directory, file), {bigint: true}), bytes: 3,
        sha256: createHash('sha256').update('{}\n').digest('hex')});
    }
    const snapshot = {directoryIdentity: await lstat(directory, {bigint: true}), snapshots};
    await assertUtNormalizedSnapshot(directory, snapshot);
    await writeFile(path.join(directory, 'normalized.jsonl'), '[]\n');
    await assert.rejects(assertUtNormalizedSnapshot(directory, snapshot), /release rejected/);
  } finally { await rm(directory, {recursive: true, force: true}); }
});
test('UT normalized release rejects unknown options and pre-cancel', async () => {
  await assert.rejects(buildUtChildcareNormalizedRelease({source: 'arbitrary'}), /release rejected/);
  await assert.rejects(buildUtChildcareNormalizedRelease({signal: AbortSignal.abort()}), {name: 'AbortError'});
  await assert.rejects(verifyUtChildcareNormalizedRelease('relative/manifest.json'), /verification failed/);
});
test('UT retained September release replays under its exact historical implementation inventory', async () => {
  const manifest = path.join(APP_ROOT, 'data/business-sources/ut-childcare/normalized/6aaca68b-f0cc-4ada-a301-0ada860574b8/manifest.json');
  const result = await verifyUtChildcareNormalizedRelease(manifest);
  assert.equal(result.manifest_sha256, '1ff46a94e79a75629707438492f0caa6e9cbc8961fa282748406d38f0c2aec43');
  assert.equal(result.summary.accepted_records, 422);
  assert.equal(result.artifacts.find(row => row.path === 'normalized.jsonl')?.sha256,
    '6212861a181acbf3560da6b51bfb926a4b499bbd6077b67046cd8418e413fe6b');
  assert.equal(result.claims.current_operations_verified, false);
  assert.equal(result.claims.public_export_authorized, false);
});
test('UT source-linked normalized release replays records, rejects tampering and conserves internal gaps',
  {skip: process.env.DATAHUB_TEST_APP_PDF !== '1'}, async () => {
    const result = await buildUtChildcareNormalizedRelease();
    const directory = path.dirname(result.manifest_path);
    try {
      assert.equal(result.summary.accepted_records, 422);
      assert.equal(result.summary.accepted_with_zip5, 422);
      assert.equal(result.summary.accepted_with_zip4, 0);
      assert.equal(result.summary.accepted_with_points, 0);
      assert.equal(result.claims.retained_origin_linkage_verified, true);
      assert.equal(result.claims.current_operations_verified, false);
      const file = path.join(directory, 'normalized.jsonl'), original = await readFile(file);
      const rows = original.toString().trim().split('\n').map(line => JSON.parse(line));
      assert.equal(rows.length, 422);
      for (const row of rows) {
        assert.equal(row.reported_address.address_role, null);
        assert.equal(row.reported_address.zip4, null);
        assert.equal(row.source_status.active_business_verified, false);
        assert.equal(row.export_policy, 'internal');
      }
      rows[0].business_name = 'Synthetic tamper';
      await writeFile(file, rows.map(row => JSON.stringify(row) + '\n').join(''));
      await assert.rejects(verifyUtChildcareNormalizedRelease(result.manifest_path), /verification failed/);
      await writeFile(file, original);
      const manifest = JSON.parse(await readFile(result.manifest_path, 'utf8'));
      manifest.claims.current_operations_verified = true;
      await writeFile(result.manifest_path, JSON.stringify(manifest) + '\n');
      await assert.rejects(verifyUtChildcareNormalizedRelease(result.manifest_path), /verification failed/);
    } finally { await rm(directory, {recursive: true, force: true}); }
  });
