import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { OH_FIELDS, preflightOhChildcare } from "./oh-childcare-preflight.mjs";
import { ohioFixture, ohioPayload } from "./fixtures/oh-childcare.mjs";
import { OH_ACQUISITION_VERSION, ohInventoryUrl, ohFeatureUrl, ohInventory, ohBatches, ohPoint, ohFeatures, replayOhChildcareAcquisition } from "./oh-childcare-acquisition.mjs";

const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const clock = "2026-09-08T05:00:00.000Z";
const observation = (kind, url, payload) => ({ kind, url, observed_at: clock, payload, payload_sha256: hash(payload), response_bytes: Buffer.byteLength(JSON.stringify(payload)) });
const rehash = (o) => { o.payload_sha256 = hash(o.payload); };
function row(id) {
  return { attributes: { objectid: id, county: "Synthetic county", program_type: "Child Care Center", program_number: 1000 + id, program_name: `Synthetic center ${id}`, street_address: "1 Synthetic St", city: "Synthetic", state: "OH", zip_code: id === 1 ? "43215-0123" : null, program_status: "Open" }, geometry: id === 1 ? { x: -83, y: 40 } : null };
}
function page(ids) { return { objectIdFieldName: "objectid", geometryType: "esriGeometryPoint", spatialReference: { wkid: 4326 }, fields: ohioPayload("layer").fields.filter((f) => OH_FIELDS.includes(f.name)), features: [...ids].reverse().map(row), exceededTransferLimit: false }; }
async function fixture(count = 3) {
  const preflight = await preflightOhChildcare(ohioFixture((v, k) => {
    if (k === "selected") v.count = count;
    if (k === "centers") v.count = count + 107;
    if (k === "statuses") v.features[2].attributes.source_count = count;
  }).options);
  const ids = Array.from({ length: count }, (_, i) => i + 1), inventory = () => observation("inventory", ohInventoryUrl(), { objectIdFieldName: "objectid", objectIds: [...ids].reverse() });
  return { schema_version: 1, transformation_version: OH_ACQUISITION_VERSION, started_at: clock, observed_at: clock, preflight_before: preflight, preflight_after: structuredClone(preflight), observations: [inventory(), ...ohBatches(ids).map((batch) => observation("features", ohFeatureUrl(batch), page(batch))), inventory()] };
}
test("Ohio offline replay conserves membership, selected native values and nullable point/ZIP evidence", async () => {
  const evidence = await fixture(205), original = structuredClone(evidence), result = replayOhChildcareAcquisition(evidence);
  assert.equal(result.features.length, 205); assert.deepEqual(result.features.map((r) => r.attributes.objectid), Array.from({ length: 205 }, (_, i) => i + 1));
  assert.equal(result.features[0].attributes.zip_code, "43215-0123"); assert.equal(result.features[1].attributes.zip_code, null);
  assert.equal(result.points[0].longitude, -83); assert.equal(result.points[1].reason, "source-geometry-missing");
  assert.equal(result.source.transport_bytes_verified, false); assert.equal(result.source.acquisition_authorized, false); assert.equal(result.source.export_authorized, false);
  assert.deepEqual(evidence, original); result.features[0].attributes.program_name = "changed"; assert.deepEqual(evidence, original);
  for (const o of evidence.observations.filter((o) => o.kind === "features")) {
    const url = new URL(o.url); assert.equal(url.searchParams.get("outFields"), OH_FIELDS.join(",")); assert.equal(url.searchParams.get("outSR"), "4326");
    assert.equal(url.searchParams.get("returnZ"), "false"); assert.equal(url.searchParams.get("returnM"), "false"); assert.ok(Buffer.byteLength(o.url) <= 2000);
  }
});
test("Ohio batches cap rows and encoded URLs; inventories reject invalid or incomplete membership", () => {
  const ids = Array.from({ length: 1000 }, (_, i) => Number.MAX_SAFE_INTEGER - 1000 + i), batches = ohBatches(ids);
  assert.deepEqual(batches.flat(), ids); assert.ok(batches.every((b) => b.length <= 100 && Buffer.byteLength(ohFeatureUrl(b)) <= 2000));
  for (const ids of [[], [2, 1], [1, 1], [0], [-1], [1.5], ["1"], [Number.MAX_SAFE_INTEGER + 1]]) assert.throws(() => ohBatches(ids), /Ohio/);
  for (const payload of [{ objectIdFieldName: "OBJECTID", objectIds: [1] }, { objectIdFieldName: "objectid", objectIds: [1, 1] }, { objectIdFieldName: "objectid", objectIds: [1], exceededTransferLimit: true }, { objectIdFieldName: "objectid", objectIds: [1], features: [] }]) assert.throws(() => ohInventory(payload, 1), /Ohio/);
});
test("Ohio replay rejects same-count replacement IDs, missing pages, duplicates and altered queries", async () => {
  const evidence = await fixture();
  for (const change of [
    (e) => { e.observations.at(-1).payload.objectIds[0] = 999; rehash(e.observations.at(-1)); },
    (e) => { for (const o of [e.observations[0], e.observations.at(-1)]) { o.payload.objectIds[0] = 999; rehash(o); } e.observations[1].url = ohFeatureUrl([1, 2, 999]); },
    (e) => { e.observations.splice(1, 1); },
    (e) => { e.observations[1].payload.features[0] = structuredClone(e.observations[1].payload.features[1]); rehash(e.observations[1]); },
    (e) => { e.observations[1].payload.features.pop(); rehash(e.observations[1]); },
    (e) => { e.observations[1].url += "&outFields=*"; },
    (e) => { e.observations[1].payload.exceededTransferLimit = true; rehash(e.observations[1]); },
  ]) { const e = structuredClone(evidence); change(e); assert.throws(() => replayOhChildcareAcquisition(e), /Ohio/); }
});
test("Ohio selected pages reject scope, private fields, nested schemas and coordinate-attribute substitutions", async () => {
  const e = await fixture();
  for (const change of [
    (p) => { p.features[0].attributes.phone_number = "PRIVATE"; },
    (p) => { p.features[0].attributes.program_type = "Family Child Care"; },
    (p) => { p.features[0].attributes.program_status = "Enforcement"; },
    (p) => { p.features[0].attributes.state = "PA"; },
    (p) => { p.features[0].attributes.program_name = { contact: "PRIVATE" }; },
    (p) => { p.features[0].attributes.zip_code = 43215; },
    (p) => { p.features[0].attributes.program_number = "1001"; },
    (p) => { p.features[0].attributes.program_number = Infinity; },
    (p) => { p.fields.find((f) => f.name === "program_number").length = { contact: "PRIVATE" }; },
    (p) => { p.fields.find((f) => f.name === "program_number").length = 4; },
    (p) => { p.fields[0].nullable = true; },
    (p) => { p.fields[0] = null; },
    (p) => { p.spatialReference = { wkid: 3857 }; },
    (p) => { delete p.spatialReference; },
    (p) => { p.features[0].attributes.geocode__latitude_ = 40; },
    (p) => { p.features[0].geometry = { rings: [] }; },
    (p) => { p.features[0].attributes.program_name = "x".repeat(8001); },
  ]) { const p = page([1, 2, 3]); change(p); assert.throws(() => ohFeatures(p, [1, 2, 3], e.preflight_before), (err) => /Ohio/.test(err.message) && !err.message.includes("PRIVATE")); }
  assert.throws(() => ohFeatures(page([1, 2]), [2, 1], e.preflight_before), /Ohio/);
});
test("Ohio batch rejection diagnostics distinguish structural gates without copying provider data", async () => {
  const e = await fixture();
  const cases = [
    [() => null, "batch envelope fields"],
    [(p) => ({ ...p, PRIVATE_CANARY: "PRIVATE_CANARY" }), "batch envelope fields"],
    [(p) => ({ ...p, geometryType: "PRIVATE_CANARY" }), "batch geometry type"],
    [(p) => ({ ...p, spatialReference: { wkid: "PRIVATE_CANARY" } }), "batch WGS84 CRS"],
    [(p) => ({ ...p, hasZ: true }), "batch extra dimensions"],
    [(p) => ({ ...p, hasM: "PRIVATE_CANARY" }), "batch extra dimensions"],
    [(p) => ({ ...p, exceededTransferLimit: "PRIVATE_CANARY" }), "batch transfer limit"],
    [(p) => ({ ...p, objectIdFieldName: "PRIVATE_CANARY" }), "batch object ID field"],
    [(p) => ({ ...p, displayFieldName: "PRIVATE_CANARY" }), "batch display field"],
    [(p) => ({ ...p, features: "PRIVATE_CANARY" }), "batch feature array"],
    [(p) => ({ ...p, features: [] }), "batch feature count"],
  ];
  for (const [change, reason] of cases) {
    assert.throws(() => ohFeatures(change(page([1])), [1], e.preflight_before), (error) => {
      assert.equal(error.message, `Ohio acquisition rejected: ${reason}.`);
      assert.ok(!JSON.stringify(error).includes("PRIVATE_CANARY"));
      return true;
    });
  }
  for (const displayFieldName of [undefined, "", "program_name"]) {
    assert.equal(ohFeatures({ ...page([1]), displayFieldName }, [1], e.preflight_before).length, 1);
  }
  assert.equal(ohFeatures({ ...page([1]), hasZ: false, hasM: false }, [1], e.preflight_before).length, 1);
});

