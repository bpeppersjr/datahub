import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  acquireAkCorporations,
  AK_CORPORATIONS_CONNECTOR_ID,
  AK_CORPORATIONS_EXCLUDED_NAME_REGISTRATION_TYPES,
  AK_CORPORATIONS_FILENAME,
  AK_CORPORATIONS_HEADERS,
  AK_CORPORATIONS_LARGE_ACQUISITION_ACKNOWLEDGEMENT,
  AK_CORPORATIONS_LEGAL_ENTITY_TYPES,
  AK_CORPORATIONS_MAX_SOURCE_BYTES,
  AK_CORPORATIONS_OBSERVED_CONTENT_LENGTH,
  AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT,
  AK_CORPORATIONS_SCHEMA_FINGERPRINT,
  AK_CORPORATIONS_URL,
  akCorporationsHeaderFingerprint,
  buildAkCorporationsOffline,
  normalizeAkCorporation,
  preflightAkCorporations,
  splitAkCorporationsZip,
  verifyAkCorporations,
} from "./ak-corporations.mjs";

const BUILD_NOW = () => new Date("2026-09-03T18:30:00.000Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ROOT = path.join(process.cwd(), "data", ".connector-test-tmp");

async function testDirectory(prefix) {
  await mkdir(TEST_ROOT, { recursive: true });
  return mkdtemp(path.join(TEST_ROOT, prefix));
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRow(overrides = {}) {
  return Object.fromEntries(AK_CORPORATIONS_HEADERS.map((header) => [header, overrides[header] ?? ""]));
}

function businessRow(overrides = {}) {
  return sourceRow({
    CORPTYPE: "Business Corporation",
    ENTITYNUMBER: "100001D",
    LEGALNAME: "ARCTIC EXAMPLE, INC.",
    ASSUMEDNAME: "ARCTIC EXAMPLE",
    STATUS: "Good Standing",
    AKFORMEDDATE: "01/02/2003",
    DURATIONEXPIRATIONDATE: "",
    HOMESTATE: "Alaska",
    HOMECOUNTRY: "United States",
    NEXTBRDUEDATE: "01/02/2027",
    REGISTEREDAGENT: "PRIVATE REGISTERED AGENT",
    ENTITYMAILINGADDRESS1: "PO BOX 100",
    ENTITYMAILINGADDRESS2: "SUITE 300",
    ENTITYMAILINGCITY: "ANCHORAGE",
    ENTITYMAILINGSTATEPROVINCE: "AK",
    ENTITYMAILINGZIP: "99501-1234",
    ENTITYMAILINGCOUNTRY: "UNITED STATES",
    ENTITYPHYSADDRESS1: "100 EXAMPLE ST",
    ENTITYPHYSADDRESS2: "SUITE 200",
    ENTITYPHYSCITY: "ANCHORAGE",
    ENTITYPHYSSTATEPROVINCE: "AK",
    ENTITYPHYSZIP: "995021234",
    ENTITYPHYSCOUNTRY: "US",
    REGISTEREDMAILADDRESS1: "SECRET MAIL",
    REGISTEREDMAILADDRESS2: "SECRET MAIL 2",
    REGISTEREDMAILCITY: "JUNEAU",
    REGISTEREDMAILSTATEPROVINCE: "AK",
    REGISTEREDMAILZIP: "99801",
    REGISTEREDMAILCOUNTRY: "US",
    REGISTEREDPHYSADDRESS1: "SECRET PHYSICAL",
    REGISTEREDPHYSADDRESS2: "APT 1",
    REGISTEREDPHYSCITY: "JUNEAU",
    REGISTEREDPHYSSTATEPROVINCE: "AK",
    REGISTEREDPHYSZIP: "99801",
    REGISTEREDPHYSCOUNTRY: "US",
    ...overrides,
  });
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows, headers = AK_CORPORATIONS_HEADERS) {
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")).join("\n")}\n`;
}

function responseHeaders(length = AK_CORPORATIONS_OBSERVED_CONTENT_LENGTH, overrides = {}) {
  return {
    "content-type": "text/csv",
    "content-disposition": `attachment; filename=${AK_CORPORATIONS_FILENAME}`,
    "content-length": String(length),
    date: "Thu, 03 Sep 2026 18:00:00 GMT",
    ...overrides,
  };
}

function preflightFetch({ header = AK_CORPORATIONS_HEADERS, declaredBytes = AK_CORPORATIONS_OBSERVED_CONTENT_LENGTH, headStatus = 200, getStatus = 200, getHeaders = {} } = {}) {
  const calls = [];
  let cancelled = false;
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options.method, redirect: options.redirect, headers: options.headers });
    if (options.method === "HEAD") {
      return new Response(null, { status: headStatus, headers: responseHeaders(declaredBytes) });
    }
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${header.join(",")}\nIGNORED,BULK,ROW\n`));
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, { status: getStatus, headers: responseHeaders(declaredBytes, getHeaders) });
  };
  return { fetchImpl, calls, wasCancelled: () => cancelled };
}

test("pins the exact 35-column transport schema and legal-entity allowlist", () => {
  assert.equal(AK_CORPORATIONS_HEADERS.length, 35);
  assert.equal(akCorporationsHeaderFingerprint(AK_CORPORATIONS_HEADERS), AK_CORPORATIONS_SCHEMA_FINGERPRINT);
  assert.ok(AK_CORPORATIONS_LEGAL_ENTITY_TYPES.includes("Business Corporation"));
  assert.ok(AK_CORPORATIONS_LEGAL_ENTITY_TYPES.includes("Limited Liability Company"));
  assert.ok(!AK_CORPORATIONS_LEGAL_ENTITY_TYPES.includes("Business Name Registration"));
  assert.deepEqual(AK_CORPORATIONS_EXCLUDED_NAME_REGISTRATION_TYPES, ["Business Name Registration", "Foreign Corporate Name Registration"]);
  assert.throws(() => normalizeAkCorporation(businessRow({ CORPTYPE: "Business Name Registration" }), {
    observedAt: BUILD_NOW().toISOString(), sourceReleaseId: "fixture", runId: RUN_ID,
  }), /not an allowlisted legal entity/);
  assert.throws(() => normalizeAkCorporation(businessRow({ CORPTYPE: "Foreign Corporate Name Registration" }), {
    observedAt: BUILD_NOW().toISOString(), sourceReleaseId: "fixture", runId: RUN_ID,
  }), /not an allowlisted legal entity/);
});

test("preserves exact status and registration evidence while splitting ZIP5 and ZIP+4 without site inference", () => {
  const record = normalizeAkCorporation(businessRow(), {
    observedAt: BUILD_NOW().toISOString(), sourceReleaseId: "fixture-sha", runId: RUN_ID,
  });
  assert.equal(record.external_identifiers[0].value, "100001D");
  assert.equal(record.registration.corporation_type, "Business Corporation");
  assert.equal(record.names.legal_name, "ARCTIC EXAMPLE, INC.");
  assert.equal(record.registration.status_exact, "Good Standing");
  assert.deepEqual(record.registration.alaska_formed_date, { source: "01/02/2003", date: "2003-01-02" });
  assert.deepEqual(record.registration.home_jurisdiction, { state_source: "Alaska", country_source: "United States" });
  assert.equal(record.administrative_addresses.mailing.role, "entity-mailing-administrative-address");
  assert.equal(record.administrative_addresses.physical.role, "entity-physical-administrative-address");
  assert.equal(record.administrative_addresses.mailing.zip_code, "99501");
  assert.equal(record.administrative_addresses.mailing.postal_code, "99501");
  assert.equal(record.administrative_addresses.mailing.zip4, "1234");
  assert.equal(record.administrative_addresses.physical.zip_code, "99502");
  assert.equal(record.administrative_addresses.physical.zip4, "1234");
  assert.equal(record.administrative_addresses.physical.operating_site_asserted, false);
  assert.equal(record.administrative_addresses.physical.geocoded, false);
  assert.equal(record.entity_candidate.physical_site_created, false);
  assert.equal(record.entity_candidate.establishment_created, false);
  assert.ok(!Object.hasOwn(record.entity_candidate, "physical_site_id"));
  assert.ok(!Object.hasOwn(record.entity_candidate, "establishment_id"));
  assert.ok(!JSON.stringify(record).includes("PRIVATE REGISTERED AGENT"));
  assert.ok(!JSON.stringify(record).includes("SECRET MAIL"));
  assert.ok(!JSON.stringify(record).includes("SECRET PHYSICAL"));
  assert.deepEqual(splitAkCorporationsZip("99501-9999"), {
    source_postal_code: "99501-9999", zip_code: "99501", postal_code: "99501", zip4: "9999",
  });
  assert.notEqual(record.administrative_addresses.mailing.postal_code, "99501-1234");
});

test("performs one HEAD and one bounded prefix GET, cancels after the header, and parses or persists zero rows", async () => {
  const mock = preflightFetch();
  const receipt = await preflightAkCorporations({ fetchImpl: mock.fetchImpl, now: BUILD_NOW });
  assert.equal(mock.calls.length, 2);
  assert.deepEqual(mock.calls.map(({ method }) => method), ["HEAD", "GET"]);
  assert.ok(mock.calls.every(({ url, redirect }) => url === AK_CORPORATIONS_URL && redirect === "manual"));
  assert.match(mock.calls[1].headers.range, /^bytes=0-/);
  assert.equal(mock.wasCancelled(), true);
  assert.equal(receipt.status, "bounded-prefix-header-validated-no-rows-parsed-or-persisted");
  assert.equal(receipt.source.declared_bytes, AK_CORPORATIONS_OBSERVED_CONTENT_LENGTH);
  assert.equal(receipt.schema.column_count, 35);
  assert.equal(receipt.schema.fingerprint, AK_CORPORATIONS_SCHEMA_FINGERPRINT);
  assert.equal(receipt.acquisition.prefix_may_contain_unparsed_row_bytes, true);
  assert.equal(receipt.acquisition.bulk_rows_parsed, 0);
  assert.equal(receipt.acquisition.bulk_file_saved, false);
  assert.equal(receipt.acquisition.normalized_records_produced, 0);
  assert.equal(receipt.acquisition.release_pointer_published, false);
});

test("fails closed on host/path, redirects, declared size, content contract, and header drift", async () => {
  let calls = 0;
  await assert.rejects(() => preflightAkCorporations({
    url: `${AK_CORPORATIONS_URL}?download=1`, fetchImpl: async () => { calls += 1; },
  }), /URL is not allowed/);
  assert.equal(calls, 0);
  await assert.rejects(() => preflightAkCorporations({ fetchImpl: preflightFetch({ headStatus: 302 }).fetchImpl }), /redirects are not permitted/);
  await assert.rejects(() => preflightAkCorporations({ fetchImpl: preflightFetch({ getStatus: 302 }).fetchImpl }), /redirects are not permitted/);
  await assert.rejects(() => preflightAkCorporations({ fetchImpl: preflightFetch({ declaredBytes: AK_CORPORATIONS_MAX_SOURCE_BYTES + 1 }).fetchImpl }), /outside the allowed bounds/);
  const wrongContentFetch = async (url, options) => new Response(options.method === "HEAD" ? null : "x", {
    status: 200,
    headers: responseHeaders(AK_CORPORATIONS_OBSERVED_CONTENT_LENGTH, { "content-type": "text/html" }),
  });
  await assert.rejects(() => preflightAkCorporations({ fetchImpl: wrongContentFetch }), /Content-Type must be text\/csv/);
  const drifted = [...AK_CORPORATIONS_HEADERS];
  drifted[34] = "UNEXPECTED";
  await assert.rejects(() => preflightAkCorporations({ fetchImpl: preflightFetch({ header: drifted }).fetchImpl }), /schema changed/);
  await assert.rejects(() => preflightAkCorporations({
    maximumHeaderBytes: 1024,
    fetchImpl: preflightFetch({
      getStatus: 206,
      getHeaders: { "content-length": "10", "content-range": `bytes 0-1023/${AK_CORPORATIONS_OBSERVED_CONTENT_LENGTH}` },
    }).fetchImpl,
  }), /partial Content-Length and Content-Range disagree/);
  await assert.rejects(() => preflightAkCorporations({
    maximumHeaderBytes: 1024,
    fetchImpl: preflightFetch({
      declaredBytes: 100,
      getStatus: 206,
      getHeaders: { "content-length": "1024", "content-range": "bytes 0-1023/100" },
    }).fetchImpl,
  }), /Content-Range is invalid/);
  let callsBeforeTimeout = 0;
  await assert.rejects(() => preflightAkCorporations({
    requestTimeoutMs: 5,
    fetchImpl: async (url, options) => {
      callsBeforeTimeout += 1;
      if (options.method === "HEAD") return new Response(null, { status: 200, headers: responseHeaders() });
      return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    },
  }), (error) => error?.name === "TimeoutError");
  assert.equal(callsBeforeTimeout, 2);
});

test("keeps full live acquisition exact-acknowledgement gated and intentionally unimplemented", async () => {
  const receipt = await preflightAkCorporations({ fetchImpl: preflightFetch().fetchImpl, now: BUILD_NOW });
  await assert.rejects(() => acquireAkCorporations({ preflight: receipt }), /default-denied/);
  await assert.rejects(() => acquireAkCorporations({ acknowledgement: "yes", preflight: receipt }), /Exact acknowledgement required/);
  let acquisitionCalls = 0;
  await assert.rejects(() => acquireAkCorporations({
    acknowledgement: AK_CORPORATIONS_LARGE_ACQUISITION_ACKNOWLEDGEMENT,
    preflight: receipt,
    fetchImpl: async () => { acquisitionCalls += 1; },
  }), /intentionally unimplemented/);
  assert.equal(acquisitionCalls, 0);
});

test("builds and independently verifies a checksum-bound non-overwriting local-review release without a pointer", async (t) => {
  const root = await testDirectory("datahub-ak-corporations-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "CorporationsDownload.csv");
  const outputRoot = path.join(root, "output");
  const fixture = csv([
    businessRow(),
    businessRow({ CORPTYPE: "Limited Liability Company", ENTITYNUMBER: "200002D", LEGALNAME: "TUNDRA LLC", ASSUMEDNAME: "", STATUS: "Involuntarily Dissolved", ENTITYMAILINGZIP: "99701", ENTITYPHYSZIP: "99701" }),
    businessRow({ CORPTYPE: "Business Name Registration", ENTITYNUMBER: "300003D", LEGALNAME: "NAME ONLY" }),
    businessRow({ CORPTYPE: "Foreign Corporate Name Registration", ENTITYNUMBER: "400004F", LEGALNAME: "FOREIGN NAME ONLY" }),
  ]);
  await writeFile(sourcePath, fixture);
  const result = await buildAkCorporationsOffline({
    outputRoot,
    sourcePath,
    expectedSourceSha256: hash(fixture),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT,
    now: BUILD_NOW,
    runId: RUN_ID,
  });
  assert.equal(result.pointerPath, null);
  assert.equal(result.manifest.dataset_id, AK_CORPORATIONS_CONNECTOR_ID);
  assert.equal(result.manifest.status, "verified-local-review-only");
  assert.equal(result.manifest.coverage.input_rows, 4);
  assert.equal(result.manifest.coverage.legal_entity_organizations, 2);
  assert.equal(result.manifest.coverage.excluded_name_registration_alias_rows, 2);
  assert.equal(result.manifest.coverage.physical_sites, 0);
  assert.ok(Object.values(result.manifest.admission).every((value) => value === false));
  await assert.rejects(() => stat(path.join(outputRoot, "current.json")), { code: "ENOENT" });
  const verified = await verifyAkCorporations(result.manifestPath);
  assert.equal(verified.organization_count, 2);
  const selectedArtifact = result.manifest.artifacts.find(({ artifact_type: type }) => type === "ak-corporations-privacy-selected-source-jsonl");
  const selectedText = await readFile(path.join(result.releaseDirectory, selectedArtifact.path), "utf8");
  const selected = selectedText.trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(selected.length, 2);
  assert.ok(selected.every((record) => !Object.keys(record).some((key) => /^registered/i.test(key))));
  assert.ok(!selectedText.includes("PRIVATE REGISTERED AGENT"));
  assert.ok(!selectedText.includes("Business Name Registration"));
  assert.ok(!selectedText.includes("Foreign Corporate Name Registration"));
});

test("rejects duplicate identities, schema drift, wrong acknowledgement/hash, cancellation, and artifact tampering", async (t) => {
  const root = await testDirectory("datahub-ak-corporations-fail-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const duplicate = csv([businessRow(), businessRow({ LEGALNAME: "DUPLICATE NAME" })]);
  const duplicatePath = path.join(root, "duplicate.csv");
  await writeFile(duplicatePath, duplicate);
  await assert.rejects(() => buildAkCorporationsOffline({
    outputRoot: path.join(root, "duplicate-output"), sourcePath: duplicatePath, expectedSourceSha256: hash(duplicate),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW, runId: "22222222-2222-4222-8222-222222222222",
  }), /Duplicate.*ENTITYNUMBER/);

  const driftHeaders = [...AK_CORPORATIONS_HEADERS];
  driftHeaders[0] = "CORPORATIONTYPE";
  const drift = csv([businessRow()], driftHeaders);
  const driftPath = path.join(root, "drift.csv");
  await writeFile(driftPath, drift);
  await assert.rejects(() => buildAkCorporationsOffline({
    outputRoot: path.join(root, "drift-output"), sourcePath: driftPath, expectedSourceSha256: hash(drift),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW, runId: "33333333-3333-4333-8333-333333333333",
  }), /schema changed/);

  const ordinary = csv([businessRow()]);
  const ordinaryPath = path.join(root, "ordinary.csv");
  await writeFile(ordinaryPath, ordinary);
  await assert.rejects(() => buildAkCorporationsOffline({
    outputRoot: path.join(root, "no-ack"), sourcePath: ordinaryPath, expectedSourceSha256: hash(ordinary), appRoot: root,
  }), /default-denied/);
  await assert.rejects(() => buildAkCorporationsOffline({
    outputRoot: path.join(root, "wrong-hash"), sourcePath: ordinaryPath, expectedSourceSha256: "0".repeat(64),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT,
  }), /SHA-256 does not match/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildAkCorporationsOffline({
    outputRoot: path.join(root, "cancelled"), sourcePath: ordinaryPath, expectedSourceSha256: hash(ordinary),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT, signal: controller.signal,
  }), { name: "AbortError" });
  let cancellationChecks = 0;
  const midStreamSignal = {
    throwIfAborted() {
      cancellationChecks += 1;
      if (cancellationChecks >= 2) throw new DOMException("cancelled during fixture processing", "AbortError");
    },
  };
  await assert.rejects(() => buildAkCorporationsOffline({
    outputRoot: path.join(root, "cancelled-midstream"), sourcePath: ordinaryPath, expectedSourceSha256: hash(ordinary),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT, signal: midStreamSignal,
    runId: "55555555-5555-4555-8555-555555555555",
  }), { name: "AbortError" });
  await assert.rejects(() => stat(path.join(root, "cancelled-midstream", "releases")), { code: "ENOENT" });
  await assert.rejects(() => stat(path.join(root, "cancelled-midstream", ".staging", "55555555-5555-4555-8555-555555555555")), { code: "ENOENT" });

  const result = await buildAkCorporationsOffline({
    outputRoot: path.join(root, "tamper-output"), sourcePath: ordinaryPath, expectedSourceSha256: hash(ordinary),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW,
    runId: "44444444-4444-4444-8444-444444444444",
  });
  const normalized = result.manifest.artifacts.find(({ artifact_type: type }) => type === "normalized-ak-corporation-organization-jsonl");
  await appendFile(path.join(result.releaseDirectory, normalized.path), "{}\n");
  await assert.rejects(() => verifyAkCorporations(result.manifestPath), /verification failed/);

  const linkRoot = await testDirectory("datahub-ak-corporations-link-");
  t.after(() => rm(linkRoot, { recursive: true, force: true }));
  const linkedSource = path.join(linkRoot, "source.csv");
  await writeFile(linkedSource, ordinary);
  const linkedOutput = path.join(linkRoot, "output");
  const linkTarget = path.join(linkRoot, "link-target");
  await mkdir(linkedOutput, { recursive: true });
  await mkdir(linkTarget, { recursive: true });
  await symlink(linkTarget, path.join(linkedOutput, ".staging"), "junction");
  await assert.rejects(() => buildAkCorporationsOffline({
    outputRoot: linkedOutput, sourcePath: linkedSource, expectedSourceSha256: hash(ordinary),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT,
    runId: "66666666-6666-4666-8666-666666666666",
  }), /regular non-link directories/);
});

test("verifier rejects self-consistent manifest boundary tampering", async (t) => {
  const root = await testDirectory("datahub-ak-corporations-manifest-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = csv([businessRow()]);
  const sourcePath = path.join(root, "source.csv");
  await writeFile(sourcePath, fixture);
  const result = await buildAkCorporationsOffline({
    outputRoot: path.join(root, "output"), sourcePath, expectedSourceSha256: hash(fixture),
    acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT, now: BUILD_NOW,
    runId: "77777777-7777-4777-8777-777777777777",
  });
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  manifest.admission = {};
  manifest.source_observed_at = BUILD_NOW().toISOString();
  await writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(() => verifyAkCorporations(result.manifestPath), /verification failed/);
});
