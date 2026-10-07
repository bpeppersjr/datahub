import { readExactZipIndustryEvidenceWithTemporalQualificationV29 as prior } from "./exact-zip-industry-temporal-qualification-v2-9.mjs";
import { readExactZipIndustryEvidenceV30 as matrix } from "./national-exact-zip-industry-evidence-matrix-v3-0-reader.mjs";
import { readExactZipIndustrySummaryV30 as summary } from "./exact-zip-industry-summary-v3-0.mjs";
import { classifyExactZipEvidenceDispositionV24 as classify } from "./exact-zip-evidence-disposition-v2-4.mjs";

const ID = "ny_retail_food_license_address_evidence_count";
const TOTAL = 48194;
const counts = (rows, key) => Object.fromEntries([...new Set(rows.map((row) => row[key]))]
  .map((value) => [value, rows.filter((row) => row[key] === value).length]));

export async function readExactZipIndustryEvidenceWithTemporalQualificationV30(options = {}) {
  const [previous, current, aggregate] = await Promise.all([prior(options), matrix(options), summary(options)]);
  const cell = current.row?.cells?.[ID];
  const raw = cell?.status ?? "outside-source-denominator";
  const qualification = { dimension_id: ID, source_key: "ny-retail-food-store-license-sites",
    source_release_id: cell?.source_release_id ?? "ny-retail-food-stores-2025-09-30-9dfbb0199594dab8",
    semantic_class: "non-active-reporting", review_qualification: "stale", source_reference_at: cell?.source_rows_updated_at ?? "2025-09-30T15:15:15.000Z",
    assessment_as_of: previous.temporal_qualification.assessment_as_of,
    publisher_status: "New York Agriculture and Markets annual licensed retail-food-store snapshot",
    source_status_term: "annual current-snapshot membership; current operation, site qualification, and occupancy remain unverified",
    publisher_jurisdiction: "New York State", current_operations_verified: false, continuous_operation_verified: false,
    site_occupancy_verified: false, public_access_verified: false, unique_business_count: null,
    coordinates_available: true, coordinates_are_verified_premises: false, address_evidence_may_not_qualify_as_physical_site: true,
    record_export_policy: "local-review-only", aggregate_export_policy: "public-under-open-ny-terms-with-attribution-and-limitations",
    evidence_disposition: { ...classify({ raw_status: raw, semantic_class: "non-active-reporting", review_qualification: "stale" }),
      continuous_operation_verified: false, site_occupancy_verified: false, public_access_verified: false } };
  const rows = [...previous.temporal_qualification.rows, qualification];
  const qualificationCounts = counts(rows, "review_qualification");
  const semanticCounts = counts(rows, "semantic_class");
  return { ...current, source_metadata: { ...previous.source_metadata, [ID]: { source_reference_field: "source_rows_updated_at",
    current_operation_verified: false, semantics: "Annual New York licensed retail-food-store address evidence; stale non-active reporting, not a physical-site or unique-business count, and nonadditive with ny_retail_food_location_profiles.",
    source_release_id: qualification.source_release_id, publisher_scope: "New York State annual license snapshot", row_unit: "source-reported license-location address evidence",
    export_policy: "local-review-only", aggregate_export_policy: qualification.aggregate_export_policy, coordinates_available: true,
    coordinates_are_verified_premises: false } }, status_counts: aggregate.status_counts,
    cell_status_counts_by_dimension: Object.fromEntries(aggregate.dimensions.map((row) => [row.id, row.status_counts])),
    temporal_qualification: { ...previous.temporal_qualification, schema_version: "exact-zip-industry-temporal-qualification-view@3.0.0", rows,
      summary: { ...previous.temporal_qualification.summary, dimension_count: 51, mapped_dimension_count: 51 - (semanticCounts.unmapped ?? 0),
        unmapped_dimension_count: semanticCounts.unmapped ?? 0, source_key_count: new Set(rows.map((row) => row.source_key).filter(Boolean)).size,
        qualification_dimension_counts: qualificationCounts, qualification_cell_counts: Object.fromEntries(Object.entries(qualificationCounts).map(([key, value]) => [key, value * TOTAL])),
        semantic_dimension_counts: semanticCounts, semantic_cell_counts: Object.fromEntries(Object.entries(semanticCounts).map(([key, value]) => [key, value * TOTAL])),
        qualification_cell_total: 2457894, semantic_cell_total: 2457894 },
      provenance: { ...previous.temporal_qualification.provenance, matrix_release_id: current.release_id, matrix_manifest_sha256: current.manifest_sha256 },
      claims: { ...previous.temporal_qualification.claims, current_operations_verified: false, continuous_operation_verified: false, complete_all_businesses: false } } };
}
