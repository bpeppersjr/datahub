import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import test from 'node:test';
import addFormats from 'ajv-formats';
import { buildNationalEpaEchoOperationalSegmentEvidence as build,verifyNationalEpaEchoOperationalSegmentEvidence as verify,classifyExactEchoNaics,classifyEchoSegmentRecord,DATASET,STATUSES } from './national-epa-echo-operational-segment-evidence.mjs';
import { echoReplay as r,STATE_DC_CODES } from './national-epa-echo-naics-zip-industry-evidence.mjs';

const ROOT = path.resolve(import.meta.dirname,'..'), hash = raw => createHash('sha256').update(raw).digest('hex'), json = value => Buffer.from(`${JSON.stringify(value)}\n`), jsonl = rows => Buffer.from(rows.map(row => JSON.stringify(row)).join('\n')+(rows.length ? '\n' : ''));
const sourceEnvelope = { source_updated_at:'2026-08-30T06:36:03.000Z',retrieved_at:'2026-09-03T00:24:18.917Z',source_release_id:'fixture-echo-source' };
function record(id,zip,state,codes) {
  const hasZcta = ['02101','20001'].includes(zip);
  return { schema_version:'1.0.0',normalized_record_id:`epa-echo:facility:${id}`,external_identifiers:[{ type:'frs_registry_id',value:String(id) }],source_status:{ value:'epa-echo-active-program-facility-as-of-source-release',source_updated_at:sourceEnvelope.source_updated_at },observed_at:sourceEnvelope.retrieved_at,provenance:{ source_release_id:sourceEnvelope.source_release_id,policy_id:'epa-echo' },export_policy:'public',address:{ zip_code:zip,zip4:null,state },geography:{ zcta_geoid:hasZcta ? zip : null,zcta_match_status:hasZcta ? '2020-zcta-polygon-available' : 'no-2020-zcta-polygon' },source_classifications:{ naics_codes:codes },reported_location:{ geometry:{ type:'Point',coordinates:[-71,42] },accuracy_meters:1 },program_associations:Object.fromEntries(['air','npdes','rcra','safe_drinking_water','toxics_release_inventory','greenhouse_gas_reporting'].map(key => [key,{ associated:false }])) };
}
async function rows(directory,name) { let raw = await fs.readFile(path.join(directory,name)); if (name.endsWith('.gz')) raw = gunzipSync(raw); return raw.toString().trim().split('\n').filter(Boolean).map(JSON.parse); }
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(ROOT,'tmp/echo-segment-fixture-')); t.after(() => fs.rm(root,{ recursive:true,force:true }));
  const write = async (relative,raw) => { const filename = path.join(root,relative); await fs.mkdir(path.dirname(filename),{ recursive:true }); await fs.writeFile(filename,raw); return { path:relative,bytes:raw.length,sha256:hash(raw) }; };
  const artifact = async (base,name,raw,count,type='fixture') => ({ ...await write(`${base}/${name}`,raw),path:name,record_count:count,artifact_type:type });
  const manifest = async (base,value) => { const raw=json(value); await write(`${base}/manifest.json`,raw); return { manifest:`${base}/manifest.json`,manifest_sha256:hash(raw),release_id:value.release_id }; };
  const original = JSON.parse(await fs.readFile(path.join(ROOT,`config/${DATASET}.json`))), refDir = path.dirname(original.naics_reference.manifest);
  await fs.mkdir(path.dirname(path.join(root,refDir)),{ recursive:true }); await fs.cp(path.join(ROOT,refDir),path.join(root,refDir),{ recursive:true });
  for (const dataset of [DATASET,'national-epa-echo-naics-zip-industry-evidence','us-census-naics-reference']) for (const part of ['connectors','schemas','source-policies']) { const relative = `config/${part}/${dataset}${part === 'schemas' ? '.schema' : ''}.json`; await write(relative,await fs.readFile(path.join(ROOT,relative))); }
  await write(original.crosswalk.path,await fs.readFile(path.join(ROOT,original.crosswalk.path)));
  const records = [record(1,'02101','MA',['2332','236']),record(2,'02101','MA',['23','44']),record(3,'20001','DC',[]),record(4,'00901','PR',['624410']),record(5,'02101','MA',['236','999999']),record(6,'02101','MA',['311111']),record(7,'02101','MA',['999999'])];
  // 2332 is an edition-limited construction code. Its membership is validated
  // against the editions where it exists; no guessed current edition is used.
  const byState = new Map(r.ALL_CODES.map(code => [code,r.coverageBlank()])),byZip = new Map(),total=r.coverageBlank();
  for (const row of records) {
    if (!byZip.has(row.address.zip_code)) byZip.set(row.address.zip_code,r.coverageBlank());
    for (const value of [total,byState.get(row.address.state),byZip.get(row.address.zip_code)]) r.addCoverage(value,row,row.geography.zcta_geoid !== null);
  }
  const zctas=['02101','20001'],zipKeys=['00000','00901','02101','20001','99999'];
  const geography = await manifest('data/input-geography',{ dataset_id:'us-census-geography',release_id:'fixture-geography',coverage:{ zctas:2 },artifacts:[await artifact('data/input-geography','derived/index/zctas.jsonl',jsonl(zctas.map(geoid => ({ geoid,zcta:geoid,geo_type:'zcta' }))),2)] });
  const zip_cohort = await manifest('data/input-cohort',{ dataset_id:'zip-denominator-gap-cohort',release_id:'fixture-cohort',artifacts:[await artifact('data/input-cohort','cohort.jsonl',jsonl(zipKeys.map(zip5 => ({ zip5,zcta_geoid:zctas.includes(zip5) ? zip5 : null,classification:zctas.includes(zip5) ? 'same-code-census-zcta' : zip5 === '00000' ? 'explicit-placeholder' : zip5 === '99999' ? 'denominator-only-outside-zcta' : 'source-contributed-outside-zcta',usps_validity:null }))),5)] });
  const sourceSummary = { accepted_active_facilities:records.length,states_and_territories:Object.fromEntries(r.ALL_CODES.map(code => [code,byState.get(code).active_facility_count])) },sourceArtifacts=[];
  for (let prefix=0;prefix<10;prefix++) { const part=records.filter(row => row.address.zip_code.startsWith(String(prefix))); sourceArtifacts.push(await artifact('data/input-echo',`derived/facilities/zip-prefix=${prefix}.jsonl.gz`,gzipSync(jsonl(part)),part.length,'normalized-epa-echo-facility-jsonl-gzip')); }
  sourceArtifacts.push(await artifact('data/input-echo','derived/source-summary.json',json(sourceSummary),1));
  const echo = await manifest('data/input-echo',{ dataset_id:'epa-echo-active-facilities',release_id:'fixture-echo',...sourceEnvelope,status:'published',complete_echo_exporter_snapshot:true,active_filter:'FAC_ACTIVE_FLAG=Y',coverage:{ accepted_active_facilities:records.length,source_active_y_records:records.length,quarantined_active_or_unexpected_records:0,source_unexpected_active_flag_records_quarantined:0 },dependencies:[{ dataset_id:'us-census-geography',release_id:geography.release_id,manifest_sha256:geography.manifest_sha256 }],artifacts:sourceArtifacts });
  const source={ release_id:echo.release_id,manifest_sha256:echo.manifest_sha256 },geo={ release_id:geography.release_id,manifest_sha256:geography.manifest_sha256 },coverageTotals={ accepted_active_facilities:records.length,zip5_union_rows:4 };
  const coverage = await manifest('data/input-coverage',{ dataset_id:'national-epa-echo-active-facility-coverage',release_id:'fixture-coverage',source,geography:geo,additive_to_generic_totals:false,production_enrollment:false,coverage:coverageTotals,artifacts:[
    await artifact('data/input-coverage','coverage-summary.json',json({ ...total,coverage:coverageTotals,source,geography:geo }),1),
    await artifact('data/input-coverage','jurisdictions.jsonl',jsonl(r.ALL_CODES.map(code => ({ code,...byState.get(code) }))),56),
    await artifact('data/input-coverage','zip5-coverage.jsonl',jsonl(zipKeys.filter(zip => zip !== '00000').map(code => ({ code,...byZip.get(code) ?? r.coverageBlank(),zcta_membership:{ geoid:zctas.includes(code) ? code : null } }))),4),
  ] });
  const replay={ schema_version:'national-epa-echo-naics-zip-industry-evidence-config@1.0.0',echo,coverage,geography,zip_cohort,expected:{ source_rows:records.length,jurisdictions:56,positive_source_zips:3,coverage_zip_rows:4,cohort_zip_rows:5,zcta_rows:2,shards:10 } },raw=json(replay);
  await write(original.echo_replay_config.path,raw); original.echo_replay_config.sha256=hash(raw); await write(`config/${DATASET}.json`,json(original));
  return { root,config:original,write,options:{ root,createdAt:'2026-10-08T12:00:00.000Z' } };
}

