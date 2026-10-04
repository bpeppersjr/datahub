import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { buildNationalIrsEoRegistryIndustryOverlay as build, readOverlayArtifactForTest as readArtifact, readSecureOverlayFileForTest as secureRead, validateIrsEoJurisdictionConservation, validateIrsEoOverlayIdentity, validateIrsEoZipConservation, verifyNationalIrsEoRegistryIndustryOverlay as verify } from './national-irs-eo-registry-industry-overlay.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const catalogPath = path.join(ROOT, 'config/datasets/national-irs-eo-registry-industry-overlay.json');
const unrelatedStageName = '.stage-000-unrelated-historical-sentinel';

async function isolatedOutput(t) {
  const outputRoot = await fs.mkdtemp(path.join(ROOT, 'tmp/irs-eo-overlay-output-isolation-'));
  t.after(() => fs.rm(outputRoot, { recursive: true, force: true }));
  const base = path.join(outputRoot, 'data', 'national-irs-eo-registry-industry-overlay'), releases = path.join(base, 'releases');
  await fs.mkdir(releases, { recursive: true });
  await fs.mkdir(path.join(base, unrelatedStageName));
  const sentinelPath = path.join(base, unrelatedStageName, 'preserve.bin'), sentinel = Buffer.from('unrelated historical staging evidence\n');
  await fs.writeFile(sentinelPath, sentinel);
  await fs.mkdir(path.join(releases, 'historical-sentinel-release'));
  await fs.writeFile(path.join(releases, 'historical-sentinel-release', 'preserve.bin'), sentinel);
  const releaseNames = await fs.readdir(releases), sentinelHash = digest(await fs.readFile(sentinelPath));
  return { outputRoot, base, releases, releaseNames, sentinelPath, sentinelHash,
    options(hooks, extra = {}) { return { _testOutputRoot: outputRoot, _testHooks: hooks, ...extra }; },
    async ownedStage() { const stages = (await fs.readdir(base)).filter(name => name.startsWith('.stage-') && name !== unrelatedStageName); assert.equal(stages.length, 1, 'exactly one invocation-owned stage is present'); return path.join(base, stages[0]); },
    async assertClean() {
      assert.deepEqual((await fs.readdir(releases)).sort(), [...releaseNames].sort(), 'immutable release inventory is unchanged');
      assert.deepEqual((await fs.readdir(base)).filter(name => name.startsWith('.stage-')).sort(), [unrelatedStageName]);
      assert.equal((await fs.readdir(base)).some(name => name.startsWith('.verify-') || name === '.build.lock'), false);
      assert.equal(digest(await fs.readFile(sentinelPath)), sentinelHash, 'unrelated stage bytes are preserved');
      assert.deepEqual(await fs.readFile(path.join(releases, 'historical-sentinel-release', 'preserve.bin')), Buffer.from('unrelated historical staging evidence\n'));
    } };
}

test('retained overlay replays exact EIN organization membership', { timeout: 240_000 }, async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), manifest = path.join(ROOT, catalog.retained_release.manifest), raw = await fs.readFile(manifest);
  assert.equal(digest(raw), catalog.retained_release.manifest_sha256); const result = await verify(manifest);
  assert.equal(result.verified, true); assert.equal(result.irs_eo_rows, 1_955_841); assert.equal(result.exact_ein_organization_membership_matches, 1_955_841);
  for (const key of ['missing_identities', 'extra_identities', 'organization_additions', 'site_additions', 'establishment_additions', 'generic_business_additivity_delta']) assert.equal(result[key], 0);
  assert.equal(result.jurisdiction_rows, 56); assert.equal(result.zip5_denominator_rows, 48_194); assert.equal(result.positive_zip5_rows, 36_950);
  assert.equal(result.claims.every_nonprofit_or_tax_exempt_organization, false); assert.equal(result.claims.unique_business_across_sources, false); assert.equal(result.claims.current_operation_beyond_source, false); assert.equal(result.claims.authoritative_current_usps_zip_denominator, null); assert.equal(result.claims.record_level_sensitive_fields_exported, false);
});

test('identity validation rejects malformed and duplicate EIN membership', () => {
  const row = { external_identifiers: [{ type: 'ein', value: '123456789' }], entity_candidates: { organization_id: 'organization:irs_ein_123456789' } }, seen = new Set();
  assert.deepEqual(validateIrsEoOverlayIdentity(row, seen), { ein: '123456789', organization: 'organization:irs_ein_123456789' });
  assert.throws(() => validateIrsEoOverlayIdentity(row, seen), /duplicate EIN/);
  assert.throws(() => validateIrsEoOverlayIdentity({ ...row, entity_candidates: { organization_id: 'organization:wrong' } }), /source identity/);
  assert.throws(() => validateIrsEoOverlayIdentity({ ...row, entity_candidates: { ...row.entity_candidates, physical_site_id: 'site:wrong' } }), /source identity/);
});

