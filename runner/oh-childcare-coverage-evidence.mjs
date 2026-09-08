import { isDeepStrictEqual } from "node:util";
import { loadOhChildcareGeographicInput, verifyOhChildcareGeographicMembership } from "./oh-childcare-geographic-evidence.mjs";
export { validateOhChildcareGeographicEvidence } from "./oh-childcare-geographic-evidence.mjs";
export { verifyOhChildcareGeographicMembership };

export const OH_SOURCE = "oh-dcy-publisher-open-childcare-centers";
export const OH_KEY = "oh_childcare_centers";
export function emptyOhioReporting() {
  return { records: 0, with_zip: 0, without_zip: 0,
    missing_zip_reasons: { "missing-source-zip": 0, "invalid-source-zip-placeholder": 0, "invalid-source-zip-format": 0 },
    valid_points: 0, missing_points: 0, assignment_ineligible: 0, coordinate_assigned: 0, zip_inferred: false };
}
export function countOhioReporting(rows) {
  const total = emptyOhioReporting();
  for (const row of rows) {
    total.records++; total.assignment_ineligible++;
    if (row.zip_code === null) { total.without_zip++; total.missing_zip_reasons[row.evidence.zip_unavailable_reason]++; }
    else total.with_zip++;
    if (row.location.latitude === null && row.location.longitude === null) total.missing_points++;
    else total.valid_points++;
  }
  return total;
}
export function sumOhioReporting(totals) {
  const result = emptyOhioReporting();
  for (const total of totals) {
    for (const key of ["records", "with_zip", "without_zip", "valid_points", "missing_points", "assignment_ineligible", "coordinate_assigned"]) result[key] += total[key];
    for (const reason of Object.keys(result.missing_zip_reasons)) result.missing_zip_reasons[reason] += total.missing_zip_reasons[reason];
  }
  return result;
}
function check(ok, label) { if (!ok) throw new Error(`Ohio coverage rejected: ${label}.`); }
export async function loadOhioCoverageContext(declared) {
  check(declared?.publisher?.id === "national-business-registry" && declared.publisher.version === "2.15.0" && [null, "fresh", "recovered"].includes(declared.tn_childcare_origin), "registry version or Tennessee origin");
  const tn = declared.dependencies?.filter(d => d.dataset_id === "tn-dhs-active-childcare-centers") ?? [];
  check(tn.length === (declared.tn_childcare_origin === null ? 0 : 1), "Tennessee dependency roster");
  if (tn.length) check((declared.tn_childcare_origin === "fresh" ? /^tn-childcare-[a-f0-9-]{36}$/ : /^tn-childcare-recovered-[a-f0-9-]{36}$/).test(tn[0].release_id ?? ""), "Tennessee dependency origin");
  const input = await loadOhChildcareGeographicInput(declared.oh_childcare_source?.receiptPath);
  const dependencies = declared.dependencies?.filter(d => d.dataset_id === OH_SOURCE) ?? [];
  check(dependencies.length === 1 && dependencies[0].release_id === input.source.releaseId && dependencies[0].manifest_sha256 === input.source.manifestSha256
    && isDeepStrictEqual(declared.oh_childcare_source, input.source), "retained app dependency");
  const total = countOhioReporting(input.rows), c = declared.coverage;
  check(c?.oh_childcare_center_sites === total.records && c.oh_childcare_center_sites_with_zip === total.with_zip
    && c.oh_childcare_center_sites_without_zip === total.without_zip && isDeepStrictEqual(c.oh_childcare_missing_zip_reasons, input.quality.zip_unavailable_reasons), "registry counts");
  return { input, total, dependency: dependencies[0] };
}
export function ohioCoverageGaps(total, lineage) {
  const base = { schema_version: "1.0.0", view_type: "coverage-gap", scope_type: "source", scope_id: OH_KEY, status: "open", severity: "declared-limitation", lineage };
  return [
    ...(total.without_zip ? [{ ...base, gap_id: "gap:oh-childcare-source-zip-unavailable", gap_type: "reporting-source-zip-unavailable",
      evidence: { source_id: OH_SOURCE, record_count: total.without_zip, reasons: total.missing_zip_reasons, zip_inferred: false },
      consequence: "Retained in source and reported-state totals. No ZIP, county or ZCTA assignment is inferred from coordinates." }] : []),
    ...(total.records ? [{ ...base, gap_id: "gap:oh-childcare-geographic-assignment-ineligible", gap_type: "reporting-geographic-assignment-ineligible",
      evidence: { source_id: OH_SOURCE, record_count: total.records, valid_points: total.valid_points, missing_points: total.missing_points, governed_geographic_assignment_eligible: false },
      consequence: "Publisher coordinates are retained; the source contract does not permit governed county/ZCTA assignment. Valid points are not mislabeled as missing." }] : []),
  ];
}

/** Source-derived checks supplement generic coverage conservation. The caller
 * must checksum the exact view bytes and retained registry declaration consumed. */
