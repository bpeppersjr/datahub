import { readExactZipIndustryEvidenceWithTemporalQualificationV32 as prior } from "./exact-zip-industry-temporal-qualification-v3-2.mjs";
import { readExactZipIndustryEvidenceV33 as matrix } from "./national-exact-zip-industry-evidence-matrix-v3-3-reader.mjs";
import { readExactZipIndustrySummaryV33 as summary } from "./exact-zip-industry-summary-v3-3.mjs";

const CHILDCARE = "retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b", ASSESSED = "2026-11-12T19:21:14.719Z";
const dimensions = new Set(["childcare_pa_candidates", "childcare_ct_candidates", "childcare_md_candidates", "childcare_vt_candidates", "childcare_co_candidates", "childcare_ut_candidates", "childcare_ia_candidates"]);
export async function readExactZipIndustryEvidenceWithTemporalQualificationV33(options = {}) {
  const current = await matrix(options); options.signal?.throwIfAborted();
  if (current.row === null) return { ...current, reason: "outside-retained-cohort", zip5: options.zip5, temporal_qualification: null };
  const [previous, aggregate] = await Promise.all([prior(options), summary(options)]);
  const rows = previous.temporal_qualification.rows.map((row) => {
    if (!dimensions.has(row.dimension_id)) return row; const cell = current.row.cells[row.dimension_id], reference = cell.temporal_status.source_reference_date;
    return { ...row, source_release_id: CHILDCARE, source_reference_at: reference, assessment_as_of: ASSESSED, review_qualification: "unmeasured", review_due_at: null, current_operations_verified: false, evidence_disposition: { raw_status: cell.status, evidence_state: cell.status === "positive" ? "evidence-present" : cell.status, lifecycle_status: "unmeasured", label: `${cell.status === "positive" ? "positive" : "absent from retained source rows"} · unmeasured`, current_operations_verified: false, additive: false, identity_merge_applied: false } };
  });
  const source_metadata = { ...previous.source_metadata };
  for (const dimension of dimensions) source_metadata[dimension] = { ...source_metadata[dimension], source_manifest: "data/retained-childcare-zip-evidence/releases/retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b/manifest.json", source_manifest_sha256: "9997dc9dcad2f3a35cd49a76244527ecd6bf6b13a4a6000db8a28f7651bf123a", source_release_id: CHILDCARE, accepted_candidate_rows: aggregate.retained_childcare_refresh.accepted_candidate_rows };
  return { ...current, source_metadata, status_counts: aggregate.status_counts, cell_status_counts_by_dimension: Object.fromEntries(aggregate.dimensions.map((row) => [row.id, row.status_counts])), temporal_qualification: { ...previous.temporal_qualification, schema_version: "exact-zip-industry-temporal-qualification-view@3.3.0", rows, provenance: { ...previous.temporal_qualification.provenance, matrix_release_id: current.release_id, matrix_manifest_sha256: current.manifest_sha256 }, claims: { ...previous.temporal_qualification.claims, current_operations_verified: false, complete_all_businesses: false }, summary: { ...previous.temporal_qualification.summary } } };
}
