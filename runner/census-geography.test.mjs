import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyStateEquivalent,
  createNationFeature,
  geometryBounds,
  normalizeFeatureIndex,
} from "./census-geography.mjs";

function polygonFeature(properties, west = -90, south = 30, east = -89, north = 31) {
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

test("classifies states, D.C., and territories", () => {
  assert.equal(classifyStateEquivalent("IL"), "state");
  assert.equal(classifyStateEquivalent("DC"), "district");
  assert.equal(classifyStateEquivalent("PR"), "territory");
});

test("calculates bounds for polygon and multipolygon geometry", () => {
  assert.deepEqual(geometryBounds(polygonFeature({}).geometry), [-90, 30, -89, 31]);
  assert.deepEqual(geometryBounds({
    type: "MultiPolygon",
    coordinates: [
      polygonFeature({}, -120, 40, -119, 41).geometry.coordinates,
      polygonFeature({}, -80, 20, -79, 21).geometry.coordinates,
    ],
  }), [-120, 20, -79, 41]);
});

test("normalizes a ZCTA without assigning it to a state", () => {
  const feature = polygonFeature({
    GEOID: "00501",
    ZCTA5: "00501",
    NAME: "ZCTA5 00501",
    AREALAND: "12345",
    AREAWATER: "67",
    CENTLON: "-072.6200000",
    CENTLAT: "+40.8100000",
    INTPTLON: "-072.6100000",
    INTPTLAT: "+40.8200000",
    OBJECTID: 42,
  });
  const record = normalizeFeatureIndex(feature, "zcta", "source/zctas/prefix=0.geojson");
  assert.equal(record.geo_id, "zcta:00501");
  assert.equal(record.state_fips, null);
  assert.equal(record.area_land_m2, 12345);
  assert.deepEqual(record.centroid, [-72.62, 40.81]);
});

test("builds separate nationwide polygons for all areas and 50 states plus D.C.", () => {
  const features = [
    polygonFeature({ GEOID: "17", STUSAB: "IL" }),
    polygonFeature({ GEOID: "11", STUSAB: "DC" }, -77.1, 38.8, -76.9, 39),
    polygonFeature({ GEOID: "72", STUSAB: "PR" }, -67.3, 17.8, -65.2, 18.6),
  ];
  const allAreas = createNationFeature(features, "all-census-us-areas");
  const statesAndDc = createNationFeature(features, "50-states-and-dc");
  assert.equal(allAreas.properties.state_equivalent_count, 3);
  assert.equal(statesAndDc.properties.state_equivalent_count, 2);
  assert.equal(statesAndDc.geometry.type, "MultiPolygon");
  assert.equal(statesAndDc.geometry.coordinates.length, 2);
});
