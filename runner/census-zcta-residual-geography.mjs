import {verifyCensusZctaResidualReadiness} from './census-zcta-residual-readiness-release.mjs';
export const CENSUS_RESIDUAL_SCHEMA='us-census-non-zcta-state-residual-readiness@1.0.0';
const check=(value,message)=>{if(!value)throw new Error(message)};
export async function readCensusZctaResidualView({state}={}){
  if(state!==undefined)check(/^[A-Z]{2}$/.test(state),'Invalid residual state selection.');
  const verified=await verifyCensusZctaResidualReadiness(),v=verified.view;
  return {schema_version:CENSUS_RESIDUAL_SCHEMA,ready:false,available:false,status:'blocked-overlay-engine-required',release:{release_id:verified.release_id,manifest_sha256:verified.manifest_sha256,artifact_sha256:verified.artifact_sha256,publication_mode:v.publication_mode},state:state??null,upstream:{dataset_id:v.upstream.pointer.release_id?'us-census-geography':null,release_id:v.upstream.pointer.release_id,manifest_sha256:v.upstream.manifest.sha256,states_index_sha256:v.upstream.artifacts.state_index.sha256,zctas_index_sha256:v.upstream.artifacts.zcta_index.sha256},inventory:v.inventory,conservation:v.conservation,measured_blockers:v.measured_blockers,required_capability:v.capability.required_capability,claims:{zip_completion:v.claims.zip_completion,population:v.claims.population,business_count:v.claims.business_geography,park_status:v.claims.park_status,tribal_status:v.claims.tribal_or_native_status,private_land_status:v.claims.private_land_status,existing_map_blocked:v.claims.existing_map_blocked}};
}
