import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ohioPreflightUrl } from "./oh-childcare-preflight.mjs";
import { ohioPayload } from "./fixtures/oh-childcare.mjs";
import { evidence } from "./fixtures/oh-childcare-acquisition.mjs";
import { ohInventoryUrl } from "./oh-childcare-acquisition.mjs";
import { acquireOhChildcare, acquireOhChildcareWithTransport } from "./oh-childcare-transport.mjs";
import { buildOhChildcareRelease, verifyOhChildcareRelease } from "./oh-childcare-release.mjs";
import { APP_ROOT } from "./paths.mjs";

async function fixture(change = () => {}) {
  const e = await evidence(), calls = [], waits = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options }); const kind = ["layer", "item", "statuses", "centers", "selected"].find((k) => ohioPreflightUrl(k) === url);
    let payload;
    if (kind) { payload = ohioPayload(kind); if (kind === "selected") payload.count = 3; if (kind === "centers") payload.count = 110; if (kind === "statuses") payload.features[2].attributes.source_count = 3; }
    else payload = structuredClone(e.observations.find((o) => o.url === url).payload);
    const changed = await change({ url, kind, payload, call: calls.length, options });
    return changed ?? Response.json(payload);
  };
  return { e, calls, waits, options: { fetchImpl, now: () => new Date("2026-09-08T06:00:00.000Z"), sleep: async (ms, { signal } = {}) => { signal?.throwIfAborted(); waits.push(ms); } } };
}
test("OH injected acquisition executes fixed serial preflights and pages and produces independently verifiable release evidence", async () => {
  const f = await fixture(), result = await acquireOhChildcareWithTransport(f.options);
  assert.equal(f.calls.length, 23); assert.deepEqual(f.waits, Array(22).fill(1000));
  assert.equal(result.features.length, 3); assert.equal(result.transport.requests, 23); assert.ok(result.transport.consumed_body_bytes > result.source.reported_successful_response_bytes);
  assert.equal(result.transport.mode, "injected-transport"); assert.equal(result.source.acquisition_authorized, false);
  for (const call of f.calls) { assert.equal(call.options.redirect, "error"); assert.equal(call.options.credentials, "omit"); assert.equal(new URL(call.url).origin, "https://maps.ohio.gov"); assert.equal(call.options.headers, undefined); }
  const release = await buildOhChildcareRelease({ evidence: result.evidence, outputRoot: path.join(APP_ROOT, "data/tmp", `oh-transport-${randomUUID()}`), now: () => new Date("2026-09-09T00:00:00.000Z") });
  assert.equal((await verifyOhChildcareRelease(release.manifest_path)).counts.accepted, 3);
});
test("OH live entry is disabled before any network; injected transport requires explicit valid options", async () => {
  await assert.rejects(acquireOhChildcare(), { code: "OH_CHILDCARE_LIVE_NOT_ENROLLED" });
  await assert.rejects(acquireOhChildcare({ fetchImpl() { throw new Error("must not call"); } }), /unsupported/);
  for (const options of [{}, { fetchImpl: fetch, url: "https://example.com" }, { fetchImpl: fetch, maximumBytes: 100_000_001 }, { fetchImpl: fetch, timeoutMs: 0 }, { fetchImpl: fetch, signal: {} }]) await assert.rejects(acquireOhChildcareWithTransport(options), /Ohio/);
  const f = await fixture(); await assert.rejects(acquireOhChildcareWithTransport({ ...f.options, signal: AbortSignal.abort() }), { name: "AbortError" }); assert.equal(f.calls.length, 0);
});
test("OH failed HTTP requests honor provider cooldown without reading hanging error bodies", async () => {
  let cancelled = 0;
  const f = await fixture(({ call }) => call === 11 ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 429, headers: { "retry-after": "2" } }) : undefined);
  await acquireOhChildcareWithTransport(f.options); assert.equal(f.calls.length, 24); assert.ok(f.waits.includes(2000)); assert.equal(cancelled, 1);
  const long = await fixture(({ call }) => call === 11 ? new Response("unread", { status: 429, headers: { "retry-after": "120" } }) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport(long.options), { code: "SOURCE_RETRY_DEFERRED" }); assert.equal(long.calls.length, 11);
  const dates = await fixture(({ call }) => call === 11 ? new Response("", { status: 503, headers: { "retry-after": "Tue, 08 Sep 2026 06:00:03 GMT" } }) : undefined);
  await acquireOhChildcareWithTransport(dates.options); assert.ok(dates.waits.includes(3000));
  const failing = await fixture(({ kind }) => !kind ? new Response("SECRET", { status: 503 }) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport(failing.options), (e) => /Ohio/.test(e.message) && !e.message.includes("SECRET")); assert.equal(failing.calls.length, 13);
});
test("OH rejects redirect, HTTP200 errors, invalid UTF8, oversized and private page responses without retry", async () => {
  for (const make of [
    () => new Response("", { status: 302, headers: { location: "https://example.com" } }),
    () => new Response("SECRET", { status: 403 }),
    () => Response.json({ error: { message: "SECRET" } }),
    () => new Response(Uint8Array.from([123, 34, 120, 34, 58, 34, 0xc3, 34, 125])),
    () => new Response("SECRET"),
    () => new Response("{}", { headers: { "content-length": "8000001" } }),
    () => new Response("{}", { headers: { "content-length": "unknown" } }),
    () => new Response("x".repeat(8_000_001)),
  ]) {
    const f = await fixture(({ call }) => call === 11 ? make() : undefined);
    await assert.rejects(acquireOhChildcareWithTransport(f.options), (e) => /Ohio/.test(e.message) && !e.message.includes("SECRET")); assert.equal(f.calls.length, 11);
  }
  const privacy = await fixture(({ call, payload }) => { if (call === 12) payload.features[0].attributes.phone_number = "SECRET"; });
  await assert.rejects(acquireOhChildcareWithTransport(privacy.options), /unselected/); assert.equal(privacy.calls.length, 12);
});
test("OH counts partial failed-attempt bodies and bounds decoded bytes independently of compressed length", async () => {
  const baseline = await acquireOhChildcareWithTransport((await fixture()).options);
  let cancelled = 0;
  const f = await fixture(({ call }) => call === 11 ? new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(100)); }, cancel() { cancelled++; } })) : undefined);
  const result = await acquireOhChildcareWithTransport({ ...f.options, timeoutMs: 10 });
  assert.equal(result.transport.consumed_body_bytes, baseline.transport.consumed_body_bytes + 100); assert.equal(cancelled, 1); assert.equal(f.calls.length, 24);
  const limit = baseline.transport.consumed_body_bytes + 50;
  const bounded = await fixture(({ call }) => call === 11 ? new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(100)); } })) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport({ ...bounded.options, timeoutMs: 10, maximumBytes: limit }), /Ohio/);
  const encoded = await fixture(({ call, payload }) => call === 11 ? new Response(JSON.stringify(payload), { headers: { "content-encoding": "gzip", "content-length": "2" } }) : undefined);
  const decoded = await acquireOhChildcareWithTransport(encoded.options); assert.equal(decoded.source.source_record_count, 3);
});
test("OH deadlines cover ignored header signals, stalled bodies and late responses", async () => {
  const headers = await fixture(({ call }) => call >= 11 ? new Promise(() => {}) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport({ ...headers.options, timeoutMs: 10 }), /Ohio/); assert.equal(headers.calls.length, 13);
  let cancelled = 0;
  const bodies = await fixture(({ call }) => call >= 11 ? new Response(new ReadableStream({ cancel() { cancelled++; } })) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport({ ...bodies.options, timeoutMs: 10 }), /Ohio/); assert.equal(cancelled, 3);
  let resolveLate, lateCancelled = 0;
  const late = await fixture(({ call }) => call === 11 ? new Promise((resolve) => { resolveLate = resolve; }) : undefined);
  await acquireOhChildcareWithTransport({ ...late.options, timeoutMs: 10 });
  resolveLate(new Response(new ReadableStream({ cancel() { lateCancelled++; } }))); await new Promise((resolve) => setImmediate(resolve)); assert.equal(lateCancelled, 1);
});
test("OH cancellation during pacing, reads and final metadata prevents acquisition completion", async () => {
  const pacing = new AbortController(), f = await fixture(); let waits = 0;
  await assert.rejects(acquireOhChildcareWithTransport({ ...f.options, signal: pacing.signal, sleep: async () => { if (++waits === 10) pacing.abort(); } }), { name: "AbortError" }); assert.equal(f.calls.length, 10);
  const reading = new AbortController(); let cancelled = 0;
  const mid = await fixture(({ call }) => call === 11 ? new Response(new ReadableStream({ start() { queueMicrotask(() => reading.abort()); }, cancel() { cancelled++; } })) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport({ ...mid.options, signal: reading.signal }), { name: "AbortError" }); assert.equal(mid.calls.length, 11); assert.equal(cancelled, 1);
  const final = new AbortController(), end = await fixture(({ call }) => { if (call === 23) final.abort(); });
  await assert.rejects(acquireOhChildcareWithTransport({ ...end.options, signal: final.signal }), { name: "AbortError" }); assert.equal(end.calls.length, 23);
});
test("OH final metadata and ID replacement fail despite unchanged counts", async () => {
  const ids = await fixture(({ call, url, payload }) => { if (call === 13 && url === ohInventoryUrl()) payload.objectIds[0] = 999; });
  await assert.rejects(acquireOhChildcareWithTransport(ids.options), /inventory drift/); assert.equal(ids.calls.length, 13);
  const metadata = await fixture(({ call, kind, payload }) => { if (call >= 14 && kind === "item") payload.licenseInfo += " changed"; });
  await assert.rejects(acquireOhChildcareWithTransport(metadata.options), /metadata\/count drift/); assert.equal(metadata.calls.length, 23);
});
