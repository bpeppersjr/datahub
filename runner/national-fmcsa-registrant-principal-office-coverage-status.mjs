import { readNationalFmcsaRegistrantPrincipalOfficeCoverage } from './national-fmcsa-registrant-principal-office-coverage.mjs';

export async function loadNationalFmcsaRegistrantPrincipalOfficeCoverageStatus(){
  const{verified,summary}=await readNationalFmcsaRegistrantPrincipalOfficeCoverage();
  return{available:true,release:{release_id:verified.manifest.release_id,manifest_sha256:verified.manifestSha256,pointer_sha256:verified.pointerSha256},product_label:'FMCSA source-active registrant principal-office coverage',coverage:summary.coverage,source:summary.source,geography:summary.geography,claims:summary.claims,inclusion:{generic_business_totals:false,generic_entity_totals:false,generic_site_totals:false,generic_category_totals:false,generic_exports:false,production_enrollment:false,status:'excluded-non-additive-governed-layer'}};
}
