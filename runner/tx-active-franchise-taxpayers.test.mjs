import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acquireTxActiveFranchiseTaxpayers,
  authorizeTxActiveFranchiseLargeAcquisition,
  preflightTxActiveFranchiseTaxpayers,
  requestTxActiveFranchiseJson,
  splitTxActiveFranchisePostcode,
  TX_ACTIVE_FRANCHISE_COUNT_URL,
  TX_ACTIVE_FRANCHISE_LARGE_ACQUISITION_ACKNOWLEDGEMENT,
  TX_ACTIVE_FRANCHISE_METADATA_URL,
  TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT,
  TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA,
  txActiveFranchiseSchemaFingerprint,
  validateTxActiveFranchiseMetadata,
  writeTxActiveFranchisePreflightReceipt,
} from "./tx-active-franchise-taxpayers.mjs";

function catalog(overrides = {}) {
  return {
    id: "9cir-efmm",
    name: "Active Franchise Taxpayers",
    attribution: "Texas Comptroller of Public Accounts",
    rowsUpdatedAt: 1_787_991_923,
    columns: TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.map((column) => ({ ...column })),
    ...overrides,
  };
}

function response(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function metadataCountFetch({ metadata = catalog(), count = "3435798", calls = [] } = {}) {
  return async (url, options) => {
    const value = String(url);
    calls.push({ url: value, redirect: options.redirect });
    if (value === TX_ACTIVE_FRANCHISE_METADATA_URL) return response(metadata);
    if (value === TX_ACTIVE_FRANCHISE_COUNT_URL) return response([{ count }]);
    throw new Error(`Unexpected network request ${value}`);
  };
}

test("pins the exact official 18-field schema and anomalous NAICS binding", () => {
  assert.equal(TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.length, 18);
  assert.equal(txActiveFranchiseSchemaFingerprint(TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA), TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT);
  assert.deepEqual(TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.at(-1), {
    position: 19,
    fieldName: "_621111",
    name: "NAICS Code",
    dataTypeName: "text",
  });
  assert.equal(validateTxActiveFranchiseMetadata(catalog()).schemaFingerprint, TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT);
});

test("performs metadata and count-only preflight without requesting taxpayer rows", async () => {
  const calls = [];
  const receipt = await preflightTxActiveFranchiseTaxpayers({
    fetchImpl: metadataCountFetch({ calls }),
    now: () => new Date("2026-09-03T13:45:00.000Z"),
  });
  assert.deepEqual(calls, [
    { url: TX_ACTIVE_FRANCHISE_METADATA_URL, redirect: "manual" },
    { url: TX_ACTIVE_FRANCHISE_COUNT_URL, redirect: "manual" },
  ]);
  assert.equal(receipt.source_rows_updated_at, "2026-08-29T08:25:23.000Z");
  assert.equal(receipt.source_record_count, 3_435_798);
  assert.equal(receipt.status, "metadata-only-not-acquired-large-acquisition-default-denied");
  assert.equal(receipt.catalog_license_id, null);
  assert.equal(receipt.acquisition.metadata_requests, 1);
  assert.equal(receipt.acquisition.count_only_requests, 1);
  assert.equal(receipt.acquisition.row_data_requests, 0);
  assert.equal(receipt.acquisition.row_data_acquired, false);
  assert.equal(receipt.acquisition.normalized_records_produced, 0);
  assert.equal(receipt.acquisition.release_pointer_published, false);
  assert.equal(receipt.semantics.taxpayer_address, "administrative-only-not-physical-site-or-geocode");
  assert.equal(receipt.semantics.automatic_reconciliation, "exact-taxpayer-number-only-after-separately-authorized-acquisition");
});

test("allows only the exact metadata path and count(*) query", async () => {
  const shouldNotRun = async () => {
    throw new Error("fetch must not run");
  };
  await assert.rejects(() => requestTxActiveFranchiseJson(`${TX_ACTIVE_FRANCHISE_METADATA_URL}?x=1`, {
    requestType: "metadata",
    fetchImpl: shouldNotRun,
  }), /path or query is not allowed/);
  await assert.rejects(() => requestTxActiveFranchiseJson("https://data.texas.gov/resource/9cir-efmm.json?$limit=1", {
    requestType: "count",
    fetchImpl: shouldNotRun,
  }), /row-returning requests are forbidden/);
  await assert.rejects(() => requestTxActiveFranchiseJson("https://example.com/resource/9cir-efmm.json?$select=count(*)", {
    requestType: "count",
    fetchImpl: shouldNotRun,
  }), /URL is not allowed/);
  await assert.rejects(() => requestTxActiveFranchiseJson(TX_ACTIVE_FRANCHISE_COUNT_URL, {
    requestType: "rows",
    fetchImpl: shouldNotRun,
  }), /limited to metadata and count-only/);
});

test("rejects redirects and bounds metadata responses", async () => {
  await assert.rejects(() => requestTxActiveFranchiseJson(TX_ACTIVE_FRANCHISE_METADATA_URL, {
    requestType: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
  await assert.rejects(() => requestTxActiveFranchiseJson(TX_ACTIVE_FRANCHISE_METADATA_URL, {
    requestType: "metadata",
    maximumResponseBytes: 4,
    fetchImpl: async () => response({ too: "large" }),
  }), /exceeds the byte limit/);
});

test("retries only transient responses and honors cancellation", async () => {
  let attempts = 0;
  const result = await requestTxActiveFranchiseJson(TX_ACTIVE_FRANCHISE_METADATA_URL, {
    requestType: "metadata",
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return new Response("temporary", { status: 503 });
      return response({ ok: true });
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => preflightTxActiveFranchiseTaxpayers({
    signal: controller.signal,
    fetchImpl: async () => { throw new Error("must not fetch"); },
  }), { name: "AbortError" });
});

test("fails closed on source identity, license, field, label, type, and count drift", async () => {
  assert.throws(() => validateTxActiveFranchiseMetadata(catalog({ id: "wrong-id" })), /catalog identity/);
  assert.throws(() => validateTxActiveFranchiseMetadata(catalog({ licenseId: "PUBLIC_DOMAIN" })), /license status changed/);
  assert.throws(() => validateTxActiveFranchiseMetadata(catalog({
    columns: catalog().columns.map((column) => column.fieldName === "_621111" ? { ...column, fieldName: "naics_code" } : column),
  })), /schema drifted/);
  assert.throws(() => validateTxActiveFranchiseMetadata(catalog({
    columns: catalog().columns.map((column) => column.fieldName === "_621111" ? { ...column, name: "Industry" } : column),
  })), /schema drifted/);
  assert.throws(() => validateTxActiveFranchiseMetadata(catalog({
    columns: catalog().columns.map((column) => column.fieldName === "_621111" ? { ...column, dataTypeName: "number" } : column),
  })), /schema drifted/);
  await assert.rejects(() => preflightTxActiveFranchiseTaxpayers({
    fetchImpl: metadataCountFetch({ count: "not-a-count" }),
  }), /count is invalid/);
});

test("writes a checksummed immutable receipt and refuses overwrite", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-tx-franchise-preflight-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const receipt = await preflightTxActiveFranchiseTaxpayers({
    fetchImpl: metadataCountFetch(),
    now: () => new Date("2026-09-03T13:45:00.000Z"),
  });
  const artifact = await writeTxActiveFranchisePreflightReceipt({ receipt, outputRoot: root });
  const persisted = JSON.parse(await readFile(artifact.path, "utf8"));
  assert.equal(persisted.source_observation_fingerprint, receipt.source_observation_fingerprint);
  assert.equal(persisted.acquisition.row_data_acquired, false);
  assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(await readdir(root), [artifact.filename]);
  await assert.rejects(() => writeTxActiveFranchisePreflightReceipt({ receipt, outputRoot: root }), /refusing to overwrite/);
});

test("keeps ZIP5 and ZIP4 separate for any future normalization", () => {
  assert.deepEqual(splitTxActiveFranchisePostcode("78701-1234"), {
    zip_code: "78701",
    postal_code: "78701",
    zip4: "1234",
    source_postcode: "78701-1234",
    status: "normalized-us-zip-plus-4-separated",
  });
  assert.deepEqual(splitTxActiveFranchisePostcode("787011234"), {
    zip_code: "78701",
    postal_code: "78701",
    zip4: "1234",
    source_postcode: "787011234",
    status: "normalized-us-zip-plus-4-separated",
  });
  assert.deepEqual(splitTxActiveFranchisePostcode("invalid"), {
    zip_code: null,
    postal_code: null,
    zip4: null,
    source_postcode: "invalid",
    status: "unusable-source-postcode",
  });
});

test("large acquisition is default-denied, exact-acknowledgement gated, and unimplemented", async () => {
  const preflight = await preflightTxActiveFranchiseTaxpayers({ fetchImpl: metadataCountFetch() });
  assert.throws(() => authorizeTxActiveFranchiseLargeAcquisition({ preflight }), /default-denied/);
  assert.throws(() => authorizeTxActiveFranchiseLargeAcquisition({ acknowledgement: "yes", preflight }), /Exact acknowledgement required/);
  assert.throws(() => authorizeTxActiveFranchiseLargeAcquisition({
    acknowledgement: TX_ACTIVE_FRANCHISE_LARGE_ACQUISITION_ACKNOWLEDGEMENT,
  }), /fresh validated metadata-only/);
  const authorization = authorizeTxActiveFranchiseLargeAcquisition({
    acknowledgement: TX_ACTIVE_FRANCHISE_LARGE_ACQUISITION_ACKNOWLEDGEMENT,
    preflight,
  });
  assert.equal(authorization.authorized, true);
  assert.equal(authorization.scope, "authorization-gate-only-no-acquisition-implementation");

  let rowRequests = 0;
  await assert.rejects(() => acquireTxActiveFranchiseTaxpayers({
    acknowledgement: TX_ACTIVE_FRANCHISE_LARGE_ACQUISITION_ACKNOWLEDGEMENT,
    preflight,
    fetchImpl: async () => { rowRequests += 1; },
  }), /row acquisition is not implemented; no row request was sent/);
  assert.equal(rowRequests, 0);
});
