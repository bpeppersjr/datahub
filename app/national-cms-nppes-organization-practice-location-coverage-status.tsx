"use client";
import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

type View = {
  available: true;
  release: { release_id: string };
  product_label: string;
  source: { source_date: string; retrieved_at: string };
  coverage: {
    active_organization_npis: number;
    organizations_without_valid_us_primary_zip: number;
    practice_location_count: number;
    primary_practice_location_count: number;
    non_primary_practice_location_count: number;
    deduplicated_practice_location_rows: number;
    state_dc_rows: number;
    territory_rows: number;
    military_rows: number;
    associated_state_rows: number;
    positive_zip5_rows: number;
    denominator_only_zip5_rows: number;
    reported_zip4_location_count: number;
    location_zcta_count: number;
    location_nonpolygon_count: number;
  };
};

export default function NationalCmsNppesOrganizationPracticeLocationCoverageStatus() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void runnerJson<View>("/api/data-operations/national-cms-nppes-organization-practice-location-coverage-status", { signal: controller.signal })
      .then((value) => { if (active && !controller.signal.aborted) { setView(value); setError(false); } })
      .catch(() => { if (active && !controller.signal.aborted) { setView(null); setError(true); } });
    return () => { active = false; controller.abort(); };
  }, []);
  return (
    <section className="operations-builder" aria-label="National CMS NPPES organization practice-location coverage status">
      <h3>National CMS NPPES organization practice-location coverage</h3>
      {error ? (
        <p role="alert">Verified CMS NPPES coverage is unavailable. No cached evidence or action is shown.</p>
      ) : !view ? (
        <p role="status">Verifying retained CMS NPPES aggregates…</p>
      ) : (
        <>
          <p><strong>{view.product_label}</strong> · source through {view.source.source_date} · retrieved {view.source.retrieved_at} · release {view.release.release_id}</p>
          <dl>
            <dt>Active organization NPIs</dt><dd>{view.coverage.active_organization_npis.toLocaleString()}</dd>
            <dt>Reported practice-location records</dt><dd>{view.coverage.practice_location_count.toLocaleString()}</dd>
            <dt>Primary practice locations</dt><dd>{view.coverage.primary_practice_location_count.toLocaleString()}</dd>
            <dt>Non-primary practice locations</dt><dd>{view.coverage.non_primary_practice_location_count.toLocaleString()}</dd>
            <dt>Duplicate source practice rows excluded</dt><dd>{view.coverage.deduplicated_practice_location_rows.toLocaleString()}</dd>
            <dt>Organizations without valid U.S. primary ZIP</dt><dd>{view.coverage.organizations_without_valid_us_primary_zip.toLocaleString()}</dd>
            <dt>State/DC jurisdictions with evidence</dt><dd>{view.coverage.state_dc_rows.toLocaleString()}</dd>
            <dt>Territories with evidence</dt><dd>{view.coverage.territory_rows.toLocaleString()}</dd>
            <dt>Military postal jurisdictions</dt><dd>{view.coverage.military_rows.toLocaleString()}</dd>
            <dt>Associated states</dt><dd>{view.coverage.associated_state_rows.toLocaleString()}</dd>
            <dt>ZIP5 with positive evidence</dt><dd>{view.coverage.positive_zip5_rows.toLocaleString()}</dd>
            <dt>Denominator-only ZIP rows</dt><dd>{view.coverage.denominator_only_zip5_rows.toLocaleString()}</dd>
            <dt>Locations with separate ZIP+4</dt><dd>{view.coverage.reported_zip4_location_count.toLocaleString()}</dd>
            <dt>Locations with same-code ZCTA evidence</dt><dd>{view.coverage.location_zcta_count.toLocaleString()}</dd>
            <dt>Locations without same-code ZCTA evidence</dt><dd>{view.coverage.location_nonpolygon_count.toLocaleString()}</dd>
          </dl>
          <article className="operation-record">
            <h4>Separate, non-additive retained evidence</h4>
            <p>Only aggregate counts are exposed. Organization names, NPIs, addresses, telephone numbers, taxonomies, source identifiers, quarantine records, and raw records are not published.</p>
            <p>These are provider-reported locations for active or reactivated Entity Type 2 NPIs. They do not prove licensure, credentials, currently open premises, public access, ownership, unique businesses, USPS validity, or nationwide completeness.</p>
            <p>Primary and non-primary counts are mutually exclusive. This layer is excluded from generic business, entity, site, category, pharmacy, and export totals.</p>
          </article>
        </>
      )}
    </section>
  );
}
