import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  buildTxActiveFranchiseTaxpayersOffline,
  TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT,
  verifyTxActiveFranchiseTaxpayersOffline,
} from "./tx-active-franchise-offline.mjs";
import {
  preflightTxActiveFranchiseTaxpayers,
  TX_ACTIVE_FRANCHISE_COUNT_URL,
  TX_ACTIVE_FRANCHISE_METADATA_URL,
  TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA,
} from "./tx-active-franchise-taxpayers.mjs";

const BUILD_NOW = () => new Date("2026-09-03T14:05:00.000Z");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function response(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

async function preflight(count = 3) {
  const metadata = {
    id: "9cir-efmm",
    name: "Active Franchise Taxpayers",
    attribution: "Texas Comptroller of Public Accounts",
    rowsUpdatedAt: 1_787_991_923,
    columns: TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.map((column) => ({ ...column })),
  };
  return preflightTxActiveFranchiseTaxpayers({
    now: () => new Date("2026-09-03T14:00:00.000Z"),
    fetchImpl: async (url) => {
      if (String(url) === TX_ACTIVE_FRANCHISE_METADATA_URL) return response(metadata);
      if (String(url) === TX_ACTIVE_FRANCHISE_COUNT_URL) return response([{ count: String(count) }]);
      throw new Error(`Unexpected request ${url}`);
    },
  });
}

function sourceRecord(overrides = {}) {
  return {
    taxpayer_number: "32089812484",
    taxpayer_name: "FIXTURE MARKETS LLC",
    taxpayer_address: "100 CONGRESS AVE STE 100",
    taxpayer_city: "AUSTIN",
    taxpayer_state: "TX",
    taxpayer_zip: "78701-1234",
    taxpayer_county_code: "227",
    taxpayer_organizational_type: "C",
    record_type_code: "U",
    responsibility_beginning_date: "20200102",
    secretary_of_state_sos_or_coa_file_number: "0800000001",
    sos_charter_date: "20200101",
    sos_status_date: "20260829",
    sos_status_code: "A",
    right_to_transact_business_code: "A",
    current_exempt_reason_code: "00",
    exempt_begin_date: "",
    _621111: "445110",
    ...overrides,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsv(filename, rows, headers = TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.map(({ fieldName }) => fieldName)) {
  const lines = [headers, ...rows.map((row) => headers.map((field) => row[field] ?? ""))];
  await writeFile(filename, `${lines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`);
}

function gzipRows(buffer) {
  return gunzipSync(buffer).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
}

test("builds and verifies a privacy-minimized immutable offline staging release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-tx-franchise-offline-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "Active_Franchise_Taxpayers.csv");
  await writeCsv(sourcePath, [
    sourceRecord(),
    sourceRecord({
      taxpayer_number: "32089812485",
      taxpayer_name: "PRIVATE SOLE OWNER",
      taxpayer_address: "200 PRIVATE DR",
      taxpayer_city: "DALLAS",
      taxpayer_zip: "75001",
      taxpayer_county_code: "113",
      taxpayer_organizational_type: "S",
      secretary_of_state_sos_or_coa_file_number: "",
    }),
    sourceRecord({ taxpayer_number: "32089812486", taxpayer_name: "INVALID DATE", responsibility_beginning_date: "20260230" }),
  ]);
  const outputRoot = path.join(root, "output");
  const runId = "11111111-1111-4111-8111-111111111111";
  const receipt = await preflight();
  const result = await buildTxActiveFranchiseTaxpayersOffline({
    outputRoot,
    sourcePath,
    preflight: receipt,
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT,
    maximumQuarantineRate: 0.5,
    now: BUILD_NOW,
    runId,
  });

  assert.equal(result.manifest.status, "verified-staging-local-review-only");
  assert.equal(result.manifest.production_pointer_published, false);
  assert.equal(result.manifest.complete_source_snapshot_asserted, false);
  assert.equal(result.manifest.operator_file_row_count_matches_preflight, true);
  assert.deepEqual(result.manifest.coverage, {
    source_records: 3,
    normalized_provisional_organizations: 2,
    quarantined_source_records: 1,
    quarantine_rate: 1 / 3,
    administrative_zip_codes: 1,
    organization_administrative_address_evidence: 1,
    exact_sales_tax_taxpayer_links: 0,
    physical_sites: 0,
    establishments: 0,
    business_geocodes: 0,
    physical_site_inference_permitted: false,
    establishment_inference_permitted: false,
    business_geocode_inference_permitted: false,
    operating_status_inference_permitted: false,
    gdp_contribution_permitted: false,
    complete_all_businesses: false,
  });
  assert.equal(result.manifest.heatmap.status, "excluded-staging-local-review-only");
  assert.equal(result.manifest.artifacts.length, 22);
  assert.equal((await verifyTxActiveFranchiseTaxpayersOffline(result.manifestPath)).coverage.normalized_provisional_organizations, 2);

  const normalizedArtifacts = result.manifest.artifacts.filter(({ artifact_type: type }) => type === "normalized-tx-active-franchise-taxpayer-organization-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map(async ({ path: artifactPath }) => gzipRows(await readFile(path.join(result.stagingDirectory, artifactPath)))))).flat();
  const corporation = normalized.find(({ tax_profile: profile }) => profile.organizational_type === "C");
  const soleOwner = normalized.find(({ tax_profile: profile }) => profile.organizational_type === "S");
  assert.equal(corporation.observed_at, "2026-09-03T14:00:00.000Z");
  assert.deepEqual({
    zip_code: corporation.administrative_address.zip_code,
    postal_code: corporation.administrative_address.postal_code,
    zip4: corporation.administrative_address.zip4,
  }, { zip_code: "78701", postal_code: "78701", zip4: "1234" });
  assert.equal(corporation.tax_profile.naics_source.source_field, "_621111");
  assert.equal(corporation.tax_profile.naics_source.source_value, "445110");
  assert.equal(soleOwner.privacy.natural_person_risk_organizational_type, true);
  assert.equal(Object.values(soleOwner.administrative_address).filter((value) => typeof value === "string" && value.includes("PRIVATE")).length, 0);
  for (const field of ["address_line", "city", "state", "zip_code", "postal_code", "zip4", "source_postcode", "source_county_code"]) assert.equal(soleOwner.administrative_address[field], null);
  assert.equal(JSON.stringify(normalized).includes("geometry"), false);
  assert.equal(JSON.stringify(normalized).includes("latitude"), false);
  assert.equal(JSON.stringify(normalized).includes("longitude"), false);

  const zipArtifact = result.manifest.artifacts.find(({ artifact_type: type }) => type === "tx-active-franchise-taxpayer-administrative-zip-count-jsonl");
  const zipRows = (await readFile(path.join(result.stagingDirectory, zipArtifact.path), "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(zipRows.map(({ zip_code, postal_code, zip4, organization_administrative_address_count, physical_site_count }) => ({ zip_code, postal_code, zip4, organization_administrative_address_count, physical_site_count })), [
    { zip_code: "78701", postal_code: "78701", zip4: null, organization_administrative_address_count: 1, physical_site_count: null },
  ]);
  await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
  await assert.rejects(() => buildTxActiveFranchiseTaxpayersOffline({
    outputRoot,
    sourcePath,
    preflight: receipt,
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT,
    now: BUILD_NOW,
    runId,
  }), /already exists; refusing to overwrite/);
});

test("fails closed on acknowledgement, count, source schema, run identity, and cancellation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-tx-franchise-offline-invalid-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source.csv");
  await writeCsv(sourcePath, [sourceRecord()]);
  const receipt = await preflight(1);
  await assert.rejects(() => buildTxActiveFranchiseTaxpayersOffline({ outputRoot: path.join(root, "denied"), sourcePath, preflight: receipt }), /default-denied/);
  await assert.rejects(() => buildTxActiveFranchiseTaxpayersOffline({
    outputRoot: path.join(root, "bad-run"), sourcePath, preflight: receipt,
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW, runId: "../../escape",
  }), /runId must be a UUID/);
  const mismatchedReceipt = await preflight(2);
  await assert.rejects(() => buildTxActiveFranchiseTaxpayersOffline({
    outputRoot: path.join(root, "count"), sourcePath, preflight: mismatchedReceipt,
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW, runId: "22222222-2222-4222-8222-222222222222",
  }), /source count mismatch/);
  const duplicatePath = path.join(root, "duplicates.csv");
  await writeCsv(duplicatePath, [sourceRecord(), sourceRecord()]);
  await assert.rejects(() => buildTxActiveFranchiseTaxpayersOffline({
    outputRoot: path.join(root, "duplicates"), sourcePath: duplicatePath, preflight: mismatchedReceipt,
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW, runId: "55555555-5555-4555-8555-555555555555",
  }), /Duplicate Texas franchise taxpayer number/);
  const driftPath = path.join(root, "drift.csv");
  const driftedHeaders = TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.map(({ fieldName }) => fieldName);
  driftedHeaders[2] = "mailing_address";
  await writeCsv(driftPath, [sourceRecord()], driftedHeaders);
  await assert.rejects(() => buildTxActiveFranchiseTaxpayersOffline({
    outputRoot: path.join(root, "drift"), sourcePath: driftPath, preflight: receipt,
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW, runId: "33333333-3333-4333-8333-333333333333",
  }), /CSV header drifted/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildTxActiveFranchiseTaxpayersOffline({
    outputRoot: path.join(root, "cancelled"), sourcePath, preflight: receipt,
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW, signal: controller.signal,
  }), { name: "AbortError" });
  await assert.rejects(() => buildTxActiveFranchiseTaxpayersOffline({
    outputRoot: path.join(root, "stale"), sourcePath, preflight: receipt,
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT,
    now: () => new Date("2026-09-10T14:00:00.001Z"),
  }), /outside the permitted freshness window/);
});

test("verifier rejects checksum and self-consistent privacy-boundary tampering", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-tx-franchise-offline-tamper-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source.csv");
  await writeCsv(sourcePath, [sourceRecord({ taxpayer_organizational_type: "TR" })]);
  const result = await buildTxActiveFranchiseTaxpayersOffline({
    outputRoot: path.join(root, "output"), sourcePath, preflight: await preflight(1),
    acknowledgement: TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT,
    now: BUILD_NOW,
    runId: "44444444-4444-4444-8444-444444444444",
  });
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  const artifact = manifest.artifacts.find(({ artifact_type: type, record_count: count }) => type === "normalized-tx-active-franchise-taxpayer-organization-jsonl-gzip" && count === 1);
  const artifactPath = path.join(result.stagingDirectory, artifact.path);
  const [record] = gzipRows(await readFile(artifactPath));
  record.privacy.natural_person_risk_organizational_type = false;
  record.privacy.administrative_address_withheld_for_natural_person_risk = false;
  record.administrative_address.physical_site_asserted = true;
  const tampered = gzipSync(`${JSON.stringify(record)}\n`);
  await writeFile(artifactPath, tampered);
  artifact.bytes = tampered.length;
  artifact.sha256 = sha256(tampered);
  await writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(() => verifyTxActiveFranchiseTaxpayersOffline(result.manifestPath), (error) => {
    assert.equal(error.message, "Texas Active Franchise Taxpayers offline staging verification failed.");
    assert.equal(error.failures.some(({ reason }) => reason.includes("privacy") || reason.includes("administrative-address")), true);
    return true;
  });

  await writeFile(artifactPath, Buffer.from("not-gzip"));
  await assert.rejects(() => verifyTxActiveFranchiseTaxpayersOffline(result.manifestPath), /offline staging verification failed/);
});
