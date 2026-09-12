import { nationalReportingCount, validateNationalReportingCatalog } from './national-reporting-catalog.mjs';

// Explicit projection contracts; unknown future plan sources stay unmeasured.
const projections = {
  'national-snap-retailers': ['usda-snap-current-retailers', 'usda_snap_retailers', 'USDA SNAP'],
  'national-nppes-organizations': ['cms-nppes-monthly-v2', 'cms_nppes_organizations', 'CMS NPPES'],
  'national-fdic-bankfind': ['fdic-bankfind-current-structure', 'fdic_bankfind', 'FDIC BankFind'],
  'national-ncua-quarterly': ['ncua-final-quarterly-call-report', 'ncua_quarterly_credit_unions', 'NCUA'],
  'national-fmcsa-census': ['fmcsa-company-census-active-us-principal-office', 'fmcsa_active_us_company_census', 'FMCSA'],
  'national-irs-eo-bmf': [null, 'irs_eo_bmf_organizations', 'IRS EO BMF'],
  'national-epa-echo': ['epa-echo-exporter-active-facility', 'epa_echo_active_facilities', 'EPA ECHO'],
  'national-usda-fsis': ['usda-fsis-active-mpi-directory', 'fsis_active_mpi_establishments', 'USDA FSIS'],
};

export function datasetRepresentation(plan, states, sources, irsAddressEvidence = null) {
  const expected = Object.entries(plan.sources).filter(([, source]) => source.scope === 'national' && source.states === 'all').map(([id]) => {
    const [profileId, sourceKey, label] = projections[id] ?? [null, null, id];
    return { id, profileId, sourceKey, label, industries: Object.entries(plan.industries).filter(([, ids]) => ids.includes(id)).map(([industry]) => industry) };
  });
  const summarize = datasets => ({
    represented: datasets.filter(row => row.status === 'represented').length,
    expected: datasets.length,
    percent: datasets.some(row => row.stateRecordCount !== null) ? Math.round(datasets.filter(row => row.status === 'represented').length / datasets.length * 1000) / 10 : null,
    unmeasured: datasets.filter(row => row.stateRecordCount === null).length,
  });
  return {
    denominatorScope: 'Configured nationwide collection plan',
    schemaVersion: 'dataset-representation@1.0.0',
    denominatorVersion: 'configured-national-collection-plan@1.0.0',
    allBusinessesPercent: null,
    expectedDatasets: expected,
    states: plan.states.map(code => {
      const state = states.find(row => row.postal_abbreviation === code);
      const counts = state?.registry_evidence?.source_profile_counts_by_reported_address_state;
      const datasets = expected.map(source => {
        const national = sources.find(row => row.source_key === source.sourceKey);
        const isIrs=source.sourceKey==='irs_eo_bmf_organizations';
        const filing=isIrs&&irsAddressEvidence?.status==='available'?irsAddressEvidence:null;
        const raw = isIrs ? filing?.counts?.[code] : source.profileId && counts?.[source.profileId];
        const stateRecordCount = nationalReportingCount(raw);
        return { ...source, stateRecordCount, nationalReleasePresent: Boolean(national?.release_metadata),
          evidenceKind:isIrs?'organization-filing-address':'location-profile-reported-address',
          rowUnit:isIrs?'organization filing-address records':'location-profile records',
          addressBasis:isIrs?'Reported IRS filing or headquarters address; not a verified physical operating site':'Reported location-profile address state',
          sourcePostingDate:filing?.sourcePostingDate??null, observedAt:filing?.observedAt??null,
          evidence:filing?{manifestSha256:filing.manifestSha256,summarySha256:filing.summarySha256,sourceReleaseId:filing.sourceReleaseId,sourceReplayPerformedThisRead:false}:null,
          status: stateRecordCount === null ? 'unmeasured' : stateRecordCount > 0 ? 'represented' : 'no-state-records' };
      });
      return { code, fips: state?.state_fips ?? null, name: state?.name ?? state?.state_name ?? code, ...summarize(datasets), datasets,
        industries: Object.keys(plan.industries).map(id => ({ id, ...summarize(datasets.filter(row => row.industries.includes(id))) })) };
    }),
  };
}

const DISPLAY_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

export function nationalDatasetRepresentation(catalogValue, states, sources, irsAddressEvidence = null) {
  const catalog = validateNationalReportingCatalog(catalogValue);
  const industries = {};
  for (const source of catalog.sources) (industries[source.group] ??= []).push(source.id);
  const plan = { states: DISPLAY_STATES, industries, sources: Object.fromEntries(catalog.sources.map(row => [row.id, {scope:'national',states:'all'}])) };
  for (const source of catalog.sources) {
    const selected = sources.find(row => row.source_key === source.sourceKey);
    if (selected && source.profileId && selected.profile_source_id !== source.profileId) throw new Error('National reporting source mapping rejected.');
  }
  const result = datasetRepresentation(plan, states, sources, irsAddressEvidence);
  result.schemaVersion = 'dataset-representation@2.0.0';
  result.denominatorVersion = catalog.denominatorVersion;
  result.denominatorScope = catalog.denominatorScope;
  result.predecessorScope = catalog.predecessorScope;
  result.displayScope = '50 states and D.C.; territories excluded from this display';
  result.exportPolicy = catalog.exportPolicy;
  for (const state of result.states) for (const dataset of state.datasets) {
    const mapping = catalog.sources.find(row => row.id === dataset.id);
    const source = sources.find(row => row.source_key === mapping.sourceKey);
    dataset.scope = mapping.scope;
    dataset.sourceReleaseId = source?.release_metadata?.source_release_id ?? null;
    dataset.sourceDate = source?.release_metadata?.source_date ?? null;
    dataset.sourceUpdatedAt = source?.release_metadata?.source_updated_at ?? null;
    dataset.observedAt ??= source?.location_profile_geography?.latest_observed_at ?? null;
    // A count without its corresponding selected source aggregate is unavailable.
    if (!source && dataset.evidenceKind !== 'organization-filing-address') { dataset.stateRecordCount = null; dataset.status = 'unmeasured'; }
  }
  // Recompute after missing source aggregates were conservatively suppressed.
  for (const state of result.states) {
    const summarize = rows => ({ represented: rows.filter(row=>row.status==='represented').length, expected:rows.length,
      unmeasured:rows.filter(row=>row.stateRecordCount===null).length,
      percent:rows.some(row=>row.stateRecordCount!==null)?Math.round(rows.filter(row=>row.status==='represented').length/rows.length*1000)/10:null });
    Object.assign(state,summarize(state.datasets));
    state.industries = Object.keys(industries).map(id=>({id,...summarize(state.datasets.filter(row=>row.industries.includes(id)))}));
  }
  return result;
}
