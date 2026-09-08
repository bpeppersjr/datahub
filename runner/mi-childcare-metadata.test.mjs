import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { acquireMiChildcareMetadata, validateMiChildcareMetadata, MI_CHILDCARE_METADATA_URL, MI_CHILDCARE_METADATA_SHA256 } from "./mi-childcare-metadata.mjs";
// Synthetic metadata only. Private publisher contacts are never test fixtures.
const fixturePath = process.env.MI_CHILDCARE_METADATA_TEST_FIXTURE;
const privateFixture = fixturePath ? await readFile(assertInsideApp(path.resolve(APP_ROOT, fixturePath))) : null;
const RAW = privateFixture ?? Buffer.from('<?xml version="1.0"?><metadata><resTitle>Child Care</resTitle>MiLEAP</metadata>');
const xml = (raw = RAW, headers = {}) => new Response(raw, { headers: { "content-type": "application/xml", ...headers } });
const now = () => new Date("2026-09-08T02:00:00.000Z");
function options(fetchImpl = async () => xml()) { return { fetchImpl, sleep: async () => {}, now }; }

test("MI XML retains exact raw bytes and fixed unresolved lineage/claim restrictions", { skip: !privateFixture && "requires explicit ignored private metadata fixture; no network" }, async () => {
  const calls = [];
  const r = await acquireMiChildcareMetadata(options(async (url, opts) => { calls.push({ url, opts }); return xml(); }));
  assert.equal(validateMiChildcareMetadata(r), r); assert.equal(r.bytes, 7523); assert.equal(r.sha256, MI_CHILDCARE_METADATA_SHA256);
  assert.deepEqual(Buffer.from(r.base64, "base64"), RAW); assert.equal(calls.length, 1); assert.equal(calls[0].url, MI_CHILDCARE_METADATA_URL); assert.equal(calls[0].opts.redirect, "manual");
  assert.equal(r.notices.inherited_metadata_item_id, "adf26197127c4295afc6b5478b312cf9"); assert.equal(r.notices.inherited_item_mismatch, true);
  for (const key of ["legal_approval", "agreement_acceptance_performed", "acquisition_authorized", "business_rows_acquired", "embedded_links_followed", "full_xml_schema_validated", "source_freshness_verified", "current_operating_status_verified", "license_status_verified", "coordinate_datum_verified", "national_completeness_verified"]) assert.equal(r.notices[key], false);
  assert.equal(r.notices.current_json_terms_remain_required, true); assert.equal(r.notices.restricted_publisher_contacts_not_business_data, true);
  const compressed = await acquireMiChildcareMetadata(options(async () => xml(RAW, { "content-encoding": "gzip", "content-length": "1000" })));
  assert.deepEqual(Buffer.from(compressed.base64, "base64"), RAW);
});

test("MI XML rejects drift, unsafe envelopes, invalid UTF8, malformed types and truncated bytes", async () => {
  for (const raw of [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), RAW]), Buffer.concat([RAW, Buffer.from("\n")]), Buffer.from("<metadata><resTitle>Child Care</resTitle>MiLEAP</metadata>"),
    Buffer.from("<!DOCTYPE metadata><metadata>MiLEAP</metadata>"), Buffer.from('<metadata><!ENTITY x "bad">MiLEAP</metadata>'), Buffer.from("<html>MiLEAP</html>"), Buffer.from("{\"error\":500}"), Buffer.from([0xc3, 0x28]), RAW.subarray(0, 7522)]) {
    await assert.rejects(acquireMiChildcareMetadata(options(async () => xml(raw))));
  }
  for (const headers of [{ "content-type": "text/html" }, { "content-type": "application/json" }, { "content-length": "1000001" }, { "content-length": "7524" }, { "content-length": "invalid" }]) {
    await assert.rejects(acquireMiChildcareMetadata(options(async () => xml(RAW, headers))));
  }
  await assert.rejects(acquireMiChildcareMetadata(options(async () => xml(Buffer.alloc(1_000_001)))));
});

test("MI XML exact replay rejects rehashed content and policy/URL/lineage spoofing", { skip: !privateFixture && "requires explicit ignored private metadata fixture; no network" }, async () => {
  const original = await acquireMiChildcareMetadata(options());
  for (const mutate of [(r) => { r.notices.inherited_item_mismatch = false; }, (r) => { r.notices.legal_approval = true; }, (r) => { r.notices.owner = "private"; }, (r) => { r.url = "https://example.com"; },
    (r) => { r.status = 404; }, (r) => { r.observed_at = "yesterday"; }, (r) => { r.base64 += "\n"; },
    (r) => { const bytes = Buffer.from(r.base64, "base64"); bytes[100] ^= 1; r.base64 = bytes.toString("base64"); r.sha256 = createHash("sha256").update(bytes).digest("hex"); },
  ]) { const r = structuredClone(original); mutate(r); assert.throws(() => validateMiChildcareMetadata(r)); }
});

test("MI XML retries bounded transient errors and honors/defer publisher waits; no redirect fallback", async () => {
  let calls = 0; const waits = [];
  const attempt = acquireMiChildcareMetadata({ ...options(async () => ++calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : xml()), sleep: async (ms) => { waits.push(ms); } });
  if (privateFixture) await attempt; else await assert.rejects(attempt);
  assert.equal(calls, 2); assert.deepEqual(waits, [2000]);
  calls = 0; await assert.rejects(acquireMiChildcareMetadata(options(async () => { calls++; return new Response("", { status: 503 }); }))); assert.equal(calls, 3);
  for (const response of [new Response("", { status: 302, headers: { location: "https://example.com" } }), new Response("", { status: 404 }), new Response("", { status: 429, headers: { "retry-after": "61" } })]) {
    calls = 0; await assert.rejects(acquireMiChildcareMetadata(options(async () => { calls++; return response; }))); assert.equal(calls, 1);
  }
});

test("MI XML cancellation and header/body deadlines stop upstream work", async () => {
  const pre = new AbortController(); pre.abort(); let calls = 0;
  await assert.rejects(acquireMiChildcareMetadata({ ...options(async () => { calls++; return xml(); }), signal: pre.signal })); assert.equal(calls, 0);
  let cancelled = 0;
  await assert.rejects(acquireMiChildcareMetadata({ ...options(async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { "content-type": "application/xml" } })), timeoutMs: 5 })); assert.equal(cancelled, 3);
  const mid = new AbortController();
  await assert.rejects(acquireMiChildcareMetadata({ ...options(async () => new Response(new ReadableStream({ start() { setTimeout(() => mid.abort(), 5); }, cancel() { cancelled++; } }), { headers: { "content-type": "application/xml" } })), signal: mid.signal })); assert.equal(cancelled, 4);
  await assert.rejects(acquireMiChildcareMetadata({ ...options(async (url, { signal }) => { calls++; return await new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); }), timeoutMs: 5 })); assert.equal(calls, 3);
  let oversizedCancel = 0;
  await assert.rejects(acquireMiChildcareMetadata(options(async () => new Response(new ReadableStream({ cancel() { oversizedCancel++; } }), { headers: { "content-type": "application/xml", "content-length": "1000001" } })))); assert.equal(oversizedCancel, 1);
});

test("MI XML rejects expanded options and invalid clocks without source data", async () => {
  for (const extra of [{ url: "https://example.com" }, { outputRoot: "data" }, { timeoutMs: 30001 }, { fetchImpl: null }, { now: null }, { now: () => new Date(NaN) }]) await assert.rejects(acquireMiChildcareMetadata({ ...options(), ...extra }));
});
