import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {verifyCensusZctaResidualRelease} from './census-zcta-residual-release.mjs';
import {buildResidualReferenceAreas,validateResidualReferenceSelection} from './residual-reference-areas.mjs';
export const CENSUS_RESIDUAL_SCHEMA='us-census-non-zcta-state-residual-view@1.0.0';
const SHA=/^[a-f0-9]{64}$/;
const check=(value,message)=>{if(!value)throw new Error(message)};
const exact=(value,keys)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|'),'Invalid residual registration.');
const sha=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
async function registration(){
  const file=path.join(APP_ROOT,'config/datasets/us-census-non-zcta-state-residual-release.json'),stat=await lstat(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<100000,'Unsafe residual registration.');const value=JSON.parse(await readFile(file));
  exact(value,['schema_version','dataset_id','status','runtime_pointer','production_enrollment','retained_release','claims']);exact(value.retained_release,['release_id','manifest','manifest_sha256','manifest_bytes','summary_sha256','summary_bytes','state_artifacts']);
  check(value.schema_version==='1.0.0'&&value.dataset_id==='us-census-non-zcta-state-residual'&&value.status==='registered-pointer-free-local-review-release'&&value.runtime_pointer===null&&value.production_enrollment===false&&SHA.test(value.retained_release.manifest_sha256)&&value.retained_release.state_artifacts===56,'Invalid residual registration.');return value;
}
export async function readCensusZctaResidualView({state,offset=0,direction='all'}={}){
  validateResidualReferenceSelection({offset,direction});
  if(state===undefined&&(offset!==0||direction!=='all'))throw Object.assign(new Error('Choose a state before filtering residual reference areas.'),{statusCode:400});
  if(state!==undefined)check(/^[A-Z]{2}$/.test(state),'Invalid residual state selection.');const registered=await registration(),verified=await verifyCensusZctaResidualRelease({manifestPath:registered.retained_release.manifest,replay:false});
  check(verified.release_id===registered.retained_release.release_id&&verified.manifest_sha256===registered.retained_release.manifest_sha256&&JSON.stringify(stable(verified.claims))===JSON.stringify(stable(registered.claims)),'Residual registration identity mismatch.');
  const summaryBytes=await readFile(path.join(path.dirname(path.resolve(APP_ROOT,registered.retained_release.manifest)),'summary.json'));check(summaryBytes.length===registered.retained_release.summary_bytes&&sha(summaryBytes)===registered.retained_release.summary_sha256,'Residual summary identity mismatch.');
  const selected=state?verified.summary.states.find(row=>row.state_abbreviation===state):null;if(state)check(selected,'Residual state is not retained.');
  let referenceAreas=null;
  if(selected){
    const releaseDirectory=path.dirname(path.resolve(APP_ROOT,registered.retained_release.manifest));
    const residualBytes=await readFile(path.join(releaseDirectory,selected.artifact_path));
    check(residualBytes.length===selected.artifact_bytes&&sha(residualBytes)===selected.artifact_sha256,'Residual component artifact identity mismatch.');
    const upstreamDirectory=path.dirname(path.resolve(APP_ROOT,verified.summary.upstream.manifest_path));
    const manifest=JSON.parse(await readFile(path.join(upstreamDirectory,'manifest.json'))),descriptor=manifest.artifacts.find(row=>row.path==='source/states.geojson');
    check(descriptor&&SHA.test(descriptor.sha256),'Missing retained state geometry descriptor.');
    const stateBytes=await readFile(path.join(upstreamDirectory,descriptor.path));
    check(stateBytes.length===descriptor.bytes&&sha(stateBytes)===descriptor.sha256,'Retained state geometry identity mismatch.');
    const stateFeature=JSON.parse(stateBytes).features.find(row=>row.properties?.STUSAB===state),residualFeature=JSON.parse(residualBytes).features[0];
    check(stateFeature&&residualFeature,'Missing retained state/reference geometry.');
    referenceAreas=buildResidualReferenceAreas({state:selected,stateGeometry:stateFeature.geometry,residualGeometry:residualFeature.geometry,offset,direction});
  }
  return{schema_version:CENSUS_RESIDUAL_SCHEMA,ready:true,available:true,status:'verified-state-equivalent-residual-release',release:{release_id:verified.release_id,manifest_sha256:verified.manifest_sha256,publication_mode:verified.summary.publication_mode,state_artifacts:verified.state_artifacts},state:selected,reference_areas:referenceAreas,upstream:verified.summary.upstream,inventory:{state_equivalents:56,zcta_features:33791},conservation:verified.summary.conservation,claims:{zip_completion:verified.claims.zip_completion,population:verified.claims.population,business_count:verified.claims.business_geography,park_status:verified.claims.park_status,tribal_status:verified.claims.tribal_or_native_status,private_land_status:verified.claims.private_land_status,existing_map_blocked:verified.claims.existing_map_blocked,zip_or_postal_geography:verified.claims.zip_or_postal_geography}};
}
