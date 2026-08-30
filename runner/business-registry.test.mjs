import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  buildNationalBusinessRegistry,
  reconcileFdicInstitution,
  reconcileFdicLocation,
  reconcileFsisEstablishment,
  reconcileEpaEchoFacility,
  reconcileNcuaInstitution,
  reconcileNcuaLocation,
  reconcileNcuaTradeName,
  reconcileNppesOrganization,
  reconcileNppesOtherName,
  reconcileNppesPracticeLocation,
  reconcileSnapRecord,
  SNAP_SERVICE_ENTITY_ID,
  verifyNationalBusinessRegistry,
} from "./business-registry.mjs";
import { normalizeNppesOrganization, normalizeNppesOtherName, normalizeNppesPracticeLocation } from "./cms-nppes-organizations.mjs";
import { normalizeFdicInstitution, normalizeFdicLocation } from "./fdic-bankfind.mjs";
import { normalizeFsisEstablishment } from "./fsis-mpi.mjs";
import { normalizeEchoFacility } from "./epa-echo.mjs";
import { normalizeNcuaBranch, normalizeNcuaInstitution, normalizeNcuaTradeName } from "./ncua-quarterly.mjs";
import { normalizeSnapFeature } from "./usda-snap-retailers.mjs";

function sourceFeature(recordId, zipCode, overrides = {}) {
  return {
    attributes: {
      Record_ID: recordId,
      Store_Name: `Fixture Store ${recordId}`,
      Store_Street_Address: `${recordId} Main St`,
      Additonal_Address: null,
      City: "Fixture City",
      State: "IL",
      Zip_Code: zipCode,
      Zip4: "1234",
      County: "FIXTURE",
      Store_Type: "Supermarket",
      Latitude: 41.88,
      Longitude: -87.63,
      Incentive_Program: null,
      Grantee_Name: null,
      ObjectId: recordId,
      ...overrides,
    },
    geometry: { x: -87.63, y: 41.88 },
  };
}

