import { createHash } from "node:crypto";
import { OH_FIELDS, preflightOhChildcare } from "../oh-childcare-preflight.mjs";
import { ohioFixture, ohioPayload } from "./oh-childcare.mjs";
import { OH_ACQUISITION_VERSION, ohInventoryUrl, ohFeatureUrl, ohBatches } from "../oh-childcare-acquisition.mjs";

// Entirely synthetic source records. Not production source authentication or notice evidence.
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const clock = "2026-09-08T05:00:00.000Z";
const observation = (kind, url, payload) => ({ kind, url, observed_at: clock, payload, payload_sha256: hash(payload), response_bytes: Buffer.byteLength(JSON.stringify(payload)) });
export const rehash = (e) => { for (const o of e.observations) o.payload_sha256 = hash(o.payload); };
export function feature(id) {
  return { attributes: { objectid: id, county: "Synthetic county", program_type: "Child Care Center", program_number: 1000 + id, program_name: `Synthetic center ${id}`, street_address: "1 Synthetic St", city: "Synthetic", state: "OH", zip_code: id === 1 ? "43215-0123" : null, program_status: "Open" }, geometry: id === 1 ? { x: -83, y: 40 } : null };
}
function page(ids) { return { objectIdFieldName: "objectid", geometryType: "esriGeometryPoint", spatialReference: { wkid: 4326 }, fields: ohioPayload("layer").fields.filter((f) => OH_FIELDS.includes(f.name)), features: [...ids].reverse().map(feature), exceededTransferLimit: false }; }
export async function evidence(count = 3) {
  const preflight = await preflightOhChildcare(ohioFixture((v, k) => {
    if (k === "selected") v.count = count;
    if (k === "centers") v.count = count + 107;
    if (k === "statuses") v.features[2].attributes.source_count = count;
  }).options);
  const ids = Array.from({ length: count }, (_, i) => i + 1), inventory = () => observation("inventory", ohInventoryUrl(), { objectIdFieldName: "objectid", objectIds: [...ids].reverse() });
  return { schema_version: 1, transformation_version: OH_ACQUISITION_VERSION, started_at: clock, observed_at: clock, preflight_before: preflight, preflight_after: structuredClone(preflight), observations: [inventory(), ...ohBatches(ids).map((batch) => observation("features", ohFeatureUrl(batch), page(batch))), inventory()] };
}
