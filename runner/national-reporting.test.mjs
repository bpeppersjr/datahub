import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir,mkdtemp,readFile,writeFile,rm,symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { readNationalReportingCatalog,validateNationalReportingCatalog,summarizeNationalReportingCounts } from './national-reporting-catalog.mjs';
import { readNationalReportingSnapshot } from './national-reporting-snapshot.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('versioned eight-source catalog is closed and preserves unknown completeness',async()=>{
  const {catalog}=await readNationalReportingCatalog();assert.equal(catalog.sources.length,8);
  assert.equal(catalog.sources[5].profileId,null);assert.equal(catalog.sources[6].sourceKey,'epa_echo_active_facilities');
  for(const mutate of [v=>v.sources.pop(),v=>v.sources[7]=v.sources[6],v=>v.script='download.mjs',v=>v.sources[0].args=[],v=>v.allBusinessesPercent=100,v=>v.denominatorVersion='legacy-six',v=>v.exportPolicy='public']) {
    const value=structuredClone(catalog);mutate(value);assert.throws(()=>validateNationalReportingCatalog(value));
  }
  assert.deepEqual(summarizeNationalReportingCounts([0,null,10]),{represented:1,expected:3,unmeasured:1,percent:33.3,allBusinessesPercent:null});
  assert.equal(summarizeNationalReportingCounts([]).percent,null);
  assert.equal(summarizeNationalReportingCounts([null,undefined]).percent,null);
  assert.equal(summarizeNationalReportingCounts([1,2]).allBusinessesPercent,null);
  for(const value of [-1,1.5,NaN,Infinity,'4'])assert.throws(()=>summarizeNationalReportingCounts([value]));
  for(const make of [()=>new Array(8),()=>{const rows=structuredClone(catalog.sources);delete rows[2];return rows;},
    ()=>{const rows=structuredClone(catalog.sources);rows.extra=true;return rows;},
    ()=>{const rows=structuredClone(catalog.sources);Object.defineProperty(rows,'0',{get(){assert.fail('array getter executed');},enumerable:true});return rows;}]){
    assert.throws(()=>validateNationalReportingCatalog({...catalog,sources:make()}));
  }
  for(const values of [new Array(1),Object.assign([0],{extra:true})])assert.throws(()=>summarizeNationalReportingCounts(values));
  const accessor=[0];Object.defineProperty(accessor,'0',{get(){assert.fail('count getter executed');},enumerable:true});
  assert.throws(()=>summarizeNationalReportingCounts(accessor));
});

async function fixture(t) {
  await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/national-reporting-'));
  t.after(()=>rm(root,{recursive:true,force:true}));const directory=path.join(root,'releases','fixture');await mkdir(path.join(directory,'views'),{recursive:true});
  const ids={'national-business-registry':'registry_release_id','us-census-geography':'geography_release_id','us-census-zcta-jurisdiction-crosswalk':'zcta_jurisdiction_crosswalk_release_id','national-business-entity-resolution':'entity_resolution_release_id','national-business-entity-resolution-benchmark':'entity_resolution_benchmark_release_id','census-nonemployer-baseline':'census_nonemployer_release_id'};
  const lineage=Object.fromEntries(Object.entries(ids).map(([id,key])=>[key,id+'-fixture']));lineage.transformation_version='national-business-coverage-views@2.11.0';
  const states=[{schema_version:'1.0.0',view_type:'state',postal_abbreviation:'CT',complete_all_businesses:false,lineage,registry_evidence:{source_profile_counts_by_reported_address_state:{'epa-echo-exporter-active-facility':0,'usda-fsis-active-mpi-directory':7}}}];
  const sources=[{schema_version:'1.0.0',view_type:'source',source_key:'epa_echo_active_facilities',complete_source_for_all_businesses:false,lineage}];
  const manifest={schema_version:'1.0.0',dataset_id:'national-business-coverage-views',release_id:'fixture',status:'published-partial-local-aggregate',dependencies:Object.entries(ids).map(([dataset,key])=>({dataset_id:dataset,release_id:lineage[key]})),artifacts:[]};
  for(const [name,rows,type] of [['states',states,'state-coverage-view-jsonl'],['sources',sources,'source-coverage-view-jsonl']]){
    const bytes=Buffer.from(rows.map(row=>JSON.stringify(row)+'\n').join(''));await writeFile(path.join(directory,'views',name+'.jsonl'),bytes);
    manifest.artifacts.push({path:`views/${name}.jsonl`,bytes:bytes.length,sha256:hash(bytes),record_count:rows.length,artifact_type:type,export_policy:'local-review-only'});
  }
  const manifestPath=path.join(directory,'manifest.json'),pointerPath=path.join(root,'current.json');
  await writeFile(manifestPath,JSON.stringify(manifest));await writeFile(pointerPath,JSON.stringify({dataset_id:manifest.dataset_id,release_id:'fixture',manifest:'releases/fixture/manifest.json'}));
  return {root,directory,manifestPath,pointerPath,manifest};
}

