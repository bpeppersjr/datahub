import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  BUSINESS_LOCATION_PROFILE_VERSION,
  LEGACY_PROFILE_REGISTRY_BINDING,
  LEGACY_PROFILE_VERSION,
  normalizeBusinessLocationProfile,
  validateLegacyGeometryAssertion,
} from "./business-location-profile-contract.mjs";

function profile(version = BUSINESS_LOCATION_PROFILE_VERSION, location = undefined) {
  const matchKey = "street|1 MAIN ST||EXAMPLE|NY|00501";
  const value = {
    schema_version: "1.0.0",
    profile_version: version,
    profile_id: "location-profile:0123456789abcdef0123456789abcdef",
    zip_code: "00501",
    site_entity_id: "site:sample-1",
    establishment_entity_id: "establishment:sample-1",
    organization_entity_id: null,
    address: { zip_code: "00501", postal_code: "00501", zip4: "0042", street: "1 Main St", unit_or_additional: null, city: "Example", state: "NY", county_name: null },
    normalized_address: { kind: "street", street: "1 MAIN ST", unit: null, city: "EXAMPLE", state: "NY", zip_code: "00501", complete: true, match_key: matchKey },
    address_match_key_sha256: createHash("sha256").update(matchKey).digest("hex"),
    names: [],
    primary_name_match_key_sha256: null,
    external_identifiers: [],
    source_status: null,
    observed_at: "2026-09-01T00:00:00.000Z",
    source: { source_id: "source-a", source_release_id: "release-a", source_record_id: "row-a", ingest_run_id: "run-a", transformation_version: "transform@1.0.0", policy_id: "policy-a" },
    export_policy: "public",
  };
  if (version === LEGACY_PROFILE_VERSION) value.location = location;
  else value.geocode = location;
  return value;
}

const binding = LEGACY_PROFILE_REGISTRY_BINDING;

test("v1.1 normalized profile keeps exact ZIP5, identical postal_code, separate ZIP4, and geocode", () => {
  const input = profile(BUSINESS_LOCATION_PROFILE_VERSION, { latitude: 41.2, longitude: -73.4 });
  const normalized = normalizeBusinessLocationProfile(input);
  assert.equal(normalized.profile_version, BUSINESS_LOCATION_PROFILE_VERSION);
  assert.deepEqual(normalized.geocode, { latitude: 41.2, longitude: -73.4 });
  assert.equal(normalized.address.zip_code, "00501");
  assert.equal(normalized.address.postal_code, "00501");
  assert.equal(normalized.address.zip4, "0042");
  assert.equal(Object.hasOwn(normalized, "location"), false);
});

test("legacy Point compatibility is bound to the exact retained registry and maps [longitude, latitude]", () => {
  const legacy = profile(LEGACY_PROFILE_VERSION, { type: "Point", coordinates: [-93, 41], coordinate_reference_system: "EPSG:4326" });
  const before = structuredClone(legacy);
  assert.throws(() => normalizeBusinessLocationProfile(legacy), /exact retained registry release/);
  const normalized = normalizeBusinessLocationProfile(legacy, binding);
  assert.deepEqual(normalized.geocode, { latitude: 41, longitude: -93 });
  assert.deepEqual(legacy, before, "compatibility projection must not mutate immutable legacy rows");
  assert.equal(Object.hasOwn(normalized, "location"), false);
});

test("legacy explicit latitude/longitude and nulls normalize without fabricating coordinates", () => {
  assert.deepEqual(normalizeBusinessLocationProfile(profile(LEGACY_PROFILE_VERSION, { latitude: 41, longitude: -93 }), binding).geocode, { latitude: 41, longitude: -93 });
  assert.equal(normalizeBusinessLocationProfile(profile(LEGACY_PROFILE_VERSION, null), binding).geocode, null);
  assert.equal(normalizeBusinessLocationProfile(profile(LEGACY_PROFILE_VERSION, { latitude: null, longitude: null }), binding).geocode, null);
});

test("retains grouped source-record lineage exactly while rejecting malformed lineage keys", () => {
  const legacy = profile(LEGACY_PROFILE_VERSION, null);
  legacy.source.source_record_ids = ["row-a", "row-b"];
  const normalized = normalizeBusinessLocationProfile(legacy, binding);
  assert.deepEqual(normalized.source.source_record_ids, ["row-a", "row-b"]);
  const duplicate = structuredClone(legacy); duplicate.source.source_record_ids = ["row-a", "row-a"];
  assert.throws(() => normalizeBusinessLocationProfile(duplicate, binding), /source-record lineage/);
  const unknown = structuredClone(legacy); unknown.source.raw_coordinate = "not allowed";
  assert.throws(() => normalizeBusinessLocationProfile(unknown, binding), /source lineage/);
});

