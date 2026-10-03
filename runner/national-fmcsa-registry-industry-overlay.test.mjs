import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildNationalFmcsaRegistryIndustryOverlay as build, readSecureOverlayFileForTest as secureRead, validateFmcsaJurisdictionConservation, validateFmcsaOverlayIdentity, validateFmcsaZipConservation, verifyNationalFmcsaRegistryIndustryOverlay as verify } from './national-fmcsa-registry-industry-overlay.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const catalogPath = path.join(ROOT, 'config/datasets/national-fmcsa-registry-industry-overlay.json');

test('registered FMCSA overlay independently replays exact USDOT/site/establishment membership', { timeout: 240_000 }, async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), manifest = path.join(ROOT, catalog.retained_release.manifest), raw = await fs.readFile(manifest);
  assert.equal(digest(raw), catalog.retained_release.manifest_sha256);
  const result = await verify(manifest);
  assert.equal(result.verified, true); assert.equal(result.fmcsa_rows, 2_195_563); assert.equal(result.exact_usdot_membership_matches, 2_195_563);
  assert.equal(result.exact_site_identity_matches, 2_195_563); assert.equal(result.exact_establishment_identity_matches, 2_195_563);
  assert.equal(result.missing_identities, 0); assert.equal(result.extra_identities, 0); assert.equal(result.organization_additions, 0); assert.equal(result.site_additions, 0); assert.equal(result.establishment_additions, 0); assert.equal(result.generic_business_additivity_delta, 0);
  assert.equal(result.jurisdiction_rows, 56); assert.equal(result.zip5_denominator_rows, 48_194); assert.equal(result.positive_zip5_rows, 35_648);
  assert.equal(result.claims.roles_and_classes_exclusive, false); assert.equal(result.claims.unique_business, false); assert.equal(result.claims.current_operation_beyond_source, false); assert.equal(result.claims.authoritative_current_usps_zip_denominator, null);
});

test('identity validation rejects malformed and duplicate USDOT membership', () => {
  const row = { external_identifiers: [{ type: 'usdot_number', value: '123' }], entity_candidates: { physical_site_id: 'site:fmcsa_usdot_123_principal_office', establishment_id: 'establishment:fmcsa_usdot_123_principal_office' } }, seen = new Set();
  assert.deepEqual(validateFmcsaOverlayIdentity(row, seen), { dot: '123', site: 'site:fmcsa_usdot_123_principal_office', establishment: 'establishment:fmcsa_usdot_123_principal_office' });
  assert.throws(() => validateFmcsaOverlayIdentity(row, seen), /duplicate USDOT/);
  assert.throws(() => validateFmcsaOverlayIdentity({ ...row, entity_candidates: { ...row.entity_candidates, physical_site_id: 'site:wrong' } }), /source identity/);
});

test('jurisdiction and ZIP conservation reject duplicate, malformed, omitted, and changed aggregates', () => {
  const jurisdictions = [{ code: 'AA', accepted_principal_office_count: 2 }, { code: 'BB', accepted_principal_office_count: 3 }]; assert.equal(validateFmcsaJurisdictionConservation(jurisdictions, 2, 5), true);
  assert.throws(() => validateFmcsaJurisdictionConservation([jurisdictions[0], jurisdictions[0]], 2, 4), /jurisdiction identity/); assert.throws(() => validateFmcsaJurisdictionConservation(jurisdictions, 2, 6), /jurisdiction conservation/);
  const zips = [{ zip5: '00001', count: 2 }, { zip5: '00002', count: 0 }]; assert.equal(validateFmcsaZipConservation(zips, 2, 1, 2), true);
  assert.throws(() => validateFmcsaZipConservation([{ zip5: 'bad', count: 2 }], 1, 1, 2), /ZIP identity/); assert.throws(() => validateFmcsaZipConservation([zips[0], zips[0]], 2, 2, 4), /ZIP identity/); assert.throws(() => validateFmcsaZipConservation(zips, 2, 0, 2), /ZIP conservation/);
});

