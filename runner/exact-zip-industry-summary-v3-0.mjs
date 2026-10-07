import { readExactZipIndustrySummaryV29 as prior } from "./exact-zip-industry-summary-v2-9.mjs";
import { classifyExactZipEvidenceDispositionV24 as classify } from "./exact-zip-evidence-disposition-v2-4.mjs";

const ID = "ny_retail_food_license_address_evidence_count";
const RAW = { positive: 1500, "measured-zero": 36336, "outside-source-denominator": 10358 };
const TOTAL = 48194;

export async function readExactZipIndustrySummaryV30(options = {}) {
  const previous = await prior(options);
  const joined = Object.entries(RAW).map(([raw_status, count]) => ({
    ...classify({ raw_status, semantic_class: "non-active-reporting", review_qualification: "stale" }),
    continuous_operation_verified: false, site_occupancy_verified: false, public_access_verified: false, count,
  }));
  const temporal = { source_key: "ny-retail-food-store-license-sites", source_release_id: "ny-retail-food-stores-2025-09-30-9dfbb0199594dab8",
    review_qualification: "stale", semantic_class: "non-active-reporting", source_reference_at: "2025-09-30T15:15:15.000Z",
    review_due_at: "2026-01-28T15:15:15.000Z", source_status_term: "annual current-snapshot membership; current operation, site qualification, and occupancy remain unverified",
    assessment_as_of: previous.temporal_qualification.assessment_as_of };
  const dimension = { id: ID, status_counts: { positive: 1500, "measured-zero": 36336, "outside-source-denominator": 10358, "absent-from-retained-source-rows": 0, unavailable: 0 },
    raw_status_counts: { ...RAW }, derived_evidence_status_counts: { "evidence-present": 1500, "measured-zero": 36336, "outside-source-denominator": 10358 },
    positive_zip_percent: 3.1, measured_status_percent: 78.5, evidence_disposition_counts: { total_cells: TOTAL, joined }, temporal_qualification: temporal };
  const status_counts = { ...previous.status_counts, positive: previous.status_counts.positive + 1500,
    "measured-zero": previous.status_counts["measured-zero"] + 36336,
    "outside-source-denominator": previous.status_counts["outside-source-denominator"] + 10358 };
  const lifecycle = { ...previous.evidence_disposition_counts.by_lifecycle_status,
    stale: previous.evidence_disposition_counts.by_lifecycle_status.stale + TOTAL };
  return { ...previous, schema_version: "national-exact-zip-industry-summary-view@3.0.0",
    release_id: "national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9",
    manifest_sha256: "07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7",
    source_dimensions: 51, industry_cells: 2457894, status_counts,
    raw_status_counts: { ...previous.raw_status_counts, ...Object.fromEntries(Object.entries(RAW).map(([key, value]) => [`ny-retail-food-license-address:${key}`, value])) },
    evidence_state_counts: lifecycle, evidence_disposition_counts: { total_cells: 2457894, by_cell_status: status_counts,
      by_lifecycle_status: lifecycle, joined: [...previous.evidence_disposition_counts.joined, ...joined] },
    ny_retail_food_license_address_dispositions: joined, dimensions: [...previous.dimensions, dimension],
    temporal_qualification: { ...previous.temporal_qualification,
      dimension_counts: { ...previous.temporal_qualification.dimension_counts, stale: previous.temporal_qualification.dimension_counts.stale + 1 },
      semantic_dimension_counts: { ...previous.temporal_qualification.semantic_dimension_counts,
        "non-active-reporting": previous.temporal_qualification.semantic_dimension_counts["non-active-reporting"] + 1 } },
    verification_scope: "Bounded v3.0 aggregate projection; 51-row roster; the New York annual retail-food license address layer is stale non-active reporting and is nonadditive with its location-profile dimension. Address evidence is not a physical-site, current-operation, unique-business, or completeness count. Record export remains local-review-only; aggregate use requires OPEN-NY attribution and semantic limitations." };
}
