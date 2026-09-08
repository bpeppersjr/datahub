import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { preflightOhChildcare, ohioPreflightUrl } from "./oh-childcare-preflight.mjs";
import { OH_ACQUISITION_VERSION, ohInventoryUrl, ohFeatureUrl, ohInventory, ohBatches, ohFeatures, replayOhChildcareAcquisition } from "./oh-childcare-acquisition.mjs";
import { publisherRetryDelay } from "./source-http-guards.mjs";
import policy from "../config/source-policies/oh-childcare-local-review.json" with { type: "json" };
import { assertOhChildcareSourceUseConfiguration, bindOhChildcareSourceUse } from "./oh-childcare-source-use.mjs";
import useDecision from "../docs/states/OH-CHILDCARE-USE-DECISION-2026-09-08.json" with { type: "json" };

const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const check = (v, reason) => { if (!v) throw new Error(`Ohio transport rejected: ${reason}.`); };
const metadataUrls = new Set(["layer", "item", "statuses", "centers", "selected"].map(ohioPreflightUrl));
const noticeUrls = useDecision.availability_observations.map((o) => o.url);
const optionsValid = (v, names) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every((k) => names.includes(k));

// A fetch implementation that ignores AbortSignal must not hold the caller forever.
// Late responses are cancelled, not adopted after the attempt has timed out.
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

/** Trusted code-level test seam, not authorization or a sandbox for supplied functions.
 * No default network transport. The caller must supply synthetic responses for offline tests.
 */
