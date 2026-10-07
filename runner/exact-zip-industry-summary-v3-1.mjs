import { readExactZipIndustrySummaryV30 as prior } from "./exact-zip-industry-summary-v3-0.mjs";
import { classifyExactZipEvidenceDispositionV24 as classify } from "./exact-zip-evidence-disposition-v2-4.mjs";
import { TEMPORAL_MAPPING_BY_ID_V31 } from "./exact-zip-industry-temporal-mappings-v3-1.mjs";

const TOTAL = 48194;
const countBy = (rows, key) => rows.reduce((result, row) => {
  result[row[key]] = (result[row[key]] ?? 0) + row.count;
  return result;
}, {});
const countDimensions = (rows, key, vocabulary) => rows.reduce((result, row) => {
  const value = row.temporal_qualification[key];
  result[value] = (result[value] ?? 0) + 1;
  return result;
}, Object.fromEntries(vocabulary.map((value) => [value, 0])));

export async function readExactZipIndustrySummaryV31(options = {}) {
  const previous = await prior(options);
  const dimensions = previous.dimensions.map((dimension) => {
    const mapping = TEMPORAL_MAPPING_BY_ID_V31.get(dimension.id);
    if (!mapping) return dimension;
    const joined = Object.entries(dimension.status_counts).map(([raw_status, count]) => ({
      ...classify({ raw_status, semantic_class: "non-active-reporting", review_qualification: "unmeasured" }),
      count,
    }));
    const priorTemporal = dimension.temporal_qualification;
    return { ...dimension, evidence_disposition_counts: { total_cells: TOTAL, joined }, temporal_qualification: {
      ...priorTemporal, source_key: mapping.source_key, source_release_id: priorTemporal.source_release_id,
      review_qualification: "unmeasured", semantic_class: "non-active-reporting",
      source_status_term: mapping.source_status_term,
    } };
  });
  const joined = dimensions.flatMap((dimension) => dimension.evidence_disposition_counts.joined);
  const lifecycle = countBy(joined, "lifecycle_status");
  const dimensionCounts = countDimensions(dimensions, "review_qualification", Object.keys(previous.temporal_qualification.dimension_counts));
  const semanticCounts = countDimensions(dimensions, "semantic_class", Object.keys(previous.temporal_qualification.semantic_dimension_counts));
  return { ...previous, schema_version: "national-exact-zip-industry-summary-view@3.1.0", dimensions,
    evidence_state_counts: lifecycle,
    evidence_disposition_counts: { ...previous.evidence_disposition_counts, by_lifecycle_status: lifecycle, joined },
    temporal_qualification: { ...previous.temporal_qualification, dimension_counts: dimensionCounts, semantic_dimension_counts: semanticCounts },
    verification_scope: "Bounded v3.1 temporal/provenance projection over the unchanged hash-pinned v3.0 matrix. Ten retained CMS, childcare, and Minnesota credential dimensions now carry explicit non-active-reporting semantics instead of unmapped placeholders. Counts and cell states are unchanged; current operation, unique business identity, nationwide completeness, and additivity remain unverified." };
}
