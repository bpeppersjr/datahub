import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { acquirePaChildcareWithTransport, replayPaChildcareAcquisition } from "./pa-childcare-acquisition.mjs";
import { createPaChildcareFixture, paFixtureOptions } from "./pa-childcare-test-fixtures.mjs";
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
let evidence;
test("PA acquisition invalid options and early cancellation make no requests",async()=>{
  let requests=0;
  const valid={fetchImpl:async()=>{requests++;throw new Error("unexpected request");},retainPrerequisite:async()=>{},retainObservation:async()=>{}};
  for(const options of [{...valid,url:"https://example.invalid"},{...valid,retainPrerequisite:undefined},{...valid,retainObservation:undefined},{...valid,fetchImpl:undefined}])await assert.rejects(acquirePaChildcareWithTransport(options));
  const controller=new AbortController();controller.abort();
  await assert.rejects(acquirePaChildcareWithTransport({...valid,signal:controller.signal}),{name:"AbortError"});assert.equal(requests,0);
});
test("PA synthetic acquisition conserves pages and rejects privacy, membership and protocol drift",paFixtureOptions,async()=>{
  const good=createPaChildcareFixture({count:501});
  const scenarios=[
    ["private field",(v,k)=>{if(k==="page")v[0].contact_phone="PRIVATE_NOT_TO_RETAIN";}],
    ["wrong provider",(v,k)=>{if(k==="page")v[0].provider_type="Family Child Care Home";}],
    ["malformed key",(v,k)=>{if(k==="baseline-ids")v[0].master_provider_index=" padded ";}],
    ["duplicate key",(v,k)=>{if(k==="baseline-ids")v[1]=v[0];}],
    ["extra ID field",(v,k)=>{if(k==="baseline-ids")v[0].phone="private";}],
    ["extra page",(v,k)=>{if(k==="page")v.push({...v[0]});}],
    ["wrong membership",(v,k)=>{if(k==="page")v[0].master_provider_index="not-in-inventory";}],
    ["final drift",(v,k)=>{if(k==="final-ids")v[0].master_provider_index="different";}],
    ["metadata drift",(v,k,c)=>{if(k==="metadata"&&c.metadataCalls>2)v.rowsUpdatedAt++;}],
    ["schema",(v,k)=>{if(k==="metadata")v.columns[0].dataTypeName="number";}],
    ["count drift",(v,k,c)=>{if(k==="aggregate"&&c.calls.filter(x=>x.kind==="aggregate").length>2)v[0].point_count="0";}],
    ["UTF8",(_v,k)=>{if(k==="baseline-ids")return new Response(Uint8Array.of(255),{headers:{"content-type":"application/json"}});}],
    ["size",(_v,k)=>{if(k==="baseline-ids")return new Response("[]",{headers:{"content-type":"application/json","content-length":"999999999"}});}],
    ["identity",(_v,k)=>{if(k==="baseline-ids")return new Response("[]",{headers:{"content-type":"application/json","content-encoding":" IDENTITY ","content-length":"3"}});}],
    ["chunked ceiling",(_v,k)=>{if(k==="baseline-ids")return new Response(new Uint8Array(3_000_001),{headers:{"content-type":"application/json"}});}],
    ...[429,503,500].map(status=>[`HTTP ${status}`,(_v,k)=>{if(k==="baseline-ids")return new Response("SECRET_ERROR_BODY",{status,headers:{"Retry-After":"600"}});}]),
  ];
  await Promise.all([
    acquirePaChildcareWithTransport(good.options).then(value=>{evidence=value;}),
    ...scenarios.map(async([name,mutate])=>{const f=createPaChildcareFixture({mutate});await assert.rejects(acquirePaChildcareWithTransport(f.options),error=>{assert.equal(error.message.includes("SECRET_ERROR_BODY"),false);return true;},name);if(name.startsWith("HTTP"))assert.equal(f.calls.filter(c=>c.kind==="baseline-ids").length,1);}),
    ...["prerequisite","observation"].map(async hook=>{const f=createPaChildcareFixture({[hook]:async()=>{throw new Error("persistence failure");}});await assert.rejects(acquirePaChildcareWithTransport(f.options));assert.equal(f.calls.filter(c=>c.kind==="page").length,0);if(hook==="prerequisite")assert.equal(f.calls.filter(c=>c.kind==="baseline-ids").length,0);}),
  ]);
  const replay=await replayPaChildcareAcquisition(evidence);
  assert.equal(replay.features.length,501);assert.equal(replay.source.record_count,501);assert.equal(replay.source.point_count,500);assert.equal(replay.source.license_count,500);
  assert.equal(replay.features[0].geocoded_column??null,null);assert.equal(Object.hasOwn(replay.features[0],"facility_address"),false);
  assert.equal(JSON.stringify(evidence).includes("PRIVATE_SAMPLE_NOT_RETAINED"),false);assert.equal(good.calls.filter(c=>c.kind==="page").length,2);
  assert.deepEqual(good.persisted,["prerequisite","baseline-ids","page","page","final-ids"]);
});
test("PA aborts noncooperative headers, bodies and pacing without a next query",paFixtureOptions,async()=>{
  await Promise.all(["headers","body","pacing","prerequisite"].map(async mode=>{
    const controller=new AbortController();let lateResolve,cancelled=0,releaseHook,hookEntered;
    const entered=new Promise(resolve=>{hookEntered=resolve;});
    const f=createPaChildcareFixture({
      ...(mode==="prerequisite"?{prerequisite:()=>{controller.abort();hookEntered();return new Promise(resolve=>{releaseHook=resolve;});}}:{}),
      mutate:(_value,kind)=>{
        if(kind!=="policy"||mode==="prerequisite")return;
        if(mode==="headers")return new Promise(resolve=>{lateResolve=resolve;controller.abort();});
        if(mode==="body")return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("partial"));setImmediate(()=>controller.abort());},cancel(){cancelled++;}}),{headers:{"content-type":"text/html"}});
        setImmediate(()=>controller.abort());
      },
    });
    let settled=false;
    const running=acquirePaChildcareWithTransport({...f.options,signal:controller.signal});
    running.then(()=>{settled=true;},()=>{settled=true;});
    if(mode==="prerequisite"){
      await entered;await new Promise(resolve=>setImmediate(resolve));
      assert.equal(settled,false,"Cancellation drains the persistence hook before returning");releaseHook();
    }
    await assert.rejects(running,{name:"AbortError"});
    if(lateResolve){lateResolve(new Response(new ReadableStream({cancel(){cancelled++;}})));await new Promise(resolve=>setImmediate(resolve));}
    if(mode==="body"||mode==="headers")assert.equal(cancelled,1);
    assert.equal(f.calls.filter(c=>c.kind==="baseline-ids").length,0);
    if(mode!=="prerequisite")assert.equal(f.calls.length,1);
  }));
});
test("PA replay rejects rehashed private fields, membership, claims and chronology",paFixtureOptions,async()=>{
  assert.ok(evidence);
  for(const mutate of [
    e=>{const o=e.observations.find(o=>o.kind==="page");o.payload[0].contact_phone="private";o.payload_sha256=hash(o.payload);},
    e=>{const o=e.observations.find(o=>o.kind==="page");o.payload[0].provider_type="Family Child Care Home";o.payload_sha256=hash(o.payload);},
    e=>{const o=e.observations.find(o=>o.kind==="final-ids");o.payload[0].master_provider_index="other";o.payload_sha256=hash(o.payload);},
    e=>{const o=e.observations.find(o=>o.kind==="page");for(const row of o.payload)row.facility_name="x".repeat(20000);o.payload_sha256=hash(o.payload);},
    e=>{e.claims.public_export_authorized=true;},e=>{e.observations[0].observed_at="2020-01-01T00:00:00.000Z";},e=>{e.observations.push(structuredClone(e.observations[1]));},
  ]){const changed=structuredClone(evidence);mutate(changed);await assert.rejects(async()=>replayPaChildcareAcquisition(changed));}
});
