import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  buildNationalBusinessRegistry,
  ExactPartitionedSet,
  reconcileFdicInstitution,
  reconcileFdicLocation,
  reconcileFsisEstablishment,
  reconcileEpaEchoFacility,
  reconcileFmcsaCompany,
  reconcileIrsEoOrganization,
  reconcileCtBusinessOrganization,
  reconcileDeBusinessLicense,
  reconcileCoBusinessOrganization,
  reconcileOrBusinessRegistration,
  reconcileIaBusinessEntity,
  reconcileNyBusinessOrganization,
  reconcileFlBusinessOrganization,
  reconcilePaBusinessOrganization,
  reconcileLaActiveBusinessLocation,
  reconcileTxActiveSalesTaxOutlet,
  reconcileChicagoActiveBusinessLicenseSite,
  reconcileNycDcwpActiveLicenseSite,
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
import { normalizeDeBusinessLicense } from "./de-business-licenses.mjs";
import { normalizeCoBusinessOrganization } from "./co-business-registry.mjs";
import { normalizeOrBusinessRegistration } from "./or-business-registry.mjs";
import { normalizeIaBusinessEntity } from "./ia-business-registry.mjs";
import { normalizeNyBusinessOrganization } from "./ny-business-registry.mjs";
import { normalizeFlBusinessOrganization } from "./fl-business-registry.mjs";
import { normalizePaBusinessOrganization } from "./pa-business-registry.mjs";
import { normalizeChicagoLicensedSite } from "./chicago-active-business-licenses.mjs";
import { normalizeNycDcwpLicensedSite } from "./nyc-dcwp-active-premises.mjs";
import { normalizeLaActiveBusinessLocation } from "./la-active-businesses.mjs";
import { normalizeTxActiveSalesTaxOutlet } from "./tx-active-sales-tax-permits.mjs";
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

test("exact partitioned entity membership preserves duplicate detection without one monolithic Set", () => {
  const ids = new ExactPartitionedSet();
  ids.add("organization:pa_dos_filing_0000000001");
  ids.add("organization:pa_dos_filing_0000000002");
  ids.add("organization:ny_dos_id_1");
  ids.add("organization:ny_dos_id_01");
  ids.add("site:fmcsa_usdot_123_principal_office");
  ids.add("organization:pa_dos_filing_0000000001");
  assert.equal(ids.size, 5);
  assert.equal(ids.has("organization:pa_dos_filing_0000000001"), true);
  assert.equal(ids.has("organization:ny_dos_id_1"), true);
  assert.equal(ids.has("organization:ny_dos_id_01"), true);
  assert.equal(ids.has("site:fmcsa_usdot_123_principal_office"), true);
  assert.equal(ids.has("organization:pa_dos_filing_0000000099"), false);
  assert.throws(() => ids.add(null), /must be strings/);
});

