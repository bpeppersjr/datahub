import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { buildCensusNonemployerIndustryContext, deriveCensusNonemployerIndustryContext,
  INDUSTRY_SELECTION, readCensusNonemployerArtifactForTests, verifyCensusNonemployerIndustryContext } from './census-nonemployer-industry-context.mjs';

const provenance = { source_dataset_id: 'census-nonemployer-baseline', source_release_id: 'census-nonemployer-2023-20260830-230249716Z-78268f89',
  source_manifest_sha256: 'a'.repeat(64), source_county_artifact_sha256: 'b'.repeat(64), transformation_version: 'test' };
function row(geographyType, geoid, code, value, flags = {}) {
  const state = geographyType === 'national' ? null : geoid.slice(0, 2);
  return { schema_version: '1.0.0', record_id: `${geographyType}:${geoid}:${code}:001:001`, geography_type: geographyType,
    geoid, state_fips: state, county_fips: geographyType === 'county' ? geoid.slice(2) : null, geography_name: geoid,
    reference_year: 2023, naics: { code, label: code === '23' ? 'Construction' : code === '62441' ? 'Child Day Care Services' : 'Other',
      footnote: null, industry_level: 2, sector: '23', subsector: null },
    legal_form: { code: '001' }, receipt_size: { code: '001' }, measures: { nonemployer_establishments: value,
      nonemployer_establishments_flag: flags.establishments ?? null, receipts_thousands_usd: 11, receipts_flag: flags.receipts ?? null,
      receipts_noise_range_thousands_usd: null, receipts_noise_range_flag: flags.noise ?? null,
      flags_preserved_without_reinterpretation: true }, provenance: { source_id: 'census-nonemployer-2023', source_release_id: provenance.source_release_id,
      source_record_id: `${geographyType}:${geoid}:${code}:001:001`, ingest_run_id: 'synthetic-run',
      transformation_version: 'us-census-nonemployer@1.0.0', policy_id: 'us-census-nonemployer' } };
}

async function writeGzipFixture(directory, name, lines) {
  const bytes = gzipSync(Buffer.from(lines));
  const file = path.join(directory, name);
  await writeFile(file, bytes);
  return { file, artifact: { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), record_count: lines.trimEnd().split('\n').length } };
}

function readerOptions(overrides = {}) {
  return { geographyType: 'county', referenceYear: 2023, sourceRunId: 'synthetic-run', seenIds: new Set(), countyGeoids: new Set(), ...overrides };
}