test('classification validates exact membership, edition-limited codes, combined sectors, strict health and ambiguity',async () => {
  const catalog=JSON.parse(await fs.readFile(path.join(ROOT,'config/datasets/us-census-naics-reference.json'))),ref=await rows(path.dirname(path.join(ROOT,catalog.retained_release.manifest)),'codes.jsonl');
  const editions=new Map([1997,2002,2007,2012,2017,2022].map(edition => [edition,new Map(ref.filter(row => row.edition === edition).map(row => [row.naics_code,row]))]));
  for (const [code,segment] of [['2332','construction'],['236','construction'],['44','retail-consumer'],['49','transportation'],['621','health-care'],['6244','childcare'],['624410','childcare']]) { const result=classifyExactEchoNaics(code,editions); assert.equal(result.status,'mapped',code); assert.equal(result.segment,segment,code); }
  assert.ok(classifyExactEchoNaics('2332',editions).reference_editions.length < 6);
  assert.equal(classifyExactEchoNaics('44',editions).reference_titles[0].membership,'combined-sector-component');
  for (const code of ['62','624','311111']) { assert.equal(classifyExactEchoNaics(code,editions).segment,null); assert.equal(classifyExactEchoNaics(code,editions).status,'valid-outside-operational-segments'); }
  assert.equal(classifyExactEchoNaics('999999',editions).status,'invalid-in-all-reference-editions');
  const ambiguous=new Map([...editions].map(([edition,map]) => [edition,new Map(map)])); ambiguous.get(2022).set('23',{ title:'Unrelated sector' }); assert.equal(classifyExactEchoNaics('236',ambiguous).status,'unresolved-naics-edition');
  const result=classifyEchoSegmentRecord(['2332','236','44','999999'],code => classifyExactEchoNaics(code,editions));
  assert.equal(result.status,'multisegment'); assert.equal(result.partial,true); assert.deepEqual(result.memberships.get('construction'),['2332','236']); assert.equal(result.memberships.size,2);
  assert.throws(() => classifyExactEchoNaics('23-25',editions),/syntax/);
});

