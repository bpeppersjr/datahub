import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { NJ_CHILDCARE_LAYER, NJ_CHILDCARE_ITEM, NJ_CHILDCARE_SCHEMA, inspectNjChildcareMetadata,
  preflightNjChildcare, writeNjChildcarePreflight } from "./nj-childcare-preflight.mjs";

test("NJ receipt ownership checks request lossless filesystem identities", async () => {
  const source = await readFile(new URL("./nj-childcare-preflight.mjs", import.meta.url), "utf8");
  const calls = [...source.matchAll(/(?:\blstat|\.stat)\(([^)]*)\)/g)];
  assert.equal(calls.length, 5);
  for (const [call, args] of calls) assert.match(args, /\bbigint:\s*true\b/, call);
});

const metadata = () => ({ id: 4, name: "Child Care Centers", type: "Feature Layer", geometryType: "esriGeometryPoint",
  extent: { spatialReference: { wkid: 102100, latestWkid: 3857 } }, capabilities: "Map,Query,Data", maxRecordCount: 2000,
  advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
  fields: NJ_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length ? { length } : {}), domain: null })),
});
const item = () => ({ id: NJ_CHILDCARE_ITEM, owner: "NJDEPBGIS", access: "public", type: "Feature Service",
  title: "Child Care Centers of New Jersey", url: NJ_CHILDCARE_LAYER, modified: 1758741707000,
  created: 1500000000000, licenseInfo: "Preserve complete NJDEP metadata and prescribed distribution notice.", numViews: 100 });
const dates = () => ({ displayFieldName: "", fieldAliases: { download_date_min: "download_date_min", download_date_max: "download_date_max", download_date_count: "download_date_count" },
  fields: [{ name: "download_date_min", type: "esriFieldTypeDate", alias: "download_date_min", length: 8 },
    { name: "download_date_max", type: "esriFieldTypeDate", alias: "download_date_max", length: 8 },
    { name: "download_date_count", type: "esriFieldTypeInteger", alias: "download_date_count" }],
  features: [{ attributes: { download_date_min: 1786463205000, download_date_max: 1786463205000, download_date_count: 4075 } }] });
const json = (payload, options) => new Response(JSON.stringify(payload), options);
const noSleep = async () => {};
function source(change = () => {}) {
  const calls = [], counts = {};
  return { calls, fetchImpl: async (url, options) => {
    const parsed = new URL(url);
    const kind = parsed.searchParams.has("outStatistics") ? "dates" : parsed.searchParams.has("returnCountOnly") ? "count"
      : url.includes("sharing/rest") ? "item" : "metadata";
    const payload = kind === "dates" ? dates() : kind === "count" ? { count: 4075 } : kind === "item" ? item() : metadata();
    change(payload, kind, counts[kind] = (counts[kind] ?? 0) + 1);
    calls.push({ url, options, kind }); return json(payload);
  } };
}
const run = (stub = source(), options = {}) => preflightNjChildcare({ fetchImpl: stub.fetchImpl, sleep: noSleep, ...options });

test("NJ metadata-only preflight retains terms, dates and complete payloads with no business queries", async () => {
  const stub = source((payload, kind, n) => { if (kind === "item") payload.numViews += n; }), waits = [];
  const receipt = await run(stub, { sleep: async (ms) => waits.push(ms) });
  assert.equal(receipt.source.record_count, 4075);
  assert.equal(receipt.source.download_date_at, "2026-08-11T15:46:45.000Z");
  assert.equal(receipt.source.item_modified_at, "2025-09-24T19:21:47.000Z");
  assert.equal(receipt.policy.metadata_xml_retained, false);
  assert.equal(receipt.policy.acquisition_requires_complete_metadata_xml, true);
  assert.equal(receipt.policy.terms_presence_is_legal_approval, false);
  assert.equal(receipt.readiness.connector_ready, false);
  assert.equal(receipt.readiness.scheduled, false);
  assert.equal(receipt.readiness.export_authorized, false);
  assert.equal(receipt.acquisition.row_data_requests, 0);
  assert.equal(receipt.observations[1].payload.licenseInfo, item().licenseInfo);
  assert.deepEqual(waits, Array(7).fill(1000));
  assert.equal(stub.calls.length, 8);
  for (const { url, options, kind } of stub.calls) {
    const params = new URL(url).searchParams;
    assert.equal(options.redirect, "manual");
    for (const key of ["outFields", "objectIds", "returnIdsOnly", "resultRecordCount"]) assert.equal(params.has(key), false);
    if (kind === "dates") {
      assert.equal(params.get("returnGeometry"), "false");
      assert.deepEqual(JSON.parse(params.get("outStatistics")).map((s) => s.onStatisticField), Array(3).fill("download_date"));
    }
  }
});

