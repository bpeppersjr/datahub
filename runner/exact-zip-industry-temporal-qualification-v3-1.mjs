import { readExactZipIndustryEvidenceWithTemporalQualificationV30 as prior } from "./exact-zip-industry-temporal-qualification-v3-0.mjs";
import { readExactZipIndustrySummaryV31 as summary } from "./exact-zip-industry-summary-v3-1.mjs";
import { classifyExactZipEvidenceDispositionV24 as classify } from "./exact-zip-evidence-disposition-v2-4.mjs";
import { TEMPORAL_MAPPING_BY_ID_V31 } from "./exact-zip-industry-temporal-mappings-v3-1.mjs";

const TOTAL = 48194;
const counts = (rows, key) => Object.fromEntries([...new Set(rows.map((row) => row[key]))]
  .map((value) => [value, rows.filter((row) => row[key] === value).length]));

export async function readExactZipIndustryEvidenceWithTemporalQualificationV31(options = {}) {
  const [previous, aggregate] = await Promise.all([prior(options), summary(options)]);
  const rows = previous.temporal_qualification.rows.map((row) => {
    const mapping = TEMPORAL_MAPPING_BY_ID_V31.get(row.dimension_id);
    if (!mapping) return row;
    const cell = previous.row?.cells?.[row.dimension_id];
    const sourceReference = cell?.temporal_status?.source_reference_date ?? cell?.temporal_status?.source_reference_at ?? row.source_reference_at ?? null;
    return { ...row, source_key: mapping.source_key, source_release_id: cell?.source_release_id ?? row.source_release_id,
      semantic_class: "non-active-reporting", review_qualification: "unmeasured", source_reference_at: sourceReference,
      source_status_term: mapping.source_status_term, publisher_status: mapping.source_status_term,
      current_operations_verified: false, continuous_operation_verified: false, unique_business_count: null,
      evidence_disposition: classify({ raw_status: cell?.status ?? "unavailable", semantic_class: "non-active-reporting", review_qualification: "unmeasured" }) };
  });
  const qualificationCounts = counts(rows, "review_qualification"), semanticCounts = counts(rows, "semantic_class");
  const sourceMetadata = { ...previous.source_metadata };
  for (const mapping of TEMPORAL_MAPPING_BY_ID_V31.values()) sourceMetadata[mapping.dimension_id] = {
    ...(sourceMetadata[mapping.dimension_id] ?? {}), source_reference_field: "cell.temporal_status",
    current_operation_verified: false, semantics: mapping.source_status_term,
    source_release_id: previous.row?.cells?.[mapping.dimension_id]?.source_release_id ?? null,
    row_unit: previous.row?.cells?.[mapping.dimension_id]?.measure ?? "retained-source-evidence-row",
    export_policy: "inherits-governed-source-policy",
  };
  return { ...previous, source_metadata: sourceMetadata, status_counts: aggregate.status_counts,
    cell_status_counts_by_dimension: Object.fromEntries(aggregate.dimensions.map((row) => [row.id, row.status_counts])),
    temporal_qualification: { ...previous.temporal_qualification,
      schema_version: "exact-zip-industry-temporal-qualification-view@3.1.0", rows,
      summary: { ...previous.temporal_qualification.summary, mapped_dimension_count: rows.length - (semanticCounts.unmapped ?? 0),
        unmapped_dimension_count: semanticCounts.unmapped ?? 0,
        source_key_count: new Set(rows.map((row) => row.source_key).filter(Boolean)).size,
        qualification_dimension_counts: qualificationCounts,
        qualification_cell_counts: Object.fromEntries(Object.entries(qualificationCounts).map(([key, value]) => [key, value * TOTAL])),
        semantic_dimension_counts: semanticCounts,
        semantic_cell_counts: Object.fromEntries(Object.entries(semanticCounts).map(([key, value]) => [key, value * TOTAL])) },
      claims: { ...previous.temporal_qualification.claims, current_operations_verified: false,
        continuous_operation_verified: false, complete_all_businesses: false } } };
}
