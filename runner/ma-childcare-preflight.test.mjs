import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { MA_CHILDCARE_LAYER, MA_CHILDCARE_ITEM, MA_CHILDCARE_SCHEMA, inspectMaChildcareMetadata,
  preflightMaChildcare, writeMaChildcarePreflight } from "./ma-childcare-preflight.mjs";

const metadata = () => ({ id: 0, name: "Licensed Child Care Programs", type: "Feature Layer",
  serviceItemId: MA_CHILDCARE_ITEM, objectIdField: "OBJECTID", geometryType: "esriGeometryPoint",
  spatialReference: { wkid: 26986 },
  extent: { spatialReference: { wkid: 26986 } }, capabilities: "Query,Extract", maxRecordCount: 2000,
  advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true },
  fields: MA_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length ? { length } : {}), nullable: name !== "OBJECTID", domain: null })),
  editingInfo: { lastEditDate: 1778802655030, schemaLastEditDate: 1778802655030, dataLastEditDate: 1777567917233 },
});
const json = (value, options) => new Response(JSON.stringify(value), options);
const noSleep = async () => {};
function source({ metadataChange, countChange } = {}) {
  const calls = []; let metadataCalls = 0, countCalls = 0;
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/query?")) return json({ count: countChange?.(++countCalls) ?? 3016 });
    const value = metadata(); metadataChange?.(value, ++metadataCalls); return json(value);
  } };
}

test("MA preflight performs four paced metadata/count observations, no row requests", async () => {
  const stub = source(), waits = [];
  const receipt = await preflightMaChildcare({ ...stub, sleep: async (ms) => waits.push(ms) });
  assert.equal(receipt.source.record_count, 3016);
  assert.equal(receipt.readiness.connector_ready, false);
  assert.equal(receipt.readiness.export_authorized, false);
  assert.equal(receipt.acquisition.row_data_requests, 0);
  assert.deepEqual(waits, [1000, 1000, 1000]);
  assert.equal(stub.calls.length, 4);
  for (const { url, options } of stub.calls) {
    assert.ok(url.startsWith(MA_CHILDCARE_LAYER));
    assert.equal(options.redirect, "manual");
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.has("outFields"), false);
    if (parsed.pathname.endsWith("/query")) assert.equal(parsed.searchParams.get("returnCountOnly"), "true");
  }
  assert.equal(receipt.observations.length, 4);
  assert.match(receipt.source_observation_sha256, /^[a-f0-9]{64}$/);
});

test("MA metadata rejects identity, field, duplicate, capability and edit-stamp drift", () => {
  for (const change of [
    (m) => { m.serviceItemId = "other"; }, (m) => { m.extent.spatialReference.wkid = 4326; },
    (m) => { m.spatialReference.wkid = 4326; }, (m) => { m.fields[0].nullable = true; },
    (m) => { m.fields[1].type = "esriFieldTypeInteger"; }, (m) => { m.fields[1].length = 20; },
    (m) => { m.fields.push(m.fields[0]); }, (m) => { m.advancedQueryCapabilities.supportsOrderBy = false; },
    (m) => { m.editingInfo.dataLastEditDate = null; }, (m) => { m.maxRecordCount = 0; },
  ]) { const value = metadata(); change(value); assert.throws(() => inspectMaChildcareMetadata(value)); }
});

test("MA preflight rejects changing snapshots and invalid/empty counts", async () => {
  for (const stub of [source({ countChange: (n) => 3016 + n }),
    source({ metadataChange: (m, n) => { m.editingInfo.lastEditDate += n; } }),
    source({ metadataChange: (m, n) => { m.fields[1].nullable = n === 1; } }),
  ]) await assert.rejects(preflightMaChildcare({ ...stub, sleep: noSleep }), /changed during preflight/);
  for (const count of [0, -1, 1.5, "3016"]) {
    await assert.rejects(preflightMaChildcare({ ...source({ countChange: () => count }), sleep: noSleep }), /count-only/);
  }
});