test('retained artifact reader rejects corrupt and truncated gzip streams', async () => {
  const directory = await mkdtemp(path.join(APP_ROOT, 'data/tmp/nonemployer-context-gzip-'));
  try {
    const line = `${JSON.stringify(row('county', '01001', '23', 4))}\n`;
    for (const [name, makeBad] of [['corrupt', (bytes) => { const copy = Buffer.from(bytes); copy[copy.length - 1] ^= 0xff; return copy; }],
      ['truncated', (bytes) => bytes.subarray(0, bytes.length - 6)]]) {
      const valid = gzipSync(Buffer.from(line));
      const corrupted = makeBad(valid);
      const file = path.join(directory, `${name}.jsonl.gz`);
      await writeFile(file, corrupted);
      await assert.rejects(readCensusNonemployerArtifactForTests(file, {
        bytes: corrupted.length, sha256: createHash('sha256').update(corrupted).digest('hex'), record_count: 1,
      }, readerOptions()), /gzip|unexpected|end|length check|Census Nonemployer/i);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retained artifact reader rejects malformed rows, GEOIDs, provenance, duplicates, oversized lines and row declarations', async () => {
  const directory = await mkdtemp(path.join(APP_ROOT, 'data/tmp/nonemployer-context-invalid-'));
  const valid = row('county', '01001', '23', 4);
  const cases = [
    ['malformed', '{bad json}\n', {}, /malformed JSON/],
    ['geoid', `${JSON.stringify({ ...valid, geoid: '010001' })}\n`, {}, /GEOID/],
    ['provenance', `${JSON.stringify({ ...valid, provenance: { ...valid.provenance, source_record_id: 'wrong' } })}\n`, {}, /identity\/provenance/],
    ['duplicate', `${JSON.stringify(valid)}\n${JSON.stringify(valid)}\n`, {}, /duplicate record id/],
    ['long-line', `${JSON.stringify({ ...valid, geography_name: 'x'.repeat(66_000) })}\n`, {}, /line byte limit/],
  ];
  try {
    for (const [name, lines, , expected] of cases) {
      const fixture = await writeGzipFixture(directory, `${name}.jsonl.gz`, lines);
      await assert.rejects(readCensusNonemployerArtifactForTests(fixture.file, fixture.artifact, readerOptions()), expected);
    }
    const fixture = await writeGzipFixture(directory, 'too-many-rows.jsonl.gz', `${JSON.stringify(valid)}\n`);
    await assert.rejects(readCensusNonemployerArtifactForTests(fixture.file,
      { ...fixture.artifact, record_count: 701_011 }, readerOptions()), /size\/row contract/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retained artifact reader cooperatively aborts while streaming rows', async () => {
  const directory = await mkdtemp(path.join(APP_ROOT, 'data/tmp/nonemployer-context-abort-'));
  const controller = new AbortController();
  try {
    const lines = Array.from({ length: 20_000 }, (_, index) => {
      const state = String(1 + Math.floor(index / 999)).padStart(2, '0');
      const county = String((index % 999) + 1).padStart(3, '0');
      return JSON.stringify(row('county', `${state}${county}`, '23', 4));
    }).join('\n') + '\n';
    const fixture = await writeGzipFixture(directory, 'many.jsonl.gz', lines);
    fixture.artifact.record_count = 20_000;
    const timer = setTimeout(() => controller.abort(), 2);
    await assert.rejects(readCensusNonemployerArtifactForTests(fixture.file, fixture.artifact,
      readerOptions({ signal: controller.signal })), { name: 'AbortError' });
    clearTimeout(timer);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('synthetic projection selects only exact requested 2022 NAICS totals and preserves flags and missing cells', () => {
  const rows = [
    row('national', 'US', '23', 100), row('state', '01', '23', 90), row('county', '01001', '23', 0, { establishments: 'D', receipts: 'S' }),
    row('county', '01003', '23', 45), row('national', 'US', '62441', 20), row('state', '01', '62441', 20),
    row('county', '01001', '62441', 0), row('county', '01001', '00', 1000), row('county', '01003', '00', 1200),
    row('county', '01001', '236', 999),
  ];
  const result = deriveCensusNonemployerIndustryContext(rows, 2023, provenance);
  assert.deepEqual(result.rows.filter((item) => item.geography_type === 'county' && item.naics.code === '23').map((item) => item.naics.code), ['23', '23']);
  const missing = result.rows.find((item) => item.naics.code === '62441' && item.geoid === '01003');
  assert.equal(missing.missing_cell, true);
  assert.equal(missing.measures.nonemployer_establishments, null);
  const trueZero = result.rows.find((item) => item.naics.code === '62441' && item.geoid === '01001');
  assert.equal(trueZero.missing_cell, false);
  assert.equal(trueZero.measures.nonemployer_establishments, 0);
  const flagged = result.rows.find((item) => item.naics.code === '23' && item.geoid === '01001');
  assert.equal(flagged.measures.nonemployer_establishments_flag, 'D');
  assert.equal(flagged.measures.nonemployer_establishments, null);
  assert.equal(flagged.measures.nonemployer_establishments_raw, 0);
  assert.equal(flagged.measures.receipts_flag, 'S');
  assert.equal(flagged.provenance.source_release_id, provenance.source_release_id);
  assert.deepEqual(result.residuals.map((item) => item.naics_code), INDUSTRY_SELECTION.map((item) => item.code));
  assert.equal(result.residuals.find((item) => item.naics_code === '23').national_minus_known_counties, 55);
});

test('pre-cancelled native build stops before creating a retained output', async () => {
  const directory = await mkdtemp(path.join(APP_ROOT, 'data/tmp/nonemployer-context-cancel-'));
  const controller = new AbortController();
  controller.abort();
  try {
    await assert.rejects(buildCensusNonemployerIndustryContext({ outputRoot: path.relative(APP_ROOT, directory), signal: controller.signal }), { name: 'AbortError' });
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('native retained release builds a verifiable immutable artifact set and rejects tampering', async () => {
  const parent = await mkdtemp(path.join(APP_ROOT, 'data/tmp/nonemployer-context-native-'));
  const outputRoot = path.join(parent, 'output');
  try {
    const built = await buildCensusNonemployerIndustryContext({ outputRoot: path.relative(APP_ROOT, outputRoot) });
    const verified = await verifyCensusNonemployerIndustryContext(built.manifestPath);
    assert.equal(verified.reference_year, 2023);
    assert.ok(verified.row_count > 6000);
    assert.equal(built.manifest.source.release_id, 'census-nonemployer-2023-20260830-230249716Z-78268f89');
    assert.deepEqual(built.manifest.classification.selection.map((item) => item.code), ['23', '62441']);
    const counties = (await readFile(path.join(built.releaseDirectory, 'county-industry-context.jsonl'), 'utf8'))
      .trim().split(/\r?\n/).map(JSON.parse).filter((item) => item.geography_type === 'county');
    const construction = counties.filter((item) => item.naics.code === '23');
    const childcare = counties.filter((item) => item.naics.code === '62441');
    assert.deepEqual([construction.filter((item) => item.missing_cell).length,
      construction.filter((item) => item.measures.nonemployer_establishments_flag).length,
      construction.filter((item) => Number.isSafeInteger(item.measures.nonemployer_establishments)).length], [1, 1, 3141]);
    assert.deepEqual([childcare.filter((item) => item.missing_cell).length,
      childcare.filter((item) => item.measures.nonemployer_establishments_flag).length,
      childcare.filter((item) => Number.isSafeInteger(item.measures.nonemployer_establishments)).length], [134, 9, 3000]);
    const residuals = (await readFile(path.join(built.releaseDirectory, 'geography-residuals.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(residuals.map((item) => item.national_minus_known_counties), [5, 198]);
    const output = path.join(built.releaseDirectory, 'county-industry-context.jsonl');
    await appendFile(output, '{}\n');
    await assert.rejects(verifyCensusNonemployerIndustryContext(built.manifestPath), /artifact digest mismatch/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
