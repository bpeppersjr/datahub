import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapZipCoverage, normalizeSnapFeature } from "./usda-snap-retailers.mjs";

const feature = {
  attributes: {
    Record_ID: 1687910,
    Store_Name: "Fab Farms",
    Store_Street_Address: "12 S Main St",
    Additonal_Address: null,
    City: "Natick",
    State: "MA",
    Zip_Code: "01760",
    Zip4: "4944",
    County: "MIDDLESEX",
    Store_Type: "Farmers and Markets",
    Latitude: 42.283337,
    Longitude: -71.346771,
    Incentive_Program: "Healthy Incentives Program",
    Grantee_Name: "Example Grantee",
    ObjectId: 1,
  },
  geometry: { x: -71.346771, y: 42.283337 },
};

const context = {
  runId: "fixture-run",
  retrievedAt: "2026-08-30T15:00:00.000Z",
  sourceUpdatedAt: "2026-08-19T17:40:09.953Z",
  sourceReleaseId: "usda-snap-20260819T174009953Z",
  zipCoverage: {
    geography: {
      status: "2020-zcta-polygon-available",
      geo_id: "zcta:01760",
      geoid: "01760",
      geometry_file: "source/zctas/prefix=0.geojson",
    },
  },
};

test("normalizes a SNAP retailer as a source-anchored site and establishment candidate", () => {
  const record = normalizeSnapFeature(feature, context);
  assert.equal(record.normalized_record_id, "usda-snap:1687910");
  assert.equal(record.entity_candidates.physical_site_id, "site:usda_snap_1687910");
  assert.equal(record.address.postal_code, "01760");
  assert.equal(record.address.zip4, "4944");
  assert.deepEqual(record.location.coordinates, [-71.346771, 42.283337]);
  assert.equal(record.operating_status.value, "snap-authorized-as-of-source-update");
  assert.match(record.operating_status.scope, /not a general operating-status guarantee/);
  assert.equal(record.geography.zcta_geo_id, "zcta:01760");
  assert.equal(record.provenance.source_record_id, "1687910");
  assert.equal(record.field_lineage.name, "Store_Name");
});

test("rejects malformed retailer geography instead of guessing", () => {
  assert.throws(
    () => normalizeSnapFeature({ ...feature, attributes: { ...feature.attributes, Zip_Code: "1760X" } }, context),
    /missing-or-invalid-zip/,
  );
  assert.throws(
    () => normalizeSnapFeature({ ...feature, attributes: { ...feature.attributes, Latitude: null }, geometry: null }, context),
    /missing-or-invalid-latitude/,
  );
});

test("builds SNAP coverage over the baseline union without claiming general business absence", () => {
  const baseline = [
    {
      zip_code: "01760",
      coverage_status: "zbp-and-zcta",
      current_usps_validity: { status: "unverified" },
      geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:01760" },
      employer_baseline: { status: "published", establishments: 100 },
    },
    {
      zip_code: "60601",
      coverage_status: "zbp-and-zcta",
      current_usps_validity: { status: "unverified" },
      geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601" },
      employer_baseline: { status: "published", establishments: 1000 },
    },
  ];
  const rows = buildSnapZipCoverage(new Map([["01760", 3]]), baseline, {
    runId: "fixture-run",
    sourceReleaseId: "fixture-release",
    sourceUpdatedAt: "2026-08-19T17:40:09.953Z",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].snap_retailer_snapshot.retailer_count, 3);
  assert.equal(rows[1].snap_retailer_snapshot.status, "no-retailer-in-source-snapshot");
  assert.equal(rows[1].current_usps_validity.status, "unverified");
});
