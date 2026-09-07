import test from "node:test";
import assert from "node:assert/strict";
import { acquireNjChildcare } from "./nj-childcare-acquisition.mjs";
import { normalizeNjChildcareFeature } from "./nj-childcare-normalization.mjs";
import { NJ_CHILDCARE_LAYER, NJ_CHILDCARE_ITEM, NJ_CHILDCARE_SCHEMA } from "./nj-childcare-preflight.mjs";

const metadata = () => ({ id: 4, name: "Child Care Centers", type: "Feature Layer", geometryType: "esriGeometryPoint",
  extent: { spatialReference: { wkid: 102100, latestWkid: 3857 } }, capabilities: "Map,Query,Data", maxRecordCount: 1,
  advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
  fields: NJ_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length ? { length } : {}), domain: null })) });
const item = () => ({ id: NJ_CHILDCARE_ITEM, owner: "NJDEPBGIS", access: "public", type: "Feature Service",
  title: "Child Care Centers of New Jersey", url: NJ_CHILDCARE_LAYER, modified: 1758741707000, created: 1500000000000,
  licenseInfo: "Preserve NJDEP metadata and notices.", numViews: 100 });
const date = 1786463205000;
const xml = Buffer.from("<?xml version=\"1.0\"?>\n<metadata>Strc_DCF_childcare</metadata>\n");
const feature = (id) => ({ attributes: Object.fromEntries(NJ_CHILDCARE_SCHEMA.map(([name]) => [name, name === "OBJECTID" ? id : name === "download_date" ? date : null])), geometry: { x: -74.2, y: 40.1 } });
const json = (value, init) => new Response(JSON.stringify(value), init);
const sleep = async () => {};
function source({ ids = [2, 1], mutate = () => {} } = {}) {
  const calls = [], counts = {};
  return { calls, fetchImpl: async (url, options) => {
    const parsed = new URL(url), p = parsed.searchParams;
    const kind = parsed.pathname.endsWith("metadata.xml") ? "xml" : parsed.pathname.includes("sharing/rest") ? "item"
      : !parsed.pathname.endsWith("/query") ? "metadata" : p.has("returnCountOnly") ? "count"
        : p.has("outStatistics") ? "dates" : p.has("returnIdsOnly") ? "inventory" : "features";
    let payload = kind === "xml" ? xml : kind === "metadata" ? metadata() : kind === "item" ? item()
      : kind === "count" ? { count: ids.length } : kind === "inventory" ? { objectIdFieldName: "OBJECTID", objectIds: [...ids] }
        : kind === "dates" ? { features: [{ attributes: { download_date_min: date, download_date_max: date, download_date_count: ids.length } }] }
          : { spatialReference: { wkid: 4326, latestWkid: 4326 }, features: p.get("objectIds").split(",").map((id) => feature(Number(id))) };
    const replacement = mutate(payload, kind, counts[kind] = (counts[kind] ?? 0) + 1);
    if (replacement !== undefined) payload = replacement;
    calls.push({ url, options, kind });
    return kind === "xml" ? new Response(payload, { headers: { "content-type": "application/xml" } }) : json(payload);
  } };
}
const run = (stub = source(), options = {}) => acquireNjChildcare({ fetchImpl: stub.fetchImpl, sleep, ...options });

