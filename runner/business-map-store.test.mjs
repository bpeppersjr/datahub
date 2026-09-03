import assert from "node:assert/strict";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBusinessMapStore } from "./business-map-store.mjs";

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function polygon(west, south, east, north) {
  return { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
}

async function fixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-business-map-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const coverageRoot = path.join(root, "coverage");
  const geographyRoot = path.join(root, "geography");
  const registryRoot = path.join(root, "registry");
  const coverageRelease = path.join(coverageRoot, "releases", "coverage-1");
  const geographyRelease = path.join(geographyRoot, "releases", "geography-1");
  const registryRelease = path.join(registryRoot, "releases", "registry-1");
  await Promise.all([
    mkdir(path.join(coverageRelease, "views"), { recursive: true }),
    mkdir(path.join(geographyRelease, "source", "counties"), { recursive: true }),
    mkdir(path.join(geographyRelease, "source", "zctas"), { recursive: true }),
    mkdir(path.join(geographyRelease, "derived", "index"), { recursive: true }),
    mkdir(path.join(registryRelease, "resolution", "location-profiles"), { recursive: true }),
  ]);

  const baseCoverage = {
    schema_version: "1.0.0",
    view_type: "zip",
    registry_coverage: {
      complete_all_businesses: false,
      physical_site_count: 0,
      establishment_count: 0,
      organization_primary_location_count: 0,
      snap_authorization_evidence_count: 0,
      nppes_primary_practice_location_count: 0,
      nppes_non_primary_practice_location_count: 0,
      fdic_current_location_count: 0,
      ncua_reported_us_location_count: 0,
      fsis_active_establishment_count: 0,
      epa_echo_active_facility_count: 0,
      fmcsa_active_registration_principal_office_count: 0,
      irs_eo_organization_filing_address_count: 0,
      ct_business_registry_organization_reported_business_address_count: 0,
      de_business_license_organization_reported_business_address_count: 0,
      ak_active_business_license_provisional_physical_site_count: 0,
      co_business_registry_organization_principal_office_address_count: 0,
      wa_lni_active_contractor_organization_mailing_address_count: 0,
      or_business_registry_active_registration_principal_place_address_count: 0,
      ia_business_registry_organization_home_office_address_count: 0,
      ny_business_registry_organization_reported_location_address_count: 0,
      fl_business_registry_organization_reported_principal_address_count: 0,
      pa_business_registry_organization_reported_business_address_count: 0,
      la_active_business_registered_location_count: 0,
      tx_active_sales_tax_permitted_outlet_count: 0,
      chicago_active_business_license_site_count: 0,
      dc_basic_business_license_site_count: 0,
      ca_abc_active_issued_license_site_count: 0,
      ny_retail_food_store_license_site_count: 0,
      nyc_dcwp_active_license_site_count: 0,
    },
    spatial_zip_polygon_membership: { status: "included" },
    employer_baseline: { status: "published", establishments: 1 },
    coverage_gap_codes: ["entity-resolution-not-applied"],
  };
  const zipRows = [
    {
      ...baseCoverage,
      view_id: "zip:12345",
      zip_code: "12345",
      registry_coverage: { ...baseCoverage.registry_coverage, physical_site_count: 5, establishment_count: 5, snap_authorization_evidence_count: 3, nppes_primary_practice_location_count: 2 },
      geography: { status: "2020-zcta-polygon-available", geoid: "12345" },
      jurisdiction_overlay: { relationships: [{ county_geo_id: "county:01001", state_geo_id: "state:01", material_intersection: true }] },
    },
    {
      ...baseCoverage,
      view_id: "zip:12346",
      zip_code: "12346",
      registry_coverage: { ...baseCoverage.registry_coverage, physical_site_count: 7, establishment_count: 7, snap_authorization_evidence_count: 5, nppes_primary_practice_location_count: 2 },
      geography: { status: "2020-zcta-polygon-available", geoid: "12346" },
      jurisdiction_overlay: { relationships: [
        { county_geo_id: "county:01001", state_geo_id: "state:01", material_intersection: true },
        { county_geo_id: "county:02001", state_geo_id: "state:02", material_intersection: true },
      ] },
    },
  ];
  await writeFile(path.join(coverageRelease, "views", "zips.jsonl"), zipRows.map(json).join(""));
  await writeFile(path.join(coverageRelease, "manifest.json"), json({
    dataset_id: "national-business-coverage-views",
    release_id: "coverage-1",
    status: "published-partial-local-aggregate",
    export_policy: "local-aggregate-review-required",
    complete_all_businesses: false,
    entity_resolution_applied: false,
    artifacts: [{ artifact_type: "zip-coverage-view-jsonl", path: "views/zips.jsonl", record_count: 2 }],
  }));
  await writeFile(path.join(coverageRoot, "current.json"), json({ dataset_id: "national-business-coverage-views", release_id: "coverage-1", manifest: "releases/coverage-1/manifest.json" }));

  const states = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { GEOID: "01", NAME: "Alpha", STUSAB: "AA" }, geometry: polygon(-90, 30, -80, 40) },
    { type: "Feature", properties: { GEOID: "02", NAME: "Beta", STUSAB: "BB" }, geometry: polygon(-80, 30, -70, 40) },
  ] };
  const counties = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { GEOID: "01001", NAME: "Alpha County", STATE: "01" }, geometry: polygon(-90, 30, -80, 40) },
  ] };
  const zctas = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { GEOID: "12345", ZCTA5: "12345", NAME: "ZCTA5 12345", POP100: 1000, HU100: 400, AREALAND: 2500000 }, geometry: polygon(-88, 32, -86, 34) },
    { type: "Feature", properties: { GEOID: "12346", ZCTA5: "12346", NAME: "ZCTA5 12346", POP100: 2000, HU100: 800, AREALAND: 5000000 }, geometry: polygon(-82, 32, -78, 34) },
  ] };
  await writeFile(path.join(geographyRelease, "source", "states.geojson"), JSON.stringify(states));
  await writeFile(path.join(geographyRelease, "source", "counties", "state=01.geojson"), JSON.stringify(counties));
  await writeFile(path.join(geographyRelease, "source", "zctas", "prefix=1.geojson"), JSON.stringify(zctas));
  await writeFile(path.join(geographyRelease, "derived", "index", "states.jsonl"), [
    { geo_id: "state:01", geo_type: "state", geoid: "01", name: "Alpha", postal_abbreviation: "AA", is_50_states_or_dc: true },
    { geo_id: "state:02", geo_type: "state", geoid: "02", name: "Beta", postal_abbreviation: "BB", is_50_states_or_dc: true },
  ].map(json).join(""));
  await writeFile(path.join(geographyRelease, "derived", "index", "zctas.jsonl"), [
    { geo_id: "zcta:12345", geoid: "12345", zcta: "12345", population_2020: 1000, housing_units_2020: 400, area_land_m2: 2500000, geometry_file: "source/zctas/prefix=1.geojson" },
    { geo_id: "zcta:12346", geoid: "12346", zcta: "12346", population_2020: 2000, housing_units_2020: 800, area_land_m2: 5000000, geometry_file: "source/zctas/prefix=1.geojson" },
  ].map(json).join(""));
  await writeFile(path.join(geographyRelease, "manifest.json"), json({
    dataset_id: "us-census-geography",
    release_id: "geography-1",
    status: "published",
    complete_national_release: true,
    artifacts: [
      { artifact_type: "normalized-index", path: "derived/index/states.jsonl", record_count: 2 },
      { artifact_type: "normalized-index", path: "derived/index/zctas.jsonl", record_count: 2 },
      { path: "source/states.geojson" },
      { path: "source/counties/state=01.geojson" },
      { path: "source/zctas/prefix=1.geojson" },
    ],
  }));
  await writeFile(path.join(geographyRoot, "current.json"), json({ dataset_id: "us-census-geography", release_id: "geography-1", manifest: "releases/geography-1/manifest.json" }));

  const profiles = [
    { zip_code: "12345", names: [{ raw: "Main Street Market" }], address: { street: "1 Main St", city: "Alpha", state: "AA", zip_code: "12345", zip4: "6789" }, source: { source_id: "usda-snap-current-retailers" }, observed_at: "2026-01-01T00:00:00.000Z", export_policy: "public" },
    { zip_code: "12345", names: [{ raw: "Alpha Clinic" }], address: { street: "2 Main St", city: "Alpha", state: "AA", zip_code: "12345", zip4: null }, source: { source_id: "cms-nppes-monthly-v2" }, observed_at: "2026-01-02T00:00:00.000Z", export_policy: "public" },
  ];
  const profilePath = path.join(registryRelease, "resolution", "location-profiles", "zip2=12.jsonl.gz");
  await pipeline(Readable.from([profiles.map(json).join("")]), createGzip(), await import("node:fs").then(({ createWriteStream }) => createWriteStream(profilePath)));
  await writeFile(path.join(registryRelease, "manifest.json"), json({
    dataset_id: "national-business-registry",
    release_id: "registry-1",
    status: "published-partial",
    artifacts: [{ artifact_type: "entity-resolution-location-profile-jsonl-gzip", path: "resolution/location-profiles/zip2=12.jsonl.gz", record_count: 2 }],
  }));
  await writeFile(path.join(registryRoot, "current.json"), json({ dataset_id: "national-business-registry", release_id: "registry-1", manifest: "releases/registry-1/manifest.json" }));

  return createBusinessMapStore({
    coveragePointerPath: path.join(coverageRoot, "current.json"),
    geographyPointerPath: path.join(geographyRoot, "current.json"),
    registryPointerPath: path.join(registryRoot, "current.json"),
  });
}