test('snapshot verifies bounded aggregate hashes and preserves zero without network',async t=>{
  const f=await fixture(t),old=globalThis.fetch;globalThis.fetch=()=>assert.fail('no network');
  try {const snapshot=await readNationalReportingSnapshot({pointerPath:f.pointerPath});
    assert.equal(snapshot.states[0].registry_evidence.source_profile_counts_by_reported_address_state['epa-echo-exporter-active-facility'],0);
    assert.equal(snapshot.evidence.exportPolicy,'local-review-only');assert.equal(snapshot.evidence.sourceReplayPerformedThisRead,false);
    assert.equal(snapshot.evidence.allBusinessesPercent,null);
  } finally {globalThis.fetch=old;}
  await assert.rejects(readNationalReportingSnapshot({pointerPath:f.pointerPath,signal:AbortSignal.abort()}));
});

test('same-ID mutation, duplicate descriptors, policy escalation and lineage mismatch reject',async t=>{
  const f=await fixture(t);await readNationalReportingSnapshot({pointerPath:f.pointerPath});
  const statePath=path.join(f.directory,'views/states.jsonl'),original=await readFile(statePath);
  await writeFile(statePath,Buffer.concat([original,Buffer.from(' ')]));await assert.rejects(readNationalReportingSnapshot({pointerPath:f.pointerPath}));await writeFile(statePath,original);
  for(const mutate of [m=>m.artifacts.push({...m.artifacts[0]}),m=>m.artifacts[0].bytes++,m=>m.artifacts[0].export_policy='public',m=>m.artifacts[0].path='../escape',m=>m.dependencies[0].release_id='other-registry']){
    const value=structuredClone(f.manifest);mutate(value);await writeFile(f.manifestPath,JSON.stringify(value));await assert.rejects(readNationalReportingSnapshot({pointerPath:f.pointerPath}));
  }
  await writeFile(f.manifestPath,JSON.stringify(f.manifest));
  const alias=path.join(f.root,'releases','alias');
  await symlink(f.directory,alias,'junction');
  await writeFile(f.pointerPath,JSON.stringify({dataset_id:'national-business-coverage-views',release_id:'alias',manifest:'releases/alias/manifest.json'}));
  // Canonical expected layout still rejects alias paths; no arbitrary pointer path is followed.
  await assert.rejects(readNationalReportingSnapshot({pointerPath:f.pointerPath}));
});

test('rehashing does not legitimize duplicate rows, invalid counts, UTF8 or unknown transformations',async t=>{
  const f=await fixture(t);
  const originals={};for(const name of ['states','sources'])originals[name]=await readFile(path.join(f.directory,'views',name+'.jsonl'));
  const cases=[
    ['states',rows=>[...rows,rows[0]]],['sources',rows=>[...rows,rows[0]]],
    ...[-1,1.5].map(value=>['states',rows=>{rows[0].registry_evidence.source_profile_counts_by_reported_address_state.example=value;return rows;}]),
    ['states',rows=>{rows[0].lineage.transformation_version='national-business-coverage-views@99.0.0';return rows;}],
  ];
  for(const [name,mutate] of cases){
    const rows=mutate(originals[name].toString().trimEnd().split('\n').map(JSON.parse)), bytes=Buffer.from(rows.map(row=>JSON.stringify(row)+'\n').join(''));
    const manifest=structuredClone(f.manifest),descriptor=manifest.artifacts.find(row=>row.path===`views/${name}.jsonl`);
    Object.assign(descriptor,{bytes:bytes.length,sha256:hash(bytes),record_count:rows.length});
    await writeFile(path.join(f.directory,'views',name+'.jsonl'),bytes);await writeFile(f.manifestPath,JSON.stringify(manifest));
    await assert.rejects(readNationalReportingSnapshot({pointerPath:f.pointerPath}));
    await writeFile(path.join(f.directory,'views',name+'.jsonl'),originals[name]);
  }
  const bytes=Buffer.concat([originals.states.subarray(0,1),Buffer.from([0xff]),originals.states.subarray(1)]),manifest=structuredClone(f.manifest);
  Object.assign(manifest.artifacts[0],{bytes:bytes.length,sha256:hash(bytes)});
  await writeFile(path.join(f.directory,'views/states.jsonl'),bytes);await writeFile(f.manifestPath,JSON.stringify(manifest));
  await assert.rejects(readNationalReportingSnapshot({pointerPath:f.pointerPath}));
});
