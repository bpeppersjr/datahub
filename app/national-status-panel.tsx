"use client";
import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";
import { validNationalStatus } from "./national-status-validation.mjs";

type Temporal = {
  source_key: string | null;
  source_release_id: string | null;
  source_reference_at: string | null;
  review_due_at: string | null;
  review_qualification: string;
  semantic_class: string;
  source_status_term: string | null;
};
type Metric = {
  industry: string;
  mapped_dimensions: number;
  measured_zip_dimension_cells: number;
  zip_dimension_cell_denominator: number;
  exact_zip_measurement_reach_percent: number | null;
};
type Dimension = {
  id: string;
  evidence_status?: string;
  temporal_qualification: Temporal | null;
};
type Industry = {
  id: string;
  dimension_evidence_availability_percent: number | null;
  dimensions_with_retained_evidence: number;
  mapped_dimensions: number;
  measured_zip_dimension_cells: number;
  zip_dimension_cell_denominator: number;
  exact_zip_measurement_reach_percent: number | null;
  dimensions: Dimension[];
};
type View = {
  kind: string;
  zip5_cohort_rows: number;
  source_dimensions: number;
  matrix_evidence_cells: number;
  state_industry_rows: number;
  temporal_assessment: {
    retained_assessment_dimension_counts: Record<string, number>;
    dimension_counts: Record<string, number>;
    projection_sha256: string;
  };
  gaps: Record<string, number>;
  geography_scope_counts: Record<string, number>;
  industry_evidence_metrics: Metric[];
  territories: { code: string; zip5_rows: number }[];
  geography_relationship_quality: {
    profile_count: number;
    postal_relationship_counts: Record<string, number>;
    point_relationship_counts: Record<string, number>;
    reported_state_conflict_count: number;
  };
  source_policy_provenance: {
    source_count: number;
    profile_count: number;
    export_profile_counts: Record<string, number>;
    assessment_as_of: string;
    policy_coverage: { covered_sources: number; total_sources: number };
  };
  publisher_membership_reconciliation: {
    source_rows: number;
    normalized_profiles: number;
    quarantined_rows: number;
    quarantine_reasons: {
      invalid_or_unmapped_zip: number;
      missing_address: number;
    };
    publisher_assertion: string;
    row_status: null;
    lifecycle_evidence: string;
    active_business_eligible_count: number;
    current_operations_verified: boolean;
    active_business_count: null;
    completeness_percentage: null;
  };
  state_registration_license_supplemental: {
    summary: {
      zip5_rows: number;
      positive_zip5_rows: number;
      zero_zip5_rows: number;
      geography_disposition_scope_rows: number;
      issuer_state_marginal_rows: number;
      dimension_rows: number;
      evidence_class_rows: number;
      source_address_row_count: number;
      eligible_address_membership_count: number;
      missing_or_ineligible_address_membership_count: number;
    };
    scope: string;
  };
  irs_eo_supplemental: {
    summary: {
      zip5_rows: number;
      positive_zip5_rows: number;
      organization_membership_count: number;
      geography_disposition_scope_rows: number;
      reported_filing_address_jurisdiction_rows: number;
      evidence_kind: string;
      industry: string;
      review_status: string;
    };
    review: {
      source_posting_date: string;
      assessment_as_of: string;
      refresh_context: { status: string; records_downloaded: number };
    };
    scope: string;
  };
  lifecycle_industry_zip: {
    summary: {
      zip5_rows: number;
      positive_zip5_rows: number;
      zero_profile_zip5_rows: number;
      source_membership_count: number;
      mapped_source_record_union_count: number;
      unresolved_source_record_count: number;
      industry_assignment_count: number;
      epa_refinement: {
        source_record_count: number;
        segment_assignments: number;
        multisegment_records: number;
        records_partially_unmapped: number;
      };
    };
    scope: string;
  };
  lifecycle_industry_jurisdiction: {
    scope_kind?: string;
    postal_abbreviation?: string;
    source_membership_count?: number;
    mapped_source_record_union_count?: number;
    unresolved_source_record_count?: number;
    industry_assignment_count?: number;
    industries?: { industry_id: string; source_assignment_count: number }[];
  };
  industries: Industry[];
  zip5: string;
  zip4: null;
  found: boolean;
  cohort_classification: string;
  zcta_geoid: string | null;
  geography_scope: string;
  dimensions: Dimension[];
  provenance: {
    release_id: string;
    manifest_sha256: string;
    created_at: string;
  };
};
const n = (v: number) => v.toLocaleString("en-US");
const label = (v: string) => v.replaceAll("-", " ").replaceAll("_", " ");
const reach = (v: number | null) =>
  v === null ? "Unmeasured" : `${v.toFixed(1)}%`;
