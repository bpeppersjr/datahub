import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { buildWiChildcareRelease, verifyWiChildcareRelease } from "./wi-childcare-release.mjs";
import { payload as metadata } from "./fixtures/wi-childcare.mjs";
import { batch } from "./fixtures/wi-childcare-acquisition.mjs";
import { wiInventoryUrl, replayWiChildcareAcquisition } from "./wi-childcare-acquisition.mjs";
import { acquireWiChildcare, acquireWiChildcareWithTransport } from "./wi-childcare-transport.mjs";

function fixture(change = () => {}) {
  const calls = [], waits = [];
  return { calls, waits, options: {
    now: () => new Date("2026-09-08T10:00:00.000Z"),
    sleep: async (ms, { signal } = {}) => { signal?.throwIfAborted(); waits.push(ms); },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const ids = new URL(url).searchParams.get("objectIds");
      const value = url === wiInventoryUrl() ? { objectIdFieldName: "OBJECTID", objectIds: [2, 1] } : ids ? batch(ids.split(",").map(Number)) : metadata(url);
      if (value.count) value.count = 2;
      return await change({ url, value, call: calls.length, options }) ?? (typeof value === "string" ? new Response(value) : Response.json(value));
    },
  } };
}

test("WI injected transport conserves serial fixed requests, measured bytes and replayable evidence without approval", async () => {
  const f = fixture(), phases = [], retained = [];
  const r = await acquireWiChildcareWithTransport({ ...f.options,
    onPreflight: ({ phase, preflight }) => { phases.push(phase); preflight.source.source_record_count = 999; },
    onObservation: (o) => { retained.push(o.kind); o.payload = {}; },
  });
  assert.equal(f.calls.length, 39); assert.deepEqual(f.waits, Array(38).fill(1000));
  assert.deepEqual(phases, ["before", "after"]); assert.deepEqual(retained, ["inventory", "features", "inventory"]);
  assert.equal(r.features.length, 2); assert.equal(replayWiChildcareAcquisition(r.evidence).features.length, 2);
  assert.equal(r.source.acquisition_authorized, false); assert.equal(r.source.export_authorized, false);
  assert.equal(r.transport.source_authenticity_verified, false); assert.equal(r.transport.mode, "injected-transport");
  assert.equal(r.transport.requests, 39); assert.ok(r.transport.consumed_body_bytes > r.source.reported_successful_response_bytes);
  for (const { url, options } of f.calls) {
    assert.ok(["https://dhsgis.wi.gov", "https://www.arcgis.com"].includes(new URL(url).origin));
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit"); assert.equal(options.headers, undefined);
    assert.ok(options.signal instanceof AbortSignal);
  }
  const release = await buildWiChildcareRelease({ evidence: r.evidence, outputRoot: path.join(APP_ROOT, "data/tmp", `wi-transport-${randomUUID()}`), now: () => new Date("2026-09-09T00:00:00.000Z") });
  assert.equal((await verifyWiChildcareRelease(release.manifest_path)).artifact_count, 5);
  const rows = (await readFile(path.join(path.dirname(release.manifest_path), "normalized.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(rows[0].physical_address.zip_code, "53703"); assert.equal(rows[0].physical_address.zip4, "1234");
  assert.equal(rows[1].physical_address.zip_code, null);
});

test("WI live entry stays closed and invalid/injected options cannot silently select native fetch", async () => {
  await assert.rejects(acquireWiChildcare(), { code: "WI_CHILDCARE_LIVE_NOT_ENROLLED" });
  const f = fixture();
  for (const options of [{}, { ...f.options, url: "https://example.com" }, { ...f.options, signal: {} }, { ...f.options, timeoutMs: 0 }, { ...f.options, maximumBytes: 100_000_001 }, { ...f.options, onPreflight: true }]) await assert.rejects(acquireWiChildcareWithTransport(options), /Wisconsin/);
  await assert.rejects(acquireWiChildcare({ fetchImpl: f.options.fetchImpl }), /unsupported/);
  await assert.rejects(acquireWiChildcareWithTransport({ ...f.options, signal: AbortSignal.abort() }), { name: "AbortError" });
  assert.equal(f.calls.length, 0);
});

test("WI awaits prerequisite retention before IDs and stops on retention errors or cancellation", async () => {
  const f = fixture(); let entered, release;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const pending = acquireWiChildcareWithTransport({ ...f.options, onPreflight: async ({ phase }) => { if (phase === "before") { entered(); await hold; } } });
  await enteredPromise; assert.equal(f.calls.length, 18); release(); await pending;
  const failed = fixture();
  await assert.rejects(acquireWiChildcareWithTransport({ ...failed.options, onPreflight() { throw new Error("retention failed"); } }), /retention failed/);
  assert.equal(failed.calls.length, 18);
  const cancelled = fixture(), controller = new AbortController();
  await assert.rejects(acquireWiChildcareWithTransport({ ...cancelled.options, signal: controller.signal, onObservation() { controller.abort(); } }), { name: "AbortError" });
  assert.equal(cancelled.calls.length, 19);
});

test("WI retries transient failures with full publisher cooldown and cancels unread error bodies", async () => {
  let cancelled = 0;
  const f = fixture(({ call }) => call === 19 ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 429, headers: { "retry-after": "2" } }) : undefined);
  await acquireWiChildcareWithTransport(f.options); assert.equal(f.calls.length, 40); assert.ok(f.waits.includes(2000)); assert.equal(cancelled, 1);
  const deferred = fixture(({ call }) => call === 1 ? new Response("unread", { status: 503, headers: { "retry-after": "120" } }) : undefined);
  await assert.rejects(acquireWiChildcareWithTransport(deferred.options), { code: "SOURCE_RETRY_DEFERRED" }); assert.equal(deferred.calls.length, 1);
  const failure = fixture(({ call }) => call >= 19 ? new Response("PRIVATE", { status: 503 }) : undefined);
  await assert.rejects(acquireWiChildcareWithTransport(failure.options), (e) => !e.message.includes("PRIVATE")); assert.equal(failure.calls.length, 21);
  const date = fixture(({ call }) => call === 19 ? new Response("", { status: 503, headers: { "retry-after": "Tue, 08 Sep 2026 10:00:03 GMT" } }) : undefined);
  await acquireWiChildcareWithTransport(date.options); assert.ok(date.waits.includes(3000));
});

test("WI rejects redirects, invalid UTF8, HTTP200 errors, malformed JSON and response limits", async () => {
  for (const make of [
    () => new Response("", { status: 302, headers: { location: "https://example.com" } }),
    () => new Response("PRIVATE", { status: 403 }),
    () => Response.json({ error: { message: "PRIVATE" } }),
    () => new Response(Uint8Array.from([0xc3, 0x28])),
    () => new Response("PRIVATE"),
    () => new Response("{}", { headers: { "content-length": "8000001" } }),
    () => new Response("{}", { headers: { "content-length": "invalid" } }),
    () => new Response("x".repeat(8_000_001)),
  ]) {
    const f = fixture(({ call }) => call === 19 ? make() : undefined);
    await assert.rejects(acquireWiChildcareWithTransport(f.options), (e) => /Wisconsin/.test(e.message) && !e.message.includes("PRIVATE")); assert.equal(f.calls.length, 19);
  }
  const metadataLimit = fixture(({ call }) => call === 1 ? new Response("x".repeat(131_073)) : undefined);
  await assert.rejects(acquireWiChildcareWithTransport(metadataLimit.options)); assert.equal(metadataLimit.calls.length, 1);
});

test("WI partial timed-out bodies consume the shared budget including metadata and retries", async () => {
  const baseline = await acquireWiChildcareWithTransport(fixture().options);
  const partial = () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(100)); } }));
  const f = fixture(({ call }) => call === 19 ? partial() : undefined);
  const r = await acquireWiChildcareWithTransport({ ...f.options, timeoutMs: 20 });
  assert.equal(r.transport.consumed_body_bytes, baseline.transport.consumed_body_bytes + 100);
  const bounded = fixture(({ call }) => call === 19 ? partial() : undefined);
  await assert.rejects(acquireWiChildcareWithTransport({ ...bounded.options, timeoutMs: 20, maximumBytes: baseline.transport.consumed_body_bytes + 50 }));
  const compressed = fixture(({ call, value }) => call === 19 ? new Response(JSON.stringify(value), { headers: { "content-encoding": "gzip", "content-length": "2" } }) : undefined);
  assert.equal((await acquireWiChildcareWithTransport(compressed.options)).features.length, 2);
});