test("serves governed category, geography, demographic, and percentage views", async (context) => {
  const store = await fixture(context);
  const catalog = await store.getCatalog();
  assert.equal(catalog.available, true);
  assert(catalog.categories.some((category) => category.id === "retail-consumer"));
  assert(catalog.enhancers.some((enhancer) => enhancer.id === "population_2020"));

  const states = await store.getFeatures({ level: "states", categoryId: "retail-consumer", enhancerId: "business_count" });
  assert.equal(states.features.length, 2);
  assert.equal(states.features.find((feature) => feature.properties.geoid === "01").properties.business_count, 3);
  assert.equal(states.features.find((feature) => feature.properties.geoid === "01").properties.observed_business_units, 5);
  assert.equal(states.features.find((feature) => feature.properties.geoid === "01").properties.observed_physical_sites, 5);
  assert.equal(states.features.find((feature) => feature.properties.geoid === "01").properties.relative_coverage_alignment_percent, 100);
  assert.equal(states.features.find((feature) => feature.properties.geoid === "01").properties.gdp_current_dollars, null);
  assert.equal(states.features.find((feature) => feature.properties.geoid === "01").properties.gdp_status, "unavailable-no-governed-bea-gdp-release");
  assert.match(states.meta.relative_coverage_alignment_semantics, /values may exceed 100%.*not measured completeness/);
  assert.equal(states.meta.excluded_ambiguous_zcta_count, 1);

  const filteredStates = await store.getFeatures({
    level: "states",
    categoryId: "retail-consumer",
    enhancerId: "business_count",
    minPopulation: "1",
    minHousingUnits: "1",
  });
  assert.deepEqual(filteredStates.features.map((feature) => feature.properties.geoid), ["01"]);
  assert.equal(filteredStates.meta.unfiltered_feature_count, 2);
  assert.equal(filteredStates.meta.filtered_out_feature_count, 1);
  assert.deepEqual(filteredStates.meta.demographic_filters, { min_population: 1, min_housing_units: 1 });

  const counties = await store.getFeatures({ level: "counties", stateFips: "01", categoryId: "all", enhancerId: "businesses_per_1000_people" });
  assert.equal(counties.features[0].properties.business_count, 5);
  assert.equal(counties.features[0].properties.population_2020, 1000);
  assert.equal(counties.features[0].properties.heat_value, 5);
  assert.equal(counties.features[0].properties.relative_coverage_alignment_percent, 100);

  const zips = await store.getFeatures({ level: "zips", stateFips: "01", countyGeoid: "01001", categoryId: "health-care", enhancerId: "housing_units_2020" });
  assert.equal(zips.features.length, 2);
  assert.equal(zips.features.find((feature) => feature.properties.geoid === "12345").properties.business_count, 2);
  assert.equal(zips.features.find((feature) => feature.properties.geoid === "12346").properties.scope_assignment, "direct-zcta-evidence-not-county-allocated");

  const summary = await store.getStateSummary({ includeTerritories: false });
  const alpha = summary.states.find((state) => state.state_fips === "01");
  assert.equal(alpha.category_counts["retail-consumer"], 3);
  assert.equal(alpha.percent_of_state["retail-consumer"], 60);
  assert.equal(alpha.percent_of_category_nationwide["retail-consumer"], 100);
  assert.equal(summary.assignment.excluded_ambiguous_zcta_count, 1);
});

