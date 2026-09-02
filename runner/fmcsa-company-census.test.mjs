import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildFmcsaCompanyCensus,
  FMCSA_DICTIONARY_ASSET_ID,
  FMCSA_DICTIONARY_FILENAME,
  FMCSA_SCHEMA_FINGERPRINT,
  FMCSA_SELECTED_COLUMNS,
  normalizeFmcsaCompany,
  verifyFmcsaCompanyCensus,
} from "./fmcsa-company-census.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function csv(rows) {
  const headers = FMCSA_SELECTED_COLUMNS.map(([name]) => name);
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))].map((row) => row.map(quote).join(",")).join("\n")}\n`;
}

function company(overrides = {}) {
  return {
    mcs150_date: "20260829 1030",
    add_date: "20120103",
    status_code: "A",
    dot_number: "100",
    carrier_operation: "A",
    business_org_id: "3",
    business_org_desc: "CORPORATION",
    carship: "C;S",
    classdef: "PRIVATE PROPERTY;AUTHORIZED FOR HIRE",
    legal_name: "Fixture Logistics LLC",
    dba_name: "Fixture Freight",
    phy_street: "10 Main St",
    phy_city: "Chicago",
    phy_country: "US",
    phy_state: "IL",
    phy_zip: "606011234",
    phy_cnty: "031",
    phy_omc_region: "05",
    undeliv_phy: "",
    hm_ind: "N",
    docket1prefix: "MC",
    docket1: "12345",
    docket1_status_code: "A",
    ...overrides,
  };
}

function context() {
  return {
    runId: "fmcsa-fixture-run",
    retrievedAt: "2026-08-30T18:00:00.000Z",
    sourceUpdatedAt: "2026-08-30T11:55:17.000Z",
    sourceReleaseId: "fmcsa-fixture-source",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  };
}

function metadata(activeUsRecords, columns = FMCSA_SELECTED_COLUMNS) {
  return {
    metadata: {
      id: "az4n-8mr2",
      name: "Company Census File",
      rowsUpdatedAt: 1788090917,
      columns: columns.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName, name: fieldName.toUpperCase() })),
      metadata: { attachments: [{ filename: FMCSA_DICTIONARY_FILENAME, assetId: FMCSA_DICTIONARY_ASSET_ID }] },
    },
    datasetRecords: activeUsRecords + 12,
    activeUsRecords,
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["00956", "60601", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = {
    dataset_id: "census-zbp-baseline",
    release_id: "zbp-fixture",
    complete_national_release: true,
    geography_dependency: { dataset_id: "us-census-geography", release_id: "geo-fixture" },
    artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer) }],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointer = path.join(root, "current.json");
  await writeFile(pointer, `${JSON.stringify({ manifest: "releases/zbp-fixture/manifest.json" })}\n`);
  return pointer;
}

async function gunzipRecords(filename) {
  const compressed = await readFile(filename);
  const chunks = [];
  const stream = createGunzip();
  stream.on("data", (chunk) => chunks.push(chunk));
  stream.end(compressed);
  await new Promise((resolve, reject) => stream.on("end", resolve).on("error", reject));
  return Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

test("pins the minimized FMCSA selected schema", () => {
  assert.equal(FMCSA_SELECTED_COLUMNS.length, 29);
  assert.equal(sha256(FMCSA_SELECTED_COLUMNS.map(([name, type]) => `${name}:${type}`).join("\u0000")), FMCSA_SCHEMA_FINGERPRINT);
});

test("normalizes source-specific active registration and does not infer an organization", () => {
  const normalized = normalizeFmcsaCompany(company({ docket2prefix: "MC", docket2: "12345", docket2_status_code: "A" }), context());
  assert.equal(normalized.external_identifiers[0].value, "100");
  assert.equal(normalized.address.postal_code, "60601");
  assert.equal(normalized.address.zip4, "1234");
  assert.equal(normalized.entity_candidates.organization_id, undefined);
  assert.equal(normalized.registration_profile.business_organization_type.completeness_warning, "source-dictionary-identifies-this-as-review-only-and-the-field-is-not-complete");
  assert.deepEqual(normalized.registration_profile.entity_roles.map((item) => item.label), ["carrier", "shipper"]);
  assert.equal(normalized.registration_profile.authority_dockets.length, 2);
  assert.equal(normalized.external_identifiers.filter((item) => item.type === "fmcsa_docket_number").length, 1);
  assert.equal(normalized.data_sensitivity.may_identify_individual_proprietor, true);
  assert.throws(() => normalizeFmcsaCompany(company({ status_code: "I" }), context()), /not-fmcsa-active/);
  assert.throws(() => normalizeFmcsaCompany(company({ undeliv_phy: "U" }), context()), /undeliverable/);
  assert.throws(() => normalizeFmcsaCompany(company({ phy_country: "CA" }), context()), /outside-us/);
});

test("builds and independently verifies a governed FMCSA selected release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fmcsa-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    company(),
    company({ dot_number: "101", legal_name: "Island Carrier Inc", phy_state: "PR", phy_city: "Bayamon", phy_street: "20 Isla Rd", phy_zip: "00956", dba_name: "", business_org_id: "", business_org_desc: "" }),
    company({ dot_number: "102", legal_name: "Undeliverable Carrier", undeliv_phy: "U" }),
    company({ dot_number: "103", legal_name: "Invalid Province", phy_state: "ON" }),
  ];
  const sourceCsvPath = path.join(root, "source.csv");
  const dictionaryPath = path.join(root, "dictionary.pdf");
  await writeFile(sourceCsvPath, csv(rows));
  await writeFile(dictionaryPath, "%PDF-1.4\nfixture dictionary\n");
  const result = await buildFmcsaCompanyCensus({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    sourceCsvPath,
    dictionaryPath,
    sourceMetadata: metadata(rows.length),
    minimumAcceptedRecords: 1,
    maximumQuarantineRate: 0.6,
    logger: () => {},
    now: () => new Date("2026-08-30T18:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.selected_active_us_and_territory_records, 4);
  assert.equal(result.manifest.coverage.accepted_principal_office_records, 2);
  assert.equal(result.manifest.coverage.quarantined_selected_records, 2);
  assert.equal(result.manifest.privacy.source_columns_acquired, 29);
  const verified = await verifyFmcsaCompanyCensus(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const partition = result.manifest.artifacts.find((artifact) => artifact.path === "derived/records/zip-prefix=6.jsonl.gz");
  const records = await gunzipRecords(path.join(result.releaseDirectory, partition.path));
  assert.equal(records.length, 1);
  assert.equal(records[0].entity_candidates.organization_id, undefined);
  assert.equal(records[0].external_identifiers.some((item) => item.type === "fmcsa_docket_number" && item.value === "MC12345"), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "fmcsa-selected-source-csv");
  assert.equal(sourceArtifact.export_policy, "internal");
});

test("rejects selected schema drift and non-unique USDOT ordering", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fmcsa-drift-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const sourceCsvPath = path.join(root, "source.csv");
  const dictionaryPath = path.join(root, "dictionary.pdf");
  await writeFile(sourceCsvPath, csv([company(), company({ dot_number: "100" })]));
  await writeFile(dictionaryPath, "%PDF-1.4\nfixture dictionary\n");
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  await assert.rejects(() => buildFmcsaCompanyCensus({
    outputRoot: path.join(root, "schema-output"),
    zbpPointer,
    sourceCsvPath,
    dictionaryPath,
    sourceMetadata: metadata(2, FMCSA_SELECTED_COLUMNS.slice(0, -1)),
    minimumAcceptedRecords: 1,
    logger: () => {},
    now: () => new Date("2026-08-30T18:00:00.000Z"),
  }), /schema changed/);
  await assert.rejects(() => buildFmcsaCompanyCensus({
    outputRoot: path.join(root, "duplicate-output"),
    zbpPointer,
    sourceCsvPath,
    dictionaryPath,
    sourceMetadata: metadata(2),
    minimumAcceptedRecords: 1,
    logger: () => {},
    now: () => new Date("2026-08-30T18:00:00.000Z"),
  }), /strictly ordered by unique USDOT/);
});
