"use client";
import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

type View = {
  available: true;
  release: { release_id: string };
  product_label: string;
  source: { source_date: string; retrieved_at: string };
  coverage: {
    organization_count: number;
    state_dc_rows: number;
    territory_rows: number;
    positive_zip5_rows: number;
    denominator_only_zip5_rows: number;
    reported_zip4_count: number;
    record_zcta_count: number;
    record_nonpolygon_count: number;
    exempt_status_01_count: number;
    exempt_status_02_count: number;
    exempt_status_12_count: number;
    exempt_status_25_count: number;
  };
};

export default function NationalIrsEoBmfOrganizationCoverageStatus() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void runnerJson<View>("/api/data-operations/national-irs-eo-bmf-organization-coverage-status", { signal: controller.signal })
      .then((value) => { if (active && !controller.signal.aborted) { setView(value); setError(false); } })
      .catch(() => { if (active && !controller.signal.aborted) { setView(null); setError(true); } });
    return () => { active = false; controller.abort(); };
  }, []);
  return (
    <section className="operations-builder" aria-label="National IRS EO BMF organization filing-address coverage status">
      <h3>National IRS EO BMF organization filing-address coverage</h3>
      {error ? (
        <p role="alert">Verified IRS EO BMF coverage is unavailable. No cached evidence or action is shown.</p>
      ) : !view ? (
        <p role="status">Verifying retained IRS EO BMF aggregates…</p>
      ) : (
        <>
          <p><strong>{view.product_label}</strong> · source posting date {view.source.source_date} · retrieved {view.source.retrieved_at} · release {view.release.release_id}</p>
          <dl>
            <dt>Current-extract organization filing-address records</dt><dd>{view.coverage.organization_count.toLocaleString()}</dd>
            <dt>State/DC jurisdictions with evidence</dt><dd>{view.coverage.state_dc_rows.toLocaleString()}</dd>
            <dt>Territories with evidence</dt><dd>{view.coverage.territory_rows.toLocaleString()}</dd>
            <dt>ZIP5 with positive evidence</dt><dd>{view.coverage.positive_zip5_rows.toLocaleString()}</dd>
            <dt>Denominator-only ZIP rows</dt><dd>{view.coverage.denominator_only_zip5_rows.toLocaleString()}</dd>
            <dt>Records with separate ZIP+4</dt><dd>{view.coverage.reported_zip4_count.toLocaleString()}</dd>
            <dt>Records with same-code ZCTA evidence</dt><dd>{view.coverage.record_zcta_count.toLocaleString()}</dd>
            <dt>Records without same-code ZCTA evidence</dt><dd>{view.coverage.record_nonpolygon_count.toLocaleString()}</dd>
            <dt>Exempt status code 01</dt><dd>{view.coverage.exempt_status_01_count.toLocaleString()}</dd>
            <dt>Exempt status code 02</dt><dd>{view.coverage.exempt_status_02_count.toLocaleString()}</dd>
            <dt>Exempt status code 12</dt><dd>{view.coverage.exempt_status_12_count.toLocaleString()}</dd>
            <dt>Exempt status code 25</dt><dd>{view.coverage.exempt_status_25_count.toLocaleString()}</dd>
          </dl>
          <article className="operation-record">
            <h4>Separate, non-additive retained evidence</h4>
            <p>Only aggregate counts are exposed. Organization names, filing addresses, EINs, source identifiers, tax-profile details, quarantine records, and raw records are not published.</p>
            <p>This is current-extract federal tax-status and filing-address evidence. It is not every nonprofit or tax-exempt organization, a verified current operation or physical site, public access, unique businesses across sources, ownership, USPS validity, or nationwide completeness.</p>
            <p>Status-code counts are mutually exclusive. The organization-record measure is excluded from generic business, entity, site, category, and export totals.</p>
          </article>
        </>
      )}
    </section>
  );
}
