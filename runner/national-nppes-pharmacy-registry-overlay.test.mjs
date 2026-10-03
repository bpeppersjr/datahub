import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyNationalNppesPharmacyRegistryOverlay as verify } from './national-nppes-pharmacy-registry-overlay.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const catalogPath = path.join(ROOT, 'config/datasets/national-nppes-pharmacy-registry-overlay.json');

test('registered retained overlay independently replays exact NPI membership and zero additivity', async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath));
  const manifestPath = path.join(ROOT, catalog.retained_release.manifest), raw = await fs.readFile(manifestPath);
  assert.equal(digest(raw), catalog.retained_release.manifest_sha256);
  const result = await verify(manifestPath);
  assert.equal(result.verified, true); assert.equal(result.pharmacy_rows, 89_077); assert.equal(result.exact_npi_membership_matches, 89_077);
  assert.equal(result.generic_business_additivity_delta, 0); assert.equal(result.organization_additions, 0); assert.equal(result.site_additions, 0); assert.equal(result.establishment_additions, 0);
  assert.equal(result.jurisdiction_rows, 56); assert.equal(result.zip5_denominator_rows, 48_194); assert.equal(result.positive_zip5_rows, 15_376);
});

test('membership artifact is one-to-one, same-source, nonadditive, and claim-limited', async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), directory = path.dirname(path.join(ROOT, catalog.retained_release.manifest));
  const rows = (await fs.readFile(path.join(directory, 'membership.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse), npis = new Set(rows.map(x => x.npi));
  assert.equal(rows.length, 89_077); assert.equal(npis.size, rows.length);
  assert.ok(rows.every(x => x.classification === 'already-present-same-source-identity' && x.organization_id === `organization:cms_npi_${x.npi}`));
  assert.ok(rows.every(x => !x.registry_entity_addition && !x.registry_site_addition && !x.registry_establishment_addition));
  assert.ok(rows.every(x => x.claims.current_operation === null && x.claims.licensed_pharmacy === null && x.claims.physical_site === false && x.claims.unique_business === null));
});

test('ZIP overlay closes the 48,194-key inventory without upgrading postal or completeness claims', async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), directory = path.dirname(path.join(ROOT, catalog.retained_release.manifest));
  const rows = (await fs.readFile(path.join(directory, 'zip5-overlay.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse), keys = new Set(rows.map(x => x.zip5));
  assert.equal(rows.length, 48_194); assert.equal(keys.size, rows.length); assert.equal(rows.filter(x => x.pharmacy_organization_count > 0).length, 15_376);
  assert.ok(rows.every(x => x.generic_business_additivity_delta === 0 && x.authoritative_current_usps_zip === null && x.current_operating_business_count === null && x.completeness_percent === null));
});

test('release inventory is closed and no current pointer is published', async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), directory = path.dirname(path.join(ROOT, catalog.retained_release.manifest));
  assert.equal(catalog.runtime_pointer, null); assert.equal(catalog.production_enrollment, false);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['jurisdictions.jsonl', 'manifest.json', 'membership.jsonl', 'zip5-overlay.jsonl']);
  await assert.rejects(fs.stat(path.join(ROOT, 'data/national-nppes-pharmacy-registry-overlay/current.json')), { code: 'ENOENT' });
});

test('verifier rejects a release with a foreign inventory member before accepting evidence', async t => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), source = path.dirname(path.join(ROOT, catalog.retained_release.manifest));
  const temporary = await fs.mkdtemp(path.join(ROOT, 'tmp/pharmacy-overlay-test-')); t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const release = path.join(temporary, 'releases', catalog.retained_release.release_id); await fs.mkdir(release, { recursive: true });
  for (const name of await fs.readdir(source)) await fs.copyFile(path.join(source, name), path.join(release, name));
  await fs.writeFile(path.join(release, 'foreign.txt'), 'not governed');
  await assert.rejects(verify(path.join(release, 'manifest.json'), { root: ROOT }), /release location\/boundary|closed inventory/);
});
