import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";

import {
  acquireUsdaOrganicIntegrity,
  buildUsdaOrganicIntegrityOffline,
  preflightUsdaOrganicIntegrity,
  USDA_INTEGRITY_HISTORY_URL,
  USDA_INTEGRITY_LIVE_ACQUISITION_ACKNOWLEDGEMENT,
  USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT,
  USDA_INTEGRITY_STATUS_VOCABULARY,
  verifyUsdaOrganicIntegrityOffline,
  writeUsdaIntegrityPreflightReceipt,
} from "./usda-organic-integrity.mjs";
import {
  createUsdaIntegrityFixtureWorkbook,
  readUsdaIntegrityWorkbook,
  USDA_INTEGRITY_WORKBOOK_SHEETS,
} from "./usda-organic-integrity-xlsx.mjs";

const WORKBOOK_URL = "https://organic.ams.usda.gov/Integrity/MonthlyReports/INTEGRITY_Data_20260901.xlsx";
const BUILD_NOW = () => new Date("2026-09-03T16:00:00.000Z");

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function response(body, headers, status = 200) {
  return new Response(body, { status, headers });
}

async function preflight(overrides = {}) {
  const calls = [];
  const receipt = await preflightUsdaOrganicIntegrity({
    workbookUrl: WORKBOOK_URL,
    now: () => new Date("2026-09-03T15:00:00.000Z"),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method });
      if (String(url) === USDA_INTEGRITY_HISTORY_URL) {
        const body = `<html><title>Organic Integrity Database</title><a href="${WORKBOOK_URL}">September 2026</a></html>`;
        return response(body, { "content-type": "text/html; charset=utf-8", "content-length": String(Buffer.byteLength(body)) });
      }
      throw new Error("Workbook endpoint must never be requested by metadata-only preflight.");
    },
    ...overrides,
  });
  return { receipt, calls };
}

function operation(overrides = {}) {
  return {
    "Operation ID": "1234567890",
    "Operation Name": "Fixture Organic Foods LLC",
    "Country Code": "USA",
    Country: "UNITED STATES OF AMERICA (THE)",
    Status: "Certified",
    "Effective Date of Operation Status": "2024-06-15",
    Certifier: "Fixture Organic Certifier",
    "Physical Address 1": "100 Farm Road",
    "Physical Address 2": "Building A",
    "Physical City": "Austin",
    "Physical State": "TX",
    "Physical Postal Code": "78701-1234",
    "Mailing Address 1": "PO Box 100",
    "Mailing Address 2": "",
    "Mailing City": "Austin",
    "Mailing State": "TX",
    "Mailing Postal Code": "78702",
    ...overrides,
  };
}

function fixtureRows() {
  return {
    Operations: [
      operation(),
      operation({ "Operation ID": "1234567891", Status: "Suspended" }),
      operation({ "Operation ID": "1234567892", "Country Code": "CAN", Country: "CANADA" }),
      operation({ "Operation ID": "1234567893", Country: "United States of America" }),
    ],
    Scopes: [
      { "Operation ID": "1234567890", "NOP Scope": "Handling" },
      { "Operation ID": "1234567890", "NOP Scope": "Crops" },
      { "Operation ID": "1234567891", "NOP Scope": "Handling" },
    ],
    Services: [
      { "Operation ID": "1234567890", Service: "Distributor" },
      { "Operation ID": "1234567890", Service: "Retail Food Establishment" },
    ],
    Products: [
      { "Operation ID": "1234567890", "NOP Scope": "Handling", "NOP Category ID": "10", "NOP Category": "Prepared products", "NOP Item ID": "1001", "NOP Item Name": "Prepared foods" },
      { "Operation ID": "1234567890", "NOP Scope": "Crops", "NOP Category ID": "20", "NOP Category": "Vegetables", "NOP Item ID": "2001", "NOP Item Name": "Leafy vegetables" },
    ],
  };
}

