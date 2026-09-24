import { readNationalEpaEchoActiveFacilityCoverage } from './national-epa-echo-active-facility-coverage.mjs';

export async function loadNationalEpaEchoActiveFacilityCoverageStatus() {
  const { verified, summary } = await readNationalEpaEchoActiveFacilityCoverage();
  return {
    available: true,
    release: { release_id: verified.manifest.release_id, manifest_sha256: verified.manifestSha256, pointer_sha256: verified.pointerSha256 },
    product_label: 'EPA ECHO source-defined active-program-facility coverage',
    coverage: {
      ...summary.coverage,
      active_facility_count: summary.active_facility_count,
      reported_zip4_count: summary.reported_zip4_count,
      retained_coordinate_count: summary.retained_coordinate_count,
      centroid_warning_count: summary.centroid_warning_count,
      coordinate_accuracy_missing_count: summary.coordinate_accuracy_missing_count,
      record_zcta_count: summary.record_zcta_count,
      record_nonpolygon_count: summary.record_nonpolygon_count,
      air_association_count: summary.air_association_count,
      npdes_association_count: summary.npdes_association_count,
      rcra_association_count: summary.rcra_association_count,
      safe_drinking_water_association_count: summary.safe_drinking_water_association_count,
      toxics_release_inventory_association_count: summary.toxics_release_inventory_association_count,
      greenhouse_gas_reporting_association_count: summary.greenhouse_gas_reporting_association_count,
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

