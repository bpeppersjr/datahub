import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { readReportingOnlySiteQualification, verifyReportingOnlySiteQualification } from './reporting-only-site-qualification.mjs';

test('reporting-only qualification conserves 13,182 source sites outside matching profiles', async () => {
  const result = await verifyReportingOnlySiteQualification();
  assert.equal(result.status, 'verified');
  assert.equal(result.summary.site_count, 13182);
  assert.equal(result.summary.matching_profile_count, 0);
  assert.deepEqual(result.summary.by_source, { MA: 3007, NJ: 4075, TN: 1863, OH: 4237 });
  assert.deepEqual(result.summary.zip, { present: 13010, absent: 172, 'missing-source-zip': 27, 'invalid-source-zip-placeholder': 145 });
  assert.deepEqual(result.summary.point_assignment, {
    'assigned-single-county': 8942, unmatched: 0, ambiguous: 0, 'missing-geocode': 3, 'invalid-coordinate': 0,
    'assignment-ineligible-by-source-policy': 4237,
  });
  assert.deepEqual(result.summary.physical_site_denominator, { matching_profiles: 8011835, reporting_only_sites: 13182, combined_retained_site_evidence: 8025017 });
  assert.deepEqual(result.summary.source_status_counts.MA, { Current: 2561, 'Renewal in progress': 431, Expired: 13, 'Regional Enrollment Freeze': 2 });
  assert.deepEqual(result.summary.source_status_counts.NJ, { null: 4075 });
  assert.deepEqual(result.summary.source_status_counts.TN, { Active: 1863 });
  assert.deepEqual(result.summary.source_status_counts.OH, { Open: 4237 });
  assert.equal(result.summary.current_operation_verified, 0);
  assert.equal(result.summary.active_business_verified, 0);
  assert.equal(result.summary.active_business_eligible, 0);
  assert.equal(result.summary.identity_matching_eligible, 0);
  assert.equal(result.summary.temporal_review_unmeasured, 13182);
});

test('row decisions retain source identities/status/provenance while keeping ZIP, ZCTA and operation claims separate', async () => {
  const result = await readReportingOnlySiteQualification();
  assert.equal(result.provenance.record_count, 13182);
  assert.equal(result.provenance.claims.current_operation_verified, false);
  assert.equal(result.provenance.claims.usps_deliverability_verified, false);
  assert.equal(result.provenance.claims.entity_polygons_present, false);
  assert.equal(result.byRecord.size, 13182);
  const rows = result.rows;
  assert.equal(new Set(rows.map(row => row.site_entity_id)).size, 13182);
  assert.equal(new Set(rows.map(row => row.establishment_entity_id)).size, 13182);
  assert.equal(new Set(rows.map(row => row.source.source_record_id)).size, 13182);
  assert.ok(new Set(rows.filter(row => row.geography.postal.zip_code).map(row => row.geography.postal.zip_code)).size < 13010,
    'repeated ZIP/address geography is retained as multiple source rows rather than merged');
  for (const row of rows) {
    assert.equal(row.cohort_kind, 'reporting-only');
    assert.equal(row.identity_matching_eligible, false);
    assert.equal(row.current_operation_verified, false);
    assert.equal(row.active_business_verified, false);
    assert.equal(row.active_business_eligible, false);
    assert.equal(row.source.export_policy, 'local-review-only');
    assert.equal(row.lifecycle.review_status, 'unmeasured');
    assert.equal(row.lifecycle.current_operation_verified, false);
    assert.equal(row.lifecycle.active_business_eligible, false);
    assert.equal(row.geography.postal.usps_operational_assignment, null);
    assert.equal(row.geography.postal.usps_deliverability, null);
    assert.equal(row.geography.code_correspondence.membership, false);
    assert.equal(row.geography.point_assignment.zcta_geoid, undefined);
    assert.equal(row.geography.claims.entity_polygon_present, false);
    assert.equal(row.source_status && typeof row.source_status, 'object');
    assert.equal(row.source.row_observed_at, row.source_status ? row.source.row_observed_at : null);
    assert.equal(row.source.source_manifest_sha256.length, 64);
    assert.equal(row.source.policy_sha256.length, 64);
  }
  const maCurrent = rows.find(row => row.source.source_id === 'ma-licensed-center-based-childcare' && row.source_status.status_source === 'Current');
  const maFreeze = rows.find(row => row.source.source_id === 'ma-licensed-center-based-childcare' && row.source_status.status_source === 'Regional Enrollment Freeze');
  const nj = rows.find(row => row.source.source_id === 'nj-licensed-childcare-centers');
  const tnGap = rows.find(row => row.source.source_id === 'tn-dhs-active-childcare-centers' && row.geography.postal.zip_code === null);
  const oh = rows.find(row => row.source.source_id === 'oh-dcy-publisher-open-childcare-centers');
  assert.equal(maCurrent.lifecycle.lifecycle_evidence, 'non-active-reporting');
  assert.equal(maFreeze.lifecycle.lifecycle_evidence, 'unknown');
  assert.equal(nj.lifecycle.lifecycle_evidence, 'unknown');
  assert.equal(tnGap.geography.postal.zip_unavailable_reason, 'missing-source-zip');
  assert.equal(oh.geography.point_assignment.status, 'assignment-ineligible-by-source-policy');
  assert.equal(oh.geography.claims.governed_geographic_assignment_eligible, false);
});

test('reporting-only qualification artifact hash fails closed without changing retained inputs', async () => {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/reporting-site-qualification-'));
  try {
    const configDir = path.join(root, 'config/datasets'); await mkdir(configDir, { recursive: true });
    const selected = JSON.parse(await readFile(path.join(APP_ROOT, 'config/datasets/reporting-only-site-qualification.json'), 'utf8'))
      .retained_releases.find(row => row.selected);
    const targetManifest = path.join(root, selected.manifest); await mkdir(path.dirname(targetManifest), { recursive: true });
    await copyFile(path.join(APP_ROOT, selected.manifest), targetManifest);
    await copyFile(path.join(APP_ROOT, path.dirname(selected.manifest), 'sites.jsonl.gz'), path.join(path.dirname(targetManifest), 'sites.jsonl.gz'));
    await writeFile(path.join(configDir, 'reporting-only-site-qualification.json'), await readFile(path.join(APP_ROOT, 'config/datasets/reporting-only-site-qualification.json')));
    const outputFile = path.join(path.dirname(targetManifest), 'sites.jsonl.gz');
    const bytes = await readFile(outputFile); bytes[0] ^= 1; await writeFile(outputFile, bytes);
    await assert.rejects(readReportingOnlySiteQualification({ root }), /rejected|hash|integrity/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('reporting-only qualification reader honors cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readReportingOnlySiteQualification({ signal: controller.signal }), /abort/i);
});
