import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildZctaJurisdictionCrosswalk,
  overlayZctaFeature,
  verifyZctaJurisdictionCrosswalkRelease,
} from "./zcta-jurisdiction-crosswalk.mjs";

function polygon(properties, west, south, east, north) {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]],
    },
  };
}

function countySearchRecord(feature) {
  const geoid = feature.properties.GEOID;
  return {
    geoid,
    stateFips: feature.properties.STATE,
    countyFips: feature.properties.COUNTY,
    name: feature.properties.NAME,
    geometry: feature.geometry,
  };
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

async function writeGeoJson(filePath, features) {
  const content = json({ type: "FeatureCollection", features });
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return {
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

test("calculates normalized weights for a ZCTA crossing county and state boundaries", () => {
  const left = polygon({ GEOID: "01001", STATE: "01", COUNTY: "001", NAME: "Left" }, -90, 30, -89, 31);
  const right = polygon({ GEOID: "02001", STATE: "02", COUNTY: "001", NAME: "Right" }, -89, 30, -88, 31);
  const zcta = polygon({ GEOID: "12345", ZCTA5: "12345" }, -90, 30, -88, 31);
  const result = overlayZctaFeature(zcta, {
    search: () => [countySearchRecord(left), countySearchRecord(right)],
  });

  assert.equal(result.relationships.length, 2);
  assert.equal(result.summary.county_equivalent_count, 2);
  assert.equal(result.summary.state_equivalent_count, 2);
  assert.equal(result.summary.has_multiple_county_topological_intersections, true);
  assert.equal(result.summary.has_multiple_state_topological_intersections, true);
  assert.equal(result.summary.crosses_county_boundary_materially, true);
  assert.equal(result.summary.crosses_state_boundary_materially, true);
  assert.equal(result.summary.overlay_status, "complete-within-tolerance");
  assert.ok(Math.abs(result.relationships[0].normalized_share_of_matched_zcta_area - 0.5) < 1e-9);
  assert.ok(Math.abs(result.relationships[1].normalized_share_of_matched_zcta_area - 0.5) < 1e-9);
  assert.equal(result.relationships[0].allocation_semantics, "polygon-area-only-not-business-location");
  assert.equal(result.relationships[0].material_intersection, true);
});

test("retains generalized boundary slivers without classifying them as material crossings", () => {
  const main = polygon({ GEOID: "01001", STATE: "01", COUNTY: "001", NAME: "Main" }, -90, 30, -88.0002, 31);
  const sliver = polygon({ GEOID: "02001", STATE: "02", COUNTY: "001", NAME: "Sliver" }, -88.0002, 30, -88, 31);
  const zcta = polygon({ GEOID: "12345", ZCTA5: "12345" }, -90, 30, -88, 31);
  const result = overlayZctaFeature(zcta, {
    search: () => [countySearchRecord(main), countySearchRecord(sliver)],
  });

  assert.equal(result.relationships.length, 2);
  assert.equal(result.summary.has_multiple_state_topological_intersections, true);
  assert.equal(result.summary.crosses_state_boundary_materially, false);
  assert.equal(result.relationships.find((row) => row.county_name === "Sliver").material_intersection, false);
});

test("publishes and verifies a versioned crosswalk release", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-zcta-crosswalk-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const geographyRoot = path.join(root, "geography");
  const geographyRelease = path.join(geographyRoot, "releases", "geography-fixture");
  const stateFeature = polygon({ GEOID: "01", STUSAB: "AA", NAME: "Fixture State" }, -90, 30, -88, 31);
  const countyFeatures = [
    polygon({ GEOID: "01001", STATE: "01", COUNTY: "001", NAME: "Left" }, -90, 30, -89, 31),
    polygon({ GEOID: "01003", STATE: "01", COUNTY: "003", NAME: "Right" }, -89, 30, -88, 31),
  ];
  const zctaFeatures = [polygon({ GEOID: "12345", ZCTA5: "12345" }, -90, 30, -88, 31)];
  const artifactSpecs = [
    ["source/states.geojson", "state", [stateFeature]],
    ["source/counties/state=01.geojson", "county", countyFeatures],
    ["source/zctas/prefix=1.geojson", "zcta", zctaFeatures],
  ];
  const artifacts = [];
  for (const [relativePath, geographyType, features] of artifactSpecs) {
    const metadata = await writeGeoJson(path.join(geographyRelease, relativePath), features);
    artifacts.push({ path: relativePath, geography_type: geographyType, feature_count: features.length, ...metadata });
  }
  const geographyManifest = {
    dataset_id: "us-census-geography",
    release_id: "geography-fixture",
    status: "published",
    complete_national_release: true,
    coordinate_reference_system: "EPSG:4326",
    geometry: { generalization_method: "fixture" },
    coverage: { states: 1, counties: 2, zctas: 1 },
    artifacts,
  };
  await writeFile(path.join(geographyRelease, "manifest.json"), json(geographyManifest));
  await writeFile(path.join(geographyRoot, "current.json"), json({
    dataset_id: "us-census-geography",
    release_id: "geography-fixture",
    manifest: "releases/geography-fixture/manifest.json",
  }));

  const outputRoot = path.join(root, "crosswalk");
  const result = await buildZctaJurisdictionCrosswalk({
    geographyPointerPath: path.join(geographyRoot, "current.json"),
    outputRoot,
    now: () => new Date("2026-08-30T12:00:00.000Z"),
    logger: () => {},
  });
  const verification = await verifyZctaJurisdictionCrosswalkRelease(
    path.join(result.releaseDirectory, "manifest.json"),
  );
  assert.equal(verification.coverage.zctas, 1);
  assert.equal(verification.coverage.county_equivalents, 2);
  assert.equal(verification.coverage.state_equivalents, 1);
  assert.equal(verification.coverage.zcta_county_relationships, 2);
  assert.equal(verification.coverage.zctas_crossing_county_boundaries_materially, 1);
  const pointer = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(pointer.release_id, result.manifest.release_id);
});
