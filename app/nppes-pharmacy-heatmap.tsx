'use client';
import { useEffect, useState } from 'react';
import { runnerJson } from './runner-client';

type PharmacyView = {
  status: string;
  source: { release_id: string; source_release_id: string; pointer_sha256: string; manifest_sha256: string };
  coverage: { accepted_organization_rows: number; retail_taxonomy_occurrences: number; repeated_retail_taxonomy_excess: number; rows_with_reported_primary_address: number; exact_zcta_membership_rows: number; nonpolygon_zip_rows: number; unmatched_geography_rows: number; mail_order_taxonomy_assertion_rows: number; mail_order_taxonomy_assertion_organization_rows: number; reported_zip5_aggregate_rows: number };
  claims: Record<string, unknown>;
  states: Array<{ state: string; reported_address_count: number; unique_npi_count: number; reported_zip5_count: number }>;
  zips: Array<{ zip_code: string; reported_address_count: number; unique_npi_count: number; zcta_membership: { status: string } }>;
  names: Array<{ npi: string; legal_business_name: string; address: { city: string; state: string; zip_code: string; zip4: string | null } | null; mail_order_taxonomy_assertions: unknown; geography: { zcta_match_status: string } | null }>;
  limitations: string[];
};

const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString();

export default function NppesPharmacyHeatmap() {
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<PharmacyView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (/^\d{5}$/.test(zip)) params.set('zip', zip);
    if (query) params.set('query', query);
    params.set('limit', '25');
    void runnerJson<PharmacyView>(`/api/business-map/pharmacies?${params}`, { signal: controller.signal }).then(setView).catch((reason) => { if (reason?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Pharmacy evidence is unavailable.'); });
    return () => controller.abort();
  }, [state, zip, query]);
  return <section className="state-alignment-card nppes-pharmacy-heatmap" aria-label="CMS NPPES community and retail pharmacy heatmap">
    <div><span>Distinct source layer · excluded from generic business totals</span><strong>Community / retail pharmacy evidence</strong></div>
    <p className="entity-method-note">Provider-reported CMS NPPES Entity Type 2 organizations carrying taxonomy 3336C0003X. This is a source-evidence drilldown, not a complete pharmacy directory or operating-status map.</p>
    <div className="pharmacy-filters"><label>State <input value={state} maxLength={2} onChange={(event) => setState(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="e.g. TX" /></label><label>ZIP5 <input value={zip} maxLength={5} onChange={(event) => setZip(event.target.value.replace(/\D/g, ''))} placeholder="e.g. 75001" /></label><label>Name or NPI <input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="Search retained names" /></label></div>
    {error && <p className="map-error" role="alert">{error}</p>}
    {!view && !error && <p className="entity-method-note">Verifying the retained projection and source hashes…</p>}
    {view && <>
      <dl><div><dt>Unique Entity Type 2 rows</dt><dd>{number(view.coverage.accepted_organization_rows)}</dd></div><div><dt>Retail taxonomy occurrences</dt><dd>{number(view.coverage.retail_taxonomy_occurrences)}</dd></div><div><dt>Reported primary addresses</dt><dd>{number(view.coverage.rows_with_reported_primary_address)}</dd></div><div><dt>Exact ZCTA membership</dt><dd>{number(view.coverage.exact_zcta_membership_rows)}</dd></div><div><dt>Nonpolygon / unmatched</dt><dd>{number(view.coverage.nonpolygon_zip_rows)} / {number(view.coverage.unmatched_geography_rows)}</dd></div><div><dt>Mail-order taxonomy assertions</dt><dd>{number(view.coverage.mail_order_taxonomy_assertion_organization_rows)} organizations · {number(view.coverage.mail_order_taxonomy_assertion_rows)} occurrences</dd></div></dl>
      <p className="entity-method-note">Release {view.source.release_id}; source-through evidence is {view.source.source_release_id}. ZIP5 and ZIP4 remain separate. ZCTA membership is shown only where the governed NPPES dependency already supplied it; no pharmacy geocode is asserted.</p>
      <div className="entity-list"><strong>Bounded names / NPI / address results ({state || zip || query ? 'filtered' : 'sample'})</strong>{view.names.map((row) => <div className="entity-list-row" key={row.npi}><span><b>{row.legal_business_name}</b><small>NPI {row.npi} · {row.address ? `${row.address.city}, ${row.address.state} ${row.address.zip_code}${row.address.zip4 ? `-${row.address.zip4}` : ''}` : 'no normalized primary address'}</small></span><small>{row.geography?.zcta_match_status ?? 'unassigned'}</small></div>)}</div>
      <details><summary>Claims and limitations</summary><p className="entity-method-note">NABP/NCPDP, drive-through, network affiliation, parent company, current operation, unique business, physical-site, governed geocode, and nationwide completeness are not asserted. Mail-order is only a separate taxonomy assertion when 3336M0002X is present.</p><ul>{view.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>
    </>}
  </section>;
}
