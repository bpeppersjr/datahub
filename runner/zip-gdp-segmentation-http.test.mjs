import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { zipGdpSegmentationHttp } from "./zip-gdp-segmentation-http.mjs";

function harness(target, method = "GET", headers = {}) {
  const request = new EventEmitter();
  Object.assign(request, { method, headers, aborted: false, resume() {} });
  const response = new EventEmitter();
  Object.assign(response, { writableEnded: false, destroyed: false, headers: {}, setHeader(key, value) { this.headers[key] = value; } });
  const writes = [];
  return { request, response, writes, run: (reader) => zipGdpSegmentationHttp(request, response, new URL(target, "http://localhost"), reader, (_response, status, body) => writes.push({ status, body })) };
}

test("serves a bounded no-store exact-ZIP view", async () => {
  const h = harness("/api/business-map/zip-gdp-segmentation?zip=00601");
  await h.run(({ zip5 }) => ({ schema_version: "zip-gdp-segmentation-view@1.0.0", zip5 }));
  assert.deepEqual(h.writes, [{ status: 200, body: { schema_version: "zip-gdp-segmentation-view@1.0.0", zip5: "00601" } }]);
  assert.equal(h.response.headers["Cache-Control"], "no-store");
});

test("rejects ambiguous inputs and maps internal details to a generic unavailable response", async () => {
  for (const target of ["/?zip=601", "/?zip=00601&zip=00602", "/?zip=00601&extra=x"]) {
    const h = harness(target);
    await h.run(() => assert.fail("reader must not run"));
    assert.equal(h.writes[0].status, 400);
  }
  const failed = harness("/?zip=00601");
  await failed.run(() => { throw Error("sensitive local path"); });
  assert.deepEqual(failed.writes, [{ status: 503, body: { error: "ZIP GDP segmentation view is unavailable or incompatible." } }]);
  assert.doesNotMatch(JSON.stringify(failed.writes), /sensitive/);
});