test("WI deadlines bound ignored header signals and stalled bodies, and cancel late responses", async () => {
  for (const start of [1, 19]) {
    const f = fixture(({ call }) => call >= start ? new Promise(() => {}) : undefined);
    await assert.rejects(acquireWiChildcareWithTransport({ ...f.options, timeoutMs: 20 })); assert.equal(f.calls.length, start + 2);
  }
  let cancelled = 0;
  const bodies = fixture(({ call }) => call >= 19 ? new Response(new ReadableStream({ cancel() { cancelled++; } })) : undefined);
  await assert.rejects(acquireWiChildcareWithTransport({ ...bodies.options, timeoutMs: 20 })); assert.equal(cancelled, 3);
  let resolveLate, lateCancelled = 0;
  const late = fixture(({ call }) => call === 19 ? new Promise((resolve) => { resolveLate = resolve; }) : undefined);
  await acquireWiChildcareWithTransport({ ...late.options, timeoutMs: 20 });
  resolveLate(new Response(new ReadableStream({ cancel() { lateCancelled++; } })));
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(lateCancelled, 1);
});

test("WI rejects invalid/private pages before retention and detects final IDs or metadata drift", async () => {
  const retained = [], privatePage = fixture(({ call, value }) => { if (call === 20) value.features[0].attributes.LocationContactFullName = "PRIVATE"; });
  await assert.rejects(acquireWiChildcareWithTransport({ ...privatePage.options, onObservation: (o) => retained.push(o) }), /Wisconsin/);
  assert.equal(privatePage.calls.length, 20); assert.equal(retained.length, 1); assert.ok(!JSON.stringify(retained).includes("PRIVATE"));
  const ids = fixture(({ call, value }) => { if (call === 21) value.objectIds = [1, 3]; });
  await assert.rejects(acquireWiChildcareWithTransport(ids.options), /inventory drift/); assert.equal(ids.calls.length, 21);
  const changed = fixture(({ call, value }) => { if (call >= 22 && value.licenseInfo) value.licenseInfo += " changed terms"; });
  await assert.rejects(acquireWiChildcareWithTransport(changed.options), /metadata\/count drift/); assert.equal(changed.calls.length, 39);
});