test("metadata-only preflight discovers an exact workbook link from one bounded history GET while live acquisition remains inert", async () => {
  const { receipt, calls } = await preflight();
  assert.deepEqual(calls, [
    { url: USDA_INTEGRITY_HISTORY_URL, method: "GET" },
  ]);
  assert.equal(receipt.acquisition.full_workbook_body_requests, 0);
  assert.equal(receipt.acquisition.workbook_network_requests, 0);
  assert.equal(receipt.acquisition.workbook_response_bytes, 0);
  assert.equal(receipt.candidate_monthly_workbook.url, WORKBOOK_URL);
  assert.deepEqual(USDA_INTEGRITY_STATUS_VOCABULARY, [
    "Certified", "Surrendered", "Suspended", "Revoked", "Transitional", "Denied Certification", "Withdrew with NONC", "Withdrew from Transitional",
  ]);
  let acquisitionCalls = 0;
  await assert.rejects(() => acquireUsdaOrganicIntegrity({ preflight: receipt, fetchImpl: async () => { acquisitionCalls += 1; } }), /default-denied/);
  await assert.rejects(() => acquireUsdaOrganicIntegrity({
    acknowledgement: USDA_INTEGRITY_LIVE_ACQUISITION_ACKNOWLEDGEMENT,
    preflight: receipt,
    now: BUILD_NOW,
    fetchImpl: async () => { acquisitionCalls += 1; },
  }), /not implemented; no workbook request was made/);
  assert.equal(acquisitionCalls, 0);
  await assert.rejects(() => preflightUsdaOrganicIntegrity({
    workbookUrl: "https://example.com/Monthly.xlsx",
    fetchImpl: async () => { throw new Error("must not request"); },
  }), /outside the official allowlist/);
  await assert.rejects(() => preflightUsdaOrganicIntegrity({
    workbookUrl: `${WORKBOOK_URL}?download=1`,
    fetchImpl: async () => { throw new Error("must not request"); },
  }), /forbidden authority, query, or fragment/);
  await assert.rejects(() => preflightUsdaOrganicIntegrity({
    workbookUrl: WORKBOOK_URL,
    fetchImpl: async () => {
      const body = "<html><title>Organic Integrity Database</title></html>";
      return response(body, { "content-type": "text/html", "content-length": String(Buffer.byteLength(body)) });
    },
  }), /does not expose an exact monthly workbook link/);
  await assert.rejects(() => preflightUsdaOrganicIntegrity({
    workbookUrl: WORKBOOK_URL,
    fetchImpl: async () => response(Buffer.alloc(65 * 1024, 65), { "content-type": "text/html", "content-length": "10" }),
  }), /exceeded its bounded size limit/);
});

test("preflight receipt output rejects a junction that resolves outside datahub", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-usda-integrity-receipt-"));
  const outside = await mkdtemp(path.join(tmpdir(), "outside-usda-integrity-receipt-"));
  t.after(async () => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  const { receipt } = await preflight();
  const safe = await writeUsdaIntegrityPreflightReceipt({ receipt, outputRoot: path.join(root, "receipts"), appRoot: root, now: BUILD_NOW });
  assert.equal((await readFile(safe.path, "utf8")).includes(receipt.receipt_fingerprint), true);
  const junction = path.join(root, "redirected");
  await symlink(outside, junction, "junction");
  await assert.rejects(() => writeUsdaIntegrityPreflightReceipt({
    receipt,
    outputRoot: path.join(junction, "receipts"),
    appRoot: root,
    now: BUILD_NOW,
  }), /escapes the governed datahub directory/);
});