test('jurisdiction and ZIP conservation reject drift', () => {
  const jurisdictions = [{ code: 'AA', organization_count: 2 }, { code: 'BB', organization_count: 3 }]; assert.equal(validateIrsEoJurisdictionConservation(jurisdictions, 2, 5), true);
  assert.throws(() => validateIrsEoJurisdictionConservation([jurisdictions[0], jurisdictions[0]], 2, 4), /jurisdiction identity/); assert.throws(() => validateIrsEoJurisdictionConservation(jurisdictions, 2, 6), /jurisdiction conservation/);
  const zips = [{ zip5: '00001', count: 2 }, { zip5: '00002', count: 0 }]; assert.equal(validateIrsEoZipConservation(zips, 2, 1, 2), true);
  assert.throws(() => validateIrsEoZipConservation([{ zip5: 'bad', count: 2 }], 1, 1, 2), /ZIP identity/); assert.throws(() => validateIrsEoZipConservation([zips[0], zips[0]], 2, 2, 4), /ZIP identity/); assert.throws(() => validateIrsEoZipConservation(zips, 2, 0, 2), /ZIP conservation/);
});

test('release is pointer-free, closed, aggregate-only, bounded, and nonadditive', async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), manifestPath = path.join(ROOT, catalog.retained_release.manifest), manifest = JSON.parse(await fs.readFile(manifestPath));
  assert.equal(catalog.runtime_pointer, null); assert.equal(catalog.production_enrollment, false); assert.equal(catalog.additive_to_generic_business_totals, false); assert.equal(manifest.processing.maximum_source_shards_in_memory, 1); assert.equal(manifest.artifacts.filter(x => x.path.startsWith('proof/')).length, 10);
  assert.equal(manifest.claims.identifier_free_aggregate_output, true); assert.equal(manifest.claims.k_anonymous, false); assert.equal(manifest.claims.small_cell_suppression_applied, false); assert.equal(manifest.claims.disclosure_control_claimed, false);
  for (const artifact of manifest.artifacts) { const text = await fs.readFile(path.join(path.dirname(manifestPath), artifact.path), 'utf8'); assert.doesNotMatch(text, /\b\d{9}\b|organization:irs_ein_|legal_name|reported_filing_address|source_record_id|tax_exempt_profile/); }
  await assert.rejects(fs.stat(path.join(ROOT, 'data/national-irs-eo-registry-industry-overlay/current.json')), { code: 'ENOENT' });
});

test('verifier rejects foreign inventory before replay', async t => {
  const catalog = JSON.parse(await fs.readFile(catalogPath)), source = path.join(ROOT, catalog.retained_release.manifest), temporary = await fs.mkdtemp(path.join(ROOT, 'tmp/irs-eo-overlay-test-')); t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const release = path.join(temporary, 'releases', catalog.retained_release.release_id); await fs.mkdir(path.join(release, 'proof'), { recursive: true }); await fs.copyFile(source, path.join(release, 'manifest.json')); await fs.writeFile(path.join(release, 'foreign.txt'), 'not governed');
  await assert.rejects(verify(path.join(release, 'manifest.json'), { root: ROOT }), /closed inventory/);
});

test('secure reads reject symlinks, hardlinks, and named replacements', async t => {
  const temporary = await fs.mkdtemp(path.join(ROOT, 'tmp/irs-eo-secure-read-')); t.after(() => fs.rm(temporary, { recursive: true, force: true })); const original = path.join(temporary, 'input.json'), alias = path.join(temporary, 'alias.json'), backup = path.join(temporary, 'backup.json'); await fs.writeFile(original, '12345678');
  try { await fs.symlink(original, alias); await assert.rejects(secureRead(ROOT, alias, 100), /symlink|canonical/); } catch (error) { if (error.code !== 'EPERM') throw error; }
  const hardlink = path.join(temporary, 'hardlink.json'); await fs.link(original, hardlink); await assert.rejects(secureRead(ROOT, original, 100), /unsafe input identity/); await fs.unlink(hardlink);
  const stamp = (await fs.stat(original)).mtime; await assert.rejects(secureRead(ROOT, original, 100, async () => { await fs.rename(original, backup); await fs.writeFile(original, '87654321'); await fs.utimes(original, stamp, stamp); }), /identity changed/);
});

