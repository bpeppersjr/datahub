import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { zipInspectorHttp } from "./zip-inspector-http.mjs";
import {qualificationFixture} from './zip-evidence-qualification-test-fixtures.mjs';

test('inspector HTTP preserves nested qualification policy and null/zero without adding units',async()=>{
 const qualification=qualificationFixture({qualification:'measured-stale-review-due'}),envelope={zip5:'00501',counts:{physical_sites:0,employer_establishments:null},qualification};let result;
 await zipInspectorHttp({method:'GET'},{},new URL('http://local/?zip=00501'),async()=>envelope,(_r,status,body)=>{result={status,body:JSON.parse(JSON.stringify(body))};});
 assert.equal(result.status,200);assert.deepEqual(result.body,envelope);assert.equal(result.body.qualification.export_policy,'internal');assert.equal(result.body.qualification.rows[0].eligible_evidence_counts_by_unit.retailer_count,0);
});

async function call(method, query) {
  let result;
  let selected;
  const request = { method };
  const response = {};
  const json = (_response, status, body) => { result = { status, body }; };
  const view = async ({ zip, categoryId }) => {
    selected = { zip, categoryId };
    if (!new Set(["all", "health-care", "retail-consumer"]).has(categoryId)) throw Object.assign(new Error("Unsupported business category."), { statusCode: 400 });
    return { zip5: zip, category_id: categoryId };
  };
  await zipInspectorHttp(request, response, new URL(`http://local/api/business-map/zip-inspector${query}`), view, json);
  return { ...result, selected };
}

test("strict ZIP inspector HTTP accepts one ZIP and at most one category on GET", async () => {
  assert.deepEqual(await call("GET", "?zip=12345"), { status: 200, body: { zip5: "12345", category_id: "all" }, selected: { zip: "12345", categoryId: "all" } });
  assert.deepEqual((await call("GET", "?zip=12345&category=health-care")).selected, { zip: "12345", categoryId: "health-care" });
  assert.equal((await call("GET", "")).status, 400);
  assert.equal((await call("GET", "?zip=12345&zip=54321")).status, 400);
  assert.equal((await call("GET", "?zip=12345&category=health-care&category=retail-consumer")).status, 400);
  assert.equal((await call("GET", "?zip=12345&category=Bad_Category")).status, 400);
  assert.equal((await call("GET", "?zip=12345&category=not-governed")).status, 400);
  assert.equal((await call("GET", "?zip=12345&state=NY")).status, 400);
  assert.equal((await call("POST", "?zip=12345")).status, 400);
});

test("the runner authorizes protected API routes before dispatching exact ZIP detail", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  const authorize = server.indexOf("controlPlane.authorize(request)");
  const inspector = server.indexOf("url.pathname === '/api/business-map/zip-inspector'");
  assert.ok(authorize >= 0 && inspector > authorize);
});

test("client disconnect aborts the exact ZIP reader without writing a response", async () => {
  const request = Object.assign(new EventEmitter(), { method: "GET" });
  const response = Object.assign(new EventEmitter(), { writableEnded: false });
  let observed;
  let writes = 0;
  const pending = zipInspectorHttp(request, response, new URL("http://local/api/business-map/zip-inspector?zip=00501"), async ({ signal }) => {
    observed = signal;
    await new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    return null;
  }, () => { writes += 1; });
  await new Promise((resolve) => setImmediate(resolve));
  request.emit("aborted");
  await pending;
  assert.equal(observed.aborted, true);
  assert.equal(writes, 0);
});

test('inspector rejects framed bodies before invoking a reader',async()=>{
 for(const headers of [{'content-length':'1'},{'transfer-encoding':'chunked'}]){let calls=0,status;await zipInspectorHttp({method:'GET',headers},{},new URL('http://local/?zip=00501'),async()=>{calls++;},(_r,s)=>{status=s;});assert.equal(status,400);assert.equal(calls,0);}
});

test('120-second deadline returns503 even if aborted reader resolves; listeners are cleaned',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const request=Object.assign(new EventEmitter(),{method:'GET'}),response=Object.assign(new EventEmitter(),{writableEnded:false});let selected,status;
 const pending=zipInspectorHttp(request,response,new URL('http://local/?zip=00501'),({signal})=>{selected=signal;return new Promise(resolve=>signal.addEventListener('abort',()=>resolve({available:false}),{once:true}));},(_r,s)=>{status=s;});
 await Promise.resolve();t.mock.timers.tick(120000);await pending;assert.equal(status,503);assert.equal(selected.aborted,true);assert.equal(request.listenerCount('aborted'),0);assert.equal(response.listenerCount('close'),0);
});

test('pre-aborted and destroyed requests write nothing and never start a reader',async()=>{
 for(const mode of ['aborted','destroyed']){let calls=0,writes=0;const request=Object.assign(new EventEmitter(),{method:'GET',aborted:mode==='aborted'}),response=Object.assign(new EventEmitter(),{destroyed:mode==='destroyed'});await zipInspectorHttp(request,response,new URL('http://local/?zip=00501'),async()=>{calls++;},()=>{writes++;});await new Promise(r=>setImmediate(r));assert.equal(calls,0);assert.equal(writes,0);}
});

test('server inspector wiring selects the bounded reader without changing standalone ZIP-quality route',async()=>{
 const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8');assert.match(server,/createZipInspectorView\(\{ indexedEvidence: readIndexedZipInspectorEvidence/);assert.match(server,/await zipQualityView\(\{ zip: url.searchParams.get\('zip'\)/);
});
