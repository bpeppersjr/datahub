import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildCaAbcActiveLicenseSites,
  CA_ABC_RAW_HEADERS,
  CA_ABC_RAW_SCHEMA_FINGERPRINT,
  CA_ABC_SELECTED_FIELDS,
  normalizeCaAbcActiveLicenseSite,
  rawHeaderFingerprint,
  requestCaAbcArchive,
  verifyCaAbcActiveLicenseSites,
} from "./ca-abc-active-license-sites.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function license(overrides = {}) {
  return {
    source_row_ordinal: 1,
    license_type: "21",
    file_number: "00123456",
    license_or_application: "LIC",
    type_status: "ACTIVE",
    type_original_issue_date: "15-JUN-2018",
    expiration_date: "31-JUL-2027",
    fee_codes: "P40",
    duplicate_count: null,
    master_indicator: "Y",
    term_months: "12",
    geo_code: "1900",
    district: "04",
    primary_name: "FIXTURE MARKET LLC",
    premise_address_1: "100 TEST STREET",
    premise_address_2: "SUITE 2",
    premise_city: "LOS ANGELES",
    premise_state: "CA",
    premise_zip: "90001-1234",
    dba_name: "FIXTURE MARKET",
    premise_county: "LOS ANGELES",
    premise_census_tract: "1234.00",
    ...overrides,
  };
}

