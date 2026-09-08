import assert from "node:assert/strict";
import test from "node:test";
import { requestAkCsv } from "./ak-active-business-licenses.mjs";

const url = "https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload";
const headers = { "content-type": "text/csv", "content-disposition": "attachment; filename=BusinessLicenseDownload.csv" };

test("Alaska noncooperative header fetch is interrupted by timeout and caller abort", async () => {
  await assert.rejects(requestAkCsv(url, { attempts: 1, requestTimeoutMs: 10, fetchImpl: () => new Promise(() => {}) }), /deadline/);
  const controller = new AbortController();
  await assert.rejects(requestAkCsv(url, { signal: controller.signal, fetchImpl: () => { controller.abort(); return new Promise(() => {}); } }), { name: "AbortError" });
});

test("Alaska late fetch body is cancelled after deadline", async () => {
  let deliver, cancelled = 0;
  await assert.rejects(requestAkCsv(url, { attempts: 1, requestTimeoutMs: 10, fetchImpl: () => new Promise((resolve) => { deliver = resolve; }) }), /deadline/);
  deliver(new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, 1);
});

test("Alaska injected stalled retry waits remain cancellable", async () => {
  for (const status of [429, 503, null]) {
    const controller = new AbortController(); let calls = 0;
    await assert.rejects(requestAkCsv(url, { signal: controller.signal, fetchImpl: async () => { calls++; if (status === null) throw new Error("private value"); return new Response("", { status }); }, sleep: () => { controller.abort(); return new Promise(() => {}); } }), { name: "AbortError" });
    assert.equal(calls, 1);
  }
});

test("Alaska injected transport, retry and body failures redact payloads", async () => {
  await assert.rejects(requestAkCsv(url, { attempts: 1, fetchImpl: () => { throw new Error("private person"); } }), /Alaska source transport failed\./);
  await assert.rejects(requestAkCsv(url, { fetchImpl: async () => new Response("", { status: 503 }), sleep: () => { throw new Error("private person"); } }), (error) => !error.message.includes("private"));
  const result = await requestAkCsv(url, { fetchImpl: async () => new Response(new ReadableStream({ start(c) { c.error(new Error("private person")); } }), { headers }) });
  await assert.rejects(result.response.text(), /Alaska source body transport failed\./);
});

test("Alaska rejects synchronously delayed headers despite delayed timer delivery", async () => {
  await assert.rejects(requestAkCsv(url, { attempts: 1, requestTimeoutMs: 10, fetchImpl: () => {
    const until = performance.now() + 25;
    while (performance.now() < until) { /* Deterministic delayed timer delivery. */ }
    return new Response("ok", { headers });
  } }), /deadline/);
});
