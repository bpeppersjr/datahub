import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = async relative => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('national registry catalog is exactly bound to the retained current manifest', async () => {
  const catalog = await json('config/datasets/national-business-registry.json');
  const pointer = await json('data/business-registry/current.json');
  const manifestRelative = path.posix.join('data/business-registry', pointer.manifest);
  const manifestBytes = await readFile(path.join(root, manifestRelative));
  const manifest = JSON.parse(manifestBytes);
  const current = catalog.current_release;

  assert.equal(current.output, 'data/business-registry/current.json');
  assert.equal(current.manifest, manifestRelative);
  assert.equal(current.manifest_sha256, sha256(manifestBytes));
  assert.equal(current.release_id, pointer.release_id);
  assert.equal(current.release_id, manifest.release_id);
  assert.equal(current.publisher_version, manifest.publisher.version);
  assert.equal(current.created_at, pointer.updated_at);
  assert.equal(current.created_at, manifest.created_at);
  assert.equal(current.status, pointer.status);
  assert.equal(current.status, manifest.status);
  assert.equal(current.complete_national_business_registry, manifest.complete_national_business_registry);
  assert.equal(catalog.entity_resolution_capability.registry_publisher_version, manifest.publisher.version);

  const coverageKeys = [
    'source_records',
    'source_records_including_retained_childcare',
    'organizations',
    'brands',
    'physical_sites',
    'reporting_location_evidence',
    'establishments',
    'services',
    'assertions',
    'relationships',
    'resolution_location_profiles',
    'zip_union_records',
    'zips_with_record_level_contributions',
    'retained_childcare_candidate_rows',
    'mn_construction_credential_rows',
    'authoritative_current_usps_zip_denominator',
  ];
  for (const key of coverageKeys) assert.equal(current[key], manifest.coverage[key], key);
  assert.equal(current.verified_artifact_count, manifest.artifacts.length);
  assert.equal(current.verified_bytes, manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0));
  assert.equal(current.physical_sites - current.resolution_location_profiles, current.reporting_location_evidence);
  assert.match(catalog.entity_resolution_capability.profile_cardinality, /matching-eligible/);
  assert.match(catalog.entity_resolution_capability.profile_cardinality, /reporting-only location evidence is excluded/);
  assert.match(current.scope_authority, /manifest is authoritative/);
  assert.equal(current.normalized_postal_field_migration_status, 'split-zip5-and-zip4-contract-enforced');
});