test('source-row replay deduplicates same-segment codes and independently conserves exclusive statuses, ZIP gaps and territories',async t => {
  const f=await fixture(t),previousFetch=globalThis.fetch; globalThis.fetch=()=>assert.fail('No network allowed'); t.after(()=>{ globalThis.fetch=previousFetch; });
  const value=await build(f.options),verified=await verify(path.join(value.releaseDirectory,'manifest.json'),{ root:f.root });
  assert.equal(verified.verified,true); assert.equal(value.source_record_count,7); assert.equal(value.records_with_segment,4); assert.equal(value.segment_assignments,5);
  assert.deepEqual(value.status_counts,{ 'missing-naics':1,'invalid-in-all-reference-editions':1,'unresolved-naics-edition':0,'valid-outside-operational-segments':1,mapped:2,'partially-unmapped':1,multisegment:1 });
  assert.equal(value.segments.find(row => row.segment === 'construction').source_record_count,3); assert.equal(value.segments.find(row => row.segment === 'childcare').source_record_count,1); assert.equal(value.segments.find(row => row.segment === 'health-care').source_record_count,0);
  const zips=await rows(value.releaseDirectory,'zip5-evidence.jsonl.gz'),states=await rows(value.releaseDirectory,'states.jsonl'),territories=await rows(value.releaseDirectory,'territories.jsonl'),cells=await rows(value.releaseDirectory,'zip-segments/prefix=0.jsonl.gz');
  assert.deepEqual(states.map(row => row.code),STATE_DC_CODES); assert.equal(territories.length,5); assert.equal(zips.length,5); assert.equal(zips.find(row => row.zip5 === '99999').source_record_count,0); assert.equal(zips.find(row => row.zip5 === '00000').denominator_classification,'explicit-placeholder'); assert.equal(cells.find(row => row.zip5 === '00901').zcta_geoid,null);
  assert.deepEqual(cells.find(row => row.segment === 'construction').triggering_codes,[{ naics_code:'23',source_record_count:1 },{ naics_code:'2332',source_record_count:1 },{ naics_code:'236',source_record_count:2 }]);
  assert.equal(value.manifest.claims.generic_business_additivity_delta,0); assert.equal(value.manifest.claims.main_matrix_changed,false); assert.equal(value.manifest.claims.naics_edition_inferred,false);
  assert.equal(value.manifest.artifacts.length,17); assert.deepEqual(await rows(value.releaseDirectory,'missing-zip.jsonl'),[]); assert.deepEqual(await rows(value.releaseDirectory,'out-of-cohort.jsonl'),[]); await assert.rejects(fs.stat(path.join(f.root,`data/${DATASET}/current.json`)),{ code:'ENOENT' });
  const require=createRequire(import.meta.url),Ajv2020=createRequire(require.resolve('ajv-formats/package.json'))('ajv/dist/2020.js').default,ajv=new Ajv2020({ strict:false,allErrors:true }); addFormats(ajv);
  const validate=ajv.compile(JSON.parse(await fs.readFile(path.join(ROOT,`config/schemas/${DATASET}.schema.json`))));
  for (const row of [value.manifest,...states,...territories,...zips,...cells,...await rows(value.releaseDirectory,'code-validation.jsonl'),...await rows(value.releaseDirectory,'summary.json')]) assert.equal(validate(row),true,JSON.stringify(validate.errors));
  assert.equal(validate({ ...cells[0],name:'forbidden' }),false);
});

