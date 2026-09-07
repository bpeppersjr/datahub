import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { readdirSync, renameSync, mkdirSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import { PassThrough } from "node:stream";
import {
  AK_BUSINESS_LICENSE_HEADERS,
  AK_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
  AK_BUSINESS_NAICS_HEADERS,
  AK_BUSINESS_NAICS_SCHEMA_FINGERPRINT,
  buildAkActiveBusinessLicenses,
  headerFingerprint,
  normalizeAkBusinessLicense,
  publishAkActiveBusinessLicensesStaging,
  requestAkCsv,
  verifyAkActiveBusinessLicenses,
  writeGzipRecord,
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

test("Alaska retries honor seconds and HTTP dates without collapsing absent or invalid headers", async () => {
  const url = "https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload";
  for (const [header, expected] of [[null, 500], ["", 500], ["-1", 500], ["invalid", 500], ["120", 120000], ["0", 500], ["Tue, 01 Sep 2026 12:02:00 GMT", 120000], ["Tue, 01 Sep 2026 11:59:00 GMT", 500]]) {
    const waits = []; let calls = 0, cancelled = 0;
    await assert.rejects(requestAkCsv(url, {
      attempts: 2, now: () => new Date("2026-09-01T12:00:00Z"),
      sleep: async (ms) => waits.push(ms),
      fetchImpl: async () => { calls++; return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 429, headers: header === null ? {} : { "retry-after": header } }); },
    }), /HTTP 429/);
    assert.deepEqual(waits, [expected]); assert.equal(calls, 2); assert.equal(cancelled, 2);
  }
});

test("Alaska excessive publisher delays defer without another request or timer overflow", async () => {
  for (const header of ["86401", "9".repeat(400), "Wed, 02 Sep 2026 12:00:01 GMT"]) {
    let calls = 0;
    await assert.rejects(requestAkCsv("https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload", {
      now: () => new Date("2026-09-01T12:00:00Z"), sleep: async () => assert.fail("must not wait or shorten delay"),
      fetchImpl: async () => { calls++; return new Response(null, { status: 503, headers: { "retry-after": header } }); },
    }), { code: "AK_RETRY_DEFERRED" });
    assert.equal(calls, 1);
  }
});

test("Alaska real retry wait aborts promptly with no follow-up request", async () => {
  const controller = new AbortController(); let calls = 0;
  const result = requestAkCsv("https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload", {
    signal: controller.signal, fetchImpl: async () => {
      calls++; setTimeout(() => controller.abort(), 20);
      return new Response(null, { status: 429, headers: { "retry-after": "3600" } });
    },
  });
  await assert.rejects(result, { name: "AbortError" }); assert.equal(calls, 1);
});

test("Alaska network backoff is bounded and invalid retry budgets never fetch", async () => {
  const url = "https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload";
  for (const attempts of [0, 11, 1.5]) await assert.rejects(requestAkCsv(url, { attempts, fetchImpl: async () => assert.fail("invalid budget") }), /attempts/);
  const waits = [];
  await assert.rejects(requestAkCsv(url, { attempts: 7, fetchImpl: async () => { throw new TypeError("fixture network failure"); }, sleep: async (ms) => waits.push(ms) }), /fixture network failure/);
  assert.deepEqual(waits, [500, 1000, 2000, 4000, 8000, 8000]);
});

const downloadUrl = "https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload";
const csvHeaders = { "content-type": "text/csv", "content-disposition": "attachment; filename=BusinessLicenseDownload.csv" };

test("Alaska validates network budgets before any request", async () => {
  for (const options of [{ requestTimeoutMs: 0 }, { requestTimeoutMs: 300001 }, { requestTimeoutMs: NaN }, { maximumResponseBytes: NaN }, { maximumResponseBytes: 0 }, { maximumResponseBytes: 1.5 }]) {
    await assert.rejects(requestAkCsv(downloadUrl, { ...options, fetchImpl: async () => assert.fail("must not fetch") }), /must be/);
  }
});

