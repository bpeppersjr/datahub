import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  AK_BUSINESS_LICENSE_HEADERS,
  AK_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
  AK_BUSINESS_NAICS_HEADERS,
  AK_BUSINESS_NAICS_SCHEMA_FINGERPRINT,
  buildAkActiveBusinessLicenses,
  headerFingerprint,
  normalizeAkBusinessLicense,
  requestAkCsv,
  verifyAkActiveBusinessLicenses,
} from "./ak-active-business-licenses.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rawLicense(overrides = {}) {
  return {
    Owners: "PRIVATE OWNER",
    LicenseNumber: "1001",
    BusinessName: "Fixture Alaska Market LLC",
    Status: "Active",
    IssueDate: "1/15/2020",
    RenewDate: "10/9/2025",
    ExpireDate: "12/31/2027",
    HasTelemedicine: "No",
    PhysicalCity: "Anchorage",
    PhysicalCountry: "UNITED STATES",
    PhysicalLine1: "100 Market Street",
    PhysicalLine2: "Suite 200",
    PhysicalState: "AK",
    PhysicalZip: "99501",
    PhysicalZipPlus: "1234",
    MailingCity: "Anchorage",
    MailingCountry: "UNITED STATES",
    MailingLine1: "PO Box 1",
    MailingLine2: "PRIVATE",
    MailingState: "AK",
    MailingZip: "99501",
    MailingZipPlus: "0001",
    ...overrides,
  };
}

function rawNaics(overrides = {}) {
  return {
    Lob: "44-45 - Retail Trade",
    NaicsCode: "445110 - SUPERMARKETS AND OTHER GROCERY RETAILERS (EXCEPT CONVENIENCE RETAILERS)",
    NaicsDescription: "SUPERMARKETS AND OTHER GROCERY RETAILERS (EXCEPT CONVENIENCE RETAILERS)",
    LicenseNumber: "1001",
    BusinessName: "Fixture Alaska Market LLC",
    ...overrides,
  };
}

function selectedLicense(overrides = {}) {
  return {
    license_number: "1001",
    business_name: "Fixture Alaska Market LLC",
    status: "Active",
    issue_date: "1/15/2020",
    renew_date: "10/9/2025",
    expire_date: "12/31/2027",
    has_telemedicine: "No",
    physical_city: "Anchorage",
    physical_country: "UNITED STATES",
    physical_line_1: "100 Market Street",
    physical_unit: "Suite 200",
    physical_line_2_disposition: "safe-unit-retained",
    physical_state: "AK",
    physical_zip: "99501",
    physical_zip_plus: "1234",
    ...overrides,
  };
}

function naics(overrides = {}) {
  return {
    license_number: "1001",
    line_of_business_source: "44-45 - Retail Trade",
    naics_code_source: "445110 - SUPERMARKETS AND OTHER GROCERY RETAILERS (EXCEPT CONVENIENCE RETAILERS)",
    naics_description_source: "SUPERMARKETS AND OTHER GROCERY RETAILERS (EXCEPT CONVENIENCE RETAILERS)",
    ...overrides,
  };
}

