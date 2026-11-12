import { createHash } from "node:crypto";
import { readExactZipIndustrySummaryV31 as prior } from "./exact-zip-industry-summary-v3-1.mjs";
import { classifyExactZipEvidenceDispositionV24 as classify } from "./exact-zip-evidence-disposition-v2-4.mjs";

const ID = "ny_retail_food_license_address_evidence_count";
const PROFILE_ID = "ny_retail_food_location_profiles";
const NY_SNAPSHOT_RETRIEVED_AT = "2026-11-11T23:21:47.684Z";
const OLD = { positive: 1500, "measured-zero": 36336, "outside-source-denominator": 10358 };
const NEXT = { positive: 1497, "measured-zero": 36339, "outside-source-denominator": 10358 };
const TOTAL = 48194;
const RELEASE = "national-exact-zip-industry-evidence-matrix-761d2ac95b7f954a0bd2c55039649030ce360f8c5bc6187f82c834241490b629";
const MANIFEST = "d4b2c8f50112fd16bea00769c3ac93b98b1ac2d14f334a3f9e448616931f01d1";
const REVIEW_STATUSES = ["within-review-window", "stale", "unmeasured", "unmapped"];
const SEMANTIC_CLASSES = ["source-defined-current", "non-active-reporting", "unmapped", "annual-aggregate",
  "linkage-readiness", "publisher-active-snapshot", "unknown-source-status"];

function tally(rows, key, vocabulary) {
  const counts = Object.fromEntries(vocabulary.map((value) => [value, 0]));
  for (const row of rows) {
    if (!Object.hasOwn(counts, row[key])) throw new Error(`Exact-ZIP v3.2 invalid temporal ${key}.`);
    counts[row[key]]++;
  }
  return counts;
}

function temporalProjection(dimensions) {
  const rows = dimensions.map(({ id, temporal_qualification }) => ({ dimension_id: id, ...temporal_qualification }));
  if (rows.length !== 51 || new Set(rows.map((row) => row.dimension_id)).size !== rows.length) {
    throw new Error("Exact-ZIP v3.2 temporal projection requires 51 unique dimensions.");
  }
  for (const row of rows) {
    const assessment = Date.parse(row.assessment_as_of);
    if (!Number.isFinite(assessment) || new Date(assessment).toISOString() !== row.assessment_as_of ||
        (row.source_reference_at !== null && !(Date.parse(row.source_reference_at) <= assessment))) {
      throw new Error(`Exact-ZIP v3.2 invalid assessment lineage for ${row.dimension_id}.`);
    }
  }
  const dates = [...new Set(rows.map((row) => row.assessment_as_of))].sort();
  const body = {
    schema_version: "exact-zip-industry-temporal-summary-projection@3.2.0",
    matrix_release_id: RELEASE,
    matrix_manifest_sha256: MANIFEST,
    source_dimensions: rows.length,
    retained_assessment_dimension_counts: tally(rows, "assessment_as_of", dates),
    dimension_counts: tally(rows, "review_qualification", REVIEW_STATUSES),
    semantic_dimension_counts: tally(rows, "semantic_class", SEMANTIC_CLASSES),
  };
  return { ...body, projection_sha256: createHash("sha256").update(JSON.stringify({ ...body, dimensions: rows })).digest("hex") };
}

export async function readExactZipIndustrySummaryV32(options = {}) {
  const previous = await prior(options), index = previous.dimensions.findIndex((row) => row.id === ID);
  if (index < 0) throw new Error("Exact-ZIP v3.2 New York dimension is unavailable.");
  const joined = Object.entries(NEXT).map(([raw_status, count]) => ({
    ...classify({ raw_status, semantic_class: "non-active-reporting", review_qualification: "within-review-window" }),
    continuous_operation_verified: false, site_occupancy_verified: false, public_access_verified: false, count,
  }));
  const temporal = { ...previous.dimensions[index].temporal_qualification,
    source_release_id: "ny-retail-food-stores-2026-10-14-7f9dc6f0449f76e0",
    review_qualification: "within-review-window", source_reference_at: "2026-10-14T19:08:34.000Z",
    review_due_at: "2027-02-11T19:08:34.000Z", assessment_as_of: NY_SNAPSHOT_RETRIEVED_AT };
  const dimension = { ...previous.dimensions[index], status_counts: { ...previous.dimensions[index].status_counts, ...NEXT },
    raw_status_counts: { ...NEXT }, derived_evidence_status_counts: {
      "evidence-present": NEXT.positive, "measured-zero": NEXT["measured-zero"],
      "outside-source-denominator": NEXT["outside-source-denominator"],
    }, positive_zip_percent: 3.1, measured_status_percent: 78.5,
    evidence_disposition_counts: { total_cells: TOTAL, joined }, temporal_qualification: temporal };
  const profileIndex = previous.dimensions.findIndex((row) => row.id === PROFILE_ID);
  if (profileIndex < 0) throw new Error("Exact-ZIP v3.2 New York profile dimension is unavailable.");
  const priorProfile = previous.dimensions[profileIndex], profileTemporal = {
    ...priorProfile.temporal_qualification,
    source_release_id: temporal.source_release_id,
    review_qualification: "within-review-window",
    source_reference_at: temporal.source_reference_at,
    review_due_at: temporal.review_due_at,
    assessment_as_of: NY_SNAPSHOT_RETRIEVED_AT,
  };
  const profileJoined = Object.entries(priorProfile.status_counts).map(([raw_status, count]) => {
    const disposition = classify({ raw_status, semantic_class: "non-active-reporting", review_qualification: "within-review-window" });
    return {
      cell_status: raw_status,
      lifecycle_status: disposition.lifecycle_status,
      label: disposition.label,
      current_operations_verified: false,
      count,
    };
  });
  const profile = { ...priorProfile, temporal_qualification: profileTemporal,
    evidence_disposition_counts: { total_cells: TOTAL, joined: profileJoined } };
  const dimensions = previous.dimensions.with(index, dimension).with(profileIndex, profile);
  const status_counts = { ...previous.status_counts,
    positive: previous.status_counts.positive - OLD.positive + NEXT.positive,
    "measured-zero": previous.status_counts["measured-zero"] - OLD["measured-zero"] + NEXT["measured-zero"] };
  const allJoined = dimensions.flatMap((row) => row.evidence_disposition_counts.joined);
  const lifecycle = allJoined.reduce((result, row) => { result[row.lifecycle_status] = (result[row.lifecycle_status] ?? 0) + row.count; return result; }, {});
  const raw_status_counts = { ...previous.raw_status_counts };
  for (const [key, value] of Object.entries(NEXT)) raw_status_counts[`ny-retail-food-license-address:${key}`] = value;
  return { ...previous, schema_version: "national-exact-zip-industry-summary-view@3.2.0",
    release_id: RELEASE, manifest_sha256: MANIFEST, status_counts, raw_status_counts,
    evidence_state_counts: lifecycle, evidence_disposition_counts: { total_cells: 2457894,
      by_cell_status: status_counts, by_lifecycle_status: lifecycle, joined: allJoined },
    ny_retail_food_license_address_dispositions: joined, dimensions,
    temporal_qualification: temporalProjection(dimensions),
    verification_scope: "Bounded v3.2 replacement projection over the hash-pinned 51-dimension matrix. Both New York retail-food dimensions use the same verified 2026-10-14 publisher snapshot within its review window; their overlapping counts remain nonadditive and do not establish completeness or current operation. All other dimensions are conserved. Full matrix replay performed by the registered v3.2 verifier, not this summary reader." };
}
