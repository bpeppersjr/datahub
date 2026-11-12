import assert from "node:assert/strict";
import test from "node:test";
import { nationalBusinessLifecycleJurisdictionEvidenceHttp as evidence, nationalBusinessLifecycleJurisdictionSummaryHttp as summary } from "./national-business-lifecycle-jurisdiction-evidence-http.mjs";

const call = async (handler, { method = "GET", query = "", headers = {}, reader = async () => ({ ok: true }) } = {}) => {
  let result; const listeners = new Map();
  const request = { method, headers, once: (name, fn) => listeners.set(name, fn), removeListener: name => listeners.delete(name), resume() {} };
  const response = { writableEnded: false, destroyed: false, setHeader() {}, once: (name, fn) => listeners.set(`response:${name}`, fn), removeListener: name => listeners.delete(`response:${name}`) };
  await handler(request, response, new URL(`http://local/x${query}`), reader, (_response, status, value) => { result = { status, value }; }); return result;
};

test("summary HTTP contract is strict and redacts failures", async () => {
  assert.deepEqual(await call(summary), { status: 200, value: { ok: true } });
  assert.equal((await call(summary, { method: "POST" })).status, 400);
  assert.equal((await call(summary, { query: "?x=1" })).status, 400);
  assert.equal((await call(summary, { headers: { "content-length": "1" } })).status, 400);
  assert.deepEqual(await call(summary, { reader: async () => { throw Error("C:\\secret\\manifest.json"); } }), { status: 503, value: { error: "Lifecycle jurisdiction summary is unavailable or incompatible." } });
});

test("evidence HTTP contract accepts exactly one state or scope and redacts failures", async () => {
  let seen;
  assert.deepEqual(await call(evidence, { query: "?state=MN", reader: async value => (seen = value, { ok: true }) }), { status: 200, value: { ok: true } }); assert.equal(seen.state, "MN");
  assert.deepEqual(await call(evidence, { query: "?scope=multi-state-material", reader: async value => (seen = value, { ok: true }) }), { status: 200, value: { ok: true } }); assert.equal(seen.scopeId, "multi-state-material");
  for (const query of ["", "?state=mn", "?state=MN&scope=state:27", "?scope=unknown", "?state=MN&x=1"]) assert.equal((await call(evidence, { query })).status, 400);
  assert.deepEqual(await call(evidence, { query: "?scope=state:27", reader: async () => { throw Error("C:\\private"); } }), { status: 503, value: { error: "Lifecycle jurisdiction evidence is unavailable or incompatible." } });
});