function normalizedRecord(recordId = 101, zipCode = "60601", overrides = {}) {
  return normalizeSnapFeature(sourceFeature(recordId, zipCode, overrides), {
    runId: "source-ingest-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceUpdatedAt: "2026-08-19T17:40:09.953Z",
    sourceReleaseId: "usda-snap-20260819T174009953Z",
    zipCoverage: {
      geography: {
        status: "2020-zcta-polygon-available",
        geo_id: `zcta:${zipCode}`,
        geoid: zipCode,
        geometry_file: `source/zctas/prefix=${zipCode[0]}.geojson`,
      },
    },
  });
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeFixtureSnapRelease(root) {
  const releaseId = "usda-snap-retailers-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedRecord(101, "60601"), normalizedRecord(202, "01760", { State: "MA" })];
  const artifacts = [];
  for (const prefix of "0123456789") {
    const partitionRecords = records.filter((record) => record.address.zip_code.startsWith(prefix));
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/retailers/prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({
      path: relativePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      record_count: partitionRecords.length,
      artifact_type: "normalized-snap-retailer-jsonl-gzip",
    });
  }
  const zipRows = [
    {
      zip_code: "01760",
      snap_retailer_snapshot: { retailer_count: 1 },
      current_usps_validity: { status: "unverified" },
      geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:01760" },
      employer_baseline: { status: "published", establishments: 100 },
      baseline_coverage_status: "zbp-and-zcta",
    },
    {
      zip_code: "60601",
      snap_retailer_snapshot: { retailer_count: 1 },
      current_usps_validity: { status: "unverified" },
      geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601" },
      employer_baseline: { status: "published", establishments: 1000 },
      baseline_coverage_status: "zbp-and-zcta",
    },
    {
      zip_code: "99999",
      snap_retailer_snapshot: { retailer_count: 0 },
      current_usps_validity: { status: "unverified" },
      geography: { status: "no-2020-zcta-polygon", geo_id: null },
      employer_baseline: null,
      baseline_coverage_status: "zcta-only",
    },
  ];
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const zipPath = "derived/zip-coverage.jsonl";
  await writeFile(path.join(releaseDirectory, zipPath), zipBuffer);
  artifacts.push({
    path: zipPath,
    bytes: zipBuffer.length,
    sha256: sha256(zipBuffer),
    record_count: zipRows.length,
    artifact_type: "snap-zip-coverage-jsonl",
  });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "usda-snap-retailers",
    release_id: releaseId,
    status: "published",
    complete_source_snapshot: true,
    source_release_id: "usda-snap-20260819T174009953Z",
    source_updated_at: "2026-08-19T17:40:09.953Z",
    coverage: { accepted_records: records.length },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

async function writeFixtureFdicRelease(root) {
  const releaseId = "fdic-bankfind-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const context = {
    runId: "fdic-source-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceUpdatedAt: "2026-08-28T11:57:32.000Z",
    sourceReleaseId: "fdic-bankfind-source-fixture",
    baselineByZip: new Map([
      ["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }],
      ["99998", { geography: { status: "no-2020-zcta-polygon", geo_id: null, geoid: null } }],
    ]),
    activeCertificates: new Set(["100"]),
  };
  const institutions = [normalizeFdicInstitution({
    CERT: 100, UNINUM: 500, NAME: "FIXTURE BANK", ACTIVE: 1, INACTIVE: 0,
    ADDRESS: "10 MAIN ST", CITY: "CHICAGO", STALP: "IL", ZIP: "60601", STCNTY: "17031",
    LATITUDE: 41.88, LONGITUDE: -87.63, OFFICES: 2, BKCLASS: "NM", RUNDATE: "08/28/2026",
  }, context)];
  const locations = [
    normalizeFdicLocation({
      CERT: 100, FI_UNINUM: 500, UNINUM: 501, NAME: "FIXTURE BANK", OFFNAME: "FIXTURE MAIN", OFFNUM: 0, MAINOFF: 1,
      ADDRESS: "10 MAIN ST", CITY: "CHICAGO", STALP: "IL", ZIP: "60601", STCNTY: "17031",
      LATITUDE: 41.88, LONGITUDE: -87.63, SERVTYPE: 11, SERVTYPE_DESC: "FULL SERVICE - BRICK AND MORTAR", RUNDATE: "08/28/2026",
    }, context),
    normalizeFdicLocation({
      CERT: 100, FI_UNINUM: 500, UNINUM: 502, NAME: "FIXTURE BANK", OFFNAME: "FIXTURE BRANCH", OFFNUM: 1, MAINOFF: 0,
      ADDRESS: "20 OAK AVE", CITY: "FIXTURE", STALP: "IL", ZIP: "99998", STCNTY: "17031",
      LATITUDE: 41.89, LONGITUDE: -87.64, SERVTYPE: 11, SERVTYPE_DESC: "FULL SERVICE - BRICK AND MORTAR", RUNDATE: "08/28/2026",
    }, context),
  ];
  const artifacts = [];
  for (const prefix of "0123456789") {
    for (const [relativePath, artifactType, records] of [
      [`derived/institutions/cert-prefix=${prefix}.jsonl.gz`, "normalized-fdic-institution-jsonl-gzip", institutions.filter((record) => record.external_identifiers[0].value.startsWith(prefix))],
      [`derived/locations/zip-prefix=${prefix}.jsonl.gz`, "normalized-fdic-location-jsonl-gzip", locations.filter((record) => record.address.zip_code.startsWith(prefix))],
    ]) {
      const buffer = gzipSync(records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""));
      const destination = path.join(releaseDirectory, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, buffer);
      artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: records.length, artifact_type: artifactType });
    }
  }
  const zipRows = [
    {
      zip_code: "60601", fdic_current_location_snapshot: { location_count: 1 }, current_usps_validity: { status: "unverified" },
      geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601" }, employer_baseline: { status: "published", establishments: 1000 }, baseline_coverage_status: "zbp-and-zcta",
    },
    {
      zip_code: "99998", fdic_current_location_snapshot: { location_count: 1 }, current_usps_validity: { status: "unverified" },
      geography: { status: "no-2020-zcta-polygon", geo_id: null }, employer_baseline: null, baseline_coverage_status: "outside-zbp-zcta-union",
    },
  ];
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const zipPath = "derived/zip-coverage.jsonl";
  await writeFile(path.join(releaseDirectory, zipPath), zipBuffer);
  artifacts.push({ path: zipPath, bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "fdic-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0", dataset_id: "fdic-bankfind", release_id: releaseId, status: "published", complete_current_structure_snapshot: true,
    source_release_id: context.sourceReleaseId, source_updated_at: context.sourceUpdatedAt,
    coverage: { accepted_active_institutions: institutions.length, accepted_current_locations: locations.length, excluded_locations_outside_united_states: 0 },
    dependencies: [], artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

async function writeFixtureNcuaRelease(root) {
  const releaseId = "ncua-quarterly-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const context = {
    runId: "ncua-source-fixture", retrievedAt: "2026-08-30T15:00:00.000Z", cycleDate: "2026-03-31", sourceReleaseId: "ncua-source-fixture",
    insuredCharters: new Set(["100"]),
    baselineByZip: new Map([
      ["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }],
      ["01760", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:01760", geoid: "01760" } }],
    ]),
  };
  const institutions = [normalizeNcuaInstitution({
    CU_NUMBER: "100", CYCLE_DATE: "3/31/2026 0:00:00", JOIN_NUMBER: "500", RSSD: "12345", CU_TYPE: "1", CU_NAME: "FIXTURE CREDIT UNION",
    CITY: "CHICAGO", STATE: "IL", CharterState: "IL", ZIP_CODE: "60601", STREET: "10 MAIN ST", YEAR_OPENED: "2000", LIMITED_INC: "0", IsMDI: "False",
  }, context)];
  const locations = [
    normalizeNcuaBranch({
      CU_NUMBER: "100", CYCLE_DATE: "3/31/2026 0:00:00", JOIN_NUMBER: "500", SiteId: "700", CU_NAME: "FIXTURE CREDIT UNION", SiteName: "FIXTURE MAIN",
      SiteTypeName: "Corporate Office", MainOffice: "Yes", PhysicalAddressLine1: "10 MAIN ST", PhysicalAddressCity: "CHICAGO",
      PhysicalAddressStateCode: "IL", PhysicalAddressPostalCode: "60601", PhysicalAddressCountry: "United States", MemberServices: "1", ATM: "1", DriveThru: "0", Shrd_Serv_Cntr_Net: "1",
    }, context),
    normalizeNcuaBranch({
      CU_NUMBER: "100", CYCLE_DATE: "3/31/2026 0:00:00", JOIN_NUMBER: "500", SiteId: "701", CU_NAME: "FIXTURE CREDIT UNION", SiteName: "FIXTURE BRANCH",
      SiteTypeName: "Branch Office", MainOffice: "No", PhysicalAddressLine1: "20 OAK AVE", PhysicalAddressCity: "NATICK",
      PhysicalAddressStateCode: "MA", PhysicalAddressPostalCode: "01760", PhysicalAddressCountry: "United States", MemberServices: "1", ATM: "0", DriveThru: "1", Shrd_Serv_Cntr_Net: "0",
    }, context),
  ];
  const names = [normalizeNcuaTradeName({ CU_NUMBER: "100", CycleDate: "3/31/2026 0:00:00", TradeNamesId: "1", TradeName: "FIXTURE CU" }, context)];
  const artifacts = [];
  for (const prefix of "0123456789") {
    for (const [relativePath, artifactType, records] of [
      [`derived/institutions/charter-prefix=${prefix}.jsonl.gz`, "normalized-ncua-institution-jsonl-gzip", institutions.filter((record) => record.external_identifiers[0].value.startsWith(prefix))],
      [`derived/locations/zip-prefix=${prefix}.jsonl.gz`, "normalized-ncua-location-jsonl-gzip", locations.filter((record) => record.address.zip_code.startsWith(prefix))],
      [`derived/trade-names/charter-prefix=${prefix}.jsonl.gz`, "normalized-ncua-trade-name-jsonl-gzip", names.filter((record) => record.charter_number.startsWith(prefix))],
    ]) {
      const buffer = gzipSync(records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""));
      const destination = path.join(releaseDirectory, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, buffer);
      artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: records.length, artifact_type: artifactType });
    }
  }
  const zipRows = ["01760", "60601"].map((zipCode) => ({
    zip_code: zipCode, ncua_quarterly_snapshot: { location_count: 1 }, current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}` }, employer_baseline: { status: "published", establishments: 100 }, baseline_coverage_status: "zbp-and-zcta",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "ncua-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0", dataset_id: "ncua-quarterly-credit-unions", release_id: releaseId, status: "published", complete_final_quarterly_source_snapshot: true,
    source_release_id: context.sourceReleaseId, cycle_date: context.cycleDate,
    coverage: {
      accepted_federally_insured_institutions: institutions.length, accepted_us_locations: locations.length, accepted_trade_names: names.length,
      excluded_non_federally_insured_institutions: 0, excluded_non_federally_insured_locations: 0, excluded_non_federally_insured_trade_names: 0, excluded_locations_outside_united_states: 0,
    },
    dependencies: [], artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedFsisRecord(id = "100", zip = "60601", overrides = {}) {
  const name = overrides.establishment_name ?? `Fixture FSIS ${id}`;
  return normalizeFsisEstablishment({
    establishment_id: id,
    establishment_number: `M${id}`,
    establishment_name: name,
    street: `${id} FOOD WAY`,
    city: "CHICAGO",
    state: "IL",
    zip,
    phone: "3125550100",
    grant_date: "1/2/2020",
    activities: "Meat Processing",
    dbas: `Fixture Foods ${id}`,
    district: "50",
    circuit: "5001",
    size: "Small",
    latitude: "41.88",
    longitude: "-87.63",
    county: "Cook County",
    fips_code: "17031",
    ...overrides,
  }, {
    establishment_id: id,
    establishment_number: `M${id}`,
    establishment_name: name,
    active_meat_grant: "Yes",
    last_meat_grant_edit_date: "1/2/2020",
    processing: "Yes",
  }, {
    runId: "fsis-source-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceDate: "2026-08-24",
    sourceReleaseId: "fsis-source-fixture",
    baselineByZip: new Map([[zip.padStart(5, "0"), { geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zip.padStart(5, "0")}`, geoid: zip.padStart(5, "0") } }]]),
  });
}

