import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { MI_CHILDCARE_ITEM_URL } from "./mi-childcare-preflight.mjs";
import { publisherRetryDelay } from "./source-http-guards.mjs";

export const MI_CHILDCARE_METADATA_URL = `${MI_CHILDCARE_ITEM_URL}/info/metadata/metadata.xml`;
export const MI_CHILDCARE_METADATA_VERSION = "mi-childcare-metadata@1.0.0";
export const MI_CHILDCARE_METADATA_SHA256 = "347d450cc6c910ed241474f0dbac51a81f31bde0ff9ff386901149f26e09ef0b";
export const MI_CHILDCARE_METADATA_BYTES = 7523;
const MAXIMUM_BYTES = 1_000_000;
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === [...keys].sort().join("|");
function check(ok, label) { if (!ok) throw new Error(`Michigan publisher metadata rejected: ${label}.`); }

// Retain opaque bytes, never execute XML, follow its links or interpret it as a
// verified licensing snapshot. Hash pinning is not full XML parser validation.
function assemble(raw, contentType, observedAt) {
  check(Buffer.isBuffer(raw) && raw.length <= MAXIMUM_BYTES, "byte limit");
  check(["application/xml", "text/xml"].includes(contentType), "XML content type");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(raw); }
  catch { throw new Error("Michigan publisher metadata rejected: UTF-8."); }
  check(!/<!\s*(?:DOCTYPE|ENTITY)\b|<\s*\/?\s*html\b/i.test(text)
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)
    && !/&(?!(?:amp|lt|gt|apos|quot);|#(?:[0-9]+|x[0-9a-fA-F]+);)/u.test(text), "unsafe XML content");
  const envelope = text.trim().replace(/^<\?xml\s+[^?]*\?>\s*/u, "");
  check(/^<metadata(?:\s[^<>]*|)>/u.test(envelope) && /<\/metadata>\s*$/u.test(envelope)
    && text.includes("<resTitle>Child Care</resTitle>") && text.includes("MiLEAP"), "XML envelope or marker");
  check(raw.length === MI_CHILDCARE_METADATA_BYTES && hash(raw) === MI_CHILDCARE_METADATA_SHA256, "publisher byte drift");
  const clock = Date.parse(observedAt);
  check(typeof observedAt === "string" && Number.isFinite(clock) && new Date(clock).toISOString() === observedAt, "observation clock");
  return { schema_version: 1, transformation_version: MI_CHILDCARE_METADATA_VERSION, url: MI_CHILDCARE_METADATA_URL, status: 200,
    content_type: contentType, observed_at: observedAt, sha256: hash(raw), bytes: raw.length, base64: raw.toString("base64"),
    notices: { validation: "pinned-bytes-fatal-utf8-envelope-marker-only-not-full-xml-parser-or-schema-validation",
      full_xml_schema_validated: false, legal_approval: false, agreement_acceptance_performed: false, acquisition_authorized: false,
      business_rows_acquired: false, restricted_publisher_contacts_not_business_data: true, export_policy: "local-review-only",
      inherited_metadata_item_id: "adf26197127c4295afc6b5478b312cf9", inherited_item_mismatch: true, embedded_links_followed: false,
      publisher_claims_quarterly_updates: true, publisher_claims_complete_processed_active_licenses: true,
      source_freshness_verified: false, current_operating_status_verified: false, license_status_verified: false,
      coordinate_datum_verified: false, national_completeness_verified: false, current_json_terms_remain_required: true },
  };
}
export function validateMiChildcareMetadata(evidence) {
  check(exact(evidence, ["schema_version", "transformation_version", "url", "status", "content_type", "observed_at", "sha256", "bytes", "base64", "notices"])
    && typeof evidence.base64 === "string" && evidence.base64.length <= Math.ceil(MAXIMUM_BYTES / 3) * 4, "evidence shape");
  const raw = Buffer.from(evidence.base64, "base64");
  const expected = assemble(raw, evidence.content_type, evidence.observed_at);
  check(JSON.stringify(evidence) === JSON.stringify(expected), "evidence reconstruction"); return evidence;
}
async function readBytes(response, signal) {
  signal.throwIfAborted();
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  check(["application/xml", "text/xml"].includes(contentType), "XML content type");
  const length = response.headers.get("content-length");
  check(length === null || (/^\d+$/.test(length) && Number.isSafeInteger(Number(length)) && Number(length) <= MAXIMUM_BYTES), "declared length");
  check(response.body, "missing body");
  const reader = response.body.getReader(), chunks = []; let bytes = 0, complete = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) { signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted(); if (next.done) break;
      bytes += next.value.byteLength; check(bytes <= MAXIMUM_BYTES, "stream byte limit"); chunks.push(next.value); }
    // Fetch exposes decoded bytes; encoded Content-Length is not their length.
    const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
    check(length === null || (encoding && encoding !== "identity") || bytes === Number(length), "truncated body");
    complete = true; return { raw: Buffer.concat(chunks, bytes), contentType };
  } finally { signal.removeEventListener("abort", abort); if (!complete) void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function acquireMiChildcareMetadata(options = {}) {
  check(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((k) => ["fetchImpl", "signal", "sleep", "timeoutMs", "now"].includes(k)), "unsupported options");
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  check([fetchImpl, sleep, now].every((v) => typeof v === "function") && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30_000, "transport options");
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted(); const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException("Metadata request timed out.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    let response, wait = 1000 * (attempt + 1);
    try {
      response = await fetchImpl(MI_CHILDCARE_METADATA_URL, { redirect: "manual", signal: requestSignal }); requestSignal.throwIfAborted();
      check(!response.redirected && !(response.status >= 300 && response.status < 400), "redirect");
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
        throw Object.assign(new Error("HTTP failure."), { retryable });
      }
      const { raw, contentType } = await readBytes(response, requestSignal); requestSignal.throwIfAborted();
      const time = now(); check(time instanceof Date && Number.isFinite(time.getTime()), "clock");
      return assemble(raw, contentType, time.toISOString());
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      signal?.throwIfAborted(); if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
      if (attempt === 2 || !(error.retryable || ["TypeError", "TimeoutError"].includes(error.name))) throw new Error(`Michigan publisher metadata request rejected (${error.name}).`);
    } finally { clearTimeout(timer); }
    await sleep(wait, { signal });
  }
}
