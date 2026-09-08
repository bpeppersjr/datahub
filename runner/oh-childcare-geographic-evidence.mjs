import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { loadOhChildcareRegistryCandidates } from "./oh-childcare-registry-adapter.mjs";
import { verifyOhChildcareAppJob } from "./oh-childcare-app.mjs";

export const OH_CHILDCARE_GEOGRAPHIC_VERSION = "oh-childcare-geographic-evidence@1.0.0";
const contexts = new WeakMap();
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function check(ok, label) { if (!ok) throw new Error(`Ohio geographic evidence rejected: ${label}.`); }
function trusted(context) {
  const state = context && contexts.get(context);
  check(state, "trusted input context required"); return state;
}
function geographicRow(candidate) {
  const by = new Map(candidate.assertions.map(assertion => [assertion.predicate, assertion]));
  const address = by.get("site.address"), name = by.get("establishment.name"), point = by.get("site.reported-location");
  const source = { ...address.source }; delete source.source_field;
  return { schema_version: "1.0.0", site_entity_id: address.subject_entity_id,
    establishment_entity_id: name.subject_entity_id, zip_code: candidate.zipCode,
    address: structuredClone(address.value), location: { latitude: point.value.latitude, longitude: point.value.longitude },
    source, observed_at: address.observed_at, identity_matching_eligible: false,
    governed_geographic_assignment_eligible: false, export_policy: "local-review-only", category: "childcare",
    names: [{ raw: name.value }], source_status: structuredClone(by.get("establishment.source-status").value),
    evidence: { ...structuredClone(candidate.evidence), geographic_transformation_version: OH_CHILDCARE_GEOGRAPHIC_VERSION,
      assertions_sha256: hash([...candidate.assertions].sort((a, b) => a.assertion_id.localeCompare(b.assertion_id))) } };
}
async function verifyDependencies(state, signal) {
  const final = await verifyOhChildcareAppJob(state.source.receiptPath, { signal });
  check(final.receipt_sha256 === state.source.receiptSha256 && final.normalized.sha256 === state.source.manifestSha256
    && final.acquisition.sha256 === state.source.acquisitionManifestSha256, "dependency snapshot changed");
}

/** Builds a source-specific reporting contract from verified immutable app inputs.
 * No source requests, geospatial assignment, matching or publication. Returned
 * context is opaque and process-local: reloading retained dependencies is required
 * when verifying a serialized registry release in another process. */
export async function loadOhChildcareGeographicInput(receiptPath, options = {}) {
  const input = await loadOhChildcareRegistryCandidates(receiptPath, options), { signal } = options;
  const expected = new Map(), rows = [], recordIds = new Set();
  for (const [index, candidate] of input.contributions.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    const row = geographicRow(candidate);
    check(!expected.has(row.site_entity_id) && !recordIds.has(row.source.source_record_id), "duplicate source membership");
    expected.set(row.site_entity_id, structuredClone(row)); recordIds.add(row.source.source_record_id); rows.push(row);
  }
  check(rows.length === input.counts.accepted, "accepted membership count");
  const state = { expected, source: structuredClone(input.source), counts: structuredClone(input.counts), quality: structuredClone(input.quality) };
  await verifyDependencies(state, signal); signal?.throwIfAborted();
  const verificationContext = Object.freeze({}); contexts.set(verificationContext, state);
  return { ...input, geographicTransformationVersion: OH_CHILDCARE_GEOGRAPHIC_VERSION, rows, verificationContext };
}

/** Exact source-snapshot row membership, not merely shape-valid hashes. This
 * single-row check does not prove whole-release completeness or current disk state. */
export function validateOhChildcareGeographicEvidence(row, verificationContext) {
  const state = trusted(verificationContext), expected = state.expected.get(row?.site_entity_id);
  check(expected && isDeepStrictEqual(row, expected), "row differs from verified source snapshot");
  return structuredClone(expected);
}

/** Whole Ohio cohort verification: reject omissions, duplicates and altered rows,
 * then reverify retained dependencies. Registry callers must bind the returned
 * source hashes to their declared dependencies; never silently substitute a release. */
export async function verifyOhChildcareGeographicMembership(rows, verificationContext, options = {}) {
  check(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every(key => key === "signal"), "unsupported options");
  const { signal } = options; check(signal === undefined || signal instanceof AbortSignal, "invalid cancellation signal");
  signal?.throwIfAborted(); const state = trusted(verificationContext);
  check(Array.isArray(rows) && rows.length === state.expected.size, "complete accepted membership required");
  const snapshot = structuredClone(rows);
  const seen = new Set(); let withSourceZip = 0;
  for (const [index, row] of snapshot.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    validateOhChildcareGeographicEvidence(row, verificationContext);
    check(!seen.has(row.site_entity_id), "duplicate published membership"); seen.add(row.site_entity_id);
    if (row.zip_code !== null) withSourceZip++;
  }
  await verifyDependencies(state, signal); signal?.throwIfAborted();
  check(isDeepStrictEqual(rows, snapshot), "published rows changed during verification");
  return { status: "verified-against-retained-source", rows: seen.size, withSourceZip, withoutSourceZip: seen.size - withSourceZip,
    source: structuredClone(state.source), counts: structuredClone(state.counts), quality: structuredClone(state.quality),
    governedGeographicAssignmentEligible: false, identityMatchingEligible: false, publicExportAuthorized: false };
}
