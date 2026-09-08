import test from "node:test";
import assert from "node:assert/strict";
import { WI_FIELDS } from "./wi-childcare-preflight.mjs";
import { wiFeatureUrl, wiInventory, wiBatches, wiPoint, wiFeatures, replayWiChildcareAcquisition, validateWiSourcePolicy } from "./wi-childcare-acquisition.mjs";

import { batch, evidence, rehash } from "./fixtures/wi-childcare-acquisition.mjs";
test("WI replay conserves exact IDs, original fields, nullable points and separate source ZIP evidence", async () => {
  const e = await evidence(), result = replayWiChildcareAcquisition(e);
  assert.deepEqual(result.features.map((v) => v.attributes.OBJECTID), [1, 2]);
  assert.equal(result.features[0].attributes.ProvderNumber, "0001");
  assert.equal(result.features[0].attributes.ZipCode, "53703-1234");
  assert.equal(result.features[1].attributes.ZipCode, null);
  assert.equal(result.points[1].reason, "source-geometry-missing");
  assert.equal(result.source.acquisition_authorized, false);
  assert.equal(result.source.export_authorized, false);
  result.features[0].attributes.FacilityName = "changed";
  assert.notEqual(e.observations[1].payload.features[1].attributes.FacilityName, "changed");
});
test("WI requests only selected group fields, no contacts/attributes-as-coordinates or precision reduction", () => {
  const url = new URL(wiFeatureUrl([1, 2]));
  assert.equal(url.searchParams.get("outFields"), WI_FIELDS.join(","));
  assert.equal(url.searchParams.get("outSR"), "4326");
  assert.equal(url.searchParams.get("returnZ"), "false"); assert.equal(url.searchParams.get("returnM"), "false");
  for (const key of ["geometryPrecision", "maxAllowableOffset", "quantizationParameters", "datumTransformation"]) assert.equal(url.searchParams.has(key), false);
  assert.equal(url.searchParams.get("where"), "CategoryType='LICENSED GROUP'");
});
test("WI packs sorted IDs within count and URL ceilings and rejects invalid rosters", () => {
  const ids = Array.from({ length: 301 }, (_, i) => Number.MAX_SAFE_INTEGER - 400 + i);
  const batches = wiBatches(ids);
  assert.deepEqual(batches.flat(), ids);
  assert.ok(batches.every((b) => b.length <= 100 && Buffer.byteLength(wiFeatureUrl(b)) <= 2000));
  for (const invalid of [[], [2, 1], [1, 1], [0], [1.5], ["1"]]) assert.throws(() => wiBatches(invalid));
  for (const objectIds of [[1], [1, 1], [1, "2"], [1, 2, 3]]) assert.throws(() => wiInventory({ objectIdFieldName: "OBJECTID", objectIds }, 2));
});
test("WI exact replay rejects missing, duplicate, substituted IDs, truncation and private fields", async () => {
  const original = await evidence();
  const changes = [
    (e) => e.observations[1].payload.features.pop(),
    (e) => { e.observations[1].payload.features[0].attributes.OBJECTID = 1; },
    (e) => { e.observations.at(-1).payload.objectIds = [1, 3]; },
    (e) => { e.observations[1].payload.exceededTransferLimit = true; },
    (e) => { e.observations[1].payload.exceededTransferLimit = "false"; },
    (e) => { e.observations[1].payload.features[0].attributes.LocationContactFullName = "PRIVATE"; },
    (e) => { e.observations[1].payload.features[0].attributes.CategoryType = "LICENSED FAMILY"; },
    (e) => { e.observations[1].payload.features[0].attributes.State = "MI"; },
    (e) => { e.observations[1].payload.features[0].attributes.ProvderNumber = 1; },
    (e) => { e.observations[1].url += "&outFields=*"; },
    (e) => { e.observations[1].payload.features[0].secret = "PRIVATE"; },
  ];
  for (const change of changes) { const e = structuredClone(original); change(e); rehash(e); assert.throws(() => replayWiChildcareAcquisition(e)); }
});
test("WI replay rejects CRS conflicts, polygon geometry, metadata drift, clocks and forged hashes", async () => {
  const original = await evidence();
  for (const change of [
    (e) => { e.observations[1].payload.spatialReference.wkid = 3857; },
    (e) => { e.observations[1].payload.spatialReference.latestWkid = 3857; },
    (e) => { e.observations[1].payload.geometryType = "esriGeometryPolygon"; },
    (e) => { e.observations[1].payload.features[1].geometry.spatialReference = { wkid: 3857 }; },
    (e) => { e.observations[1].payload.features[1].geometry.rings = []; },
    (e) => { e.observations[1].observed_at = "2020-01-01T00:00:00.000Z"; },
    (e) => { e.preflight_after.source.source_record_count = 3; },
  ]) { const e = structuredClone(original); change(e); rehash(e); assert.throws(() => replayWiChildcareAcquisition(e)); }
  original.observations[1].payload_sha256 = "0".repeat(64); assert.throws(() => replayWiChildcareAcquisition(original), /observation/);
});
test("WI nullable and anomalous point pairs never coerce strings, nulls or partial values", () => {
  const sr = { wkid: 4326 };
  assert.equal(wiPoint(null, sr).reason, "source-geometry-missing");
  assert.equal(wiPoint({ x: null }, sr).reason, "source-point-empty");
  assert.equal(wiPoint({ x: null, y: null }, sr).reason, "source-point-empty");
  assert.equal(wiPoint({ x: 0, y: 0 }, sr).latitude, null);
  assert.equal(wiPoint({ x: 999, y: 43 }, sr).reason, "source-point-out-of-geographic-range");
  assert.equal(wiPoint({ x: -89, y: 43 }, sr).longitude, -89);
  assert.equal(wiPoint({ x: -120, y: 43 }, sr).reason, "source-point-outside-wisconsin-plausibility-envelope");
  for (const point of [{ x: null, y: 43 }, { x: 2 }, { x: "-89", y: 43 }, { x: 2, y: Infinity }, { x: 2, y: NaN }, { x: 2, y: 43, z: 1 }]) assert.throws(() => wiPoint(point, sr));
  assert.throws(() => wiPoint(null, {}), /CRS/);
});
test("WI optional returned schema rejects unselected or mismatched fields", async () => {
  const e = await evidence(), p = batch([1, 2]);
  p.fields = structuredClone(e.preflight_before.observations.find((v) => v.kind === "layer").payload.fields.filter((f) => WI_FIELDS.includes(f.name)));
  wiFeatures(p, [1, 2], e.preflight_before);
  for (const changed of [{ domain: "changed-domain" }, { defaultValue: "unexpected" }, { nullable: "true" }, { alias: 5 }]) {
    const altered = structuredClone(p); Object.assign(altered.fields[0], changed);
    assert.throws(() => wiFeatures(altered, [1, 2], e.preflight_before), /schema/);
  }
  p.fields[0].length = 999; assert.throws(() => wiFeatures(p, [1, 2], e.preflight_before), /schema/);
});
test("WI development policy is not acquisition approval and synthetic notices cannot impersonate reviewed terms", async () => {
  const e = await evidence(); assert.throws(() => validateWiSourcePolicy(e.preflight_before), /terms changed/);
  assert.throws(() => replayWiChildcareAcquisition(e, { signal: AbortSignal.abort() }), { name: "AbortError" });
  const mutated = structuredClone(e); mutated.observations[1].response_bytes = 8_000_001;
  assert.throws(() => replayWiChildcareAcquisition(mutated), /observation/);
  const claimed = structuredClone(e); for (const o of claimed.observations) o.response_bytes = 1;
  const result = replayWiChildcareAcquisition(claimed);
  assert.equal(result.source.reported_successful_response_bytes, 3);
  assert.equal(result.source.transport_bytes_verified, false);
  assert.ok(result.source.serialized_payload_bytes > 3);
});
