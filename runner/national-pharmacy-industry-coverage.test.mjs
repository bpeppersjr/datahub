import test from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildNationalPharmacyIndustryCoverage, verifyNationalPharmacyIndustryCoverage, verifyNationalPharmacyIndustryCoverageCurrent, readNationalPharmacyIndustryCoverage, lookupNationalPharmacyIndustryZip5, publishNationalPharmacyIndustryCoveragePointerForTest } from './national-pharmacy-industry-coverage.mjs';

test('builds and independently verifies the retained national pharmacy coverage release', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pharmacy-coverage-'));
  try {
    const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-coverage-${path.basename(root)}`);
    const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
    assert.equal(built.manifest.status, 'published-local-review');
    assert.equal(built.manifest.current_pointer_written, true);
    assert.equal(built.coverage.accepted_organization_rows, 89077);
    assert.equal(built.coverage.zip5_rows, 38686);
    assert.equal(built.coverage.positive_zip5_rows, 15376);
    assert.equal(built.coverage.jurisdiction_rows, 56);
    assert.equal(built.coverage.state_dc_rows, 87659);
    assert.equal(built.coverage.territory_rows, 1415);
    assert.equal(built.coverage.unassigned_rows, 3);
    assert.equal(built.manifest.supplementary_secondary_addresses.rows, 420);
    const verified = await verifyNationalPharmacyIndustryCoverage(path.join(built.releaseDirectory, 'manifest.json'), { expectedManifestSha256: built.manifestSha256 });
    assert.equal(verified.manifest.release_id, built.manifest.release_id);
    assert.equal((await verifyNationalPharmacyIndustryCoverageCurrent(path.join(outputRoot, 'current.json'))).manifest.release_id, built.manifest.release_id);
    assert.equal((await readNationalPharmacyIndustryCoverage({ pointerPath: path.join(outputRoot, 'current.json') })).jurisdictions.length, 56);
    assert.equal((await lookupNationalPharmacyIndustryZip5('00601', { pointerPath: path.join(outputRoot, 'current.json') })).row.zip_code, '00601');
    await rm(outputRoot, { recursive: true, force: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a stale current pointer is recovered by atomic publication', async () => {
  const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-coverage-recover-${Date.now()}`);
  try {
    const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
    await writeFile(path.join(outputRoot, 'current.json'), JSON.stringify({ dataset_id: 'national-pharmacy-industry-coverage', release_id: 'stale', manifest: 'releases/stale/manifest.json', manifest_sha256: '0'.repeat(64) }));
    const recovered = await buildNationalPharmacyIndustryCoverage({ outputRoot });
    assert.equal(recovered.manifest.release_id, built.manifest.release_id);
    assert.equal((await verifyNationalPharmacyIndustryCoverageCurrent(path.join(outputRoot, 'current.json'))).manifest.release_id, built.manifest.release_id);
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('fails closed when a published artifact drifts', async () => {
  const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-coverage-tamper-${Date.now()}`);
  try {
    const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
    const target = path.join(built.releaseDirectory, 'coverage-summary.json');
    const original = await readFile(target); await writeFile(target, Buffer.concat([original, Buffer.from(' ')]));
    await assert.rejects(verifyNationalPharmacyIndustryCoverage(path.join(built.releaseDirectory, 'manifest.json')), /pin mismatch|release identity drifted/);
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('rejects a current pointer reached through a linked parent', async (t) => {
  const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-coverage-link-${Date.now()}`);
  const linkRoot = `${outputRoot}-junction`;
  try {
    await buildNationalPharmacyIndustryCoverage({ outputRoot });
    try { await symlink(outputRoot, linkRoot, 'junction'); } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('junction creation is unavailable'); throw error; }
    await assert.rejects(verifyNationalPharmacyIndustryCoverageCurrent(path.join(linkRoot, 'current.json')), /linked or non-canonical path/);
  } finally { await rm(linkRoot, { recursive: true, force: true }); await rm(outputRoot, { recursive: true, force: true }); }
});

