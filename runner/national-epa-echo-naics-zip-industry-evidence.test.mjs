import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import test from 'node:test';
import addFormats from 'ajv-formats';
import { buildNationalEpaEchoNaicsZipIndustryEvidence as build, DATASET, STATE_DC_CODES, validateEchoNaicsRecord, verifyNationalEpaEchoNaicsZipIndustryEvidence as verify, readSecureEchoNaicsFileForTest as secureRead } from './national-epa-echo-naics-zip-industry-evidence.mjs';

const ROOT = path.resolve(import.meta.dirname, '..'), sha = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value)}\n`), jsonl = rows => Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
const territories = ['AS','GU','MP','PR','VI'], codes = [...STATE_DC_CODES, ...territories].sort();
const metrics = ['active_facility_count','reported_zip4_count','retained_coordinate_count','centroid_warning_count','coordinate_accuracy_missing_count','record_zcta_count','record_nonpolygon_count','air_association_count','npdes_association_count','rcra_association_count','safe_drinking_water_association_count','toxics_release_inventory_association_count','greenhouse_gas_reporting_association_count'];
const sourceEnvelope = { source_updated_at:'2026-08-30T06:36:03.000Z', retrieved_at:'2026-09-03T00:24:18.917Z', source_release_id:'fixture-echo-source' };
const blankMetrics = () => Object.fromEntries(metrics.map(key => [key, 0]));
function record(id, zip, state, naics) {
  const hasZcta = ['02101','20001'].includes(zip);
  return { schema_version:'1.0.0', normalized_record_id:`epa-echo:facility:${id}`, external_identifiers:[{ type:'frs_registry_id', value:String(id) }], source_status:{ value:'epa-echo-active-program-facility-as-of-source-release', source_updated_at:sourceEnvelope.source_updated_at }, observed_at:sourceEnvelope.retrieved_at, provenance:{ source_release_id:sourceEnvelope.source_release_id, policy_id:'epa-echo' }, export_policy:'public', address:{ zip_code:zip, zip4:null, state }, geography:{ zcta_geoid:hasZcta ? zip : null, zcta_match_status:hasZcta ? '2020-zcta-polygon-available' : 'no-2020-zcta-polygon' }, source_classifications:{ naics_codes:naics }, reported_location:{ geometry:{ type:'Point', coordinates:[-71,42] }, accuracy_meters:1 }, program_associations:Object.fromEntries(['air','npdes','rcra','safe_drinking_water','toxics_release_inventory','greenhouse_gas_reporting'].map(key => [key, { associated:false }])) };
}

async function fixture(t, mutate = () => {}) {
  const root = await fs.mkdtemp(path.join(ROOT, 'tmp/echo-naics-fixture-')); t.after(() => fs.rm(root, { recursive:true, force:true }));
  for (const relative of [`config/connectors/${DATASET}.json`,`config/schemas/${DATASET}.schema.json`,`config/source-policies/${DATASET}.json`]) { await fs.mkdir(path.dirname(path.join(root, relative)), { recursive:true }); await fs.copyFile(path.join(ROOT, relative), path.join(root, relative)); }
  const write = async (relative, raw) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive:true }); await fs.writeFile(file, raw); return { path:relative, bytes:raw.length, sha256:sha(raw) }; };
  const inputArtifact = async (base, name, raw, count, type = 'fixture') => { const declaration = await write(`${base}/${name}`, raw); return { ...declaration, path:name, record_count:count, artifact_type:type }; };
  const manifest = async (base, value) => { const raw = json(value); await write(`${base}/manifest.json`, raw); return { manifest:`${base}/manifest.json`, manifest_sha256:sha(raw), release_id:value.release_id }; };
  const records = [record(1,'02101','MA',['31','311111']), record(2,'02101','MA',['311111','44']), record(3,'20001','DC',[]), record(4,'00901','PR',['311111'])]; mutate(records);
  const byState = new Map(codes.map(code => [code, blankMetrics()])), byZip = new Map(), total = blankMetrics();
  for (const row of records) {
    if (!byZip.has(row.address.zip_code)) byZip.set(row.address.zip_code, blankMetrics());
    for (const value of [total, byState.get(row.address.state), byZip.get(row.address.zip_code)]) { value.active_facility_count++; value.retained_coordinate_count++; value[row.geography.zcta_geoid ? 'record_zcta_count' : 'record_nonpolygon_count']++; }
  }
  const zctas = ['02101','20001'], zipKeys = ['00000','00901','02101','20001','99999'];
  const geoBase = 'data/input-geography', echoBase = 'data/input-echo', coverageBase = 'data/input-coverage', cohortBase = 'data/input-cohort';
  const geography = await manifest(geoBase, { dataset_id:'us-census-geography', release_id:'fixture-geography', coverage:{ zctas:2 }, artifacts:[await inputArtifact(geoBase,'derived/index/zctas.jsonl',jsonl(zctas.map(geoid => ({ geoid, zcta:geoid, geo_type:'zcta' }))),2)] });
  const zip_cohort = await manifest(cohortBase, { dataset_id:'zip-denominator-gap-cohort', release_id:'fixture-cohort', artifacts:[await inputArtifact(cohortBase,'cohort.jsonl',jsonl(zipKeys.map(zip5 => ({ zip5, zcta_geoid:zctas.includes(zip5) ? zip5 : null, classification:zctas.includes(zip5) ? 'same-code-census-zcta' : zip5 === '00000' ? 'explicit-placeholder' : zip5 === '99999' ? 'denominator-only-outside-zcta' : 'source-contributed-outside-zcta', usps_validity:null }))),5)] });
  const sourceSummary = { accepted_active_facilities:records.length, states_and_territories:Object.fromEntries(codes.map(code => [code, byState.get(code).active_facility_count])) };
  const sourceArtifacts = [];
  for (let prefix = 0; prefix < 10; prefix++) { const part = records.filter(row => row.address.zip_code.startsWith(String(prefix))); sourceArtifacts.push(await inputArtifact(echoBase,`derived/facilities/zip-prefix=${prefix}.jsonl.gz`,gzipSync(jsonl(part)),part.length,'normalized-epa-echo-facility-jsonl-gzip')); }
  sourceArtifacts.push(await inputArtifact(echoBase,'derived/source-summary.json',json(sourceSummary),1));
  const echo = await manifest(echoBase, { dataset_id:'epa-echo-active-facilities', release_id:'fixture-echo', ...sourceEnvelope, status:'published', complete_echo_exporter_snapshot:true, active_filter:'FAC_ACTIVE_FLAG=Y', coverage:{ accepted_active_facilities:records.length, source_active_y_records:records.length, quarantined_active_or_unexpected_records:0, source_unexpected_active_flag_records_quarantined:0 }, dependencies:[{ dataset_id:'us-census-geography', release_id:geography.release_id, manifest_sha256:geography.manifest_sha256 }], artifacts:sourceArtifacts });
  const source = { release_id:echo.release_id, manifest_sha256:echo.manifest_sha256 }, geo = { release_id:geography.release_id, manifest_sha256:geography.manifest_sha256 };
  const coverageTotals = { accepted_active_facilities:records.length, zip5_union_rows:4 };
  const coverage = await manifest(coverageBase, { dataset_id:'national-epa-echo-active-facility-coverage', release_id:'fixture-coverage', source, geography:geo, additive_to_generic_totals:false, production_enrollment:false, coverage:coverageTotals, artifacts:[
    await inputArtifact(coverageBase,'coverage-summary.json',json({ ...total, coverage:coverageTotals, source, geography:geo }),1),
    await inputArtifact(coverageBase,'jurisdictions.jsonl',jsonl(codes.map(code => ({ code, ...byState.get(code) }))),56),
    await inputArtifact(coverageBase,'zip5-coverage.jsonl',jsonl(zipKeys.filter(zip => zip !== '00000').map(code => ({ code, ...byZip.get(code) ?? blankMetrics(), zcta_membership:{ geoid:zctas.includes(code) ? code : null } }))),4),
  ] });
  const config = { schema_version:`${DATASET}-config@1.0.0`, echo, coverage, geography, zip_cohort, expected:{ source_rows:records.length, jurisdictions:56, positive_source_zips:byZip.size, coverage_zip_rows:4, cohort_zip_rows:5, zcta_rows:2, shards:10 } };
  await write(`config/${DATASET}.json`, json(config));
  return { root, config, records, write, options:{ root, createdAt:'2026-10-08T12:00:00.000Z' } };
}

async function readRows(directory, name) { let raw = await fs.readFile(path.join(directory, name)); if (name.endsWith('.gz')) raw = gunzipSync(raw); return raw.toString().trim().split('\n').filter(Boolean).map(JSON.parse); }

test('bounded local build independently verifies exact multi-code ZIP and state/DC evidence without pointers or network', async t => {
  const f = await fixture(t), previousFetch = globalThis.fetch; globalThis.fetch = () => assert.fail('Network is prohibited'); t.after(() => { globalThis.fetch = previousFetch; });
  const value = await build(f.options), result = await verify(path.join(value.releaseDirectory,'manifest.json'), { root:f.root });
  assert.equal(result.verified, true); assert.equal(result.source_record_count,4); assert.equal(result.records_with_naics,3); assert.equal(result.records_without_naics,1); assert.equal(result.records_with_multiple_naics,2); assert.equal(result.exact_naics_assignments,5); assert.equal(result.exact_naics_codes,3); assert.equal(result.state_dc_source_records,3); assert.equal(result.territory_source_records,1);
  assert.equal(result.claims.naics_assignments_nonadditive,true); assert.equal(result.claims.operational_segments_mapped,false); assert.equal(result.claims.main_matrix_changed,false); assert.equal(result.claims.current_operating_business_count,null); assert.equal(result.claims.generic_business_additivity_delta,0);
  const states = await readRows(value.releaseDirectory,'states.jsonl'), territories = await readRows(value.releaseDirectory,'territories.jsonl'), cells = await readRows(value.releaseDirectory,'zip-naics/prefix=0.jsonl.gz'), zips = await readRows(value.releaseDirectory,'zip5-evidence.jsonl.gz');
  assert.equal(states.length,51); assert.equal(territories.length,5); assert.deepEqual(states.map(row => row.code),STATE_DC_CODES);
  assert.deepEqual(states.find(row => row.code === 'MA').naics_evidence,[{ naics_code:'31',source_record_count:1 },{ naics_code:'311111',source_record_count:2 },{ naics_code:'44',source_record_count:1 }]);
  assert.equal(cells.find(row => row.zip5 === '00901').zcta_geoid,null); assert.equal(cells.filter(row => row.zip5 === '02101').length,3);
  assert.equal(zips.find(row => row.zip5 === '20001').naics_status,'retained-records-without-naics'); assert.equal(zips.find(row => row.zip5 === '99999').naics_status,'no-retained-echo-records');
  assert.equal(value.manifest.artifacts.length,14); await assert.rejects(fs.stat(path.join(f.root,`data/${DATASET}/current.json`)), { code:'ENOENT' });
  assert.deepEqual((await fs.readdir(path.join(f.root,`data/${DATASET}`))).sort(),['releases']);
  const require = createRequire(import.meta.url), Ajv2020 = createRequire(require.resolve('ajv-formats/package.json'))('ajv/dist/2020.js').default;
  const ajv = new Ajv2020({ strict:false,allErrors:true }); addFormats(ajv);
  const validate = ajv.compile(JSON.parse(await fs.readFile(path.join(ROOT,`config/schemas/${DATASET}.schema.json`))));
  for (const row of [value.manifest,...states,...territories,...cells,...zips,...await readRows(value.releaseDirectory,'summary.json')]) assert.equal(validate(row),true,JSON.stringify(validate.errors));
  assert.equal(validate({ ...cells[0],name:'forbidden' }),false);
});

test('record validation fails closed on source/provenance, identity, exact-code and ZIP4 mutation', () => {
  const original = record(1,'02101','MA',['31','311111']); assert.deepEqual(validateEchoNaicsRecord(original,sourceEnvelope,0).codes,['31','311111']);
  const mutations = [row => { row.source_classifications.naics_codes = ['31','31']; },row => { row.source_classifications.naics_codes = ['311111','31']; },row => { row.source_classifications.naics_codes = ['31-33']; },row => { row.source_classifications.naics_codes = [311111]; },row => { row.source_classifications.naics_codes = null; },row => { row.source_status.value = 'current-business'; },row => { row.provenance.source_release_id = 'other'; },row => { row.address.zip4 = '1234'; },row => { row.address.state = 'XX'; },row => { row.address.zip_code = '20001'; },row => { row.normalized_record_id = 'other'; }];
  for (const mutate of mutations) { const changed = structuredClone(original); mutate(changed); assert.throws(() => validateEchoNaicsRecord(changed,sourceEnvelope,0),/rejected/); }
  const seen = new Set(); validateEchoNaicsRecord(original,sourceEnvelope,0,seen); assert.throws(() => validateEchoNaicsRecord(original,sourceEnvelope,0,seen),/duplicate/);
});

test('builder rejects pinned-input drift, duplicate cross-prefix identity and coverage conservation drift', async t => {
  const changed = await fixture(t); const file = path.join(changed.root,changed.config.echo.manifest); await fs.appendFile(file,' '); await assert.rejects(build(changed.options),/manifest drift/);
  const duplicate = await fixture(t,rows => { rows[2].external_identifiers[0].value = '1'; rows[2].normalized_record_id = 'epa-echo:facility:1'; }); await assert.rejects(build(duplicate.options),/duplicate FRS/);
  const drift = await fixture(t), coverageFile = path.join(drift.root,drift.config.coverage.manifest), coverage = JSON.parse(await fs.readFile(coverageFile));
  const item = coverage.artifacts.find(row => row.path === 'jurisdictions.jsonl'), target = path.join(path.dirname(coverageFile),item.path), rows = JSON.parse(JSON.stringify((await fs.readFile(target,'utf8')).trim().split('\n').map(JSON.parse)));
  rows.find(row => row.code === 'MA').active_facility_count--; rows.find(row => row.code === 'DC').active_facility_count++;
  const raw = jsonl(rows); await fs.writeFile(target,raw); item.bytes = raw.length; item.sha256 = sha(raw); const manifestRaw = json(coverage); await fs.writeFile(coverageFile,manifestRaw); drift.config.coverage.manifest_sha256 = sha(manifestRaw); await drift.write(`config/${DATASET}.json`,json(drift.config));
  await assert.rejects(build(drift.options),/coverage replay/);
});

test('verifier rejects claims, foreign inventory and balanced artifact changes with rewritten checksums', async t => {
  const f = await fixture(t), value = await build(f.options), filename = path.join(value.releaseDirectory,'manifest.json'), original = await fs.readFile(filename), manifest = JSON.parse(original);
  manifest.claims.unique_business_count = 4; await fs.writeFile(filename,json(manifest)); await assert.rejects(verify(filename,{ root:f.root }),/manifest reconstruction/); await fs.writeFile(filename,original);
  await fs.writeFile(path.join(value.releaseDirectory,'foreign.bin'),'foreign'); await assert.rejects(verify(filename,{ root:f.root }),/closed output inventory/); await fs.unlink(path.join(value.releaseDirectory,'foreign.bin'));
  const cells = await readRows(value.releaseDirectory,'zip-naics/prefix=0.jsonl.gz'); cells[1].source_record_count++; cells[2].source_record_count--;
  const raw = gzipSync(jsonl(cells)), declaration = manifest.artifacts.find(row => row.path === 'zip-naics/prefix=0.jsonl.gz');
  await fs.writeFile(path.join(value.releaseDirectory,declaration.path),raw); declaration.bytes = raw.length; declaration.decoded_bytes = jsonl(cells).length; declaration.sha256 = sha(raw); manifest.claims.unique_business_count = null;
  const { release_id, ...body } = manifest; assert.ok(release_id); manifest.release_id = `${DATASET}-${sha(JSON.stringify(body))}`;
  const destination = path.join(path.dirname(value.releaseDirectory),manifest.release_id); await fs.writeFile(filename,json(manifest)); await fs.rename(value.releaseDirectory,destination);
  await assert.rejects(verify(path.join(destination,'manifest.json'),{ root:f.root }),/manifest reconstruction/);
});

test('cooperative cancellation and sink/post-manifest failures clean only invocation-owned artifacts', async t => {
  for (const phase of ['source-row','output-row','after-manifest-before-verification','after-verification-before-publication','sink-failure']) {
    const f = await fixture(t), base = path.join(f.root,`data/${DATASET}`); await fs.mkdir(path.join(base,'releases/historical'),{ recursive:true }); await fs.mkdir(path.join(base,'.stage-unrelated')); await fs.writeFile(path.join(base,'.stage-unrelated/sentinel'),'preserve');
    const controller = new AbortController(); let hit = false, streams;
    await assert.rejects(build({ ...f.options,signal:controller.signal,hooks:async (event, context) => {
      if (!hit && (event === phase || phase === 'sink-failure' && event === 'output-row')) { hit = true; if (phase === 'sink-failure') { streams = [context.source,context.sink]; context.sink.destroy(new Error('injected sink failure')); } else if (phase === 'after-manifest-before-verification') throw new Error('injected post-manifest failure'); else controller.abort(); }
    } }),phase.includes('failure') || phase === 'after-manifest-before-verification' ? /injected|premature close|destroyed/ : { name:'AbortError' });
    assert.equal(hit,true,phase); if (streams) assert.ok(streams.every(stream => stream.destroyed));
    assert.deepEqual((await fs.readdir(base)).sort(),['.stage-unrelated','releases']); assert.deepEqual(await fs.readdir(path.join(base,'releases')),['historical']); assert.equal(await fs.readFile(path.join(base,'.stage-unrelated/sentinel'),'utf8'),'preserve');
  }
});

test('secure reads reject links and same-size same-mtime replacement', async t => {
  const f = await fixture(t), file = path.join(f.root,'input'), backup = path.join(f.root,'backup'); await fs.writeFile(file,'12345678');
  await fs.link(file,path.join(f.root,'hardlink')); await assert.rejects(secureRead(f.root,file,100),/unsafe input identity/); await fs.unlink(path.join(f.root,'hardlink'));
  try { await fs.symlink(file,path.join(f.root,'symlink')); await assert.rejects(secureRead(f.root,path.join(f.root,'symlink'),100),/symlink/); } catch (error) { if (error.code !== 'EPERM') throw error; }
  const stamp = (await fs.stat(file)).mtime;
  await assert.rejects(secureRead(f.root,file,100,async () => { await fs.rename(file,backup); await fs.writeFile(file,'87654321'); await fs.utimes(file,stamp,stamp); }),/identity changed/);
});

test('registered national ECHO release independently replays retained source, coverage and ZIP geography', { timeout:240_000 }, async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(ROOT,`config/datasets/${DATASET}.json`))), pin = catalog.retained_release, filename = path.join(ROOT,pin.manifest);
  assert.equal(sha(await fs.readFile(filename)),pin.manifest_sha256);
  const result = await verify(filename);
  assert.equal(result.verified,true); assert.equal(result.release_id,pin.release_id); assert.equal(result.manifest_sha256,pin.manifest_sha256);
  for (const key of ['source_record_count','records_with_naics','records_without_naics','records_with_multiple_naics','exact_naics_assignments','exact_naics_codes','state_dc_rows','territory_rows','zip5_cohort_rows','zip5_exact_naics_cells']) assert.equal(result[key],pin[key],key);
  assert.equal(result.state_dc_source_records + result.territory_source_records,result.source_record_count);
  assert.equal(catalog.runtime_pointer,null); assert.equal(catalog.production_enrollment,false);
  await assert.rejects(fs.stat(path.join(ROOT,`data/${DATASET}/current.json`)),{ code:'ENOENT' });
});
