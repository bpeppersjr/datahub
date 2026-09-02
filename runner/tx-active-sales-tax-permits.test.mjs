import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  buildTxActiveSalesTaxPermits,
  normalizeTxActiveSalesTaxOutlet,
  requestTxJson,
  schemaFingerprint,
  TX_ACTIVE_SALES_TAX_FIELDS,
  TX_ACTIVE_SALES_TAX_SCHEMA,
  TX_ACTIVE_SALES_TAX_SCHEMA_FINGERPRINT,
  verifyTxActiveSalesTaxPermits,
} from "./tx-active-sales-tax-permits.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "jrea-zgmq",
    name: "Active Sales Tax Permit Holders",
    attribution: "Texas Comptroller of Public Accounts",
    licenseId: "PUBLIC_DOMAIN",
    rowsUpdatedAt: 1_788_010_909,
    sourceRecordCount: 3,
    columns: TX_ACTIVE_SALES_TAX_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function outlet(overrides = {}) {
  return {
    socrata_row_id: "row-aaaa-bbbb-cccc",
    taxpayer_number: "32089812484",
    taxpayer_name: "FIXTURE MARKETS LLC",
    taxpayer_organization_type: "CL",
    outlet_number: "1",
    outlet_name: "FIXTURE MARKET 001",
    outlet_address: "100 CONGRESS AVE STE 100",
    outlet_city: "AUSTIN",
    outlet_state: "TX",
    outlet_zip_code: "78701",
    outlet_county_code: "227",
    outlet_naics_code: "445110",
    outlet_inside_outside_city_limits_indicator: "Y",
    outlet_permit_issue_date: "2020-03-04T00:00:00.000",
    outlet_first_sales_date: "2020-03-05T00:00:00.000",
    ...overrides,
  };
}