test("NJ layer rejects identity, CRS, selected-schema, OID and capability changes", () => {
  for (const mutate of [
    (m) => { m.id = 5; }, (m) => { m.name = "Other"; }, (m) => { m.extent.spatialReference.latestWkid = 4326; },
    (m) => { m.objectIdField = "other"; }, (m) => { m.spatialReference = { wkid: 4326 }; },
    (m) => { m.fields[1].length = 19; }, (m) => { m.fields[13].type = "esriFieldTypeString"; },
    (m) => { m.fields.push(m.fields[0]); }, (m) => { m.fields.push({ name: "other", type: "esriFieldTypeOID" }); },
    (m) => { m.advancedQueryCapabilities.supportsStatistics = false; }, (m) => { m.maxRecordCount = 0; },
  ]) { const value = metadata(); mutate(value); assert.throws(() => inspectNjChildcareMetadata(value)); }
});

test("NJ preflight rejects terms, identity, count and download date drift or resource excess", async () => {
  for (const mutate of [
    (p, k) => { if (k === "item") p.access = "private"; },
    (p, k) => { if (k === "item") p.licenseInfo = ""; },
    (p, k) => { if (k === "item") p.features = [{ attributes: { center_name: "unrequested" } }]; },
    (p, k, n) => { if (k === "item" && n === 2) p.licenseInfo += " changed"; },
    (p, k, n) => { if (k === "metadata" && n === 2) p.fields[1].nullable = true; },
    (p, k, n) => { if (k === "count" && n === 2) p.count++; },
    (p, k) => { if (k === "count") p.count = 20001; },
    (p, k) => { if (k === "dates") p.features[0].attributes.download_date_min = null; },
    (p, k) => { if (k === "dates") p.features[0].attributes.download_date_max++; },
    (p, k) => { if (k === "dates") p.features[0].attributes.download_date_count--; },
    (p, k) => { if (k === "dates") p.features[0].attributes.center_name = "unrequested"; },
    (p, k) => { if (k === "dates") p.fieldAliases.download_date_min = "other"; },
    (p, k) => { if (k === "dates") p.fields[0].type = "esriFieldTypeString"; },
    (p, k) => { if (k === "count") p.features = []; },
  ]) await assert.rejects(run(source(mutate)));
});

test("NJ request redacts failures and rejects redirects, malformed or oversized response bodies", async () => {
  const secret = "PRIVATE_PROVIDER_CONTENT";
  for (const response of [new Response(null, { status: 302 }), json({ error: { message: secret } }),
    new Response(secret), json({}, { headers: { "content-length": "1000001" } }), new Response(" ".repeat(1_000_001))]) {
    let calls = 0;
    await assert.rejects(run({ fetchImpl: async () => { calls++; return response; } }), (error) => /request rejected/.test(error.message) && !error.message.includes(secret));
    assert.equal(calls, 1);
  }
});

test("NJ honors bounded Retry-After, releases failed bodies and limits retries", async () => {
  let attempts = 0, cancelled = false; const waits = [], stub = source();
  await run({ fetchImpl: async (...args) => ++attempts === 1
    ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 429, headers: { "retry-after": "7" } })
    : stub.fetchImpl(...args) }, { sleep: async (ms) => waits.push(ms) });
  assert.equal(waits[0], 7000); assert.equal(cancelled, true);
  await assert.rejects(run({ fetchImpl: async () => json({}, { status: 429, headers: { "retry-after": "61" } }) }), { code: "SOURCE_RETRY_DEFERRED" });
  attempts = 0;
  await assert.rejects(run({ fetchImpl: async () => { attempts++; throw new TypeError("secret"); } }), /network request failed/);
  assert.equal(attempts, 3);
});

