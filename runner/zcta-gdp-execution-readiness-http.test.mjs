import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { zctaGdpExecutionReadinessHttp } from "./zcta-gdp-execution-readiness-http.mjs";
async function call({
  method = "GET",
  query = "?zcta=00601",
  headers = {},
} = {}) {
  let reply,
    reads = 0;
  const request = Object.assign(new EventEmitter(), {
      method,
      headers,
      resume() {},
    }),
    response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
    });
  await zctaGdpExecutionReadinessHttp(
    request,
    response,
    new URL(`http://local/${query}`),
    async () => {
      reads++;
      return { ok: true };
    },
    (_r, status, body) => (reply = { status, body }),
  );
  return { ...reply, reads };
}
test("HTTP accepts only empty GET with one exact ZCTA", async () => {
  assert.deepEqual(await call(), { status: 200, body: { ok: true }, reads: 1 });
  for (const x of [
    { method: "POST" },
    { query: "" },
    { query: "?zcta=1&zcta=2" },
    { query: "?zcta=" },
    { query: "?zcta=601" },
    { query: "?zip=00601" },
    { headers: { "content-length": "1" } },
    { headers: { "transfer-encoding": "chunked" } },
  ]) {
    const r = await call(x);
    assert.equal(r.status, 400);
    assert.equal(r.reads, 0);
  }
});
test("HTTP propagates disconnect cancellation and suppresses a reply", async () => {
  let reply;
  const request = Object.assign(new EventEmitter(), {method:"GET",headers:{},resume(){}}),
    response = Object.assign(new EventEmitter(), {destroyed:false,writableEnded:false});
  const pending=zctaGdpExecutionReadinessHttp(request,response,new URL("http://local/?zcta=00601"),({signal})=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true})),(_r,status,body)=>(reply={status,body}));
  response.destroyed=true;response.emit("close");
  await pending;
  assert.equal(reply,undefined);
});
test("route is after shared authorization", async () => {
  const code = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  assert.ok(
    code.indexOf(
      "url.pathname === '/api/business-map/zcta-gdp-execution-readiness'",
    ) > code.indexOf("controlPlane.authorize(request)"),
  );
});