test("Alaska header deadline retries only within the attempt budget", { timeout: 3000 }, async () => {
  let calls = 0;
  await assert.rejects(requestAkCsv(downloadUrl, {
    requestTimeoutMs: 20, attempts: 2, sleep: async () => {},
    fetchImpl: async (_url, { signal }) => { calls++; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); },
  }), { code: "AK_REQUEST_TIMEOUT" });
  assert.equal(calls, 2);
});

test("Alaska body deadline and caller cancellation stop stalled reads without replay", { timeout: 3000 }, async () => {
  for (const callerAbort of [false, true]) {
    const controller = new AbortController(); let cancelled = 0, calls = 0;
    const result = await requestAkCsv(downloadUrl, {
      signal: controller.signal, requestTimeoutMs: callerAbort ? 1000 : 30,
      fetchImpl: async () => { calls++; return new Response(new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } }), { headers: csvHeaders }); },
    });
    const reading = result.response.text();
    if (callerAbort) controller.abort();
    await assert.rejects(reading, callerAbort ? { name: "AbortError" } : { code: "AK_REQUEST_TIMEOUT" });
    assert.equal(cancelled, 1); assert.equal(calls, 1);
  }
});

test("Alaska rejects invalid response metadata and releases each body", async () => {
  for (const responseOptions of [
    { status: 302, headers: csvHeaders }, { status: 403, headers: csvHeaders },
    { headers: { ...csvHeaders, "content-type": "text/html" } },
    { headers: { ...csvHeaders, "content-disposition": "attachment; filename=wrong.csv" } },
    { headers: { ...csvHeaders, "content-length": "100" } },
    { headers: { ...csvHeaders, date: "not-a-date" } },
  ]) {
    let cancelled = 0;
    await assert.rejects(requestAkCsv(downloadUrl, { maximumResponseBytes: 50, fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), responseOptions) }));
    assert.equal(cancelled, 1);
  }
});

test("Alaska completed CSV disposes deadline and consumer cancellation releases body", { timeout: 3000 }, async () => {
  let requestSignal;
  const result = await requestAkCsv(downloadUrl, { requestTimeoutMs: 30, fetchImpl: async (_url, { signal }) => { requestSignal = signal; return new Response("ok", { headers: csvHeaders }); } });
  assert.equal(await result.response.text(), "ok");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(requestSignal.aborted, false);
  let cancelled = 0;
  const abandoned = await requestAkCsv(downloadUrl, { fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: csvHeaders }) });
  await abandoned.response.body.cancel();
  assert.equal(cancelled, 1);
});

test("Alaska body and parser failures reject builds instead of hanging or publishing", { timeout: 10000 }, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-stream-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const header = `${AK_BUSINESS_LICENSE_HEADERS.join(",")}\n`;
  for (const kind of ["oversize", "body-error", "bad-schema", "malformed", "deadline"]) {
    let cancelled = 0, calls = 0, sent = false;
    const outputRoot = path.join(root, kind);
    const body = new ReadableStream({
      pull(controller) {
        if (sent) {
          if (kind === "body-error") controller.error(new Error("fixture stream failure"));
          return;
        }
        sent = true;
        const content = kind === "oversize" ? "x".repeat(2001) : kind === "bad-schema" ? "Wrong,Header\nx,y\n" : kind === "malformed" ? `${header}bad\"quote,x\nx,y\n` : header;
        controller.enqueue(new TextEncoder().encode(content));
      },
      cancel() { cancelled++; },
    });
    const started = performance.now();
    await assert.rejects(buildAkActiveBusinessLicenses({
      outputRoot, zbpPointer, minimumLicenseRows: 1, maximumResponseBytes: 2000, requestTimeoutMs: kind === "deadline" ? 100 : 5000,
      fetchImpl: async () => { calls++; return new Response(body, { headers: csvHeaders }); }, logger: () => {},
    }), kind === "oversize" ? /byte limit/ : kind === "body-error" ? /fixture stream failure/ : kind === "deadline" ? /deadline/ : /schema|quote/i);
    assert.ok(performance.now() - started < 2000, `${kind} must not wait for the five-second request deadline`);
    assert.equal(calls, 1);
    if (kind !== "body-error") assert.equal(cancelled, 1);
    await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
  }
});

