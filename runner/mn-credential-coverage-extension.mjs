import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { MN_CREDENTIAL_REGISTRY_VERSION, verifyMnCredentialRegistryExtension, mnCredentialCoverageIndex } from './mn-credential-registry-input.mjs';
const check = v => { if (!v) throw Error('Minnesota credential coverage extension rejected.'); };
const field = 'mn_construction_credential_reporting';

export function applyMnCredentialCoverage(input, views) {
  const index = mnCredentialCoverageIndex(input.records);
  for (const row of views.states) row[field] = index.states.get(row.postal_abbreviation) ?? index.empty;
  for (const row of views.zips) row[field] = index.zips.get(row.zip_code) ?? index.empty;
  const stateScope = new Set(views.states.map(row => row.postal_abbreviation));
  for (const row of views.national) { check(['registry-union', '50-states-and-dc', 'all-census-us-areas'].includes(row.scope));
    row[field] = row.scope === 'registry-union' ? index.all : row.scope === '50-states-and-dc' ? index.national : index.forStates(stateScope); }
  for (const row of views.counties) row[field] = { schema_version: MN_CREDENTIAL_REGISTRY_VERSION, credential_rows: null,
    geographic_assignment_performed: false, reason: 'source has no geocodes or governed county membership', export_policy: 'local-review-only' };
  const zipSet = new Set(views.zips.map(row => row.zip_code)), states = new Set(views.states.map(row => row.postal_abbreviation));
  return { schema_version: MN_CREDENTIAL_REGISTRY_VERSION, selected_cohort_rows: input.records.length,
    credential_rows_without_existing_zip_view: [...index.zips].filter(([zip]) => !zipSet.has(zip)).reduce((n, [, value]) => n + value.credential_rows, 0),
    credential_rows_without_existing_state_view: [...index.states].filter(([state]) => !states.has(state)).reduce((n, [, value]) => n + value.credential_rows, 0),
    missing_reported_zip5_rows: index.all.missing_reported_zip5_rows,
    geographic_assignment_performed: false, identity_matching_applied: false, public_export_authorized: false, export_policy: 'local-review-only' };
}

export async function verifyMnCredentialCoverageExtension(manifest, directory) {
  const declaration = manifest[field], retained = (manifest.artifacts ?? []).filter(a => a.artifact_type === 'retained-registry-manifest-json');
  if (declaration === undefined) {
    if (retained.length) {
      check(retained.length === 1 && retained[0].path === 'evidence/registry-manifest.json'); const meter = {};
      const registry = await readJson(path.join(directory, retained[0].path), 4000000, undefined, meter);
      check(meter.sha256 === retained[0].sha256 && registry[field] === undefined);
    }
    return;
  }
  check(declaration.schema_version === MN_CREDENTIAL_REGISTRY_VERSION && typeof declaration.registry_manifest_path === 'string'
    && declaration.registry_manifest_path.startsWith('data/') && !declaration.registry_manifest_path.includes('\\')
    && !declaration.registry_manifest_path.split('/').some(p => !p || p === '.' || p === '..')
    && retained.length === 1 && retained[0].path === 'evidence/registry-manifest.json'
    && retained[0].export_policy === 'internal' && retained[0].record_count === 1);
  const sourcePath = path.resolve(APP_ROOT, declaration.registry_manifest_path), meter = {}, savedMeter = {};
  const registry = await readJson(sourcePath, 4000000, undefined, meter);
  const saved = await readJson(path.join(directory, retained[0].path), 4000000, undefined, savedMeter);
  const dependencies = manifest.dependencies.filter(d => d.dataset_id === 'national-business-registry');
  check(dependencies.length === 1 && dependencies[0].release_id === registry.release_id && dependencies[0].manifest_sha256 === meter.sha256
    && savedMeter.sha256 === meter.sha256 && retained[0].sha256 === meter.sha256 && savedMeter.bytes === retained[0].bytes && same(saved, registry));
  const input = await verifyMnCredentialRegistryExtension(registry, path.dirname(sourcePath)); check(input);
  check(typeof manifest.created_at === 'string' && Number.isFinite(Date.parse(manifest.created_at))
    && new Date(manifest.created_at).toISOString() === manifest.created_at && manifest.created_at >= registry.created_at);
  const views = {}, actual = {};
  for (const [key, type] of [['national', 'national'], ['states', 'state'], ['counties', 'county'], ['zips', 'zip']]) {
    const artifacts = manifest.artifacts.filter(a => a.artifact_type === `${type}-coverage-view-jsonl`); check(artifacts.length === 1);
    const a = artifacts[0]; check(a.path === `views/${key}.jsonl` && a.export_policy === 'local-review-only');
    const rows = [], m = {};
    for await (const row of readLines(path.join(directory, a.path), 1000000000, undefined, m)) { check(rows.length < 100000); rows.push({ scope: row.scope, postal_abbreviation: row.postal_abbreviation, zip_code: row.zip_code, [field]: row[field] }); }
    check(m.sha256 === a.sha256 && m.bytes === a.bytes && m.records === a.record_count); views[key] = rows; actual[key] = rows.map(row => row[field]);
  }
  const expected = applyMnCredentialCoverage(input, views);
  check(same(declaration, { ...expected, registry_manifest_path: declaration.registry_manifest_path }));
  for (const [key, rows] of Object.entries(views)) check(same(actual[key], rows.map(row => row[field])));
  const after = {}; await readJson(sourcePath, 4000000, undefined, after); check(after.sha256 === meter.sha256);
}
