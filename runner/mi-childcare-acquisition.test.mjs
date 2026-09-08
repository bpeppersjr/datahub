import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertInsideApp } from "./paths.mjs";
import { MI_CHILDCARE_ITEM, MI_CHILDCARE_ORG, MI_CHILDCARE_LAYER, MI_CHILDCARE_SCHEMA, MI_CHILDCARE_SOURCE_CRS, MI_CHILDCARE_EXTENT_WKT, MI_CHILDCARE_SELECTED_FIELDS, preflightMiChildcare } from "./mi-childcare-preflight.mjs";
import { MI_CHILDCARE_METADATA_URL } from "./mi-childcare-metadata.mjs";
import { acquireMiChildcare, replayMiChildcareAcquisition } from "./mi-childcare-acquisition.mjs";
const terms = '<div>This dataset is a public record and, as more fully described below, there are no restrictions on the use, reproduction, or distribution of this dataset. Notwithstanding the foregoing, the public release of this dataset should not be construed, expressed or implied, as to whether any use constitutes a legally permissible purpose. It is the sole responsibility of the user to determine if the data is usable for their purposes.This dataset is provided “AS IS” and on an “AS AVAILABLE” basis. The State of Michigan (“State”) makes no warranties, express or implied, regarding the accuracy, adequacy, reliability, timeliness, or completeness of this dataset. The State also does not make any warranties, express or implied, for the continued quality, accuracy, or currency of this dataset after it has been downloaded, nor the quality or accuracy of any analyses or re-uses of this dataset. THE STATE DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS DATASET AND ANY INFORMATION PROVIDED TO YOU, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT OF PROPRIETARY RIGHTS. THE STATE WILL NOT BE LIABLE, REGARDLESS OF THE FORM OF ACTION, WHETHER IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY OR BY STATUTE OR OTHERWISE, FOR ANY CLAIM FOR CONSEQUENTIAL, INCIDENTAL, INDIRECT, OR SPECIAL DAMAGES, INCLUDING WITHOUT LIMITATION LOST PROFITS AND LOST BUSINESS OPPORTUNITIES, RELATED TO THE ACCESS OR USE OF THIS DATASET. IN NO EVENT WILL THE STATE BE LIABLE FOR ANY AMOUNTS THAT MAY RESULT FROM THE ACCESS OR USE OF THIS DATASET, REGARDLESS OF THE FORM OF ACTION, WHETHER IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR BY STATUTE OR OTHERWISE. You forever release the State, its departments, subdivisions, officers, and employees from all claims, rights, actions, demands, damages, liabilities, expenses and fees, which arise out of or relate to your access or use of this dataset. You must defend, indemnify and hold the State, its departments, subdivisions, officers, and employees harmless, without limitation, from and against all actions, claims, losses, liabilities, damages, costs, attorney fees, and expenses (including those required to establish the right to indemnification) arising out of or relating to your access or use of this dataset. The State reserves the right to modify or remove this dataset for any reason, without notice, at any time. Nothing in these terms constitutes or is intended to be a limitation upon, or waiver of, any privileges and immunities that apply to the State. These terms are governed by and interpreted under the laws of the State of Michigan without regard to conflict of laws provisions. These terms do not apply to other materials or content, including maps or logos, that may be located on the site or portal containing this dataset and that may be protected by intellectual property rights such copyright, trademark, or patent. Nothing in these terms should be construed, expressed or implied, as impacting any existing rights or licenses in such materials or content, if any.</div><div><br /></div>';
const sha = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const metadataPath = process.env.MI_CHILDCARE_METADATA_TEST_FIXTURE;
const metadata = metadataPath ? await readFile(assertInsideApp(metadataPath)) : null;
const needsXml = { skip: metadata === null ? "Requires explicitly provided private local XML fixture; no network fallback." : false };
function fixture({ count = 103, mutate = () => {} } = {}) {
  const calls = [], waits = [], kinds = {};
  const now = () => new Date("2026-09-08T02:00:00.000Z");
  const fetchImpl = async (url, options) => {
    const u = new URL(url), kind = url === MI_CHILDCARE_METADATA_URL ? "xml" : u.searchParams.has("returnIdsOnly") ? "inventory"
      : u.searchParams.has("objectIds") ? "features" : u.pathname.endsWith("/query") ? "count" : url.includes("sharing/rest/content") ? "item" : "metadata";
    kinds[kind] = (kinds[kind] ?? 0) + 1; calls.push({ url, options, kind });
    let value = kind === "xml" ? null : kind === "count" ? { count } : kind === "inventory" ? { objectIdFieldName: "OBJECTID", objectIds: Array.from({ length: count }, (_, i) => count - i) }
      : kind === "features" ? { features: u.searchParams.get("objectIds").split(",").map(Number).map(id => ({ attributes: {
        OBJECTID: id, LicenseNumber: "000" + id, FacilityName: "Clearly Synthetic Center", StreetAddress: "1 Synthetic Street", City: "Synthetic City",
        State: "MI", ZIPCode: id === 1 ? null : "49901-0023", CountyCode: "SOURCE-ONLY", FacilityTypeCode: "DC", FacilityType: "Center", Capacity: 30, Latitude: 47.2, Longitude: -88.4
      } })) } : kind === "item" ? {
        id: MI_CHILDCARE_ITEM, owner: "michigan_admin", orgId: MI_CHILDCARE_ORG, access: "public", title: "Child Care", type: "Feature Service", url: MI_CHILDCARE_LAYER,
        sourceUrl: "https://gisagocss.state.mi.us/arcgis/rest/services/CSS/CSS_LARA/MapServer/5", created: 1657216578000, modified: 1775850938000, licenseInfo: terms, numViews: calls.length
      } : { id: 5, name: "BCHS_Child_Care", type: "Feature Layer", displayField: "FacilityName", geometryType: "esriGeometryPoint",
        sourceSpatialReference: { ...MI_CHILDCARE_SOURCE_CRS }, extent: { spatialReference: { wkt: MI_CHILDCARE_EXTENT_WKT } }, capabilities: "Map,Query,Data",
        maxRecordCount: 1000, hasAttachments: false, hasMetadata: true, supportsStatistics: true,
        advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
        fields: MI_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length === null ? {} : { length }), domain: null })) };
    const overridden = mutate(value, kind, kinds[kind], u, options);
    if (overridden instanceof Response) return overridden;
    if (kind === "xml") { assert.ok(metadata, "Explicit private XML fixture required"); return new Response(metadata, { headers: { "content-type": "application/xml" } }); }
    return Response.json(value);
  };
  return { calls, waits, fetchImpl, now, sleep: async ms => { waits.push(ms); } };
}
async function prepare(f) {
  const preflight = await preflightMiChildcare({ fetchImpl: f.fetchImpl, sleep: f.sleep, now: f.now });
  return { preflight, callerAuthorization: { mode: "explicit-reviewed-center-acquisition", reviewReference: "synthetic-test-review-not-real-approval",
    metadataReceiptSha256: sha(preflight) }, maximumPreflightAgeMs: 60_000, fetchImpl: f.fetchImpl, sleep: f.sleep, now: f.now };
}
test("MI acquisition denies absent malformed stale or unpinned caller assertions before requests", async () => {
  const f = fixture(), options = await prepare(f), before = f.calls.length;
  for (const change of [{ callerAuthorization: undefined }, { callerAuthorization: true }, { maximumPreflightAgeMs: 0 }, { maximumPreflightAgeMs: 86_400_001 },
    { callerAuthorization: { ...options.callerAuthorization, metadataReceiptSha256: "0".repeat(64) } },
    { now: () => new Date("2026-09-09T02:00:00.000Z") }, { now: () => new Date("2026-09-07T02:00:00.000Z") }, { url: "https://private.example" }]) {
    await assert.rejects(acquireMiChildcare({ ...options, ...change })); assert.equal(f.calls.length, before);
  }
  await assert.rejects(acquireMiChildcare({ ...options, signal: AbortSignal.abort() }), { name: "AbortError" });
  assert.equal(f.calls.length, before);
});
test("MI synthetic rows use bounded sorted explicit center queries and replay complete evidence", needsXml, async () => {
  const f = fixture(), options = await prepare(f), result = await acquireMiChildcare(options);
  assert.equal(result.features.length, 103); assert.equal(result.features[0].attributes.OBJECTID, 1); assert.equal(result.features[0].attributes.ZIPCode, null);
  assert.equal(result.source.normalized_records_produced, 0); assert.equal(result.source.coordinate_crs, null);
  assert.equal(result.source.governed_geographic_assignment_eligible, false); assert.equal(result.source.legal_approval, false);
  assert.equal(result.source.caller_authorization_validation, "structural-caller-assertion-not-independent-review");
  assert.equal(result.evidence.supplied_preflight.readiness.acquisition_authorized, false);
  assert.equal(result.publisher_metadata.before.sha256, result.publisher_metadata.after.sha256);
  assert.ok(f.waits.every(ms => ms >= 1000));
  for (const c of f.calls.filter(c => c.kind === "features")) {
    const u = new URL(c.url); assert.equal(u.searchParams.get("returnGeometry"), "false"); assert.equal(u.searchParams.get("where"), "FacilityTypeCode='DC'");
    assert.equal(u.searchParams.get("outFields"), MI_CHILDCARE_SELECTED_FIELDS.join(",")); assert.ok(Buffer.byteLength(c.url) <= 2000);
    assert.ok(u.searchParams.get("objectIds").split(",").length <= 100); assert.equal(c.options.redirect, "manual");
  }
  const prior = globalThis.fetch; globalThis.fetch = () => { throw new Error("No network in replay"); };
  try { assert.deepEqual(replayMiChildcareAcquisition(result.evidence), result); } finally { globalThis.fetch = prior; }
  assert.throws(() => replayMiChildcareAcquisition(result.evidence, { signal: AbortSignal.abort() }), { name: "AbortError" });
  for (const alter of [e => { e.observations[1].payload.features[0].attributes.OwnerPhone = "PRIVATE"; e.observations[1].payload_sha256 = sha(e.observations[1].payload); },
    e => { e.observations[1].url += "&outFields=*"; }, e => { e.xml_after.sha256 = "0".repeat(64); }, e => { e.caller_authorization.reviewReference = ""; },
    e => { e.xml_before.notices.legal_approval = true; }, e => { e.observations.pop(); }, e => { e.observed_at = "2020-01-01T00:00:00.000Z"; }]) {
    const e = structuredClone(result.evidence); alter(e); assert.throws(() => replayMiChildcareAcquisition(e));
  }
});

