import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { readBusinessEntitySourcePolicyProvenance } from './business-entity-source-policy-provenance.mjs';
import { readNationalBusinessTemporalClaimRows } from './national-business-temporal-claim-matrix-reader.mjs';

const registrationPath = 'config/datasets/business-entity-source-policy-provenance.json';
const expectedProfileCount = 8_011_213;
async function readJson(file) { return JSON.parse(await readFile(path.join(APP_ROOT, file), 'utf8')); }
async function copyBoundedFixture(root, provenance) {
  const files = new Set([
    'config/datasets/national-business-registry.json',
    'config/datasets/business-entity-lifecycle-eligibility-taxonomy.json',
    'config/datasets/business-entity-lifecycle-eligibility.json',
    'config/datasets/national-business-temporal-claim-matrix.json',
    registrationPath,
  ]);
  const registry = await readJson('config/datasets/national-business-registry.json');
  const lifecycle = await readJson('config/datasets/business-entity-lifecycle-eligibility.json');
  const temporal = await readJson('config/datasets/national-business-temporal-claim-matrix.json');
  const inventory = await readJson(registrationPath);
  const registryManifest = registry.current_release.manifest;
  const lifecycleManifest = lifecycle.retained_releases.find(row => row.selected).manifest;
  const temporalPin = temporal.retained_releases.find(row => row.selected);
  const inventoryPin = inventory.retained_releases.find(row => row.selected);
  files.add(registryManifest); files.add(lifecycleManifest); files.add(temporalPin.manifest_path);
  files.add(inventoryPin.manifest_path);
  const temporalManifest = await readJson(temporalPin.manifest_path);
  files.add(path.posix.join(path.posix.dirname(temporalPin.manifest_path), temporalManifest.artifacts[0].path));
  const inventoryManifest = await readJson(inventoryPin.manifest_path);
  files.add(path.posix.join(path.posix.dirname(inventoryPin.manifest_path), inventoryManifest.artifact.path));
  files.add(inventoryManifest.bindings.lifecycle.manifest_path);
  const policyMutationFiles = [], registrationMutationFiles = new Set();
  for (const row of provenance.rows) {
    files.add(row.dataset_registration_path); files.add(row.runtime_dataset_registration_path); files.add(row.source_manifest_path); files.add(row.policy_profile_path);
    for (const [current, expected] of [[row.dataset_registration_path, row.dataset_registration_sha256], [row.runtime_dataset_registration_path, row.runtime_dataset_registration_sha256]]) {
      const retained = `config/datasets/retained/${expected}.json`;
      if (await readFile(path.join(APP_ROOT, retained)).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))) {
        files.add(retained); registrationMutationFiles.add(retained);
      } else registrationMutationFiles.add(current);
    }
    const retained = `config/source-policies/retained/${row.policy_profile_sha256}.json`;
    if (await readFile(path.join(APP_ROOT, retained)).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))) {
      files.add(retained); policyMutationFiles.push(retained);
    } else policyMutationFiles.push(row.policy_profile_path);
  }
  for (const relative of files) {
    const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(APP_ROOT, relative), target);
  }
  return { files, inventory, policyMutationFiles, registrationMutationFiles: [...registrationMutationFiles] };
}

