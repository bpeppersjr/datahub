import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { preflightMiChildcare, validateMiChildcarePreflight, MI_CHILDCARE_LAYER, MI_CHILDCARE_ITEM, MI_CHILDCARE_SCHEMA,
  MI_CHILDCARE_SELECTED_FIELDS, MI_CHILDCARE_WHERE } from "./mi-childcare-preflight.mjs";
import { acquireMiChildcareMetadata, validateMiChildcareMetadata } from "./mi-childcare-metadata.mjs";
import { boundedJson, publisherRetryDelay } from "./source-http-guards.mjs";

export const MI_CHILDCARE_ACQUISITION_VERSION = "mi-childcare-acquisition@1.0.0";
const FIELDS = MI_CHILDCARE_SELECTED_FIELDS;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && isDeepStrictEqual(Object.keys(v).sort(), [...keys].sort());
const time = v => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function check(ok, label) { if (!ok) throw new Error(`Michigan childcare acquisition rejected: ${label}.`); }
function optionsOnly(value, keys) { check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key)), "unsupported options"); }
function authorize(preflight, caller, maximumAge, startedAt) {
  validateMiChildcarePreflight(preflight);
  check(Number.isSafeInteger(maximumAge) && maximumAge >= 1 && maximumAge <= 86_400_000 && time(startedAt)
    && Date.parse(startedAt) >= Date.parse(preflight.observed_at) && Date.parse(startedAt) - Date.parse(preflight.observed_at) <= maximumAge, "preflight freshness budget");
  check(exact(caller, ["mode", "reviewReference", "metadataReceiptSha256"]) && caller.mode === "explicit-reviewed-center-acquisition"
    && typeof caller.reviewReference === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(caller.reviewReference)
    && caller.metadataReceiptSha256 === hash(preflight), "explicit caller review assertion and receipt pin required");
}
function fingerprint(receipt) {
  return hash({ source: receipt.source, metadata: receipt.observations[0].payload,
    item: Object.fromEntries(Object.entries(receipt.observations[1].payload).filter(([key]) => !["numViews", "lastViewed"].includes(key))) });
}
function query(args) { return `${MI_CHILDCARE_LAYER}/query?${new URLSearchParams({ f: "json", where: MI_CHILDCARE_WHERE, returnGeometry: "false", ...args })}`; }
const inventoryUrl = () => query({ returnIdsOnly: "true" });
const featureUrl = ids => query({ objectIds: ids.join(","), outFields: FIELDS.join(","), orderByFields: "OBJECTID ASC" });
function inventory(payload, count) {
  check(payload && Object.keys(payload).every(key => ["objectIdFieldName", "objectIds", "exceededTransferLimit"].includes(key))
    && payload.objectIdFieldName === "OBJECTID" && (payload.exceededTransferLimit === undefined || payload.exceededTransferLimit === false)
    && Array.isArray(payload.objectIds) && payload.objectIds.length === count && new Set(payload.objectIds).size === count
    && payload.objectIds.every(id => Number.isSafeInteger(id) && id >= 1), "ID inventory");
  return [...payload.objectIds].sort((a, b) => a - b);
}
function packs(ids) {
  const batches = []; let offset = 0;
  while (offset < ids.length) {
    const batch = [];
    while (offset + batch.length < ids.length && batch.length < 100 && Buffer.byteLength(featureUrl([...batch, ids[offset + batch.length]])) <= 2000) batch.push(ids[offset + batch.length]);
    check(batch.length, "URL ceiling"); batches.push(batch); offset += batch.length;
  }
  return batches;
}
function featuresFor(payload, ids) {
  check(payload && Object.keys(payload).every(key => ["objectIdFieldName", "displayFieldName", "fieldAliases", "fields", "features", "exceededTransferLimit"].includes(key))
    && (payload.objectIdFieldName === undefined || payload.objectIdFieldName === "OBJECTID")
    && (payload.displayFieldName === undefined || ["", "FacilityName"].includes(payload.displayFieldName))
    && (payload.exceededTransferLimit === undefined || payload.exceededTransferLimit === false)
    && Array.isArray(payload.features) && payload.features.length === ids.length, "batch shape, geometry, truncation or membership");
  if (payload.fieldAliases !== undefined) check(exact(payload.fieldAliases, FIELDS) && Object.values(payload.fieldAliases).every(v => typeof v === "string" && v.length <= 100), "field aliases");
  if (payload.fields !== undefined) {
    check(Array.isArray(payload.fields) && payload.fields.length === FIELDS.length && new Set(payload.fields.map(f => f.name)).size === FIELDS.length, "response schema roster");
    for (const field of payload.fields) {
      const pin = MI_CHILDCARE_SCHEMA.find(([name]) => name === field.name);
      check(pin && FIELDS.includes(field.name) && field.type === pin[1] && (pin[2] === null || field.length === pin[2])
        && Object.keys(field).every(key => ["name", "type", "alias", "length", "domain", "nullable"].includes(key))
        && Object.values(field).every(v => v === null || ["string", "number", "boolean"].includes(typeof v)), "response schema");
    }
  }
  const rows = new Map();
  for (const feature of payload.features) {
    const a = feature?.attributes;
    check(exact(feature, ["attributes"]) && exact(a, FIELDS) && ids.includes(a.OBJECTID) && !rows.has(a.OBJECTID), "private fields or row membership");
    check(a.FacilityTypeCode === "DC" && a.FacilityType === "Center" && a.State === "MI", "center-only scope");
    for (const [name, type, length] of MI_CHILDCARE_SCHEMA) if (FIELDS.includes(name)) {
      if (type === "esriFieldTypeString") check(a[name] === null || (typeof a[name] === "string" && a[name].length <= length), "selected string type or ceiling");
      else check(a[name] === null || (typeof a[name] === "number" && Number.isFinite(a[name]) && (type !== "esriFieldTypeSmallInteger" || Number.isInteger(a[name]))), "selected numeric type");
    }
    rows.set(a.OBJECTID, structuredClone(feature));
  }
  return ids.map(id => rows.get(id));
}

