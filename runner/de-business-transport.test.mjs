import assert from "node:assert/strict";
import test from "node:test";
import { createDeAcquisitionBudget } from "./de-acquisition-budget.mjs";
import { requestDeJson, DE_BUSINESS_LICENSE_METADATA_URL as url } from "./de-business-licenses.mjs";

const options = { type: "metadata", attempts: 1 };

test("Delaware shared request budget includes retries and rejects before another fetch", async () => {
  const acquisitionBudget = createDeAcquisitionBudget({ maximumRequests: 2 });
  let calls = 0;
  await assert.rejects(requestDeJson(url, { type: "metadata", acquisitionBudget, sleep: async () => {}, fetchImpl: async () => { calls++; return new Response("", { status: 503 }); } }), { code: "DE_ACQUISITION_BUDGET" });
  assert.equal(calls, 2);
});

test("Delaware cumulative bytes span requests and failed partial transfers without retrying exhaustion", async () => {
  const acquisitionBudget = createDeAcquisitionBudget({ maximumBytes: 5 });
  assert.deepEqual(await requestDeJson(url, { ...options, acquisitionBudget, fetchImpl: async () => new Response("{}") }), {});
  let calls = 0, cancelled = 0;
  await assert.rejects(requestDeJson(url, { type: "metadata", acquisitionBudget, sleep: async () => {}, fetchImpl: async () => {
    calls++;
    if (calls === 1) {
      let reads = 0;
      return new Response(new ReadableStream({ pull(controller) { if (reads++ === 0) controller.enqueue(new TextEncoder().encode("{}")); else controller.error(new Error("private transport detail")); } }));
    }
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{}")); }, cancel() { cancelled++; } }));
  } }), (error) => error.code === "DE_ACQUISITION_BUDGET" && !error.message.includes("private"));
  assert.equal(calls, 2);
  assert.equal(cancelled, 1);
  assert.equal(acquisitionBudget.snapshot().counts.bytes, 4);
});
function hanging(headers = {}) {
  let cancelled = 0;
  return { response: new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers }), cancellations: () => cancelled };
}

test("Delaware deadline covers stalled headers and stalled body, cancelling upstream", async () => {
  let requestSignal;
  await assert.rejects(requestDeJson(url, { ...options, timeoutMs: 20, fetchImpl: (_url, init) => { requestSignal = init.signal; return new Promise(() => {}); } }), /deadline/);
  assert.equal(requestSignal.aborted, true);
  const body = hanging();
  await assert.rejects(requestDeJson(url, { ...options, timeoutMs: 20, fetchImpl: async () => body.response }), /deadline/);
  assert.equal(body.cancellations(), 1);
});

test("Delaware declared and actual streaming byte ceilings cancel unread bodies", async () => {
  const body = hanging({ "content-length": "999" });
  await assert.rejects(requestDeJson(url, { ...options, maximumResponseBytes: 10, fetchImpl: async () => body.response }), /byte limit/);
  assert.equal(body.cancellations(), 1);
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } }));
  await assert.rejects(requestDeJson(url, { ...options, maximumResponseBytes: 10, fetchImpl: async () => response }), /byte limit/);
  assert.equal(cancelled, true);
});

test("Delaware preserves publisher cooldown and cancels error bodies before waiting", async () => {
  let calls = 0, cancelled = false;
  const waits = [];
  const result = await requestDeJson(url, { type: "metadata", fetchImpl: async () => ++calls === 1
    ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 429, headers: { "retry-after": "20" } })
    : new Response('{"ok":true}'), sleep: async (ms) => { assert.equal(cancelled, true); waits.push(ms); } });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(waits, [20_000]);
  await assert.rejects(requestDeJson(url, { type: "metadata", fetchImpl: async () => new Response("", { status: 429, headers: { "retry-after": "99999999" } }) }), /defer/);
});

test("Delaware cancellation interrupts retry waits and body reads without a second request", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(requestDeJson(url, { type: "metadata", signal: controller.signal, fetchImpl: async () => { calls++; return new Response("", { status: 503 }); }, sleep: async () => { controller.abort(); await new Promise(() => {}); } }), { name: "AbortError" });
  assert.equal(calls, 1);
  const stream = hanging(); const bodyController = new AbortController();
  const pending = requestDeJson(url, { ...options, signal: bodyController.signal, fetchImpl: async () => stream.response });
  setTimeout(() => bodyController.abort(), 10);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(stream.cancellations(), 1);
});

test("Delaware errors never disclose response or injected transport contents", async () => {
  for (const fetchImpl of [async () => new Response("private name secret"), async () => { throw new Error("private name secret"); }, async () => new Response(new Uint8Array([0xff]))]) {
    await assert.rejects(requestDeJson(url, { ...options, fetchImpl }), (error) => !error.message.includes("private") && /Delaware source/.test(error.message));
  }
});

test("Delaware cancels a response arriving after the request deadline", async () => {
  let resolveFetch;
  const late = hanging();
  await assert.rejects(requestDeJson(url, { ...options, timeoutMs: 10, fetchImpl: () => new Promise((resolve) => { resolveFetch = resolve; }) }), /deadline/);
  resolveFetch(late.response);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(late.cancellations(), 1);
});

test("Delaware native retry wait is interrupted without another request", async () => {
  const controller = new AbortController(); let calls = 0, timer;
  try {
    await assert.rejects(requestDeJson(url, { type: "metadata", signal: controller.signal, fetchImpl: async () => {
      calls++;
      timer = setTimeout(() => controller.abort(), 20);
      return new Response("", { status: 429, headers: { "retry-after": "30" } });
    } }), { name: "AbortError" });
    assert.equal(calls, 1);
  } finally { clearTimeout(timer); }
});

test("Delaware rejects invalid transport limits before requesting", async () => {
  let calls = 0;
  for (const limits of [{ timeoutMs: 0 }, { timeoutMs: 300001 }, { timeoutMs: 1.5 }, { maximumResponseBytes: 0 }, { maximumResponseBytes: 80000001 }, { attempts: 0 }, { attempts: 6 }]) {
    await assert.rejects(requestDeJson(url, { ...options, ...limits, fetchImpl: async () => { calls++; return new Response("{}"); } }), /Invalid Delaware transport limits/);
  }
  assert.equal(calls, 0);
});

test("Delaware checks monotonic elapsed time even when synchronous work delays timers", async () => {
  await assert.rejects(requestDeJson(url, { ...options, timeoutMs: 10, fetchImpl: async () => {
    const until = performance.now() + 25;
    while (performance.now() < until) { /* Simulate synchronous transport/decode work. */ }
    return new Response("{}");
  } }), /deadline/);
});
