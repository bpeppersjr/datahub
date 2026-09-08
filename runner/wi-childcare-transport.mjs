import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { publisherRetryDelay } from "./source-http-guards.mjs";
import { preflightWiChildcare, wiPreflightUrl } from "./wi-childcare-preflight.mjs";
import { WI_ACQUISITION_VERSION, wiInventoryUrl, wiFeatureUrl, wiInventory, wiBatches, wiFeatures, replayWiChildcareAcquisition } from "./wi-childcare-acquisition.mjs";

const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const check = (v, reason) => { if (!v) throw new Error(`Wisconsin transport rejected: ${reason}.`); };
const validOptions = (v, names) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every((k) => names.includes(k));
const metadataUrls = new Set(["server", "layer", "service-item", "layer-item", "iteminfo", "notice-item", "notice-data", "xml", "count"].map(wiPreflightUrl));

// Enforce the deadline even when a supplied fetch ignores AbortSignal. A late
// response belongs to the expired attempt and must not become success evidence.
function fetchUntilAbort(fetchImpl, url, options) {
  options.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { if (!settled) { settled = true; reject(options.signal.reason); } };
    options.signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { options.signal.throwIfAborted(); return fetchImpl(url, options); }).then((response) => {
      options.signal.removeEventListener("abort", abort);
      if (settled) { if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); return; }
      settled = true; resolve(response);
    }, (error) => { options.signal.removeEventListener("abort", abort); if (!settled) { settled = true; reject(error); } });
  });
}