test('rejects crafted checksum-rehashed ZIP content that breaks conservation', async () => {
  const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-coverage-rehash-${Date.now()}`);
  try {
    const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
    const zipPath = path.join(built.releaseDirectory, 'zip5-coverage.jsonl');
    const rows = (await readFile(zipPath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
    rows[0].reported_address_count += 1;
    const zipBytes = Buffer.from(`${rows.map(JSON.stringify).join('\n')}\n`);
    await writeFile(zipPath, zipBytes);
    const manifestPath = path.join(built.releaseDirectory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.artifacts[2].bytes = zipBytes.length;
    manifest.artifacts[2].sha256 = createHash('sha256').update(zipBytes).digest('hex');
    const summary = await readFile(path.join(built.releaseDirectory, 'coverage-summary.json'));
    const states = await readFile(path.join(built.releaseDirectory, 'jurisdictions.jsonl'));
    const identity = createHash('sha256').update(Buffer.concat([summary, Buffer.from([0]), states, Buffer.from([0]), zipBytes])).digest('hex').slice(0, 16);
    manifest.release_id = `national-pharmacy-industry-coverage-${identity}`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(verifyNationalPharmacyIndustryCoverage(manifestPath, { allowStaging: true }), /ZIP evidence scope drifted|conservation drifted/);
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('first publication removes the installed pointer when post-rename verification fails', async () => {
  const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-pointer-rollback-${Date.now()}`);
  try {
    const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
    await rm(path.join(outputRoot, 'current.json'));
    await assert.rejects(publishNationalPharmacyIndustryCoveragePointerForTest(outputRoot, built.manifest, built.manifestSha256, { verifyCurrent: async () => { throw new Error('injected verification failure'); } }), /injected verification failure/);
    await assert.rejects(readFile(path.join(outputRoot, 'current.json')), { code: 'ENOENT' });
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('a concurrent pointer replacement is preserved and CAS fails closed', async () => {
  const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-pointer-race-${Date.now()}`);
  try {
    const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
    const replacement = Buffer.from('{"concurrent":true}\n');
    await assert.rejects(publishNationalPharmacyIndustryCoveragePointerForTest(outputRoot, built.manifest, built.manifestSha256, { afterCompare: async ({ target }) => writeFile(target, replacement) }), /changed after compare during CAS/);
    assert.deepEqual(await readFile(path.join(outputRoot, 'current.json')), replacement);
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('release verification rejects extra files and hardlinked artifacts', async () => {
  for (const mode of ['extra', 'hardlink']) {
    const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-inventory-${mode}-${Date.now()}`);
    try {
      const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
      if (mode === 'extra') await writeFile(path.join(built.releaseDirectory, 'extra.txt'), 'unexpected');
      else await link(path.join(built.releaseDirectory, 'coverage-summary.json'), path.join(built.releaseDirectory, 'hardlink.json'));
      await assert.rejects(verifyNationalPharmacyIndustryCoverage(path.join(built.releaseDirectory, 'manifest.json')), /release inventory drifted|single-link file/);
    } finally { await rm(outputRoot, { recursive: true, force: true }); }
  }
});

test('rejects manifest-only authority drift and a checksum-rehashed jurisdiction substitution', async () => {
  for (const mode of ['manifest', 'jurisdiction']) {
    const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-semantic-${mode}-${Date.now()}`);
    try {
      const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
      const manifestPath = path.join(built.releaseDirectory, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (mode === 'manifest') {
        manifest.production_enrollment = true;
      } else {
        const statePath = path.join(built.releaseDirectory, 'jurisdictions.jsonl');
        const states = (await readFile(statePath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
        const vermont = states.find((row) => row.jurisdiction_code === 'VT');
        const virginIslands = states.find((row) => row.jurisdiction_code === 'VI');
        vermont.reported_address_count -= 1;
        vermont.unique_npi_count -= 1;
        virginIslands.reported_address_count += 1;
        virginIslands.unique_npi_count += 1;
        const stateBytes = Buffer.from(`${states.map(JSON.stringify).join('\n')}\n`);
        await writeFile(statePath, stateBytes);
        manifest.artifacts[1].bytes = stateBytes.length;
        manifest.artifacts[1].sha256 = createHash('sha256').update(stateBytes).digest('hex');
        const summary = await readFile(path.join(built.releaseDirectory, 'coverage-summary.json'));
        const zips = await readFile(path.join(built.releaseDirectory, 'zip5-coverage.jsonl'));
        manifest.release_id = `national-pharmacy-industry-coverage-${createHash('sha256').update(Buffer.concat([summary, Buffer.from([0]), stateBytes, Buffer.from([0]), zips])).digest('hex').slice(0,16)}`;
      }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await assert.rejects(verifyNationalPharmacyIndustryCoverage(manifestPath, { allowStaging: true }), /manifest authority drifted|state\/territory partition drifted/);
    } finally { await rm(outputRoot, { recursive: true, force: true }); }
  }
});

test('rejects coverage-field-only drift and nested authority extras', async () => {
  for (const mode of ['coverage', 'nested-extra']) {
    const outputRoot = path.join(process.cwd(), 'data', `.test-pharmacy-envelope-${mode}-${Date.now()}`);
    try {
      const built = await buildNationalPharmacyIndustryCoverage({ outputRoot });
      const manifestPath = path.join(built.releaseDirectory, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (mode === 'coverage') manifest.coverage.accepted_organization_rows += 1;
      else manifest.source.unexpected_authority = true;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await assert.rejects(verifyNationalPharmacyIndustryCoverage(manifestPath, { allowStaging: true }), /NPI\/taxonomy conservation drifted|coverage semantics drifted|source keys drifted/);
    } finally { await rm(outputRoot, { recursive: true, force: true }); }
  }
});