/** Offline reconstruction; retained hashes establish consistency, not publisher authenticity or legal approval. */
export function replayMiChildcareAcquisition(evidence, options = {}) {
  optionsOnly(options, ["signal"]); const { signal } = options; signal?.throwIfAborted();
  check(exact(evidence, ["schema_version", "transformation_version", "started_at", "observed_at", "supplied_preflight", "maximum_preflight_age_ms",
    "caller_authorization", "preflight_before", "preflight_after", "xml_before", "xml_after", "observations"])
    && evidence.schema_version === 1 && evidence.transformation_version === MI_CHILDCARE_ACQUISITION_VERSION && time(evidence.started_at) && time(evidence.observed_at), "evidence envelope");
  authorize(evidence.supplied_preflight, evidence.caller_authorization, evidence.maximum_preflight_age_ms, evidence.started_at);
  const before = validateMiChildcarePreflight(evidence.preflight_before), after = validateMiChildcarePreflight(evidence.preflight_after);
  const xmlBefore = validateMiChildcareMetadata(evidence.xml_before), xmlAfter = validateMiChildcareMetadata(evidence.xml_after);
  check(fingerprint(evidence.supplied_preflight) === fingerprint(before) && fingerprint(before) === fingerprint(after) && xmlBefore.sha256 === xmlAfter.sha256, "metadata, XML or count drift");
  check(evidence.started_at <= before.started_at && before.observed_at <= xmlBefore.observed_at && xmlBefore.observed_at <= xmlAfter.observed_at
    && xmlAfter.observed_at <= after.started_at && after.observed_at <= evidence.observed_at, "metadata chronology");
  const observations = evidence.observations;
  check(Array.isArray(observations) && observations.length >= 3 && observations.length <= 20_002, "observation roster");
  let prior = xmlBefore.observed_at, transferredBytes = 0;
  for (const observation of observations) {
    signal?.throwIfAborted();
    check(exact(observation, ["kind", "url", "observed_at", "payload", "payload_sha256", "response_bytes"]) && time(observation.observed_at)
      && observation.observed_at >= prior && observation.observed_at <= xmlAfter.observed_at && observation.payload_sha256 === hash(observation.payload)
      && Number.isSafeInteger(observation.response_bytes) && observation.response_bytes >= 1 && observation.response_bytes <= (observation.kind === "inventory" ? 1_000_000 : 8_000_000)
      && Buffer.byteLength(JSON.stringify(observation.payload)) <= (observation.kind === "inventory" ? 1_000_000 : 8_000_000), "observation integrity, chronology or size");
    prior = observation.observed_at; transferredBytes += observation.response_bytes; check(transferredBytes <= 100_000_000, "query transfer ceiling");
  }
  const ids = inventory(observations[0].payload, before.source.record_count), batches = packs(ids), features = [];
  check(observations.length === batches.length + 2 && observations[0].kind === "inventory" && observations.at(-1).kind === "inventory"
    && observations[0].url === inventoryUrl() && observations.at(-1).url === inventoryUrl()
    && isDeepStrictEqual(ids, inventory(observations.at(-1).payload, ids.length)), "stable selected ID roster");
  let selectedBytes = 0;
  for (const [index, batch] of batches.entries()) {
    signal?.throwIfAborted(); const observation = observations[index + 1];
    check(observation.kind === "features" && observation.url === featureUrl(batch), "fixed selected request");
    selectedBytes += Buffer.byteLength(JSON.stringify(observation.payload)); check(selectedBytes <= 100_000_000, "selected byte ceiling");
    features.push(...featuresFor(observation.payload, batch));
  }
  return { evidence: structuredClone(evidence), features, source: { ...after.source, item_id: MI_CHILDCARE_ITEM, selected_fields: [...FIELDS], return_geometry: false,
    coordinate_crs: null, coordinate_reference_verified: false, governed_geographic_assignment_eligible: false,
    object_ids_sha256: hash(ids), selected_json_bytes: selectedBytes, successful_query_response_bytes: transferredBytes,
    byte_count_validation: "successful-decoded-body-counts-observed-by-transport-not-independently-reconstructable-from-parsed-JSON-not-wire-or-total-retry-traffic",
    started_at: evidence.started_at, observed_at: evidence.observed_at, consistency: "metadata-xml-count-selected-id-roster-stable-not-transactional-snapshot",
    caller_authorization_validation: "structural-caller-assertion-not-independent-review", legal_approval: false, agreement_acceptance_performed: false, export_authorized: false,
    normalized_records_produced: 0, source_freshness_verified: false, current_operating_status_verified: false, national_completeness_verified: false },
  publisher_metadata: { before: structuredClone(xmlBefore), after: structuredClone(xmlAfter) } };
}