test('artifact streaming rejects compressed growth beyond the opened declaration', async t => {
  const temporary = await fs.mkdtemp(path.join(ROOT, 'tmp/irs-eo-compressed-bound-')); t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const file = path.join(temporary, 'rows.jsonl'), original = Buffer.from('{"ok":true}\n'); await fs.writeFile(file, original); const declaration = { path: 'rows.jsonl', bytes: original.length, sha256: digest(original), record_count: 1 };
  await assert.rejects(readArtifact(ROOT, temporary, declaration, { maximumCompressedBytes: 1024, afterOpen: async () => fs.appendFile(file, Buffer.alloc(64, 32)) }), /compressed byte bound/);
});

test('artifact streaming rejects an oversized newline-free decompressed line', async t => {
  const temporary = await fs.mkdtemp(path.join(ROOT, 'tmp/irs-eo-line-bound-')); t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const raw = Buffer.alloc(262_145, 97), compressed = zlib.gzipSync(raw), file = path.join(temporary, 'rows.jsonl.gz'); await fs.writeFile(file, compressed); const declaration = { path: 'rows.jsonl.gz', bytes: compressed.length, sha256: digest(compressed), record_count: 1 };
  await assert.rejects(readArtifact(ROOT, temporary, declaration), /JSONL line bound/);
});

test('failure and cancellation clean only invocation-owned output', { timeout: 600_000 }, async t => {
  const failed = await isolatedOutput(t); let failedStage; const primary = new Error('injected IRS post-manifest failure');
  await assert.rejects(build(failed.options(async (phase, context) => { if (phase === 'after-manifest-before-verification') { failedStage = context.stage; throw primary; } })), error => error === primary && error.inspection_required !== true);
  assert.ok(failedStage); await assert.rejects(fs.stat(failedStage), { code: 'ENOENT' }); await failed.assertClean();

  const cancelled = await isolatedOutput(t); let cancelledStage; const controller = new AbortController();
  await assert.rejects(build(cancelled.options(async (phase, context) => { if (phase === 'after-verification-before-publication') { cancelledStage = context.stage; controller.abort(); } }, { signal: controller.signal })), { name: 'AbortError' });
  assert.ok(cancelledStage); await assert.rejects(fs.stat(cancelledStage), { code: 'ENOENT' }); await cancelled.assertClean();
});

test('post-verification corruption seals the explicit invocation stage, not unrelated staging', { timeout: 600_000 }, async t => {
  const isolated = await isolatedOutput(t); let ownedStage;
  await assert.rejects(build(isolated.options(async (phase, context) => { if (phase === 'after-verification-before-publication') { ownedStage = context.stage; assert.equal(path.basename(ownedStage).startsWith('.stage-'), true); assert.equal(await fs.readFile(isolated.sentinelPath, 'utf8'), 'unrelated historical staging evidence\n'); await fs.writeFile(path.join(ownedStage, 'jurisdictions.jsonl'), '{"corrupt":true}\n'); } })), /sealed staged artifact: jurisdictions\.jsonl/);
  assert.ok(ownedStage); await assert.rejects(fs.stat(ownedStage), { code: 'ENOENT' }); await isolated.assertClean();
});

test('mid-shard cancellation cleans only invocation-owned stage and lock', { timeout: 600_000 }, async t => {
  const isolated = await isolatedOutput(t), controller = new AbortController(); let ownedStage;
  await assert.rejects(build(isolated.options(async (phase, context) => { if (phase === 'membership-row' && context.prefix === 0 && context.membershipRows === 100) { ownedStage = await isolated.ownedStage(); controller.abort(); } }, { signal: controller.signal })), { name: 'AbortError' });
  assert.ok(ownedStage); await assert.rejects(fs.stat(ownedStage), { code: 'ENOENT' }); await isolated.assertClean();
});

test('proof write failure preserves primary error and unrelated staging', { timeout: 600_000 }, async t => {
  const isolated = await isolatedOutput(t); let ownedStage;
  await assert.rejects(build(isolated.options(async (phase, context) => { if (phase === 'before-partition-proof-write' && context.prefix === 0) { ownedStage = await isolated.ownedStage(); await fs.mkdir(context.target); } })), /EEXIST|EISDIR|illegal operation|is a directory/i);
  assert.ok(ownedStage); await assert.rejects(fs.stat(ownedStage), { code: 'ENOENT' }); await isolated.assertClean();
});