test("rejects combined ZIP+4, mismatched postal fields, polygons, unknown keys, and invalid or incomplete coordinate pairs", () => {
  const badPostal = profile(); badPostal.address.postal_code = "00501-0042";
  const mismatched = profile(); mismatched.address.postal_code = "00502";
  const unknown = profile(); unknown.address.geometry = { type: "Polygon" };
  const extraProfileKey = profile(); extraProfileKey.geometry = { type: "Polygon" };
  const futureGeometry = profile(BUSINESS_LOCATION_PROFILE_VERSION, { type: "Point", coordinates: [-93, 41] });
  const partial = profile(BUSINESS_LOCATION_PROFILE_VERSION, { latitude: 41, longitude: null });
  const outOfRange = profile(BUSINESS_LOCATION_PROFILE_VERSION, { latitude: 91, longitude: -93 });
  const invalidLegacy = profile(LEGACY_PROFILE_VERSION, { type: "Point", coordinates: [181, 41], coordinate_reference_system: "EPSG:4326" });
  const reversedAmbiguous = profile(LEGACY_PROFILE_VERSION, { type: "Point", coordinates: [41, -93], coordinate_reference_system: "EPSG:4326" });
  for (const [row, sourceBinding] of [[badPostal], [mismatched], [unknown], [extraProfileKey], [futureGeometry], [partial], [outOfRange], [invalidLegacy, binding], [reversedAmbiguous, binding]]) {
    assert.throws(() => normalizeBusinessLocationProfile(row, sourceBinding));
  }
});

test("legacy compatibility refuses a different registry release or manifest digest", () => {
  const legacy = profile(LEGACY_PROFILE_VERSION, null);
  assert.throws(() => normalizeBusinessLocationProfile(legacy, { ...binding, manifest_sha256: "0".repeat(64) }), /exact retained registry release/);
  assert.throws(() => normalizeBusinessLocationProfile(legacy, { ...binding, release_id: "other" }), /exact retained registry release/);
});

test("legacy assertion geometry is point-only and bound to the exact immutable registry", () => {
  assert.deepEqual(validateLegacyGeometryAssertion({ type: "Point", coordinates: [-73.4, 41.2], coordinate_reference_system: "EPSG:4326" }, binding), { latitude: 41.2, longitude: -73.4 });
  assert.equal(validateLegacyGeometryAssertion(null, binding), null);
  assert.throws(() => validateLegacyGeometryAssertion({ type: "Polygon", coordinates: [] }, binding), /Coordinate evidence/);
  assert.throws(() => validateLegacyGeometryAssertion({ type: "Point", coordinates: [-73.4, 41.2] }, binding), /EPSG:4326 point/);
  assert.throws(() => validateLegacyGeometryAssertion({ latitude: 41.2, longitude: -73.4, polygon: [] }, binding), /Coordinate evidence/);
  assert.throws(() => validateLegacyGeometryAssertion(null, { ...binding, manifest_sha256: "0".repeat(64) }), /exact retained registry/);
});

test("the same closed profile contract covers fifteen retained source representations", () => {
  const sources = [
    "usda-snap-current-retailers", "cms-nppes-monthly-v2", "fdic-bankfind-current-structure", "ncua-final-quarterly-call-report",
    "usda-fsis-active-mpi-directory", "epa-echo-exporter-active-facility", "fmcsa-company-census-active-us-principal-office",
    "irs-eo-bmf-organizations", "ct-business-registry-active-organizations", "de-business-licenses-current",
    "alaska-dcced-active-business-licenses", "co-business-registry-good-standing-or-delinquent-organizations",
    "wa-lni-active-contractor-organizations", "or-business-registry-active-registrations", "ia-business-registry-active-entities",
  ];
  for (const [index, sourceId] of sources.entries()) {
    const legacyLocation = index % 2
      ? { latitude: 35 + index / 100, longitude: -100 - index / 100 }
      : { type: "Point", coordinates: [-100 - index / 100, 35 + index / 100], coordinate_reference_system: "EPSG:4326" };
    const legacy = profile(LEGACY_PROFILE_VERSION, legacyLocation);
    legacy.profile_id = `location-profile:${index.toString(16).padStart(32, "0")}`;
    legacy.source.source_id = sourceId;
    legacy.source.source_release_id = `${sourceId}-retained`;
    legacy.source.source_record_id = `record-${index}`;
    const before = structuredClone(legacy);
    const normalized = normalizeBusinessLocationProfile(legacy, binding);
    assert.deepEqual(normalized.geocode, { latitude: 35 + index / 100, longitude: -100 - index / 100 }, sourceId);
    assert.equal(normalized.source.source_id, sourceId);
    assert.deepEqual(legacy, before, `${sourceId} legacy bytes must remain unchanged`);
  }
});
