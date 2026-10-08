import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { APP_ROOT } from './paths.mjs';
import { readEpaOperationalIndustryStatus, reconcileEpaSegmentJurisdictions } from './epa-operational-industry-status.mjs';
import { epaOperationalIndustryStatusHttp } from './epa-operational-industry-status-http.mjs';
import { readOperationalIndustryEvidenceSummary } from './operational-industry-evidence-summary.mjs';

const pin=createRequire(import.meta.url)('../config/epa-operational-industry-status-contract.json');
const directory=path.dirname(path.join(APP_ROOT,pin.manifest));
const json=file=>fs.readFile(file,'utf8').then(JSON.parse);
const rows=file=>fs.readFile(file,'utf8').then(text=>text.trim().split('\n').map(JSON.parse));

test('EPA supplemental contract conserves national membership/ZIP counts and separate state/territory evidence',async()=>{
  const base=await readOperationalIndustryEvidenceSummary({state:'NJ'}),serialized=JSON.stringify(base);
  const view=await readEpaOperationalIndustryStatus({state:'NJ'});
  assert.equal(view.selected_state_evidence.source_record_count,28191);
  assert.equal(view.selected_state_evidence.segment_memberships,4046);
  assert.equal(view.selected_state_evidence.industries.find(row=>row.id==='retail-consumer').record_memberships,2236);
  assert.equal(view.national.segment_memberships,296595);
  assert.equal(view.national.industries.reduce((n,row)=>n+(row.positive_zip5_count??0),0),50277);
  assert.deepEqual(view.territories.map(row=>row.code),['AS','GU','MP','PR','VI']);
  assert.equal(view.territories.find(row=>row.code==='PR').segment_memberships,514);
  assert.equal(view.claims.cross_segment_counts_additive,false);
  assert.equal(view.claims.current_operating_business_count,null);
  assert.ok(view.selected_state_evidence.industries.every(row=>row.positive_zip5_count===null));
  assert.ok(view.national.industries.filter(row=>row.mapping==='no-epa-mapping').every(row=>row.record_memberships===null&&row.positive_zip5_count===null));
  assert.equal(JSON.stringify(await readOperationalIndustryEvidenceSummary({state:'NJ'})),serialized);
  assert.ok(Buffer.byteLength(JSON.stringify(view))<16000);
  assert.doesNotMatch(JSON.stringify(view),/triggering_codes|facility_id|address|coordinates/);
  const national=await readEpaOperationalIndustryStatus();assert.equal(national.selected_state_evidence,null);
  const dc=await readEpaOperationalIndustryStatus({state:'DC'});assert.equal(dc.selected_state_evidence.code,'DC');
  for(const state of ['PR','ZZ','nj','',{},'NJ&x=1'])await assert.rejects(readEpaOperationalIndustryStatus({state}),/selector/);
});

test('jurisdiction projection rejects count/schema/status/triggering-code/roster and conservation drift',async()=>{
  const summary=await json(path.join(directory,'summary.json')),states=await rows(path.join(directory,'states.jsonl')),territories=await rows(path.join(directory,'territories.jsonl'));
  reconcileEpaSegmentJurisdictions(summary,states,territories);
  for(const mutate of [
    x=>x.states[0].source_record_count++,x=>x.states[0].status_counts.mapped++,x=>x.states[0].segments[0].source_record_count++,
    x=>x.states[0].segments[0].triggering_codes[0].source_record_count++,x=>x.states.pop(),x=>x.territories[0].code='DC',
    x=>x.territories[0].jurisdiction_kind='state-or-dc',x=>x.states[0].extra=true,x=>x.states[0].segments[0].extra=true,
    x=>x.states[0].source_record_count=-1,x=>x.states[0].records_with_segment='5',x=>x.summary.source_record_count++,x=>x.states[0].segments[0].triggering_codes=[],
    x=>x.summary.segment_assignments++,x=>x.summary.status_counts['unresolved-naics-edition']++,x=>x.summary.unmapped_operational_segments.pop(),
  ]){const value=structuredClone({summary,states,territories});mutate(value);assert.throws(()=>reconcileEpaSegmentJurisdictions(value.summary,value.states,value.territories),/rejected/)}
});

