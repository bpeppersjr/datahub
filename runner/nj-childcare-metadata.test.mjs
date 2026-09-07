import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fetchNjChildcareMetadata, NJ_CHILDCARE_METADATA_URL } from "./nj-childcare-metadata.mjs";

const fixture = Buffer.from('\ufeff<?xml version="1.0" encoding="UTF-8"?>\r\n<metadata><title>Strc_DCF_childcare &amp; NJDEP</title><notice>Preserve metadata &#169; &#xA9;</notice></metadata>\r\n');
const xml = (body = fixture, options = {}) => new Response(body, { ...options, headers: { "content-type": "application/xml; charset=utf-8", ...options.headers } });
const sleep = async () => {};

test("NJ raw metadata fetch preserves exact bytes, BOM and line endings with explicit evidence limits", async () => {
  const calls = [], now = () => new Date("2026-09-07T00:00:00.000Z");
  const result = await fetchNjChildcareMetadata({ fetchImpl: async (url, options) => { calls.push({ url, options }); return xml(); }, now });
  assert.ok(Buffer.isBuffer(result.raw)); assert.deepEqual(result.raw, fixture);
  assert.equal(result.bytes, fixture.length); assert.equal(result.sha256, createHash("sha256").update(fixture).digest("hex"));
  assert.equal(result.url, NJ_CHILDCARE_METADATA_URL); assert.equal(result.observed_at, now().toISOString());
  assert.equal(result.full_xml_schema_validated, false); assert.equal(result.legal_approval, false);
  assert.equal(result.validation, "utf8-xml-content-type-envelope-and-dataset-marker-only");
  assert.equal(calls.length, 1); assert.equal(calls[0].url, NJ_CHILDCARE_METADATA_URL); assert.equal(calls[0].options.redirect, "manual");
  assert.equal(new URL(calls[0].url).search, "");
});

test("NJ metadata rejects non-XML, DTD/entity/HTML, malformed UTF-8 and wrong or incomplete envelopes", async () => {
  const responses = [xml(fixture, { headers: { "content-type": "text/html" } }), xml(Buffer.from([0xff, 0xfe])),
    xml('{"error":"PRIVATE_ERROR"}'), new Response('{"error":"PRIVATE_ERROR"}', { headers: { "content-type": "application/json" } }),
    xml('<!DOCTYPE metadata [<!ENTITY ext SYSTEM "file:///private">]><metadata>Strc_DCF_childcare &ext;</metadata>'),
    xml("<metadata>Strc_DCF_childcare &custom;</metadata>"), xml("<metadata><html>Strc_DCF_childcare</html></metadata>"),
    xml("<metadata>Other dataset</metadata>"), xml("<metadata>Strc_DCF_childcare"), xml("<other>Strc_DCF_childcare</other>"),
    xml("<metadata>Strc_DCF_childcare\u0000</metadata>"), xml("<metadatax>Strc_DCF_childcare</metadata>"),
    new Response("PRIVATE_ERROR", { status: 403 }), new Response(null, { status: 302 }),
  ];
  for (const response of responses) {
    let requests = 0;
    await assert.rejects(fetchNjChildcareMetadata({ fetchImpl: async () => { requests++; return response; }, sleep }),
      (error) => /request rejected/.test(error.message) && !error.message.includes("PRIVATE_ERROR"));
    assert.equal(requests, 1);
  }
});

test("NJ metadata enforces declared and streamed byte ceilings and disposes rejected bodies", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }),
    { headers: { "content-type": "application/xml", "content-length": "1000001" } });
  await assert.rejects(fetchNjChildcareMetadata({ fetchImpl: async () => response }), /request rejected/);
  assert.equal(cancelled, true);
  await assert.rejects(fetchNjChildcareMetadata({ fetchImpl: async () => xml(" ".repeat(1_000_001)) }), /request rejected/);
});

test("NJ metadata honors bounded publisher delays, cancels failed bodies and limits transient retries", async () => {
  let calls = 0, cancelled = false; const waits = [];
  const result = await fetchNjChildcareMetadata({ fetchImpl: async () => ++calls === 1
    ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 429, headers: { "retry-after": "7" } }) : xml(),
  sleep: async (ms) => waits.push(ms) });
  assert.equal(result.bytes, fixture.length); assert.deepEqual(waits, [7000]); assert.equal(cancelled, true);
  await assert.rejects(fetchNjChildcareMetadata({ fetchImpl: async () => xml("", { status: 503, headers: { "retry-after": "61" } }), sleep }), { code: "SOURCE_RETRY_DEFERRED" });
  calls = 0;
  await assert.rejects(fetchNjChildcareMetadata({ fetchImpl: async () => { calls++; throw new TypeError("PRIVATE_ERROR"); }, sleep }), /network request failed/);
  assert.equal(calls, 3);
});

test("NJ metadata cancellation aborts retry waits and streaming reads without further requests", async () => {
  const abort = new AbortController(); let calls = 0;
  await assert.rejects(fetchNjChildcareMetadata({ fetchImpl: async () => { calls++; return xml("", { status: 503 }); },
    signal: abort.signal, sleep: async (_, { signal }) => { abort.abort(); signal.throwIfAborted(); },
  }), { name: "AbortError" });
  assert.equal(calls, 1);
  const bodyAbort = new AbortController(); let cancelled = false;
  await assert.rejects(fetchNjChildcareMetadata({ signal: bodyAbort.signal, fetchImpl: async () => xml(new ReadableStream({
    start() { setTimeout(() => bodyAbort.abort(), 5); }, cancel() { cancelled = true; },
  })) }), { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("NJ metadata bounded deadlines cover both headers and streaming bodies", async () => {
  for (const pendingBody of [false, true]) {
    let calls = 0;
    await assert.rejects(fetchNjChildcareMetadata({ timeoutMs: 5, sleep, fetchImpl: async (_, { signal }) => {
      calls++;
      return pendingBody ? xml(new ReadableStream({}))
        : new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    } }), /timed out/);
    assert.equal(calls, 3);
  }
});

test("NJ metadata disallows caller scope and invalid runtime options before transport", async () => {
  let calls = 0; const fetchImpl = async () => { calls++; return xml(); };
  for (const options of [{ url: "https://example.org" }, { headers: {} }, { timeoutMs: 0 }, { timeoutMs: 60001 }, { sleep: null }, { now: null }, { signal: AbortSignal.abort() }]) {
    await assert.rejects(fetchNjChildcareMetadata({ fetchImpl, ...options }));
  }
  assert.equal(calls, 0);
  await assert.rejects(fetchNjChildcareMetadata({ fetchImpl: null }), /options/);
});
