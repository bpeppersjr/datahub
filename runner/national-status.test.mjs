import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import pin from '../config/national-status-contract.json' with { type:'json' };
import { APP_ROOT } from './paths.mjs';
import { readNationalStatus, decodeNationalStatusPartition, NATIONAL_STATUS_LIMITS } from './national-status.mjs';
import { nationalStatusHttp, nationalStatusPreflight } from './national-status-http.mjs';
import { validNationalStatus } from '../app/national-status-validation.mjs';
const source=path.dirname(path.join(APP_ROOT,pin.manifest));

test('National Status conserves headline units, nine state/DC industries and separate geography',async()=>{
  const summary=await readNationalStatus();assert.equal(validNationalStatus(summary),true);
  assert.equal(summary.zip5_cohort_rows*summary.source_dimensions,2457894);assert.equal(summary.state_industry_rows,51*9);
  assert.equal(Object.values(summary.geography_scope_counts).reduce((n,v)=>n+v,0),48194);
  assert.equal(summary.territories.reduce((n,v)=>n+v.zip5_rows,0),149);
  for(const state of ['NJ','DC']){const view=await readNationalStatus({kind:'state',state});assert.equal(view.industries.length,9);assert.equal(validNationalStatus(view,state),true);assert.ok(Buffer.byteLength(JSON.stringify(view))<128000)}
  for(const state of ['PR','AS','ZZ','nj','',null])await assert.rejects(readNationalStatus({kind:'state',state}),/selector/);
  assert.equal(summary.claims.business_completeness,null);assert.equal(summary.claims.unresolved_geography_blocks_map,false);
});

test('ZIP endpoint retains exact zero-prefixed strings, separate ZIP4 and unknown outside-cohort results',async()=>{
  for(const zip of ['00000','10001','99999']){const view=await readNationalStatus({kind:'zip',zip});assert.equal(validNationalStatus(view,zip),true);assert.equal(view.zip5,zip);assert.equal(view.zip4,null);assert.equal(view.dimensions.length,view.found?51:0)}
  const placeholder=await readNationalStatus({kind:'zip',zip:'00000'});assert.equal(placeholder.geography_scope,'explicit-placeholder');
  for(const zip of ['10001-1234','1000',10001,'../00',''])await assert.rejects(readNationalStatus({kind:'zip',zip}),/selector/);
});

test('closed client views reject claim/pin/count/roster/percentage/vector and nested tampering',async()=>{
  const summary=await readNationalStatus(),state=await readNationalStatus({kind:'state',state:'NJ'}),zip=await readNationalStatus({kind:'zip',zip:'10001'});
  for(const mutate of [x=>x.extra=true,x=>x.claims.business_completeness=100,x=>x.claims.zip4_joined=true,x=>x.provenance.artifact_sha256='f'.repeat(64),x=>x.matrix_evidence_cells++,x=>x.geography_scope_counts['non-zcta-unassigned']++,x=>x.temporal_assessment.dimension_counts.stale++,x=>x.industry_evidence_metrics[0].exact_zip_measurement_reach_percent++,x=>x.territories[0].code='DC',x=>x.territories[0].included_in_state_denominator=true]){const v=structuredClone(summary);mutate(v);assert.equal(validNationalStatus(v),false,String(mutate))}
  for(const mutate of [x=>x.state='PR',x=>x.industries.pop(),x=>x.industries[0].dimensions[0].disposition_counts['measured-zero']++,x=>x.industries[0].dimensions[0].temporal_qualification.extra=true,x=>x.industries[0].dimensions[0].temporal_qualification.review_qualification='fresh',x=>x.industries[0].dimension_evidence_availability_percent++,x=>x.industries[0].zip_dimension_cell_denominator++,x=>x.industries[0].dimensions[0].positive_zip_dimension_cells++]){const v=structuredClone(state);mutate(v);assert.equal(validNationalStatus(v,'NJ'),false,String(mutate))}
  for(const mutate of [x=>x.zip4='1234',x=>x.dimensions.pop(),x=>x.dimensions[0].id='other',x=>x.dimensions[0].evidence_status='complete',x=>x.dimensions[0].matrix_manifest_sha256='f'.repeat(64),x=>x.geography_scope='state:99',x=>x.provenance.extra=true]){const v=structuredClone(zip);mutate(v);assert.equal(validNationalStatus(v,'10001'),false,String(mutate))}
});