test('input pins and crosswalk semantic contract reject drift before publication',async t => {
  for (const field of ['crosswalk','echo_replay_config']) { const f=await fixture(t); await fs.appendFile(path.join(f.root,f.config[field].path),' '); await assert.rejects(build(f.options),/drift/); }
  const f=await fixture(t),crosswalk=JSON.parse(await fs.readFile(path.join(f.root,f.config.crosswalk.path))); crosswalk.rules[0].segment='health-care'; const raw=json(crosswalk); await f.write(f.config.crosswalk.path,raw); f.config.crosswalk.sha256=hash(raw); await f.write(`config/${DATASET}.json`,json(f.config)); await assert.rejects(build(f.options),/crosswalk drift\/semantics/);
});

test('verifier rejects false claims, changed counts and unexpected output inventory',async t => {
  const f=await fixture(t),value=await build(f.options),filename=path.join(value.releaseDirectory,'manifest.json'),raw=await fs.readFile(filename),manifest=JSON.parse(raw);
  manifest.claims.naics_edition_inferred=true; await fs.writeFile(filename,json(manifest)); await assert.rejects(verify(filename,{ root:f.root }),/manifest reconstruction/); await fs.writeFile(filename,raw);
  await fs.writeFile(path.join(value.releaseDirectory,'foreign.txt'),'foreign'); await assert.rejects(verify(filename,{ root:f.root }),/closed output inventory/); await fs.unlink(path.join(value.releaseDirectory,'foreign.txt'));
  const stateRows=await rows(value.releaseDirectory,'states.jsonl'); stateRows.find(row => row.code === 'MA').segments[0].source_record_count++; await fs.writeFile(path.join(value.releaseDirectory,'states.jsonl'),jsonl(stateRows)); await assert.rejects(verify(filename,{ root:f.root }),/artifact replay/);
});