export async function acquireOhChildcareWithTransport(options = {}) {
  check(optionsValid(options, ["fetchImpl", "signal", "sleep", "now", "timeoutMs", "maximumBytes", "sourceUseRequired", "onSourceUseBound", "onObservation"]), "unsupported options");
  const { fetchImpl, signal, sleep = (ms, opts) => delay(ms, undefined, opts), now = () => new Date(), timeoutMs = 15_000, maximumBytes = 100_000_000, sourceUseRequired = false, onSourceUseBound } = options;
  check([fetchImpl, sleep, now].every((v) => typeof v === "function") && (signal === undefined || signal instanceof AbortSignal)
    && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 60_000 && Number.isSafeInteger(maximumBytes) && maximumBytes >= 1024 && maximumBytes <= 100_000_000, "transport options");
  check(typeof sourceUseRequired === "boolean" && (sourceUseRequired ? typeof onSourceUseBound === "function" : onSourceUseBound === undefined), "source-use gate options");
  check(options.onObservation === undefined || typeof options.onObservation === "function", "observation retention hook");
  if (sourceUseRequired) assertOhChildcareSourceUseConfiguration();
  signal?.throwIfAborted(); const startedAt = now().toISOString();
  const allowed = new Set([...metadataUrls, ohInventoryUrl(), ...(sourceUseRequired ? noticeUrls : [])]);
  const meter = { requests: 0, consumed_body_bytes: 0, maximum_body_bytes: maximumBytes };
  const meteredFetch = async (url, requestOptions) => {
    check(allowed.has(url) && Buffer.byteLength(url) <= 2000 && requestOptions.signal instanceof AbortSignal, "fixed request");
    requestOptions.signal.throwIfAborted(); meter.requests++;
    let response;
    try {
      response = await fetchUntilAbort(fetchImpl, url, { redirect: "error", credentials: "omit", signal: requestOptions.signal });
      requestOptions.signal.throwIfAborted();
      check(response instanceof Response && !response.redirected && !(response.status >= 300 && response.status < 400), "redirect or response shape");
      // Do not consume error bodies. Return their status/Retry-After and cancel the
      // body in finally; a stalled error page must not hide the provider cooldown.
      if (!response.ok && !(sourceUseRequired && noticeUrls.includes(url) && [400, 404].includes(response.status))) return response;
      // Partial successful-status bodies from failed attempts consume the same budget.
      // Native fetch exposes decoded bytes; Content-Length may describe compressed bytes.
      const bytes = await readBytes(response, metadataUrls.has(url) ? 131_072 : noticeUrls.includes(url) ? 1_048_576 : 8_000_000, requestOptions.signal, meter);
      requestOptions.signal.throwIfAborted();
      const headers = new Headers(response.headers); headers.delete("content-encoding"); headers.delete("content-length");
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
    } finally { if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); }
  };
  const preflightOptions = { fetchImpl: meteredFetch, signal, sleep, now, timeoutMs };
  const before = await preflightOhChildcare(preflightOptions), observations = [];
  let sourceUseBefore = null, lastUseCheck = null;
  function assertCurrentSourceUse() {
    if (!sourceUseRequired) return;
    check(sourceUseBefore, "source use must be bound before inventory or rows");
    const checkedAt = now().toISOString();
    check(checkedAt >= sourceUseBefore.binding.checked_at && (lastUseCheck === null || checkedAt >= lastUseCheck), "source-use clock reversal");
    bindOhChildcareSourceUse(before, sourceUseBefore.availability, { checkedAt }); lastUseCheck = checkedAt;
  }
  async function observe(kind, url) {
    await sleep(1000, { signal });
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      if (kind !== "notice") assertCurrentSourceUse();
      const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(new DOMException("Ohio attempt deadline.", "TimeoutError")), timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
      let response, wait = (attempt + 1) * 1000;
      try {
        response = await meteredFetch(url, { signal: requestSignal }); requestSignal.throwIfAborted();
        if (!response.ok && !(kind === "notice" && [400, 404].includes(response.status))) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, maximumWaitMs: 60_000, now });
          throw Object.assign(new Error("HTTP failure"), { retryable });
        }
        const bytes = Buffer.from(await response.arrayBuffer()); requestSignal.throwIfAborted();
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (kind === "notice") return { url, observed_at: now().toISOString(), http_status: response.status, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
        const payload = JSON.parse(text);
        check(payload && typeof payload === "object" && !Array.isArray(payload) && !payload.error, "JSON response envelope");
        const observedAt = now().toISOString(); check(!sourceUseRequired || observedAt >= lastUseCheck, "query observation precedes source-use check");
        return { kind, url, observed_at: observedAt, payload, payload_sha256: hash(payload), response_bytes: bytes.length };
      } catch (error) {
        signal?.throwIfAborted(); if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
        if (attempt === 2 || !(error.retryable || error.name === "TimeoutError" || error.name === "TypeError" && !response)) throw new Error(`Ohio ${kind} transport failed; inspect contract, budget or provider availability.`);
      } finally { clearTimeout(timer); if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); }
      await sleep(wait, { signal });
    }
  }
  async function sourceUseFor(preflight) {
    const availability = [];
    for (const url of noticeUrls) availability.push(await observe("notice", url));
    check(availability[0].observed_at >= preflight.finished_at, "availability precedes prerequisite completion");
    const binding = bindOhChildcareSourceUse(preflight, availability, { checkedAt: now().toISOString() });
    return { preflight: structuredClone(preflight), availability, binding };
  }
  if (sourceUseRequired) {
    sourceUseBefore = await sourceUseFor(before);
    // An app-owned caller must persist this prerequisite before returning. This hook
    // is awaited but is not itself proof of durable storage or an authorization token.
    await onSourceUseBound(structuredClone(sourceUseBefore)); signal?.throwIfAborted(); assertCurrentSourceUse();
  }
  async function retain(observation) {
    await options.onObservation?.(structuredClone(observation)); signal?.throwIfAborted();
    observations.push(observation);
  }
  const first = await observe("inventory", ohInventoryUrl()), ids = ohInventory(first.payload, before.source.source_record_count); await retain(first);
  for (const batch of ohBatches(ids)) {
    const url = ohFeatureUrl(batch); allowed.add(url);
    const o = await observe("features", url); ohFeatures(o.payload, batch, before); await retain(o);
  }
  const last = await observe("inventory", ohInventoryUrl());
  check(isDeepStrictEqual(ids, ohInventory(last.payload, ids.length)), "final inventory drift"); await retain(last);
  await sleep(1000, { signal }); signal?.throwIfAborted();
  const after = await preflightOhChildcare(preflightOptions);
  const sourceUseAfter = sourceUseRequired ? await sourceUseFor(after) : null;
  signal?.throwIfAborted();
  const observedAt = now().toISOString();
  check(!sourceUseRequired || observedAt >= sourceUseAfter.binding.checked_at, "acquisition completion precedes final source-use binding");
  const acquired = replayOhChildcareAcquisition({ schema_version: 1, transformation_version: OH_ACQUISITION_VERSION, started_at: startedAt,
    observed_at: observedAt, preflight_before: before, preflight_after: after, observations }, { signal });
  return { ...acquired, ...(sourceUseRequired ? { source_use_evidence: { before: sourceUseBefore, after: sourceUseAfter } } : {}),
    transport: { ...meter, mode: "injected-transport", source_authenticity_verified: false, accounting: "decoded-consumed-body-bytes-including-preflights-and-failed-attempts-not-wire-bytes" } };
}

/** Deliberately closed until reviewed live policy and app enrollment are implemented. */
export async function acquireOhChildcare(options = {}) {
  check(optionsValid(options, ["signal"]), "unsupported live options"); options.signal?.throwIfAborted();
  check(hash(policy) === "cedc3384cd0a2509d774ecec90f992e2828ea496bdbafaeeea448576a566bb76", "development policy configuration drift");
  // Do not let an edited boolean activate this un-enrolled connector.
  throw Object.assign(new Error("Ohio live collection is not enrolled: current policy permits connector development only."), { code: "OH_CHILDCARE_LIVE_NOT_ENROLLED" });
}
