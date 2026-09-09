import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireIaChildcare,acquireIaChildcareWithTestTransport as acquire,replayIaChildcareAcquisition as replay,IA_CHILDCARE_URLS as U,IA_CHILDCARE_TEST_CLIENT as client,IA_CHILDCARE_LIMITS as L} from './ia-childcare-acquisition.mjs';
const rows=[{businessType:'building',businessName:'Fixture Center',address:'1 Main',city:'City',zipCode:50301,latitude:41,longitude:-93,referral:false,contact:'PRIVATE'}, {businessType:'home',businessName:'PRIVATE'}];
const transport=(payload=rows)=>async url=>new Response(url===U.client?client:JSON.stringify(payload));
test('Iowa acquisition awaits three checkpoints and replays selected-only evidence',async()=>{
  const checkpoints=[],calls=[];
  const evidence=await acquire(async(url,o)=>{calls.push([url,o.method]);assert.equal(checkpoints.length,calls.length-1);assert.equal(o.redirect,'error');if(o.method==='POST')assert.equal(o.body,'');return transport()(url);},{onCheckpoint:async(label,value)=>{await new Promise(r=>setTimeout(r,2));checkpoints.push([label,value]);}});
  assert.deepEqual(checkpoints.map(x=>x[0]),['client-before','selected-response','client-after']);
  assert.equal(evidence.selection.rows.length,1);assert.ok(!JSON.stringify(evidence).includes('PRIVATE'));
  assert.deepEqual(await replay(evidence),evidence);assert.equal(evidence.execution_mode,'injected-test-transport');
  for(const mutate of [e=>e.requests[1].method='GET',e=>e.requests[2].decoded_sha256='a'.repeat(64),e=>e.claims.current_operations_verified=true,e=>e.selection.counts.selected_rows=2]){const bad=structuredClone(evidence);mutate(bad);await assert.rejects(replay(bad));}
});
test('Iowa rejects drift, access denial, invalid body and oversize without retry',async()=>{
  for(const t of [async()=>new Response('denied',{status:403}),async()=>new Response('changed'),transport({}),transport([{businessType:'building',latitude:'PRIVATE'}]),async url=>new Response(url===U.client?client:'x'.repeat(L.response_bytes+1))])await assert.rejects(acquire(t),/requires review/);
  let count=0;await assert.rejects(acquire(async url=>{count++;return transport()(url);},{onCheckpoint:async()=>{throw Error('PRIVATE');}}),/requires review/);assert.equal(count,1);
});
test('Iowa cancellation drains an ongoing checkpoint and prevents subsequent request',async()=>{
  const controller=new AbortController();let release,entered,calls=0,settled=false;
  const ready=new Promise(r=>{entered=r;});const hold=new Promise(r=>{release=r;});
  const pending=acquire(async url=>{calls++;return transport()(url);},{signal:controller.signal,onCheckpoint:async()=>{entered();await hold;}}).catch(()=>{settled=true;});
  await ready;controller.abort();await new Promise(r=>setTimeout(r,5));assert.equal(settled,false);release();await pending;assert.equal(calls,1);
});
test('Iowa cancels stalled body and rejects native option overrides',async()=>{
  const controller=new AbortController();let entered,cancelled=false;const ready=new Promise(r=>{entered=r;});
  const pending=acquire(async()=>new Response(new ReadableStream({pull(){entered();},cancel(){cancelled=true;}},{highWaterMark:0})),{signal:controller.signal});
  await ready;controller.abort();await assert.rejects(pending);assert.equal(cancelled,true);
  for(const o of [{transport:()=>{}},{url:'https://example.com'},{signal:1}])await assert.rejects(acquireIaChildcare(o));
});
test('Iowa request deadline rejects a stalled transport without retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let entered,calls=0;const ready=new Promise(r=>{entered=r;});
  const pending=acquire(async()=>{calls++;entered();return new Promise(()=>{});});
  await ready;t.mock.timers.tick(L.request_timeout_ms+1);await assert.rejects(pending,/requires review/);assert.equal(calls,1);
});
