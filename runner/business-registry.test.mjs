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
  reconcileFmcsaCompany,
  reconcileIrsEoOrganization,
  reconcileCtBusinessOrganization,
  reconcileCoBusinessOrganization,
  reconcileOrBusinessRegistration,
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
import { normalizeFmcsaCompany } from "./fmcsa-company-census.mjs";
import { normalizeIrsEoOrganization } from "./irs-eo-bmf.mjs";
import { normalizeCtBusinessOrganization } from "./ct-business-registry.mjs";
import { normalizeCoBusinessOrganization } from "./co-business-registry.mjs";
import { normalizeOrBusinessRegistration } from "./or-business-registry.mjs";
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

async function writeFixtureUspsOperationalZipRelease(root) {
  const releaseId = "usps-operational-zips-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  const sourceMonth = "2026-08";
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["00001", "01760", "60601"].map((zipCode) => ({
    schema_version: "1.0.0",
    zip_code: zipCode,
    assignment_status: "listed-in-current-usps-area-district-file",
    evidence_scope: "operational-area-district-5-digit-zip-assignment",
    deliverability_status: "not-asserted",
    zcta_status: "not-asserted",
    source_month: sourceMonth,
    provenance: {
      source_id: "usps-postalpro-area-district-zip5",
      source_release_id: `usps-postalpro-area-district-zip5-${sourceMonth}`,
      source_record_id: zipCode,
      ingest_run_id: "usps-fixture-run",
      transformation_version: "usps-operational-zip-assignments@1.0.0",
      policy_id: "usps-operational-zip-assignments",
    },
    export_policy: "local-restricted",
  }));
  const zipBuffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived/operational-zip-assignments.jsonl"), zipBuffer);
  const manifest = {
    dataset_id: "usps-operational-zip-assignments",
    release_id: releaseId,
    status: "published-local-restricted",
    source_month: sourceMonth,
    complete_source_release: true,
    complete_current_area_district_assignment_file: true,
    complete_current_delivery_zip_registry: false,
    use_authorization: {
      basis: "personal-noncommercial-home-use",
      permission_reference: null,
      redistribution_authorized: false,
    },
    export_policy: "Local restricted use only; do not redistribute USPS rows or derived ZIP assignments.",
    coverage: {
      current_area_district_zip_assignment_denominator: rows.length,
      aisu_routing_rows: 4,
      routing_only_rows_excluded_from_denominator: 1,
    },
    artifacts: [{
      path: "derived/operational-zip-assignments.jsonl",
      bytes: zipBuffer.length,
      sha256: sha256(zipBuffer),
      record_count: rows.length,
      artifact_type: "usps-operational-zip-assignment-jsonl",
      distribution_policy: "local-restricted",
    }],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  await mkdir(root, { recursive: true });
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

function normalizedFmcsaRecord(dotNumber = "100", zip = "60601", overrides = {}) {
  return normalizeFmcsaCompany({
    mcs150_date: "20260829 1030",
    add_date: "20120103",
    status_code: "A",
    dot_number: dotNumber,
    carrier_operation: "A",
    business_org_id: "3",
    business_org_desc: "CORPORATION",
    carship: "C;S",
    classdef: "PRIVATE PROPERTY;AUTHORIZED FOR HIRE",
    legal_name: `FIXTURE FMCSA ${dotNumber}`,
    dba_name: `FIXTURE CARRIER ${dotNumber}`,
    phy_street: `${dotNumber} TRANSPORT WAY`,
    phy_city: "CHICAGO",
    phy_country: "US",
    phy_state: "IL",
    phy_zip: zip,
    phy_cnty: "031",
    phy_omc_region: "05",
    undeliv_phy: "",
    hm_ind: "N",
    docket1prefix: "MC",
    docket1: dotNumber,
    docket1_status_code: "A",
    ...overrides,
  }, {
    runId: "fmcsa-source-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceUpdatedAt: "2026-08-30T11:55:17.000Z",
    sourceReleaseId: "fmcsa-source-fixture",
    baselineByZip: new Map([[zip, { geography: { status: zip === "60601" ? "2020-zcta-polygon-available" : "no-2020-zcta-polygon", geo_id: zip === "60601" ? `zcta:${zip}` : null, geoid: zip === "60601" ? zip : null } }]]),
  });
}

async function writeFixtureFmcsaRelease(root) {
  const releaseId = "fmcsa-company-census-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [
    normalizedFmcsaRecord("100", "60601"),
    normalizedFmcsaRecord("200", "90210", { legal_name: "FIXTURE CALIFORNIA CARRIER", dba_name: "", phy_city: "BEVERLY HILLS", phy_state: "CA", business_org_id: "", business_org_desc: "", docket1prefix: "", docket1: "", docket1_status_code: "" }),
  ];
  const artifacts = [];
  for (const prefix of "0123456789") {
    const partitionRecords = records.filter((record) => record.address.zip_code.startsWith(prefix));
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/records/zip-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-fmcsa-company-census-record-jsonl-gzip" });
  }
  const zipRows = ["60601", "90210"].map((zipCode) => ({
    zip_code: zipCode,
    fmcsa_active_registration_principal_office_snapshot: { record_count: 1 },
    current_usps_validity: { status: "unverified" },
    geography: { status: zipCode === "60601" ? "2020-zcta-polygon-available" : "no-2020-zcta-polygon", geo_id: zipCode === "60601" ? `zcta:${zipCode}` : null },
    employer_baseline: zipCode === "60601" ? { status: "published", establishments: 1000 } : null,
    baseline_coverage_status: zipCode === "60601" ? "zbp-and-zcta" : "outside-zbp-zcta-union",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "fmcsa-company-census-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "fmcsa-active-us-company-census",
    release_id: releaseId,
    status: "published",
    complete_pinned_active_us_selected_snapshot: true,
    source_filter: "status_code='A' AND phy_country='US'",
    source_order: "dot_number",
    source_release_id: "fmcsa-source-fixture",
    source_updated_at: "2026-08-30T11:55:17.000Z",
    privacy: { source_columns_available: 147, source_columns_acquired: 29 },
    coverage: { accepted_principal_office_records: records.length, quarantined_selected_records: 0 },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedIrsEoRecord(ein = "123456789", zip = "60601", overrides = {}) {
  return normalizeIrsEoOrganization({
    EIN: ein,
    NAME: `FIXTURE EXEMPT ORGANIZATION ${ein}`,
    ICO: "PRIVATE CONTACT EXCLUDED",
    STREET: "10 MAIN ST",
    CITY: "CHICAGO",
    STATE: "IL",
    ZIP: zip,
    GROUP: "0000",
    SUBSECTION: "03",
    AFFILIATION: "3",
    CLASSIFICATION: "1",
    RULING: "200101",
    DEDUCTIBILITY: "1",
    FOUNDATION: "15",
    ACTIVITY: "",
    ORGANIZATION: "1",
    STATUS: "01",
    TAX_PERIOD: "202512",
    ASSET_CD: "7",
    INCOME_CD: "6",
    FILING_REQ_CD: "01",
    PF_FILING_REQ_CD: "0",
    ACCT_PD: "12",
    ASSET_AMT: "2500000",
    INCOME_AMT: "900000",
    REVENUE_AMT: "850000",
    NTEE_CD: "T30",
    SORT_NAME: "FIXTURE EO",
    ...overrides,
  }, {
    runId: "irs-eo-source-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourcePostingDate: "2026-08-11",
    sourceReleaseId: "irs-eo-source-fixture",
    baselineByZip: new Map([[zip, { geography: { status: zip === "60601" ? "2020-zcta-polygon-available" : "no-2020-zcta-polygon", geo_id: zip === "60601" ? `zcta:${zip}` : null, geoid: zip === "60601" ? zip : null } }]]),
  });
}

async function writeFixtureIrsEoRelease(root) {
  const releaseId = "irs-eo-bmf-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [
    normalizedIrsEoRecord("123456789", "60601"),
    normalizedIrsEoRecord("923456789", "88888", { NAME: "FIXTURE REMOTE EXEMPT ORGANIZATION", CITY: "AUSTIN", STATE: "TX", SORT_NAME: "" }),
  ];
  const artifacts = [];
  for (const prefix of "0123456789") {
    const partitionRecords = records.filter((record) => record.external_identifiers[0].value.startsWith(prefix));
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/organizations/ein-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-irs-eo-organization-jsonl-gzip" });
  }
  const zipRows = ["60601", "88888"].map((zipCode) => ({
    zip_code: zipCode,
    irs_eo_bmf_current_snapshot: { organization_filing_address_count: 1 },
    current_usps_validity: { status: "unverified" },
    geography: { status: zipCode === "60601" ? "2020-zcta-polygon-available" : "no-2020-zcta-polygon", geo_id: zipCode === "60601" ? `zcta:${zipCode}` : null },
    employer_baseline: zipCode === "60601" ? { status: "published", establishments: 1000 } : null,
    baseline_coverage_status: zipCode === "60601" ? "zbp-and-zcta" : "outside-zbp-zcta-union",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "irs-eo-bmf-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "irs-eo-bmf-organizations",
    release_id: releaseId,
    status: "published",
    complete_current_eo_bmf_snapshot: true,
    source_release_id: "irs-eo-source-fixture",
    source_posting_date: "2026-08-11",
    coverage: { accepted_current_exempt_organizations: records.length, excluded_outside_supported_us_scope: 0, quarantined_records: 0 },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedCtBusinessRecord(id = "0018y000008a1JIAAY", overrides = {}) {
  return normalizeCtBusinessOrganization({
    id,
    name: `FIXTURE CONNECTICUT ORGANIZATION ${id}`,
    business_type: "LLC",
    status: "Active",
    sub_status: null,
    accountnumber: id.endsWith("AAY") ? "2732224" : "0000000",
    annual_report_due_date: "2027-03-31T00:00:00",
    billingstreet: "8 ELM ST",
    billingcity: "NORWALK",
    billingcountry: "United States",
    billingpostalcode: "60601-1234",
    billingstate: "IL",
    citizenship: "Domestic",
    country_formation: "United States",
    date_registration: "2023-02-26T00:00:00",
    formation_place: "Connecticut",
    state_or_territory_formation: "Connecticut",
    naics_code: "Parking Lots and Garages (812930)",
    create_dt: "2026-08-30 00:09:20.4833333",
    ...overrides,
  }, {
    runId: "ct-business-source-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-30T08:47:47.000Z",
    sourceReleaseId: "ct-business-source-fixture",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  });
}

async function writeFixtureCtBusinessRelease(root) {
  const releaseId = "ct-business-registry-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [
    normalizedCtBusinessRecord(),
    normalizedCtBusinessRecord("0018y000008a1VBAAY", { accountnumber: "0000000", billingstreet: null, billingcity: null, billingstate: null, billingpostalcode: null, billingcountry: null }),
  ];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-ct-business-organization-jsonl-gzip" });
  }
  const zipRows = [{
    zip_code: "60601",
    ct_business_registry_active_snapshot: { organization_reported_business_address_count: 1 },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601" },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }];
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "ct-business-registry-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "ct-business-registry-active-organizations",
    release_id: releaseId,
    status: "published",
    complete_active_business_master_snapshot: true,
    source_release_id: "ct-business-source-fixture",
    source_rows_updated_at: "2026-08-30T08:47:47.000Z",
    coverage: { active_organizations_published: records.length, eligible_reported_us_business_addresses: 1, organizations_without_eligible_us_zip_address: 1 },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedCoBusinessRecord(entityid = "20251665680", overrides = {}) {
  return normalizeCoBusinessOrganization({
    entityid,
    entityname: `FIXTURE COLORADO ORGANIZATION ${entityid}`,
    principaladdress1: "1 MAIN ST",
    principaladdress2: null,
    principalcity: "AURORA",
    principalstate: "CO",
    principalzipcode: "80014",
    principalcountry: "US",
    entitystatus: "Good Standing",
    jurisdictonofformation: "CO",
    entitytype: "DLLC",
    entityformdate: "2025-06-16T00:00:00.000",
    ...overrides,
  }, {
    runId: "co-business-source-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-30T11:20:54.000Z",
    sourceReleaseId: "co-business-source-fixture",
    baselineByZip: new Map([["80014", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:80014", geoid: "80014" } }]]),
  });
}

async function writeFixtureCoBusinessRelease(root) {
  const releaseId = "co-business-registry-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [
    normalizedCoBusinessRecord(),
    normalizedCoBusinessRecord("20261147600", { entitystatus: "Delinquent", principaladdress1: null, principalcity: null, principalstate: null, principalzipcode: null, principalcountry: null }),
  ];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-co-business-organization-jsonl-gzip" });
  }
  const zipRows = [{
    zip_code: "80014",
    co_business_registry_registration_snapshot: { organization_reported_business_address_count: 1 },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:80014" },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }];
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "co-business-registry-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "co-business-registry-good-standing-or-delinquent-organizations",
    release_id: releaseId,
    status: "published",
    complete_selected_business_entities_snapshot: true,
    source_release_id: "co-business-source-fixture",
    source_rows_updated_at: "2026-08-30T11:20:54.000Z",
    coverage: {
      source_good_standing_or_delinquent_records: records.length,
      organizations_published: records.length,
      quarantined_source_records: 0,
      good_standing_organizations: 1,
      delinquent_organizations: 1,
      eligible_reported_us_business_addresses: 1,
      organizations_without_eligible_us_zip_address: 1,
    },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedOrBusinessRecord(registryNumber = "100002195", assumedName = false, multipleAddresses = false) {
  const rows = [{
    ":id": `row-${registryNumber}-a`,
    registry_number: registryNumber,
    business_name: assumedName ? "FIXTURE OREGON ASSUMED NAME" : "FIXTURE OREGON LEGAL ENTITY LLC",
    entity_type: assumedName ? "ASSUMED BUSINESS NAME" : "DOMESTIC LIMITED LIABILITY COMPANY",
    registry_date: "2020-06-16T00:00:00",
    associated_name_type: "PRINCIPAL PLACE OF BUSINESS",
    address: assumedName ? "1 MAIN ST" : "6101 SE CLATSOP ST",
    address_continued: null,
    city: assumedName ? "KLAMATH FALLS" : "PORTLAND",
    state: "OR",
    zip: assumedName ? "97603" : "97206",
    jurisdiction: "OR",
  }];
  if (multipleAddresses) rows.push({ ...rows[0], ":id": `row-${registryNumber}-b`, address: "157 N 1ST ST", city: "KALAMA", state: "WA", zip: "98625" });
  return normalizeOrBusinessRegistration(rows, {
    runId: "or-business-source-fixture",
    retrievedAt: "2026-08-31T12:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-25T13:43:02.000Z",
    sourceReleaseId: "or-business-source-fixture",
    baselineByZip: new Map(["97206", "97603", "98625"].map((zipCode) => [zipCode, { geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode } }])),
  });
}

async function writeFixtureOrBusinessRelease(root) {
  const releaseId = "or-business-registry-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedOrBusinessRecord("100002195", false, true), normalizedOrBusinessRecord("101250199", true, false)];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/registrations/id-hash-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-or-business-registration-jsonl-gzip" });
  }
  const zipRows = [
    ["97206", 1, 0],
    ["97603", 0, 1],
    ["98625", 1, 0],
  ].map(([zipCode, legal, assumed]) => ({
    zip_code: zipCode,
    or_business_registry_active_registration_snapshot: {
      registration_principal_place_address_count: legal + assumed,
      legal_entity_registration_principal_place_address_count: legal,
      assumed_business_name_registration_principal_place_address_count: assumed,
    },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}` },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "or-business-registry-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "or-business-registry-active-registrations",
    release_id: releaseId,
    status: "published",
    complete_selected_active_registration_snapshot: true,
    source_release_id: "or-business-source-fixture",
    source_rows_updated_at: "2026-08-25T13:43:02.000Z",
    coverage: {
      source_principal_place_rows: 3,
      active_registrations_published: 2,
      quarantined_registration_groups: 0,
      quarantined_source_rows: 0,
      legal_entity_registrations: 1,
      assumed_business_name_registrations: 1,
      registrations_with_multiple_principal_place_rows: 1,
      registrations_with_eligible_us_principal_place_address: 2,
      eligible_us_registration_zip_contributions: 3,
    },
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

test("reconciles FMCSA active principal offices without inferring an organization or parent", () => {
  const source = normalizedFmcsaRecord();
  source.external_identifiers.push({ ...source.external_identifiers[1] });
  const result = reconcileFmcsaCompany(source);
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["physical_site", "establishment"]);
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["located_at"]);
  assert.equal(result.assertions.find((item) => item.predicate === "establishment.source-status").value.value, "fmcsa-active-registration-as-of-daily-source-release");
  assert(result.assertions.some((item) => item.predicate === "establishment.fmcsa-registration-profile"));
  assert(result.assertions.some((item) => item.predicate === "establishment.source-data-sensitivity"));
  assert.equal(result.assertions.filter((item) => item.predicate === "establishment.external-identifier").length, 2);
  assert(!result.assertions.some((item) => item.predicate.includes("organization") || item.predicate.includes("owner") || item.predicate.includes("parent")));
});

test("reconciles IRS EO organizations and filing addresses without creating physical sites or relationships", () => {
  const source = normalizedIrsEoRecord();
  const result = reconcileIrsEoOrganization(source);
  assert.equal(result.entity.entity_type, "organization");
  assert.equal(result.zipCode, "60601");
  assert(result.assertions.some((item) => item.predicate === "organization.reported-filing-address"));
  assert(result.assertions.some((item) => item.predicate === "organization.irs-eo-tax-profile"));
  assert(result.assertions.some((item) => item.predicate === "organization.irs-eo-source-status"));
  assert(result.assertions.every((item) => item.subject_entity_id === "organization:irs_ein_123456789"));
  assert(result.assertions.every((item) => !String(item.source.source_field).split("|").some((field) => ["ICO", "ASSET_AMT", "INCOME_AMT", "REVENUE_AMT"].includes(field))));
});

test("reconciles Connecticut active-registration evidence without creating physical sites or relationships", () => {
  const source = normalizedCtBusinessRecord();
  const result = reconcileCtBusinessOrganization(source);
  assert.equal(result.entity.entity_type, "organization");
  assert.equal(result.zipCode, "60601");
  assert(result.assertions.some((item) => item.predicate === "organization.reported-business-address"));
  assert(result.assertions.some((item) => item.predicate === "organization.ct-registration-profile"));
  assert(result.assertions.some((item) => item.predicate === "organization.ct-registration-status"));
  assert(result.assertions.every((item) => item.subject_entity_id === "organization:ct_sots_record_0018y000008a1JIAAY"));
  assert(result.assertions.every((item) => !String(item.source.source_field).includes("email")));
});

test("reconciles Colorado registration evidence without creating physical sites or relationships", () => {
  const source = normalizedCoBusinessRecord();
  const result = reconcileCoBusinessOrganization(source);
  assert.equal(result.entity.entity_type, "organization");
  assert.equal(result.zipCode, "80014");
  assert(result.assertions.some((item) => item.predicate === "organization.principal-office-address"));
  assert(result.assertions.some((item) => item.predicate === "organization.co-registration-profile"));
  assert(result.assertions.some((item) => item.predicate === "organization.co-registration-status"));
  assert(result.assertions.every((item) => item.subject_entity_id === "organization:co_sos_record_20251665680"));
  assert(result.assertions.every((item) => !String(item.source.source_field).toLowerCase().includes("agent")));
});

test("reconciles Oregon legal entities and assumed names without inventing sites, owners, or relationships", () => {
  const legal = reconcileOrBusinessRegistration(normalizedOrBusinessRecord("100002195", false, true));
  assert.equal(legal.entity.entity_type, "organization");
  assert.deepEqual(legal.zipCodes, ["97206", "98625"]);
  assert(legal.assertions.some((item) => item.predicate === "organization.principal-place-address"));
  assert(legal.assertions.some((item) => item.predicate === "organization.or-registration-status"));
  const assumedName = reconcileOrBusinessRegistration(normalizedOrBusinessRecord("101250199", true, false));
  assert.equal(assumedName.entity.entity_type, "brand");
  assert(assumedName.assertions.some((item) => item.predicate === "brand.name"));
  assert(assumedName.assertions.some((item) => item.predicate === "brand.principal-place-address"));
  assert(assumedName.assertions.every((item) => !item.predicate.includes("owner") && !item.predicate.includes("relationship")));
});

test("publishes and verifies a combined partial registry while retaining denominator-only ZIPs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-registry-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const snapPointer = await writeFixtureSnapRelease(path.join(root, "snap"));
  const fdicPointer = await writeFixtureFdicRelease(path.join(root, "fdic"));
  const ncuaPointer = await writeFixtureNcuaRelease(path.join(root, "ncua"));
  const fsisPointer = await writeFixtureFsisRelease(path.join(root, "fsis"));
  const echoPointer = await writeFixtureEchoRelease(path.join(root, "echo"));
  const fmcsaPointer = await writeFixtureFmcsaRelease(path.join(root, "fmcsa"));
  const irsEoPointer = await writeFixtureIrsEoRelease(path.join(root, "irs-eo"));
  const ctBusinessPointer = await writeFixtureCtBusinessRelease(path.join(root, "ct-business"));
  const coBusinessPointer = await writeFixtureCoBusinessRelease(path.join(root, "co-business"));
  const orBusinessPointer = await writeFixtureOrBusinessRelease(path.join(root, "or-business"));
  const uspsZipsPointer = await writeFixtureUspsOperationalZipRelease(path.join(root, "usps-zips"));
  const outputRoot = path.join(root, "registry");
  const result = await buildNationalBusinessRegistry({
    outputRoot,
    snapPointer,
    fdicPointer,
    ncuaPointer,
    fsisPointer,
    echoPointer,
    fmcsaPointer,
    irsEoPointer,
    ctBusinessPointer,
    coBusinessPointer,
    orBusinessPointer,
    uspsZipsPointer,
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  });
  assert.equal(result.manifest.complete_national_business_registry, false);
  assert.equal(result.manifest.coverage.organizations, 9);
  assert.equal(result.manifest.coverage.brands, 1);
  assert.equal(result.manifest.coverage.physical_sites, 12);
  assert.equal(result.manifest.coverage.establishments, 12);
  assert.equal(result.manifest.coverage.fsis_establishment_records, 2);
  assert.equal(result.manifest.coverage.epa_echo_active_facility_records, 2);
  assert.equal(result.manifest.coverage.fmcsa_active_principal_office_records, 2);
  assert.equal(result.manifest.coverage.irs_eo_organization_records, 2);
  assert.equal(result.manifest.coverage.ct_business_registry_active_organization_records, 2);
  assert.equal(result.manifest.coverage.ct_business_registry_eligible_reported_us_business_addresses, 1);
  assert.equal(result.manifest.coverage.co_business_registry_good_standing_or_delinquent_organization_records, 2);
  assert.equal(result.manifest.coverage.co_business_registry_eligible_reported_us_business_addresses, 1);
  assert.equal(result.manifest.coverage.or_business_registry_source_principal_place_rows, 3);
  assert.equal(result.manifest.coverage.or_business_registry_active_registration_records, 2);
  assert.equal(result.manifest.coverage.or_business_registry_legal_entity_registrations, 1);
  assert.equal(result.manifest.coverage.or_business_registry_assumed_business_name_registrations, 1);
  assert.equal(result.manifest.coverage.or_business_registry_eligible_registration_zip_contributions, 3);
  assert.equal(result.manifest.coverage.relationships, 18);
  assert.equal(result.manifest.coverage.resolution_location_profiles, 12);
  const resolutionProfiles = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "entity-resolution-location-profile-jsonl-gzip");
  assert.equal(resolutionProfiles.length, 100);
  assert.equal(resolutionProfiles.reduce((sum, artifact) => sum + artifact.record_count, 0), 12);
  assert.equal(result.manifest.coverage.zip_union_records, 13);
  assert.equal(result.manifest.coverage.authoritative_current_usps_zip_denominator.count, 3);
  assert.equal(result.manifest.coverage.authoritative_current_usps_zip_denominator.address_level_deliverability_asserted, false);

  const verification = await verifyNationalBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verification.status, "published-partial");
  const zipArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "registry-zip-coverage-jsonl");
  const zipRows = (await readFile(path.join(result.releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").map(JSON.parse);
  const uncovered = zipRows.find((row) => row.zip_code === "99999");
  assert.equal(uncovered.registry_coverage.status, "denominator-only-no-record-level-contribution");
  assert.equal(uncovered.registry_coverage.complete_all_businesses, false);
  assert.equal(uncovered.current_usps_validity.status, "not-listed-in-current-usps-area-district-file");
  const uspsOnly = zipRows.find((row) => row.zip_code === "00001");
  assert.equal(uspsOnly.registry_coverage.status, "denominator-only-no-record-level-contribution");
  assert.equal(uspsOnly.current_usps_validity.status, "listed-in-current-usps-area-district-file");
  assert.equal(uspsOnly.geography.status, "not-observed-in-integrated-census-coverage-union");
  const irsOnly = zipRows.find((row) => row.zip_code === "88888");
  assert.equal(irsOnly.registry_coverage.status, "record-level-source-contribution");
  assert.equal(irsOnly.registry_coverage.physical_site_count, 0);
  assert.equal(irsOnly.registry_coverage.irs_eo_organization_filing_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "60601").registry_coverage.ct_business_registry_organization_reported_business_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "80014").registry_coverage.co_business_registry_organization_principal_office_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "97206").registry_coverage.or_business_registry_legal_entity_registration_principal_place_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "97603").registry_coverage.or_business_registry_assumed_business_name_registration_principal_place_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "99998").registry_coverage.fdic_current_location_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "01760").registry_coverage.ncua_reported_us_location_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "00956").registry_coverage.fsis_active_establishment_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "33101").registry_coverage.epa_echo_active_facility_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "90210").registry_coverage.fmcsa_active_registration_principal_office_count, 1);
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
