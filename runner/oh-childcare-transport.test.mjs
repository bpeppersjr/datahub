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
import publisherNotices from "./fixtures/oh-childcare-publisher-notices.json" with { type: "json" };
import availabilityBodies from "./fixtures/oh-childcare-availability.json" with { type: "json" };
import useDecision from "../docs/states/OH-CHILDCARE-USE-DECISION-2026-09-08.json" with { type: "json" };

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
test("OH invalid batch emits a fixed diagnostic without retaining it or requesting subsequent pages", async () => {
  const retained = [];
  const f = await fixture(({ payload }) => {
    if (payload.features?.[0]?.attributes?.program_name) payload.displayFieldName = "PRIVATE_CANARY";
  });
  await assert.rejects(acquireOhChildcareWithTransport({ ...f.options, onObservation(o) { retained.push(o); } }), (error) => {
    assert.equal(error.message, "Ohio acquisition rejected: batch display field.");
    return true;
  });
  assert.deepEqual(retained.map((o) => o.kind), ["inventory"]);
  assert.equal(f.calls.filter((c) => new URL(c.url).searchParams.has("objectIds")).length, 1);
  assert.ok(!JSON.stringify(retained).includes("PRIVATE_CANARY"));
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

async function gatedFixture(change = () => {}) {
  const base = await fixture(({ payload, kind, ...rest }) => {
    if (kind === "item") Object.assign(payload, publisherNotices);
    return change({ payload, kind, ...rest });
  });
  const fetchBase = base.options.fetchImpl;
  base.options.fetchImpl = async (url, options) => {
    const notice = availabilityBodies.find((o) => o.url === url);
    if (!notice) return fetchBase(url, options);
    base.calls.push({ url, options });
    const changed = await change({ url, kind: "notice", call: base.calls.length, options });
    return changed ?? new Response(Buffer.from(notice.body_base64, "base64"), { status: notice.http_status });
  };
  base.options.now = () => new Date("2026-09-08T07:05:00.000Z");
  base.options.sourceUseRequired = true;
  base.options.onSourceUseBound = async () => {};
  return base;
}
test("OH gated transport awaits prerequisite persistence before IDs and returns paired fresh source-use evidence", async () => {
  const f = await gatedFixture(); let releaseHook, entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const hookPromise = new Promise((resolve) => { releaseHook = resolve; });
  const pending = acquireOhChildcareWithTransport({ ...f.options, onSourceUseBound: async (snapshot) => {
    assert.equal(f.calls.length, 14); assert.equal(snapshot.binding.source_use_authorized, true); assert.equal(snapshot.binding.dispatch_authorized, false);
    snapshot.availability[0].http_status = 200; snapshot.preflight.source.source_record_count = 999;
    entered(); await hookPromise; return { dispatch_authorized: true };
  } });
  await enteredPromise; assert.equal(f.calls.length, 14); releaseHook();
  const r = await pending; assert.equal(f.calls.length, 31); assert.deepEqual(f.waits, Array(30).fill(1000));
  assert.equal(r.features.length, 3); assert.equal(r.source_use_evidence.before.availability[0].http_status, 404);
  assert.equal(r.source_use_evidence.before.preflight.source.source_record_count, 3);
  assert.equal(r.source_use_evidence.after.binding.source_use_authorized, true); assert.equal(r.source.acquisition_authorized, false);
  assert.equal(r.transport.requests, 31);
  const plain = await acquireOhChildcareWithTransport({ ...f.options, sourceUseRequired: false, onSourceUseBound: undefined });
  assert.equal(r.transport.consumed_body_bytes - plain.transport.consumed_body_bytes, 2 * availabilityBodies.reduce((sum, o) => sum + Buffer.from(o.body_base64, "base64").length, 0));
});
test("OH source-use rejection, hook failure and hook cancellation prevent every inventory and page request", async () => {
  const changed = await gatedFixture(({ kind }) => kind === "notice" ? new Response("new terms", { status: 200 }) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport(changed.options), /review required/); assert.equal(changed.calls.length, 14);
  const failure = await gatedFixture(); await assert.rejects(acquireOhChildcareWithTransport({ ...failure.options, onSourceUseBound: async () => { throw new Error("persistence failed"); } }), /persistence failed/); assert.equal(failure.calls.length, 14);
  const cancelled = await gatedFixture(), controller = new AbortController();
  await assert.rejects(acquireOhChildcareWithTransport({ ...cancelled.options, signal: controller.signal, onSourceUseBound: () => { controller.abort(); } }), { name: "AbortError" }); assert.equal(cancelled.calls.length, 14);
  for (const opts of [{ sourceUseRequired: true, onSourceUseBound: undefined }, { sourceUseRequired: "true" }, { sourceUseRequired: false, onSourceUseBound: () => {} }]) await assert.rejects(acquireOhChildcareWithTransport({ ...failure.options, ...opts }), /gate options/);
});
test("OH source-use freshness is rechecked after persistence and before subsequent pages", async () => {
  let clock = "2026-09-08T07:05:00.000Z";
  const delayed = await gatedFixture();
  await assert.rejects(acquireOhChildcareWithTransport({ ...delayed.options, now: () => new Date(clock), onSourceUseBound: () => { clock = "2026-09-08T07:21:00.000Z"; } }), /fresh preflight/); assert.equal(delayed.calls.length, 14);
  clock = "2026-09-08T07:05:00.000Z";
  const rows = await gatedFixture(({ call }) => { if (call === 15) clock = "2026-09-08T07:21:00.000Z"; });
  await assert.rejects(acquireOhChildcareWithTransport({ ...rows.options, now: () => new Date(clock) }), /fresh preflight/); assert.equal(rows.calls.length, 15);
  clock = "2026-09-08T07:05:00.000Z";
  const reversal = await gatedFixture();
  await assert.rejects(acquireOhChildcareWithTransport({ ...reversal.options, now: () => new Date(clock), onSourceUseBound: () => { clock = "2026-09-08T07:04:59.000Z"; } }), /clock reversal/); assert.equal(reversal.calls.length, 14);
});
test("OH availability drift after records prevents success and retained error pages obey body limits", async () => {
  const after = await gatedFixture(({ call }) => call === 28 ? new Response("new policy", { status: 200 }) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport(after.options), /review required/); assert.equal(after.calls.length, 31);
  const oversized = await gatedFixture(({ kind }) => kind === "notice" ? new Response("x".repeat(1_048_577), { status: 404 }) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport(oversized.options), /Ohio/); assert.equal(oversized.calls.length, 11);
  const partial = await gatedFixture(({ kind }) => kind === "notice" ? new Response(new ReadableStream({}), { status: 404 }) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport({ ...partial.options, timeoutMs: 10 }), /Ohio/); assert.equal(partial.calls.length, 13);
  const cooldown = await gatedFixture(({ call }) => call === 11 ? new Response(new ReadableStream({}), { status: 429, headers: { "retry-after": "120" } }) : undefined);
  await assert.rejects(acquireOhChildcareWithTransport(cooldown.options), { code: "SOURCE_RETRY_DEFERRED" }); assert.equal(cooldown.calls.length, 11);
});
test("OH source-use configuration drift is rejected before any metadata or notice request", async () => {
  const f = await gatedFixture(), original = useDecision.availability_observations[0].url;
  try {
    useDecision.availability_observations[0].url = "https://example.com/unreviewed";
    await assert.rejects(acquireOhChildcareWithTransport(f.options), /decision drift/); assert.equal(f.calls.length, 0);
  } finally { useDecision.availability_observations[0].url = original; }
});
test("OH completion cannot precede the final notice binding even after final metadata has completed", async () => {
  const start = Date.parse("2026-09-08T07:05:00.000Z"); let clocks = 0;
  const baseline = await gatedFixture();
  await acquireOhChildcareWithTransport({ ...baseline.options, now: () => new Date(start + (++clocks) * 1000) });
  const totalClocks = clocks; clocks = 0;
  const rollback = await gatedFixture();
  await assert.rejects(acquireOhChildcareWithTransport({ ...rollback.options, now: () => {
    clocks++; return new Date(start + (clocks === totalClocks ? clocks - 2 : clocks) * 1000);
  } }), /completion precedes final source-use binding/);
});
