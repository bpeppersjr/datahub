import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { auditBusinessTemporalConservation } from './business-temporal-conservation-audit.mjs';
import { main as auditCli } from '../scripts/audit-business-temporal-conservation.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value));
async function fixture(t) {
  await mkdir(path.join(APP_ROOT, 'data/tmp'), { recursive: true }); const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/temporal-conservation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function dataset(name, id, release, artifacts, coverage, dependencies = [], extra = {}) {
    const base = path.join(root, 'data', name), directory = path.join(base, 'releases', release); await mkdir(directory, { recursive: true });
    const declared = [];
    for (const artifact of artifacts) {
      const bytes = artifact.gzip ? gzipSync(Buffer.from(`${artifact.rows.map(row => JSON.stringify(row)).join('\n')}\n`)) : json(artifact.value);
      const file = path.join(directory, artifact.path); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
      declared.push({ path: artifact.path, artifact_type: artifact.type, bytes: bytes.length, sha256: hash(bytes), record_count: artifact.gzip ? artifact.rows.length : 1 });
    }
    const manifest = { schema_version: 'fixture', dataset_id: id, release_id: release, status: 'published-partial', artifacts: declared, coverage, dependencies, ...extra };
    const manifestBytes = json(manifest); await writeFile(path.join(directory, 'manifest.json'), manifestBytes);
    await writeFile(path.join(base, 'current.json'), json({ dataset_id: id, release_id: release, manifest: `releases/${release}/manifest.json` }));
    return { manifest, manifestSha256: hash(manifestBytes), directory };
  }
  const provenance = { source_id: 'source-a', source_release_id: 'source-a-release' };
  const profiles = [{ source: provenance, source_status: { value: 'Active (source-defined)', general_operating_status_inferred: false }, observed_at: '2026-09-01T00:00:00.000Z' },
    { source: provenance, source_status: null, observed_at: null }];
  const reporting = [{ source: { source_id: 'childcare-a', source_release_id: 'childcare-release' }, identity_matching_eligible: false, source_status: { active_business_verified: false } }];
  const registry = await dataset('business-registry', 'national-business-registry', 'registry-1', [
    { path: 'profiles/p.jsonl.gz', type: 'entity-resolution-location-profile-jsonl-gzip', gzip: true, rows: profiles },
    { path: 'reporting/c.jsonl.gz', type: 'business-reporting-location-evidence-jsonl-gzip', gzip: true, rows: reporting },
  ], { resolution_location_profiles: 2, reporting_location_evidence: 1 });
  const dependency = (id, release_id, manifest_sha256) => ({ dataset_id: id, release_id, manifest_sha256 });
  const decisions = [{ decision_type: 'automatic-link', decision_status: 'active', source: provenance, observed_at: '2026-09-01T00:00:00.000Z' },
    { decision_type: 'review-candidate', decision_status: 'pending-review', evidence: { source_ids: ['source-a', 'source-b'] }, decided_at: '2026-09-02T00:00:00.000Z' }];
  const resolution = await dataset('business-entity-resolution', 'national-business-entity-resolution', 'resolution-1', [
    { path: 'decisions/d.jsonl.gz', type: 'entity-resolution-decision-jsonl-gzip', gzip: true, rows: decisions },
  ], { profiles: 2 }, [dependency('national-business-registry', 'registry-1', registry.manifestSha256)]);
  const retainedRegistry = { release_id: 'registry-1', mn_construction_credential_reporting: { current_operations_verified: false, active_business_count: null, identity_matching_eligible: false } };
  const coverage = await dataset('business-coverage-views', 'national-business-coverage-views', 'coverage-1', [
    { path: 'evidence/registry-manifest.json', type: 'retained-registry-manifest-json', value: retainedRegistry },
    { path: 'views/sources.jsonl', type: 'source-coverage-view-jsonl', gzip: true, rows: [] },
  ], { location_profiles_assessed: 2 }, [dependency('national-business-registry', 'registry-1', registry.manifestSha256), dependency('national-business-entity-resolution', 'resolution-1', resolution.manifestSha256)], {
    retained_childcare_reporting: { summary: { candidate_rows: 7, current_operations_verified: false, identity_matching_eligible: false, national_completeness_percent: null } },
    mn_construction_credential_reporting: { selected_cohort_rows: 11, identity_matching_applied: false, public_export_authorized: false },
  });
  const sourceBytes = Buffer.from(`${JSON.stringify({ profile_source_id: 'source-a', location_profile_geography: { profile_count: 2, earliest_observed_at: '2026-09-01T00:00:00.000Z', latest_observed_at: '2026-09-01T00:00:00.000Z' } })}\n`);
  const sourceArtifact = coverage.manifest.artifacts.find(item => item.artifact_type === 'source-coverage-view-jsonl'); sourceArtifact.bytes = sourceBytes.length; sourceArtifact.sha256 = hash(sourceBytes); sourceArtifact.record_count = 1;
  await writeFile(path.join(coverage.directory, sourceArtifact.path), sourceBytes); const coverageManifestBytes = json(coverage.manifest); await writeFile(path.join(coverage.directory, 'manifest.json'), coverageManifestBytes); coverage.manifestSha256 = hash(coverageManifestBytes);
  return { root, registry, resolution, coverage };
}