export async function verifyOhioCoverageViews({ context, manifest, views, profileSummary }) {
  const { input, total } = context, c = manifest.coverage;
  check(isDeepStrictEqual(manifest.oh_childcare_source, input.source) && isDeepStrictEqual(c.oh_childcare_reporting, total)
    && c.oh_childcare_coordinate_assigned === 0 && c.oh_childcare_without_county_assignment === total.records, "manifest accounting or app lineage");
  const states = views.states.filter(row => row.postal_abbreviation === "OH");
  check(states.length === 1 && states[0].state_fips === "39", "Ohio state geography");
  for (const row of views.states) {
    const expected = row.state_fips === "39" ? total : emptyOhioReporting(), e = row.registry_evidence;
    check(isDeepStrictEqual(e.oh_childcare_reporting, expected) && (e.source_profile_counts_by_reported_address_state[OH_SOURCE] ?? 0) === expected.records
      && (e.source_profile_counts_by_coordinate_assigned_state[OH_SOURCE] ?? 0) === 0, "reported-state accounting");
  }
  for (const row of views.counties) check(isDeepStrictEqual(row.registry_evidence.oh_childcare_reporting, emptyOhioReporting())
    && (row.registry_evidence.source_profile_counts[OH_SOURCE] ?? 0) === 0, "prohibited county assignment");
  const byZip = new Map();
  for (const row of input.rows) if (row.zip_code !== null) byZip.set(row.zip_code, (byZip.get(row.zip_code) ?? 0) + 1);
  let zipCount = 0;
  for (const row of views.zips) {
    const count = byZip.get(row.zip_code) ?? 0;
    check(row.registry_coverage.oh_childcare_center_site_count === count && (row.source_contributions?.[OH_KEY]?.reported_center_count ?? 0) === count, "source ZIP accounting"); zipCount += count;
    const contribution = row.source_contributions?.[OH_KEY];
    if (contribution) check(contribution.source_release_id === input.source.sourceReleaseId && contribution.observed_at === input.source.observedAt
      && contribution.record_level_distribution === "local-review-only" && contribution.active_business_verified === false, "source ZIP provenance or policy");
  }
  check(zipCount === total.with_zip, "source ZIP membership");
  const sources = views.sources.filter(row => row.source_key === OH_KEY || row.profile_source_id === OH_SOURCE);
  check(sources.length === 1, "source summary membership");
  const source = sources[0], p = source.location_profile_geography;
  check(source.source_key === OH_KEY && source.profile_source_id === OH_SOURCE && isDeepStrictEqual(source.oh_childcare_reporting, total)
    && isDeepStrictEqual(source.source_manifest, context.dependency) && source.identity_matching_eligible === false && source.export_policy === "local-review-only"
    && source.governed_geographic_assignment_eligible === false && source.zip_level_counts.reported_center_count === total.with_zip
    && p.profile_count === total.records && p.reporting_only_count === total.records && p.matching_profile_count === 0
    && p.coordinate_missing_count === total.missing_points && p.coordinate_present_valid_count === total.valid_points
    && p.coordinate_assignment_ineligible_count === total.records && p.coordinate_assigned_single_count === 0
    && p.reporting_only_coordinate_assigned_count === 0 && p.coordinate_invalid_count === 0
    && p.coordinate_unmatched_count === 0 && p.coordinate_ambiguous_boundary_count === 0, "source geography accounting");
  for (const row of views.national) check(isDeepStrictEqual(row.oh_childcare_reporting ?? row.registry_evidence?.oh_childcare_reporting, total), "national source accounting");
  check(profileSummary.coordinate_assignment_ineligible_count === total.records, "global assignment-ineligible accounting");
  const stats = profileSummary.source_stats.filter(row => row.source_id === OH_SOURCE);
  check(stats.length === 1 && stats[0].profile_count === total.records && stats[0].coordinate_present_valid_count === total.valid_points
    && stats[0].coordinate_missing_count === total.missing_points && stats[0].coordinate_assignment_ineligible_count === total.records
    && stats[0].coordinate_assigned_single_count === 0 && stats[0].matching_profile_count === 0 && stats[0].reporting_only_count === total.records, "profile source summary");
  const expectedGaps = ohioCoverageGaps(total, views.national[0].lineage);
  const gaps = views.gaps.filter(row => row.scope_id === OH_KEY || row.evidence?.source_id === OH_SOURCE);
  // Generic coordinate-missing gaps remain separate from explicit Ohio gaps.
  for (const expected of expectedGaps) check(gaps.filter(row => row.gap_id === expected.gap_id && isDeepStrictEqual(row, expected)).length === 1, "missing or altered source gap");
  check(gaps.filter(row => row.gap_id.startsWith("gap:oh-childcare-")).length === expectedGaps.length, "unexpected source gap");
  await verifyOhChildcareGeographicMembership(input.rows, input.verificationContext);
}