async function writeFixtureFsisRelease(root) {
  const releaseId = "fsis-mpi-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [
    normalizedFsisRecord("100", "60601"),
    normalizedFsisRecord("200", "956", { establishment_name: "Fixture Island Foods", state: "PR", fips_code: "72021" }),
  ];
  const artifacts = [];
  for (const prefix of "0123456789") {
    const partitionRecords = records.filter((record) => record.address.zip_code.startsWith(prefix));
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/establishments/zip-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-fsis-establishment-jsonl-gzip" });
  }
  const zipRows = ["00956", "60601"].map((zipCode) => ({
    zip_code: zipCode,
    fsis_active_mpi_snapshot: { establishment_count: 1 },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}` },
    employer_baseline: zipCode === "60601" ? { status: "published", establishments: 1000 } : null,
    baseline_coverage_status: zipCode === "60601" ? "zbp-and-zcta" : "outside-zbp-zcta-union",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "fsis-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "fsis-active-mpi-establishments",
    release_id: releaseId,
    status: "published",
    complete_current_active_directory_snapshot: true,
    source_release_id: "fsis-source-fixture",
    source_date: "2026-08-24",
    coverage: { accepted_active_establishments: records.length },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedEchoRecord(id = "110000000001", zip = "60601", overrides = {}) {
  return normalizeEchoFacility({
    REGISTRY_ID: id,
    FAC_NAME: `Fixture ECHO ${id}`,
    FAC_STREET: `${id} INDUSTRIAL WAY`,
    FAC_CITY: "CHICAGO",
    FAC_STATE: "IL",
    FAC_ZIP: zip,
    FAC_COUNTY: "Cook",
    FAC_FIPS_CODE: "17031",
    FAC_EPA_REGION: "05",
    FAC_ACTIVE_FLAG: "Y",
    FAC_LAT: "41.88",
    FAC_LONG: "-87.63",
    FAC_COLLECTION_METHOD: "Address Matching-House Number",
    FAC_ACCURACY_METERS: "30",
    AIR_FLAG: "Y",
    AIR_IDS: `AIR${id}`,
    FAC_NAICS_CODES: "311111",
    DFR_URL: `https://echo.epa.gov/detailed-facility-report?fid=${id}`,
    ...overrides,
  }, {
    runId: "echo-source-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceUpdatedAt: "2026-08-30T06:36:03.000Z",
    sourceReleaseId: "echo-source-fixture",
    baselineByZip: new Map([[zip, { geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zip}`, geoid: zip } }]]),
  });
}

async function writeFixtureEchoRelease(root) {
  const releaseId = "epa-echo-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [
    normalizedEchoRecord("110000000001", "60601"),
    normalizedEchoRecord("110000000002", "33101", { FAC_NAME: "Fixture Florida Utility", FAC_CITY: "MIAMI", FAC_STATE: "FL", FAC_COUNTY: "Miami-Dade", FAC_FIPS_CODE: "12086" }),
  ];
  const artifacts = [];
  for (const prefix of "0123456789") {
    const partitionRecords = records.filter((record) => record.address.zip_code.startsWith(prefix));
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/facilities/zip-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-epa-echo-facility-jsonl-gzip" });
  }
  const zipRows = ["33101", "60601"].map((zipCode) => ({
    zip_code: zipCode,
    epa_echo_active_facility_snapshot: { facility_count: 1 },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}` },
    employer_baseline: zipCode === "60601" ? { status: "published", establishments: 1000 } : null,
    baseline_coverage_status: zipCode === "60601" ? "zbp-and-zcta" : "outside-zbp-zcta-union",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "epa-echo-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "epa-echo-active-facilities",
    release_id: releaseId,
    status: "published",
    complete_echo_exporter_snapshot: true,
    active_filter: "FAC_ACTIVE_FLAG=Y",
    source_release_id: "echo-source-fixture",
    source_updated_at: "2026-08-30T06:36:03.000Z",
    coverage: { accepted_active_facilities: records.length, quarantined_active_or_unexpected_records: 0, source_unknown_blank_active_flag_records_excluded: 0 },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

test("reconciles source-specific SNAP evidence without inferring an owner or general open status", () => {
  const result = reconcileSnapRecord(normalizedRecord());
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["physical_site", "establishment"]);
  assert(result.entities.every((entity) => entity.identity_status === "provisional"));
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["located_at", "provides_service"]);
  assert.equal(result.relationships[1].object_entity_id, SNAP_SERVICE_ENTITY_ID);
  assert.equal(result.assertions.find((item) => item.predicate === "establishment.source-status").value.value, "snap-authorized-as-of-source-update");
  assert(!result.assertions.some((item) => item.predicate.includes("owner") || item.predicate.includes("open")));
  assert(result.assertions.every((item) => item.source.source_record_id === "101" && item.export_policy === "public"));
});

test("reconciles NPPES organizations and practice locations without inferring ownership or open status", () => {
  const nppesContext = {
    runId: "nppes-source-fixture",
    observedAt: "2026-08-30T15:00:00.000Z",
    sourceReleaseId: "NPPES_Data_Dissemination_August_2026_V2",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  };
  const sourceOrganization = normalizeNppesOrganization({
    npi: "1234567890",
    entityType: "2",
    legalName: "FIXTURE HEALTH LLC",
    otherName: "FIXTURE CLINIC",
    otherNameType: "3",
    address1: "10 MAIN ST",
    city: "CHICAGO",
    state: "IL",
    postalCode: "60601",
    country: "US",
    deactivationDate: "",
    reactivationDate: "",
    organizationSubpart: "N",
    parentOrganizationName: "REPORTED PARENT",
    taxonomies: [{ code: "261Q00000X", primary: true }],
  }, nppesContext).record;
  const organization = reconcileNppesOrganization(sourceOrganization);
  assert.deepEqual(organization.entities.map((entity) => entity.entity_type), ["organization", "physical_site", "establishment"]);
  assert.deepEqual(organization.relationships.map((item) => item.relationship_type), ["operates", "located_at"]);
  assert(organization.organizationAssertions.some((item) => item.predicate === "organization.npi-status"));
  assert(organization.organizationAssertions.some((item) => item.predicate === "organization.reported-parent-name"));
  assert(!organization.relationships.some((item) => item.relationship_type === "owns"));

  const sourcePractice = normalizeNppesPracticeLocation({
    npi: "1234567890",
    address1: "20 OAK AVE",
    city: "CHICAGO",
    state: "IL",
    postalCode: "60601",
    country: "US",
  }, nppesContext).record;
  const practice = reconcileNppesPracticeLocation(sourcePractice);
  assert.equal(practice.assertions.find((item) => item.predicate === "establishment.source-status").value.value, "reported-non-primary-practice-location-for-active-npi");

  const sourceName = normalizeNppesOtherName({ npi: "1234567890", name: "FIXTURE DBA", typeCode: "3", createdDate: "01/01/2020" }, nppesContext);
  assert.equal(reconcileNppesOtherName(sourceName).predicate, "organization.other-name");
});

test("reconciles FDIC institutions and U.S. locations without inferring public access", () => {
  const fdicContext = {
    runId: "fdic-source-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceUpdatedAt: "2026-08-28T11:57:32.000Z",
    sourceReleaseId: "fdic-bankfind-fixture",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
    activeCertificates: new Set(["100"]),
  };
  const institution = normalizeFdicInstitution({
    CERT: 100, UNINUM: 500, NAME: "FIXTURE BANK", ACTIVE: 1, INACTIVE: 0,
    ADDRESS: "10 MAIN ST", CITY: "CHICAGO", STALP: "IL", ZIP: "60601", STCNTY: "17031",
    LATITUDE: 41.88, LONGITUDE: -87.63, OFFICES: 1, BKCLASS: "NM", RUNDATE: "08/28/2026",
  }, fdicContext);
  const organization = reconcileFdicInstitution(institution);
  assert.equal(organization.entity.entity_type, "organization");
  assert(organization.assertions.some((item) => item.predicate === "organization.fdic-status"));
  assert(organization.assertions.some((item) => item.predicate === "organization.external-identifier"));

  const location = normalizeFdicLocation({
    CERT: 100, FI_UNINUM: 500, UNINUM: 501, NAME: "FIXTURE BANK", OFFNAME: "FIXTURE BRANCH", OFFNUM: 1, MAINOFF: 0,
    ADDRESS: "20 OAK AVE", CITY: "CHICAGO", STALP: "IL", ZIP: "60601", STCNTY: "17031",
    LATITUDE: 41.89, LONGITUDE: -87.64, SERVTYPE: 11, SERVTYPE_DESC: "FULL SERVICE - BRICK AND MORTAR", RUNDATE: "08/28/2026",
  }, fdicContext);
  const office = reconcileFdicLocation(location);
  assert.deepEqual(office.entities.map((entity) => entity.entity_type), ["physical_site", "establishment"]);
  assert.deepEqual(office.relationships.map((item) => item.relationship_type), ["operates", "located_at"]);
  assert.equal(office.assertions.find((item) => item.predicate === "establishment.source-status").value.value, "fdic-current-location-for-active-institution-as-of-index");
  assert(!office.assertions.some((item) => item.predicate.includes("open") || item.predicate.includes("hours")));
});

test("reconciles NCUA institutions, scoped locations, and trade names without inferring public access", () => {
  const ncuaContext = {
    runId: "ncua-source-fixture", retrievedAt: "2026-08-30T15:00:00.000Z", cycleDate: "2026-03-31", sourceReleaseId: "ncua-source-fixture",
    insuredCharters: new Set(["100"]), baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  };
  const institution = normalizeNcuaInstitution({
    CU_NUMBER: "100", CYCLE_DATE: "3/31/2026 0:00:00", JOIN_NUMBER: "500", RSSD: "12345", CU_TYPE: "1", CU_NAME: "FIXTURE CREDIT UNION",
    CITY: "CHICAGO", STATE: "IL", CharterState: "IL", ZIP_CODE: "60601", STREET: "10 MAIN ST", YEAR_OPENED: "2000", LIMITED_INC: "0", IsMDI: "False",
  }, ncuaContext);
  const organization = reconcileNcuaInstitution(institution);
  assert.equal(organization.entity.entity_type, "organization");
  assert(organization.assertions.some((item) => item.predicate === "organization.ncua-status"));
  const location = normalizeNcuaBranch({
    CU_NUMBER: "100", CYCLE_DATE: "3/31/2026 0:00:00", JOIN_NUMBER: "500", SiteId: "700", CU_NAME: "FIXTURE CREDIT UNION", SiteName: "FIXTURE MAIN",
    SiteTypeName: "Corporate Office", MainOffice: "Yes", PhysicalAddressLine1: "10 MAIN ST", PhysicalAddressCity: "CHICAGO",
    PhysicalAddressStateCode: "IL", PhysicalAddressPostalCode: "60601", PhysicalAddressCountry: "United States",
    MemberServices: "1", ATM: "1", DriveThru: "0", Shrd_Serv_Cntr_Net: "1",
  }, ncuaContext);
  const office = reconcileNcuaLocation(location);
  assert.deepEqual(office.relationships.map((item) => item.relationship_type), ["operates", "located_at"]);
  assert.equal(office.assertions.find((item) => item.predicate === "establishment.source-status").value.value, "ncua-reported-us-branch-for-federally-insured-credit-union-as-of-final-quarterly-release");
  const tradeName = normalizeNcuaTradeName({ CU_NUMBER: "100", CycleDate: "3/31/2026 0:00:00", TradeNamesId: "1", TradeName: "FIXTURE CU" }, ncuaContext);
  assert.equal(reconcileNcuaTradeName(tradeName).predicate, "organization.other-name");
  assert(!office.assertions.some((item) => item.predicate.includes("open")));
});

test("reconciles FSIS sites and establishments without inferring an organization or general open status", () => {
  const source = normalizedFsisRecord();
  const result = reconcileFsisEstablishment(source);
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["physical_site", "establishment"]);
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["located_at"]);
  assert.equal(result.assertions.find((item) => item.predicate === "establishment.source-status").value.value, "listed-in-fsis-active-mpi-directory-as-of-release");
  assert(result.assertions.some((item) => item.predicate === "establishment.fsis-activities"));
  assert(result.assertions.some((item) => item.predicate === "establishment.other-name"));
  assert(!result.assertions.some((item) => item.predicate.includes("organization") || item.predicate.includes("owner") || item.predicate.includes("open")));
});

