import { readNationalCmsNppesOrganizationPracticeLocationCoverage } from './national-cms-nppes-organization-practice-location-coverage.mjs';

export async function loadNationalCmsNppesOrganizationPracticeLocationCoverageStatus() {
  const { verified, summary } = await readNationalCmsNppesOrganizationPracticeLocationCoverage();
  return {
    available: true,
    release: { release_id: verified.manifest.release_id, manifest_sha256: verified.manifestSha256, pointer_sha256: verified.pointerSha256 },
    product_label: 'CMS NPPES active organization practice-location coverage',
    coverage: {
      ...summary.coverage,
      practice_location_count: summary.practice_location_count,
      primary_practice_location_count: summary.primary_practice_location_count,
      non_primary_practice_location_count: summary.non_primary_practice_location_count,
      reported_zip4_location_count: summary.reported_zip4_location_count,
      location_zcta_count: summary.location_zcta_count,
      location_nonpolygon_count: summary.location_nonpolygon_count
    },
    source: summary.source,
    geography: summary.geography,
    claims: summary.claims,
    inclusion: {
      generic_business_totals: false,
      generic_entity_totals: false,
      generic_site_totals: false,
      generic_category_totals: false,
      generic_pharmacy_totals: false,
      generic_exports: false,
      production_enrollment: false,
      status: 'excluded-non-additive-governed-layer'
    }
  };
}