test("NJ cancellation interrupts waits and response bodies and header/body deadlines are bounded", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(run({ fetchImpl: async () => { calls++; return json({}, { status: 503 }); } }, {
    signal: controller.signal, sleep: async (_, { signal }) => { controller.abort(); signal.throwIfAborted(); },
  }), { name: "AbortError" });
  assert.equal(calls, 1);
  const bodyAbort = new AbortController(); let cancelled = false;
  await assert.rejects(run({ fetchImpl: async () => new Response(new ReadableStream({
    start() { setTimeout(() => bodyAbort.abort(), 5); }, cancel() { cancelled = true; },
  })) }, { signal: bodyAbort.signal }), { name: "AbortError" });
  assert.equal(cancelled, true);
  for (const body of [true, false]) {
    let attempts = 0;
    await assert.rejects(run({ fetchImpl: async (_, { signal }) => {
      attempts++;
      return body ? new Response(new ReadableStream({})) : new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    } }, { timeoutMs: 5 }), /timed out/);
    assert.equal(attempts, 3);
  }
});

test("NJ validates options and pre-abort before any request", async () => {
  let calls = 0; const fetchImpl = async () => { calls++; return json({}); };
  for (const options of [{ url: NJ_CHILDCARE_LAYER }, { sql: "1=1" }, { timeoutMs: 0 }, { timeoutMs: 60001 }, { sleep: "invalid" }, { now: 1 }, { signal: AbortSignal.abort() }]) {
    await assert.rejects(preflightNjChildcare({ fetchImpl, ...options }));
  }
  assert.equal(calls, 0);
  await assert.rejects(preflightNjChildcare({ fetchImpl: null }), /must be functions/);
});

test("NJ immutable receipt writer preserves observations and rejects forged evidence or path aliases", async () => {
  const receipt = await run(), root = await mkdtemp(path.join(APP_ROOT, "data", "tmp", "nj-preflight-test-"));
  try {
    const outputRoot = path.join(root, "receipts");
    const [first, second] = await Promise.all([writeNjChildcarePreflight(receipt, { outputRoot }), writeNjChildcarePreflight(receipt, { outputRoot })]);
    assert.notEqual(first.path, second.path); assert.equal(first.sha256, second.sha256);
    assert.deepEqual(JSON.parse(await readFile(first.path, "utf8")), receipt);
    assert.equal((await readdir(outputRoot)).length, 2);
    for (const mutate of [
      (r) => { r.readiness.export_authorized = true; }, (r) => { r.acquisition.row_data_acquired = true; },
      (r) => { r.observations[1].payload.licenseInfo = "changed"; }, (r) => { r.source.record_count++; },
      (r) => { r.observations[0].observed_at = "invalid"; }, (r) => { r.policy.metadata_xml_retained = true; },
    ]) { const value = structuredClone(receipt); mutate(value); await assert.rejects(writeNjChildcarePreflight(value, { outputRoot }), /valid.*receipt/); }
    await assert.rejects(writeNjChildcarePreflight(receipt, { outputRoot, signal: AbortSignal.abort() }), { name: "AbortError" });
    await assert.rejects(writeNjChildcarePreflight(receipt, { outputRoot: path.dirname(APP_ROOT) }), /inside/);
    await assert.rejects(writeNjChildcarePreflight(receipt, { outputRoot: APP_ROOT }), /subdirectory/);
    const alias = path.join(root, "alias");
    await symlink(outputRoot, alias, "junction");
    await assert.rejects(writeNjChildcarePreflight(receipt, { outputRoot: alias }), /redirected/);
    assert.equal((await readdir(outputRoot)).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