test("reconciles EPA ECHO regulated facilities without inferring an organization or general open status", () => {
  const source = normalizedEchoRecord();
  const result = reconcileEpaEchoFacility(source);
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["physical_site", "establishment"]);
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["located_at"]);
  assert.equal(result.assertions.find((item) => item.predicate === "establishment.source-status").value.value, "epa-echo-active-program-facility-as-of-source-release");
  assert(result.assertions.some((item) => item.predicate === "establishment.epa-program-associations"));
  assert(result.assertions.some((item) => item.predicate === "site.reported-location"));
  assert(!result.assertions.some((item) => item.predicate.includes("organization") || item.predicate.includes("owner") || item.predicate.includes("open")));
});

test("publishes and verifies a combined partial registry while retaining denominator-only ZIPs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-registry-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const snapPointer = await writeFixtureSnapRelease(path.join(root, "snap"));
  const fdicPointer = await writeFixtureFdicRelease(path.join(root, "fdic"));
  const ncuaPointer = await writeFixtureNcuaRelease(path.join(root, "ncua"));
  const fsisPointer = await writeFixtureFsisRelease(path.join(root, "fsis"));
  const echoPointer = await writeFixtureEchoRelease(path.join(root, "echo"));
  const outputRoot = path.join(root, "registry");
  const result = await buildNationalBusinessRegistry({
    outputRoot,
    snapPointer,
    fdicPointer,
    ncuaPointer,
    fsisPointer,
    echoPointer,
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  });
  assert.equal(result.manifest.complete_national_business_registry, false);
  assert.equal(result.manifest.coverage.organizations, 2);
  assert.equal(result.manifest.coverage.physical_sites, 10);
  assert.equal(result.manifest.coverage.establishments, 10);
  assert.equal(result.manifest.coverage.fsis_establishment_records, 2);
  assert.equal(result.manifest.coverage.epa_echo_active_facility_records, 2);
  assert.equal(result.manifest.coverage.relationships, 16);
  assert.equal(result.manifest.coverage.zip_union_records, 6);
  assert.equal(result.manifest.coverage.authoritative_current_usps_zip_denominator, null);

  const verification = await verifyNationalBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verification.status, "published-partial");
  const zipArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "registry-zip-coverage-jsonl");
  const zipRows = (await readFile(path.join(result.releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").map(JSON.parse);
  const uncovered = zipRows.find((row) => row.zip_code === "99999");
  assert.equal(uncovered.registry_coverage.status, "denominator-only-no-record-level-contribution");
  assert.equal(uncovered.registry_coverage.complete_all_businesses, false);
  assert.equal(zipRows.find((row) => row.zip_code === "99998").registry_coverage.fdic_current_location_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "01760").registry_coverage.ncua_reported_us_location_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "00956").registry_coverage.fsis_active_establishment_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "33101").registry_coverage.epa_echo_active_facility_count, 1);
});

test("verifier rejects a completeness claim", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-registry-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const snapPointer = await writeFixtureSnapRelease(path.join(root, "snap"));
  const result = await buildNationalBusinessRegistry({ outputRoot: path.join(root, "registry"), snapPointer, logger: () => {} });
  const manifestPath = path.join(result.releaseDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.complete_national_business_registry = true;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await assert.rejects(
    () => verifyNationalBusinessRegistry(manifestPath),
    (error) => error.failures?.some((failure) => failure.reason === "release is not explicitly marked partial"),
  );
});