test("WI preserves raw XML bytes and prevents completion after malformed or changed final XML", async () => {
  const raw = Buffer.from(`\ufeff${metadata("https://fixture/metadata")}\r\n`);
  const f = fixture(({ url }) => url.endsWith("/metadata") ? new Response(raw, { headers: { "content-type": "application/xml", "content-length": String(raw.length) } }) : undefined);
  const r = await acquireWiChildcareWithTransport(f.options);
  for (const preflight of [r.evidence.preflight_before, r.evidence.preflight_after]) {
    for (const o of preflight.observations.filter((o) => o.kind === "xml")) assert.deepEqual(Buffer.from(o.payload.base64, "base64"), raw);
  }
  const invalid = fixture(({ url }) => url.endsWith("/metadata") ? new Response("PRIVATE invalid XML") : undefined);
  await assert.rejects(acquireWiChildcareWithTransport(invalid.options), (e) => !e.message.includes("PRIVATE")); assert.equal(invalid.calls.length, 8);
  const drift = fixture(({ url, call, value }) => url.endsWith("/metadata") && call >= 22 ? new Response(value.replace("<name>", "<!-- changed -->\n<name>")) : undefined);
  await assert.rejects(acquireWiChildcareWithTransport(drift.options), /metadata\/count drift/);
});

test("WI cancellation during pacing, response reads and final preflight prevents success", async () => {
  const pacing = new AbortController(), f = fixture(); let waits = 0;
  await assert.rejects(acquireWiChildcareWithTransport({ ...f.options, signal: pacing.signal, sleep: async () => { if (++waits === 18) pacing.abort(); } }), { name: "AbortError" }); assert.equal(f.calls.length, 18);
  const reading = new AbortController(); let cancelled = 0;
  const mid = fixture(({ call }) => call === 19 ? new Response(new ReadableStream({ start() { queueMicrotask(() => reading.abort()); }, cancel() { cancelled++; } })) : undefined);
  await assert.rejects(acquireWiChildcareWithTransport({ ...mid.options, signal: reading.signal }), { name: "AbortError" }); assert.equal(mid.calls.length, 19); assert.equal(cancelled, 1);
  const ending = new AbortController(), end = fixture(({ call }) => { if (call === 39) ending.abort(); });
  await assert.rejects(acquireWiChildcareWithTransport({ ...end.options, signal: ending.signal }), { name: "AbortError" }); assert.equal(end.calls.length, 39);
});