test("builds and independently verifies a filtered privacy-minimized offline staging release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-usda-integrity-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const workbookPath = path.join(root, "fixture.xlsx");
  const workbook = createUsdaIntegrityFixtureWorkbook(fixtureRows());
  await writeFile(workbookPath, workbook);
  const { receipt } = await preflight();
  const result = await buildUsdaOrganicIntegrityOffline({
    sourcePath: workbookPath,
    outputRoot: path.join(root, "output"),
    preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT,
    expectedSourceSha256: hash(workbook),
    appRoot: root,
    runId: "11111111-1111-4111-8111-111111111111",
    now: BUILD_NOW,
  });
  assert.equal(result.manifest.status, "verified-staging-local-review-only");
  assert.equal(result.manifest.publication.production_pointer_published, false);
  assert.deepEqual(result.manifest.coverage, {
    source_operations: 4,
    selected_certified_usda_nop_us_operations: 1,
    filtered_not_united_states_of_america: 2,
    filtered_not_certified: 1,
    source_scope_rows: 3,
    source_service_rows: 2,
    source_product_rows: 2,
    physical_sites: 0,
    establishments: 0,
    business_geocodes: 0,
    complete_all_active_businesses: false,
  });
  const verification = await verifyUsdaOrganicIntegrityOffline(result.manifestPath);
  assert.equal(verification.records, 1);
  const artifact = result.manifest.artifacts[0];
  const [record] = gunzipSync(await readFile(path.join(result.stagingDirectory, artifact.path))).toString("utf8").trim().split("\n").map(JSON.parse);
  assert.equal(record.external_identifiers[0].value, "1234567890");
  assert.equal(record.certification.status, "Certified");
  assert.equal(record.certification.effective_date, "2024-06-15");
  assert.equal(record.certification.certifier_name, "Fixture Organic Certifier");
  assert.deepEqual(record.certified_scopes, ["Crops", "Handling"]);
  assert.deepEqual(record.certified_services, ["Distributor", "Retail Food Establishment"]);
  assert.equal(record.product_taxonomy[0].nop_category_id, "20");
  assert.deepEqual({
    zip_code: record.addresses.physical.zip_code,
    postal_code: record.addresses.physical.postal_code,
    zip4: record.addresses.physical.zip4,
  }, { zip_code: "78701", postal_code: "78701", zip4: "1234" });
  assert.equal(record.addresses.physical.source_designation, "source-designated-physical-address");
  assert.equal(record.addresses.mailing.source_designation, "source-designated-mailing-address");
  assert.equal(record.addresses.physical.latitude, null);
  assert.equal(record.addresses.physical.longitude, null);
  assert.equal(record.temporal_status.current_sales_or_operation_asserted, false);
  assert.deepEqual(record.temporal_status, {
    source_snapshot_observed_at: "2026-09-03T16:00:00.000Z",
    source_snapshot_reference_date: "2026-09-01",
    source_workbook_linkage_status: "unverified-operator-supplied-conformance",
    first_seen: "2026-09-03T16:00:00.000Z",
    last_seen: "2026-09-03T16:00:00.000Z",
    valid_from: "2024-06-15",
    valid_to: null,
    certification_effective_date: "2024-06-15",
    current_sales_or_operation_asserted: false,
  });
  assert.equal(record.provenance.source_release_id, `operator-supplied-usda-organic-integrity-conformance-${hash(workbook).slice(0, 16)}`);
  assert.equal(result.manifest.source.source_release_id, record.provenance.source_release_id);
  assert.equal(result.manifest.source.source_workbook_linkage_status, "unverified-operator-supplied-conformance");
  const serialized = JSON.stringify(record);
  for (const forbidden of ["contact", "phone", "email", "client_id", "agent", "person", "other_item", "varieties", "geometry"]) assert.equal(serialized.toLowerCase().includes(forbidden), false);
});

