import { readExactZipIndustryEvidenceWithTemporalQualificationV31 as prior } from "./exact-zip-industry-temporal-qualification-v3-1.mjs";
import { readExactZipIndustryEvidenceV32 as matrix } from "./national-exact-zip-industry-evidence-matrix-v3-2-reader.mjs";
import { readExactZipIndustrySummaryV32 as summary } from "./exact-zip-industry-summary-v3-2.mjs";
import { classifyExactZipEvidenceDispositionV24 as classify } from "./exact-zip-evidence-disposition-v2-4.mjs";

const ID = "ny_retail_food_license_address_evidence_count";
const TOTAL = 48194;
const countBy = (rows, key) => rows.reduce((result, row) => {
  result[row[key]] = (result[row[key]] ?? 0) + 1; return result;
}, {});

export async function readExactZipIndustryEvidenceWithTemporalQualificationV32(options = {}) {
  const current = await matrix(options);
  options.signal?.throwIfAborted();
  if (current.row === null) {
    return {
      schema_version: current.schema_version,
      status: current.status,
      reason: "outside-retained-cohort",
      zip5: options.zip5,
      row: null,
      temporal_qualification: null,
      release_id: current.release_id,
      manifest_sha256: current.manifest_sha256,
      full_matrix_replay_performed: current.full_matrix_replay_performed,
      recursive_lineage_verified: current.recursive_lineage_verified,
    };
  }
  const [previous, aggregate] = await Promise.all([prior(options), summary(options)]);
  const cell = current.row?.cells?.[ID], raw = cell?.status ?? "outside-source-denominator";
  const index = previous.temporal_qualification.rows.findIndex((row) => row.dimension_id === ID);
  if (index < 0) throw new Error("Exact-ZIP v3.2 New York qualification is unavailable.");
  const qualification = { ...previous.temporal_qualification.rows[index],
    source_release_id: cell?.source_release_id ?? "ny-retail-food-stores-2026-10-14-7f9dc6f0449f76e0",
    review_qualification: "within-review-window",
    source_reference_at: cell?.source_rows_updated_at ?? "2026-10-14T19:08:34.000Z",
    review_due_at: "2027-02-11T19:08:34.000Z",
    evidence_disposition: { ...classify({ raw_status: raw, semantic_class: "non-active-reporting", review_qualification: "within-review-window" }),
      continuous_operation_verified: false, site_occupancy_verified: false, public_access_verified: false },
  };
  const rows = previous.temporal_qualification.rows.with(index, qualification);
  const qualificationCounts = countBy(rows, "review_qualification"), semanticCounts = countBy(rows, "semantic_class");
  return { ...current, source_metadata: { ...previous.source_metadata,
    [ID]: { ...previous.source_metadata[ID], source_release_id: qualification.source_release_id,
      semantics: "Annual New York licensed retail-food-store address evidence from the 2026-10-14 publisher snapshot; within review window, non-active reporting, not a physical-site or unique-business count, and nonadditive with ny_retail_food_location_profiles." } },
    status_counts: aggregate.status_counts,
    cell_status_counts_by_dimension: Object.fromEntries(aggregate.dimensions.map((row) => [row.id, row.status_counts])),
    temporal_qualification: { ...previous.temporal_qualification,
      schema_version: "exact-zip-industry-temporal-qualification-view@3.2.0", rows,
      summary: { ...previous.temporal_qualification.summary,
        mapped_dimension_count: rows.length - (semanticCounts.unmapped ?? 0), unmapped_dimension_count: semanticCounts.unmapped ?? 0,
        source_key_count: new Set(rows.map((row) => row.source_key).filter(Boolean)).size,
        qualification_dimension_counts: qualificationCounts,
        qualification_cell_counts: Object.fromEntries(Object.entries(qualificationCounts).map(([key, value]) => [key, value * TOTAL])),
        semantic_dimension_counts: semanticCounts,
        semantic_cell_counts: Object.fromEntries(Object.entries(semanticCounts).map(([key, value]) => [key, value * TOTAL])) },
      provenance: { ...previous.temporal_qualification.provenance,
        matrix_release_id: current.release_id, matrix_manifest_sha256: current.manifest_sha256 },
      claims: { ...previous.temporal_qualification.claims, current_operations_verified: false,
        continuous_operation_verified: false, complete_all_businesses: false } } };
}
