import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stateExactZipEvidenceHttp } from "./state-exact-zip-evidence-http.mjs";

const source = await readFile(new URL("./server.mjs", import.meta.url), "utf8");

test("state exact-ZIP evidence route is read-only, authenticated, and query bounded", () => {
  assert.match(source, /controlPlane\.authorize\(request\);[\s\S]*\/api\/business-map\/state-exact-zip-industry-evidence/);
  assert.match(source, /stateExactZipEvidenceHttp\(request,response,url,readStateExactZipIndustryEvidenceDisposition,json\)/);
  assert.doesNotMatch(source, /request\.method==='POST'&&url\.pathname==='\/api\/business-map\/state-exact-zip-industry-evidence'/);
});

const invoke=async({method='GET',query='state=MD',reader=async()=>({ok:true})}={})=>{let result;await stateExactZipEvidenceHttp({method},{},new URL(`http://127.0.0.1/x?${query}`),reader,(_response,status,body)=>{result={status,body}});return result};
test('HTTP handler validates state and contains integrity failures',async()=>{
 assert.deepEqual(await invoke(),{status:200,body:{ok:true}});
 for(const query of ['', 'state=ZZ', 'state=MD&state=VA', 'state=MD&extra=1'])assert.equal((await invoke({query})).status,400);
 assert.equal((await invoke({method:'POST'})).status,405);
 const failed=await invoke({reader:async()=>{throw Error('State exact-ZIP disposition rejected: secret path and hash drift.')}});
 assert.deepEqual(failed,{status:503,body:{error:'State exact-ZIP industry evidence is unavailable.'}});
 assert.doesNotMatch(JSON.stringify(failed),/secret|hash drift|rejected/);
});