test("MA preflight honors Retry-After, disposes failed bodies and defers excessive waits", async () => {
  const stub = source(), waits = []; let calls = 0, cancelled = false;
  const fetchImpl = async (...args) => ++calls === 1
    ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 429, headers: { "retry-after": "7" } })
    : stub.fetchImpl(...args);
  await preflightMaChildcare({ fetchImpl, sleep: async (ms) => waits.push(ms) });
  assert.equal(waits[0], 7000); assert.equal(cancelled, true);
  await assert.rejects(preflightMaChildcare({ fetchImpl: async () => json({}, { status: 429, headers: { "retry-after": "61" } }), sleep: noSleep }), { code: "SOURCE_RETRY_DEFERRED" });
});

test("MA request rejects redirects, oversized, ArcGIS errors and malformed JSON without leaking text", async () => {
  const secret = "SHOULD_NOT_APPEAR";
  for (const response of [new Response(null, { status: 302 }), json({ error: { message: secret } }),
    new Response(secret), json({}, { headers: { "content-length": "1000001" } }),
    new Response(" ".repeat(1_000_001)),
  ]) {
    let calls = 0;
    await assert.rejects(preflightMaChildcare({ fetchImpl: async () => { calls++; return response; }, sleep: noSleep }),
      (error) => !error.message.includes(secret) && /request rejected/.test(error.message));
    assert.equal(calls, 1);
  }
});

test("MA cancellation interrupts retry waits and stalled bodies; timeouts are bounded", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(preflightMaChildcare({ signal: controller.signal,
    fetchImpl: async () => { calls++; return json({}, { status: 503 }); },
    sleep: async (_, { signal }) => { controller.abort(); signal.throwIfAborted(); },
  }), { name: "AbortError" });
  assert.equal(calls, 1);
  const bodyController = new AbortController(); let cancelled = false;
  const pending = preflightMaChildcare({ signal: bodyController.signal,
    fetchImpl: async () => new Response(new ReadableStream({ start() { setTimeout(() => bodyController.abort(), 10); }, cancel() { cancelled = true; } })),
  });
  await assert.rejects(pending, { name: "AbortError" }); assert.equal(cancelled, true);
  let attempts = 0;
  await assert.rejects(preflightMaChildcare({ timeoutMs: 5, sleep: noSleep, fetchImpl: async () => {
    attempts++; return new Response(new ReadableStream({}));
  } }), /timed out/);
  assert.equal(attempts, 3);
});

test("MA rejects invalid limits and pre-abort before requests; retry count is finite", async () => {
  let calls = 0; const fetchImpl = async () => { calls++; throw new TypeError("private details"); };
  await assert.rejects(preflightMaChildcare({ fetchImpl, timeoutMs: 0 }));
  await assert.rejects(preflightMaChildcare({ fetchImpl, signal: AbortSignal.abort() }), { name: "AbortError" });
  assert.equal(calls, 0);
  await assert.rejects(preflightMaChildcare({ fetchImpl, sleep: noSleep }), /network request failed/);
  assert.equal(calls, 3);
});

test("MA receipt publication is unique, checksummed, preserves prior observations and rejects tampering", async () => {
  const receipt = await preflightMaChildcare({ ...source(), sleep: noSleep });
  const outputRoot = path.join(APP_ROOT, "data", "tmp", `ma-preflight-test-${randomUUID()}`);
  const first = await writeMaChildcarePreflight(receipt, { outputRoot }), second = await writeMaChildcarePreflight(receipt, { outputRoot });
  assert.notEqual(first.path, second.path);
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(JSON.parse(await readFile(first.path, "utf8")), receipt);
  await assert.rejects(writeMaChildcarePreflight({ ...receipt, source_observation_sha256: "bad" }), /valid.*receipt/);
  await assert.rejects(writeMaChildcarePreflight({ ...receipt, readiness: { ...receipt.readiness, export_authorized: true } }), /valid.*receipt/);
  await assert.rejects(writeMaChildcarePreflight({ ...receipt, acquisition: { ...receipt.acquisition, normalized_records_produced: 1 } }), /valid.*receipt/);
  await assert.rejects(writeMaChildcarePreflight(receipt, { signal: AbortSignal.abort() }), { name: "AbortError" });
  await assert.rejects(writeMaChildcarePreflight(receipt, { outputRoot: path.dirname(APP_ROOT) }), /inside/);
});
