import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { NJ_CHILDCARE_ITEM_URL } from "./nj-childcare-preflight.mjs";
import { publisherRetryDelay } from "./source-http-guards.mjs";

export const NJ_CHILDCARE_METADATA_URL = `${NJ_CHILDCARE_ITEM_URL}/info/metadata/metadata.xml`;
const MAXIMUM_BYTES = 1_000_000;

// Opaque publisher bytes are retained unchanged. These checks do not parse XML,
// validate its schema, execute XML content or approve its distribution terms.
function validateEnvelope(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Invalid publisher metadata UTF-8."); }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text) || /<\s*\/?\s*html\b/i.test(text)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) throw new Error("Invalid publisher metadata content.");
  // Permit XML's five predefined entities and numeric references, never custom entities.
  if (/&(?!(?:amp|lt|gt|apos|quot);|#(?:[0-9]+|x[0-9a-fA-F]+);)/u.test(text)) throw new Error("Invalid publisher metadata entity reference.");
  const envelope = text.trim().replace(/^<\?xml\s+[^?]*\?>\s*/u, "");
  if (!/^<metadata(?:\s[^<>]*|)>/u.test(envelope) || !/<\/metadata>\s*$/u.test(envelope)
    || !text.includes("Strc_DCF_childcare")) throw new Error("Publisher metadata envelope or dataset marker changed.");
}

async function readBytes(response, signal) {
  signal.throwIfAborted();
  const mediaType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!["application/xml", "text/xml"].includes(mediaType)) throw new Error("Publisher metadata must be XML.");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAXIMUM_BYTES) throw new Error("Publisher metadata exceeds byte limit.");
  if (!response.body) throw new Error("Publisher metadata body is missing.");
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0, complete = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAXIMUM_BYTES) throw new Error("Publisher metadata exceeds byte limit.");
      chunks.push(next.value);
    }
    const result = Buffer.concat(chunks, bytes);
    validateEnvelope(result);
    complete = true;
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function fetchNjChildcareMetadata(options = {}) {
  const allowed = ["fetchImpl", "signal", "sleep", "timeoutMs", "now"];
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !allowed.includes(key))) {
    throw new Error("Unsupported New Jersey childcare metadata options.");
  }
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  if (![fetchImpl, sleep, now].every((value) => typeof value === "function")
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Invalid New Jersey childcare metadata options.");
  signal?.throwIfAborted();
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException("Publisher metadata request timed out.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    let response, wait = 1000 * (attempt + 1);
    try {
      response = await fetchImpl(NJ_CHILDCARE_METADATA_URL, { redirect: "manual", signal: requestSignal });
      if (response.redirected) throw new Error("Publisher metadata redirect rejected.");
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
        throw Object.assign(new Error("Publisher metadata HTTP failure."), { retryable });
      }
      const raw = await readBytes(response, requestSignal);
      signal?.throwIfAborted();
      const observedAt = now();
      if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) throw new Error("Invalid publisher metadata observation clock.");
      return { raw, sha256: createHash("sha256").update(raw).digest("hex"), bytes: raw.length,
        url: NJ_CHILDCARE_METADATA_URL, observed_at: observedAt.toISOString(),
        validation: "utf8-xml-content-type-envelope-and-dataset-marker-only",
        full_xml_schema_validated: false, legal_approval: false };
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      signal?.throwIfAborted();
      if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
      if (attempt === 2 || !(error.retryable || error.name === "TypeError" || error.name === "TimeoutError")) {
        throw new Error(error.name === "TimeoutError" ? "New Jersey childcare metadata request timed out."
          : error.name === "TypeError" ? "New Jersey childcare metadata network request failed."
          : "New Jersey childcare metadata request rejected: HTTP, byte limit or content validation failed.");
      }
    } finally { clearTimeout(timer); }
    await sleep(wait, { signal });
  }
}
