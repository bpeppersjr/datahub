"use client";

import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

const CELL_STATUSES = [
  "positive",
  "measured-zero",
  "outside-source-denominator",
  "absent-from-retained-source-rows",
  "unavailable",
] as const;
const LIFECYCLE_STATUSES = [
  "source-defined-current-positive-within-review-window",
  "source-defined-current-without-positive-evidence",
  "non-active-reporting-positive",
  "non-active-reporting-without-positive-evidence",
  "stale",
  "unmeasured",
  "unmapped",
] as const;
type Counts = Record<string, number>;
type Dimension = {
  source_id: string;
  zip5_rows: number;
  count_sum: number;
  by_cell_status: Counts;
  by_lifecycle_status: Counts;
  joined: {
    cell_total: number;
    by_cell_status_and_lifecycle: Counts;
  };
};
type View = {
  schema_version: "state-exact-zip-industry-evidence-disposition@1.0.0";
  status: "present";
  release_id: string;
  manifest_sha256: string;
  source_bytes_read: number;
  full_matrix_replay_performed: false;
  scope_id: string;
  geography_scope_counts: {
    state: number;
    territory: number;
    "multi-state-material": number;
    "zcta-overlay-unresolved": number;
    "non-zcta-unassigned": number;
    "explicit-placeholder": number;
  };
  row: {
    scope_id: string;
    scope_label: string;
    state_geo_id: string;
    state_fips: string;
    state_name: string;
    postal_abbreviation: string;
    zip5_rows: number;
    zcta_linked_zip5_rows: number;
    dimensions: Record<string, Dimension>;
  };
  claims: {
    polygon_area_only_not_business_location: true;
    usps_zip_state_assignment: false;
    fractional_allocation: false;
    current_operation_verified: false;
    additive_cross_industry_total: false;
    network_requests: 0;
    current_pointer_written: false;
    production_enrollment: false;
  };
};

const count = (value: number) => value.toLocaleString("en-US");
const keysExactly = (value: object, expected: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...expected].sort().join("|");
const validCounts = (value: unknown, expected: readonly string[], total: number) =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  keysExactly(value, expected) &&
  Object.values(value).every((item) => Number.isSafeInteger(item) && (item as number) >= 0) &&
  Object.values(value).reduce<number>((sum, item) => sum + (item as number), 0) === total;

export function validStateExactZipEvidence(value: unknown, state: string): value is View {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const view = value as Partial<View>;
  if (!keysExactly(view, ["schema_version", "status", "scope_id", "scope_label", "row", "geography_scope_counts", "release_id", "manifest_sha256", "source_bytes_read", "full_matrix_replay_performed", "claims"]) ||
    view.schema_version !== "state-exact-zip-industry-evidence-disposition@1.0.0" || view.status !== "present" || typeof view.release_id !== "string" || !view.release_id.startsWith("state-exact-zip-industry-evidence-disposition-") ||
    view.full_matrix_replay_performed !== false || !/^[a-f0-9]{64}$/.test(view.manifest_sha256 ?? "") ||
    !Number.isSafeInteger((view as {source_bytes_read?: number}).source_bytes_read) || ((view as {source_bytes_read?: number}).source_bytes_read ?? 0) <= 0 ||
    view.scope_id !== `state:${state}` || !view.row || !keysExactly(view.row, ["scope_id", "scope_label", "state_geo_id", "state_fips", "state_name", "postal_abbreviation", "zip5_rows", "zcta_linked_zip5_rows", "dimensions"]) || view.row.scope_id !== view.scope_id || view.row.postal_abbreviation !== state ||
    !Number.isSafeInteger(view.row.zip5_rows) || (view.row.zip5_rows ?? -1) < 0 ||
    !view.claims || !keysExactly(view.claims, ["polygon_area_only_not_business_location", "usps_zip_state_assignment", "fractional_allocation", "current_operation_verified", "additive_cross_industry_total", "network_requests", "current_pointer_written", "production_enrollment"]) ||
    view.claims.usps_zip_state_assignment !== false || view.claims.fractional_allocation !== false ||
    view.claims.network_requests !== 0 || view.claims.current_pointer_written !== false || view.claims.production_enrollment !== false || view.claims.current_operation_verified !== false ||
    view.claims.additive_cross_industry_total !== false || view.claims.polygon_area_only_not_business_location !== true ||
    !view.geography_scope_counts || !keysExactly(view.geography_scope_counts, ["state", "territory", "multi-state-material", "zcta-overlay-unresolved", "non-zcta-unassigned", "explicit-placeholder"])) return false;
  const scopes = Object.values(view.geography_scope_counts);
  if (!scopes.every((item) => Number.isSafeInteger(item) && item >= 0) || scopes.reduce((sum, item) => sum + item, 0) !== 48_194) return false;
  const dimensions = Object.values(view.row.dimensions ?? {});
  if (dimensions.length !== 39 || new Set(dimensions.map((item) => item.source_id)).size !== 39) return false;
  return dimensions.every((item) => {
    const joinedKeys = CELL_STATUSES.flatMap((cell) => LIFECYCLE_STATUSES.map((lifecycle) => `${cell}|${lifecycle}`));
    return keysExactly(item, ["source_id", "zip5_rows", "count_sum", "by_cell_status", "by_lifecycle_status", "joined"]) && keysExactly(item.joined, ["cell_total", "numeric_cell_count", "null_cell_count", "evidence_count", "by_cell_status_and_lifecycle"]) && item.zip5_rows === view.row!.zip5_rows && item.joined.cell_total === item.zip5_rows &&
      validCounts(item.by_cell_status, CELL_STATUSES, item.zip5_rows) &&
      validCounts(item.by_lifecycle_status, LIFECYCLE_STATUSES, item.zip5_rows) &&
      validCounts(item.joined.by_cell_status_and_lifecycle, joinedKeys, item.zip5_rows) &&
      CELL_STATUSES.every((cell) => LIFECYCLE_STATUSES.reduce((sum, lifecycle) => sum + item.joined.by_cell_status_and_lifecycle[`${cell}|${lifecycle}`], 0) === item.by_cell_status[cell]) &&
      LIFECYCLE_STATUSES.every((lifecycle) => CELL_STATUSES.reduce((sum, cell) => sum + item.joined.by_cell_status_and_lifecycle[`${cell}|${lifecycle}`], 0) === item.by_lifecycle_status[lifecycle]);
  });
}

