"use client";
import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

type View = {
  available: true;
  release: { release_id: string };
  product_label: string;
  source: { source_date: string; retrieved_at: string };
  coverage: {
    active_facility_count: number;
    state_dc_rows: number;
    territory_rows: number;
    positive_zip5_rows: number;
    denominator_only_zip5_rows: number;
    reported_zip4_count: number;
    retained_coordinate_count: number;
    centroid_warning_count: number;
    coordinate_accuracy_missing_count: number;
    record_zcta_count: number;
    record_nonpolygon_count: number;
    air_association_count: number;
    npdes_association_count: number;
    rcra_association_count: number;
    safe_drinking_water_association_count: number;
    toxics_release_inventory_association_count: number;
    greenhouse_gas_reporting_association_count: number;
  };
};

export default function NationalEpaEchoActiveFacilityCoverageStatus() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void runnerJson<View>("/api/data-operations/national-epa-echo-active-facility-coverage-status", { signal: controller.signal })
      .then((value) => { if (active && !controller.signal.aborted) { setView(value); setError(false); } })
      .catch(() => { if (active && !controller.signal.aborted) { setView(null); setError(true); } });
    return () => { active = false; controller.abort(); };
  }, []);
  return (
    <section className="operations-builder" aria-label="National EPA ECHO active-program-facility coverage status">
      <h3>National EPA ECHO active-program-facility coverage</h3>
      {error ? (
        <p role="alert">Verified EPA ECHO coverage is unavailable. No cached evidence or action is shown.</p>
      ) : !view ? (
        <p role="status">Verifying retained EPA ECHO aggregates…</p>
      ) : (
        <>
          <p><strong>{view.product_label}</strong> · source date {view.source.source_date} · retrieved {view.source.retrieved_at} · release {view.release.release_id}</p>
          <dl>
            <dt>Source-defined active-program-facility records</dt><dd>{view.coverage.active_facility_count.toLocaleString()}</dd>
            <dt>State/DC jurisdictions with evidence</dt><dd>{view.coverage.state_dc_rows.toLocaleString()}</dd>
            <dt>Territories with evidence</dt><dd>{view.coverage.territory_rows.toLocaleString()}</dd>
            <dt>ZIP5 with positive evidence</dt><dd>{view.coverage.positive_zip5_rows.toLocaleString()}</dd>
            <dt>Denominator-only ZIP rows</dt><dd>{view.coverage.denominator_only_zip5_rows.toLocaleString()}</dd>
            <dt>Records with separate ZIP+4</dt><dd>{view.coverage.reported_zip4_count.toLocaleString()}</dd>
            <dt>Records with source coordinates</dt><dd>{view.coverage.retained_coordinate_count.toLocaleString()}</dd>
            <dt>Records with centroid warnings</dt><dd>{view.coverage.centroid_warning_count.toLocaleString()}</dd>
            <dt>Records without populated accuracy meters</dt><dd>{view.coverage.coordinate_accuracy_missing_count.toLocaleString()}</dd>
            <dt>Records with same-code ZCTA evidence</dt><dd>{view.coverage.record_zcta_count.toLocaleString()}</dd>
            <dt>Records without same-code ZCTA evidence</dt><dd>{view.coverage.record_nonpolygon_count.toLocaleString()}</dd>
            <dt>Air program associations</dt><dd>{view.coverage.air_association_count.toLocaleString()}</dd>
            <dt>NPDES associations</dt><dd>{view.coverage.npdes_association_count.toLocaleString()}</dd>
            <dt>RCRA associations</dt><dd>{view.coverage.rcra_association_count.toLocaleString()}</dd>
            <dt>Safe Drinking Water associations</dt><dd>{view.coverage.safe_drinking_water_association_count.toLocaleString()}</dd>
            <dt>Toxics Release Inventory associations</dt><dd>{view.coverage.toxics_release_inventory_association_count.toLocaleString()}</dd>
            <dt>Greenhouse Gas Reporting associations</dt><dd>{view.coverage.greenhouse_gas_reporting_association_count.toLocaleString()}</dd>
          </dl>
          <article className="operation-record">
            <h4>Separate, non-additive retained evidence</h4>
            <p>Only aggregate counts are exposed. Source coordinates are counted, but coordinates, geometry, names, addresses, identifiers, report URLs, quarantine records, and raw records are not published.</p>
            <p>This is as-of evidence that ECHO marks at least one associated environmental permit or facility active. It is not all businesses, all regulated facilities, a present-day operation claim, active status in every associated program, a premise-level geocode, physical public access, ownership, USPS validity, or nationwide completeness.</p>
            <p>Program-association measures overlap and must not be summed. The facility-record measure is excluded from generic business, entity, site, category, and export totals.</p>
          </article>
        </>
      )}
    </section>
  );
}

