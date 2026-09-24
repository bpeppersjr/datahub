import { readNationalFsisActiveEstablishmentCoverage } from './national-fsis-active-establishment-coverage.mjs';

export async function loadNationalFsisActiveEstablishmentCoverageStatus() {
  const { verified, summary } = await readNationalFsisActiveEstablishmentCoverage();
  return {
    available: true,
    release: { release_id: verified.manifest.release_id, manifest_sha256: verified.manifestSha256, pointer_sha256: verified.pointerSha256 },
    product_label: 'USDA FSIS source-defined active establishment coverage',
    coverage: {
      ...summary.coverage,
      active_establishment_count: summary.active_establishment_count,
      reported_zip4_count: summary.reported_zip4_count,
      retained_coordinate_count: summary.retained_coordinate_count,
      missing_coordinate_count: summary.missing_coordinate_count,
      record_zcta_count: summary.record_zcta_count,
      record_nonpolygon_count: summary.record_nonpolygon_count,
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
      status: 'excluded-non-additive-governed-layer',
    },
  };
}