export default function StateExactZipEvidencePanel({ state }: { state: string }) {
  const [result, setResult] = useState<{ state: string; view: View | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!state) return;
    const controller = new AbortController(), requested = state;
    void runnerJson<unknown>(`/api/business-map/state-exact-zip-industry-evidence?state=${encodeURIComponent(state)}`, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setResult({ state: requested, view: validStateExactZipEvidence(value, requested) ? value : null, failed: !validStateExactZipEvidence(value, requested) }); })
      .catch((reason) => { if (!controller.signal.aborted && reason?.name !== "AbortError") setResult({ state: requested, view: null, failed: true }); });
    return () => controller.abort();
  }, [state]);
  if (!state) return <section className="supporting-evidence" aria-label="State exact ZIP industry evidence"><h3>State exact-ZIP evidence</h3><p>Select a state to inspect its governed 39-dimension evidence cells.</p></section>;
  if (!result || result.state !== state) return <p role="status">Loading state exact-ZIP evidence…</p>;
  if (result.failed || !result.view) return <p role="alert">State exact-ZIP evidence is unavailable; no ZIP assignment, evidence count, or completion was inferred.</p>;
  const view = result.view, dimensions = Object.values(view.row.dimensions), statuses = Object.fromEntries(CELL_STATUSES.map((status) => [status, dimensions.reduce((sum, row) => sum + row.by_cell_status[status], 0)]));
  return <section className="supporting-evidence" aria-label="State exact ZIP industry evidence">
    <h3>{view.row.state_name} exact-ZIP source evidence</h3>
    <p><strong>{count(view.row.zip5_rows)}</strong> same-code Census ZCTA keys × <strong>39</strong> retained source dimensions = <strong>{count(view.row.zip5_rows * 39)}</strong> source-specific evidence cells.</p>
    <p>Positive: {count(statuses.positive)} · measured zero: {count(statuses["measured-zero"])} · outside source denominator: {count(statuses["outside-source-denominator"])} · absent from retained source rows: {count(statuses["absent-from-retained-source-rows"])} · unavailable: {count(statuses.unavailable)}.</p>
    <details><summary>All 39 source dimensions and joined dispositions</summary><div className="representation-table" role="region" aria-label={`${state} exact ZIP source dimensions`} tabIndex={0}><table><thead><tr><th>Source dimension</th><th>Positive</th><th>Measured zero</th><th>Source-defined current</th><th>Non-active reporting</th><th>Stale / unmeasured / unmapped</th><th>Joined cell status × lifecycle</th></tr></thead><tbody>{dimensions.map((row) => <tr key={row.source_id}><th scope="row">{row.source_id}</th><td>{count(row.by_cell_status.positive)}</td><td>{count(row.by_cell_status["measured-zero"])}</td><td>{count(row.by_lifecycle_status["source-defined-current-positive-within-review-window"] + row.by_lifecycle_status["source-defined-current-without-positive-evidence"])}</td><td>{count(row.by_lifecycle_status["non-active-reporting-positive"] + row.by_lifecycle_status["non-active-reporting-without-positive-evidence"])}</td><td>{count(row.by_lifecycle_status.stale + row.by_lifecycle_status.unmeasured + row.by_lifecycle_status.unmapped)}</td><td>{Object.entries(row.joined.by_cell_status_and_lifecycle).filter(([, value]) => value > 0).map(([key, value]) => `${key.replace("|", " / ")}: ${count(value)}`).join(" · ")}</td></tr>)}</tbody></table></div></details>
    <p><strong>National keys intentionally not assigned to a state:</strong> {count(view.geography_scope_counts["multi-state-material"])} material multi-state ZCTAs · {count(view.geography_scope_counts["zcta-overlay-unresolved"])} unresolved ZCTA overlays · {count(view.geography_scope_counts["non-zcta-unassigned"])} non-ZCTA keys · {count(view.geography_scope_counts["explicit-placeholder"])} explicit placeholder. Territories ({count(view.geography_scope_counts.territory)}) remain separate.</p>
    <p className="operations-note">This panel is independent of the 8/11-dataset availability denominator. Counts describe retained source evidence cells, not businesses, all-business completeness, or verified current operation. State assignment requires a complete, non-material-crossing Census ZCTA overlay and is polygon-area-only—not a business-location inference. Source dimensions overlap and are not additive.</p>
  </section>;
}
