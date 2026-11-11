import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { acsZctaDemographicNetworkReadinessHttp } from "./acs-zcta-demographic-network-readiness-http.mjs";

function fixture({ method = "GET", headers = {}, query = "", reader } = {}) {
  const request = new EventEmitter();
  Object.assign(request, { method, headers, aborted: false, resume() {} });
  const response = new EventEmitter();
  Object.assign(response, {
    destroyed: false,
    writableEnded: false,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
  });
  const calls = [];
  const json = (_response, status, body) => {
    calls.push({ status, body });
    response.writableEnded = true;
  };
  return {
    request,
    response,
    calls,
    run: () => acsZctaDemographicNetworkReadinessHttp(
      request,
      response,
      new URL(`http://localhost/readiness${query}`),
      reader ?? (async () => ({ ok: true })),
      json,
    ),
  };
}

test("serves only a no-store empty GET", async () => {
  const f = fixture();
  await f.run();
  assert.deepEqual(f.calls, [{ status: 200, body: { ok: true } }]);
  assert.equal(f.response.headers["Cache-Control"], "no-store");
});

test("rejects methods, queries, and declared bodies without reading", async () => {
  for (const options of [
    { method: "POST" },
    { query: "?run=true" },
    { headers: { "content-length": "1" } },
    { headers: { "transfer-encoding": "chunked" } },
  ]) {
    let reads = 0;
    const f = fixture({ ...options, reader: async () => { reads++; } });
    await f.run();
    assert.equal(f.calls[0].status, 400);
    assert.equal(reads, 0);
  }
});

test("redacts reader failures", async () => {
  const f = fixture({ reader: async () => { throw new Error("internal path"); } });
  await f.run();
  assert.deepEqual(f.calls, [{
    status: 503,
    body: { error: "ACS ZCTA demographic readiness is unavailable. No action was taken." },
  }]);
  assert.doesNotMatch(JSON.stringify(f.calls), /internal path/);
});
