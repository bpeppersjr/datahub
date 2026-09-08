import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {acquireCoChildcareWithTransport,acquireCoChildcareNative,replayCoChildcareAcquisition,coChildcareRequest} from './co-childcare-acquisition.mjs';
import {createCoChildcareFixture} from './co-childcare-test-fixtures.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('CO acquisition rejects unbounded options and aborts noncooperative headers/body',async()=>{
 await assert.rejects(acquireCoChildcareNative({fetchImpl:()=>{}}));await assert.rejects(acquireCoChildcareWithTransport({}));assert.throws(()=>coChildcareRequest('page',42));
 for(const body of [false,true]){const c=new AbortController(),f=createCoChildcareFixture(),p=acquireCoChildcareWithTransport({...f.options,signal:c.signal,fetchImpl:()=>body?new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}}):new Promise(()=>{})});setTimeout(()=>c.abort(),25);await assert.rejects(p,{name:'AbortError'});}
});
test('CO selected acquisition reconciles numeric ID membership, optional gaps and full offline replay',async()=>{
 const f=createCoChildcareFixture({count:501});delete f.selected[0].street_address;f.selected[0].zip=null;f.selected[0].state=null;f.selected[0].total_licensed_capacity='invalid capacity retained';
 const evidence=await acquireCoChildcareWithTransport(f.options),result=await replayCoChildcareAcquisition(evidence);
 assert.equal(result.features.length,501);assert.equal(result.source.address_count,500);assert.equal(result.source.zip_count,500);assert.equal(result.source.state_count,500);assert.equal(Object.hasOwn(result.features[0],'street_address'),false);assert.equal(result.features[0].zip,null);assert.equal(result.features[0].total_licensed_capacity,'invalid capacity retained');
 assert.equal(evidence.observations.length,9);assert.equal(evidence.transport.requests,21);assert.equal(f.persisted.length,10);assert.equal(result.features[0].provider_id,'9007199254740993');assert.equal(result.claims.current_operations_verified,false);
 for(const mutate of [e=>{e.observations[3].payload[0].owner='private';},e=>{e.observations[3].payload[0].provider_id='01';},e=>{e.observations[3].payload[0].provider_id=123;},e=>{e.observations[0].payload.reverse();},e=>{e.observations[3].payload[0].provider_service_type='Family Child Care Home';},e=>{e.observations[3].payload[0].zip='12345';},e=>{e.observations[4].payload.push(e.observations[3].payload[0]);},e=>{e.observations[3].url+='&x=1';},e=>{e.claims.current_operations_verified=true;}]){
  const changed=structuredClone(evidence);mutate(changed);for(const o of changed.observations)o.payload_sha256=hash(o.payload);await assert.rejects(replayCoChildcareAcquisition(changed));
 }
 const copy=structuredClone(evidence),pending=replayCoChildcareAcquisition(copy);copy.observations[3].payload[0].provider_name='later mutation';assert.deepEqual((await pending).features,result.features);
 const inherited=structuredClone(evidence),inheritedRow=inherited.observations[3].payload[0];delete inheritedRow.provider_service_type;Object.setPrototypeOf(inheritedRow,{provider_service_type:'Child Care Center'});inherited.observations[3].payload_sha256=hash(inherited.observations[3].payload);await assert.rejects(replayCoChildcareAcquisition(inherited));
 await assert.rejects(replayCoChildcareAcquisition(evidence,{signal:AbortSignal.abort()}),{name:'AbortError'});
});
test('CO durable hooks prevent later requests on failures and drain cancellation',async()=>{
 await Promise.all(['prerequisite','observation'].map(async phase=>{const f=createCoChildcareFixture();await assert.rejects(acquireCoChildcareWithTransport({...f.options,[phase==='prerequisite'?'retainPrerequisite':'retainObservation']:async()=>{throw Error('PRIVATE');}}),e=>e.code==='CO_CHILDCARE_ACQUISITION_FAILED'&&!e.message.includes('PRIVATE'));assert.equal(f.calls.length,phase==='prerequisite'?6:7);}));
 const f=createCoChildcareFixture(),controller=new AbortController();let release,entered;const gate=new Promise(resolve=>{entered=resolve;});let settled=false;
 const pending=acquireCoChildcareWithTransport({...f.options,signal:controller.signal,retainPrerequisite:()=>{entered();return new Promise(resolve=>{release=resolve;});}}).finally(()=>{settled=true;});await gate;controller.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);release();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.calls.length,6);
});
test('CO protocol errors are finite, private-safe and never retried',async()=>{
 for(const response of [new Response('PRIVATE',{status:429}),new Response('{"error":"PRIVATE"}',{headers:{'content-type':'application/json'}}),new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'999','content-encoding':' IDENTITY '}})]){
  const f=createCoChildcareFixture();let calls=0;await assert.rejects(acquireCoChildcareWithTransport({...f.options,fetchImpl:()=>{calls++;return response;}}),e=>!e.message.includes('PRIVATE'));assert.equal(calls,1);
 }
});