function context() {
  return {
    runId: "ak-fixture-run",
    retrievedAt: "2026-09-01T12:00:00.000Z",
    sourceObservedFrom: "2026-09-01T11:59:00.000Z",
    sourceObservedThrough: "2026-09-01T12:00:00.000Z",
    sourceReleaseId: "ak-fixture-source",
    baselineByZip: new Map([["99501", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:99501", geoid: "99501" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["99501", "99508", "98188", "99999"].map((zipCode) => ({
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
  return Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
}

test("pins Alaska's full transport schemas while excluding personal and contaminated fields", () => {
  assert.equal(headerFingerprint(AK_BUSINESS_LICENSE_HEADERS), AK_BUSINESS_LICENSE_SCHEMA_FINGERPRINT);
  assert.equal(headerFingerprint(AK_BUSINESS_NAICS_HEADERS), AK_BUSINESS_NAICS_SCHEMA_FINGERPRINT);
  for (const excluded of ["Owners", "MailingLine1", "MailingLine2", "MailingCity", "MailingState", "MailingZip"]) {
    assert.equal(AK_BUSINESS_LICENSE_HEADERS.includes(excluded), true);
  }
});

test("normalizes active license, address, dates, and NAICS without inferring ownership", () => {
  const normalized = normalizeAkBusinessLicense(selectedLicense({ issue_date: "1/15/2020 9:46:14 AM" }), [
    naics(),
    naics(),
    naics({ line_of_business_source: "72 - Accommodation and Food Services", naics_code_source: "722513 - LIMITED-SERVICE RESTAURANTS", naics_description_source: "LIMITED-SERVICE RESTAURANTS" }),
  ], context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:ak_dcced_business_license_1001");
  assert.equal(normalized.entity_candidates.physical_site_id, "site:ak_dcced_business_license_1001");
  assert.equal(normalized.entity_candidates.establishment_id, "establishment:ak_dcced_business_license_1001");
  assert.equal(normalized.physical_address.postal_code, "99501");
  assert.equal(normalized.physical_address.zip4, "1234");
  assert.equal(normalized.license_profile.naics_classifications.length, 2);
  assert.equal(normalized.license_profile.naics_classifications[0].naics_code, "445110");
  assert.equal(normalized.license_profile.has_telemedicine, false);
  assert.equal(normalized.license_profile.issue_date, "2020-01-15");
  assert.equal(normalized.source_status.value, "active-in-alaska-business-license-download-as-of-retrieval");
  assert.equal(normalized.privacy.owner_fields_excluded, true);
  assert.equal(normalized.privacy.mailing_fields_excluded, true);
  assert.equal(normalized.export_policy, "local-review-only");
  assert.equal("owners" in normalized, false);
  assert.equal("mailing_address" in normalized, false);
});

test("retains active organization evidence but refuses foreign and P.O. Box site inference", () => {
  const foreign = normalizeAkBusinessLicense(selectedLicense({ physical_country: "CANADA", physical_state: "BC", physical_zip: "V6B 1A1", physical_zip_plus: null }), [], context());
  assert.equal(foreign.entity_candidates.physical_site_id, undefined);
  assert.equal(foreign.physical_address.site_inference_eligible, false);
  assert.equal(foreign.physical_address.postal_code, null);
  const poBox = normalizeAkBusinessLicense(selectedLicense({ physical_line_1: "PO Box 100", physical_unit: null, physical_line_2_disposition: "blank" }), [], context());
  assert.equal(poBox.entity_candidates.physical_site_id, undefined);
  assert.equal(poBox.physical_address.site_inference_reason, "nonphysical-post-office-box");
});

test("retries transient Alaska downloads and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response("LicenseNumber,BusinessName\n1,Fixture\n", {
      status: 200,
      headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=BusinessLicenseDownload.csv", date: "Tue, 01 Sep 2026 12:00:00 GMT" },
    });
  };
  const result = await requestAkCsv("https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload", { fetchImpl, type: "licenses", sleep: async () => {} });
  assert.equal(await result.response.text(), "LicenseNumber,BusinessName\n1,Fixture\n");
  assert.equal(result.observedAt, "2026-09-01T12:00:00.000Z");
  assert.equal(attempts, 2);
  await assert.rejects(() => requestAkCsv("https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload", {
    type: "licenses",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds and independently verifies a privacy-minimized Alaska active-license release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const licenseRows = [
    rawLicense({ PhysicalLine2: "9075550100" }),
    rawLicense({ LicenseNumber: "1002", BusinessName: "Foreign Fixture LLC", PhysicalCountry: "CANADA", PhysicalCity: "Vancouver", PhysicalState: "BC", PhysicalZip: "V6B 1A1", PhysicalZipPlus: "", PhysicalLine1: "10 Main Street", PhysicalLine2: "" }),
    rawLicense({ LicenseNumber: "1003", BusinessName: "Mailbox Fixture LLC", PhysicalLine1: "PO Box 33", PhysicalLine2: "", PhysicalCity: "Anchorage", PhysicalZip: "99508", PhysicalZipPlus: "" }),
    rawLicense({ LicenseNumber: "1004", BusinessName: "", PhysicalLine2: "" }),
  ];
  const naicsRows = [
    rawNaics(),
    rawNaics(),
    rawNaics({ NaicsCode: "722513 - LIMITED-SERVICE RESTAURANTS", NaicsDescription: "LIMITED-SERVICE RESTAURANTS" }),
    rawNaics({ LicenseNumber: "1002", BusinessName: "Foreign Fixture LLC" }),
    rawNaics({ LicenseNumber: "1003", BusinessName: "Mailbox Fixture LLC" }),
  ];
  const result = await buildAkActiveBusinessLicenses({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    licenseRows,
    naicsRows,
    sourceMetadata: {
      licenseHeaders: AK_BUSINESS_LICENSE_HEADERS,
      naicsHeaders: AK_BUSINESS_NAICS_HEADERS,
      licenseObservedAt: "2026-09-01T11:59:00.000Z",
      naicsObservedAt: "2026-09-01T12:00:00.000Z",
    },
    minimumLicenseRows: 1,
    maximumQuarantineRate: 0.5,
    minimumNaicsCoverageRate: 0.75,
    logger: () => {},
    now: () => new Date("2026-09-01T12:01:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_active_license_rows, 4);
  assert.equal(result.manifest.coverage.active_license_organizations, 3);
  assert.equal(result.manifest.coverage.provisional_physical_sites, 1);
  assert.equal(result.manifest.coverage.organizations_without_eligible_physical_site, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 1);
  assert.equal(result.manifest.coverage.source_naics_rows, 5);
  assert.equal(result.manifest.coverage.distinct_license_naics_pairs, 4);
  assert.equal(result.manifest.coverage.duplicate_license_naics_rows_collapsed, 1);
  assert.equal(result.manifest.policy.record_level_distribution, "local-review-only");
  const verified = await verifyAkActiveBusinessLicenses(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 4);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-ak-active-business-license-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 3);
  assert.equal(normalized.filter((record) => record.entity_candidates.physical_site_id).length, 1);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "ak-active-business-license-selected-source-jsonl-gzip");
  const selected = await gunzipRecords(path.join(result.releaseDirectory, sourceArtifact.path));
  assert.equal(selected[0].physical_line_2_disposition, "excluded-contact-or-unstructured-value");
  assert.equal("Owners" in selected[0], false);
  assert.equal("PhysicalLine2" in selected[0], false);
  assert.equal(Object.keys(selected[0]).some((key) => key.startsWith("mailing")), false);
  assert.equal(JSON.stringify(selected).includes("PRIVATE OWNER"), false);
});

test("blocks schema drift, unexpected fields, duplicate identities, orphan classifications, and cancellation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const base = {
    zbpPointer,
    sourceMetadata: { licenseHeaders: AK_BUSINESS_LICENSE_HEADERS, naicsHeaders: AK_BUSINESS_NAICS_HEADERS, licenseObservedAt: "2026-09-01T12:00:00.000Z", naicsObservedAt: "2026-09-01T12:00:30.000Z" },
    minimumLicenseRows: 1,
    logger: () => {},
  };
  await assert.rejects(() => buildAkActiveBusinessLicenses({ ...base, outputRoot: path.join(root, "drift"), licenseRows: [rawLicense()], naicsRows: [rawNaics()], sourceMetadata: { ...base.sourceMetadata, licenseHeaders: [...AK_BUSINESS_LICENSE_HEADERS.slice(0, -1), "Changed"] } }), /license schema changed/);
  await assert.rejects(() => buildAkActiveBusinessLicenses({ ...base, outputRoot: path.join(root, "field"), licenseRows: [rawLicense({ SSN: "PRIVATE" })], naicsRows: [rawNaics()] }), /Unexpected Alaska license source field SSN/);
  await assert.rejects(() => buildAkActiveBusinessLicenses({ ...base, outputRoot: path.join(root, "duplicate"), licenseRows: [rawLicense(), rawLicense()], naicsRows: [rawNaics()] }), /Duplicate Alaska business license number 1001/);
  await assert.rejects(() => buildAkActiveBusinessLicenses({ ...base, outputRoot: path.join(root, "orphan"), licenseRows: [rawLicense()], naicsRows: [rawNaics({ LicenseNumber: "9999" })] }), /NAICS row references missing license 9999/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildAkActiveBusinessLicenses({ ...base, outputRoot: path.join(root, "cancelled"), licenseRows: [rawLicense()], naicsRows: [rawNaics()], signal: controller.signal }), /aborted/i);
});