/** Explicit caller authorization is required even with a passing metadata receipt. No filesystem writes. */
export async function acquireMiChildcare(options = {}) {
  optionsOnly(options, ["preflight", "callerAuthorization", "maximumPreflightAgeMs", "fetchImpl", "signal", "sleep", "timeoutMs", "now"]);
  const { preflight, callerAuthorization, maximumPreflightAgeMs, fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  check([fetchImpl, sleep, now].every(v => typeof v === "function") && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30_000
    && (signal === undefined || signal instanceof AbortSignal), "transport options");
  signal?.throwIfAborted(); const startedAt = now().toISOString(); authorize(preflight, callerAuthorization, maximumPreflightAgeMs, startedAt);
  const supplied = structuredClone(preflight), caller = structuredClone(callerAuthorization), transport = { fetchImpl, signal, sleep, timeoutMs, now };
  const before = await preflightMiChildcare(transport); check(fingerprint(supplied) === fingerprint(before), "preflight changed since caller review");
  await sleep(1000, { signal }); signal?.throwIfAborted(); const xmlBefore = await acquireMiChildcareMetadata(transport), observations = [];
  let transferredBytes = 0;
  async function observe(kind, url) {
    const maximumBytes = kind === "inventory" ? 1_000_000 : 8_000_000;
    check(Buffer.byteLength(url) <= 2000, "URL ceiling"); await sleep(1000, { signal });
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted(); const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal; let response, wait = (attempt + 1) * 1000;
      try {
        response = await fetchImpl(url, { redirect: "manual", signal: requestSignal }); requestSignal.throwIfAborted();
        check(!response.redirected && !(response.status >= 300 && response.status < 400), "redirect");
        if (!response.ok) { const retryable = response.status === 429 || response.status >= 500;
          if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, maximumWaitMs: 60_000, now });
          throw Object.assign(new Error("HTTP failure"), { retryable }); }
        let responseBytes = 0; const declared = response.headers.get("content-length");
        check(response.body && (declared === null || (/^\d+$/.test(declared) && Number.isSafeInteger(Number(declared)) && Number(declared) <= maximumBytes)), "body or declared byte ceiling");
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const counting = new TransformStream({ transform(chunk, controller) {
          responseBytes += chunk.byteLength; transferredBytes += chunk.byteLength; check(transferredBytes <= 100_000_000, "cumulative query transfer ceiling");
          try { decoder.decode(chunk, { stream: true }); } catch { check(false, "invalid UTF-8"); }
          controller.enqueue(chunk);
        }, flush() { try { decoder.decode(); } catch { check(false, "incomplete UTF-8"); } } });
        const payload = await boundedJson(new Response(response.body.pipeThrough(counting), { headers: response.headers }), { signal: requestSignal, maximumBytes });
        const encoding = response.headers.get("content-encoding")?.trim().toLowerCase() ?? null;
        check(declared === null || ![null, "identity"].includes(encoding) || responseBytes === Number(declared), "truncated declared body");
        check(payload && typeof payload === "object" && !Array.isArray(payload) && !payload.error, "ArcGIS error or response shape");
        return { kind, url, observed_at: now().toISOString(), payload, payload_sha256: hash(payload), response_bytes: responseBytes };
      } catch (error) {
        if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
        signal?.throwIfAborted(); if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
        if (attempt === 2 || !(error.retryable || ["TimeoutError", "TypeError"].includes(error.name))) throw new Error(`Michigan childcare ${kind} request rejected (${error.name}).`);
      } finally { clearTimeout(timer); }
      await sleep(wait, { signal });
    }
  }
  const initial = await observe("inventory", inventoryUrl()), ids = inventory(initial.payload, before.source.record_count); observations.push(initial);
  for (const batch of packs(ids)) { const observation = await observe("features", featureUrl(batch)); featuresFor(observation.payload, batch); observations.push(observation); }
  const final = await observe("inventory", inventoryUrl()); check(isDeepStrictEqual(ids, inventory(final.payload, ids.length)), "ID roster changed"); observations.push(final);
  await sleep(1000, { signal }); signal?.throwIfAborted(); const xmlAfter = await acquireMiChildcareMetadata(transport);
  await sleep(1000, { signal }); signal?.throwIfAborted(); const after = await preflightMiChildcare(transport);
  return replayMiChildcareAcquisition({ schema_version: 1, transformation_version: MI_CHILDCARE_ACQUISITION_VERSION, started_at: startedAt, observed_at: now().toISOString(),
    supplied_preflight: supplied, maximum_preflight_age_ms: maximumPreflightAgeMs, caller_authorization: caller,
    preflight_before: before, preflight_after: after, xml_before: xmlBefore, xml_after: xmlAfter, observations }, { signal });
}
