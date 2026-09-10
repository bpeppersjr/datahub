import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { verifyMnConstructionCredentialRelease } from './mn-construction-credential-release.mjs';
import { validateMnConstructionCredentialReporting } from './mn-construction-credential-reporting.mjs';
import { aggregateCredentialCoverage, CREDENTIAL_COVERAGE_STATES, CREDENTIAL_COVERAGE_CATEGORIES } from './credential-coverage.mjs';

export const MN_CREDENTIAL_REGISTRY_VERSION = 'mn-credential-registry-input@1.0.0';
export const MN_CREDENTIAL_REGISTRY_ARTIFACT = 'mn-construction-credential-reporting-jsonl';
export const MN_CREDENTIAL_REGISTRY_PATH = 'reporting/mn-construction/credentials.jsonl';
export const MN_CREDENTIAL_DEPENDENCY = 'mn-construction-credential-reporting';
const check = v => { if (!v) throw Error('Minnesota credential registry input rejected.'); };
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const relative = file => path.relative(APP_ROOT, file).replaceAll('\\', '/');
const localPath = v => typeof v === 'string' && v.startsWith('data/') && !v.includes('\\') && !v.split('/').some(p => !p || p === '.' || p === '..');
const claims = () => ({ record_unit: 'publisher-business-credential-row', identity_matching_eligible: false, physical_site_eligible: false,
  geographic_assignment_performed: false, current_operations_verified: false, unique_business_count: null, active_business_count: null,
  national_completeness_percent: null, public_export_authorized: false, export_policy: 'local-review-only', zip4_aggregated: false });
export function validateMnCredentialRegistrySelection(value) {
  check(value && same(Object.keys(value).sort(), ['manifest_path', 'manifest_sha256', 'schema_version'])
    && value.schema_version === MN_CREDENTIAL_REGISTRY_VERSION && localPath(value.manifest_path) && path.posix.basename(value.manifest_path) === 'manifest.json' && sha(value.manifest_sha256));
  return structuredClone(value);
}

/** Explicit fixed local release; preserves original reporting envelopes verbatim. */
export async function loadMnCredentialRegistryInput(selectionPath, { signal } = {}) {
  signal?.throwIfAborted(); check(typeof selectionPath === 'string' && selectionPath === path.resolve(selectionPath));
  const selectionMeter = {}, selection = validateMnCredentialRegistrySelection(await readJson(selectionPath, 10000, signal, selectionMeter));
  const manifestPath = path.resolve(APP_ROOT, selection.manifest_path), verified = await verifyMnConstructionCredentialRelease(manifestPath, { signal });
  check(verified.manifest_sha256 === selection.manifest_sha256);
  const artifact = verified.manifest.artifacts[0], meter = {}, records = [];
  for await (const row of readLines(path.join(path.dirname(manifestPath), 'credentials.jsonl'), 150000000, signal, meter)) {
    check(records.length < 250000); validateMnConstructionCredentialReporting(row); records.push(row);
  }
  check(meter.sha256 === artifact.sha256 && meter.bytes === artifact.bytes && meter.records === artifact.records);
  const summary = await aggregateCredentialCoverage(records, { signal });
  check(summary.allAcceptedCohortRows === verified.manifest.summary.accepted_credential_rows && summary.missingZip5Rows === verified.manifest.summary.rows_without_reported_zip5);
  const after = await verifyMnConstructionCredentialRelease(manifestPath, { signal }), final = {};
  await readJson(selectionPath, 10000, signal, final); check(after.manifest_sha256 === verified.manifest_sha256 && final.sha256 === selectionMeter.sha256);
  return { selection: { path: relative(selectionPath), sha256: selectionMeter.sha256 },
    source: { dataset_id: MN_CREDENTIAL_DEPENDENCY, release_id: verified.manifest.release_id, manifest_path: selection.manifest_path,
      created_at: verified.manifest.created_at,
      manifest_sha256: verified.manifest_sha256, artifact_path: relative(path.join(path.dirname(manifestPath), 'credentials.jsonl')),
      artifact_sha256: meter.sha256, source_app_receipt: verified.manifest.source_app_receipt }, records, summary };
}
export function mnCredentialRegistryDeclaration(input) {
  return { schema_version: MN_CREDENTIAL_REGISTRY_VERSION, selection: input.selection, source: input.source, summary: input.summary,
    historical_row_claims_preserved: true, ...claims() };
}
export function mnCredentialRegistryDependency(input) {
  return { dataset_id: MN_CREDENTIAL_DEPENDENCY, release_id: input.source.release_id, manifest_sha256: input.source.manifest_sha256 };
}