test('release is pointer-free, closed, sharded, and nonadditive', async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), manifest = JSON.parse(await fs.readFile(path.join(ROOT, catalog.retained_release.manifest)));
  assert.equal(catalog.runtime_pointer, null); assert.equal(catalog.production_enrollment, false); assert.equal(catalog.additive_to_generic_business_totals, false);
  assert.equal(manifest.processing.maximum_source_shards_in_memory, 1); assert.equal(manifest.artifacts.filter(x => x.path.startsWith('membership/')).length, 10);
  assert.equal(manifest.artifacts.filter(x => x.path.startsWith('membership/')).reduce((n, x) => n + x.record_count, 0), 2_195_563);
  await assert.rejects(fs.stat(path.join(ROOT, 'data/national-fmcsa-registry-industry-overlay/current.json')), { code: 'ENOENT' });
});

test('verifier rejects foreign or incomplete inventory before replay', async t => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), source = path.join(ROOT, catalog.retained_release.manifest), temporary = await fs.mkdtemp(path.join(ROOT, 'tmp/fmcsa-overlay-test-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true })); const release = path.join(temporary, 'releases', catalog.retained_release.release_id); await fs.mkdir(path.join(release, 'membership'), { recursive: true });
  await fs.copyFile(source, path.join(release, 'manifest.json')); await fs.writeFile(path.join(release, 'foreign.txt'), 'not governed');
  await assert.rejects(verify(path.join(release, 'manifest.json'), { root: ROOT }), /closed inventory/);
});

test('secure reads reject symlinks and same-size same-mtime named replacements', async t => {
  const temporary = await fs.mkdtemp(path.join(ROOT, 'tmp/fmcsa-secure-read-')); t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const original = path.join(temporary, 'input.json'), alias = path.join(temporary, 'alias.json'), backup = path.join(temporary, 'backup.json'); await fs.writeFile(original, '12345678');
  try { await fs.symlink(original, alias); await assert.rejects(secureRead(ROOT, alias, 100), /symlink|canonical/); } catch (error) { if (error.code !== 'EPERM') throw error; }
  const hardlink = path.join(temporary, 'hardlink.json'); await fs.link(original, hardlink); await assert.rejects(secureRead(ROOT, original, 100), /unsafe input identity/); await fs.unlink(hardlink);
  const stamp = (await fs.stat(original)).mtime; await assert.rejects(secureRead(ROOT, original, 100, async () => { await fs.rename(original, backup); await fs.writeFile(original, '87654321'); await fs.utimes(original, stamp, stamp); }), /identity changed/);
});

test('post-manifest failure and post-verification cancellation publish no immutable release', { timeout: 600_000 }, async () => {
  const releases = path.join(ROOT, 'data/national-fmcsa-registry-industry-overlay/releases'), before = new Set(await fs.readdir(releases));
  await assert.rejects(build({ _testHooks: async phase => { if (phase === 'after-manifest-before-verification') throw new Error('injected'); } }), /injected/);
  const controller = new AbortController(); await assert.rejects(build({ signal: controller.signal, _testHooks: async phase => { if (phase === 'after-verification-before-publication') controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(new Set(await fs.readdir(releases)), before); assert.equal((await fs.readdir(path.dirname(releases))).some(x => x.startsWith('.stage-')), false);
});

test('mid-shard cancellation destroys the gzip pipeline and cleans unpublished staging', { timeout: 30_000 }, async () => {
  const releases = path.join(ROOT, 'data/national-fmcsa-registry-industry-overlay/releases'), base = path.dirname(releases), before = new Set(await fs.readdir(releases)), controller = new AbortController();
  await assert.rejects(build({ signal: controller.signal, _testHooks: async (phase, context) => { if (phase === 'membership-row' && context.prefix === 0 && context.membershipRows === 100) controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(new Set(await fs.readdir(releases)), before); assert.equal((await fs.readdir(base)).some(x => x.startsWith('.stage-') || x === '.build.lock'), false);
});

test('mid-shard sink failure settles streams and cleans unpublished staging', { timeout: 30_000 }, async () => {
  const releases = path.join(ROOT, 'data/national-fmcsa-registry-industry-overlay/releases'), base = path.dirname(releases), before = new Set(await fs.readdir(releases));
  const started = Date.now(); await assert.rejects(build({ _testHooks: async (phase, context) => { if (phase === 'membership-row' && context.prefix === 0 && context.membershipRows === 100) context.sink.destroy(new Error('injected write failure')); } }), /injected write failure|premature close|stream was destroyed/); assert.ok(Date.now() - started < 10_000, 'asynchronous sink failure must reject promptly');
  assert.deepEqual(new Set(await fs.readdir(releases)), before); assert.equal((await fs.readdir(base)).some(x => x.startsWith('.stage-') || x === '.build.lock'), false);
});