test("Alaska guarded streaming CSV builds a verified release from both fixed downloads", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-csv-success-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const calls = [];
  const csv = (headers, row) => `${headers.join(",")}\n${headers.map((key) => `"${String(row[key]).replaceAll('"', '""')}"`).join(",")}\n`;
  const result = await buildAkActiveBusinessLicenses({
    outputRoot: path.join(root, "output"), zbpPointer: await writeBaseline(path.join(root, "zbp")), minimumLicenseRows: 1,
    fetchImpl: async (url) => {
      calls.push(String(url));
      const licenses = String(url) === downloadUrl;
      return new Response(csv(licenses ? AK_BUSINESS_LICENSE_HEADERS : AK_BUSINESS_NAICS_HEADERS, licenses ? rawLicense() : rawNaics()), {
        headers: { ...csvHeaders, "content-disposition": `attachment; filename=${licenses ? "BusinessLicenseDownload" : "NaicsDownload"}.csv`, date: "Tue, 01 Sep 2026 12:00:00 GMT" },
      });
    }, logger: () => {}, now: () => new Date("2026-09-01T12:01:00Z"),
  });
  assert.deepEqual(calls, [downloadUrl, "https://www.commerce.alaska.gov/cbp/main/DbDownload/NaicsDownload"]);
  assert.equal(result.manifest.coverage.source_active_license_rows, 1);
  assert.equal(result.manifest.coverage.provisional_physical_sites, 1);
  await verifyAkActiveBusinessLicenses(path.join(result.releaseDirectory, "manifest.json"));
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

function cancellationFixture(outputRoot, zbpPointer) {
  return {
    outputRoot, zbpPointer, licenseRows: [rawLicense()], naicsRows: [rawNaics()], minimumLicenseRows: 1,
    sourceMetadata: { licenseHeaders: AK_BUSINESS_LICENSE_HEADERS, naicsHeaders: AK_BUSINESS_NAICS_HEADERS, licenseObservedAt: "2026-09-01T12:00:00Z", naicsObservedAt: "2026-09-01T12:00:30Z" },
    logger() {}, now: () => new Date("2026-09-01T12:01:00Z"),
  };
}

test("Alaska failed writers and blocked backpressure reject without leaking waiters", async () => {
  const failed = new PassThrough();
  failed.on("error", () => {});
  failed.destroy(new Error("fixture output failure"));
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(writeGzipRecord({ gzip: failed, records: 1 }, {}), /fixture output failure/);
  const blocked = new PassThrough({ highWaterMark: 1 });
  const controller = new AbortController();
  const writing = writeGzipRecord({ gzip: blocked, records: 1, signal: controller.signal }, { value: "fixture" });
  controller.abort();
  await assert.rejects(writing, { name: "AbortError" });
  assert.equal(blocked.listenerCount("drain"), 0);
  blocked.destroy();
});

test("Alaska phase cancellation removes only owned staging and preserves prior releases", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-cancel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = path.join(root, "output"), zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const common = cancellationFixture(outputRoot, zbpPointer);
  const prior = await buildAkActiveBusinessLicenses(common);
  const pointer = await readFile(path.join(outputRoot, "current.json"), "utf8");
  const sibling = path.join(outputRoot, ".staging", "unrelated");
  await mkdir(sibling); await writeFile(path.join(sibling, "keep.txt"), "keep");
  for (const phase of ["Acquired", "Normalizing", "Verifying", "Publishing"]) {
    const controller = new AbortController(); let reached = false;
    await assert.rejects(buildAkActiveBusinessLicenses({ ...common, signal: controller.signal,
      logger(message) { if (message.startsWith(phase)) { reached = true; controller.abort(); } },
    }), { name: "AbortError" });
    assert.equal(reached, true, phase);
    assert.equal(await readFile(path.join(outputRoot, "current.json"), "utf8"), pointer);
    assert.deepEqual(await readdir(path.join(outputRoot, ".staging")), ["unrelated"]);
    assert.deepEqual(await readdir(path.join(outputRoot, "releases")), [prior.manifest.release_id]);
    assert.equal(await readFile(path.join(sibling, "keep.txt"), "utf8"), "keep");
  }
});