test("exact partitioned membership shards generic digest identities", () => {
  const ids = new ExactPartitionedSet();
  ids.add("assertion:000aaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  ids.add("assertion:111bbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  ids.add("relationship:fffccccccccccccccccccccccccccccc");
  ids.add("assertion:000aaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(ids.size, 3);
  assert.equal(ids.genericPartitionCount, 3);
  assert.equal(ids.has("assertion:111bbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), true);
  assert.equal(ids.has("assertion:222ddddddddddddddddddddddddddddd"), false);
});

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

function normalizedDeBusinessRecord(licenseNumber = "2026000001", overrides = {}) {
  return normalizeDeBusinessLicense([{
    socrata_row_id: `row-${licenseNumber}`,
    business_name: `FIXTURE DELAWARE ORGANIZATION ${licenseNumber}`,
    trade_name: "FIXTURE DELAWARE MARKET",
    category: "RETAILER  GENERAL",
    current_license_valid_from: "2026-01-01T00:00:00",
    current_license_valid_to: "2026-12-31T00:00:00",
    address_1: "100 MARKET ST",
    address_2: null,
    city: "WILMINGTON",
    state: "DE",
    zip: "19801",
    country: "UNITED STATES",
    license_number: licenseNumber,
    geocoded_location: { latitude: "39.7391", longitude: "-75.5398" },
    ...overrides,
  }], {
    runId: "de-business-source-fixture",
    retrievedAt: "2026-09-01T12:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-31T09:31:57.000Z",
    sourceReleaseId: "de-business-source-fixture",
    baselineByZip: new Map([["19801", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:19801", geoid: "19801" } }]]),
  });
}

async function writeFixtureDeBusinessRelease(root) {
  const releaseId = "de-business-licenses-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [
    normalizedDeBusinessRecord(),
    normalizedDeBusinessRecord("2026000002", { address_1: "1 KING ST", city: "TORONTO", state: "ON", zip: "M5H 1A1", country: "CANADA", geocoded_location: null }),
  ];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-de-business-license-jsonl-gzip", export_policy: "local-review-only" });
  }
  const zipRows = [{
    zip_code: "19801",
    de_business_license_snapshot: { organization_reported_business_address_count: 1 },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:19801" },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }];
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "de-business-licenses-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "de-business-licenses-current",
    release_id: releaseId,
    status: "published",
    complete_current_license_snapshot: true,
    source_release_id: "de-business-source-fixture",
    source_rows_updated_at: "2026-08-31T09:31:57.000Z",
    policy: { record_level_distribution: "local-review-only" },
    coverage: {
      source_current_license_rows: 2,
      accepted_current_license_rows: 2,
      distinct_source_license_numbers: 2,
      distinct_licenses_published: 2,
      quarantined_source_records: 0,
      quarantined_license_groups: 0,
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

function normalizedIaBusinessRecord(corporationNumber = "123456", eligible = true) {
  return normalizeIaBusinessEntity({
    corp_number: corporationNumber,
    legal_name: eligible ? "FIXTURE IOWA COMPANY LLC" : "FIXTURE CANADIAN PARENT INC",
    corporation_type: eligible ? "DOMESTIC LIMITED LIABILITY COMPANY" : "FOREIGN PROFIT",
    effective_date: "2020-06-16",
    ho_address_1: eligible ? "610 EAST LOCUST STREET" : "10 KING STREET",
    ho_address_2: eligible ? "SUITE 200" : "",
    ho_city: eligible ? "DES MOINES" : "TORONTO",
    ho_state: eligible ? "IA" : "ON",
    ho_zip: eligible ? "50309" : "M5V 2T6",
    ho_country: eligible ? "USA" : "CAN",
    ho_latitude: eligible ? "41.5898" : "",
    ho_longitude: eligible ? "-93.6153" : "",
  }, {
    runId: "ia-business-source-fixture",
    retrievedAt: "2026-08-31T12:00:00.000Z",
    sourceModifiedAt: "2026-08-10T12:59:03.509Z",
    sourceReleaseId: "ia-business-source-fixture",
    baselineByZip: new Map([["50309", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:50309", geoid: "50309" } }]]),
  });
}

async function writeFixtureIaBusinessRelease(root) {
  const releaseId = "ia-business-registry-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedIaBusinessRecord("123456", true), normalizedIaBusinessRecord("123457", false)];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/entities/id-hash-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-ia-business-entity-jsonl-gzip" });
  }
  const zipRows = [
    { zip_code: "50309", count: 1 },
    { zip_code: "99999", count: 0 },
  ].map(({ zip_code: zipCode, count }) => ({
    zip_code: zipCode,
    ia_business_registry_active_entity_snapshot: { active_entity_home_office_address_count: count },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}` },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "ia-business-registry-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "ia-business-registry-active-entities",
    release_id: releaseId,
    complete_source_snapshot: true,
    publication_policy: "public-cc-by-4.0-business-fields-only",
    source_release_id: "ia-business-source-fixture",
    source_modified_at: "2026-08-10T12:59:03.509Z",
    coverage: {
      source_rows: 2,
      active_entities_published: 2,
      quarantined_entities: 0,
      entities_with_eligible_us_home_office_address: 1,
      eligible_us_entity_zip_contributions: 1,
      entities_with_source_geocoded_coordinates: 1,
    },
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedNyBusinessRecord(dosId = "1234567", eligible = true) {
  return normalizeNyBusinessOrganization({
    dos_id: dosId,
    current_entity_name: eligible ? "FIXTURE NEW YORK COMPANY LLC" : "FIXTURE FOREIGN COMPANY INC",
    initial_dos_filing_date: "2020-06-16",
    county: eligible ? "NEW YORK" : "ALBANY",
    jurisdiction: eligible ? "NEW YORK" : "CANADA",
    entity_type: eligible ? "DOMESTIC LIMITED LIABILITY COMPANY" : "FOREIGN BUSINESS CORPORATION",
    location_address_1: eligible ? "350 FIFTH AVENUE" : "10 KING STREET",
    location_address_2: eligible ? "SUITE 200" : "",
    location_city: eligible ? "NEW YORK" : "TORONTO",
    location_state: eligible ? "NY" : "ON",
    location_zip: eligible ? "60601-1234" : "M5V 2T6",
  }, {
    runId: "ny-business-source-fixture",
    retrievedAt: "2026-08-31T12:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-30T12:29:07.000Z",
    sourceReleaseId: "ny-business-source-fixture",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  });
}

async function writeFixtureNyBusinessRelease(root) {
  const releaseId = "ny-business-registry-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedNyBusinessRecord("1234567", true), normalizedNyBusinessRecord("1234568", false)];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-ny-business-organization-jsonl-gzip" });
  }
  const zipRows = [
    { zip_code: "60601", count: 1 },
    { zip_code: "99999", count: 0 },
  ].map(({ zip_code: zipCode, count }) => ({
    zip_code: zipCode,
    ny_business_registry_active_entity_snapshot: { organization_reported_location_address_count: count },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}` },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "ny-business-registry-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "ny-business-registry-active-entities",
    release_id: releaseId,
    status: "published",
    complete_selected_business_entities_snapshot: true,
    source_release_id: "ny-business-source-fixture",
    source_rows_updated_at: "2026-08-30T12:29:07.000Z",
    source: { license: "OPEN-NY Terms of Use; no dataset-specific catalog license" },
    coverage: {
      source_active_extract_records: 2,
      organizations_published: 2,
      quarantined_source_records: 0,
      eligible_reported_us_location_addresses: 1,
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

function normalizedFlBusinessRecord(documentNumber = "L26000451320", eligible = true) {
  return normalizeFlBusinessOrganization({
    corporation_number: documentNumber,
    corporation_name: eligible ? "FIXTURE FLORIDA COMPANY LLC" : "FIXTURE FOREIGN COMPANY INC",
    status: "A",
    filing_type: eligible ? "FLAL" : "FORP",
    principal_address_1: eligible ? "100 OCEAN DRIVE" : "10 KING STREET",
    principal_address_2: eligible ? "SUITE 200" : null,
    principal_city: eligible ? "MIAMI" : "TORONTO",
    principal_state: eligible ? null : "ON",
    principal_zip: eligible ? "60601-1234" : "M5V 2T6",
    principal_country: eligible ? null : "CA",
    file_date: "08262026",
    last_transaction_date: "08302026",
    jurisdiction: eligible ? "FL" : "ON",
    report_year_1: "2026",
    report_date_1: "08152026",
    report_year_2: null,
    report_date_2: null,
    report_year_3: null,
    report_date_3: null,
  }, {
    runId: "fl-business-source-fixture",
    retrievedAt: "2026-08-31T12:00:00.000Z",
    sourceModifiedAt: "2026-07-10T17:41:15.000Z",
    sourceReleaseId: "fl-business-source-fixture",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  });
}

async function writeFixtureFlBusinessRelease(root) {
  const releaseId = "fl-business-registry-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedFlBusinessRecord("L26000451320", true), normalizedFlBusinessRecord("P26000000001", false)];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-fl-business-organization-jsonl-gzip" });
  }
  const zipRows = [
    { zip_code: "60601", count: 1 },
    { zip_code: "99999", count: 0 },
  ].map(({ zip_code: zipCode, count }) => ({
    zip_code: zipCode,
    fl_business_registry_quarterly_active_entity_snapshot: { organization_reported_principal_address_count: count },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}` },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "fl-business-registry-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "fl-business-registry-quarterly-active-entities",
    release_id: releaseId,
    status: "published",
    complete_selected_quarterly_active_entity_snapshot: true,
    raw_archive_retained: false,
    source_release_id: "fl-business-source-fixture",
    source_modified_at: "2026-07-10T17:41:15.000Z",
    coverage: {
      source_records: 4,
      active_source_records: 3,
      inactive_source_records_excluded: 1,
      organizations_published: 2,
      quarantined_source_records: 1,
      eligible_reported_us_principal_addresses: 1,
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

function normalizedPaBusinessRecord(filingNumber = "0000000001", eligible = true) {
  return normalizePaBusinessOrganization({
    socrata_row_id: `row-${filingNumber}`,
    business_name: eligible ? "Fixture Pennsylvania Company LLC" : "Fixture Incomplete Pennsylvania Company Inc.",
    filing_number: filingNumber,
    address_line1: eligible ? "100 Market St" : null,
    address_line2: eligible ? "Suite 200" : null,
    city: eligible ? "Harrisburg" : null,
    state: eligible ? "PA" : null,
    zip: eligible ? "17101-1234" : null,
    typeofbusinessregistration: "Domestic Limited Liability Company",
    shortcountyname: eligible ? "Dauphin" : null,
    county_code: eligible ? "22" : null,
    georeferenced_latitude__longitude: eligible ? { type: "Point", coordinates: [-76.884, 40.264] } : null,
  }, {
    runId: "pa-business-source-fixture",
    retrievedAt: "2026-08-31T16:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-04T14:12:34.000Z",
    sourceReleaseId: "pa-business-source-fixture",
    baselineByZip: new Map([["17101", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:17101", geoid: "17101" } }]]),
  });
}

async function writeFixturePaBusinessRelease(root) {
  const releaseId = "pa-business-registry-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedPaBusinessRecord("0000000001", true), normalizedPaBusinessRecord("0000000002", false)];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-pa-business-organization-jsonl-gzip" });
  }
  const zipRows = [
    { zip_code: "17101", count: 1 },
    { zip_code: "99999", count: 0 },
  ].map(({ zip_code: zipCode, count }) => ({
    zip_code: zipCode,
    pa_business_registry_active_snapshot: { organization_reported_business_address_count: count },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}` },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "pa-business-registry-zip-coverage-jsonl" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "pa-business-registry-active-registrations",
    release_id: releaseId,
    status: "published",
    complete_active_registration_snapshot: true,
    source_release_id: "pa-business-source-fixture",
    source_rows_updated_at: "2026-08-04T14:12:34.000Z",
    coverage: {
      source_active_registration_rows: 3,
      distinct_active_registration_organizations_published: 2,
      duplicate_filing_number_groups: 1,
      duplicate_rows_collapsed: 1,
      eligible_reported_us_business_addresses: 1,
      organizations_without_eligible_us_zip_address: 1,
      source_geocoded_reported_business_addresses: 1,
      reported_pa_address_geocodes_outside_broad_pa_bounds: 0,
    },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedLaActiveBusinessRecord(locationAccount = "0000000108-0001-3", zipCode = "90019-6037") {
  return normalizeLaActiveBusinessLocation({
    socrata_row_id: `row-${locationAccount}`,
    location_account: locationAccount,
    business_name: "Fixture Los Angeles Company LLC",
    dba_name: "Fixture Market|Fixture Shop",
    street_address: "1727 CRENSHAW BLVD",
    city: "LOS ANGELES",
    zip_code: zipCode,
    naics: "445110",
    primary_naics_description: "Supermarkets and other grocery stores",
    council_district: "10",
    location_start_date: "1991-05-15T00:00:00.000",
    location_end_date: null,
    location_1: { latitude: "34.0425", longitude: "-118.3295", human_address: "{}" },
  }, {
    runId: "la-active-business-source-fixture",
    retrievedAt: "2026-08-31T20:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-15T15:37:22.000Z",
    sourceReleaseId: "la-active-business-source-fixture",
    baselineByZip: new Map([
      ["90019", { postal_label: { preferred_state: "CA" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:90019", geoid: "90019" } }],
      ["90026", { postal_label: { preferred_state: "CA" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:90026", geoid: "90026" } }],
    ]),
  });
}

async function writeFixtureLaActiveBusinessRelease(root) {
  const releaseId = "la-active-business-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedLaActiveBusinessRecord(), normalizedLaActiveBusinessRecord("0000000109-0001-1", "90026-")];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(record.external_identifiers[0].value)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `normalized/locations/prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-la-active-business-location-jsonl-gzip", export_policy: "local-review-only" });
  }
  const zipRows = [
    { zip_code: "90019", count: 1 },
    { zip_code: "90026", count: 1 },
    { zip_code: "99999", count: 0 },
  ].map(({ zip_code: zip, count }) => ({
    zip_code: zip,
    la_active_business_snapshot: { registered_business_location_count: count },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zip}` },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "la-active-business-zip-coverage-jsonl", distribution_policy: "public-aggregate-with-source-limitations" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "la-active-business-location-accounts",
    release_id: releaseId,
    status: "complete",
    complete_source_snapshot: true,
    source_release_id: "la-active-business-source-fixture",
    source: { rows_updated_at: "2026-08-15T15:37:22.000Z" },
    coverage: {
      source_location_accounts: 3,
      normalized_us_location_accounts: 2,
      quarantined_source_records: 1,
      source_geocoded_locations: 2,
      in_city_council_district_locations: 2,
      out_of_city_locations: 0,
      suspect_in_city_coordinates: 0,
      physical_sites: 2,
      establishments: 2,
    },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function normalizedTxActiveSalesTaxOutlet(taxpayerNumber = "32089812484", outletNumber = "1", zipCode = "78701") {
  return normalizeTxActiveSalesTaxOutlet({
    socrata_row_id: `row-${taxpayerNumber}-${outletNumber}`,
    taxpayer_number: taxpayerNumber,
    taxpayer_name: "FIXTURE MARKETS LLC",
    taxpayer_organization_type: "CL",
    outlet_number: outletNumber,
    outlet_name: `FIXTURE MARKET ${outletNumber}`,
    outlet_address: outletNumber === "1" ? "100 CONGRESS AVE STE 100" : "200 MAIN ST",
    outlet_city: outletNumber === "1" ? "AUSTIN" : "DALLAS",
    outlet_state: "TX",
    outlet_zip_code: zipCode,
    outlet_county_code: outletNumber === "1" ? "227" : "113",
    outlet_naics_code: "445110",
    outlet_inside_outside_city_limits_indicator: outletNumber === "1" ? "Y" : "N",
    outlet_permit_issue_date: "2020-03-04T00:00:00.000",
    outlet_first_sales_date: "2020-03-05T00:00:00.000",
  }, {
    runId: "tx-sales-tax-source-fixture",
    retrievedAt: "2026-08-31T20:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-29T08:21:49.000Z",
    sourceReleaseId: "tx-sales-tax-source-fixture",
    baselineByZip: new Map([
      ["78701", { postal_label: { preferred_state: "TX" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:78701", geoid: "78701" } }],
      ["75001", { postal_label: { preferred_state: "TX" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:75001", geoid: "75001" } }],
    ]),
  });
}

function normalizedChicagoActiveBusinessLicenseSite(accountNumber = "122", siteNumber = "1", zipCode = "60630") {
  const base = {
    account_number: accountNumber,
    site_number: siteNumber,
    legal_name: "FIXTURE CHICAGO MARKETS LLC",
    doing_business_as_name: `FIXTURE CHICAGO MARKET ${siteNumber}`,
    address: siteNumber === "1" ? "5368 N MILWAUKEE AVE" : "100 N STATE ST",
    city: "CHICAGO",
    state: "IL",
    zip_code: zipCode,
    ward: siteNumber === "1" ? "45" : "42",
    precinct: "32",
    ward_precinct: "45-32",
    police_district: "16",
    community_area: "11",
    community_area_name: "JEFFERSON PARK",
    neighborhood: "JEFFERSON PARK",
    latitude: "41.9783639255",
    longitude: "-87.7703772018",
    license_status: "AAI",
    expiration_date: "2027-05-15T00:00:00.000",
    license_start_date: "2025-05-16T00:00:00.000",
    date_issued: "2025-05-05T00:00:00.000",
    application_type: "RENEW",
  };
  return normalizeChicagoLicensedSite([
    { ...base, socrata_row_id: `row-${accountNumber}-${siteNumber}-1`, id: "654-20250516", license_id: `${accountNumber}${siteNumber}01`, license_number: "654", license_code: "1470", license_description: "Tavern", business_activity_id: "829", business_activity: "Tavern - Consumption of Liquor on Premises" },
    { ...base, socrata_row_id: `row-${accountNumber}-${siteNumber}-2`, id: "653-20250516", license_id: `${accountNumber}${siteNumber}02`, license_number: "653", license_code: "1006", license_description: "Retail Food Establishment", business_activity_id: "775", business_activity: "Retail Sales of Perishable Foods" },
  ], {
    runId: "chicago-license-source-fixture",
    retrievedAt: "2026-09-01T01:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-29T09:58:27.000Z",
    sourceFilterDate: "2026-08-31",
    sourceReleaseId: "chicago-license-source-fixture",
    baselineByZip: new Map([[zipCode.slice(0, 5), { postal_label: { preferred_state: "IL" }, geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode.slice(0, 5)}`, geoid: zipCode.slice(0, 5) } }]]),
  });
}

function normalizedNycDcwpActiveLicenseSite(businessUniqueId = "BA-1305489-2022", zipCode = "10018") {
  const base = {
    business_name: "HUDSON GROUP (HG) RETAIL, LLC",
    dba_trade_name: "HUDSON STORE 1152",
    business_unique_id: businessUniqueId,
    license_type: "Premises",
    license_status: "Active",
    address_type: "Complete Address",
    address_building: "625",
    address_street_name: "8TH AVE",
    unit_type: "STE",
    apt_suite: "101",
    address_city: "NEW YORK",
    address_state: "NY",
    address_zip: zipCode,
    address_borough: "Manhattan",
    community_board: "104",
    council_district: "03",
    bin: "1083268",
    bbl: "1010320029",
    nta: "MN15",
    census_block_2010_: "1001",
    census_tract: "115",
    latitude: "40.7561920718278",
    longitude: "-73.99056478174674",
  };
  return normalizeNycDcwpLicensedSite([
    { ...base, socrata_row_id: "row-nyc-1", license_nbr: "1373079-DCA", business_category: "Tobacco Retail Dealer", license_creation_date: "2010-10-01T00:00:00", lic_expir_dd: "2027-12-31T00:00:00" },
    { ...base, socrata_row_id: "row-nyc-2", license_nbr: "2091999-DCA", business_category: "Electronic Store", license_creation_date: "2022-01-01T00:00:00", lic_expir_dd: "2027-12-31T00:00:00" },
  ], {
    runId: "nyc-dcwp-source-fixture",
    retrievedAt: "2026-09-01T02:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-20T13:24:53.000Z",
    sourceReleaseId: "nyc-dcwp-source-fixture",
    baselineByZip: new Map([[zipCode, { postal_label: { preferred_state: "NY" }, geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode } }]]),
  });
}

async function writeFixtureTxActiveSalesTaxRelease(root) {
  const releaseId = "tx-active-sales-tax-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedTxActiveSalesTaxOutlet(), normalizedTxActiveSalesTaxOutlet("32089812484", "2", "75001")];
  const artifacts = [];
  for (const prefix of "0123456789abcdef") {
    const partitionRecords = records.filter((record) => sha256(`${record.external_identifiers[0].value}:${record.external_identifiers[1].value}`)[0] === prefix);
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `normalized/outlets/prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({ path: relativePath, bytes: buffer.length, sha256: sha256(buffer), record_count: partitionRecords.length, artifact_type: "normalized-tx-active-sales-tax-outlet-jsonl-gzip", export_policy: "local-review-only" });
  }
  const zipRows = [
    { zip_code: "78701", count: 1 },
    { zip_code: "75001", count: 1 },
    { zip_code: "99999", count: 0 },
  ].map(({ zip_code: zip, count }) => ({
    zip_code: zip,
    tx_active_sales_tax_snapshot: { permitted_outlet_count: count },
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zip}` },
    employer_baseline: { status: "published", establishments: 1000 },
    baseline_coverage_status: "zbp-and-zcta",
  }));
  const zipBuffer = Buffer.from(`${zipRows.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived/zip-coverage.jsonl"), zipBuffer);
  artifacts.push({ path: "derived/zip-coverage.jsonl", bytes: zipBuffer.length, sha256: sha256(zipBuffer), record_count: zipRows.length, artifact_type: "tx-active-sales-tax-permit-zip-coverage-jsonl", distribution_policy: "public-aggregate-with-source-limitations" });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "tx-active-sales-tax-outlets",
    release_id: releaseId,
    status: "complete",
    complete_source_snapshot: true,
    source_release_id: "tx-sales-tax-source-fixture",
    source: { rows_updated_at: "2026-08-29T08:21:49.000Z" },
    coverage: {
      source_outlet_permits: 3,
      normalized_outlet_permits: 2,
      unique_taxpayers: 1,
      quarantined_source_records: 1,
      inside_city_limits_outlets: 1,
      outside_city_limits_outlets: 1,
      city_limits_unreported_outlets: 0,
      physical_sites: 2,
      establishments: 2,
      organizations: 1,
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

test("reconciles Delaware current-license evidence without creating physical sites or relationships", () => {
  const result = reconcileDeBusinessLicense(normalizedDeBusinessRecord());
  assert.equal(result.entity.entity_id, "organization:de_dor_license_2026000001");
  assert.equal(result.entity.entity_type, "organization");
  assert.equal(result.zipCode, "19801");
  assert(result.assertions.some((item) => item.predicate === "organization.de-current-license-status"));
  assert(result.assertions.some((item) => item.predicate === "organization.other-name"));
  assert(result.assertions.every((item) => item.export_policy === "local-review-only"));
  assert.equal(result.relationships, undefined);
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

test("reconciles Iowa active-entity evidence without inventing sites, owners, or relationships", () => {
  const result = reconcileIaBusinessEntity(normalizedIaBusinessRecord());
  assert.equal(result.entity.entity_type, "organization");
  assert.equal(result.zipCode, "50309");
  assert(result.assertions.some((item) => item.predicate === "organization.home-office-address"));
  assert(result.assertions.some((item) => item.predicate === "organization.home-office-address-coordinate"));
  assert(result.assertions.some((item) => item.predicate === "organization.ia-registration-status"));
  assert(result.assertions.every((item) => item.subject_entity_id === "organization:ia_sos_corp_123456"));
  assert(result.assertions.every((item) => !String(item.source.source_field).toLowerCase().includes("registered_agent")));
});

test("reconciles New York active-extract evidence without inventing sites, owners, or relationships", () => {
  const result = reconcileNyBusinessOrganization(normalizedNyBusinessRecord());
  assert.equal(result.entity.entity_type, "organization");
  assert.equal(result.zipCode, "60601");
  assert(result.assertions.some((item) => item.predicate === "organization.reported-location-address"));
  assert(result.assertions.some((item) => item.predicate === "organization.ny-registration-profile"));
  assert(result.assertions.some((item) => item.predicate === "organization.ny-active-extract-status"));
  assert(result.assertions.every((item) => item.subject_entity_id === "organization:ny_dos_id_1234567"));
  assert(result.assertions.every((item) => item.export_policy === "public-open-ny-terms"));
  assert(result.assertions.every((item) => !/(registered_agent|ceo|chairman|process_address)/i.test(String(item.source.source_field))));
});

test("reconciles Florida active quarterly evidence without inventing sites, owners, agents, or relationships", () => {
  const result = reconcileFlBusinessOrganization(normalizedFlBusinessRecord());
  assert.equal(result.entity.entity_type, "organization");
  assert.equal(result.zipCode, "60601");
  assert(result.assertions.some((item) => item.predicate === "organization.reported-principal-address"));
  assert(result.assertions.some((item) => item.predicate === "organization.fl-registration-profile"));
  assert(result.assertions.some((item) => item.predicate === "organization.fl-active-quarterly-status"));
  assert(result.assertions.every((item) => item.subject_entity_id === "organization:fl_document_l26000451320"));
  assert(result.assertions.every((item) => !/(fei|mail_address|registered_agent|officer)/i.test(String(item.source.source_field))));
});

test("reconciles Pennsylvania active-registration evidence without inventing sites, owners, officers, or relationships", () => {
  const result = reconcilePaBusinessOrganization(normalizedPaBusinessRecord());
  assert.equal(result.entity.entity_type, "organization");
  assert.equal(result.zipCode, "17101");
  assert(result.assertions.some((item) => item.predicate === "organization.reported-business-address"));
  assert(result.assertions.some((item) => item.predicate === "organization.reported-business-address-coordinate"));
  assert(result.assertions.some((item) => item.predicate === "organization.pa-registration-profile"));
  assert(result.assertions.some((item) => item.predicate === "organization.pa-active-registration-dataset-status"));
  assert(result.assertions.every((item) => item.subject_entity_id === "organization:pa_dos_filing_0000000001"));
  assert(result.assertions.every((item) => !/(party_type|last_name|middle_name|first_name|governor|officer|principal|agent)/i.test(String(item.source.source_field))));
});

test("reconciles Los Angeles source-defined active location evidence without inventing ownership or public access", () => {
  const result = reconcileLaActiveBusinessLocation(normalizedLaActiveBusinessRecord());
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["physical_site", "establishment"]);
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["located_at"]);
  assert(result.assertions.some((item) => item.predicate === "site.address"));
  assert(result.assertions.some((item) => item.predicate === "establishment.la-active-business-status"));
  assert(result.assertions.some((item) => item.predicate === "establishment.self-reported-naics"));
  assert(result.assertions.every((item) => item.export_policy === "local-review-only"));
  assert(result.assertions.every((item) => !/(mailing|computed_region|location_description)/i.test(String(item.source.source_field))));
});

test("reconciles Texas sales-tax permit evidence into one organization, outlet, and physical site", () => {
  const result = reconcileTxActiveSalesTaxOutlet(normalizedTxActiveSalesTaxOutlet());
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["organization", "physical_site", "establishment"]);
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["operates", "located_at"]);
  assert(result.organizationAssertions.some((item) => item.predicate === "organization.legal-name"));
  assert(result.locationAssertions.some((item) => item.predicate === "establishment.source-status"));
  assert(result.locationAssertions.some((item) => item.predicate === "establishment.self-reported-naics"));
  assert([...result.organizationAssertions, ...result.locationAssertions].every((item) => item.export_policy === "local-review-only"));
  assert([...result.organizationAssertions, ...result.locationAssertions].every((item) => !/taxpayer_(address|city|state|zip|county)/i.test(String(item.source.source_field))));
});

test("reconciles grouped Chicago active licenses into one organization, site, and establishment", () => {
  const result = reconcileChicagoActiveBusinessLicenseSite(normalizedChicagoActiveBusinessLicenseSite());
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["organization", "physical_site", "establishment"]);
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["operates", "located_at"]);
  assert(result.organizationAssertions.some((item) => item.predicate === "organization.legal-name"));
  assert.equal(result.locationAssertions.filter((item) => item.predicate === "establishment.chicago-active-license").length, 2);
  assert.equal(result.locationAssertions.filter((item) => item.predicate === "establishment.name").length, 1);
  assert([...result.organizationAssertions, ...result.locationAssertions].every((item) => item.export_policy === "local-review-only"));
  assert([...result.organizationAssertions, ...result.locationAssertions].every((item) => !/(officer|owner|agent|contact|phone|email|payment)/i.test(String(item.source.source_field))));
});

test("reconciles grouped NYC DCWP active premise licenses into one organization, site, and establishment", () => {
  const result = reconcileNycDcwpActiveLicenseSite(normalizedNycDcwpActiveLicenseSite());
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["organization", "physical_site", "establishment"]);
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["operates", "located_at"]);
  assert(result.organizationAssertions.some((item) => item.predicate === "organization.legal-name"));
  assert.equal(result.locationAssertions.filter((item) => item.predicate === "establishment.nyc-dcwp-active-premise-license").length, 2);
  assert.equal(result.locationAssertions.filter((item) => item.predicate === "establishment.name").length, 1);
  assert([...result.organizationAssertions, ...result.locationAssertions].every((item) => item.export_policy === "local-review-only"));
  assert([...result.organizationAssertions, ...result.locationAssertions].every((item) => !/(owner|officer|agent|contact|phone|email|detail|payment)/i.test(String(item.source.source_field))));
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
  const deBusinessPointer = await writeFixtureDeBusinessRelease(path.join(root, "de-business"));
  const coBusinessPointer = await writeFixtureCoBusinessRelease(path.join(root, "co-business"));
  const orBusinessPointer = await writeFixtureOrBusinessRelease(path.join(root, "or-business"));
  const iaBusinessPointer = await writeFixtureIaBusinessRelease(path.join(root, "ia-business"));
  const nyBusinessPointer = await writeFixtureNyBusinessRelease(path.join(root, "ny-business"));
  const flBusinessPointer = await writeFixtureFlBusinessRelease(path.join(root, "fl-business"));
  const paBusinessPointer = await writeFixturePaBusinessRelease(path.join(root, "pa-business"));
  const laActiveBusinessesPointer = await writeFixtureLaActiveBusinessRelease(path.join(root, "la-active-businesses"));
  const txActiveSalesTaxPointer = await writeFixtureTxActiveSalesTaxRelease(path.join(root, "tx-sales-tax"));
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
    deBusinessPointer,
    coBusinessPointer,
    orBusinessPointer,
    iaBusinessPointer,
    nyBusinessPointer,
    flBusinessPointer,
    paBusinessPointer,
    laActiveBusinessesPointer,
    txActiveSalesTaxPointer,
    uspsZipsPointer,
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  });
  assert.equal(result.manifest.complete_national_business_registry, false);
  assert.equal(result.manifest.coverage.organizations, 20);
  assert.equal(result.manifest.coverage.brands, 1);
  assert.equal(result.manifest.coverage.physical_sites, 16);
  assert.equal(result.manifest.coverage.establishments, 16);
  assert.equal(result.manifest.coverage.fsis_establishment_records, 2);
  assert.equal(result.manifest.coverage.epa_echo_active_facility_records, 2);
  assert.equal(result.manifest.coverage.fmcsa_active_principal_office_records, 2);
  assert.equal(result.manifest.coverage.irs_eo_organization_records, 2);
  assert.equal(result.manifest.coverage.ct_business_registry_active_organization_records, 2);
  assert.equal(result.manifest.coverage.ct_business_registry_eligible_reported_us_business_addresses, 1);
  assert.equal(result.manifest.coverage.de_business_license_current_organization_records, 2);
  assert.equal(result.manifest.coverage.de_business_license_eligible_reported_us_business_addresses, 1);
  assert.equal(result.manifest.coverage.co_business_registry_good_standing_or_delinquent_organization_records, 2);
  assert.equal(result.manifest.coverage.co_business_registry_eligible_reported_us_business_addresses, 1);
  assert.equal(result.manifest.coverage.or_business_registry_source_principal_place_rows, 3);
  assert.equal(result.manifest.coverage.or_business_registry_active_registration_records, 2);
  assert.equal(result.manifest.coverage.or_business_registry_legal_entity_registrations, 1);
  assert.equal(result.manifest.coverage.or_business_registry_assumed_business_name_registrations, 1);
  assert.equal(result.manifest.coverage.or_business_registry_eligible_registration_zip_contributions, 3);
  assert.equal(result.manifest.coverage.ia_business_registry_active_organization_records, 2);
  assert.equal(result.manifest.coverage.ia_business_registry_entities_with_eligible_us_home_office_address, 1);
  assert.equal(result.manifest.coverage.ia_business_registry_eligible_entity_zip_contributions, 1);
  assert.equal(result.manifest.coverage.ia_business_registry_entities_with_source_geocoded_coordinates, 1);
  assert.equal(result.manifest.coverage.ny_business_registry_active_organization_records, 2);
  assert.equal(result.manifest.coverage.ny_business_registry_eligible_reported_us_location_addresses, 1);
  assert.equal(result.manifest.coverage.fl_business_registry_active_organization_records, 2);
  assert.equal(result.manifest.coverage.fl_business_registry_inactive_source_records_excluded, 1);
  assert.equal(result.manifest.coverage.fl_business_registry_quarantined_source_records, 1);
  assert.equal(result.manifest.coverage.fl_business_registry_eligible_reported_us_principal_addresses, 1);
  assert.equal(result.manifest.coverage.pa_business_registry_source_active_registration_rows, 3);
  assert.equal(result.manifest.coverage.pa_business_registry_active_organization_records, 2);
  assert.equal(result.manifest.coverage.pa_business_registry_duplicate_filing_number_groups, 1);
  assert.equal(result.manifest.coverage.pa_business_registry_duplicate_rows_collapsed, 1);
  assert.equal(result.manifest.coverage.pa_business_registry_eligible_reported_us_business_addresses, 1);
  assert.equal(result.manifest.coverage.la_active_business_source_location_accounts, 3);
  assert.equal(result.manifest.coverage.la_active_business_normalized_us_location_accounts, 2);
  assert.equal(result.manifest.coverage.la_active_business_quarantined_source_records, 1);
  assert.equal(result.manifest.coverage.tx_active_sales_tax_source_outlet_permits, 3);
  assert.equal(result.manifest.coverage.tx_active_sales_tax_normalized_outlet_permits, 2);
  assert.equal(result.manifest.coverage.tx_active_sales_tax_unique_taxpayers, 1);
  assert.equal(result.manifest.coverage.tx_active_sales_tax_quarantined_source_records, 1);
  assert.match(result.manifest.export_policy, /local-review-only/);
  assert.equal(result.manifest.coverage.relationships, 24);
  assert.equal(result.manifest.coverage.resolution_location_profiles, 16);
  const resolutionProfiles = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "entity-resolution-location-profile-jsonl-gzip");
  assert.equal(resolutionProfiles.length, 100);
  assert.equal(resolutionProfiles.reduce((sum, artifact) => sum + artifact.record_count, 0), 16);
  assert.equal(result.manifest.coverage.zip_union_records, 20);
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
  assert.equal(zipRows.find((row) => row.zip_code === "19801").registry_coverage.de_business_license_organization_reported_business_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "80014").registry_coverage.co_business_registry_organization_principal_office_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "97206").registry_coverage.or_business_registry_legal_entity_registration_principal_place_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "97603").registry_coverage.or_business_registry_assumed_business_name_registration_principal_place_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "50309").registry_coverage.ia_business_registry_organization_home_office_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "60601").registry_coverage.ny_business_registry_organization_reported_location_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "60601").registry_coverage.fl_business_registry_organization_reported_principal_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "17101").registry_coverage.pa_business_registry_organization_reported_business_address_count, 1);
  assert.equal(zipRows.find((row) => row.zip_code === "90019").registry_coverage.la_active_business_registered_location_count, 1);
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