test("Ohio acquisition preserves native Double anomalies for later normalization, not typed identifiers", async () => {
  const e = await fixture();
  for (const value of [null, 1.5, Number.MAX_SAFE_INTEGER + 1, -1]) {
    const p = page([1]); p.features[0].attributes.program_number = value; p.features[0].attributes.zip_code = "";
    const [result] = ohFeatures(p, [1], e.preflight_before); assert.equal(result.attributes.program_number, value); assert.equal(result.attributes.zip_code, "");
  }
});
test("Ohio WGS84 point validation distinguishes absence and plausibility from address verification", () => {
  for (const geometry of [undefined, null, { x: null }, { x: null, y: null }, { x: 0, y: 0 }, { x: 200, y: 40 }, { x: -120, y: 40 }]) assert.equal(ohPoint(geometry, { wkid: 4326 }).latitude, null);
  for (const geometry of [{ x: -83 }, { x: null, y: 40 }, { x: "-83", y: 40 }, { x: -83, y: NaN }, { x: -83, y: 40, z: 1 }, { x: -83, y: 40, spatialReference: { wkid: 3857 } }]) assert.throws(() => ohPoint(geometry, { wkid: 4326 }), /Ohio/);
  assert.throws(() => ohPoint(null, { wkid: 4326, latestWkid: 3857 }), /Ohio/);
  assert.match(ohPoint({ x: -83, y: 40 }, { wkid: 4326 }).reason, /not-address-verified/);
});
test("Ohio replay validates evidence hashes, chronology, byte budgets and cancellation", async () => {
  const evidence = await fixture();
  for (const change of [
    (e) => { e.observations[1].payload_sha256 = "0".repeat(64); },
    (e) => { e.observations[1].observed_at = "2000-01-01T00:00:00.000Z"; },
    (e) => { e.observations[1].observed_at = "2027-01-01T00:00:00.000Z"; },
    (e) => { e.observations[1].response_bytes = 8_000_001; },
    (e) => { e.observations[1].response_bytes = 0; },
    (e) => { e.observations[1].payload.extra = "x".repeat(8_000_001); rehash(e.observations[1]); },
    (e) => { e.acquisition_authorized = true; },
    (e) => { e.preflight_after.acquisition.acquisition_authorized = true; },
    (e) => { for (const o of e.preflight_after.observations.filter((o) => o.kind === "item")) { o.payload.licenseInfo += " changed"; rehash(o); } },
  ]) { const e = structuredClone(evidence); change(e); assert.throws(() => replayOhChildcareAcquisition(e), /Ohio/); }
  const large = await fixture(1200); for (const o of large.observations) o.response_bytes = 8_000_000;
  assert.throws(() => replayOhChildcareAcquisition(large), /cumulative bytes/);
  const controller = new AbortController(); controller.abort(); assert.throws(() => replayOhChildcareAcquisition(evidence, { signal: controller.signal }), { name: "AbortError" });
  let checks = 0; assert.throws(() => replayOhChildcareAcquisition(evidence, { signal: { throwIfAborted() { if (++checks === 3) throw new Error("cancelled mid replay"); } } }), /cancelled mid replay/);
});
