import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { getEventListeners } from 'node:events';
import { createHash } from 'node:crypto';
import { publishCmsNursingHomeNppesOverlapReadiness as publish, verifyCmsNursingHomeNppesOverlapReadiness as verify } from './cms-nursing-home-nppes-overlap-readiness.mjs';

const APP = path.resolve(import.meta.dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const nursingAddress = { street: '1 Main St Ste 2', city: 'Town', state: 'AL', postal: { zip5: '35004', zip4: null } };
const nppesAddress = { street: '1 MAIN ST', unit_or_additional: 'STE 2', city: 'TOWN', state: 'AL', zip_code: '35004' };
const nppesPrimary = (npi, name = 'A AND B CARE') => ({ normalized_record_id: `cms-nppes:${npi}:primary`, entity_candidates: { organization_id: `org:${npi}`, physical_site_id: `site:${npi}` }, external_identifiers: [{ type: 'npi', value: npi }], legal_business_name: name, primary_practice_location: { address: nppesAddress } });

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(APP, 'tmp/cms-overlap-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const nursingDir = path.join(root, 'data/nursing'), nppesDir = path.join(root, 'data/nppes');
  await fs.mkdir(nursingDir, { recursive: true }); await fs.mkdir(nppesDir, { recursive: true }); await fs.mkdir(path.join(root, 'config'));
  const nursingRows = [];
  const specialNames = options.nursingNames ?? ['A & B Care', 'A & B Care'];
  for (let index = 0; index < 14_690; index += 1) nursingRows.push({ sourceRecordId: `nursing:${String(index).padStart(5, '0')}`, identifier: { value: String(index).padStart(6, '0') }, facilityName: specialNames[index] ?? `No Match ${index}`, reportedAddress: nursingAddress });
  const nursingRaw = Buffer.concat(nursingRows.map(json)); await fs.writeFile(path.join(nursingDir, 'selected.jsonl'), nursingRaw);
  const nursingManifest = { runId: 'recovery', createdAt: '2026-01-02T00:00:00.000Z', artifact: { path: 'selected.jsonl', bytes: nursingRaw.length, sha256: digest(nursingRaw), rows: 14_690 }, claims: { currentOperationsVerified: false, publicExportAuthorized: false } };
  const nursingManifestRaw = json(nursingManifest); await fs.writeFile(path.join(nursingDir, 'manifest.json'), nursingManifestRaw);
  const primaryRows = options.primaryRows ?? [nppesPrimary('1000000001'), nppesPrimary('1000000002')];
  const artifacts = [];
  for (let index = 0; index < 11; index += 1) {
    const rows = index === 1 ? primaryRows : [];
    const raw = zlib.gzipSync(Buffer.concat(rows.map(json))), name = `org-${index}.jsonl.gz`; await fs.writeFile(path.join(nppesDir, name), raw);
    artifacts.push({ path: name, bytes: raw.length, sha256: digest(raw), record_count: rows.length, artifact_type: 'normalized-nppes-organization-jsonl-gzip' });
  }
  for (let index = 0; index < 10; index += 1) {
    const rows = index === 1 && options.practice !== false ? [{ normalized_record_id: 'cms-nppes:1000000001:practice:x', npi: '1000000001', entity_candidates: { organization_id: 'org:1000000001', physical_site_id: 'site:x' }, address: nppesAddress }] : [];
    const raw = zlib.gzipSync(Buffer.concat(rows.map(json))), name = `practice-${index}.jsonl.gz`; await fs.writeFile(path.join(nppesDir, name), raw);
    artifacts.push({ path: name, bytes: raw.length, sha256: digest(raw), record_count: rows.length, artifact_type: 'normalized-nppes-practice-location-jsonl-gzip' });
  }
  const nppesManifest = { release_id: 'nppes-release', source_release_id: 'nppes-source', observed_at: '2026-01-03T00:00:00.000Z', coverage: { active_organization_npis: primaryRows.length, accepted_non_primary_practice_locations: options.practice === false ? 0 : 1 }, artifacts };
  const nppesManifestRaw = json(nppesManifest); await fs.writeFile(path.join(nppesDir, 'manifest.json'), nppesManifestRaw);
  const config = { schema_version: 'cms-nursing-home-nppes-overlap-readiness-config@1.0.0', nursing_home: { manifest: 'data/nursing/manifest.json', manifest_sha256: digest(nursingManifestRaw), selected_artifact: 'selected.jsonl', selected_sha256: digest(nursingRaw) }, nppes: { manifest: 'data/nppes/manifest.json', manifest_sha256: digest(nppesManifestRaw), release_id: 'nppes-release', source_release_id: 'nppes-source' } };
  await fs.writeFile(path.join(root, 'config/cms-nursing-home-nppes-overlap-readiness.json'), json(config));
  return root;
}

test('publishes conserved exact-only reversible candidate readiness without upgraded claims', async t => {
  const root = await fixture(t), result = await publish({ root, createdAt: '2026-01-04T00:00:00.000Z' });
  assert.equal(result.nursing_home_rows, 14_690); assert.equal(result.ambiguous_multiple_distinct_npi_candidates, 2); assert.equal(result.matched_one_distinct_npi_candidate, 0); assert.equal(result.unmatched, 14_688); assert.equal(result.distinct_npi_candidate_links, 4); assert.equal(result.location_assertion_links, 6);
  assert.equal(result.identity_merge_performed, false); assert.equal(result.npi_inference_performed, false); assert.equal(result.current_operations_verified, false); assert.equal(result.current_pointer_written, false);
  const rows = (await fs.readFile(path.join(result.directory, 'overlap-readiness.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].status, 'ambiguous-multiple-distinct-npi-candidates'); assert.deepEqual(rows[0].candidates.map(x => x.npi), ['1000000001', '1000000002']); assert.equal(rows[0].candidates[0].location_assertion_count, 2);
  assert.equal(await fs.stat(path.join(root, 'data/cms-nursing-home-nppes-overlap-readiness/current.json')).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error)), false);
});

test('tampering and closed-inventory drift fail independent reconstruction', async t => {
  for (const mode of ['artifact', 'manifest', 'extra']) await t.test(mode, async t => {
    const root = await fixture(t), result = await publish({ root, createdAt: '2026-01-04T00:00:00.000Z' }), manifest = path.join(result.directory, 'manifest.json');
    if (mode === 'artifact') await fs.appendFile(path.join(result.directory, 'overlap-readiness.jsonl'), '{}\n');
    if (mode === 'manifest') { const value = JSON.parse(await fs.readFile(manifest)); value.claims.identity_merge_performed = true; await fs.writeFile(manifest, json(value)); }
    if (mode === 'extra') await fs.writeFile(path.join(result.directory, 'extra'), 'x');
    await assert.rejects(verify(manifest, { root }));
  });
});

test('Unicode letters remain distinct and non-Latin names remain matchable', async t => {
  const root = await fixture(t, { nursingNames: ['CAF', 'CAFÉ', '東京 ケア'], primaryRows: [nppesPrimary('1000000001', 'CAFÉ'), nppesPrimary('1000000002', '東京 ケア')], practice: false });
  const result = await publish({ root, createdAt: '2026-01-04T00:00:00.000Z' });
  assert.equal(result.matched_one_distinct_npi_candidate, 2); assert.equal(result.unmatched, 14_688); assert.equal(result.ambiguous_multiple_distinct_npi_candidates, 0);
  const rows = (await fs.readFile(path.join(result.directory, 'overlap-readiness.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].status, 'unmatched'); assert.equal(rows[1].status, 'matched-one-distinct-npi-candidate'); assert.equal(rows[2].status, 'matched-one-distinct-npi-candidate');
  assert.notEqual(rows[0].exact_match_key_sha256, rows[1].exact_match_key_sha256);
});

test('gzip decompressed-total and per-line ceilings reject before publication', async t => {
  for (const [name, limits, pattern] of [['total', { maxDecompressedBytes: 10 }, /decompressed artifact ceiling/], ['line', { maxLineBytes: 10 }, /JSONL line ceiling/]]) await t.test(name, async t => {
    const root = await fixture(t); await assert.rejects(publish({ root, createdAt: '2026-01-04T00:00:00.000Z', _testHooks: { limits } }), pattern);
    assert.equal(await fs.stat(path.join(root, 'data/cms-nursing-home-nppes-overlap-readiness')).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error)), false);
  });
});

test('opened-handle input replacement and cancellation are rejected and listeners are removed', async t => {
  await t.test('replacement', async t => { const root = await fixture(t); let fired = false; const hooks = { afterGzipRead: async ({ file }) => { if (fired) return; fired = true; const moved = `${file}.original`; await fs.rename(file, moved); await fs.copyFile(moved, file); } }; await assert.rejects(publish({ root, createdAt: '2026-01-04T00:00:00.000Z', _testHooks: hooks }), /artifact replay/); });
  await t.test('cancellation', async t => { const root = await fixture(t), controller = new AbortController(); let fired = false; const hooks = { afterGzipRead: () => { if (!fired) { fired = true; controller.abort(); } } }; await assert.rejects(publish({ root, signal: controller.signal, createdAt: '2026-01-04T00:00:00.000Z', _testHooks: hooks }), { name: 'AbortError' }); assert.equal(getEventListeners(controller.signal, 'abort').length, 0); });
});

test('foreign stage and lock substitution are retained and primary errors survive cleanup faults', async t => {
  for (const kind of ['stage', 'lock']) await t.test(`foreign ${kind}`, async t => { const root = await fixture(t); let replacement; const hook = kind === 'stage' ? 'afterStage' : 'afterLock'; const hooks = { [hook]: async value => { const directory = kind === 'stage' ? value.stage : value.lock, ownerFile = path.join(directory, kind === 'stage' ? '.owner' : 'owner'), token = await fs.readFile(ownerFile); await fs.rename(directory, `${directory}.original`); await fs.mkdir(directory); await fs.writeFile(path.join(directory, path.basename(ownerFile)), token); replacement = directory; throw new Error(`primary ${kind} fault`); } }; let error; try { await publish({ root, createdAt: '2026-01-04T00:00:00.000Z', _testHooks: hooks }); } catch (value) { error = value; } assert.match(error.message, new RegExp(`primary ${kind} fault`)); assert.equal(error.inspection_required, true); assert.equal((await fs.lstat(replacement)).isDirectory(), true); });
  await t.test('cleanup failure preserves primary', async t => { const root = await fixture(t), hooks = { afterStage: () => { throw new Error('primary stage fault'); }, beforeStageCleanup: () => { throw new Error('cleanup fault'); } }; let error; try { await publish({ root, createdAt: '2026-01-04T00:00:00.000Z', _testHooks: hooks }); } catch (value) { error = value; } assert.match(error.message, /primary stage fault/); assert.equal(error.inspection_required, true); });
  await t.test('manifest replacement fails identity check', async t => { const root = await fixture(t), hooks = { afterManifestWrite: async ({ stage }) => { const file = path.join(stage, 'manifest.json'), moved = `${file}.original`; await fs.rename(file, moved); await fs.copyFile(moved, file); } }; let error; try { await publish({ root, createdAt: '2026-01-04T00:00:00.000Z', _testHooks: hooks }); } catch (value) { error = value; } assert.match(error.message, /stage precommit (inventory|identity)/); assert.equal(error.inspection_required, true); });
});

test('source byte drift, cancellation, concurrency, and post-rename cancellation fail closed', async t => {
  await t.test('source drift', async t => { const root = await fixture(t), file = path.join(root, 'data/nursing/selected.jsonl'); await fs.appendFile(file, ' '); await assert.rejects(publish({ root, createdAt: '2026-01-04T00:00:00.000Z' }), /selected bytes|artifact binding/); });
  await t.test('already cancelled', async t => { const root = await fixture(t), controller = new AbortController(); controller.abort(); await assert.rejects(publish({ root, signal: controller.signal, createdAt: '2026-01-04T00:00:00.000Z' }), { name: 'AbortError' }); });
  await t.test('concurrent lock', async t => { const root = await fixture(t), values = await Promise.allSettled([publish({ root, createdAt: '2026-01-04T00:00:00.000Z' }), publish({ root, createdAt: '2026-01-04T00:00:01.000Z' })]); assert.equal(values.filter(x => x.status === 'fulfilled').length, 1); });
  await t.test('post rename', async t => { const root = await fixture(t), controller = new AbortController(); let error; try { await publish({ root, signal: controller.signal, createdAt: '2026-01-04T00:00:00.000Z', _testHooks: { postRename: () => controller.abort() } }); } catch (value) { error = value; } assert.equal(error?.name, 'AbortError'); assert.equal(error?.inspection_required, true); });
});

test('tracked release registration preserves exact hashes and null or false claims', async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(APP, 'config/datasets/cms-nursing-home-nppes-overlap-readiness.json')));
  const raw = await fs.readFile(path.join(APP, catalog.retained_release.manifest)), manifest = JSON.parse(raw);
  assert.equal(digest(raw), catalog.retained_release.manifest_sha256);
  assert.deepEqual(catalog.retained_release.summary, manifest.summary);
  assert.equal(catalog.runtime_pointer, null); assert.equal(catalog.claims.active_business_count, null); assert.equal(catalog.claims.identity_merge_performed, false); assert.equal(catalog.claims.npi_inference_performed, false);
  const artifact = await fs.readFile(path.join(path.dirname(path.join(APP, catalog.retained_release.manifest)), catalog.retained_release.artifact.path));
  assert.equal(digest(artifact), catalog.retained_release.artifact.sha256);
});
