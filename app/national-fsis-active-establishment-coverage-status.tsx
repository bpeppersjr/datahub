"use client";
import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

type View = {
  available: true;
  release: { release_id: string };
  product_label: string;
  source: { source_date: string; retrieved_at: string };
  coverage: {
    active_establishment_count: number;
    state_dc_rows: number;
    territory_rows: number;
    positive_zip5_rows: number;
    denominator_only_zip5_rows: number;
    reported_zip4_count: number;
    retained_coordinate_count: number;
    missing_coordinate_count: number;
    record_zcta_count: number;
    record_nonpolygon_count: number;
  };
};

export default function NationalFsisActiveEstablishmentCoverageStatus() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void runnerJson<View>("/api/data-operations/national-fsis-active-establishment-coverage-status", { signal: controller.signal })
      .then((value) => { if (active && !controller.signal.aborted) { setView(value); setError(false); } })
      .catch(() => { if (active && !controller.signal.aborted) { setView(null); setError(true); } });
    return () => { active = false; controller.abort(); };
  }, []);
  return (
    <section className="operations-builder" aria-label="National USDA FSIS active-establishment coverage status">
      <h3>National USDA FSIS active-establishment coverage</h3>
      {error ? (
        <p role="alert">Verified FSIS coverage is unavailable. No cached evidence or action is shown.</p>
      ) : !view ? (
        <p role="status">Verifying retained FSIS aggregates…</p>
      ) : (
        <>
          <p><strong>{view.product_label}</strong> · source date {view.source.source_date} · retrieved {view.source.retrieved_at} · release {view.release.release_id}</p>
          <dl>
            <dt>Source-defined active establishment records</dt><dd>{view.coverage.active_establishment_count.toLocaleString()}</dd>
            <dt>State/DC jurisdictions with evidence</dt><dd>{view.coverage.state_dc_rows.toLocaleString()}</dd>
            <dt>Territories with evidence</dt><dd>{view.coverage.territory_rows.toLocaleString()}</dd>
            <dt>ZIP5 with positive evidence</dt><dd>{view.coverage.positive_zip5_rows.toLocaleString()}</dd>
            <dt>Denominator-only ZIP rows</dt><dd>{view.coverage.denominator_only_zip5_rows.toLocaleString()}</dd>
            <dt>Records with separate ZIP+4</dt><dd>{view.coverage.reported_zip4_count.toLocaleString()}</dd>
            <dt>Records with source coordinates</dt><dd>{view.coverage.retained_coordinate_count.toLocaleString()}</dd>
            <dt>Records with same-code ZCTA evidence</dt><dd>{view.coverage.record_zcta_count.toLocaleString()}</dd>
            <dt>Records without same-code ZCTA evidence</dt><dd>{view.coverage.record_nonpolygon_count.toLocaleString()}</dd>
          </dl>
          <article className="operation-record">
            <h4>Separate, non-additive retained evidence</h4>
            <p>Only aggregate counts are exposed. Source coordinates are counted but coordinates, geometry, names, addresses, phones, identifiers, and raw records are not published.</p>
            <p>This is evidence of listing in the FSIS active MPI directory as of the source date, not all food businesses, unique businesses, current operation beyond the source, physical public access, current hours, ownership, USPS validity, or nationwide completeness.</p>
            <p>The establishment-record measure is excluded from generic business, entity, site, category, and export totals.</p>
          </article>
        </>
      )}
    </section>
  );
}
