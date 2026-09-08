import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { acquireCtChildcarePreflight, validateCtChildcarePreflight, writeCtChildcarePreflight, CT_CHILDCARE_FIELDS, CT_CHILDCARE_FIELD_TYPES, CT_CHILDCARE_URLS } from "./ct-childcare-preflight.mjs";
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fixture(mutate=()=>{}){
  const calls=[];
  return {calls,fetchImpl:async(url,options)=>{
    const kind=url===CT_CHILDCARE_URLS.metadata?"metadata":"aggregate";assert.equal(url,CT_CHILDCARE_URLS[kind]);calls.push({kind,url,options});
    const value=kind==="aggregate"?[{source_count:"1390",distinct_source_keys:"1390",distinct_credentials:"1364",address_count:"1389",zip_count:"1390"}]:{
      id:"h8mr-dn95",name:"Child Care & Youth Camp Licensing Program Data",description:"Child Care & Youth Camp Licensing Program Data",attribution:"DAS/BEST - eLicensing",license:{name:"Public Domain"},rowsUpdatedAt:1788768933,
      metadata:{custom_fields:{Agency:{Agency:"Office of Early Childhood"},Details:{"Update Frequency":"Daily","Geographic Unit":"Street address"}}},
      columns:[...CT_CHILDCARE_FIELDS.map(fieldName=>({fieldName,dataTypeName:CT_CHILDCARE_FIELD_TYPES[fieldName],cachedContents:{top:[{item:"PRIVATE_CONTACT_SAMPLE"}]}})),{fieldName:"director",dataTypeName:"text",cachedContents:{top:[{item:"PRIVATE_PERSON"}]}}],
      cachedContents:{sample:"PRIVATE_CONTACT_SAMPLE"},
    };
    const replacement=mutate(value,kind,calls.length);return replacement instanceof Response?replacement:Response.json(value);
  },now:()=>new Date("2026-09-08T12:00:00.000Z")};
}
const run=f=>acquireCtChildcarePreflight({fetchImpl:f.fetchImpl,now:f.now});
let good;
const goodReceipt=()=>good??=run(fixture());

test("CT preflight rejects unknown overrides and pre-abort before requests",async()=>{
  let calls=0;
  for(const extra of [{url:"https://example.invalid"},{fields:["phone"]},{outputRoot:"other"},{now:42}])await assert.rejects(acquireCtChildcarePreflight({fetchImpl:async()=>{calls++;throw Error("unexpected");},...extra}));
  await assert.rejects(acquireCtChildcarePreflight({signal:AbortSignal.abort(),fetchImpl:()=>assert.fail("no pre-aborted request")}),{name:"AbortError"});
  assert.equal(calls,0);
});

test("CT preflight rejects HTTP errors, redirects, invalid UTF8 and oversized bodies without retries",async()=>{
  await Promise.all([
    ()=>new Response("PRIVATE_ERROR_BODY",{status:429,headers:{"Retry-After":"300"}}),
    ()=>new Response("PRIVATE_ERROR_BODY",{status:503}),
    ()=>new Response(null,{status:302,headers:{location:"https://example.invalid"}}),
    ()=>new Response(Uint8Array.of(255),{headers:{"content-type":"application/json"}}),
    ()=>new Response("{}",{headers:{"content-type":"application/json","content-length":"999999999"}}),
    ()=>new Response("{}",{headers:{"content-type":"application/json","content-encoding":" IDENTITY ","content-length":"3"}}),
    ()=>new Response(new Uint8Array(3_000_001),{headers:{"content-type":"application/json"}}),
  ].map(async make=>{let calls=0;await assert.rejects(acquireCtChildcarePreflight({fetchImpl:async()=>{calls++;return make();}}),error=>!error.message.includes("PRIVATE_ERROR_BODY"));assert.equal(calls,1);}));
});

