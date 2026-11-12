import assert from "node:assert/strict";
import test from "node:test";
import { operationalIndustryCensusStatusHttp as handle } from "./operational-industry-census-status-http.mjs";

const invoke = async (method="GET", query="", headers={}) => { let result; await handle({ method, headers }, {}, new URL(`http://local/status${query}`), async()=>({ok:true}), (_response,status,value)=>{result={status,value}}); return result; };
test("Census operational status endpoint is bounded and read-only", async()=>{
  assert.equal((await invoke()).status, 200);
  assert.equal((await invoke("POST")).status, 405);
  assert.equal((await invoke("GET", "?state=IL")).status, 400);
  assert.equal((await invoke("GET", "", {"content-length":"1"})).status, 400);
});
