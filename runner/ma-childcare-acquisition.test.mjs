import test from "node:test";
import assert from "node:assert/strict";
import { acquireMaChildcare } from "./ma-childcare-acquisition.mjs";
import { normalizeMaChildcareFeature } from "./ma-childcare-normalization.mjs";
import { MA_CHILDCARE_LAYER, MA_CHILDCARE_ITEM, MA_CHILDCARE_SCHEMA } from "./ma-childcare-preflight.mjs";

const metadata = () => ({ id: 0, name: "Licensed Child Care Programs", type: "Feature Layer", serviceItemId: MA_CHILDCARE_ITEM,
  objectIdField: "OBJECTID", geometryType: "esriGeometryPoint", spatialReference: { wkid: 26986 }, extent: { spatialReference: { wkid: 26986 } },
  capabilities: "Query", maxRecordCount: 1, advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true },
  fields: MA_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, length, nullable: name !== "OBJECTID" })),
  editingInfo: { lastEditDate: 1778802655030, schemaLastEditDate: 1778802655030, dataLastEditDate: 1777567917233 } });
const feature = (id) => ({ attributes: Object.fromEntries(MA_CHILDCARE_SCHEMA.map(([name]) => [name, name === "OBJECTID" ? id : null])), geometry: { x: -71, y: 42 } });
const json = (payload, init) => new Response(JSON.stringify(payload), init);
const sleep = async () => {};
function source(mutate = () => {}) {
  const calls = [], counts = {};
  return { calls, fetchImpl: async (url, options) => {
    const parsed = new URL(url), p = parsed.searchParams;
    const kind = !parsed.pathname.endsWith("/query") ? "metadata" : p.has("returnCountOnly") ? "count" : p.has("returnIdsOnly") ? "inventory" : "features";
    const payload = kind === "metadata" ? metadata() : kind === "count" ? { count: 2 } : kind === "inventory" ? { objectIdFieldName: "OBJECTID", objectIds: [2, 1] }
      : { spatialReference: { wkid: 4326 }, features: p.get("objectIds").split(",").map((id) => feature(Number(id))) };
    calls.push({ url, options, kind }); mutate(payload, kind, counts[kind] = (counts[kind] ?? 0) + 1);
    return json(payload);
  } };
}
test("MA acquisition uses fixed selected scope, bounded sorted batches and provenance", async () => {
  const stub = source(), waits = [];
  const result = await acquireMaChildcare({ fetchImpl: stub.fetchImpl, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(result.features.map((f) => f.attributes.OBJECTID), [1, 2]);
  assert.equal(result.source.record_count, 2); assert.equal(result.source.output_wkid, 4326);
  assert.equal(result.source.observations.length, 8); assert.deepEqual(waits, Array(7).fill(1000));
  for (const call of stub.calls) {
    assert.ok(call.url.startsWith(MA_CHILDCARE_LAYER)); assert.equal(call.options.redirect, "manual");
    const p = new URL(call.url).searchParams;
    if (call.kind !== "metadata") assert.equal(p.get("where"), "1=1");
    if (call.kind === "features") { assert.equal(p.get("outSR"), "4326"); assert.equal(p.get("outFields"), MA_CHILDCARE_SCHEMA.map(([n]) => n).join(",")); assert.equal(p.get("outFields").includes("PHONE"), false); }
  }
  for (const item of result.source.observations) assert.match(item.payload_sha256, /^[a-f0-9]{64}$/);
});

test("MA acquisition keeps GET batches within 100 IDs and 2000 URL bytes", async () => {
  const stub = source((payload, kind) => {
    if (kind === "metadata") payload.maxRecordCount = 2000;
    if (kind === "count") payload.count = 201;
    if (kind === "inventory") payload.objectIds = Array.from({ length: 201 }, (_, i) => i + 1);
  });
  const result = await acquireMaChildcare({ fetchImpl: stub.fetchImpl, sleep });
  const batches = stub.calls.filter((call) => call.kind === "features");
  assert.deepEqual(batches.map((call) => new URL(call.url).searchParams.get("objectIds").split(",").length), [100, 100, 1]);
  assert.ok(stub.calls.every((call) => Buffer.byteLength(call.url) <= 2000));
  assert.equal(result.features.length, 201);
  assert.deepEqual(result.features.map((row) => row.attributes.OBJECTID), Array.from({ length: 201 }, (_, i) => i + 1));
});

test("MA acquisition rejects overlong GET requests before sending them", async () => {
  const stub = source((payload, kind) => {
    if (kind === "metadata") payload.maxRecordCount = 2000;
    if (kind === "count") payload.count = 100;
    if (kind === "inventory") payload.objectIds = Array.from({ length: 100 }, (_, i) => Number.MAX_SAFE_INTEGER - i);
  });
  await assert.rejects(acquireMaChildcare({ fetchImpl: stub.fetchImpl, sleep }), /features request exceeds URL byte limit/);
  assert.equal(stub.calls.some((call) => call.kind === "features"), false);
});

test("MA selected acquisition feeds conservative program normalization without canonical merging", async () => {
  const stub = source((payload, kind) => {
    if (kind !== "features") return;
    for (const row of payload.features) Object.assign(row.attributes, {
      PROV_NUM: `P-${row.attributes.OBJECTID}`, PROG_NAME: "Fixture center", ADDRESS: "10 Main Street", CITY: "Boston",
      ZIPCODE: "02108-1234", LICENSED_STATUS: "Current", PROG_TYPE: "Center-based Care", LICENSED_FUNDED: "Licensed", CAPACITY: 20,
    });
  });
  const acquired = await acquireMaChildcare({ fetchImpl: stub.fetchImpl, sleep });
  const rows = acquired.features.map((row) => normalizeMaChildcareFeature(row, {
    runId: "fixture-run", sourceReleaseId: "fixture-source", observedAt: acquired.source.observed_at, outputWkid: acquired.source.output_wkid,
  }));
  assert.equal(rows.length, acquired.source.record_count);
  assert.equal(rows[0].physical_address.zip_code, "02108"); assert.equal(rows[0].physical_address.zip4, "1234");
  assert.equal(rows[0].geocode.latitude, 42); assert.equal(rows[0].license.active_business_verified, false);
  assert.notEqual(rows[0].source_record_id, rows[1].source_record_id);
});
test("MA acquisition rejects option overrides before accessing provider", async () => {
  for (const opts of [{ url: "https://example.org" }, { where: "1=0" }, { pageSize: 999999 }, { timeoutMs: 0 }, { timeoutMs: 60001 }, null]) {
    await assert.rejects(acquireMaChildcare(opts), /option/i);
  }
});
test("MA acquisition rejects count, inventory, edit and schema drift", async () => {
  const changes = [
    (p, k) => { if (k === "count") p.count = 20001; },
    (p, k) => { if (k === "inventory") p.objectIds = [1, 1]; },
    (p, k) => { if (k === "inventory") p.objectIds = [1]; },
    (p, k, n) => { if (k === "inventory" && n === 2) p.objectIds = [1, 3]; },
    (p, k, n) => { if (k === "count" && n === 2) p.count = 3; },
    (p, k, n) => { if (k === "metadata" && n === 2) p.editingInfo.lastEditDate++; },
    (p, k, n) => { if (k === "metadata" && n === 2) p.fields[1].nullable = false; },
  ];
  for (const change of changes) await assert.rejects(acquireMaChildcare({ fetchImpl: source(change).fetchImpl, sleep }));
});
test("MA acquisition rejects missing, duplicate, extra, private fields and truncated rows or CRS drift", async () => {
  for (const change of [
    (p) => { p.features = []; }, (p) => { p.features.push(p.features[0]); },
    (p) => { p.features[0].attributes.OBJECTID = 999; }, (p) => { delete p.features[0].attributes.PROV_NUM; },
    (p) => { p.features[0].attributes.PHONE = "private"; }, (p) => { p.exceededTransferLimit = true; },
    (p) => { p.spatialReference.wkid = 26986; },
    (p) => { p.features[0].geometry.spatialReference = { wkid: 4326, latestWkid: 26986 }; },
  ]) await assert.rejects(acquireMaChildcare({ fetchImpl: source((p, k) => { if (k === "features") change(p); }).fetchImpl, sleep }));
  await assert.rejects(acquireMaChildcare({ fetchImpl: source((p, k) => {
    if (k === "metadata") p.maxRecordCount = 2000;
    if (k === "features") p.features[1] = p.features[0];
  }).fetchImpl, sleep }), /IDs or selected fields/);
});
test("MA acquisition retries conservatively and defers long publisher waits", async () => {
  const stub = source(), waits = []; let calls = 0;
  await acquireMaChildcare({ fetchImpl: async (...args) => ++calls === 1 ? json({}, { status: 429, headers: { "retry-after": "7" } }) : stub.fetchImpl(...args), sleep: async (ms) => waits.push(ms) });
  assert.equal(waits[0], 7000);
  await assert.rejects(acquireMaChildcare({ fetchImpl: async () => json({}, { status: 503, headers: { "retry-after": "61" } }), sleep }), { code: "SOURCE_RETRY_DEFERRED" });
});
test("MA acquisition bounds bodies, rejects redirects and redacts provider errors", async () => {
  for (const response of [json({ error: { message: "SECRET" } }), new Response("SECRET"), new Response(null, { status: 302 }),
    json({}, { headers: { "content-length": "8000001" } }), new Response(" ".repeat(8_000_001))]) {
    await assert.rejects(acquireMaChildcare({ fetchImpl: async () => response, sleep }), (e) => /request failed/.test(e.message) && !e.message.includes("SECRET"));
  }
});
test("MA acquisition cancels paced and stalled body requests without further requests", async () => {
  const controller = new AbortController(), stub = source();
  await assert.rejects(acquireMaChildcare({ fetchImpl: stub.fetchImpl, signal: controller.signal, sleep: async () => controller.abort() }), { name: "AbortError" });
  assert.equal(stub.calls.length, 1);
  const bodyAbort = new AbortController(); let cancelled = false;
  await assert.rejects(acquireMaChildcare({ signal: bodyAbort.signal, sleep, fetchImpl: async () => {
    setTimeout(() => bodyAbort.abort(), 5);
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  } }), { name: "AbortError" });
  assert.equal(cancelled, true);
});
test("MA acquisition deadlines cover headers and body with bounded retries", async () => {
  let calls = 0;
  await assert.rejects(acquireMaChildcare({ timeoutMs: 5, sleep, fetchImpl: async (_url, { signal }) => {
    calls++; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } }), /request failed/);
  assert.equal(calls, 3); calls = 0;
  await assert.rejects(acquireMaChildcare({ timeoutMs: 5, sleep, fetchImpl: async () => { calls++; return new Response(new ReadableStream()); } }), /request failed/);
  assert.equal(calls, 3);
});