test("fails closed on cancellation, source tampering, schema drift, formulas, macros, and orphan children", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-usda-integrity-negative-"));
  const outsideSourceRoot = await mkdtemp(path.join(tmpdir(), "outside-usda-integrity-source-"));
  t.after(async () => Promise.all([rm(root, { recursive: true, force: true }), rm(outsideSourceRoot, { recursive: true, force: true })]));
  const { receipt } = await preflight();
  const ordinary = createUsdaIntegrityFixtureWorkbook(fixtureRows());
  const sourcePath = path.join(root, "source.xlsx");
  await writeFile(sourcePath, ordinary);
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath, outputRoot: path.join(root, "hash"), preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: "0".repeat(64), now: BUILD_NOW, appRoot: root,
  }), /SHA-256 does not match/);
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath, outputRoot: path.join(root, "run-id"), preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(ordinary), now: BUILD_NOW, appRoot: root, runId: "../escape",
  }), /version-4 UUID/);
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath, outputRoot: path.join(path.dirname(root), "outside-datahub"), preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(ordinary), now: BUILD_NOW, appRoot: root,
  }), /escapes the governed datahub directory/);
  const outsideSource = path.join(outsideSourceRoot, "source.xlsx");
  await writeFile(outsideSource, ordinary);
  const sourceJunction = path.join(root, "source-junction");
  await symlink(outsideSourceRoot, sourceJunction, "junction");
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath: path.join(sourceJunction, "source.xlsx"), outputRoot: path.join(root, "linked"), preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(ordinary), now: BUILD_NOW, appRoot: root,
  }), /escapes the governed datahub directory/);
  const redirectedOutput = path.join(root, "redirected-output");
  await mkdir(redirectedOutput);
  await symlink(outsideSourceRoot, path.join(redirectedOutput, ".staging"), "junction");
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath, outputRoot: redirectedOutput, preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(ordinary), now: BUILD_NOW, appRoot: root,
  }), /staging root escapes the governed datahub directory/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath, outputRoot: path.join(root, "cancelled"), preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(ordinary), now: BUILD_NOW, signal: controller.signal, appRoot: root,
  }), { name: "AbortError" });

  const drift = createUsdaIntegrityFixtureWorkbook(fixtureRows(), {
    sheetHeaders: { Operations: USDA_INTEGRITY_WORKBOOK_SHEETS.Operations.map((value) => value === "Operation Name" ? "Business Name" : value) },
  });
  const driftPath = path.join(root, "drift.xlsx");
  await writeFile(driftPath, drift);
  await assert.rejects(() => readUsdaIntegrityWorkbook(driftPath), /header schema drifted/);

  const formula = createUsdaIntegrityFixtureWorkbook(fixtureRows(), {
    worksheetTransforms: { Operations: (xml) => xml.replace("<is><t xml:space=\"preserve\">Fixture Organic Foods LLC</t></is>", "<f>1+1</f><v>2</v>") },
  });
  const formulaPath = path.join(root, "formula.xlsx");
  await writeFile(formulaPath, formula);
  await assert.rejects(() => readUsdaIntegrityWorkbook(formulaPath), /contains a formula/);

  const macro = createUsdaIntegrityFixtureWorkbook(fixtureRows(), { extraParts: [["xl/vbaProject.bin", "not-a-real-macro"]] });
  const macroPath = path.join(root, "macro.xlsx");
  await writeFile(macroPath, macro);
  await assert.rejects(() => readUsdaIntegrityWorkbook(macroPath), /forbidden active or external content/);

  const hiddenFormula = createUsdaIntegrityFixtureWorkbook(fixtureRows(), {
    extraParts: [["xl/worksheets/unreferenced.xml", "<worksheet><sheetData><row r=\"1\"><c r=\"A1\"><f>WEBSERVICE(\"https://example.test\")</f><v>0</v></c></row></sheetData></worksheet>"]],
  });
  const hiddenFormulaPath = path.join(root, "hidden-formula.xlsx");
  await writeFile(hiddenFormulaPath, hiddenFormula);
  await assert.rejects(() => readUsdaIntegrityWorkbook(hiddenFormulaPath), /contains a formula/);

  const externalRelationship = createUsdaIntegrityFixtureWorkbook(fixtureRows(), {
    extraParts: [["xl/worksheets/_rels/sheet1.xml.rels", "<Relationships><Relationship Id=\"rId1\" Target=\"https://example.test/payload\" TargetMode=\"External\"/></Relationships>"]],
  });
  const externalRelationshipPath = path.join(root, "external-relationship.xlsx");
  await writeFile(externalRelationshipPath, externalRelationship);
  await assert.rejects(() => readUsdaIntegrityWorkbook(externalRelationshipPath), /external relationship/);
  await assert.rejects(() => readUsdaIntegrityWorkbook(sourcePath, { maximumPartCount: 2 }), /part-count limit/);

  const orphanRows = fixtureRows();
  orphanRows.Services.push({ "Operation ID": "9999999999", Service: "Distributor" });
  const orphan = createUsdaIntegrityFixtureWorkbook(orphanRows);
  const orphanPath = path.join(root, "orphan.xlsx");
  await writeFile(orphanPath, orphan);
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath: orphanPath, outputRoot: path.join(root, "orphan"), preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(orphan), now: BUILD_NOW, appRoot: root,
  }), /orphan Operation ID/);
});

