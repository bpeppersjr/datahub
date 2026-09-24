import { readNationalPharmacyIndustryCoverage } from './national-pharmacy-industry-coverage.mjs';

export async function loadNationalPharmacyIndustryCoverageStatus() {
  const { verified, summary } = await readNationalPharmacyIndustryCoverage();
  return {
    available: true,
    release: { release_id: verified.manifest.release_id, manifest_sha256: verified.manifestSha256, pointer_sha256: verified.pointerSha256 },
    industry: summary.industry,
    coverage: summary.coverage,
    source: summary.source,
    geography: summary.geography,
    supplementary_secondary_addresses: summary.supplementary_secondary_addresses,
    claims: summary.claims,
    inclusion: { generic_business_totals: false, generic_category_totals: false, production_enrollment: false, status: 'excluded-non-additive-local-review' },
  };
}