test('audits status, observation, lineage and extension claim boundaries', async t => {
  const f = await fixture(t), result = await auditBusinessTemporalConservation({ root: f.root });
  assert.deepEqual(result.counts, { registryLocationProfiles: 2, resolutionProfiles: 2, coverageProfilesAssessed: 2, resolutionDecisions: 2, activeDecisionLifecycleRows: 1 });
  assert.deepEqual(result.claims, { activeDecisionMeansBusinessActive: false, generalBusinessOperationInferred: false, coverageRetainsPerRecordStatusDistribution: false });
  assert.equal(result.sources[0].sourceStatusPresent, 1); assert.equal(result.sources[0].sourceStatusMissing, 1);
  assert.equal(result.sources[0].observedAtPresent, 1); assert.equal(result.sources[0].observedAtMissing, 1);
  assert.equal(result.extensions.reportingOnlyChildcareRows, 1); assert.equal(result.extensions.retainedChildcare.currentOperationsVerified, false);
  assert.equal(result.extensions.mnCredentials.activeBusinessCount, null);
});

test('rejects lineage drift, artifact tampering and business-active claims in decisions', async t => {
  for (const change of ['lineage', 'artifact', 'decision']) {
    const f = await fixture(t);
    if (change === 'lineage') { f.coverage.manifest.dependencies[0].manifest_sha256 = '0'.repeat(64); await writeFile(path.join(f.coverage.directory, 'manifest.json'), json(f.coverage.manifest)); }
    if (change === 'artifact') { await writeFile(path.join(f.registry.directory, 'profiles/p.jsonl.gz'), Buffer.from('changed')); }
    if (change === 'decision') {
      const bytes = gzipSync(Buffer.from(`${JSON.stringify({ decision_type: 'automatic-link', decision_status: 'active', source: { source_id: 'source-a', source_release_id: 'source-a-release' }, observed_at: '2026-09-01T00:00:00.000Z', active_business: true })}\n`));
      await writeFile(path.join(f.resolution.directory, 'decisions/d.jsonl.gz'), bytes); const artifact = f.resolution.manifest.artifacts[0]; artifact.bytes = bytes.length; artifact.sha256 = hash(bytes);
      const manifestBytes = json(f.resolution.manifest); await writeFile(path.join(f.resolution.directory, 'manifest.json'), manifestBytes);
      f.coverage.manifest.dependencies.find(item => item.dataset_id === 'national-business-entity-resolution').manifest_sha256 = hash(manifestBytes); await writeFile(path.join(f.coverage.directory, 'manifest.json'), json(f.coverage.manifest));
    }
    await assert.rejects(auditBusinessTemporalConservation({ root: f.root }));
  }
});

test('honors cancellation before retained artifact scanning', async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort(Error('stop'));
  await assert.rejects(auditBusinessTemporalConservation({ root: f.root, signal: controller.signal }), /stop|abort/i);
});

test('CLI rejects overrides that could redirect the governed read-only audit', async () => {
  await assert.rejects(auditCli(['--root', 'elsewhere']), /accepts no arguments/);
});