test("CT caller cancellation interrupts noncooperative headers and body reads, including late-body cleanup",async()=>{
  for(const mode of ["headers","body"]){
    const controller=new AbortController();let late,cancelled=0;
    const pending=acquireCtChildcarePreflight({signal:controller.signal,fetchImpl:()=>{
      if(mode==="headers")return new Promise(resolve=>{late=resolve;controller.abort();});
      return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("{"));setImmediate(()=>controller.abort());},cancel(){cancelled++;}}),{headers:{"content-type":"application/json"}});
    }});
    await assert.rejects(pending,{name:"AbortError"});
    if(late){late(new Response(new ReadableStream({cancel(){cancelled++;}})));await new Promise(resolve=>setImmediate(resolve));}
    assert.equal(cancelled,1);
  }
});

test("CT sanitized metadata and counts preserve repeated credentials and missing street gaps",async()=>{
  const receipt=await goodReceipt();assert.equal(validateCtChildcarePreflight(receipt),receipt);
  assert.equal(receipt.source.record_count,1390);assert.equal(receipt.source.distinct_credentials,1364);assert.equal(receipt.source.distinct_source_keys,1390);assert.equal(receipt.source.address_count,1389);
  assert.equal(receipt.execution_mode,"injected-test-transport");assert.equal(receipt.readiness.acquisition_ready,false);assert.equal(receipt.claims.facility_rows_retained,0);assert.equal(receipt.claims.full_http_bodies_replayable,false);
  assert.equal(JSON.stringify(receipt).includes("PRIVATE_"),false);assert.equal(receipt.observations[0].payload.columns.length,CT_CHILDCARE_FIELDS.length);
});

test("CT fails closed on identity, license, schema, agency, paired drift and nonunique source keys",async()=>{
  await Promise.all([
    (v,k)=>{if(k==="metadata")v.name="other";},(v,k)=>{if(k==="metadata")v.license.name="Restricted";},
    (v,k)=>{if(k==="metadata")v.license.terms="unreviewed";},(v,k)=>{if(k==="metadata")v.description="changed scope";},
    (v,k)=>{if(k==="metadata")v.metadata.custom_fields.Agency.Agency="Other";},(v,k)=>{if(k==="metadata")v.columns[0].dataTypeName="point";},
    (v,k)=>{if(k==="metadata")v.columns.push({...v.columns[0]});},(v,k,n)=>{if(k==="metadata"&&n===4)v.rowsUpdatedAt++;},
    (v,k,n)=>{if(k==="aggregate"&&n===3)v[0].address_count="1388";},(v,k)=>{if(k==="aggregate")v[0].distinct_source_keys="1389";},
    ...["01390","1.5","20001",1390].map(bad=>(v,k)=>{if(k==="aggregate")v[0].source_count=bad;}),
    (v,k)=>{if(k==="aggregate")v.push({...v[0]});},
  ].map(async mutate=>assert.rejects(run(fixture(mutate)))));
});

test("CT offline verifier rejects rehashed drift and false readiness; writer never overwrites prior receipt",async()=>{
  const receipt=await goodReceipt();
  for(const mutate of [r=>{r.readiness.acquisition_ready=true;},r=>{r.claims.public_export_authorized=true;},r=>{r.observations[2].payload[0].address_count="1388";r.observations[2].payload_sha256=hash(r.observations[2].payload);},r=>{r.observations[3].payload.columns[0].dataTypeName="point";r.observations[3].payload_sha256=hash(r.observations[3].payload);}]){const changed=structuredClone(receipt);mutate(changed);assert.throws(()=>validateCtChildcarePreflight(changed));}
  const created=[];
  try{
    const first=await writeCtChildcarePreflight(receipt);created.push(first.path);const original=await readFile(first.path);
    const second=await writeCtChildcarePreflight(receipt);created.push(second.path);assert.notEqual(first.path,second.path);assert.deepEqual(await readFile(first.path),original);
    assert.deepEqual(JSON.parse(original),receipt);assert.equal(original.length,first.bytes);
    await assert.rejects(writeCtChildcarePreflight(receipt,{signal:AbortSignal.abort()}),{name:"AbortError"});
    await assert.rejects(writeCtChildcarePreflight(receipt,{outputRoot:"foreign"}));
    assert.deepEqual(await readFile(first.path),original);
  }finally{for(const file of created)await rm(file);}
});