test("Alaska cancellation refuses removal when its staging identity was replaced", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-ownership-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = path.join(root, "output"), zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const controller = new AbortController(); let ownedPath, retainedPath;
  await assert.rejects(buildAkActiveBusinessLicenses({ ...cancellationFixture(outputRoot, zbpPointer), signal: controller.signal,
    logger(message) {
      if (!message.startsWith("Acquired")) return;
      const stagingRoot = path.join(outputRoot, ".staging");
      ownedPath = path.join(stagingRoot, readdirSync(stagingRoot)[0]);
      retainedPath = `${ownedPath}.retained`;
      renameSync(ownedPath, retainedPath);
      mkdirSync(ownedPath); writeFileSync(path.join(ownedPath, "keep.txt"), "replacement must survive");
      controller.abort();
    },
  }), /cleanup requires inspection/);
  assert.equal(await readFile(path.join(ownedPath, "keep.txt"), "utf8"), "replacement must survive");
  assert.ok((await readdir(retainedPath)).includes("source"));
  await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
});

test("Alaska ordinary failures and cancelled resumed publication retain recoverable staging", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-resume-cancel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const failedRoot = path.join(root, "failed");
  await assert.rejects(buildAkActiveBusinessLicenses({ ...cancellationFixture(failedRoot, zbpPointer), licenseRows: [rawLicense({ SSN: "excluded" })] }), /Unexpected/);
  assert.equal((await readdir(path.join(failedRoot, ".staging"))).length, 1);
  const prior = await buildAkActiveBusinessLicenses(cancellationFixture(path.join(root, "prior"), zbpPointer));
  const outputRoot = path.join(root, "resume"), stagingRunId = prior.manifest.run_id;
  const staging = path.join(outputRoot, ".staging", stagingRunId);
  await cp(prior.releaseDirectory, staging, { recursive: true, errorOnExist: true, force: false });
  const original = await readFile(path.join(staging, "manifest.json"));
  const controller = new AbortController();
  const publication = publishAkActiveBusinessLicensesStaging({ outputRoot, stagingRunId, signal: controller.signal });
  setImmediate(() => controller.abort());
  await assert.rejects(publication, { name: "AbortError" });
  assert.deepEqual(await readFile(path.join(staging, "manifest.json")), original);
  await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
  await assert.rejects(publishAkActiveBusinessLicensesStaging({ outputRoot, stagingRunId: "../escape" }), /valid stagingRunId/);
});

test("Alaska verifier cancellation and missing gzip terminate without hanging", { timeout: 10000 }, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-verify-cancel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await buildAkActiveBusinessLicenses(cancellationFixture(path.join(root, "output"), await writeBaseline(path.join(root, "zbp"))));
  const manifestPath = path.join(result.releaseDirectory, "manifest.json");
  const controller = new AbortController();
  const verification = verifyAkActiveBusinessLicenses(manifestPath, { signal: controller.signal });
  setImmediate(() => controller.abort());
  await assert.rejects(verification, { name: "AbortError" });
  const artifact = result.manifest.artifacts.find((item) => item.path.startsWith("source/selected"));
  await rm(path.join(result.releaseDirectory, artifact.path));
  await assert.rejects(verifyAkActiveBusinessLicenses(manifestPath), /verification failed/i);
});

test("Alaska real CLI accepts IPC cancellation and cleans its request staging", { timeout: 10000 }, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ak-cli-cancel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = path.join(root, "output"), zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const child = spawn(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/build-ak-active-business-licenses.mjs", "--output", outputRoot, "--zbp", zbpPointer, "--minimum-license-rows", "1"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true });
  const exit = once(child, "exit"); let output = "", messages = 0;
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  const watchdog = setTimeout(() => child.kill(), 5000);
  t.after(() => { clearTimeout(watchdog); if (child.exitCode === null && child.signalCode === null) child.kill(); });
  child.on("message", (message) => { if (message.type === "fixture-request") { messages++; child.send({ type: "cancel" }); } });
  const [code, signal] = await exit;
  assert.equal(messages, 1, output); assert.equal(code, 1, output); assert.equal(signal, null, output);
  assert.deepEqual(await readdir(path.join(outputRoot, ".staging")), []);
  await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
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