test('immutable reader rejects registry/manifest/artifact tampering and missing evidence without touching base contract',async()=>{
  const root=await fs.mkdtemp(path.join(APP_ROOT,'data','.test-epa-status-'));
  const registered=path.join(root,'config/datasets/national-epa-echo-operational-segment-evidence.json'),manifest=path.join(root,pin.manifest);
  try{
    await fs.mkdir(path.dirname(registered),{recursive:true});await fs.copyFile(path.join(APP_ROOT,'config/datasets/national-epa-echo-operational-segment-evidence.json'),registered);
    await fs.cp(directory,path.dirname(manifest),{recursive:true});
    const original=await fs.readFile(registered);
    for(const change of [value=>value.retained_release.manifest_sha256='f'.repeat(64),value=>value.retained_release.release_id='other',value=>value.production_enrollment=true,value=>value.runtime_pointer='current',value=>value.retained_release.manifest='../manifest.json']){
      const value=JSON.parse(original);change(value);await fs.writeFile(registered,JSON.stringify(value));await assert.rejects(readEpaOperationalIndustryStatus({root,state:'NJ'}),/registered/);
    }
    await fs.writeFile(registered,original);
    for(const change of [value=>value.retained_release.source_record_count++,value=>value.retained_release.segments.construction++,value=>value.retained_release.extra=true]){
      const value=JSON.parse(original);change(value);await fs.writeFile(registered,JSON.stringify(value));await assert.rejects(readEpaOperationalIndustryStatus({root}),/registered count reconciliation/);
    }
    await fs.writeFile(registered,original);
    const rawManifest=await fs.readFile(manifest);await fs.appendFile(manifest,' ');await assert.rejects(readEpaOperationalIndustryStatus({root}),/manifest pin/);await fs.writeFile(manifest,rawManifest);
    for(const name of ['summary.json','states.jsonl','territories.jsonl','code-validation.jsonl','missing-zip.jsonl','zip5-evidence.jsonl.gz','zip-segments/prefix=9.jsonl.gz']){
      const file=path.join(path.dirname(manifest),name),raw=await fs.readFile(file);await fs.appendFile(file,' ');await assert.rejects(readEpaOperationalIndustryStatus({root}),/artifact pin/);await fs.writeFile(file,raw);
    }
    await fs.rename(manifest,`${manifest}.held`);await assert.rejects(readEpaOperationalIndustryStatus({root}));
    assert.equal((await readOperationalIndustryEvidenceSummary({state:'NJ'})).industries.length,9);
  }finally{assert.ok(path.resolve(root).startsWith(path.join(APP_ROOT,'data')+path.sep));await fs.rm(root,{recursive:true,force:true})}
});

test('supplemental HTTP rejects bodies, duplicates, territory selectors and unknown options; isolates redacted failures',async()=>{
  const request=async(method,query='',headers={},reader=async options=>options)=>{let result;await epaOperationalIndustryStatusHttp({method,headers},{},new URL(`http://127.0.0.1/api/business-map/epa-operational-industry-status${query}`),reader,(_,status,body)=>{result={status,body}});return result};
  assert.deepEqual(await request('GET'),{status:200,body:{state:null}});assert.deepEqual(await request('GET','?state=DC'),{status:200,body:{state:'DC'}});
  assert.equal((await request('POST')).status,405);
  for(const query of ['?state=PR','?state=','?state=NJ&state=NJ','?state=nj','?zip=00100'])assert.equal((await request('GET',query)).status,400);
  for(const headers of [{'content-length':'1'},{'transfer-encoding':'chunked'},{'content-length':'invalid'}])assert.equal((await request('GET','',headers)).status,400);
  const failure=await request('GET','?state=NJ',{},async()=>{throw new Error('private path secret')});assert.equal(failure.status,503);assert.match(failure.body.error,/Base Industry Status remains available/);assert.doesNotMatch(JSON.stringify(failure),/private path secret/);
});