test('registered November source-policy inventory conserves all 15 sources and the NY snapshot membership change', async () => {
  const value = await readBusinessEntitySourcePolicyProvenance();
  assert.equal(value.release_id, 'business-entity-source-policy-provenance-ffd0c199435fbe1447774f149cf6eaba7f502a0c96da7851ef6b2354f934510f');
  assert.equal(value.registration_sha256, '619e3768bd89717d228caeaf1821de9438cde5a8899a35da13bf064123704564');
  assert.equal(value.manifest_sha256, '5809e881502f503b410c05f104234de31574b2e62a48effb276b311fb063401b');
  assert.equal(value.artifact_sha256, 'abe3f83ff6d54e64ab78d1e7a1aa5bdebf252121c640238bef4d6cf99b37b0b4');
  assert.equal(value.temporal_release_id, 'national-business-temporal-claim-matrix-ff98f93ab4373d21a55c5db5ff85f43e1259236c6b11349601097c1c1ea635fd');
  assert.equal(value.temporal_manifest_sha256, '1890a7941062ac71e79c25b773a56ecd122b9abf00f8173cd4d8f1a00fb9c7b8');
  assert.equal(value.rows.length, 15); assert.equal(value.record_count, 15);
  assert.equal(value.summary.profile_count, expectedProfileCount);
  assert.equal(value.rows.reduce((sum, row) => sum + row.profile_count, 0), expectedProfileCount);
  assert.equal(new Set(value.rows.map(row => row.source_id)).size, 15);
  assert.equal(value.summary.profile_export_policy_counts['local-review-only'], 1849997);
  assert.equal(value.summary.profile_export_policy_counts.public, 6161216);
  assert.equal(value.summary.active_business_eligible, false); assert.equal(value.summary.current_operation_verified, false);
  assert.equal(value.summary.source_acquisition_performed, false); assert.equal(value.summary.network_requests, 0);
  const nySource = 'new-york-agriculture-markets-retail-food-stores';
  const previous = await readJson('data/business-entity-source-policy-provenance/releases/business-entity-source-policy-provenance-d477ffbcd6e0b6aa382e56d9b299cb17f11d1f2690febdaed61f63e8eb3dc803/manifest.json');
  const previousCounts = previous.summary.source_profile_counts;
  assert.deepEqual(Object.keys(value.summary.source_profile_counts), Object.keys(previousCounts));
  const changes = value.rows.map(row => [row.source_id, row.profile_count - previousCounts[row.source_id]]).filter(([, delta]) => delta !== 0);
  assert.deepEqual(changes, [[nySource, -622]]);
  const temporal = await readNationalBusinessTemporalClaimRows();
  const nyMembership = temporal.rows.find(row => row.profile_source_id === nySource);
  assert.equal(nyMembership.classification, 'non-active-reporting-membership');
  assert.equal(nyMembership.source_status_term, 'annual license snapshot membership');
  assert.ok(value.rows.every(row => row.policy_profile_sha256 === row.temporal_policy_sha256 && row.lifecycle_policy_sha256 === row.temporal_policy_sha256));
  assert.ok(value.rows.every(row => row.source_manifest_policy.status === 'present' || row.source_manifest_policy.status === 'absent-in-selected-source-manifest'));
  assert.notEqual(value.rows[0].source_manifest_policy.sha256, value.rows[0].policy_profile_sha256);
});

test('policy inventory replay rejects raw policy, source manifest, registration, and inventory artifact drift', async () => {
  const provenance = await readBusinessEntitySourcePolicyProvenance();
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/source-policy-provenance-'));
  try {
    const { files, policyMutationFiles, registrationMutationFiles } = await copyBoundedFixture(root, provenance);
    assert.equal((await readBusinessEntitySourcePolicyProvenance({ root })).rows.length, 15);
    const mutations = [
      ...policyMutationFiles,
      ...provenance.rows.map(row => row.source_manifest_path),
      ...registrationMutationFiles,
      registrationPath,
      path.posix.join('data/business-entity-source-policy-provenance/releases', provenance.release_id, 'source-policies.json'),
    ];
    for (const relative of mutations) {
      const file = path.join(root, relative), original = await readFile(file);
      try {
        await writeFile(file, Buffer.concat([original, Buffer.from(' ')]));
        const rejected = await readBusinessEntitySourcePolicyProvenance({ root }).then(() => false, () => true);
        assert.equal(rejected, true, relative);
      } finally { await writeFile(file, original); }
    }
    const policyA = path.join(root, policyMutationFiles[0]), policyB = path.join(root, policyMutationFiles[1]);
    const originalA = await readFile(policyA), sourceB = await readFile(policyB);
    try { await writeFile(policyA, sourceB); await assert.rejects(readBusinessEntitySourcePolicyProvenance({ root })); }
    finally { await writeFile(policyA, originalA); }
    assert.equal((await readBusinessEntitySourcePolicyProvenance({ root })).summary.profile_count, expectedProfileCount);
    assert.ok(files.size > 40);
  } finally { await rm(root, { recursive: true, force: true }); }
});
