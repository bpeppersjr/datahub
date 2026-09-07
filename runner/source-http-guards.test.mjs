import test from "node:test";
import assert from "node:assert/strict";
import { publisherRetryDelay } from "./source-http-guards.mjs";
import { requestDcArcGisJson } from "./dc-basic-business-licenses.mjs";

const url = "https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0?f=pjson";
const now = () => new Date("2026-09-07T12:00:00Z");

test("publisher wait preserves seconds/dates and defers excessive or overflowing delays", () => {
  for (const [header, expected] of [[null, 250], ["", 250], ["-1", 250], ["bad date", 250], ["0", 250], ["120", 120000], ["Mon, 07 Sep 2026 12:02:00 GMT", 120000], ["Mon, 07 Sep 2026 11:59:00 GMT", 250]]) {
    assert.equal(publisherRetryDelay(header, { fallbackMs: 250, now }), expected);
  }
  for (const header of ["86401", "9".repeat(400)]) assert.throws(() => publisherRetryDelay(header, { fallbackMs: 250, now }), { code: "SOURCE_RETRY_DEFERRED" });
});

test("DC honors publisher wait and cancels discarded bodies before retry", async () => {
  let calls = 0, cancelled = 0; const waits = [];
  const result = await requestDcArcGisJson(url, { now, sleep: async (ms) => { assert.equal(cancelled, 1); waits.push(ms); }, fetchImpl: async () => {
    if (++calls === 1) return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 429, headers: { "retry-after": "120" } });
    return Response.json({ ok: true });
  } });
  assert.deepEqual(result, { ok: true }); assert.deepEqual(waits, [120000]); assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(requestDcArcGisJson(url, { fetchImpl: async () => { calls++; return new Response(null, { status: 503, headers: { "retry-after": "86401" } }); } }), { code: "SOURCE_RETRY_DEFERRED" });
  assert.equal(calls, 1);
});

test("DC deadline bounds both response headers and a stalled body", async () => {
  let cancelled = 0;
  await assert.rejects(requestDcArcGisJson(url, { timeoutMs: 20, attempts: 1, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) }), { name: "TimeoutError" });
  await assert.rejects(requestDcArcGisJson(url, { timeoutMs: 20, attempts: 1, fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled++; } })) }), { name: "TimeoutError" });
  assert.equal(cancelled, 1);
});

test("DC enforces declared and streamed byte limits without retrying oversized JSON", async () => {
  for (const declared of [true, false]) {
    let calls = 0, cancelled = 0;
    await assert.rejects(requestDcArcGisJson(url, { maximumResponseBytes: 10, fetchImpl: async () => {
      calls++;
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"value":"too large"}')); }, cancel() { cancelled++; } }), { headers: declared ? { "content-length": "100" } : {} });
    } }), /byte limit/);
    assert.equal(calls, 1); assert.equal(cancelled, 1);
  }
});

test("DC user cancellation aborts a stalled body and invalid limits never fetch", async () => {
  const controller = new AbortController(); let cancelled = 0;
  const result = requestDcArcGisJson(url, { signal: controller.signal, fetchImpl: async () => {
    setTimeout(() => controller.abort(), 20);
    return new Response(new ReadableStream({ cancel() { cancelled++; } }));
  } });
  await assert.rejects(result, { name: "AbortError" }); assert.equal(cancelled, 1);
  for (const options of [{ attempts: 0 }, { timeoutMs: 0 }, { timeoutMs: 300001 }, { maximumResponseBytes: 0 }, { maximumResponseBytes: 50000001 }]) {
    await assert.rejects(requestDcArcGisJson(url, { ...options, fetchImpl: async () => assert.fail("invalid request") }));
  }
});

test("DC malformed JSON and ArcGIS error responses are not retried", async () => {
  for (const body of ["not json", '{"error":{"message":"fixture rejection"}}']) {
    let calls = 0;
    await assert.rejects(requestDcArcGisJson(url, { fetchImpl: async () => { calls++; return new Response(body); } }));
    assert.equal(calls, 1);
  }
});
