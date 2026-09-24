"use client";
import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";
type Coverage = {
  source_institutions: number;
  federally_insured_institutions: number;
  excluded_non_federally_insured_institutions: number;
  source_branch_records: number;
  accepted_scoped_us_locations: number;
  excluded_non_federally_insured_locations: number;
  excluded_locations_outside_us: number;
  quarantined_records: number;
  positive_zip5_rows: number;
  zip5_union_rows: number;
  denominator_only_zip5_rows: number;
  represented_institutions_with_locations: number;
  institutions_without_accepted_us_location: number;
  corporate_office_site_type_count: number;
  branch_office_site_type_count: number;
  source_main_office_flag_count: number;
  reported_zip4_count: number;
  retained_coordinate_count: number;
  missing_coordinate_count: number;
  record_zcta_count: number;
  record_nonpolygon_count: number;
  positive_source_zip_outside_zbp_zcta: number;
};
type View = {
  available: true;
  release: { release_id: string };
  product_label: string;
  source: { cycle_date: string; retrieved_at: string };
  coverage: Coverage;
  claims: Record<string, false | null>;
  inclusion: {
    generic_business_totals: false;
    generic_entity_totals: false;
    generic_site_totals: false;
    generic_category_totals: false;
    generic_exports: false;
    production_enrollment: false;
    status: string;
  };
};
export default function NationalNcuaCreditUnionCoverageStatus() {
  const [v, setV] = useState<View | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    let active = true;
    void runnerJson<View>(
      "/api/data-operations/national-ncua-credit-union-coverage-status",
      { signal: c.signal },
    )
      .then((value) => {
        if (active && !c.signal.aborted) {
          setV(value);
          setError(false);
        }
      })
      .catch(() => {
        if (active && !c.signal.aborted) {
          setV(null);
          setError(true);
        }
      });
    return () => {
      active = false;
      c.abort();
    };
  }, []);
  return (
    <section
      className="operations-builder"
      aria-label="National NCUA credit-union coverage status"
    >
      <h3>National NCUA credit-union coverage</h3>
      {error ? (
        <p role="alert">
          Verified NCUA coverage is unavailable. No cached evidence or action is
          shown.
        </p>
      ) : !v ? (
        <p role="status">Verifying retained NCUA aggregates…</p>
      ) : (
        <>
          <p>
            <strong>{v.product_label}</strong> · source cycle {v.source.cycle_date}
            {" · "}retrieved {v.source.retrieved_at} · release {v.release.release_id}
          </p>
          <dl>
            <dt>Federally insured institutions</dt>
            <dd>
              {v.coverage.federally_insured_institutions.toLocaleString()}
            </dd>
            <dt>Scoped U.S. location rows</dt>
            <dd>{v.coverage.accepted_scoped_us_locations.toLocaleString()}</dd>
            <dt>Institutions represented by locations</dt>
            <dd>
              {v.coverage.represented_institutions_with_locations.toLocaleString()}
            </dd>
            <dt>Institutions without accepted U.S. locations</dt>
            <dd>
              {v.coverage.institutions_without_accepted_us_location.toLocaleString()}
            </dd>
            <dt>Corporate Office site-type rows</dt>
            <dd>
              {v.coverage.corporate_office_site_type_count.toLocaleString()}
            </dd>
            <dt>Source main-office flags</dt>
            <dd>{v.coverage.source_main_office_flag_count.toLocaleString()}</dd>
            <dt>Branch Office site-type rows</dt>
            <dd>{v.coverage.branch_office_site_type_count.toLocaleString()}</dd>
            <dt>ZIP5 with positive evidence</dt>
            <dd>{v.coverage.positive_zip5_rows.toLocaleString()}</dd>
            <dt>Denominator-only ZIP rows</dt>
            <dd>{v.coverage.denominator_only_zip5_rows.toLocaleString()}</dd>
            <dt>Rows with separate ZIP+4</dt>
            <dd>{v.coverage.reported_zip4_count.toLocaleString()}</dd>
            <dt>Retained coordinates</dt>
            <dd>{v.coverage.retained_coordinate_count.toLocaleString()}</dd>
            <dt>Rows missing coordinates</dt>
            <dd>{v.coverage.missing_coordinate_count.toLocaleString()}</dd>
          </dl>
          <article className="operation-record">
            <h4>Separate, non-additive quarterly evidence</h4>
            <p>
              Corporate Office site type and the source main-office flag are
              distinct dimensions. Source-reported member-service, ATM,
              drive-through, and shared-service-center fields are nonexclusive
              evidence, not verified service availability.
            </p>
            <p>
              This is not all credit unions, unique businesses, current
              operations, public access, verified physical sites, USPS validity,
              or nationwide completeness.
            </p>
            <p>
              Institution and location units are never combined and are excluded
              from generic business, entity, site, category, and export totals.
            </p>
          </article>
        </>
      )}
    </section>
  );
}
