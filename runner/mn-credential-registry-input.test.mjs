import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { MN_CONSTRUCTION_COLUMNS } from './mn-construction-preflight.mjs';
import { normalizeMnConstructionRecord } from './mn-construction-normalization.mjs';
import { projectMnConstructionCredential } from './mn-construction-credential-reporting.mjs';
import { loadMnCredentialRegistryInput as load, verifyMnCredentialRegistryExtension as verify, mnCredentialRegistryDeclaration as declaration,
  mnCredentialRegistryDependency as dependency, mnCredentialCoverageIndex as index, validateMnCredentialRegistrySelection as selection,
  MN_CREDENTIAL_REGISTRY_VERSION as version, MN_CREDENTIAL_REGISTRY_ARTIFACT as type, MN_CREDENTIAL_REGISTRY_PATH as artifactPath, MN_CREDENTIAL_DEPENDENCY as dataset } from './mn-credential-registry-input.mjs';
import { applyMnCredentialCoverage as apply, verifyMnCredentialCoverageExtension as verifyCoverage } from './mn-credential-coverage-extension.mjs';
const hash = raw => createHash('sha256').update(raw).digest('hex'), json = v => JSON.stringify(v) + '\n';
function row(i, state = 'MN', zip = '55101', prefix = 'BC') {
  return projectMnConstructionCredential(normalizeMnConstructionRecord({ ...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k => [k, ''])),
    Bus_Pers: 'Business', Lic_Number: `${prefix}123456`, Status: 'Issued', Name: 'Synthetic Builder', Addr1: 'PO Box 1', City: 'Fixture', St: state, Zip: zip },
  { runId: 'mn-registry-test', sourceReleaseId: 'mn-source-fixture', observedAt: '2026-09-08T12:00:00.000Z', cohort: prefix === 'IR' ? 'registrations' : 'residential', sourceFileSha256: 'a'.repeat(64), rowNumber: i }));
}
test('MN credential selection is explicit, local and checksum bound', async () => {
  const valid = { schema_version: version, manifest_path: 'data/source/manifest.json', manifest_sha256: 'a'.repeat(64) };
  assert.deepEqual(selection(valid), valid);
  for (const change of [v => v.manifest_path = '../source/manifest.json', v => v.manifest_path = 'data/source/current.json', v => v.manifest_sha256 = 'invalid', v => v.approved = true]) { const v = { ...valid }; change(v); assert.throws(() => selection(v)); }
  await assert.rejects(load(path.join(APP_ROOT, 'missing.json'), { signal: AbortSignal.abort() }), { name: 'AbortError' });
});
test('MN credential index preserves repeated credentials, missing ZIP and exact source denominators', () => {
  const records = [row(1), row(2, 'MN', '', 'CR'), row(3, 'WI'), row(4, 'PR'), row(5, '', '')], view = index(records);
  assert.equal(records[0].record.external_identifiers[0].value, records[2].record.external_identifiers[0].value);
  assert.equal(view.all.credential_rows, 5); assert.equal(view.national.credential_rows, 3); assert.equal(view.all.missing_reported_zip5_rows, 2);
  assert.equal(view.states.get('MN').percent_of_selected_credential_cohort, 40); assert.equal(view.states.get('MN').by_category.find(c => c.category === 'residential-remodeler').percent_of_category_in_entire_selected_cohort, 100);
  assert.equal(view.empty.by_category[0].percent_within_selected_geographic_cohort, null); assert.equal(view.all.active_business_count, null);
  assert.throws(() => index([records[0], records[0]])); const invalid = structuredClone(records[0]); invalid.record.geocode.latitude = 44; assert.throws(() => index([invalid]));
  const views = { national: ['registry-union', 'all-census-us-areas', '50-states-and-dc'].map(scope => ({ scope })), states: [{ postal_abbreviation: 'MN' }, { postal_abbreviation: 'WI' }, { postal_abbreviation: 'PR' }], zips: [{ zip_code: '55101' }, { zip_code: '00100' }], counties: [{}] };
  const declared = apply({ records }, views); assert.equal(views.national[1].mn_construction_credential_reporting.credential_rows, 4);
  assert.equal(views.counties[0].mn_construction_credential_reporting.credential_rows, null); assert.equal(declared.credential_rows_without_existing_zip_view, 2);
  assert.equal(views.zips[1].mn_construction_credential_reporting.credential_rows, 0); assert.equal(views.zips[1].mn_construction_credential_reporting.national_completeness_percent, null);
});
test('MN registry absence rejects orphan counts, dependency and reserved path even when relabeled', async () => {
  assert.equal(await verify({ artifacts: [], coverage: {}, dependencies: [] }, APP_ROOT), null);
  for (const manifest of [{ artifacts: [{ path: artifactPath, artifact_type: 'innocent' }] }, { artifacts: [{ path: 'other', artifact_type: type }] },
    { dependencies: [{ dataset_id: dataset }] }, { coverage: { mn_construction_credential_rows: 0 } }]) await assert.rejects(verify(manifest, APP_ROOT));
});
test('MN registry CLI rejects missing and repeated selections before using sources', async () => {
  const exec = promisify(execFile), script = path.join(APP_ROOT, 'scripts/build-business-registry.mjs');
  for (const args of [['--mn-credential-selection'], ['--mn-credential-selection', 'one', '--mn-credential-selection', 'two']]) await assert.rejects(exec(process.execPath, [script, ...args], { cwd: APP_ROOT }));
});
test('MN retained credential extension and coverage independently replay all selected rows offline', { skip: process.env.DATAHUB_TEST_RETAINED_COHORTS !== '1', timeout: 600000 }, async () => {
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw Error('Network forbidden'); };
  try {
    const input = await load(path.join(APP_ROOT, 'config/mn-credential-registry-selection.json'));
    assert.equal(input.records.length, 11456); assert.equal(input.summary.missingZip5Rows, 1);
    const root = path.join(APP_ROOT, 'data/tmp', `mn-registry-${randomUUID()}`); await mkdir(path.dirname(path.join(root, artifactPath)), { recursive: true });
    const raw = input.records.map(json).join(''); await writeFile(path.join(root, artifactPath), raw, { flag: 'wx' });
    const manifest = { dataset_id: 'national-business-registry', release_id: 'mn-extension-test', created_at: new Date().toISOString(), export_policy: 'local-review-only',
      mn_construction_credential_reporting: declaration(input), coverage: { source_records: 10, physical_sites: 2, mn_construction_credential_rows: input.records.length },
      dependencies: [dependency(input)], artifacts: [{ path: artifactPath, artifact_type: type, bytes: Buffer.byteLength(raw), sha256: hash(raw), record_count: input.records.length, export_policy: 'local-review-only' }] };
    assert.equal((await verify(manifest, root)).records.length, 11456);
    const manifestPath = path.join(root, 'manifest.json'), manifestRaw = json(manifest); await writeFile(manifestPath, manifestRaw, { flag: 'wx' });
    const views = { national: ['registry-union', 'all-census-us-areas', '50-states-and-dc'].map(scope => ({ scope })),
      states: ['MN', 'WI'].map(postal_abbreviation => ({ postal_abbreviation })), zips: [{ zip_code: '55101' }], counties: [{}] };
    const declared = apply(input, views), artifacts = [];
    await mkdir(path.join(root, 'views')); await mkdir(path.join(root, 'evidence'));
    for (const [key, kind] of [['national', 'national'], ['states', 'state'], ['zips', 'zip'], ['counties', 'county']]) {
      const bytes = views[key].map(json).join(''), file = `views/${key}.jsonl`; await writeFile(path.join(root, file), bytes, { flag: 'wx' });
      artifacts.push({ path: file, artifact_type: `${kind}-coverage-view-jsonl`, bytes: Buffer.byteLength(bytes), sha256: hash(bytes), record_count: views[key].length, export_policy: 'local-review-only' });
    }
    await writeFile(path.join(root, 'evidence/registry-manifest.json'), manifestRaw, { flag: 'wx' });
    artifacts.push({ path: 'evidence/registry-manifest.json', artifact_type: 'retained-registry-manifest-json', sha256: hash(manifestRaw), bytes: Buffer.byteLength(manifestRaw), record_count: 1, export_policy: 'internal' });
    const coverage = { created_at: new Date().toISOString(), mn_construction_credential_reporting: { ...declared, registry_manifest_path: path.relative(APP_ROOT, manifestPath).replaceAll('\\', '/') }, artifacts,
      dependencies: [{ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest_sha256: hash(manifestRaw) }] };
    await verifyCoverage(coverage, root);
    for (const change of [a => { a.export_policy = 'public'; }, a => { a.bytes++; }, a => { a.record_count = 2; }]) {
      const changed = structuredClone(coverage); change(changed.artifacts.at(-1)); await assert.rejects(verifyCoverage(changed, root));
    }
    assert.equal(views.states[0].mn_construction_credential_reporting.credential_rows, 10899);
    for (const change of [m => { m.coverage.mn_construction_credential_rows++; }, m => m.dependencies.push(m.dependencies[0]), m => { m.artifacts[0].export_policy = 'public'; }, m => { m.created_at = '2020-01-01T00:00:00.000Z'; }]) {
      const changed = structuredClone(manifest); change(changed); await assert.rejects(verify(changed, root));
    }
    const altered = structuredClone(coverage); altered.mn_construction_credential_reporting.selected_cohort_rows++; await assert.rejects(verifyCoverage(altered, root));
    const sourceFile = path.join(root, artifactPath), original = await readFile(sourceFile); await writeFile(sourceFile, '{}\n'); await assert.rejects(verify(manifest, root)); await writeFile(sourceFile, original);
  } finally { globalThis.fetch = originalFetch; }
});