function useNationalView(kind: string, selector: string | null) {
  const key = `${kind}:${selector ?? ""}`,
    [result, setResult] = useState<{
      key: string;
      view: View | null;
      failed: boolean;
    } | null>(null);
  useEffect(() => {
    if (kind !== "summary" && !selector) return;
    const controller = new AbortController(),
      query =
        kind === "summary"
          ? ""
          : `?${kind === "state" ? "state" : "zip"}=${encodeURIComponent(selector ?? "")}`;
    void runnerJson<unknown>(
      `/api/business-map/national-status-${kind}${query}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted)
          setResult(
            validNationalStatus(value, selector)
              ? { key, view: value as View, failed: false }
              : { key, view: null, failed: true },
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ key, view: null, failed: true });
      });
    return () => controller.abort();
  }, [kind, selector, key]);
  return result?.key === key ? result : null;
}
export function NationalStatusPanel({ state }: { state: string }) {
  const summary = useNationalView("summary", null),
    selected = useNationalView("state", state || null);
  const [zipInput, setZipInput] = useState(""),
    [zip, setZip] = useState<string | null>(null),
    detail = useNationalView("zip", zip);
  const view = summary?.view;
  return (
    <section className="supporting-evidence" aria-label="National Status">
      <h4>National Status</h4>
      <p>
        Retained nationwide evidence, geography and source review status.
        Percentages measure evidence reach in the governed Census ZCTA cohort;
        business completeness is unmeasured.
      </p>
      {summary?.failed ? (
        <p role="alert">
          Verified National Status is unavailable. Existing Industry Status
          remains available.
        </p>
      ) : !view ? (
        <p role="status">Verifying national evidence…</p>
      ) : (
        <>
          <p>
            <strong>{n(view.zip5_cohort_rows)} ZIP5 cohort keys</strong> ·{" "}
            {n(view.source_dimensions)} source dimensions ·{" "}
            {n(view.matrix_evidence_cells)} evidence cells ·{" "}
            {n(view.state_industry_rows)} state/industry rows
          </p>
          <p>
            At the retained review dates,{" "}
            {n(
              view.temporal_assessment.dimension_counts["within-review-window"],
            )}{" "}
            within review window · {n(view.gaps.stale_temporal_dimensions)}{" "}
            stale · {n(view.gaps.unmeasured_temporal_dimensions)} unmeasured.
            Review dates:{" "}
            {Object.entries(
              view.temporal_assessment.retained_assessment_dimension_counts,
            )
              .map(
                ([date, dimensions]) =>
                  date.slice(0, 10) + " (" + dimensions + " dimensions)",
              )
              .join(" · ")}
            .
          </p>
          <p>
            {n(view.gaps.broad_business_missing_states)} states/DC awaiting
            broad organization evidence ·{" "}
            {n(view.gaps.unsupported_industry_access_cells)} unsupported
            industry access cells ·{" "}
            {n(view.gaps.unmeasured_industry_access_cells)} unmeasured access
            cells · {n(view.gaps.restricted_sample_industry_access_cells)}{" "}
            restricted query sample (not statewide coverage).
          </p>
          <details>
            <summary>Registry geography relationship quality</summary>
            <p>
              <strong>
                {n(view.geography_relationship_quality.profile_count)} matching
                profiles
              </strong>{" "}
              ·{" "}
              {n(
                view.geography_relationship_quality.postal_relationship_counts[
                  "same-code-zcta-candidate"
                ],
              )}{" "}
              same-code ZCTA candidates ·{" "}
              {n(
                view.geography_relationship_quality.postal_relationship_counts[
                  "outside-zcta"
                ],
              )}{" "}
              outside ZCTA ·{" "}
              {n(
                view.geography_relationship_quality.point_relationship_counts[
                  "assigned-single-county"
                ],
              )}{" "}
              retained single-county point relationships ·{" "}
              {n(
                view.geography_relationship_quality.point_relationship_counts[
                  "missing-geocode"
                ],
              )}{" "}
              missing geocode ·{" "}
              {n(
                view.geography_relationship_quality
                  .reported_state_conflict_count,
              )}{" "}
              reported-state conflicts.
            </p>
            <p>
              Aggregate relationship quality only; not a numerator, denominator,
              unique-business count, USPS-validity, current-operation,
              geocode-verification or completeness measure.
            </p>
          </details>
          <details>
            <summary>IRS tax-exempt supplemental evidence</summary>
            <p>
              <strong>
                {n(view.irs_eo_supplemental.summary.organization_membership_count)}{" "}
                filing-address organization memberships
              </strong>{" "}
              across {n(view.irs_eo_supplemental.summary.positive_zip5_rows)} positive
              ZIPs, {n(view.irs_eo_supplemental.summary.geography_disposition_scope_rows)}{" "}
              geography scopes and{" "}
              {n(
                view.irs_eo_supplemental.summary
                  .reported_filing_address_jurisdiction_rows,
              )}{" "}
              separately reported filing-address jurisdictions.
            </p>
            <p>
              {view.irs_eo_supplemental.scope} Source posting{" "}
              {view.irs_eo_supplemental.review.source_posting_date}; assessed{" "}
              {view.irs_eo_supplemental.review.assessment_as_of}. Counts are not
              unique businesses, verified current operations, completeness, or
              additive to business or industry totals.
            </p>
          </details>
          <details>
            <summary>Lifecycle by operational industry</summary>
            <p>
              <strong>
                {n(view.lifecycle_industry_zip.summary.source_membership_count)}{" "}
                source-relative lifecycle memberships
              </strong>{" "}
              across {n(view.lifecycle_industry_zip.summary.positive_zip5_rows)} positive
              ZIPs and {n(view.lifecycle_industry_zip.summary.zero_profile_zip5_rows)}{" "}
              governed zero-profile ZIPs. The mapped source-record union is{" "}
              {n(view.lifecycle_industry_zip.summary.mapped_source_record_union_count)};
              unresolved source records are{" "}
              {n(view.lifecycle_industry_zip.summary.unresolved_source_record_count)};
              nonadditive industry assignments are{" "}
              {n(view.lifecycle_industry_zip.summary.industry_assignment_count)}.
            </p>
            <p>
              {view.lifecycle_industry_zip.scope} EPA refinement retains{" "}
              {n(view.lifecycle_industry_zip.summary.epa_refinement.segment_assignments)}
              segment assignments, including{" "}
              {n(view.lifecycle_industry_zip.summary.epa_refinement.multisegment_records)}
              multisegment records and{" "}
              {n(
                view.lifecycle_industry_zip.summary.epa_refinement
                  .records_partially_unmapped,
              )}{" "}
              partially unmapped records.
            </p>
          </details>
          <details>
            <summary>Source policy provenance</summary>
            <p>
              <strong>
                {n(view.source_policy_provenance.source_count)} governed sources
              </strong>{" "}
              · {n(view.source_policy_provenance.profile_count)} profiles ·{" "}
              {n(view.source_policy_provenance.export_profile_counts.public)}{" "}
              public ·{" "}
              {n(
                view.source_policy_provenance.export_profile_counts[
                  "local-review-only"
                ],
              )}{" "}
              local-review-only · policy coverage{" "}
              {view.source_policy_provenance.policy_coverage.covered_sources}/
              {view.source_policy_provenance.policy_coverage.total_sources}.
            </p>
            <p>
              Assessed {view.source_policy_provenance.assessment_as_of}. This is
              provenance only: it grants no authorization, performs no
              acquisition, verifies no current operation, and does not override
              field-level export policy.
            </p>
          </details>
          <details>
            <summary>Los Angeles publisher membership reconciliation</summary>
            <p>
              <strong>
                {n(view.publisher_membership_reconciliation.source_rows)}{" "}
                publisher rows
              </strong>{" "}
              reconcile to{" "}
              {n(view.publisher_membership_reconciliation.normalized_profiles)}{" "}
              profiles plus{" "}
              {n(view.publisher_membership_reconciliation.quarantined_rows)}{" "}
              quarantined rows (
              {n(
                view.publisher_membership_reconciliation.quarantine_reasons
                  .invalid_or_unmapped_zip,
              )}{" "}
              invalid or unmapped ZIP;{" "}
              {n(
                view.publisher_membership_reconciliation.quarantine_reasons
                  .missing_address,
              )}{" "}
              missing address).
            </p>
            <p>
              Publisher assertion: active-list membership without row status.
              Row status is null; lifecycle evidence is unknown; active-eligible
              count is 0. Current operation is not verified, and active-business
              count and completeness remain unmeasured. Source classification
              counts are not profile counts.
            </p>
          </details>
          <details>
            <summary>Registration and license supplemental evidence</summary>
            <p>
              <strong>
                {n(
                  view.state_registration_license_supplemental.summary
                    .eligible_address_membership_count,
                )}{" "}
                governed address memberships
              </strong>{" "}
              across{" "}
              {n(
                view.state_registration_license_supplemental.summary
                  .positive_zip5_rows,
              )}{" "}
              positive ZIPs,{" "}
              {n(
                view.state_registration_license_supplemental.summary
                  .geography_disposition_scope_rows,
              )}{" "}
              geography scopes,{" "}
              {n(
                view.state_registration_license_supplemental.summary
                  .issuer_state_marginal_rows,
              )}{" "}
              issuers,{" "}
              {n(
                view.state_registration_license_supplemental.summary
                  .dimension_rows,
              )}{" "}
              dimensions and{" "}
              {n(
                view.state_registration_license_supplemental.summary
                  .evidence_class_rows,
              )}{" "}
              evidence classes.
            </p>
            <p>
              {view.state_registration_license_supplemental.scope} Counts are
              not unique businesses, verified current operations, an
              all-business denominator, or additive to federation percentages.
            </p>
          </details>
          <details>
            <summary>National industry evidence reach</summary>
            <div className="state-industry-progress">
              {view.industry_evidence_metrics.map((row) => (
                <div key={row.industry}>
                  <span>{label(row.industry)}</span>
                  <strong>
                    {reach(row.exact_zip_measurement_reach_percent)}
                  </strong>
                  <small>
                    {n(row.measured_zip_dimension_cells)} /{" "}
                    {n(row.zip_dimension_cell_denominator)}{" "}
                    ZIP5-by-source-dimension cells
                  </small>
                </div>
              ))}
            </div>
          </details>
          <details>
            <summary>Geography and separate territories</summary>
            <p>
              33,455 dominant-state ZCTA keys ·{" "}
              {n(view.geography_scope_counts["non-zcta-unassigned"])} non-ZCTA
              keys · {n(view.geography_scope_counts["multi-state-material"])}{" "}
              material cross-state ZCTAs ·{" "}
              {n(view.geography_scope_counts["zcta-overlay-unresolved"])}{" "}
              unresolved overlays ·{" "}
              {n(view.geography_scope_counts["explicit-placeholder"])}{" "}
              placeholder. These scopes remain visible without blocking the map.
            </p>
            <p>
              Territories, outside state percentages:{" "}
              {view.territories
                .map((row) => `${row.code} ${n(row.zip5_rows)} ZIP5 keys`)
                .join(" · ")}
            </p>
          </details>
          <details>
            <summary>Release provenance</summary>
            <p>{view.provenance.release_id}</p>
            <p>
              Manifest SHA-256: <code>{view.provenance.manifest_sha256}</code>
            </p>
            <p>
              Retained {view.provenance.created_at}. Source dates are available
              in state and ZIP detail.
            </p>
            <p>
              Temporal projection SHA-256{" "}
              <code>{view.temporal_assessment.projection_sha256}</code>
            </p>
          </details>
        </>
      )}
      {state ? (
        <details>
          <summary>{state} · nine industry status rows</summary>
          {selected?.failed ? (
            <p role="alert">
              Selected-state National Status is unavailable; evidence reach
              remains unknown.
            </p>
          ) : !selected?.view ? (
            <p role="status">Verifying {state} evidence…</p>
          ) : (
            <div className="state-industry-progress">
              {selected.view.industries.map((row) => (
                <div key={row.id}>
                  <span>{label(row.id)}</span>
                  <strong>
                    {reach(row.exact_zip_measurement_reach_percent)} evidence
                    reach
                  </strong>
                  <small>
                    {n(row.measured_zip_dimension_cells)} /{" "}
                    {n(row.zip_dimension_cell_denominator)} evidence cells ·{" "}
                    {reach(row.dimension_evidence_availability_percent)}{" "}
                    dimension availability (
                    {row.dimensions_with_retained_evidence}/
                    {row.mapped_dimensions})
                  </small>
                  <details>
                    <summary>Source dimensions and temporal status</summary>
                    {row.dimensions.map((d) => (
                      <p key={d.id}>
                        {label(d.id)} ·{" "}
                        {label(
                          d.temporal_qualification?.review_qualification ??
                            "unmeasured",
                        )}{" "}
                        ·{" "}
                        {label(
                          d.temporal_qualification?.semantic_class ??
                            "unmapped",
                        )}
                        <br />
                        Release:{" "}
                        {d.temporal_qualification?.source_release_id ??
                          "Unresolved"}{" "}
                        · Source date:{" "}
                        {d.temporal_qualification?.source_reference_at ??
                          "Unmeasured"}
                      </p>
                    ))}
                  </details>
                </div>
              ))}
              <section>
                <h4>Separate lifecycle evidence by industry</h4>
                <p>
                  {n(
                    selected.view.lifecycle_industry_jurisdiction
                      .source_membership_count ?? 0,
                  )}{" "}
                  source-relative memberships · mapped union{" "}
                  {n(
                    selected.view.lifecycle_industry_jurisdiction
                      .mapped_source_record_union_count ?? 0,
                  )}{" "}
                  · unresolved{" "}
                  {n(
                    selected.view.lifecycle_industry_jurisdiction
                      .unresolved_source_record_count ?? 0,
                  )}
                </p>
                {selected.view.lifecycle_industry_jurisdiction.industries?.map(
                  (row) => (
                    <p key={row.industry_id}>
                      {label(row.industry_id)} · {n(row.source_assignment_count)}{" "}
                      nonadditive assignments
                    </p>
                  ),
                )}
                <p>
                  Separate lifecycle evidence only; not merged with evidence reach,
                  maintenance, unique-business counts, or completeness.
                </p>
              </section>
            </div>
          )}
        </details>
      ) : (
        <p>Select a state on the map for its nine industry status rows.</p>
      )}
      <details>
        <summary>ZIP5 evidence detail</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (/^\d{5}$/.test(zipInput)) setZip(zipInput);
          }}
        >
          <label>
            Five-digit ZIP{" "}
            <input
              value={zipInput}
              onChange={(event) => setZipInput(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              required
              aria-label="National Status ZIP5"
            />
          </label>
          <button type="submit">Inspect ZIP</button>
        </form>
        {zip &&
          (detail?.failed ? (
            <p role="alert">
              ZIP evidence is unavailable; no zero or validity claim was
              inferred.
            </p>
          ) : !detail?.view ? (
            <p role="status">Verifying ZIP {zip}…</p>
          ) : !detail.view.found ? (
            <p>
              ZIP {zip} is outside this retained cohort. USPS validity and
              business availability remain unknown.
            </p>
          ) : (
            <>
              <p>
                ZIP {detail.view.zip5} · ZIP+4 separate and unmeasured ·{" "}
                {label(detail.view.cohort_classification)} ·{" "}
                {label(detail.view.geography_scope)} · Census ZCTA{" "}
                {detail.view.zcta_geoid ?? "No polygon relation retained"}
              </p>
              <details>
                <summary>51 source dimensions and provenance</summary>
                {detail.view.dimensions.map((d) => (
                  <p key={d.id}>
                    {label(d.id)} · {label(d.evidence_status ?? "unavailable")}{" "}
                    ·{" "}
                    {label(
                      d.temporal_qualification?.review_qualification ??
                        "unmeasured",
                    )}
                    <br />
                    Source release:{" "}
                    {d.temporal_qualification?.source_release_id ??
                      "See matrix release provenance; temporal qualification unmeasured"}
                  </p>
                ))}
                <p>Federation {detail.view.provenance.release_id}</p>
              </details>
            </>
          ))}
      </details>
    </section>
  );
}