test("verifier rejects checksum and self-consistent privacy or geocode tampering", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-usda-integrity-verify-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const workbook = createUsdaIntegrityFixtureWorkbook(fixtureRows());
  const sourcePath = path.join(root, "source.xlsx");
  await writeFile(sourcePath, workbook);
  const result = await buildUsdaOrganicIntegrityOffline({
    sourcePath, outputRoot: path.join(root, "output"), preflight: (await preflight()).receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(workbook), now: BUILD_NOW,
    appRoot: root,
    runId: "22222222-2222-4222-8222-222222222222",
  });
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  const originalManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  manifest.source.candidate_monthly_workbook_url = "https://example.test/INTEGRITY_Data_20260901.xlsx";
  await writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(() => verifyUsdaOrganicIntegrityOffline(result.manifestPath), (error) => {
    assert.equal(error.failures.some(({ reason }) => reason === "manifest-source-identity"), true);
    return true;
  });
  await writeFile(result.manifestPath, originalManifest);
  manifest.source.candidate_monthly_workbook_url = WORKBOOK_URL;
  const artifact = manifest.artifacts[0];
  const artifactPath = path.join(result.stagingDirectory, artifact.path);
  const [record] = gunzipSync(await readFile(artifactPath)).toString("utf8").trim().split("\n").map(JSON.parse);
  record.addresses.physical.latitude = 30.2672;
  record.addresses.physical.contact_phone = "555-0100";
  record.addresses.physical.operation_contact_email = "private@example.test";
  record.addresses.meaning = "Verified operating establishment.";
  const tampered = gzipSync(`${JSON.stringify(record)}\n`);
  await writeFile(artifactPath, tampered);
  artifact.bytes = tampered.length;
  artifact.sha256 = hash(tampered);
  await writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(() => verifyUsdaOrganicIntegrityOffline(result.manifestPath), (error) => {
    assert.equal(error.message, "USDA INTEGRITY offline staging verification failed.");
    assert.equal(error.failures.some(({ reason }) => reason === "invented-site-or-geocode"), true);
    assert.equal(error.failures.some(({ reason }) => reason === "address-semantics"), true);
    assert.equal(error.failures.some(({ reason }) => reason === "email-content" || reason.startsWith("prohibited-field")), true);
    return true;
  });
  await writeFile(artifactPath, Buffer.from("not-gzip"));
  await assert.rejects(() => verifyUsdaOrganicIntegrityOffline(result.manifestPath), /offline staging verification failed/);
});

test("verifier rejects an artifact directory junction that resolves outside its immutable release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-usda-integrity-artifact-link-"));
  const outside = await mkdtemp(path.join(tmpdir(), "outside-usda-integrity-artifact-link-"));
  t.after(async () => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  const workbook = createUsdaIntegrityFixtureWorkbook(fixtureRows());
  const sourcePath = path.join(root, "source.xlsx");
  await writeFile(sourcePath, workbook);
  const result = await buildUsdaOrganicIntegrityOffline({
    sourcePath, outputRoot: path.join(root, "output"), preflight: (await preflight()).receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(workbook), now: BUILD_NOW,
    appRoot: root,
    runId: "33333333-3333-4333-8333-333333333333",
  });
  const artifact = result.manifest.artifacts[0];
  const artifactPath = path.join(result.stagingDirectory, artifact.path);
  await writeFile(path.join(outside, "operations.jsonl.gz"), await readFile(artifactPath));
  const artifactDirectory = path.dirname(artifactPath);
  await rm(artifactDirectory, { recursive: true });
  await symlink(outside, artifactDirectory, "junction");
  await assert.rejects(() => verifyUsdaOrganicIntegrityOffline(result.manifestPath), (error) => {
    assert.equal(error.message, "USDA INTEGRITY offline staging verification failed.");
    assert.equal(error.failures.some(({ reason }) => reason.includes("escapes the governed datahub directory")), true);
    return true;
  });
});

test("selected certified operations require address evidence and at least one certified scope", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-usda-integrity-required-evidence-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const receipt = (await preflight()).receipt;
  const noAddressRows = fixtureRows();
  noAddressRows.Operations[0] = operation({
    "Physical Address 1": "", "Physical Address 2": "", "Physical City": "", "Physical State": "", "Physical Postal Code": "",
    "Mailing Address 1": "", "Mailing Address 2": "", "Mailing City": "", "Mailing State": "", "Mailing Postal Code": "",
  });
  const noAddressWorkbook = createUsdaIntegrityFixtureWorkbook(noAddressRows);
  const noAddressPath = path.join(root, "no-address.xlsx");
  await writeFile(noAddressPath, noAddressWorkbook);
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath: noAddressPath, outputRoot: path.join(root, "no-address-output"), preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(noAddressWorkbook), now: BUILD_NOW, appRoot: root,
  }), /missing-source-designated-address/);

  const noScopeRows = fixtureRows();
  noScopeRows.Scopes = noScopeRows.Scopes.filter((row) => row["Operation ID"] !== "1234567890");
  noScopeRows.Products = [];
  const noScopeWorkbook = createUsdaIntegrityFixtureWorkbook(noScopeRows);
  const noScopePath = path.join(root, "no-scope.xlsx");
  await writeFile(noScopePath, noScopeWorkbook);
  await assert.rejects(() => buildUsdaOrganicIntegrityOffline({
    sourcePath: noScopePath, outputRoot: path.join(root, "no-scope-output"), preflight: receipt,
    acknowledgement: USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT, expectedSourceSha256: hash(noScopeWorkbook), now: BUILD_NOW, appRoot: root,
  }), /missing-certified-scope/);
});
