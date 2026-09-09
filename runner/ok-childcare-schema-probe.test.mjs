import test from 'node:test';
import assert from 'node:assert/strict';
import { OK_CHILDCARE_SCHEMA_PROBE_CONTRACT as C, runOkChildcareSchemaProbe, runOkChildcareSchemaProbeWithTestTransport as probe, okChildcareSchemaReceiptSnapshot as snapshot } from './ok-childcare-schema-probe.mjs';
const client='Oklahoma schema probe synthetic client fixture v1';
const html=rows=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({page:'/providers',query:{'zip-code':'73102','facility-type':'childcare-center'},props:{pageProps:{childcareProviders:rows,mapCenter:null,route:[]}}})+'</script>';
const transport=(body,calls=[])=>async(url,options)=>{calls.push({url,...options});return new Response(url===C.client_url?client:body,{headers:{'content-type':'text/html'}});};
test('fixed itinerary returns only aggregate metadata and process-issued snapshots',async()=>{
  const calls=[], result=await probe(transport(html([{facilityType:'childcare-center',name:'PRIVATE_NAME',address:'PRIVATE_ADDRESS',coordinates:{latitude:32.12345,longitude:-97.54321},vendorId:'PRIVATE_ID',PRIVATE_KEY:'PRIVATE_VALUE',hours:['PRIVATE_HOURS']}]),calls));
  assert.equal(result.status,'schema-observed-not-collection-ready');assert.equal(result.execution_mode,'injected-test-transport');assert.equal(result.schema.counts.center_rows,1);assert.equal(result.schema.pagination,'unknown');assert.equal(result.schema.counts.unknown_field_occurrences,1);
  assert.deepEqual(calls.map(x=>x.url),[C.client_url,C.results_url,C.client_url]);for(const call of calls){assert.equal(call.method,'GET');assert.equal(call.credentials,'omit');assert.equal(call.redirect,'error');}
  for(const canary of ['PRIVATE','32.12345','97.54321'])assert.ok(!JSON.stringify(result).includes(canary));assert.ok(Object.values(result.claims).every(x=>x===false));
  assert.deepEqual(snapshot(result),result);assert.throws(()=>snapshot(structuredClone(result)));result.status='success';assert.throws(()=>snapshot(result));
});
test('rejects shape mismatch, count cap, malformed JSON and duplicate data scripts',async()=>{
  for(const body of ['PRIVATE',html([null]),html(Array(101).fill({})),html([])+html([]),'<script id="__NEXT_DATA__" type="application/json">{</script>',html([Object.fromEntries(Array.from({length:129},(_,i)=>['key'+i,1]))])]){const result=await probe(transport(body));assert.equal(result.status,'rejected');assert.equal(result.schema,null);}
});
test('unknown types and private embedded code never execute or become retained values',async()=>{
  const result=await probe(transport('<script>throw Error("PRIVATE_CODE")</script>'+html([{facilityType:'PRIVATE_TYPE',coordinates:'PRIVATE_POINT'},{facilityType:'childcare-home'}])));
  assert.equal(result.schema.center_filter_verified,false);assert.equal(result.schema.counts.unknown_type_rows,1);assert.equal(result.schema.counts.home_rows,1);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('access refusal, byte cap and client drift stop without retries',async()=>{
  for(const status of [302,403])assert.equal((await probe(async()=>new Response('PRIVATE',{status}))).status,'rejected');
  assert.equal((await probe(transport('x'.repeat(C.html_max_bytes+1)))).status,'rejected');
  let count=0;const result=await probe(async()=>new Response(++count===1?client:count===2?html([]):'DRIFT',{headers:{'content-type':'text/html'}}));assert.equal(result.status,'rejected');assert.equal(result.schema,null);assert.equal(count,3);
});
test('cancellation and request timeout reject stalled transports; preabort calls nothing',async t=>{
  const controller=new AbortController();let entered;const ready=new Promise(resolve=>{entered=resolve;});
  const pending=probe(async()=>{entered();return new Promise(()=>{});},{signal:controller.signal});await ready;controller.abort('PRIVATE');assert.equal((await pending).status,'rejected');
  await probe(()=>assert.fail('preabort transport'),{signal:controller.signal});
  t.mock.timers.enable({apis:['setTimeout']});let started;const waiting=new Promise(resolve=>{started=resolve;});const timed=probe(async()=>{started();return new Promise(()=>{});});await waiting;t.mock.timers.tick(C.request_timeout_ms+1);assert.equal((await timed).status,'rejected');
});
test('native API rejects caller transport, URL, credentials and accessors before fetch',async()=>{
  for(const value of [null,{url:'PRIVATE'},{transport:()=>{}},{signal:1},{get signal(){assert.fail('getter');}}])await assert.rejects(runOkChildcareSchemaProbe(value));
});
test('rejects mismatched query, duplicate search values and wrong content type',async()=>{
  for(const body of [html([]).replace('73102','73103'),html([]).replace('"73102"','["73102","73103"]'),html([]).replace('"query":','"query":{"extra":true},"unused":')]) assert.equal((await probe(transport(body))).status,'rejected');
  const result=await probe(async url=>new Response(url===C.client_url?client:html([]),{headers:{'content-type':'application/json'}}));assert.equal(result.status,'rejected');
});
