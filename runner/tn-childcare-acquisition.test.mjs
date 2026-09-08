import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { acquireTnChildcare, replayTnChildcareAcquisition } from "./tn-childcare-acquisition.mjs";
import { normalizeTnChildcareFeature } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_ITEM, TN_CHILDCARE_ORG, TN_CHILDCARE_SCHEMA, TN_CHILDCARE_TERMS_TEXT, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";

const hash = (p) => createHash("sha256").update(JSON.stringify(p)).digest("hex");
const clock = () => new Date("2026-09-08T00:00:00.000Z");
function feature(id) { return { attributes: { OBJECTID: id, Provider_ID: id, Provider_Status: "Active", Provider_Type: "Child Care", Child_Care_Type: "Child Care Center",
  Provider_Name: "Fixture Center", Street_Address: "1 Main Street", Street_Address_2: null, City: "Nashville", State: "TN", Zip: "37201-0123", County: "Davidson" }, geometry: { x: -86.78, y: 36.16 } }; }
function source({ count = 2, mutate = () => {} } = {}) {
  const calls = [], occurrences = {};
  const fetchImpl = async (url, options) => {
    const u = new URL(url), q = u.searchParams;
    const kind = q.has("objectIds") ? "features" : q.has("returnIdsOnly") ? "inventory" : q.has("returnCountOnly") ? "count"
      : url.includes("metadata.xml") ? "xml" : url.includes("/items/") ? "item" : url.includes("/portals/") ? "organization" : "metadata";
    occurrences[kind] = (occurrences[kind] ?? 0) + 1; calls.push({ url, kind, options });
    let p;
    if (kind === "features") p = { spatialReference: { wkid: 4326 }, features: q.get("objectIds").split(",").map(Number).map(feature) };
    if (kind === "inventory") p = { objectIdFieldName: "OBJECTID", objectIds: Array.from({ length: count }, (_, i) => count - i) };
    if (kind === "count") p = { count };
    if (kind === "metadata") p = { id: 0, name: "Active_ChildCare_Master", type: "Feature Layer", serviceItemId: TN_CHILDCARE_ITEM, objectIdField: "OBJECTID", displayField: "Provider_Name",
      geometryType: "esriGeometryPoint", spatialReference: { wkid: 4326, latestWkid: 4326 }, extent: { spatialReference: { wkid: 4326, latestWkid: 4326 } },
      capabilities: "Query,Extract", maxRecordCount: 2000, hasMetadata: true, hasAttachments: false, editingInfo: { lastEditDate: 1788460779896, schemaLastEditDate: 1788460779896, dataLastEditDate: 1788460779896 },
      advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
      fields: TN_CHILDCARE_SCHEMA.map(([name, type, length, nullable]) => ({ name, type, ...(length === null ? {} : { length }), nullable, domain: null })) };
    if (kind === "item") p = { id: TN_CHILDCARE_ITEM, owner: "kwinchester_sts", orgId: TN_CHILDCARE_ORG, access: "public", type: "Feature Service", title: "Active Statewide Childcare Locations",
      url: TN_CHILDCARE_LAYER.slice(0, -2), accessInformation: "TN Department of Human Services", created: 1732643560000, modified: 1788460782000, licenseInfo: TN_CHILDCARE_TERMS_TEXT };
    if (kind === "organization") p = { id: TN_CHILDCARE_ORG, name: "State of Tennessee STS GIS", urlKey: "tnmap" };
    const replacement = mutate(p, kind, occurrences[kind], q, options); if (replacement) return replacement;
    return kind === "xml" ? new Response('\ufeff<metadata>Active_ChildCare_Locations</metadata>\n', { headers: { "content-type": "application/xml" } }) : new Response(JSON.stringify(p));
  };
  return { calls, fetchImpl };
}
const run = (stub = source(), options = {}) => acquireTnChildcare({ fetchImpl: stub.fetchImpl, sleep: async () => {}, now: clock, ...options });
test("TN acquires fixed center-only selected batches after complete preflight and replays offline", async () => {
  const stub = source({ count: 101 }), waits = [];
  const result = await run(stub, { sleep: async (ms) => waits.push(ms) });
  assert.equal(result.features.length, 101); assert.equal(result.source.output_wkid, 4326); assert.equal(result.source.export_authorized, false);
  assert.deepEqual(result.features.map((r) => r.attributes.OBJECTID), Array.from({ length: 101 }, (_, i) => i + 1));
  assert.deepEqual(replayTnChildcareAcquisition(result.evidence), result);
  assert.equal(result.publisher_metadata.before.raw[0], 0xef); assert.deepEqual(result.publisher_metadata.before.raw, result.publisher_metadata.after.raw);
  assert.equal(stub.calls.findIndex((c) => c.kind === "inventory"), 10);
  for (const call of stub.calls.filter((c) => ["inventory", "features"].includes(c.kind))) {
    const q = new URL(call.url).searchParams; assert.equal(q.get("where"), TN_CHILDCARE_WHERE); assert.ok(Buffer.byteLength(call.url) <= 2000);
    if (call.kind === "features") { assert.ok(q.get("objectIds").split(",").length <= 100); assert.equal(q.get("outFields"), TN_CHILDCARE_SCHEMA.map(([name]) => name).join(",")); }
  }
  assert.ok(waits.every((ms) => ms === 1000)); assert.ok(result.source.successful_query_response_bytes > 0);
  const normalized = normalizeTnChildcareFeature(result.features[0], { runId: "fixture-run", sourceReleaseId: "fixture-release",
    observedAt: result.source.observed_at, outputWkid: result.source.output_wkid, editingInfo: result.source.editing_info, itemModifiedEpochMs: result.source.item_modified_epoch_ms });
  assert.equal(normalized.physical_address.zip_code, "37201"); assert.equal(normalized.physical_address.zip4, "0123");
  assert.equal(normalized.geocode.latitude, 36.16); assert.equal(normalized.geocode.longitude, -86.78);
});
test("TN preserves missing point evidence without producing zero coordinates", async () => {
  for (const geometry of [undefined, null]) {
    const result = await run(source({ mutate: (p, k) => { if (k === "features") { if (geometry === undefined) delete p.features[0].geometry; else p.features[0].geometry = geometry; } } }));
    const normalized = normalizeTnChildcareFeature(result.features[0], { runId: "fixture-run", sourceReleaseId: "fixture-release", observedAt: result.source.observed_at, outputWkid: 4326 });
    assert.equal(normalized.geocode.latitude, null); assert.equal(normalized.geocode.longitude, null);
  }
});
test("TN blocks all row requests when complete metadata XML is unavailable", async () => {
  for (const status of [404, 410]) {
    const stub = source({ mutate: (p, k) => k === "xml" ? new Response(null, { status }) : undefined });
    await assert.rejects(run(stub)); assert.equal(stub.calls.some((c) => ["features", "inventory"].includes(c.kind)), false);
  }
});
test("TN rejects source drift ID mismatch truncation private fields and unsafe CRS before return", async () => {
  for (const mutate of [
    (p, k) => { if (k === "features") p.features[0].attributes.owner = "private"; },
    (p, k) => { if (k === "features") p.features[0].attributes.Provider_Name = { owner: "private" }; },
    (p, k) => { if (k === "features") p.features[0].geometry.x = { owner: "private" }; },
    (p, k) => { if (k === "features") p.features[0].attributes.Child_Care_Type = "Family Child Care Home"; },
    (p, k) => { if (k === "features") p.features[0].attributes.Provider_Status = "Inactive"; },
    (p, k) => { if (k === "features") p.features[0].attributes.State = "KY"; },
    (p, k) => { if (k === "features") p.features[0].geometry.spatialReference = { wkid: 3857 }; },
    (p, k) => { if (k === "features") p.spatialReference.wkid = 3857; },
    (p, k) => { if (k === "features") p.exceededTransferLimit = true; },
    (p, k) => { if (k === "features") p.features.pop(); },
    (p, k) => { if (k === "features") p.features[0].attributes.OBJECTID = 1000; },
    (p, k) => { if (k === "inventory") p.objectIds[1] = p.objectIds[0]; },
    (p, k, n) => { if (k === "inventory" && n === 2) p.objectIds[0] = 1000; },
    (p, k, n) => { if (k === "metadata" && n >= 3) p.editingInfo.lastEditDate++; },
    (p, k, n) => { if (k === "item" && n >= 3) p.modified++; },
    (p, k, n) => k === "xml" && n >= 3 ? new Response('<metadata>Active_ChildCare_Locations changed</metadata>', { headers: { "content-type": "application/xml" } }) : undefined,
  ]) await assert.rejects(run(source({ mutate })));
});
test("TN replay rejects self-consistently rehashed unsafe evidence and recorded budgets", async () => {
  const { evidence } = await run();
  for (const mutate of [
    (o) => { o.payload.features[0].attributes.owner = "private"; },
    (o) => { o.payload.features[0].attributes.Child_Care_Type = "Group Child Care Home"; },
    (o) => { o.url = o.url.replace("Child+Care+Center", "Family+Child+Care+Home"); },
    (o) => { o.payload.features[0].geometry = { x: -86, y: 36, owner: "private" }; },
    (o) => { o.response_bytes = 8_000_001; },
  ]) {
    const changed = structuredClone(evidence), o = changed.observations.find((row) => row.kind === "features"); mutate(o); o.payload_sha256 = hash(o.payload);
    await assert.throws(() => replayTnChildcareAcquisition(changed));
  }
  const changed = structuredClone(evidence); changed.observations[0].observed_at = "2020-01-01T00:00:00.000Z"; assert.throws(() => replayTnChildcareAcquisition(changed));
  assert.throws(() => replayTnChildcareAcquisition(evidence, { signal: AbortSignal.abort() }));
});
test("TN deadlines cancellations retry deferral redirects and byte ceilings are bounded", async () => {
  const deferred = source({ mutate: (p, k) => k === "inventory" ? new Response(null, { status: 429, headers: { "retry-after": "61" } }) : undefined });
  await assert.rejects(run(deferred), { code: "SOURCE_RETRY_DEFERRED" });
  const retry = source({ mutate: (p, k, n) => k === "features" && n === 1 ? new Response(null, { status: 503, headers: { "retry-after": "2" } }) : undefined }), waits = [];
  await run(retry, { sleep: async (ms) => waits.push(ms) }); assert.ok(waits.includes(2000));
  for (const replacement of [() => new Response(null, { status: 302 }), () => new Response("{}", { headers: { "content-length": "8000001" } }), () => new Response("x".repeat(8_000_001))]) {
    await assert.rejects(run(source({ mutate: (p, k) => k === "features" ? replacement() : undefined })));
  }
  let cancelled = 0;
  await assert.rejects(run(source({ mutate: (p, k) => k === "features" ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { "content-length": "8000001" } }) : undefined })));
  assert.equal(cancelled, 1); cancelled = 0;
  await assert.rejects(run(source({ mutate: (p, k) => k === "features" ? new Response(new ReadableStream({ cancel() { cancelled++; } })) : undefined }), { timeoutMs: 5 })); assert.equal(cancelled, 3);
  const controller = new AbortController(), stub = source({ mutate: (p, k) => { if (k === "features") controller.abort(new Error("cancelled")); } });
  await assert.rejects(run(stub, { signal: controller.signal }), /cancelled/);
  for (const options of [{ where: "1=1" }, { fetchImpl: 1 }, { timeoutMs: 60001 }]) await assert.rejects(run(source(), options));
});
test("TN bounds actual cumulative query body bytes even when JSON whitespace is discarded", async () => {
  const stub = source({ count: 1300, mutate: (p, k) => k === "features" ? new Response(" ".repeat(7_800_000 - JSON.stringify(p).length) + JSON.stringify(p)) : undefined });
  await assert.rejects(run(stub));
  assert.equal(stub.calls.filter((c) => c.kind === "metadata").length, 2); // No post-acquisition preflight or result.
  const result = await run(source({ count: 1300 })), changed = structuredClone(result.evidence);
  for (const observation of changed.observations) observation.response_bytes = 8_000_000;
  assert.throws(() => replayTnChildcareAcquisition(changed), /byte ceiling/);
});
