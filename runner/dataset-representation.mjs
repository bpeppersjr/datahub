// Explicit projection contracts; unknown future plan sources stay unmeasured.
const projections = {
  'national-snap-retailers': ['usda-snap-current-retailers', 'usda_snap_retailers', 'USDA SNAP'],
  'national-nppes-organizations': ['cms-nppes-monthly-v2', 'cms_nppes_organizations', 'CMS NPPES'],
  'national-fdic-bankfind': ['fdic-bankfind-current-structure', 'fdic_bankfind', 'FDIC BankFind'],
  'national-ncua-quarterly': ['ncua-final-quarterly-call-report', 'ncua_quarterly_credit_unions', 'NCUA'],
  'national-fmcsa-census': ['fmcsa-company-census-active-us-principal-office', 'fmcsa_active_us_company_census', 'FMCSA'],
  'national-irs-eo-bmf': [null, 'irs_eo_bmf_organizations', 'IRS EO BMF'],
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
        const stateRecordCount = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
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
