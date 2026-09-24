import { readNationalIrsEoBmfOrganizationCoverage } from './national-irs-eo-bmf-organization-coverage.mjs';

export async function loadNationalIrsEoBmfOrganizationCoverageStatus() {
  const { verified, summary } = await readNationalIrsEoBmfOrganizationCoverage();
  return {
    available: true,
    release: { release_id: verified.manifest.release_id, manifest_sha256: verified.manifestSha256, pointer_sha256: verified.pointerSha256 },
    product_label: 'IRS EO BMF current-extract organization filing-address coverage',
    coverage: {
      ...summary.coverage,
      organization_count: summary.organization_count,
      reported_zip4_count: summary.reported_zip4_count,
      record_zcta_count: summary.record_zcta_count,
      record_nonpolygon_count: summary.record_nonpolygon_count,
      exempt_status_01_count: summary.exempt_status_01_count,
      exempt_status_02_count: summary.exempt_status_02_count,
      exempt_status_12_count: summary.exempt_status_12_count,
      exempt_status_25_count: summary.exempt_status_25_count
    },
    source: summary.source,
    geography: summary.geography,
    claims: summary.claims,
    inclusion: {
      generic_business_totals: false,
      generic_entity_totals: false,
      generic_site_totals: false,
      generic_category_totals: false,
      generic_exports: false,
      production_enrollment: false,
      status: 'excluded-non-additive-governed-layer'
    }
  };
}