async function readBytes(response, maximum, signal, meter) {
  const declared = response.headers.get("content-length");
  check(declared === null || /^\d+$/.test(declared) && Number(declared) <= maximum, "declared response ceiling");
  check(response.body, "missing response body");
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted(); if (next.done) break;
      bytes += next.value.byteLength; meter.consumed_body_bytes += next.value.byteLength;
      check(bytes <= maximum && meter.consumed_body_bytes <= meter.maximum_body_bytes, "consumed response or cumulative byte ceiling");
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, bytes);
  } finally { signal.removeEventListener("abort", abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Trusted code-level synthetic transport seam. No default fetch, persisted job,
 * source-use approval, restart recovery or native app enrollment is implied.
 * Hooks are awaited and cloned, but their existence does not prove durable storage.
 */
export async function acquireWiChildcareWithTransport(options = {}) {
  check(validOptions(options, ["fetchImpl", "signal", "sleep", "now", "timeoutMs", "maximumBytes", "onPreflight", "onObservation"]), "unsupported options");
  const { fetchImpl, signal, sleep = (ms, opts) => delay(ms, undefined, opts), now = () => new Date(), timeoutMs = 15_000, maximumBytes = 100_000_000 } = options;
  check([fetchImpl, sleep, now].every((v) => typeof v === "function") && (signal === undefined || signal instanceof AbortSignal)
    && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 60_000 && Number.isSafeInteger(maximumBytes) && maximumBytes >= 1024 && maximumBytes <= 100_000_000, "transport options");
  for (const key of ["onPreflight", "onObservation"]) check(options[key] === undefined || typeof options[key] === "function", "retention hook");
  signal?.throwIfAborted(); const startedAt = now().toISOString();
  const allowed = new Set([...metadataUrls, wiInventoryUrl()]);
  const meter = { requests: 0, consumed_body_bytes: 0, maximum_body_bytes: maximumBytes };
  const meteredFetch = async (url, requestOptions) => {
    check(allowed.has(url) && Buffer.byteLength(url) <= 2000 && requestOptions.signal instanceof AbortSignal, "fixed request");
    requestOptions.signal.throwIfAborted(); meter.requests++;
    let response;
    try {
      response = await fetchUntilAbort(fetchImpl, url, { redirect: "error", credentials: "omit", signal: requestOptions.signal });
      requestOptions.signal.throwIfAborted();
      check(response instanceof Response && !response.redirected && !(response.status >= 300 && response.status < 400), "redirect or response shape");
      // Never read error pages: a hanging body must not conceal Retry-After.
      if (!response.ok) return response;
      const bytes = await readBytes(response, metadataUrls.has(url) ? 131_072 : 8_000_000, requestOptions.signal, meter);
      requestOptions.signal.throwIfAborted();
      // Preserve XML and JSON bytes exactly. Fetch exposes decoded body bytes;
      // inherited wire encoding/length headers cannot describe the buffered body.
      const headers = new Headers(response.headers); headers.delete("content-encoding"); headers.delete("content-length");
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
    } finally { if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); }
  };
  const preflightOptions = { fetchImpl: meteredFetch, signal, sleep, now, timeoutMs };
  const before = await preflightWiChildcare(preflightOptions), observations = [];
  await options.onPreflight?.({ phase: "before", preflight: structuredClone(before) }); signal?.throwIfAborted();

  async function observe(kind, url) {
    await sleep(1000, { signal });
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(new DOMException("Wisconsin attempt deadline.", "TimeoutError")), timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
      let response, wait = (attempt + 1) * 1000;
      try {
        response = await meteredFetch(url, { signal: requestSignal }); requestSignal.throwIfAborted();
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, maximumWaitMs: 60_000, now });
          throw Object.assign(new Error("HTTP failure"), { retryable });
        }
        const bytes = Buffer.from(await response.arrayBuffer()); requestSignal.throwIfAborted();
        const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        check(payload && typeof payload === "object" && !Array.isArray(payload) && !payload.error, "JSON response envelope");
        return { kind, url, observed_at: now().toISOString(), payload, payload_sha256: hash(payload), response_bytes: bytes.length };
      } catch (error) {
        signal?.throwIfAborted(); if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
        if (attempt === 2 || !(error.retryable || error.name === "TimeoutError" || error.name === "TypeError" && !response)) throw new Error(`Wisconsin ${kind} transport failed; inspect contract, budget or provider availability.`);
      } finally { clearTimeout(timer); if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); }
      await sleep(wait, { signal });
    }
  }
  async function retain(observation) {
    await options.onObservation?.(structuredClone(observation)); signal?.throwIfAborted(); observations.push(observation);
  }
  const first = await observe("inventory", wiInventoryUrl()), ids = wiInventory(first.payload, before.source.source_record_count); await retain(first);
  for (const batch of wiBatches(ids)) {
    const url = wiFeatureUrl(batch); allowed.add(url);
    const observation = await observe("features", url); wiFeatures(observation.payload, batch, before); await retain(observation);
  }
  const last = await observe("inventory", wiInventoryUrl());
  check(isDeepStrictEqual(ids, wiInventory(last.payload, ids.length)), "final inventory drift"); await retain(last);
  await sleep(1000, { signal }); signal?.throwIfAborted();
  const after = await preflightWiChildcare(preflightOptions);
  const acquired = replayWiChildcareAcquisition({ schema_version: 1, transformation_version: WI_ACQUISITION_VERSION, started_at: startedAt,
    observed_at: now().toISOString(), preflight_before: before, preflight_after: after, observations }, { signal });
  await options.onPreflight?.({ phase: "after", preflight: structuredClone(after) }); signal?.throwIfAborted();
  return { ...acquired, transport: { ...meter, mode: "injected-transport", source_authenticity_verified: false,
    accounting: "decoded-consumed-body-bytes-including-preflights-and-failed-attempts-not-wire-bytes" } };
}

/** Deliberately closed even if an old development-policy boolean is edited. */
export async function acquireWiChildcare(options = {}) {
  check(validOptions(options, ["signal"]) && (options.signal === undefined || options.signal instanceof AbortSignal), "unsupported live options");
  options.signal?.throwIfAborted();
  throw Object.assign(new Error("Wisconsin source-use approval and durable native app enrollment are pending. No acquisition was started."), { code: "WI_CHILDCARE_LIVE_NOT_ENROLLED" });
}
