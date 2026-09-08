import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,unlink} from 'node:fs/promises';
import test from 'node:test';
import contract from '../config/co-childcare-source-contract.json' with {type:'json'};
import {acquireCoChildcarePreflight,validateCoChildcarePreflight,writeCoChildcarePreflight,CO_CHILDCARE_URLS,CO_CHILDCARE_CATEGORIES} from './co-childcare-preflight.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(mutate=()=>{}){
 const calls=[];
 const metadata={...structuredClone(contract),rowsUpdatedAt:1700000000,viewLastModified:1700000000,publicationDate:1700000000,metadata:{custom_fields:{...structuredClone(contract.custom),'Point of Contact':{name:'PRIVATE SAMPLE'}}},columns:Object.entries(contract.fieldTypes).map(([fieldName,dataTypeName])=>({fieldName,dataTypeName,description:contract.descriptions[fieldName]??'',cachedContents:{top:[{item:'PRIVATE SAMPLE'}]}}))};
 const groups=CO_CHILDCARE_CATEGORIES.map(provider_service_type=>({provider_service_type,source_rows:provider_service_type==='Child Care Center'?'3':'1'}));
 const aggregate=[{source_rows:'3',distinct_licenses:'3',address_count:'2',zip_count:'1',state_count:'3'}];
 return {calls,fetchImpl:async url=>{const kind=Object.keys(CO_CHILDCARE_URLS).find(k=>CO_CHILDCARE_URLS[k]===url);calls.push(kind);const value=structuredClone(kind==='metadata'?metadata:kind==='groups'?groups:aggregate);const override=mutate(value,kind,calls);return override??new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}};
}
test('CO metadata preflight rejects invalid options, pre-abort and noncooperative transport cancellation',async()=>{
 let calls=0;await assert.rejects(acquireCoChildcarePreflight({unknown:true,fetchImpl:()=>{calls++;}}));await assert.rejects(acquireCoChildcarePreflight({signal:AbortSignal.abort(),fetchImpl:()=>{calls++;}}),{name:'AbortError'});assert.equal(calls,0);
 for(const body of [false,true]){const c=new AbortController(),pending=acquireCoChildcarePreflight({signal:c.signal,fetchImpl:()=>body?new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}}):new Promise(()=>{})});setTimeout(()=>c.abort(),25);await assert.rejects(pending,{name:'AbortError'});}
});
test('CO projected metadata, counts and immutable receipts replay without retaining cached values',async()=>{
 const f=fixture(),receipt=await acquireCoChildcarePreflight({fetchImpl:f.fetchImpl});assert.equal(validateCoChildcarePreflight(receipt),receipt);assert.deepEqual(f.calls,['metadata','groups','aggregate','aggregate','groups','metadata']);
 assert.equal(JSON.stringify(receipt).includes('PRIVATE SAMPLE'),false);assert.equal(receipt.source.record_count,3);assert.equal(receipt.source.address_count,2);assert.equal(receipt.source.zip_count,1);assert.equal(receipt.readiness.acquisition_ready,false);
 const a=await writeCoChildcarePreflight(receipt),b=await writeCoChildcarePreflight(receipt);
 try{assert.notEqual(a.path,b.path);assert.deepEqual(JSON.parse(await readFile(a.path)),receipt);await assert.rejects(writeCoChildcarePreflight(receipt,{signal:AbortSignal.abort()}),{name:'AbortError'});}
 finally{await unlink(a.path);await unlink(b.path);}
 for(const mutation of [r=>{r.claims.current_operations_verified=true;},r=>{r.observations[5].payload.name='Changed';},r=>{r.observations[4].payload[0].source_rows='2';},r=>{r.observations[3].payload[0].address_count='3';},r=>{r.observations[1].payload.push(r.observations[1].payload[0]);},r=>{r.source.zip_count=3;}]){
  const changed=structuredClone(receipt);mutation(changed);for(const o of changed.observations)o.payload_sha256=hash(o.payload);assert.throws(()=>validateCoChildcarePreflight(changed));
 }
});
test('CO fails closed on schema, enum, cardinality, provider errors and body protocol drift',async()=>{
 const cases=[
  (v,k)=>{if(k==='metadata')v.columns[0].dataTypeName='text';},
  (v,k)=>{if(k==='metadata')v.columns.push(v.columns[0]);},
  (v,k)=>{if(k==='metadata')v.columns.push({fieldName:null});},
  (v,k)=>{if(k==='metadata')v.metadata.custom_fields.Publisher['Publisher Name']='Changed';},
  (v,k)=>{if(k==='metadata')v.license={name:'unreviewed'};},
  (v,k)=>{if(k==='metadata')v.columns.find(c=>c.fieldName==='expiration_date').description='License expiration';},
  (v,k)=>{if(k==='groups')v[0].provider_service_type='Unknown';},
  (v,k)=>{if(k==='groups')while(v.length<31)v.push({...v[0]});},
  (v,k)=>{if(k==='aggregate')v[0].distinct_licenses='2';},
  (v,k)=>{if(k==='aggregate')v[0].zip_count='4';},
  (v,k)=>{if(k==='aggregate')v.push({...v[0]});},
  ()=>new Response('{"error":"PRIVATE PROVIDER ERROR"}',{headers:{'content-type':'application/json'}}),
  ()=>new Response('private',{status:429}),
  ()=>new Response('{}',{headers:{'content-type':'application/json','content-encoding':' IDENTITY ','content-length':'999'}}),
  ()=>new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),
 ];
 await Promise.all(cases.map(async mutate=>{const f=fixture(mutate);await assert.rejects(acquireCoChildcarePreflight({fetchImpl:f.fetchImpl}),error=>!error.message.includes('PRIVATE')&&['CO_CHILDCARE_PREFLIGHT_FAILED','CO_CHILDCARE_DEFERRED'].includes(error.code));}));
});