test("drills from category to real ZIP business names without joining ZIP+4", async (context) => {
  const store = await fixture(context);
  const names = await store.listBusinessNames({ zipCode: "12345", categoryId: "retail-consumer", query: "market", limit: 10 });
  assert.equal(names.total, 1);
  assert.deepEqual(names.records[0], {
    business_name: "Main Street Market",
    address: { street: "1 Main St", city: "Alpha", state: "AA", zip_code: "12345", zip4: "6789" },
    category_id: "retail-consumer",
    source_id: "usda-snap-current-retailers",
    source_release_id: null,
    source_record_id: null,
    transformation_version: null,
    policy_id: null,
    observed_at: "2026-01-01T00:00:00.000Z",
    export_policy: "public",
  });
  assert(!Object.hasOwn(names.records[0].address, "postal_code"));
  await assert.rejects(() => store.listBusinessNames({ zipCode: "1234", categoryId: "all" }), /five-digit ZIP/);
  await assert.rejects(() => store.getFeatures({ level: "counties", stateFips: "../" }), /state_fips/);
  await assert.rejects(() => store.getFeatures({ level: "states", minPopulation: "1e3" }), /min_population/);
  await assert.rejects(() => store.getFeatures({ level: "states", minHousingUnits: "-1" }), /min_housing_units/);
});

test("rejects a coverage manifest path outside its governed dataset directory", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-business-map-escape-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const coverageRoot = path.join(root, "coverage");
  await mkdir(coverageRoot, { recursive: true });
  await writeFile(path.join(root, "outside.json"), json({ dataset_id: "national-business-coverage-views", release_id: "outside", status: "published-partial-local-aggregate" }));
  await writeFile(path.join(coverageRoot, "current.json"), json({ dataset_id: "national-business-coverage-views", release_id: "outside", manifest: "../outside.json" }));
  const store = createBusinessMapStore({
    coveragePointerPath: path.join(coverageRoot, "current.json"),
    geographyPointerPath: path.join(root, "missing-geography.json"),
    registryPointerPath: path.join(root, "missing-registry.json"),
  });
  await assert.rejects(() => store.getCatalog(), /escapes its dataset directory/);
});