test("NJ acquisition retains raw metadata and full JSON evidence around fixed selected batches", async () => {
  const stub = source({ mutate: (p, k, n) => { if (k === "item") p.numViews += n; } }), waits = [];
  const result = await run(stub, { sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(result.features.map((f) => f.attributes.OBJECTID), [1, 2]);
  assert.equal(result.source.record_count, 2); assert.equal(result.source.download_date_epoch_ms, date);
  assert.equal(result.source.native_wkid, 102100); assert.equal(result.source.output_wkid, 4326);
  assert.deepEqual(result.publisher_metadata.before.raw, xml); assert.deepEqual(result.publisher_metadata.after.raw, xml);
  assert.deepEqual(stub.calls.map((c) => c.kind), ["metadata", "item", "xml", "count", "dates", "inventory", "features", "features", "inventory", "dates", "count", "xml", "item", "metadata"]);
  assert.deepEqual(waits, Array(13).fill(1000));
  assert.equal(result.source.observations.length, 14);
  assert.deepEqual(result.source.observations[5].payload.objectIds, [2, 1]);
  for (const observation of result.source.observations) assert.match(observation.payload_sha256, /^[a-f0-9]{64}$/);
  for (const call of stub.calls) {
    assert.equal(call.options.redirect, "manual");
    const p = new URL(call.url).searchParams;
    if (call.kind === "features") {
      assert.equal(p.get("outFields"), NJ_CHILDCARE_SCHEMA.map(([name]) => name).join(","));
      assert.equal(p.get("outSR"), "4326"); assert.equal(p.get("orderByFields"), "OBJECTID ASC");
      assert.ok(!p.get("outFields").includes("center_phone"));
    }
  }
});

test("NJ greedy batching handles large OIDs within both 100-ID and 2000-byte ceilings", async () => {
  for (const large of [false, true]) {
    const ids = Array.from({ length: 201 }, (_, i) => large ? Number.MAX_SAFE_INTEGER - i : i + 1);
    const stub = source({ ids, mutate: (p, k) => { if (k === "metadata") p.maxRecordCount = 2000; } });
    const result = await run(stub), calls = stub.calls.filter((c) => c.kind === "features");
    assert.equal(result.features.length, 201);
    assert.ok(calls.every((c) => Buffer.byteLength(c.url) <= 2000 && new URL(c.url).searchParams.get("objectIds").split(",").length <= 100));
    if (!large) assert.deepEqual(calls.map((c) => new URL(c.url).searchParams.get("objectIds").split(",").length), [100, 100, 1]);
    else assert.ok(new URL(calls[0].url).searchParams.get("objectIds").split(",").length < 100);
  }
});

test("NJ acquired evidence feeds normalization with distinct postal fields and no operation inference", async () => {
  const acquired = await run(source({ mutate: (payload, kind) => {
    if (kind === "features") for (const entry of payload.features) Object.assign(entry.attributes, {
      center_id: `000${entry.attributes.OBJECTID}`, center_name: "Fixture Center", address: "10 Example Street",
      city: "Trenton", state: "NJ", zip: "08625-0123", licensed_capacity: 20, foips: "Y",
    });
  } }));
  const records = acquired.features.map((entry) => normalizeNjChildcareFeature(entry, {
    runId: "fixture-run", sourceReleaseId: "fixture-release", observedAt: acquired.source.observed_at,
    outputWkid: acquired.source.output_wkid, downloadDateEpochMs: acquired.source.download_date_epoch_ms,
  }));
  assert.equal(records.length, acquired.source.record_count);
  assert.equal(records[0].physical_address.zip_code, "08625"); assert.equal(records[0].physical_address.zip4, "0123");
  assert.equal(records[0].license.active_business_verified, false); assert.equal(records[0].geometry, undefined);
  assert.equal(records[0].industry.public_school_facility_source, "Y"); assert.equal(records[0].export_policy, "local-review-only");
});

test("NJ acquisition rejects metadata, terms, XML, count, date or inventory drift", async () => {
  for (const mutate of [
    (p, k, n) => { if (k === "metadata" && n === 2) p.fields[1].nullable = true; },
    (p, k, n) => { if (k === "item" && n === 2) p.licenseInfo += "changed"; },
    (p, k, n) => k === "xml" && n === 2 ? Buffer.from("<metadata>Strc_DCF_childcare changed</metadata>") : undefined,
    (p, k, n) => { if (k === "count" && n === 2) p.count++; },
    (p, k) => { if (k === "count") p.count = 20001; },
    (p, k, n) => { if (k === "dates" && n === 2) { p.features[0].attributes.download_date_min++; p.features[0].attributes.download_date_max++; } },
    (p, k) => { if (k === "inventory") p.objectIds = [1, 1]; },
    (p, k) => { if (k === "inventory") p.objectIds = [1]; },
    (p, k, n) => { if (k === "inventory" && n === 2) p.objectIds = [1, 3]; },
    (p, k) => { if (k === "inventory") p.objectIdFieldName = "other"; },
  ]) await assert.rejects(run(source({ mutate })));
});

test("NJ batch validation rejects private fields, date disagreement, missing/duplicate IDs and CRS drift", async () => {
  for (const change of [
    (p) => { p.features = []; }, (p) => { p.features.push(p.features[0]); },
    (p) => { p.features[0].attributes.OBJECTID = 99; }, (p) => { delete p.features[0].attributes.center_id; },
    (p) => { p.features[0].attributes.owner = "private"; }, (p) => { p.features[0].attributes.download_date++; },
    (p) => { p.features[0].attributes.center_name = { owner: "private" }; },
    (p) => { p.features[0].attributes.center_name = ["private"]; },
    (p) => { p.features[0].attributes.download_date = null; }, (p) => { p.features[0].center_email = "private"; },
    (p) => { p.features[0].geometry.extra = "private"; }, (p) => { p.spatialReference.latestWkid = 3857; },
    (p) => { p.features[0].geometry.spatialReference = { wkid: 4326, latestWkid: 3857 }; },
    (p) => { p.exceededTransferLimit = true; }, (p) => { p.fieldAliases = { owner: "owner" }; },
  ]) await assert.rejects(run(source({ mutate: (p, k) => { if (k === "features") change(p); } })));
  await assert.rejects(run(source({ mutate: (p, k) => {
    if (k === "metadata") p.maxRecordCount = 2000;
    if (k === "features") p.features[1] = p.features[0];
  } })), /IDs/);
});

test("NJ request ceilings and error redaction prevent oversized or redirected acquisition", async () => {
  for (const response of [json({ error: { message: "PRIVATE_ERROR" } }), new Response("PRIVATE_ERROR"), new Response(null, { status: 302 }),
    json({}, { headers: { "content-length": "8000001" } }), new Response(" ".repeat(8_000_001))]) {
    await assert.rejects(run({ fetchImpl: async () => response }), (error) => /request failed/.test(error.message) && !error.message.includes("PRIVATE_ERROR"));
  }
});

test("NJ cumulative selected response ceiling stops retention before 100MB is exceeded", { timeout: 30000 }, async () => {
  const stub = source({ ids: Array.from({ length: 14 }, (_, i) => i + 1), mutate: (p, k) => {
    if (k === "features") p.features[0].attributes.center_name = "x".repeat(7_200_000);
  } });
  await assert.rejects(run(stub), /byte ceiling/);
  assert.equal(stub.calls.filter((c) => c.kind === "features").length, 14);
  assert.equal(stub.calls.filter((c) => c.kind === "inventory").length, 1);
});

test("NJ bounded retries honor publisher waits and cancellation stops paced or streaming acquisition", async () => {
  const stub = source(), waits = []; let calls = 0;
  await run({ fetchImpl: async (...args) => ++calls === 1 ? json({}, { status: 429, headers: { "retry-after": "7" } }) : stub.fetchImpl(...args) }, { sleep: async (ms) => waits.push(ms) });
  assert.equal(waits[0], 7000);
  await assert.rejects(run({ fetchImpl: async () => json({}, { status: 503, headers: { "retry-after": "61" } }) }), { code: "SOURCE_RETRY_DEFERRED" });
  const abort = new AbortController(), paced = source();
  await assert.rejects(run(paced, { signal: abort.signal, sleep: async () => abort.abort() }), { name: "AbortError" });
  assert.equal(paced.calls.length, 1);
  const bodyAbort = new AbortController(); let cancelled = false;
  await assert.rejects(run({ fetchImpl: async () => new Response(new ReadableStream({ start() { setTimeout(() => bodyAbort.abort(), 5); }, cancel() { cancelled = true; } })) }, { signal: bodyAbort.signal }), { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("NJ acquisition validates options and bounds header/body deadlines before additional requests", async () => {
  let calls = 0; const fetchImpl = async () => { calls++; return json({}); };
  for (const options of [{ url: "https://example.org" }, { where: "1=0" }, { pageSize: 500 }, { timeoutMs: 0 }, { timeoutMs: 60001 }, { sleep: null }, { signal: AbortSignal.abort() }]) {
    await assert.rejects(acquireNjChildcare({ fetchImpl, ...options }));
  }
  assert.equal(calls, 0);
  for (const body of [false, true]) {
    calls = 0;
    await assert.rejects(run({ fetchImpl: async (_, { signal }) => {
      calls++;
      return body ? new Response(new ReadableStream({})) : new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    } }, { timeoutMs: 5 }), /request failed/);
    assert.equal(calls, 3);
  }
});