test("MI query deadlines cancel hanging streams and oversized bodies cancel upstream", { ...needsXml, timeout: 5000 }, async () => {
  let cancelled = 0;
  const hanging = fixture({ mutate: (p,k) => { if (k === "features") return new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"features":[')); }, cancel() { cancelled++; }
  })); } });
  await assert.rejects(acquireMiChildcare({ ...await prepare(hanging), timeoutMs: 5 }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, 3);
  let oversizedCancelled = 0;
  const oversized = fixture({ mutate: (p,k) => { if (k === "features") return new Response(new ReadableStream({
    cancel() { oversizedCancelled++; }
  }), { headers: { "content-length": "8000001" } }); } });
  await assert.rejects(acquireMiChildcare(await prepare(oversized)));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(oversizedCancelled, 1);
  const malformed = fixture({ mutate: (p,k) => { if (k === "features") return new Response(Buffer.concat([
    Buffer.from(JSON.stringify(p).replace("Clearly Synthetic Center", "INVALID_UTF8_MARKER").split("INVALID_UTF8_MARKER")[0]),
    Buffer.from([0xff]), Buffer.from(JSON.stringify(p).replace("Clearly Synthetic Center", "INVALID_UTF8_MARKER").split("INVALID_UTF8_MARKER")[1])
  ])); } });
  await assert.rejects(acquireMiChildcare(await prepare(malformed)));
});
test("MI acquisition fails closed on private fields wrong scope missing IDs or truncation", needsXml, async () => {
  for (const change of [
    p => { p.features[0].attributes.OwnerPhone = "PRIVATE"; }, p => { p.features[0].attributes.State = "IN"; },
    p => { p.features[0].attributes.FacilityType = "Home"; }, p => { p.features[0].geometry = null; },
    p => { p.features[0].attributes.LicenseNumber = 123; }, p => { p.features[0].attributes.City = {}; },
    p => { p.features[0] = p.features[1]; }, p => { p.features.pop(); }, p => { p.exceededTransferLimit = true; },
    p => { p.error = { code: 500, message: "PRIVATE" }; }
  ]) {
    const f = fixture({ mutate: (p,k) => { if (k === "features") change(p); } });
    await assert.rejects(acquireMiChildcare(await prepare(f)), error => !error.message.includes("PRIVATE"));
  }
  for (const mutate of [(p,k,n) => { if (k === "inventory" && n === 2) p.objectIds[0] = 9000; },
    (p,k,n) => { if (k === "count" && n >= 5) p.count++; }, (p,k,n) => { if (k === "item" && n >= 5) p.modified++; }]) {
    const f = fixture({ mutate }); await assert.rejects(acquireMiChildcare(await prepare(f)));
  }
});
test("MI bounded retries honor provider waits and cancellation; oversized or truncated bodies fail", needsXml, async () => {
  const f = fixture({ mutate: (p,k,n) => { if (k === "features" && n === 1) return new Response("", { status: 429, headers: { "retry-after": "3" } }); } });
  await acquireMiChildcare(await prepare(f)); assert.ok(f.waits.includes(3000));
  const compressed = fixture({ mutate: (p,k) => { if (k === "features") return new Response(JSON.stringify(p), { headers: { "content-encoding": "gzip", "content-length": "20" } }); } });
  assert.equal((await acquireMiChildcare(await prepare(compressed))).features.length, 103);
  for (const response of [() => new Response("{}", { headers: { "content-length": "8000001" } }),
    () => new Response("{}", { headers: { "content-length": "10", "content-encoding": " IDENTITY " } }),
    () => new Response("{}", { headers: { "content-length": "10" } }), () => new Response("{}", { status: 302 }),
    () => new Response("{}", { status: 429, headers: { "retry-after": "120" } })]) {
    const bad = fixture({ mutate: (p,k) => { if (k === "features") return response(); } }); await assert.rejects(acquireMiChildcare(await prepare(bad)));
  }
  const controller = new AbortController(), aborted = fixture({ mutate: (p,k) => { if (k === "features") controller.abort(); } });
  await assert.rejects(acquireMiChildcare({ ...await prepare(aborted), signal: controller.signal }), { name: "AbortError" });
});