test('cooperative cancellation, sink failure and post-manifest failure preserve unrelated artifacts and remove owned locks/stages',async t => {
  for (const phase of ['source-row','output-row','after-manifest-before-verification','after-verification-before-publication','sink-failure']) {
    const f=await fixture(t),base=path.join(f.root,`data/${DATASET}`); await fs.mkdir(path.join(base,'releases/historical'),{ recursive:true }); await fs.mkdir(path.join(base,'.stage-unrelated')); await fs.writeFile(path.join(base,'.stage-unrelated/sentinel'),'preserve');
    const controller=new AbortController(); let hit=false;
    await assert.rejects(build({ ...f.options,signal:controller.signal,hooks:async (event,context) => { if (!hit && (event === phase || phase === 'sink-failure' && event === 'output-row')) { hit=true; if (phase === 'sink-failure') context.sink.destroy(new Error('injected sink failure')); else if (phase === 'after-manifest-before-verification') throw new Error('injected post-manifest failure'); else controller.abort(); } } }),phase.includes('failure') || phase === 'after-manifest-before-verification' ? /injected|premature close|destroyed/ : { name:'AbortError' });
    assert.equal(hit,true); assert.deepEqual((await fs.readdir(base)).sort(),['.stage-unrelated','releases']); assert.deepEqual(await fs.readdir(path.join(base,'releases')),['historical']);
  }
});

test('registered national release replays original records and retained six-edition references', { timeout:300_000 },async () => {
  const catalog=JSON.parse(await fs.readFile(path.join(ROOT,`config/datasets/${DATASET}.json`))),pin=catalog.retained_release,filename=path.join(ROOT,pin.manifest);
  assert.equal(hash(await fs.readFile(filename)),pin.manifest_sha256); const result=await verify(filename);
  assert.equal(result.verified,true); assert.equal(result.release_id,pin.release_id); assert.equal(result.source_record_count,1517826); assert.equal(result.records_with_segment,294477); assert.equal(result.segment_assignments,296595); assert.equal(result.status_counts.multisegment,2107);
  assert.deepEqual(result.segments.map(({ segment,source_record_count }) => ({ segment,source_record_count })),[{ segment:'construction',source_record_count:93917 },{ segment:'retail-consumer',source_record_count:124323 },{ segment:'financial-services',source_record_count:1888 },{ segment:'transportation',source_record_count:47049 },{ segment:'health-care',source_record_count:29241 },{ segment:'childcare',source_record_count:177 }]);
  assert.equal(Object.values(result.status_counts).reduce((n,v)=>n+v,0),result.source_record_count); assert.deepEqual(Object.keys(result.status_counts),STATUSES); assert.equal(result.state_dc_source_records+result.territory_source_records,result.source_record_count); assert.equal(result.zip5_cohort_rows,48194); assert.equal(result.out_of_cohort_source_records,0); assert.equal(result.missing_zip_source_records,0); assert.equal(catalog.runtime_pointer,null); assert.equal(catalog.production_enrollment,false);
});
