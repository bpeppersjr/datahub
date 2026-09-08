import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, symlink, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { preflightWiChildcare, validateWiChildcarePreflight, writeWiChildcarePreflight, WI_LAYER, WI_LAYER_ITEM, WI_SERVICE_ITEM, WI_FIELDS, WI_WHERE } from "./wi-childcare-preflight.mjs";

// Synthetic contract fixtures: no facility records, contacts or copied private metadata.
function layer() {
  const strings = { ProvderNumber: 50, LocationNumber: 12, FacilityNumber: 25, FacilityName: 255, LocationContactFullName: 255, LocationPrimaryPhoneNumber: 100, LocationLineAddress1: 100, LocationLineAddress2: 100, City: 100, State: 10, ZipCode: 25, CategoryType: 100, Months: 100, Hours: 100, FullTime: 25, FromAge: 100, ToAge: 100, StarLevel: 25 };
  return { id: 0, name: "Child_Care_Providers", type: "Feature Layer", serviceItemId: WI_SERVICE_ITEM, geometryType: "esriGeometryPoint", capabilities: "Map,Query,Data", maxRecordCount: 2000, hasMetadata: true,
    extent: { spatialReference: { wkid: 102100, latestWkid: 3857 } }, advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
    fields: [...Object.entries(strings).map(([name, length]) => ({ name, type: "esriFieldTypeString", length, domain: null })), ...Object.entries({ OBJECTID: "OID", Latitude: "Double", Longitude: "Double", Capacity: "Integer", Shape: "Geometry" }).map(([name, type]) => ({ name, type: `esriFieldType${type}`, domain: null }))] };
}
function payload(url) {
  if (url.includes("/rest/info?")) return { owningSystemUrl: "https://dhsgis.wi.gov/arcgis", privateUrl: "DO-NOT-RETAIN" };
  if (url.includes("/query?")) return { count: 2382 };
  if (url === `${WI_LAYER}?f=json`) return layer();
  const service = url.includes(WI_SERVICE_ITEM);
  return { id: service ? WI_SERVICE_ITEM : WI_LAYER_ITEM, owner: service ? "dhsgis@ACCOUNTS" : "DHS_GIS", access: "public", type: service ? "Map Service" : "Feature Service", url: service ? WI_LAYER.slice(0, -2) : WI_LAYER, accessInformation: "Wisconsin Department of Health Services", modified: 1755108537000,
    licenseInfo: service ? 'This data is AS IS, no completeness or accuracy, no warranty, not for legal, engineering or surveying.' : "https://data.dhsgis.wi.gov/pages/gis-data-disclaimer", privateUrl: "DO-NOT-RETAIN" };
}
function fixture(change = () => {}) {
  const calls = [], waits = [];
  return { calls, waits, options: { now: () => new Date("2026-09-08T04:00:00.000Z"), sleep: async (ms, { signal } = {}) => { signal?.throwIfAborted(); waits.push(ms); }, fetchImpl: async (url, options) => {
    calls.push({ url, options }); const value = payload(url); change(value, url, calls.length); return Response.json(value);
  } } };
}
test("WI exact metadata-only itinerary preserves two item roles and never grants acquisition", async () => {
  const f = fixture(), receipt = await preflightWiChildcare(f.options);
  assert.equal(validateWiChildcarePreflight(receipt), receipt);
  assert.equal(f.calls.length, 10); assert.deepEqual(f.waits, Array(9).fill(1000));
  assert.equal(receipt.source.source_record_count, 2382); assert.deepEqual(receipt.source.selected_fields, WI_FIELDS);
  assert.equal(receipt.acquisition.acquisition_authorized, false); assert.equal(receipt.acquisition.row_data_requests, 0);
  assert.equal(JSON.stringify(receipt).includes("DO-NOT-RETAIN"), false);
  for (const { url, options } of f.calls) {
    assert.equal(options.redirect, "error"); assert.ok(!url.includes("token"));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.has("outFields"), false);
    if (parsed.pathname.endsWith("/query")) { assert.equal(parsed.searchParams.get("where"), WI_WHERE); assert.equal(parsed.searchParams.get("returnCountOnly"), "true"); }
  }
});
test("WI rejects identity, schema, capabilities, CRS, notices and row payload drift", async () => {
  const mutations = [
    (v, u) => { if (u.includes("/rest/info?")) v.owningSystemUrl = "https://example.com"; },
    (v) => { if (v.id === WI_LAYER_ITEM) v.id = WI_SERVICE_ITEM; },
    (v) => { if (v.id === WI_SERVICE_ITEM) v.url = WI_LAYER; },
    (v) => { if (v.id === WI_LAYER_ITEM) v.owner = "other"; },
    (v) => { if (v.id === WI_SERVICE_ITEM) v.licenseInfo = ""; },
    (v) => { if (v.fields) v.fields[0].name = "ProviderNumber"; },
    (v) => { if (v.fields) v.fields[0].type = "esriFieldTypeInteger"; },
    (v) => { if (v.fields) v.fields[0].domain = {}; },
    (v) => { if (v.extent) v.extent.spatialReference.latestWkid = 4326; },
    (v) => { if (v.advancedQueryCapabilities) v.advancedQueryCapabilities.supportsPagination = false; },
    (v) => { v.features = []; }, (v) => { v.error = { code: 499 }; },
    (v) => { if (v.count) v.count = 0; }, (v) => { if (v.count) v.count = 50_001; },
  ];
  for (const change of mutations) await assert.rejects(preflightWiChildcare(fixture(change).options));
});
test("WI count can change between runs but not during a preflight", async () => {
  assert.equal((await preflightWiChildcare(fixture((v) => { if (v.count) v.count = 2400; }).options)).source.source_record_count, 2400);
  await assert.rejects(preflightWiChildcare(fixture((v, u, n) => { if (n === 6) v.count++; }).options), /source changed/);
  await assert.rejects(preflightWiChildcare(fixture((v, u, n) => { if (n === 7) v.modified++; }).options), /source changed/);
});
test("WI rejects forged receipt claims, request targets, hashes and clocks", async () => {
  const original = await preflightWiChildcare(fixture().options);
  for (const change of [
    (r) => { r.acquisition.acquisition_authorized = true; },
    (r) => { r.source.source_record_count++; },
    (r) => { r.observations[0].url = "https://example.com"; },
    (r) => { r.observations[0].payload_sha256 = "0".repeat(64); },
    (r) => { r.observations[0].observed_at = "2020-01-01T00:00:00.000Z"; },
    (r) => { r.finished_at = "invalid"; },
  ]) { const value = structuredClone(original); change(value); assert.throws(() => validateWiChildcarePreflight(value)); }
});
test("WI bounded reader rejects declared/streamed oversize and invalid UTF8 and releases bodies", async () => {
  for (const variant of ["declared", "streamed", "utf8"]) {
    let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(variant === "utf8" ? new Uint8Array([0xff]) : new Uint8Array(131_073)); }, cancel() { cancelled = true; } });
    const f = fixture(); f.options.fetchImpl = async () => new Response(body, { headers: variant === "declared" ? { "content-length": "131073" } : {} });
    if (variant === "utf8") {
      // A finite invalid-byte body reaches the fatal decoder rather than a timeout.
      f.options.fetchImpl = async () => new Response(new Uint8Array([0xff]));
    }
    await assert.rejects(preflightWiChildcare(f.options));
    if (variant !== "utf8") assert.equal(cancelled, true);
  }
});
test("WI deadline covers a stalled response body and explicit cancellation releases reader", async () => {
  for (const explicit of [false, true]) {
    let cancelled = false;
    const controller = new AbortController(), f = fixture();
    f.options.signal = controller.signal; f.options.timeoutMs = 10;
    f.options.fetchImpl = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const timer = explicit ? setTimeout(() => controller.abort(), 5) : null;
    try { await assert.rejects(preflightWiChildcare(f.options)); assert.equal(cancelled, true); } finally { clearTimeout(timer); }
  }
});
test("WI honors Retry-After and defers excessive waits without requests", async () => {
  const f = fixture(), base = f.options.fetchImpl; let attempts = 0;
  f.options.fetchImpl = async (...args) => ++attempts === 1 ? new Response("busy", { status: 429, headers: { "retry-after": "4" } }) : base(...args);
  await preflightWiChildcare(f.options); assert.equal(f.waits[0], 4000); assert.equal(attempts, 11);
  const g = fixture(); g.options.fetchImpl = async () => new Response("busy", { status: 429, headers: { "retry-after": "120" } });
  await assert.rejects(preflightWiChildcare(g.options), /defer|budget/i); assert.equal(g.waits.length, 0);
});
test("WI rejects redirects, HTML, nonretryable HTTP and unknown options", async () => {
  for (const response of [new Response(null, { status: 302 }), new Response("<html>login</html>"), new Response("denied", { status: 403 })]) {
    const f = fixture(); let calls = 0; f.options.fetchImpl = async () => { calls++; return response; };
    await assert.rejects(preflightWiChildcare(f.options)); assert.equal(calls, 1);
  }
  await assert.rejects(preflightWiChildcare({ endpoint: "https://example.com" }), /options/);
});
test("WI cancels during pacing and does not make another request", async () => {
  const f = fixture(), controller = new AbortController(); f.options.signal = controller.signal;
  f.options.sleep = async () => { controller.abort(); };
  await assert.rejects(preflightWiChildcare(f.options), { name: "AbortError" }); assert.equal(f.calls.length, 1);
});
test("WI immutable receipt publication is reconstructible, distinct and cancellation-safe", async () => {
  const receipt = await preflightWiChildcare(fixture().options);
  const outputRoot = path.join(APP_ROOT, "data", "tmp", `wi-preflight-test-${randomUUID()}`);
  const saved = await writeWiChildcarePreflight(receipt, { outputRoot }), second = await writeWiChildcarePreflight(receipt, { outputRoot });
  assert.notEqual(saved.path, second.path);
  const bytes = await readFile(saved.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), saved.sha256);
  assert.equal(bytes.length, saved.bytes); validateWiChildcarePreflight(JSON.parse(bytes));
  await assert.rejects(writeWiChildcarePreflight(receipt, { signal: AbortSignal.abort() }), { name: "AbortError" });
  await assert.rejects(writeWiChildcarePreflight(receipt, { outputRoot: path.dirname(APP_ROOT) }), /inside/);
  await assert.rejects(writeWiChildcarePreflight(receipt, { outputRoot: APP_ROOT }), /canonical/);
});
test("WI refuses redirected receipt storage without writing through the junction", async () => {
  const root = path.join(APP_ROOT, "data", "tmp", `wi-preflight-junction-${randomUUID()}`);
  const target = path.join(root, "target"), redirected = path.join(root, "redirected");
  await mkdir(target, { recursive: true }); await symlink(target, redirected, "junction");
  const receipt = await preflightWiChildcare(fixture().options);
  await assert.rejects(writeWiChildcarePreflight(receipt, { outputRoot: redirected }), /redirected/);
  assert.deepEqual(await readdir(target), []);
});
