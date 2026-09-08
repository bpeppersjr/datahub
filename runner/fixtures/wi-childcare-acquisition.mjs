import { createHash } from "node:crypto";
import { fixture } from "./wi-childcare.mjs";
import { preflightWiChildcare } from "../wi-childcare-preflight.mjs";
import { WI_ACQUISITION_VERSION, wiInventoryUrl, wiFeatureUrl } from "../wi-childcare-acquisition.mjs";
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function feature(id) {
  return { attributes: { OBJECTID: id, ProvderNumber: "0001", LocationNumber: "01", FacilityNumber: "000101", FacilityName: "Synthetic Center ", LocationLineAddress1: "1 Fixture Street", LocationLineAddress2: null, City: "Fixture ", State: "WI ", ZipCode: id === 2 ? null : "53703-1234", CategoryType: "LICENSED GROUP", Capacity: 20 }, geometry: id === 2 ? null : { x: -89.4, y: 43.1 } };
}
export function batch(ids) { return { geometryType: "esriGeometryPoint", spatialReference: { wkid: 4326 }, features: ids.map(feature) }; }
export async function evidence() {
  const f = fixture((v) => { if (v.count) v.count = 2; });
  const before = await preflightWiChildcare(f.options), after = structuredClone(before);
  const observe = (kind, url, payload) => ({ kind, url, observed_at: before.finished_at, payload, payload_sha256: hash(payload), response_bytes: Buffer.byteLength(JSON.stringify(payload)) });
  const inventory = { objectIdFieldName: "OBJECTID", objectIds: [2, 1] };
  return { schema_version: 1, transformation_version: WI_ACQUISITION_VERSION, started_at: before.started_at, observed_at: after.finished_at, preflight_before: before, preflight_after: after,
    observations: [observe("inventory", wiInventoryUrl(), inventory), observe("features", wiFeatureUrl([1, 2]), batch([2, 1])), observe("inventory", wiInventoryUrl(), structuredClone(inventory))] };
}
export function rehash(e) { for (const o of e.observations) { o.payload_sha256 = hash(o.payload); o.response_bytes = Buffer.byteLength(JSON.stringify(o.payload)); } }