/** Full source replay and exact artifact membership, not just count agreement. */
export async function verifyMnCredentialRegistryExtension(manifest, directory, { signal } = {}) {
  const declaration = manifest.mn_construction_credential_reporting;
  const artifacts = (manifest.artifacts ?? []).filter(a => a.artifact_type === MN_CREDENTIAL_REGISTRY_ARTIFACT || a.path === MN_CREDENTIAL_REGISTRY_PATH);
  const dependencies = (manifest.dependencies ?? []).filter(d => d.dataset_id === MN_CREDENTIAL_DEPENDENCY);
  if (declaration === undefined) {
    check(!artifacts.length && !dependencies.length && !Object.hasOwn(manifest.coverage ?? {}, 'mn_construction_credential_rows')); return null;
  }
  const selectedPath = declaration.selection?.path;
  check(declaration.schema_version === MN_CREDENTIAL_REGISTRY_VERSION && typeof selectedPath === 'string'
    && (selectedPath.startsWith('config/') || selectedPath.startsWith('data/')) && !selectedPath.includes('\\')
    && !selectedPath.split('/').some(p => !p || p === '.' || p === '..'));
  const input = await loadMnCredentialRegistryInput(path.resolve(APP_ROOT, declaration.selection.path), { signal });
  check(typeof manifest.created_at === 'string' && Number.isFinite(Date.parse(manifest.created_at)) && new Date(manifest.created_at).toISOString() === manifest.created_at && manifest.created_at >= input.source.created_at);
  check(same(declaration, mnCredentialRegistryDeclaration(input)) && artifacts.length === 1 && dependencies.length === 1 && same(dependencies[0], mnCredentialRegistryDependency(input)));
  const artifact = artifacts[0]; check(artifact.artifact_type === MN_CREDENTIAL_REGISTRY_ARTIFACT && artifact.path === MN_CREDENTIAL_REGISTRY_PATH
    && artifact.export_policy === 'local-review-only' && artifact.record_count === input.records.length && String(manifest.export_policy).includes('local-review-only'));
  let index = 0; const meter = {};
  for await (const row of readLines(path.join(directory, artifact.path), 150000000, signal, meter)) check(same(row, input.records[index++]));
  check(index === input.records.length && meter.bytes === artifact.bytes && meter.sha256 === artifact.sha256 && manifest.coverage.mn_construction_credential_rows === index);
  return input;
}

/** Pure grouping: counts only this selected source cohort, never all businesses. */
export function mnCredentialCoverageIndex(records) {
  check(Array.isArray(records) && records.length <= 250000);
  const ids = new Set(), states = new Map(), zips = new Map(), stateSet = new Set(CREDENTIAL_COVERAGE_STATES);
  const emptyBucket = () => ({ rows: 0, missing: 0, categories: new Map(CREDENTIAL_COVERAGE_CATEGORIES.map(c => [c, 0])) });
  const all = emptyBucket(), national = emptyBucket();
  const add = (bucket, row) => { bucket.rows++; if (row.record.reported_address.zip_code === null) bucket.missing++; const c = row.record.credential.category; check(bucket.categories.has(c)); bucket.categories.set(c, bucket.categories.get(c) + 1); };
  for (const row of records) {
    validateMnConstructionCredentialReporting(row); check(!ids.has(row.reporting_id)); ids.add(row.reporting_id); add(all, row);
    const address = row.record.reported_address; if (stateSet.has(address.state)) add(national, row);
    for (const [map, key] of [[states, address.state], [zips, address.zip_code]]) { if (!map.has(key)) map.set(key, emptyBucket()); add(map.get(key), row); }
  }
  const percent = (n, d) => d ? 100 * n / d : null;
  const metric = b => ({ schema_version: MN_CREDENTIAL_REGISTRY_VERSION, credential_rows: b.rows, missing_reported_zip5_rows: b.missing,
    selected_cohort_rows: all.rows, percent_of_selected_credential_cohort: percent(b.rows, all.rows),
    denominator: 'all accepted credential rows in the explicitly selected Minnesota source cohort; not all U.S. construction businesses',
    by_category: [...b.categories].map(([category, count]) => ({ category, credential_rows: count,
      percent_within_selected_geographic_cohort: percent(count, b.rows), percent_of_category_in_entire_selected_cohort: percent(count, all.categories.get(category)) })), ...claims() });
  return { all: metric(all), national: metric(national), states: new Map([...states].map(([key, b]) => [key, metric(b)])),
    zips: new Map([...zips].map(([key, b]) => [key, metric(b)])), empty: metric(emptyBucket()),
    forStates: allowed => { const b = emptyBucket(); for (const [state, s] of states) if (allowed.has(state)) {
      b.rows += s.rows; b.missing += s.missing; for (const [category, count] of s.categories) b.categories.set(category, b.categories.get(category) + count);
    } return metric(b); } };
}
