import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile, link, symlink } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { readContainedPolicyProfile, readReportingOnlySiteQualification, verifyReportingOnlySiteQualification } from './reporting-only-site-qualification.mjs';

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
    assert.equal(row.source.policy_profile_sha256.length, 64);
    assert.equal(row.source.source_manifest_policy_sha256.length, 64);
    assert.notEqual(row.source.policy_profile_sha256, row.source.source_manifest_policy_sha256);
    assert.equal(row.source.policy_profile_path, `config/source-policies/${{
      'ma-licensed-center-based-childcare': 'massgis-eec-childcare-local-review',
      'nj-licensed-childcare-centers': 'njdep-childcare-local-review',
      'tn-dhs-active-childcare-centers': 'tn-childcare-local-review',
      'oh-dcy-publisher-open-childcare-centers': 'oh-childcare-local-review',
    }[row.source.source_id]}.json`);
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

test('each raw policy profile is exact-hash-bound separately from embedded manifest policy and temporal semantics', async () => {
  const inputs = [
    ['MA', 'config/source-policies/massgis-eec-childcare-local-review.json', '8a2812e436c3b2bc9c4c88dd2299d406b8d8610cd88f851a9f5f664fa43a4742', 'bc5877f6f0b12a875e59464a71814ce7395e2cd8d292abae57e42f93086d8201'],
    ['NJ', 'config/source-policies/njdep-childcare-local-review.json', '3a935abc814e7f46e6048bdb20ec25c67b3a70aa4cfb81b0d9494a35c9cb26cc', '79c0957df9fcdc66a856e5a6c242e24ef0296179eb93e4c8b298a32df2f61410'],
    ['TN', 'config/source-policies/tn-childcare-local-review.json', '06b8b84549c26d2e3bcabdb89244463ef5fbd525c88170aab548b42267e1110e', '78300cd344afafd62d3a662a30d913871bd3fbd96cb59b03793e11b0b60f3b1b'],
    ['OH', 'config/source-policies/oh-childcare-local-review.json', 'f1aa0c95eb96ba2cb6d10e75ded2011890cea61816d7b8b337ef1081dda4b6e2', '53ead19c9463f270ed5def5eb0f848e46d3288d2a59844c53a8b317cad0b5c98'],
  ];
  const result = await readReportingOnlySiteQualification();
  for (const [state, relativePath, rawSha, embeddedSha] of inputs) {
    const profile = await readContainedPolicyProfile({ relativePath, sourceState: state });
    assert.equal(profile.sha256, rawSha);
    const source = result.provenance.bindings.sources[state];
    assert.equal(source.policy_profile_path, relativePath);
    assert.equal(source.policy_profile_sha256, rawSha);
    assert.equal(source.source_manifest_policy_sha256, embeddedSha);
    const temporal = (await import('./national-business-temporal-claim-matrix-reader.mjs')).readNationalBusinessTemporalClaimRows;
    const semantic = (await temporal()).rows.find(row => row.source_key === ({ MA: 'ma_childcare_centers', NJ: 'nj_childcare_centers', TN: 'tn_childcare_centers', OH: 'oh_childcare_centers' })[state]);
    assert.equal(semantic.policy_path, relativePath);
    assert.equal(semantic.policy_sha256, rawSha);
  }
});

test('reporting policy reader rejects all four changed profiles, path swaps, traversal, links, and oversized input', async () => {
  const profiles = [
    ['MA', 'config/source-policies/massgis-eec-childcare-local-review.json'],
    ['NJ', 'config/source-policies/njdep-childcare-local-review.json'],
    ['TN', 'config/source-policies/tn-childcare-local-review.json'],
    ['OH', 'config/source-policies/oh-childcare-local-review.json'],
  ];
  for (const [state, relativePath] of profiles) {
    const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/reporting-policy-'));
    try {
      const target = path.join(root, relativePath); await mkdir(path.dirname(target), { recursive: true });
      const original = await readFile(path.join(APP_ROOT, relativePath));
      const changed = Buffer.concat([original, Buffer.from(' ')]);
      await writeFile(target, changed);
      await assert.rejects(readContainedPolicyProfile({ root, relativePath, sourceState: state }), /hash|identity/i);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  const state = 'MA', relativePath = 'config/source-policies/massgis-eec-childcare-local-review.json';
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/reporting-policy-path-'));
  try {
    const target = path.join(root, relativePath); await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(APP_ROOT, relativePath), target);
    await assert.rejects(readContainedPolicyProfile({ root, relativePath: `${relativePath}/../massgis-eec-childcare-local-review.json`, sourceState: state }), /path/i);
    const swapped = path.join(root, 'config/source-policies/njdep-childcare-local-review.json');
    await copyFile(path.join(APP_ROOT, 'config/source-policies/njdep-childcare-local-review.json'), swapped);
    await copyFile(swapped, target);
    await assert.rejects(readContainedPolicyProfile({ root, relativePath, sourceState: state }), /hash|identity/i);
    await rm(target);
    // Windows does not permit file symlinks in the standard test profile;
    // a junction exercises the same ancestor-link rejection without elevation.
    await rm(path.dirname(target), { recursive: true, force: true });
    const policyDirectory = path.dirname(target);
    const linkTargetDirectory = path.join(APP_ROOT, 'config/source-policies');
    await symlink(linkTargetDirectory, policyDirectory, 'junction');
    await assert.rejects(readContainedPolicyProfile({ root, relativePath, sourceState: state }), /path/i);
    await rm(policyDirectory, { recursive: true, force: true });
    await mkdir(policyDirectory, { recursive: true });
    await link(path.join(APP_ROOT, relativePath), target);
    await assert.rejects(readContainedPolicyProfile({ root, relativePath, sourceState: state }), /path/i);
    await rm(target);
    await writeFile(target, Buffer.alloc(128_001, 0x20));
    await assert.rejects(readContainedPolicyProfile({ root, relativePath, sourceState: state }), /path/i);
  } finally { await rm(root, { recursive: true, force: true }); }
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