test('runtime reads only selected artifacts; immutable pin/hash/registry/ancestor symlink failures close',async()=>{
  const root=await fs.mkdtemp(path.join(APP_ROOT,'data','.test-national-status-')),registration=path.join(root,'config/datasets/national-goal-evidence-federation.json'),directory=path.dirname(path.join(root,pin.manifest));
  try{
    await fs.mkdir(path.dirname(registration),{recursive:true});await fs.copyFile(path.join(APP_ROOT,'config/datasets/national-goal-evidence-federation.json'),registration);await fs.cp(source,directory,{recursive:true});
    const original=await fs.readFile(registration);
    for(const mutate of [x=>x.retained_release.manifest_sha256='f'.repeat(64),x=>x.retained_release.manifest='../secret',x=>x.runtime_pointer='current',x=>x.production_enrollment=true,x=>x.extra=true,x=>x.retained_release.source_dimensions++]){const v=JSON.parse(original);mutate(v);await fs.writeFile(registration,JSON.stringify(v));await assert.rejects(readNationalStatus({root}),/registration/)}await fs.writeFile(registration,original);
    for(const name of ['manifest.json','national-summary.json','gap-ledger.json','territories.json']){const file=path.join(directory,name),raw=await fs.readFile(file);await fs.appendFile(file,' ');await assert.rejects(readNationalStatus({root}),/manifest|checksum/);await fs.writeFile(file,raw)}
    for(const [name,options] of [['state-industry-status.jsonl',{kind:'state',state:'NJ'}],['zip-status/prefix=10.jsonl.gz',{kind:'zip',zip:'10001'}]]){const file=path.join(directory,name),raw=await fs.readFile(file);await fs.appendFile(file,' ');await assert.rejects(readNationalStatus({root,...options}),/checksum/);await fs.writeFile(file,raw)}
    // Summary does not require state/ZIP files; ZIP requires only its selected partition.
    const parts=await fs.readdir(path.join(directory,'zip-status'));for(const name of parts.filter(name=>name!=='prefix=10.jsonl.gz'))await fs.unlink(path.join(directory,'zip-status',name));
    await readNationalStatus({root});await readNationalStatus({root,kind:'state',state:'NJ'});await readNationalStatus({root,kind:'zip',zip:'10001'});
    await fs.rename(path.join(directory,'zip-status'),path.join(directory,'zip-status-held'));
    await fs.symlink(path.join(directory,'zip-status-held'),path.join(directory,'zip-status'),'junction');
    await assert.rejects(readNationalStatus({root,kind:'zip',zip:'10001'}),/symlink/);
  }finally{assert.ok(path.resolve(root).startsWith(path.join(APP_ROOT,'data')+path.sep));await fs.rm(root,{recursive:true,force:true})}
});

test('gzip decoding enforces declared compressed/decompressed/line/partition/vector limits',async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'))),a=manifest.artifacts.find(a=>a.path==='zip-status/prefix=10.jsonl.gz'),raw=await fs.readFile(path.join(source,a.path));
  assert.equal(decodeNationalStatusPartition(raw,a,'10').length,a.record_count);
  for(const change of [x=>x.bytes=NATIONAL_STATUS_LIMITS.compressed+1,x=>x.decoded_bytes=NATIONAL_STATUS_LIMITS.decoded+1,x=>x.decoded_bytes++,x=>x.record_count=1201,x=>x.record_count++]){const d={...a};change(d);assert.throws(()=>decodeNationalStatusPartition(raw,d,'10'))}
  assert.throws(()=>decodeNationalStatusPartition(raw,a,'11'),/ZIP status/);
  const bomb=gzipSync('x'.repeat(NATIONAL_STATUS_LIMITS.decoded+1));assert.throws(()=>decodeNationalStatusPartition(bomb,{bytes:bomb.length,decoded_bytes:1,record_count:1},'10'));
});

test('every retained ZIP partition fits runtime bounds and all special/territory scopes remain inspectable',async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'))),counts={},representatives=new Map();let total=0;
  for(const a of manifest.artifacts.filter(a=>a.path.endsWith('.gz'))){const prefix=a.path.match(/prefix=(\d{2})/)[1];for(const row of decodeNationalStatusPartition(await fs.readFile(path.join(source,a.path)),a,prefix)){total++;counts[row.geography_scope]=(counts[row.geography_scope]??0)+1;if(!representatives.has(row.geography_scope))representatives.set(row.geography_scope,row.zip5)}}
  assert.equal(total,48194);assert.deepEqual(counts,pin.geography_scope_counts);
  for(const [scope,zip] of representatives){if(scope.startsWith('state:'))continue;const v=await readNationalStatus({kind:'zip',zip});assert.equal(v.geography_scope,scope);assert.equal(validNationalStatus(v,zip),true)}
});

test('HTTP rejects methods, bodies, unknown/repeated options and territory state selectors; errors redact',async()=>{
  const invoke=async(kind,query='',method='GET',headers={},reader=async o=>o)=>{let value;await nationalStatusHttp({method,headers},{},new URL(`http://127.0.0.1/api/business-map/national-status-${kind}${query}`),reader,(_,status,body)=>value={status,body});return value};
  assert.equal((await invoke('summary')).status,200);assert.equal((await invoke('state','?state=DC')).status,200);assert.equal((await invoke('zip','?zip=00000')).body.zip,'00000');
  for(const [kind,q] of [['summary','?state=NJ'],['state',''],['state','?state=PR'],['state','?state=NJ&state=NJ'],['zip','?zip=10001-1234'],['zip','?zip=10001&path=secret'],['zip','?zip=10001&zip=10002']])assert.equal((await invoke(kind,q)).status,400);
  for(const headers of [{'content-length':'1'},{'content-length':'invalid'},{'transfer-encoding':'chunked'}])assert.equal((await invoke('summary','','GET',headers)).status,400);
  for(const method of ['POST','HEAD','OPTIONS','PUT'])assert.equal((await invoke('summary','',method)).status,405);
  const failure=await invoke('summary','','GET',{},async()=>{throw Error('private C:\\secret API token')});assert.equal(failure.status,503);assert.doesNotMatch(JSON.stringify(failure),/private|secret|token/);
});

test('guarded CORS preflight permits browser Authorization declaration and rejects data/body methods',()=>{
  let status;const response={setHeader(){},writeHead(code){status=code},end(){}};
  const h={origin:'http://127.0.0.1:3000','access-control-request-method':'GET','access-control-request-headers':'authorization'};
  nationalStatusPreflight({headers:h},response,(_,code)=>status=code);assert.equal(status,204);
  for(const change of [x=>delete x.origin,x=>x['access-control-request-method']='POST',x=>x['access-control-request-headers']='content-type',x=>x['content-length']='1',x=>x['transfer-encoding']='chunked']){const headers={...h};change(headers);nationalStatusPreflight({headers},response,(_,code)=>status=code);assert.equal(status,400)}
});
