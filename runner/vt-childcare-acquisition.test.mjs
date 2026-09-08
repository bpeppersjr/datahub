import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import policy from '../config/source-policies/vt-childcare-centers-internal.json' with {type:'json'};
import {acquireVtChildcareWithTransport,acquireVtChildcareNative,replayVtChildcareAcquisition,vtChildcareRequest} from './vt-childcare-acquisition.mjs';
import {createVtChildcareFixture} from './vt-childcare-test-fixtures.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
let good;
test('VT full synthetic acquisition journals three traversals including terminals and replays offline',async()=>{
 const fixture=createVtChildcareFixture({count:501});
 const evidence=await acquireVtChildcareWithTransport(fixture.options);good=evidence;
 assert.equal(evidence.transport.requests,21);assert.equal(fixture.calls.length,21);assert.equal(evidence.observations.length,9);
 assert.deepEqual(evidence.observations.map(o=>o.payload.length),[500,1,0,500,1,0,500,1,0]);assert.equal(fixture.persisted.length,10);
 assert.equal(fixture.persisted[0].kind,'prerequisite');assert.equal(evidence.before_preflight.execution_mode,'injected-test-transport');assert.equal(evidence.execution_mode,'injected-test-transport');
 assert.equal(evidence.claims.atomic_snapshot_verified,false);assert.equal(evidence.claims.reporting_period_verified,false);assert.equal(evidence.source,undefined);
 const saved=globalThis.fetch;globalThis.fetch=()=>assert.fail('offline only');
 try{const replay=await replayVtChildcareAcquisition(evidence);assert.deepEqual(replay.features,fixture.selected);assert.equal(replay.source.reporting_period,null);assert.equal(replay.source.observed_at,evidence.finished_at);assert.equal(JSON.stringify(evidence).includes('PRIVATE_CACHE'),false);
 const mutable=structuredClone(evidence),pending=replayVtChildcareAcquisition(mutable);mutable.observations[3].payload[0].provider_name='caller changed after entry';assert.deepEqual((await pending).features,fixture.selected);
 }finally{globalThis.fetch=saved;}
});
test('VT replay rejects rehashed request, terminal, member and semantic drift',async()=>{
 assert.ok(good);
 const mutations=[
 e=>{e.observations[0].request.method='GET';},e=>{e.observations[0].request.body.includeSystem=true;},e=>{e.observations[0].request.body.includeSynthetic=true;},e=>{e.observations[1].request.body.page.pageNumber=1;},
 e=>{e.observations[3].request.body.query+=' LIMIT 1';},e=>{e.observations[1].payload[0].license_id=e.observations[0].payload[0].license_id;},e=>{e.observations[7].payload[0].license_id=e.observations[6].payload[0].license_id;},
 ...[2,5,8].map(index=>e=>{e.observations[index].payload=[{...e.observations[index-1].payload[0]}];}),
 e=>{e.observations[3].payload[0][':id']='PRIVATE';},e=>{e.observations[3].payload[0].provider_name={private:'PRIVATE'};},e=>{e.observations[3].payload[0].file_name='other';},
 e=>{e.observations[3].payload[0].provider_program_type='CBCCPP - Non-Recurring';},e=>{e.observations[3].payload[0].current_license_start_date=null;},
 e=>{e.transport.decoded_body_bytes++;},e=>{e.transport.requests--;},e=>{e.configuration.connector_sha256='0'.repeat(64);},e=>{e.claims.current_operations_verified=true;}
 ];
 for(const mutate of mutations){const changed=structuredClone(good);mutate(changed);for(const o of changed.observations)o.payload_sha256=hash(o.payload);await assert.rejects(replayVtChildcareAcquisition(changed));}
});
test('VT rejects unapproved options, access errors and malformed UTF8 without retries',async()=>{
 await assert.rejects(acquireVtChildcareNative({now:()=>new Date()}));await assert.rejects(acquireVtChildcareNative({fetchImpl:()=>assert.fail()}));
 await assert.rejects(acquireVtChildcareWithTransport({...createVtChildcareFixture().options,signal:AbortSignal.abort()}),{name:'AbortError'});
 for(const make of [()=>new Response('PRIVATE',{status:429}),()=>new Response(null,{status:302}),()=>new Response(Uint8Array.of(255),{headers:{'content-type':'application/json'}}),()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'2000001'}})]){
  let calls=0;const f=createVtChildcareFixture();await assert.rejects(acquireVtChildcareWithTransport({...f.options,fetchImpl:()=>{calls++;return make();}}),e=>!e.message.includes('PRIVATE'));assert.equal(calls,1);
 }
 assert.throws(()=>vtChildcareRequest('page',42));assert.throws(()=>vtChildcareRequest('unknown',1));
});
test('VT exact500 page terminal and rejected selected private field preserve durable boundaries',async()=>{
 await Promise.all([
  (async()=>{const f=createVtChildcareFixture({count:500});const e=await acquireVtChildcareWithTransport(f.options);assert.deepEqual(e.observations.map(o=>o.payload.length),[500,0,500,0,500,0]);assert.equal(e.transport.requests,18);})(),
  (async()=>{const f=createVtChildcareFixture({mutate:(v,k)=>{if(k==='page'&&v.length)v[0].email='PRIVATE';}});await assert.rejects(acquireVtChildcareWithTransport(f.options));assert.deepEqual(f.persisted.map(p=>p.kind),['prerequisite','baseline-ids','baseline-ids']);})()
 ]);
});
test('VT cancellation drains trusted prerequisite before any roster request',async()=>{
 const f=createVtChildcareFixture(),controller=new AbortController();let entered,release;const ready=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{release=resolve;});let finished=false;
 const pending=acquireVtChildcareWithTransport({...f.options,signal:controller.signal,retainPrerequisite:async()=>{entered();await held;}}).finally(()=>{finished=true;});
 await ready;controller.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.equal(f.calls.length,6);release();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.calls.length,6);
});
test('VT POST cancellation drains headers/body and observation sinks; 403 and duplicate roster never journal',async()=>{
 await Promise.all(['headers','body','sink','403','duplicate'].map(async mode=>{
  const controller=new AbortController(),f=createVtChildcareFixture();let late,cancelled=0,entered,release,finished=false,postCalls=0;
  const ready=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{release=resolve;});
  const fetchImpl=async(url,settings)=>{
   if(settings.method!=='POST')return f.fetchImpl(url,settings);
   postCalls++;
   if(mode==='headers')return new Promise(resolve=>{late=resolve;controller.abort();});
   if(mode==='body')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('['));setImmediate(()=>controller.abort());},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}});
   if(mode==='403')return new Response('PRIVATE',{status:403});
   if(mode==='duplicate'){const response=await f.fetchImpl(url,settings),rows=await response.json();rows[1].license_id=rows[0].license_id;return Response.json(rows);}
   return f.fetchImpl(url,settings);
  };
  const pending=acquireVtChildcareWithTransport({...f.options,fetchImpl,signal:controller.signal,retainObservation:async()=>{entered();await held;}}).finally(()=>{finished=true;});
  // Register rejection handling before a gated asynchronous assertion can yield.
  const rejected=assert.rejects(pending,mode==='sink'||mode==='headers'||mode==='body'?{name:'AbortError'}:e=>!e.message.includes('PRIVATE'));
  if(mode==='sink'){await ready;controller.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);release();}
  await rejected;
  if(late){late(new Response(new ReadableStream({cancel(){cancelled++;}})));await new Promise(resolve=>setImmediate(resolve));}
  if(mode==='headers'||mode==='body')assert.equal(cancelled,1);
  assert.equal(f.persisted.filter(p=>p.kind!=='prerequisite').length,0);
  assert.ok(f.calls.length<=7);
  assert.equal(postCalls,1);
 }));
});
test('VT offline replay checks imported policy drift',async()=>{
 assert.ok(good);const old=policy.export_policy;
 try{policy.export_policy='public';await assert.rejects(replayVtChildcareAcquisition(good));}finally{policy.export_policy=old;}
});
