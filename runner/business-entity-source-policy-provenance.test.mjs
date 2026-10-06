import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { readBusinessEntitySourcePolicyProvenance } from './business-entity-source-policy-provenance.mjs';

const registrationPath = 'config/datasets/business-entity-source-policy-provenance.json';
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
  for (const row of provenance.rows) {
    files.add(row.dataset_registration_path); files.add(row.source_manifest_path); files.add(row.policy_profile_path);
  }
  for (const relative of files) {
    const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(APP_ROOT, relative), target);
  }
  return { files, inventory };
}

test('registered source-policy inventory conserves all 15 exact sources and 8,011,835 profiles without granting authority', async () => {
  const value = await readBusinessEntitySourcePolicyProvenance();
  assert.equal(value.release_id, 'business-entity-source-policy-provenance-62ad90b4ae761c62925b247007f52dfe0872fcb908022839911f26e1d1db82fa');
  assert.equal(value.registration_sha256, 'f26841a676fe6bb808bbfad6fcd46cca9c8979433f62805651129d0a32b2fcc2');
  assert.equal(value.manifest_sha256, '5db207e18512b9a805b6bdf954be9c818db8d5c1b585a144fa90fb0a20cbc9ac');
  assert.equal(value.artifact_sha256, '66a14e200366041c44a1c5ba6d5dd5f955d868d817fd29daba7cb364973bb82d');
  assert.equal(value.temporal_release_id, 'national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090');
  assert.equal(value.temporal_manifest_sha256, '342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05');
  assert.equal(value.rows.length, 15); assert.equal(value.record_count, 15);
  assert.equal(value.summary.profile_count, 8011835);
  assert.equal(value.rows.reduce((sum, row) => sum + row.profile_count, 0), 8011835);
  assert.equal(new Set(value.rows.map(row => row.source_id)).size, 15);
  assert.equal(value.summary.profile_export_policy_counts['local-review-only'], 1850619);
  assert.equal(value.summary.profile_export_policy_counts.public, 6161216);
  assert.equal(value.summary.active_business_eligible, false); assert.equal(value.summary.current_operation_verified, false);
  assert.equal(value.summary.source_acquisition_performed, false); assert.equal(value.summary.network_requests, 0);
  assert.ok(value.rows.every(row => row.policy_profile_sha256 === row.temporal_policy_sha256 && row.lifecycle_policy_sha256 === row.temporal_policy_sha256));
  assert.ok(value.rows.every(row => row.source_manifest_policy.status === 'present' || row.source_manifest_policy.status === 'absent-in-selected-source-manifest'));
  assert.notEqual(value.rows[0].source_manifest_policy.sha256, value.rows[0].policy_profile_sha256);
});

test('policy inventory replay rejects raw policy, source manifest, registration, and inventory artifact drift', async () => {
  const provenance = await readBusinessEntitySourcePolicyProvenance();
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/source-policy-provenance-'));
  try {
    const { files } = await copyBoundedFixture(root, provenance);
    assert.equal((await readBusinessEntitySourcePolicyProvenance({ root })).rows.length, 15);
    const mutations = [
      ...provenance.rows.map(row => row.policy_profile_path),
      ...provenance.rows.map(row => row.source_manifest_path),
      ...provenance.rows.map(row => row.dataset_registration_path),
      registrationPath,
      path.posix.join('data/business-entity-source-policy-provenance/releases', provenance.release_id, 'source-policies.json'),
    ];
    for (const relative of mutations) {
      const file = path.join(root, relative), original = await readFile(file);
      try {
        await writeFile(file, Buffer.concat([original, Buffer.from(' ')]));
        await assert.rejects(readBusinessEntitySourcePolicyProvenance({ root }));
      } finally { await writeFile(file, original); }
    }
    const policyA = path.join(root, provenance.rows[0].policy_profile_path), policyB = path.join(root, provenance.rows[1].policy_profile_path);
    const originalA = await readFile(policyA), sourceB = await readFile(policyB);
    try { await writeFile(policyA, sourceB); await assert.rejects(readBusinessEntitySourcePolicyProvenance({ root })); }
    finally { await writeFile(policyA, originalA); }
    assert.equal((await readBusinessEntitySourcePolicyProvenance({ root })).summary.profile_count, 8011835);
    assert.ok(files.size > 40);
  } finally { await rm(root, { recursive: true, force: true }); }
});
