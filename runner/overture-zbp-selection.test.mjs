import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, rm, readFile, link } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { verifyOvertureZbpSelection as verify, validateOvertureZbpSelection as validate } from './overture-zbp-selection.mjs';
import { buildOvertureUsPlaces, OVERTURE_SELECTED_FIELDS } from './overture-us-places.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = path.join(APP_ROOT, 'data/tmp/overture-zbp-selection-tests', randomUUID());
  await mkdir(path.join(root, 'derived'), { recursive: true });
  t.after(async () => { assert.equal(path.dirname(root), path.join(APP_ROOT, 'data/tmp/overture-zbp-selection-tests')); await rm(root, { recursive: true, force: true }); });
  const artifacts = [];
  async function artifact(name, bytes, extra) { await writeFile(path.join(root, name), bytes); artifacts.push({ path: name, bytes: bytes.length, sha256: hash(bytes), ...extra }); }
  await artifact('derived/zip-coverage.jsonl', Buffer.from(JSON.stringify({ zip_code: '60601', coverage_status: 'zbp-and-zcta', current_usps_validity: { status: 'unverified' } }) + '\n'), { record_count: 1 });
  await artifact('derived/naics-coverage.jsonl', Buffer.alloc(0), { record_count: 0 });
  // Empty structural detail fixtures; no claim to represent a real Census release.
  for (let i = 0; i < 10; i++) await artifact(`derived/detail-${i}.gz`, gzipSync(''), { record_count: 0, artifact_type: 'normalized-zbp-naics-csv-gzip' });
  const manifest = { dataset_id: 'census-zbp-baseline', release_id: 'synthetic-zbp', status: 'published', complete_national_release: true, reference_year: 2023, artifacts,
    coverage: { union_zip_codes: 1, zbp_and_zcta: 1, zbp_without_zcta: 0, zcta_without_published_zbp: 0, published_naics_codes: 0, industry_detail_rows: 0 } };
  const selected = { manifest: path.join(root, 'manifest.json'), sha256: '' };
  async function save() { const raw = JSON.stringify(manifest); await writeFile(selected.manifest, raw); selected.sha256 = hash(raw); }
  await save(); return { root, manifest, selected, save };
}
test('pinned baseline validates complete retained artifacts without consulting a pointer', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'current.json'), 'invalid pointer deliberately unused');
  assert.equal((await verify(f.selected)).verification.coverage.union_zip_codes, 1);
  const source = Object.fromEntries(OVERTURE_SELECTED_FIELDS.map(k => [k, null]));
  Object.assign(source, { id: '11111111-1111-4111-8111-111111111111', version: 1, primary_name: 'Synthetic', taxonomy_primary: 'cafe', taxonomy_hierarchy: ['food_and_drink', 'cafe'], address_country: 'US', address_postcode: '60601', latitude: 0, longitude: 0, sources: [{ dataset: 'meta', record_id: 'fixture' }] });
  const built = await buildOvertureUsPlaces({ outputRoot: path.join(APP_ROOT, 'data/tmp/overture-zbp-selection-tests', randomUUID()), zbpSelection: f.selected,
    sourceRecords: [source], sourceMetadata: { overture_release_id: '2026-08-19.0', prepared_at: '2026-09-03T00:00:00Z' }, minimumPlaces: 1, logger: () => {} });
  const output = path.dirname(path.dirname(built.releaseDirectory));
  t.after(async () => { assert.equal(path.dirname(output), path.join(APP_ROOT, 'data/tmp/overture-zbp-selection-tests')); await rm(output, { recursive: true, force: true }); });
  assert.equal(built.pointerPath, null);
  assert.equal(built.manifest.baseline_selection.manifest_sha256, f.selected.sha256);
  assert.equal(built.manifest.baseline_selection.managed_receipt_bound, false);
});
test('selection rejects ambiguous, mutable, accessor and cancelled admission', async t => {
  const f = await fixture(t);
  for (const value of [{ ...f.selected, extra: true }, { ...f.selected, manifest: 'current.json' }, { ...f.selected, sha256: 'wrong' }, { get manifest() { throw Error('private'); }, sha256: f.selected.sha256 }]) assert.throws(() => validate(value), /Pinned Overture/);
  await assert.rejects(verify({ ...f.selected, sha256: '0'.repeat(64) }), /Pinned Overture/);
  await assert.rejects(verify(f.selected, { signal: AbortSignal.abort('private') }), /Pinned Overture/);
  await assert.rejects(buildOvertureUsPlaces({ outputRoot: f.root, zbpPointer: 'current.json', zbpSelection: f.selected }), /exactly one/);
});
test('full verification rejects rehashed coverage claims, corrupt artifacts and hardlinks', async t => {
  const f = await fixture(t);
  f.manifest.coverage.union_zip_codes = 2; await f.save(); await assert.rejects(verify(f.selected), /Pinned Overture/);
  f.manifest.coverage.union_zip_codes = 1; await f.save();
  const file = path.join(f.root, 'derived/zip-coverage.jsonl'), raw = await readFile(file);
  await writeFile(file, Buffer.alloc(raw.length)); await assert.rejects(verify(f.selected), /Pinned Overture/);
  await writeFile(file, raw); await link(file, path.join(f.root, 'alias')); await assert.rejects(verify(f.selected), /Pinned Overture/);
});
test('selection rejects unsafe duplicate and oversized manifest inventory', async t => {
  const f = await fixture(t), original = structuredClone(f.manifest.artifacts);
  for (const change of [a => a.push(a[0]), a => a[0].path = '../outside', a => a[0].bytes = 129 * 1024 ** 2]) {
    f.manifest.artifacts = structuredClone(original); change(f.manifest.artifacts); await f.save(); await assert.rejects(verify(f.selected), /Pinned Overture/);
  }
});
