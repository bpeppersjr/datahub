import test from 'node:test';
import assert from 'node:assert/strict';
import { IA_CHILDCARE_SCHEMA_PROBE_CONTRACT as C, runIaChildcareSchemaProbe, runIaChildcareSchemaProbeWithTestTransport as probe } from './ia-childcare-schema-probe.mjs';
const client = 'Iowa schema probe synthetic client fixture v1';
const transport = (body, calls = []) => async (url, options) => {
  calls.push({ url, ...options });
  return new Response(url === C.client_url ? client : body);
};
test('Iowa aggregate exposes only safe metadata and fixed serial itinerary', async () => {
  const calls = [], result = await probe(transport(JSON.stringify([{businessType:'building',businessName:'PRIVATE_NAME',address:'PRIVATE_ADDRESS',zipCode:'50301',latitude:41.2,longitude:-93.2,referral:false,PRIVATE_KEY:'PRIVATE_VALUE'}, {businessType:'SECRET_TYPE',zipCode:50301,latitude:null}]), calls));
  assert.equal(result.status, 'schema-observed-not-collection-ready'); assert.equal(result.execution_mode,'injected-test-transport');
  assert.deepEqual(calls.map(x => [x.url,x.method]), [[C.client_url,'GET'],[C.pins_url,'POST'],[C.client_url,'GET']]);
  assert.equal(calls[1].body,''); assert.equal(calls[1].redirect,'error'); assert.equal(calls[1].credentials,'omit');
  assert.equal(result.schema.counts.center_display_class,1); assert.equal(result.schema.counts.other_display_class,1);
  assert.equal(result.schema.counts.zip5_string,1); assert.equal(result.schema.counts.zip_other,1);
  for (const value of ['PRIVATE_NAME','PRIVATE_ADDRESS','PRIVATE_KEY','PRIVATE_VALUE','SECRET_TYPE','41.2','93.2','50301']) assert.ok(!JSON.stringify(result).includes(value));
  assert.ok(Object.values(result.claims).every(v => v === false));
});
test('Iowa rejects malformed, non-array, overcount and malformed row bodies', async () => {
  for (const body of ['{','{}','[null]',JSON.stringify(Array(10001).fill({})),JSON.stringify([{...Object.fromEntries(Array.from({length:129},(_,i)=>['x'+i,null]))}])]) {
    const result = await probe(transport(body)); assert.equal(result.status,'rejected'); assert.equal(result.schema,null); assert.equal(result.requests.length,2);
  }
});
test('Iowa stops for access denial, redirect, client changes, and decoded byte ceiling', async () => {
  for (const status of [403,302]) { const result = await probe(async () => new Response('SECRET',{status})); assert.equal(result.requests.length,1); assert.equal(result.status,'rejected'); }
  assert.equal((await probe(async () => new Response('changed client'))).status,'rejected');
  const result = await probe(async url => new Response(url===C.client_url ? client : 'x'.repeat(C.pins_max_bytes+1)));
  assert.equal(result.status,'rejected'); assert.equal(result.schema,null);
  let n = 0; const changed = await probe(async () => new Response(++n===1?client:n===2?'[]':'changed'));
  assert.equal(changed.status,'rejected'); assert.equal(changed.schema,null); assert.equal(changed.requests.length,3);
});
test('Iowa cancellation bounds pending transport and pre-abort makes no call', async () => {
  const controller = new AbortController(); let calls=0;
  const pending = probe(async () => { calls++; return new Promise(()=>{}); }, {signal:controller.signal});
  setTimeout(()=>controller.abort('SECRET'),10);
  const result = await pending; assert.equal(result.status,'rejected'); assert.equal(calls,1); assert.ok(!JSON.stringify(result).includes('SECRET'));
  calls=0; await probe(async()=>{calls++;}, {signal:controller.signal}); assert.equal(calls,0);
});
test('Iowa exact options reject URLs, credentials, accessors, and injection in native API', async () => {
  for (const value of [null, {url:'https://example.com'}, {transport:()=>{}}, {signal:1}, Object.create({}), {get signal(){throw Error('SECRET');}}]) await assert.rejects(runIaChildcareSchemaProbe(value), /Invalid Iowa/);
});
test('Iowa request deadline rejects a stalled transport without retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let entered; const ready = new Promise(resolve => { entered = resolve; });
  const pending = probe(async () => { entered(); return new Promise(() => {}); });
  await Promise.race([ready,pending.then(()=>{throw new Error('Transport never entered.');})]); t.mock.timers.tick(C.request_timeout_ms + 1);
  const result = await pending; assert.equal(result.status, 'rejected'); assert.equal(result.requests.length, 1);
});
test('Iowa abort cancels an active response reader', async () => {
  const controller = new AbortController(); let cancelled = false, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const pending = probe(async () => new Response(new ReadableStream({ pull() { entered(); }, cancel() { cancelled = true; } }, {highWaterMark:0})), {signal:controller.signal});
  await Promise.race([ready,pending.then(()=>{throw new Error('Reader never entered.');})]); controller.abort(); const result = await pending;
  assert.equal(result.status, 'rejected'); assert.equal(cancelled, true);
});
