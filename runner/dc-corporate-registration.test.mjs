import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  acquireDcCorporateRegistrationLive,
  buildDcCorporateRegistrationOffline,
  DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES,
  DC_CORPORATE_REGISTRATION_CATALOG_URL,
  DC_CORPORATE_REGISTRATION_FIELDS,
  DC_CORPORATE_REGISTRATION_ITEM_ID,
  DC_CORPORATE_REGISTRATION_LAYER_URL,
  DC_CORPORATE_REGISTRATION_MODEL_TYPES,
  DC_CORPORATE_REGISTRATION_OFFLINE_BUILD_ACKNOWLEDGEMENT,
  DC_CORPORATE_REGISTRATION_QUERY_URL,
  DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA,
  DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY,
  preflightDcCorporateRegistration,
  requestDcCorporateRegistrationJson,
  splitDcCorporateRegistrationPostcode,
  verifyDcCorporateRegistrationOffline,
} from "./dc-corporate-registration.mjs";

const PREFLIGHT_NOW = () => new Date("2026-09-03T12:30:00.000Z");
const BUILD_NOW = () => new Date("2026-09-03T12:35:00.000Z");
const TEST_ROOT = path.join(process.cwd(), "data", ".connector-test-tmp");

async function testDirectory(prefix) {
  await mkdir(TEST_ROOT, { recursive: true });
  return mkdtemp(path.join(TEST_ROOT, prefix));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function metadata() {
  return {
    name: "Corporate Registration",
    type: "Table",
    displayField: "BUSINESS_NAME",
    objectIdField: "OBJECTID",
    globalIdField: "GLOBALID",
    geometryType: null,
    capabilities: "Query,Extract",
    dateFieldsTimeReference: { timeZone: "Eastern Standard Time", timeZoneIANA: "America/New_York", respectsDaylightSaving: true },
    fields: DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA.map(([name, type, length]) => ({ name, type, length })),
  };
}

function preflightFetch({ activeRows = 2, schema = metadata(), statusRename = null, modelRename = null, capture = [] } = {}) {
  const statusCounts = Object.fromEntries(DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY.map((value) => [value, 0]));
  statusCounts[DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES[0]] = Math.max(0, activeRows - 1);
  statusCounts[DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES[1]] = Math.min(1, activeRows);
  const modelCounts = Object.fromEntries(DC_CORPORATE_REGISTRATION_MODEL_TYPES.map((value) => [value, 0]));
  modelCounts[DC_CORPORATE_REGISTRATION_MODEL_TYPES[1]] = Math.max(0, activeRows - 1);
  modelCounts[DC_CORPORATE_REGISTRATION_MODEL_TYPES[13]] = Math.min(1, activeRows);
  return async (url, options = {}) => {
    capture.push({ url: String(url), method: options.method, body: options.body, redirect: options.redirect });
    if (String(url) === DC_CORPORATE_REGISTRATION_LAYER_URL + "?f=pjson") return jsonResponse(schema);
    if (String(url) !== DC_CORPORATE_REGISTRATION_QUERY_URL) throw new Error("Unexpected request " + url);
    const body = new URLSearchParams(options.body);
    if (body.get("returnCountOnly") === "true") return jsonResponse({ count: activeRows });
    const statistic = JSON.parse(body.get("outStatistics"))[0];
    if (statistic.onStatisticField === "DCS_LAST_MOD_DTTM") {
      return jsonResponse({ features: [{ attributes: { MAX_DCS_LAST_MOD_DTTM: 1_788_422_019_000 } }] });
    }
    if (body.get("groupByFieldsForStatistics") === "ENTITY_STATUS") {
      const features = DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY.map((value) => ({
        attributes: { ENTITY_STATUS: value, ROW_COUNT: statusCounts[value] },
      }));
      if (statusRename) features[0].attributes.ENTITY_STATUS = statusRename;
      return jsonResponse({ features });
    }
    if (body.get("groupByFieldsForStatistics") === "MODELTYPE") {
      const features = DC_CORPORATE_REGISTRATION_MODEL_TYPES.map((value) => ({
        attributes: { MODELTYPE: value, ROW_COUNT: modelCounts[value] },
      }));
      if (modelRename) features[0].attributes.MODELTYPE = modelRename;
      return jsonResponse({ features });
    }
    throw new Error("Unexpected query body " + options.body);
  };
}

async function preflight(options = {}) {
  return preflightDcCorporateRegistration({ now: PREFLIGHT_NOW, fetchImpl: preflightFetch(options) });
}

function sourceRecord(overrides = {}) {
  return {
    FILE_NUMBER: "L00000001",
    ENTITY_STATUS: "Active - In Good Standing",
    LOCALE: "Domestic",
    MODELTYPE: "Domestic Business Corporation",
    BUSINESS_NAME: "FIXTURE HOLDINGS INC",
    BUSNIESS_ADDRESS_LINE1: "100 TEST AVE",
    BUSNIESS_ADDRESS_LINE2: "STE 200",
    BUSNIESS_ADDRESS_LINE3: null,
    BUSNIESS_ADDRESS_LINE4: null,
    BUSINESS_CITY: "WASHINGTON",
    BUSINESS_STATE: "DC",
    ZIPCODE: "20001-1234",
    BUSINESS_COUNTRY: "UNITED STATES",
    SUFFIX: "INC",
    EFFECTIVE_DATE: 1_577_923_200_000,
    FOREIGN_DATEOF_ORGANIZATION: null,
    NEXT_REPORTYEAR_DUE: "2028",
    DCS_LAST_MOD_DTTM: 1_788_422_019_000,
    DATE_LAST_REPORT_FILED: 1_766_275_200_000,
    NEXT_REPORTYEAR: null,
    LATESTFILED_REPORTDATE: null,
    LATESTREPORT_YEARFILED: null,
    OBJECTID: 1001,
    GLOBALID: "{11111111-1111-4111-8111-111111111111}",
    ...overrides,
  };
}

async function writeJsonl(filename, rows) {
  await writeFile(filename, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

function gzipRows(buffer) {
  return gunzipSync(buffer).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
}

async function buildFixture(root, options = {}) {
  const sourcePath = path.join(root, options.filename ?? "corporate-registration-active.jsonl");
  const rows = options.rows ?? [
    sourceRecord(),
    sourceRecord({
      FILE_NUMBER: "L00000002",
      ENTITY_STATUS: "Active - Not in Good Standing",
      MODELTYPE: "Foreign Limited Liability Company",
      BUSINESS_NAME: "SECOND FIXTURE LLC",
      ZIPCODE: "200029876",
      SUFFIX: "LLC",
      OBJECTID: 1002,
      GLOBALID: "{22222222-2222-4222-8222-222222222222}",
    }),
  ];
  await writeJsonl(sourcePath, rows);
  return buildDcCorporateRegistrationOffline({
    outputRoot: path.join(root, "output"),
    sourcePath,
    preflight: options.receipt ?? await preflight({ activeRows: rows.length }),
    acknowledgement: DC_CORPORATE_REGISTRATION_OFFLINE_BUILD_ACKNOWLEDGEMENT,
    now: BUILD_NOW,
    runId: options.runId ?? "33333333-3333-4333-8333-333333333333",
    signal: options.signal,
    maximumDecodedSourceBytes: options.maximumDecodedSourceBytes,
    maximumLineBytes: options.maximumLineBytes,
    maximumRows: options.maximumRows,
  });
}

test("preflight is exact metadata and aggregate/count only", async () => {
  const capture = [];
  const receipt = await preflight({ capture });
  assert.equal(receipt.item_id, DC_CORPORATE_REGISTRATION_ITEM_ID);
  assert.equal(receipt.catalog_url, DC_CORPORATE_REGISTRATION_CATALOG_URL);
  assert.equal(receipt.controls.total_records, 2);
  assert.equal(receipt.controls.distinct_file_numbers, 2);
  assert.equal(receipt.controls.active_distinct_file_numbers, 2);
  assert.equal(receipt.controls.max_dcs_last_mod_dttm, "2026-09-03T11:53:39.000Z");
  assert.equal(receipt.acquisition.row_data_requests, 0);
  assert.equal(receipt.acquisition.row_data_acquired, false);
  assert.equal(capture.length, 7);
  assert.equal(capture[0].method, "GET");
  for (const request of capture.slice(1)) {
    const body = new URLSearchParams(request.body);
    assert.equal(request.method, "POST");
    assert.equal(request.redirect, "manual");
    assert.equal(body.get("returnGeometry"), "false");
    assert.equal(body.get("f"), "json");
    assert.equal(body.has("resultOffset"), false);
    assert.equal(body.has("resultRecordCount"), false);
    assert.notEqual(body.get("outFields"), "*");
    assert.equal(body.get("outFields") == null || body.get("outFields") === "FILE_NUMBER", true);
    assert.equal(body.get("returnCountOnly") === "true" || body.has("outStatistics"), true);
  }
  assert.equal(DC_CORPORATE_REGISTRATION_FIELDS.includes("EMAIL"), false);
  assert.equal(DC_CORPORATE_REGISTRATION_FIELDS.some((field) => /^RA(?:_|$)/.test(field)), false);
});

test("preflight fails closed on selected-schema, status, and model vocabulary drift", async () => {
  const drifted = metadata();
  drifted.fields = drifted.fields.map((field) => ({ ...field }));
  drifted.fields.find(({ name }) => name === "FILE_NUMBER").length = 40;
  await assert.rejects(() => preflight({ schema: drifted }), /selected schema drifted/);
  await assert.rejects(() => preflight({ statusRename: "Active" }), /ENTITY_STATUS vocabulary or count drifted/);
  await assert.rejects(() => preflight({ modelRename: "New Entity Type" }), /MODELTYPE vocabulary or count drifted/);
  await assert.rejects(() => preflight({ schema: { ...metadata(), features: [{ attributes: { FILE_NUMBER: "L1" } }] } }), /metadata response unexpectedly contains row data/);
});

test("request boundary rejects redirects, host/path/body changes, and oversized responses", async () => {
  const noFetch = async () => { throw new Error("must not fetch"); };
  await assert.rejects(() => requestDcCorporateRegistrationJson(
    "https://example.com/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer/0?f=pjson",
    { requestType: "metadata", fetchImpl: noFetch },
  ), /URL is not allowed/);
  await assert.rejects(() => requestDcCorporateRegistrationJson(
    "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer/1?f=pjson",
    { requestType: "metadata", fetchImpl: noFetch },
  ), /metadata path or query is not allowed/);
  await assert.rejects(() => requestDcCorporateRegistrationJson(DC_CORPORATE_REGISTRATION_QUERY_URL, {
    requestType: "total-count",
    body: new URLSearchParams({ where: "1=1", outFields: "*", f: "json" }),
    fetchImpl: noFetch,
  }), /not the approved aggregate\/count-only form/);
  await assert.rejects(() => requestDcCorporateRegistrationJson(DC_CORPORATE_REGISTRATION_LAYER_URL + "?f=pjson", {
    requestType: "metadata",
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://example.com/" } }),
  }), /redirect rejected/);
  await assert.rejects(() => requestDcCorporateRegistrationJson(DC_CORPORATE_REGISTRATION_LAYER_URL + "?f=pjson", {
    requestType: "metadata",
    maximumResponseBytes: 10,
    fetchImpl: async () => jsonResponse({ name: "far too large" }),
  }), /exceeds the byte limit/);
  await assert.rejects(() => requestDcCorporateRegistrationJson(DC_CORPORATE_REGISTRATION_LAYER_URL + "?f=pjson", {
    requestType: "metadata",
    fetchImpl: async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
  }), /approved JSON media type/);
});

test("live row acquisition is unimplemented and never calls fetch", async () => {
  let calls = 0;
  await assert.rejects(() => acquireDcCorporateRegistrationLive({
    fetchImpl: async () => { calls += 1; },
  }), /default-denied and unimplemented; no row request was sent/);
  assert.equal(calls, 0);
});

test("requires explicit U.S. evidence before interpreting a numeric postcode as ZIP5 or ZIP+4", () => {
  assert.deepEqual(splitDcCorporateRegistrationPostcode("12345", null, "DC"), {
    zip_code: "12345", postal_code: "12345", zip4: null, source_postcode: "12345",
  });
  assert.deepEqual(splitDcCorporateRegistrationPostcode("12345", null, "ZZ"), {
    zip_code: null, postal_code: null, zip4: null, source_postcode: "12345",
  });
  assert.deepEqual(splitDcCorporateRegistrationPostcode("12345", "FRANCE", "DC"), {
    zip_code: null, postal_code: null, zip4: null, source_postcode: "12345",
  });
});

test("offline fixture builds and verifies a local-review-only organization release", async (t) => {
  const root = await testDirectory("datahub-dc-corporate-");
  t.after(async () => rm(root, { recursive: true, force: true }));
  const result = await buildFixture(root);
  assert.equal(result.manifest.status, "verified-local-review-only");
  assert.equal(result.manifest.production_pointer_published, false);
  assert.equal(result.manifest.registry_integration_enabled, false);
  assert.equal(result.manifest.coverage_integration_enabled, false);
  assert.equal(result.manifest.heatmap_enabled, false);
  assert.deepEqual({
    source: result.manifest.coverage.source_active_records,
    organizations: result.manifest.coverage.normalized_provisional_organizations,
    sites: result.manifest.coverage.physical_sites,
    establishments: result.manifest.coverage.establishments,
    geometries: result.manifest.coverage.business_geometries,
    geocodes: result.manifest.coverage.business_geocodes,
  }, { source: 2, organizations: 2, sites: 0, establishments: 0, geometries: 0, geocodes: 0 });
  const verified = await verifyDcCorporateRegistrationOffline(result.manifestPath);
  assert.equal(verified.coverage.normalized_provisional_organizations, 2);
  const artifact = result.manifest.artifacts.find(({ artifact_type: type }) => type === "normalized-dc-corporate-registration-organization-jsonl-gzip");
  const normalized = gzipRows(await readFile(path.join(result.stagingDirectory, artifact.path)));
  assert.deepEqual(normalized.map(({ administrative_address: address }) => ({
    zip_code: address.zip_code, postal_code: address.postal_code, zip4: address.zip4, scope: address.scope,
  })), [
    { zip_code: "20001", postal_code: "20001", zip4: "1234", scope: "corporate-registration-business-address-administrative-evidence-only" },
    { zip_code: "20002", postal_code: "20002", zip4: "9876", scope: "corporate-registration-business-address-administrative-evidence-only" },
  ]);
  assert.equal(normalized.every(({ entity_candidate: entity }) => entity.physical_site_created === false && entity.establishment_created === false), true);
  assert.equal(normalized.every(({ source_status: status }) => status.current_operation_asserted === false), true);
  assert.equal(JSON.stringify(normalized).includes("\"EMAIL\""), false);
  assert.equal(JSON.stringify(normalized).includes("\"RA_"), false);
  assert.equal(JSON.stringify(normalized).includes("\"geometry\""), false);
  assert.equal(JSON.stringify(normalized).includes("\"geocode\""), false);
  assert.equal(result.pointerPath, null);
  await assert.rejects(() => stat(path.join(root, "output", "current.json")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(root, "output", "current.json")), { code: "ENOENT" });
  await assert.rejects(() => buildFixture(root), /already exists; refusing to overwrite/);
});

test("offline build rejects acknowledgement, privacy leaks, historical rows, duplicates, count mismatch, and cancellation", async (t) => {
  const root = await testDirectory("datahub-dc-corporate-invalid-");
  t.after(async () => rm(root, { recursive: true, force: true }));
  const row = sourceRecord();
  const sourcePath = path.join(root, "source.jsonl");
  await writeJsonl(sourcePath, [row]);
  const receipt = await preflight({ activeRows: 1 });
  await assert.rejects(() => buildDcCorporateRegistrationOffline({ outputRoot: path.join(root, "denied"), sourcePath, preflight: receipt }), /default-denied/);
  await assert.rejects(() => buildFixture(root, {
    rows: [{ ...row, EMAIL: "person@example.test" }],
    runId: "44444444-4444-4444-8444-444444444444",
  }), /prohibited person\/contact\/agent field/);
  await assert.rejects(() => buildFixture(root, {
    rows: [{ ...row, RA_NAME: "REGISTERED AGENT" }],
    runId: "44444444-4444-4444-8444-444444444445",
  }), /prohibited person\/contact\/agent field/);
  await assert.rejects(() => buildFixture(root, {
    rows: [{ ...row, BUSINESS_NAME: { EMAIL: "nested@example.test" } }],
    runId: "44444444-4444-4444-8444-444444444446",
  }), /prohibited person\/contact\/agent field/);
  await assert.rejects(() => buildFixture(root, {
    rows: [sourceRecord({ ENTITY_STATUS: "Dissolved" })],
    runId: "55555555-5555-4555-8555-555555555555",
  }), /not-an-approved-active-status/);
  await assert.rejects(() => buildFixture(root, {
    rows: [
      sourceRecord(),
      sourceRecord({ FILE_NUMBER: "l00000001", OBJECTID: 1002, GLOBALID: "{22222222-2222-4222-8222-222222222222}" }),
    ],
    runId: "66666666-6666-4666-8666-666666666666",
  }), /Duplicate DC corporate-registration FILE_NUMBER/);
  const mismatchedReceipt = await preflight({ activeRows: 2 });
  await assert.rejects(() => buildFixture(root, {
    rows: [row],
    receipt: mismatchedReceipt,
    runId: "77777777-7777-4777-8777-777777777777",
  }), /active source count mismatch/);
  const contaminatedReceipt = await preflight({ activeRows: 1 });
  contaminatedReceipt.audit = { EMAIL: "receipt-leak@example.test", features: [{ FILE_NUMBER: "L00000001" }] };
  await assert.rejects(() => buildFixture(root, {
    rows: [row],
    receipt: contaminatedReceipt,
    runId: "77777777-7777-4777-8777-777777777778",
  }), /preflight receipt contains prohibited/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildFixture(root, {
    rows: [row],
    receipt,
    runId: "88888888-8888-4888-8888-888888888888",
    signal: controller.signal,
  }), { name: "AbortError" });
  await assert.rejects(() => buildFixture(root, {
    rows: [row],
    maximumDecodedSourceBytes: 64,
    runId: "99999999-9999-4999-8999-999999999999",
  }), /decoded fixture exceeds the byte limit/);
  await assert.rejects(() => stat(path.join(root, "output", ".staging", "99999999-9999-4999-8999-999999999999")), { code: "ENOENT" });
  const linkedOutput = path.join(root, "linked-output");
  const linkTarget = path.join(root, "linked-target");
  await mkdir(linkedOutput, { recursive: true });
  await mkdir(linkTarget, { recursive: true });
  await symlink(linkTarget, path.join(linkedOutput, ".staging"), "junction");
  await assert.rejects(() => buildDcCorporateRegistrationOffline({
    outputRoot: linkedOutput,
    sourcePath,
    preflight: receipt,
    acknowledgement: DC_CORPORATE_REGISTRATION_OFFLINE_BUILD_ACKNOWLEDGEMENT,
    now: BUILD_NOW,
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }), /regular non-link directories/);
});

test("verifier rejects checksum, self-consistent privacy, and joined ZIP+4 tampering", async (t) => {
  const root = await testDirectory("datahub-dc-corporate-tamper-");
  t.after(async () => rm(root, { recursive: true, force: true }));
  const result = await buildFixture(root);
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  manifest.audit = { EMAIL: "manifest-leak@example.test" };
  await writeFile(result.manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  await assert.rejects(() => verifyDcCorporateRegistrationOffline(result.manifestPath), /offline staging verification failed/);
  delete manifest.audit;
  const termsUrl = manifest.rights.district_data_terms_url;
  manifest.rights.district_data_terms_url = { EMAIL: "nested-manifest-leak@example.test" };
  await writeFile(result.manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  await assert.rejects(() => verifyDcCorporateRegistrationOffline(result.manifestPath), /offline staging verification failed/);
  manifest.rights.district_data_terms_url = termsUrl;
  const summaryArtifact = manifest.artifacts.find(({ artifact_type: type }) => type === "dc-corporate-registration-source-summary-json");
  const summaryPath = path.join(result.stagingDirectory, summaryArtifact.path);
  const originalSummaryText = await readFile(summaryPath, "utf8");
  const originalSummary = JSON.parse(originalSummaryText);
  const tamperedSummary = { ...originalSummary, zip5_records: 999, duplicate_file_numbers_rejected: false };
  const tamperedSummaryText = JSON.stringify(tamperedSummary, null, 2) + "\n";
  await writeFile(summaryPath, tamperedSummaryText);
  summaryArtifact.bytes = Buffer.byteLength(tamperedSummaryText);
  summaryArtifact.sha256 = sha256(tamperedSummaryText);
  manifest.coverage = tamperedSummary;
  await writeFile(result.manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  await assert.rejects(() => verifyDcCorporateRegistrationOffline(result.manifestPath), /offline staging verification failed/);
  await writeFile(summaryPath, originalSummaryText);
  summaryArtifact.bytes = Buffer.byteLength(originalSummaryText);
  summaryArtifact.sha256 = sha256(originalSummaryText);
  manifest.coverage = originalSummary;
  const artifact = manifest.artifacts.find(({ artifact_type: type }) => type === "normalized-dc-corporate-registration-organization-jsonl-gzip");
  const artifactPath = path.join(result.stagingDirectory, artifact.path);
  const records = gzipRows(await readFile(artifactPath));
  records[0].administrative_address.zip_code = "20001-1234";
  records[0].administrative_address.postal_code = "20001-1234";
  records[0].EMAIL = "leak@example.test";
  const tampered = gzipSync(records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  await writeFile(artifactPath, tampered);
  artifact.bytes = tampered.length;
  artifact.sha256 = sha256(tampered);
  await writeFile(result.manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  await assert.rejects(() => verifyDcCorporateRegistrationOffline(result.manifestPath), (error) => {
    assert.equal(error.message, "DC Corporate Registration offline staging verification failed.");
    assert.equal(error.failures.some(({ reason }) => /person\/contact\/agent|ZIP5|fields drifted/.test(reason)), true);
    return true;
  });
  await writeFile(artifactPath, Buffer.from("not-gzip"));
  await assert.rejects(() => verifyDcCorporateRegistrationOffline(result.manifestPath), /offline staging verification failed/);
});
