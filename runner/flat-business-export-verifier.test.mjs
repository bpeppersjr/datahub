import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { verifyFlatBusinessExport } from '../scripts/verify-flat-business-export.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const claims = { cross_source_additive: false, entity_resolution_applied: false, current_operation_verified: false, active_business_eligible: false, unique_business_count: null, usps_validity: 'unverified' };
const quote = value => { const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text; };

async function fixture(t) {
  const directory = path.join(APP_ROOT, 'data/test-runtime', `flat-export-verify-${randomUUID()}`); await mkdir(directory, { recursive: true });
  t.after(() => rm(directory, { recursive: true, force: true }));
  const governanceLineage = { registry: { release_id: 'registry-fixture', manifest_path:'fixture/manifest.json',manifest_sha256: 'a'.repeat(64) },
    lifecycle: { release_id: 'life-fixture', manifest_sha256: 'b'.repeat(64) }, entity_geography: { release_id: 'geo-fixture', manifest_sha256: 'c'.repeat(64) },
    reporting_only_qualification: { release_id: 'report-fixture', manifest_sha256: 'd'.repeat(64), registration_sha256:'6'.repeat(64),artifact_sha256:'7'.repeat(64),policy_sources: { MA: { source_id: 'report-source' } } },
    source_policy_provenance: { release_id: 'policy-fixture', manifest_sha256: 'e'.repeat(64), source_rows: [] } };
  const matchPolicy = { source_id: 'match-source', source_release_id: 'source-match-1', policy_id: 'match-policy', policy_profile_sha256: '1'.repeat(64) };
  const reportPolicy = { source_id: 'report-source', source_release_id: 'source-report-1', policy_id: 'report-policy', policy_profile_sha256: '2'.repeat(64) };
  const reportQualification = { cohort_kind: 'reporting-only', source: reportPolicy, lifecycle: { current_operation_verified: false, active_business_eligible: false },
    geography: { postal: { usps_operational_assignment: null, usps_deliverability: null } }, current_operation_verified: false, active_business_eligible: false };
  governanceLineage.source_policy_provenance.source_rows = [matchPolicy];
  const fields = ['cohort_kind','source_artifact_path','source_policy_provenance','profile_id','lifecycle_eligibility','geography_relationship','reporting_site_qualification',
    'source_id','source_release_id','source_record_id','ingest_run_id','policy_id','export_policy','transformation_version','dataset_id','source_dataset_release_id',
    'site_entity_id','establishment_entity_id','organization_entity_id','source_status','source_evidence','state','zip_code','zip4','geocode','identity_matching_eligible'];
  const rows = [
    { cohort_kind: 'matching-profile', source_artifact_path: 'profiles.jsonl.gz', source_policy_provenance: matchPolicy, profile_id: 'profile-1',
      lifecycle_eligibility: { current_operation_verified: false, active_business_eligible: false, release: { release_id: 'life-fixture', manifest_sha256: 'b'.repeat(64) } },
      geography_relationship: { postal: { usps_operational_assignment: null, usps_deliverability: null } }, reporting_site_qualification: null,
      source_id: matchPolicy.source_id, source_release_id: matchPolicy.source_release_id, source_record_id: 'record-1', policy_id: matchPolicy.policy_id,
      ingest_run_id:'run-match',transformation_version:'v1',dataset_id:'national-business-registry',source_dataset_release_id:'registry-fixture',site_entity_id:'site-1',establishment_entity_id:'est-1',organization_entity_id:null,source_status:null,source_evidence:null,
      export_policy: 'local-review-only', state:'MA',zip_code: '02110', zip4: '0001', geocode: null, identity_matching_eligible: true },
    { cohort_kind: 'reporting-only', source_artifact_path: 'reporting.jsonl.gz', source_policy_provenance: reportPolicy, profile_id: null,
      lifecycle_eligibility: reportQualification.lifecycle, geography_relationship: reportQualification.geography, reporting_site_qualification: reportQualification,
      source_id: reportPolicy.source_id, source_release_id: reportPolicy.source_release_id, source_record_id: 'record-2', policy_id: reportPolicy.policy_id,
      ingest_run_id:'run-report',transformation_version:'v1',dataset_id:'national-business-registry',source_dataset_release_id:'registry-fixture',site_entity_id:'site-2',establishment_entity_id:'est-2',organization_entity_id:null,source_status:null,source_evidence:null,
      export_policy: 'local-review-only', state:'NJ',zip_code: null, zip4: null, geocode: { latitude: 42, longitude: -71 }, identity_matching_eligible: false },
  ];
  const sourceArtifacts = [{ path: 'profiles.jsonl.gz', artifact_type: 'entity-resolution-location-profile-jsonl-gzip', bytes: 10, sha256: '3'.repeat(64) },
    { path: 'reporting.jsonl.gz', artifact_type: 'business-reporting-location-evidence-jsonl-gzip', bytes: 20, sha256: '4'.repeat(64) }];
  const governanceReader = async () => ({ lineage: governanceLineage, registryArtifacts: sourceArtifacts,
    sourcePolicyById: new Map([[matchPolicy.source_id, matchPolicy]]), reportingByRecord: new Map([['record-2', reportQualification]]) });
  const recordBytes = Buffer.from(`${rows.map(row => JSON.stringify(row)).join('\n')}\n`), csvBytes = Buffer.from(`${fields.join(',')}\n${rows.map(row => fields.map(field => quote(row[field])).join(',')).join('\n')}\n`);
  const generatedAt='2026-10-05T00:00:00.000Z';
  const summary = { schema_version: 'flat-business-export-summary@1.1.0', run_id: 'flat-test',generated_at:generatedAt, policy_mode: 'local-review', local_review_only: true,
    record_unit: 'source-profile-or-reporting-site-evidence-row', aggregation_claims: claims, filters: { categories: [], source_ids: [], states: [] },
    counts: { source_rows_read: 2, rows_written: 2, filter_rejected: 0, policy_rejected: 0 }, source_counts: { 'match-source': 1, 'report-source': 1 },
    cohort_counts: { 'matching-profile': 1, 'reporting-only': 1 },
    qualification_counts:Object.fromEntries(['lifecycle_evidence','temporal_review_status','postal_relationship','point_assignment'].map(key=>[key,{'matching-profile|match-source|unmeasured-or-missing':1,'reporting-only|report-source|unmeasured-or-missing':1}])),
    encountered_export_policies: { 'local-review-only': 2 } };
  const summaryBytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(path.join(directory, 'records.jsonl'), recordBytes); await writeFile(path.join(directory, 'records.csv'), csvBytes); await writeFile(path.join(directory, 'summary.json'), summaryBytes);
  const artifacts = [{ path: 'records.jsonl', artifact_type: 'flat-business-jsonl', records: 2, bytes: recordBytes.length, sha256: hash(recordBytes) },
    { path: 'records.csv', artifact_type: 'flat-business-csv', records: 2, bytes: csvBytes.length, sha256: hash(csvBytes) },
    { path: 'summary.json', artifact_type: 'flat-business-summary', bytes: summaryBytes.length, sha256: hash(summaryBytes) }];
  const manifest = { schema_version: 'flat-business-export@1.1.0', dataset_id: 'flat-business-export', release_id: 'flat-test', status: 'published-local',generated_at:generatedAt,policy_mode:'local-review',export_policy:'local-review-only',
    record_unit: 'source-profile-or-reporting-site-evidence-row', aggregation_claims: claims, fields, filters: summary.filters, governance_lineage: governanceLineage,
    source_lineage: [{ dataset_id: 'national-business-registry', release_id: 'registry-fixture', manifest_path: 'fixture/manifest.json', pointer_path:null, manifest_sha256: 'a'.repeat(64),
      lifecycle_release:{release_id:'life-fixture',manifest_sha256:'b'.repeat(64)},geography_relationship_release:{release_id:'geo-fixture',manifest_sha256:'c'.repeat(64)},
      reporting_only_site_qualification_release:{release_id:'report-fixture',manifest_sha256:'d'.repeat(64),registration_sha256:'6'.repeat(64),artifact_sha256:'7'.repeat(64)},artifacts: sourceArtifacts }], summary, summary_path: 'summary.json', artifacts };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`); await writeFile(path.join(directory, 'manifest.json'), manifestBytes);
  return { directory, manifest, manifestSha: hash(manifestBytes), governanceReader, rows, artifacts };
}

test('v1.1 verifier checks matching and reporting-only rows, complete lineage, row equivalence, and expected manifest hash', async t => {
  const f = await fixture(t);
  const verified = await verifyFlatBusinessExport(path.join(f.directory, 'manifest.json'), { root: APP_ROOT, expectedManifestSha256: f.manifestSha, governanceReader: f.governanceReader });
  assert.equal(verified.verified, true); assert.equal(verified.manifest_sha256, f.manifestSha); assert.equal(verified.artifacts.length, 3);
  await assert.rejects(verifyFlatBusinessExport(path.join(f.directory, 'manifest.json'), { root: APP_ROOT, expectedManifestSha256: '0'.repeat(64), governanceReader: f.governanceReader }), /Expected export manifest hash differs/);
});

test('v1.1 verifier rejects policy drift, cohort/claim widening, summary drift, and JSON/CSV divergence', async t => {
  const f = await fixture(t), manifestPath = path.join(f.directory, 'manifest.json');
  const originalManifest = await readFile(manifestPath), originalJson = await readFile(path.join(f.directory, 'records.jsonl'));
  const writeManifest = async mutate => { const manifest = JSON.parse(originalManifest); mutate(manifest); await writeFile(manifestPath, JSON.stringify(manifest)); };
  const restore = async () => { await writeFile(manifestPath, originalManifest); await writeFile(path.join(f.directory, 'records.jsonl'), originalJson); };
  await writeManifest(m => { m.aggregation_claims.entity_resolution_applied = true; });
  await assert.rejects(verifyFlatBusinessExport(manifestPath, { root: APP_ROOT, governanceReader: f.governanceReader }), /widened export manifest/); await restore();
  await writeManifest(m => { m.filters.states=['CA']; });
  await assert.rejects(verifyFlatBusinessExport(manifestPath, { root: APP_ROOT, governanceReader: f.governanceReader }), /Manifest and summary evidence differ/); await restore();
  const changedCohort=JSON.parse(originalJson.toString().trim().split('\n')[0]);changedCohort.cohort_kind='reporting-only';
  const changedCohortBytes=Buffer.from(`${JSON.stringify(changedCohort)}\n${originalJson.toString().trim().split('\n')[1]}\n`);
  await writeFile(path.join(f.directory,'records.jsonl'),changedCohortBytes);await writeManifest(m=>{const item=m.artifacts.find(a=>a.path==='records.jsonl');item.bytes=changedCohortBytes.length;item.sha256=hash(changedCohortBytes);});
  await assert.rejects(verifyFlatBusinessExport(manifestPath,{root:APP_ROOT,governanceReader:f.governanceReader}),/source\/cohort/);await restore();
  const drifted = structuredClone(await f.governanceReader()); drifted.lineage.lifecycle.manifest_sha256='f'.repeat(64);
  await assert.rejects(verifyFlatBusinessExport(manifestPath,{root:APP_ROOT,governanceReader:async()=>drifted}),/lineage differs/);
  const row = JSON.parse(originalJson.toString().trim().split('\n')[0]); row.source_policy_provenance.policy_profile_sha256 = 'f'.repeat(64);
  const changedJson = Buffer.from(`${JSON.stringify(row)}\n${originalJson.toString().trim().split('\n')[1]}\n`); await writeFile(path.join(f.directory, 'records.jsonl'), changedJson);
  await writeManifest(m => { const item=m.artifacts.find(a=>a.path==='records.jsonl');item.bytes=changedJson.length;item.sha256=hash(changedJson); });
  await assert.rejects(verifyFlatBusinessExport(manifestPath, { root: APP_ROOT, governanceReader: f.governanceReader }), /source-policy provenance/); await restore();
  await writeManifest(m => { m.summary.cohort_counts['reporting-only'] = 0; });
  await assert.rejects(verifyFlatBusinessExport(manifestPath, { root: APP_ROOT, governanceReader: f.governanceReader }), /Manifest and summary evidence differ/); await restore();
  const changedCsv=Buffer.from('cohort_kind\nmatching-profile\n');await writeFile(path.join(f.directory, 'records.csv'), changedCsv);
  await writeManifest(m=>{const item=m.artifacts.find(a=>a.path==='records.csv');item.bytes=changedCsv.length;item.sha256=hash(changedCsv);});
  await assert.rejects(verifyFlatBusinessExport(manifestPath, { root: APP_ROOT, governanceReader: f.governanceReader }), /CSV row does not match/);
});