function context() {
  return {
    runId: "tx-fixture-run",
    retrievedAt: "2026-08-31T20:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-29T08:21:49.000Z",
    sourceReleaseId: "tx-fixture-source",
    baselineByZip: new Map([
      ["78701", { postal_label: { preferred_state: "TX" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:78701", geoid: "78701" } }],
      ["75001", { postal_label: { preferred_state: "TX" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:75001", geoid: "75001" } }],
    ]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["78701", "75001", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    postal_label: zipCode === "99999" ? null : { preferred_state: "TX" },
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

test("pins the 14 selected Texas fields and excludes taxpayer mailing fields", () => {
  assert.equal(TX_ACTIVE_SALES_TAX_FIELDS.length, 14);
  assert.equal(sha256(TX_ACTIVE_SALES_TAX_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), TX_ACTIVE_SALES_TAX_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), TX_ACTIVE_SALES_TAX_SCHEMA_FINGERPRINT);
  for (const excluded of ["taxpayer_address", "taxpayer_city", "taxpayer_state", "taxpayer_zip_code", "taxpayer_county_code"]) {
    assert.equal(TX_ACTIVE_SALES_TAX_FIELDS.includes(excluded), false);
  }
});

test("normalizes a permit outlet without overstating business status", () => {
  const normalized = normalizeTxActiveSalesTaxOutlet(outlet({ taxpayer_address: "PRIVATE" }), context());
  assert.equal(normalized.normalized_record_id, "tx-active-sales-tax:outlet:32089812484:1");
  assert.equal(normalized.entity_candidates.organization_id, "organization:tx_cpa_taxpayer_32089812484");
  assert.equal(normalized.entity_candidates.physical_site_id, "site:tx_cpa_sales_tax_outlet_32089812484_1");
  assert.equal(normalized.entity_candidates.establishment_id, "establishment:tx_cpa_sales_tax_outlet_32089812484_1");
  assert.equal(normalized.physical_address.zip_code, "78701");
  assert.equal(normalized.physical_address.postal_code, "78701");
  assert.equal(normalized.physical_address.zip4, null);
  assert.equal(normalized.geography.zcta_geo_id, "zcta:78701");
  assert.equal(normalized.taxpayer_profile.organization_type_code, "CL");
  assert.equal(normalized.permit_profile.naics_code, "445110");
  assert.equal(normalized.permit_profile.inside_city_limits, true);
  assert.equal(normalized.permit_profile.permit_issue_date, "2020-03-04");
  assert.equal(normalized.source_status.status, "Active sales tax permit (source-defined)");
  assert.equal(normalized.export_policy, "local-review-only");
  assert.equal(JSON.stringify(normalized).includes("PRIVATE"), false);
});

test("rejects missing/nonphysical addresses, unmapped ZIPs, invalid states, and unknown indicators", () => {
  assert.throws(() => normalizeTxActiveSalesTaxOutlet(outlet({ outlet_address: "P O BOX 55" }), context()), /missing-or-nonphysical-outlet-address/);
  assert.throws(() => normalizeTxActiveSalesTaxOutlet(outlet({ outlet_zip_code: "99998" }), context()), /invalid-or-unmapped-us-zip/);
  assert.throws(() => normalizeTxActiveSalesTaxOutlet(outlet({ outlet_state: "XX" }), context()), /invalid-outlet-state/);
  assert.throws(() => normalizeTxActiveSalesTaxOutlet(outlet({ outlet_inside_outside_city_limits_indicator: "MAYBE" }), context()), /invalid-city-limits-indicator/);
});

test("retries transient Texas source responses and rejects redirects", async () => {
  let attempts = 0;
  const result = await requestTxJson("https://data.texas.gov/api/views/jrea-zgmq", {
    type: "metadata",
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return new Response("temporary", { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestTxJson("https://data.texas.gov/api/views/jrea-zgmq", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds, quarantines invalid outlets, and independently verifies a complete Texas release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-tx-sales-tax-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    outlet(),
    outlet({ socrata_row_id: "row-bbbb", taxpayer_number: "32089812485", outlet_number: "2", outlet_name: "FIXTURE MARKET 002", outlet_address: "200 MAIN ST", outlet_city: "DALLAS", outlet_zip_code: "75001", outlet_county_code: "113", outlet_inside_outside_city_limits_indicator: "N" }),
    outlet({ socrata_row_id: "row-cccc", taxpayer_number: "32089812486", outlet_number: "3", outlet_name: "FIXTURE MAIL", outlet_address: "PO BOX 99" }),
  ];
  const result = await buildTxActiveSalesTaxPermits({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumOutlets: 1,
    maximumQuarantineRate: 0.5,
    logger: () => {},
    now: () => new Date("2026-08-31T20:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_outlet_permits, 3);
  assert.equal(result.manifest.coverage.normalized_outlet_permits, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 1);
  assert.equal(result.manifest.coverage.unique_taxpayers, 2);
  assert.equal(result.manifest.coverage.physical_sites, 2);
  const verified = await verifyTxActiveSalesTaxPermits(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-tx-active-sales-tax-outlet-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map(async (artifact) =>
    gunzipSync(await readFile(path.join(result.releaseDirectory, artifact.path)))
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse))))
    .flat();
  assert.equal(normalized.length, 2);
  assert.equal(normalized.every((record) => record.export_policy === "local-review-only"), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "tx-active-sales-tax-permit-source-jsonl-gzip");
  assert.equal(sourceArtifact.export_policy, "internal");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks schema drift, unapproved fields, duplicate outlets, excess quarantine, and cancellation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-tx-sales-tax-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "outlet_zip_code" ? { ...column, dataTypeName: "number" } : column), sourceRecordCount: 1 });
  await assert.rejects(() => buildTxActiveSalesTaxPermits({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [outlet()], minimumOutlets: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildTxActiveSalesTaxPermits({
    outputRoot: path.join(root, "private-field"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }),
    sourceRecords: [outlet({ taxpayer_address: "PRIVATE" })], minimumOutlets: 1, logger: () => {},
  }), /Unapproved Texas source field taxpayer_address/);
  await assert.rejects(() => buildTxActiveSalesTaxPermits({
    outputRoot: path.join(root, "duplicate"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 2 }),
    sourceRecords: [outlet(), outlet({ socrata_row_id: "row-bbbb" })], minimumOutlets: 1, logger: () => {},
  }), /Duplicate Texas taxpayer\/outlet identity/);
  await assert.rejects(() => buildTxActiveSalesTaxPermits({
    outputRoot: path.join(root, "quarantine"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 2 }),
    sourceRecords: [outlet(), outlet({ socrata_row_id: "row-bbbb", taxpayer_number: "32089812485", outlet_address: "PO BOX 1" })],
    minimumOutlets: 1, maximumQuarantineRate: 0.1, logger: () => {},
  }), /quarantine rate/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildTxActiveSalesTaxPermits({
    outputRoot: path.join(root, "cancelled"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }),
    sourceRecords: [outlet()], minimumOutlets: 1, signal: controller.signal, logger: () => {},
  }), { name: "AbortError" });
});
