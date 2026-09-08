import { setImmediate as yieldLoop } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { loadFreshTnChildcareRegistryInput } from "./tn-childcare-fresh-registry-input.mjs";
import { createFreshTnChildcareGeographicEvidence } from "./tn-childcare-geographic-evidence.mjs";

const check = (value, label) => { if (!value) throw new Error(`TN reporting input rejected: ${label}.`); };

/** Fresh-only verified schema1.1 reporting preparation; no national enrollment, acquisition or ZIP inference. */
export async function loadFreshTnChildcareReportingInput(manifestPath, options = {}) {
  check(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every(key => key === "signal"), "unsupported options");
  const { signal } = options;
  check(signal === undefined || signal instanceof AbortSignal, "invalid cancellation signal"); signal?.throwIfAborted();
  const input = await loadFreshTnChildcareRegistryInput(manifestPath, { signal });
  check(input.exportPolicy === "local-review-only" && input.nationalReportingIntegrated === false
    && Number.isSafeInteger(input.counts.accepted) && input.counts.accepted > 0 && input.counts.selected === input.counts.accepted + input.counts.quarantined
    && input.contributions.length === input.counts.accepted, "verified source count or policy");
  const reportingRows = [], identities = new Set();
  const summary = { reportingRows: 0, availableZip: 0, missingZip: 0,
    missingZipReasons: { "missing-source-zip": 0, "invalid-source-zip-placeholder": 0 }, missingPoints: 0 };
  for (const [index, contribution] of input.contributions.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    const row = createFreshTnChildcareGeographicEvidence(contribution);
    check(row.export_policy === "local-review-only" && row.identity_matching_eligible === false && row.source.source_id === "tn-dhs-active-childcare-centers"
      && row.evidence.manifest_sha256 === input.source.manifestSha256 && row.evidence.release_id === input.source.releaseId
      && row.source.source_release_id === input.source.sourceReleaseId && row.observed_at === input.source.observedAt
      && row.evidence.processed_at === input.source.processedAt && row.evidence.recovery === null && input.source.failedRunId === null
      && row.evidence.acquisition_kind === input.source.acquisitionKind && row.evidence.processing_time_status === "not-recorded-by-source-release-contract",
    "row policy or verified lineage");
    check(!identities.has(row.site_entity_id), "duplicate source-row identity"); identities.add(row.site_entity_id);
    if (row.zip_code === null) {
      check(Object.hasOwn(summary.missingZipReasons, row.evidence.zip_unavailable_reason), "unknown missing ZIP reason");
      summary.missingZip++; summary.missingZipReasons[row.evidence.zip_unavailable_reason]++;
    } else { check(row.evidence.zip_unavailable_reason === null, "available ZIP reason"); summary.availableZip++; }
    if (row.location.latitude === null && row.location.longitude === null) summary.missingPoints++;
    reportingRows.push(row);
  }
  summary.reportingRows = reportingRows.length;
  check(summary.reportingRows === input.counts.accepted && summary.availableZip + summary.missingZip === summary.reportingRows
    && Object.values(summary.missingZipReasons).reduce((a, b) => a + b, 0) === summary.missingZip, "reporting count coherence");
  check(isDeepStrictEqual(input.acceptedRecordQuality, { with_source_zip: summary.availableZip, without_source_zip: summary.missingZip,
    missing_zip_reasons: summary.missingZipReasons, missing_points: summary.missingPoints, zip_inferred: false }), "verified source quality differs from reporting summary");
  signal?.throwIfAborted();
  return { source: structuredClone(input.source), counts: { ...input.counts }, reportingRows, summary,
    exportPolicy: "local-review-only", nationalReportingIntegrated: false };
}