function context() {
  return {
    runId: "ca-abc-fixture-run",
    retrievedAt: "2026-09-01T12:00:00.000Z",
    sourceModifiedAt: "2026-09-01T10:50:26.000Z",
    sourceReleaseId: "ca-abc-fixture-source",
    baselineByZip: new Map([["90001", { postal_label: { preferred_state: "CA" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["90001", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    postal_label: zipCode === "90001" ? { preferred_state: "CA" } : null,
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = {
    dataset_id: "census-zbp-baseline",
    release_id: "zbp-fixture",
    artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer), artifact_type: "zip-coverage-union-jsonl" }],
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
  return Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
}

test("pins the official California ABC layout while excluding mailing and contact fields", () => {
  assert.equal(CA_ABC_RAW_HEADERS.length, 26);
  assert.equal(rawHeaderFingerprint(CA_ABC_RAW_HEADERS), CA_ABC_RAW_SCHEMA_FINGERPRINT);
  for (const field of ["Mail Addr 1", "Mail Addr 2", "Mail City", "Mail State", "Mail Zip", "phone", "email", "owner", "officer"]) {
    assert.equal(CA_ABC_SELECTED_FIELDS.some((selected) => selected.toLowerCase().replaceAll("_", " ") === field.toLowerCase()), false);
  }
  assert.notEqual(rawHeaderFingerprint([...CA_ABC_RAW_HEADERS, "Owner Name"]), CA_ABC_RAW_SCHEMA_FINGERPRINT);
});

test("groups active issued license types into one source-preserving premise", () => {
  const normalized = normalizeCaAbcActiveLicenseSite([
    license(),
    license({ source_row_ordinal: 2, license_type: "42", master_indicator: "N", dba_name: "FIXTURE MARKET CAFE" }),
    license({ source_row_ordinal: 3, type_original_issue_date: "15-JUN-2020", expiration_date: "31-JUL-2025" }),
  ], context());
  assert.equal(normalized.source_record_id, "00123456");
  assert.equal(normalized.entity_candidates.organization_id, "organization:ca_abc_file_00123456");
  assert.equal(normalized.entity_candidates.physical_site_id, "physical_site:ca_abc_file_00123456");
  assert.equal(normalized.license_activities.length, 3);
  assert.deepEqual(normalized.names.dba_names, ["FIXTURE MARKET", "FIXTURE MARKET CAFE"]);
  assert.equal(normalized.premise_address.postal_code, "90001-1234");
  assert.equal(normalized.export_policy, "local-review-only");
});

test("retains source-active expiration discrepancies and rejects unsafe premise inference", () => {
  const expired = normalizeCaAbcActiveLicenseSite([license({ expiration_date: "31-AUG-2026" })], context());
  assert.equal(expired.source_status.expiration_before_observation_count, 1);
  assert.equal(expired.source_status.general_operating_status_inferred, false);
  assert.throws(() => normalizeCaAbcActiveLicenseSite([license({ premise_address_1: "PO BOX 1" })], context()), /po-box-not-physical-premise/);
  assert.throws(() => normalizeCaAbcActiveLicenseSite([license({ primary_name: null })], context()), /missing-publishable-business-name/);
  assert.throws(() => normalizeCaAbcActiveLicenseSite([license(), license({ source_row_ordinal: 2, license_type: "42", premise_address_1: "200 OTHER STREET" })], context()), /conflicting-license-file-group/);
  assert.throws(() => normalizeCaAbcActiveLicenseSite([license({ premise_state: "NV" })], context()), /source-state-conflicts-with-postal-label/);
});

test("retries transient California ABC archive responses and rejects redirects", async () => {
  const headers = new Headers({ "content-length": "100", "content-type": "application/zip", "last-modified": "Tue, 01 Sep 2026 10:50:26 GMT" });
  let attempts = 0;
  const response = await requestCaAbcArchive("HEAD", {
    attempts: 2,
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1 ? { status: 503, ok: false, headers } : { status: 200, ok: true, headers };
    },
  });
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
  await assert.rejects(() => requestCaAbcArchive("HEAD", { attempts: 1, fetchImpl: async () => ({ status: 302, ok: false, headers }) }), /redirects are not permitted/);
});

test("builds, minimizes, quarantines, and independently verifies a California ABC release", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ca-abc-fixture-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp"));
    const sourceRows = [
      license(),
      license({ source_row_ordinal: 2, license_type: "42", master_indicator: "N" }),
      license({ source_row_ordinal: 3, file_number: "00123457", primary_name: null }),
      license({ source_row_ordinal: 4, file_number: "00123458", type_status: "PEND" }),
      license({ source_row_ordinal: 5, file_number: "00123459", license_or_application: "APP" }),
    ];
    const result = await buildCaAbcActiveLicenseSites({
      outputRoot: path.join(root, "output"),
      zbpPointer,
      sourceRows,
      sourceMetadata: {
        bytes: 1234,
        modifiedAt: "2026-09-01T10:50:26.000Z",
        archiveSha256: "a".repeat(64),
        sourceUpdatedLabel: "Updated Tuesday 1st of September 2026 03:50:21 AM",
      },
      minimumSites: 1,
      maximumQuarantineRatio: 1,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      logger: () => {},
    });
    assert.equal(result.coverage.source_records, 5);
    assert.equal(result.coverage.selected_active_issued_license_rows, 3);
    assert.equal(result.coverage.excluded_source_rows, 2);
    assert.equal(result.coverage.normalized_sites, 1);
    assert.equal(result.coverage.license_activities, 2);
    assert.equal(result.coverage.quarantined_file_groups, 1);
    assert.equal(result.manifest.raw_archive_retained, false);
    const verified = await verifyCaAbcActiveLicenseSites(path.join(result.releaseDirectory, "manifest.json"));
    assert.equal(verified.coverage.normalized_sites, 1);
    const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "ca-abc-selected-active-issued-license-source-jsonl-gzip");
    const selected = await gunzipRecords(path.join(result.releaseDirectory, sourceArtifact.path));
    assert.equal(selected.length, 3);
    for (const record of selected) for (const field of ["mail_addr_1", "mail_city", "mail_zip", "phone", "email", "owner"]) assert.equal(Object.hasOwn(record, field), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks selected-field drift, duplicate identities, excessive quarantine, and cancellation", async () => {
  const drifted = { ...license(), mail_zip: "90001" };
  assert.throws(() => normalizeCaAbcActiveLicenseSite([drifted], context()), /selected source fields drifted/);
  const root = await mkdtemp(path.join(tmpdir(), "ca-abc-failure-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp"));
    const metadata = { bytes: 1, modifiedAt: "2026-09-01T10:50:26.000Z", archiveSha256: "b".repeat(64) };
    await assert.rejects(() => buildCaAbcActiveLicenseSites({
      outputRoot: path.join(root, "duplicate"), zbpPointer,
      sourceRows: [license(), license({ source_row_ordinal: 2 })], sourceMetadata: metadata,
      minimumSites: 1, maximumQuarantineRatio: 1, logger: () => {},
    }), /Duplicate California ABC selected source row/);
    await assert.rejects(() => buildCaAbcActiveLicenseSites({
      outputRoot: path.join(root, "quarantine"), zbpPointer,
      sourceRows: [license({ primary_name: null })], sourceMetadata: metadata,
      minimumSites: 1, maximumQuarantineRatio: 0, logger: () => {},
    }), /normalized site count|quarantine ratio/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => buildCaAbcActiveLicenseSites({
      outputRoot: path.join(root, "cancelled"), zbpPointer,
      sourceRows: [license()], sourceMetadata: metadata, signal: controller.signal,
      minimumSites: 1, logger: () => {},
    }), { name: "AbortError" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
