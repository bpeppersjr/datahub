import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { echoReplay as r, STATE_DC_CODES } from './national-epa-echo-naics-zip-industry-evidence.mjs';
import { readExactZipIndustrySummaryV31 } from './exact-zip-industry-summary-v3-1.mjs';
import { projectOperationalIndustryEvidence } from './operational-industry-evidence-summary.mjs';
import { verifyBusinessEntityGeographyRelationship } from './business-entity-geography-relationship.mjs';

export const DATASET = 'national-goal-evidence-federation';
export const VERSION = `${DATASET}@1.0.0`;
export const CLAIMS = Object.freeze({ all_business_denominator:null, business_completeness:null, industry_completeness:null, unique_business_count:null, current_operating_business_count:null, current_operation_verified:false, cross_industry_counts_additive:false, epa_memberships_additive_to_business_totals:false, usps_validity_verified:false, zcta_membership_is_usps_validity:false, zip4_joined:false, business_geometry_required:false, missing_population_blocks_map:false, unresolved_geography_blocks_map:false, raw_business_rows_exported:false, network_requests:0, acquisition_performed:false, current_pointer_written:false, production_enrollment:false });
const INPUT_NAMES = ['goal','matrix','disposition','epa','geography','cohort','non_zcta','crosswalk','lifecycle','entity_geography_registration','entity_geography','access','industries','operational_crosswalk','summary_implementation','temporal_mapping'];
const CONTRACTS = ['connectors','schemas','source-policies'].map(part=>`config/${part}/${DATASET}${part==='schemas'?'.schema':''}.json`);
const count = n => Number.isSafeInteger(n) && n >= 0;
const EVIDENCE_BY_RAW = {positive:'evidence-present','measured-positive':'evidence-present','retained-linkage-evidence':'evidence-present','measured-zero':'measured-zero','not-published-for-zip':'source-did-not-publish-for-zip','outside-zbp-zcta-evidence-union':'outside-source-evidence-union','outside-source-denominator':'outside-source-denominator','absent-from-retained-source-rows':'absent-from-retained-source-rows',unavailable:'unavailable','no-resolution-decision':'unavailable'};
const percent = (n,d) => d > 0 ? Number((n/d*100).toFixed(1)) : null;
const sorted = values => [...values].sort();
const check = (value,message) => { if (!value) throw Error(`Goal federation rejected: ${message}.`); };
const json = (root,p,max,signal) => r.secureBuffer(root,r.contained(root,p),max,signal).then(proof=>({...proof,value:JSON.parse(proof.raw),filename:r.contained(root,p)}));

async function load(root,configPath,signal) {
  const configRead=await json(root,configPath??`config/${DATASET}.json`,100_000,signal), config=configRead.value;
  check(r.exact(config,['schema_version','inputs']) && config.schema_version===`${DATASET}-config@1.0.0` && r.exact(config.inputs,INPUT_NAMES),'closed config');
  const inputs={};
  for (const name of INPUT_NAMES) {
    const pin=config.inputs[name], manifest=Object.hasOwn(pin,'release_id');
    check(r.exact(pin,manifest?['path','sha256','release_id','schema_version']:['path','sha256']) && /^[a-f0-9]{64}$/.test(pin.sha256),'pin schema');
    const proof=await r.secureBuffer(root,r.contained(root,pin.path),name==='access'?10_000_000:name==='entity_geography'?1_000_000:200_000,signal);
    check(proof.sha256===pin.sha256,`${name} hash drift`);
    const value=['summary_implementation','temporal_mapping'].includes(name)?null:JSON.parse(proof.raw);
    if(manifest) check(value.release_id===pin.release_id && value.schema_version===pin.schema_version,`${name} release identity`);
    inputs[name]={filename:r.contained(root,pin.path),proof,value};
  }
  const contractHashes={};for(const p of CONTRACTS)contractHashes[p]=(await r.secureBuffer(root,r.contained(root,p),200_000,signal)).sha256;
  check(inputs.goal.value.schema_version==='national-goal-completion-matrix@1.3.0' && inputs.matrix.value.schema_version==='national-exact-zip-industry-evidence-matrix@3.0.0','required versions');
  check(inputs.disposition.value.bindings.matrix.release_id===inputs.matrix.value.release_id && inputs.disposition.value.bindings.matrix.manifest_sha256===inputs.matrix.proof.sha256,'disposition matrix pin');
  const summary=await readExactZipIndustrySummaryV31({root,signal});
  check(summary.schema_version==='national-exact-zip-industry-summary-view@3.1.0' && summary.release_id===inputs.matrix.value.release_id && summary.manifest_sha256===inputs.matrix.proof.sha256 && summary.source_dimensions===51 && summary.zip5_rows===48194 && summary.industry_cells===2457894,'summary binding/conservation');
  check(summary.dimensions.length===51 && new Set(summary.dimensions.map(d=>d.id)).size===51,'summary dimensions');
  return {root,configRead,config,inputs,contractHashes,summary};
}

async function stream(input,name,artifact,signal,consume) { await r.streamArtifact(input.root,path.dirname(input.inputs[name].filename),r.declaration(input.inputs[name],artifact),signal,consume); }
async function artifact(input,name,artifact,max,signal) { return r.jsonArtifact(input.root,input.inputs[name],artifact,max,signal); }

export function federationGeographyScope(row,overlay) {
  if(row.classification==='explicit-placeholder') return 'explicit-placeholder';
  if(row.zcta_geoid===null) return 'non-zcta-unassigned';
  if(!overlay || overlay.overlay_status!=='complete-within-tolerance') return 'zcta-overlay-unresolved';
  if(overlay.crosses_state_boundary_materially) return 'multi-state-material';
  const fips=overlay.dominant_state_geo_id.slice(-2);
  return `${['60','66','69','72','78'].includes(fips)?'territory':'state'}:${fips}`;
}

async function derive(input,output,signal,hooks,verifyRelationship=true) {
  const {root,inputs,summary}=input;
  const disposition=await artifact(input,'disposition','state-dispositions.json',4_000_000,signal), scopes=new Map(disposition.map(row=>[row.scope_id,row]));
  check(scopes.size===60 && disposition.filter(row=>row.scope_id.startsWith('state:')).length===51 && disposition.reduce((n,row)=>n+row.zip5_rows,0)===48194,'closed geography scopes');
  const crosswalk=inputs.operational_crosswalk.value, industries=crosswalk.operational_industries;
  check(industries.length===9 && new Set(industries).size===9 && r.equal(sorted(Object.keys(inputs.industries.value.industries)),sorted(industries)),'industry roster');
  const states=disposition.filter(row=>row.scope_id.startsWith('state:')).sort((a,b)=>a.postal_abbreviation.localeCompare(b.postal_abbreviation));
  check(r.equal(sorted(states.map(row=>row.postal_abbreviation)),sorted(STATE_DC_CODES)),'51 state/DC roster');
  const stateIndustry=states.flatMap(state=>projectOperationalIndustryEvidence({crosswalk,summary,disposition:state,state:state.postal_abbreviation}).industries.map(industry=>({schema_version:`${DATASET}-state-industry@1.0.0`,state:state.postal_abbreviation,scope_id:state.scope_id,scope_semantics:'dominant Census ZCTA polygon overlay; excludes material cross-state, unresolved and non-ZCTA cohorts',zip5_rows:state.zip5_rows,...industry})));
  check(stateIndustry.length===459 && states.reduce((n,row)=>n+row.zip5_rows,0)===33455,'state-industry conservation');
  check(r.equal(stateIndustry.slice(0,9).map(row=>row.mapped_dimensions),[7,5,2,1,2,1,2,10,11]),'industry association counts');
  const overlays=new Map(),cohort=new Map(),nonZcta=new Map(),epaZips=new Map();
  await stream(input,'crosswalk','derived/zcta-overlay-summary.jsonl',signal,row=>{check(/^\d{5}$/.test(row.zcta)&&!overlays.has(row.zcta),'overlay identity');overlays.set(row.zcta,row);});
  await stream(input,'cohort','cohort.jsonl',signal,row=>{check(/^\d{5}$/.test(row.zip5)&&!cohort.has(row.zip5)&&r.CLASSIFICATIONS.includes(row.classification)&&row.usps_validity===null,'cohort identity/claim');cohort.set(row.zip5,{zip5:row.zip5,classification:row.classification,zcta_geoid:row.zcta_geoid});});
  check(overlays.size===33791 && cohort.size===48194,'cohort/ZCTA count');
  for(const a of inputs.non_zcta.value.artifacts.filter(a=>a.path.endsWith('.jsonl'))) await r.streamArtifact(root,path.dirname(inputs.non_zcta.filename),a,signal,row=>{check(cohort.has(row.zip5)&&cohort.get(row.zip5).zcta_geoid===null&&!nonZcta.has(row.zip5)&&row.state_assignment===null,'non-ZCTA context identity');nonZcta.set(row.zip5,{source_reported_code_context:row.source_reported_code_context,point_context:row.point_context});});
  check(nonZcta.size===14402,'non-ZCTA context cohort');
  await stream(input,'epa','zip5-evidence.jsonl.gz',signal,row=>{check(cohort.has(row.zip5)&&!epaZips.has(row.zip5),'EPA cohort identity');epaZips.set(row.zip5,{source_record_count:row.source_record_count,segment_counts:row.segment_counts});});
  check(epaZips.size===48194,'EPA cohort conservation');
  const epaRecordTotal=[...epaZips.values()].reduce((n,row)=>n+row.source_record_count,0),epaMembershipTotal=[...epaZips.values()].reduce((n,row)=>n+row.segment_counts.reduce((sum,item)=>sum+item.source_record_count,0),0);
  check(epaRecordTotal===inputs.epa.value.summary.source_record_count&&epaMembershipTotal===inputs.epa.value.summary.segment_assignments&&inputs.epa.value.claims.unique_business_count===null&&inputs.epa.value.claims.business_completeness===null,'EPA sidecar conservation/claim boundary');
  const dimensions=summary.dimensions.map(row=>row.id);
  const scopeCounts=Object.fromEntries(disposition.map(row=>[row.scope_id,0]));
  const observed=new Map(disposition.map(scope=>[scope.scope_id,Object.fromEntries(dimensions.map(id=>[id,{}]))]));
  const artifacts=[];let zipRows=0,cells=0;
  for(let prefix=0;prefix<100;prefix++) {
    r.stop(signal); const name=`prefix=${String(prefix).padStart(2,'0')}.json`,rows=await artifact(input,'matrix',name,30_000_000,signal),part=[];
    check(rows.length===r.declaration(inputs.matrix,name).record_count,'matrix partition rows');
    for(const row of rows) {
      const base=cohort.get(row.zip5);check(base && row.zip4===null && row.usps_validity===null && row.cohort_classification===base.classification && row.zcta_geoid===base.zcta_geoid && r.equal(sorted(Object.keys(row.cells)),sorted(dimensions)),'matrix row/cohort/dimensions');
      check(row.zip5.startsWith(String(prefix).padStart(2,'0')) && (part.length===0 || part.at(-1).zip5<row.zip5),'matrix order/prefix');
      const overlay=overlays.get(base.zcta_geoid),scope=federationGeographyScope(base,overlay);check(scopes.has(scope),'scope roster');scopeCounts[scope]++;
      const statuses=dimensions.map(id=>{
        const evidence=EVIDENCE_BY_RAW[row.cells[id].status];
        check(typeof evidence==='string','derived disposition');
        const counts=observed.get(scope)[id];counts[evidence]=(counts[evidence]??0)+1;cells++;return evidence;
      });
      part.push({schema_version:`${DATASET}-zip@1.0.0`,zip5:row.zip5,zip4:null,cohort_classification:base.classification,zcta_geoid:base.zcta_geoid,usps_validity:null,geography_scope:scope,overlay:overlay?{overlay_status:overlay.overlay_status,dominant_state_geo_id:overlay.dominant_state_geo_id,crosses_state_boundary_materially:overlay.crosses_state_boundary_materially}:null,dimension_evidence_statuses:statuses,non_zcta_context:nonZcta.get(row.zip5)??null,epa_supplemental:epaZips.get(row.zip5)});
      zipRows++;r.stop(signal);
    }
    artifacts.push(await r.writeRows(root,output,`zip-status/prefix=${String(prefix).padStart(2,'0')}.jsonl.gz`,'national-goal-zip-evidence-status-jsonl-gzip',part,signal,hooks));
    await hooks?.('matrix-partition',{prefix,zipRows});
  }
  check(zipRows===48194 && cells===2457894,'matrix full cell conservation');
  for(const scope of disposition) {
    check(scopeCounts[scope.scope_id]===scope.zip5_rows,'scope ZIP count');
    for(const id of dimensions) {
      const declared=scope.dimensions[id].derived_evidence_status_counts,actual=observed.get(scope.scope_id)[id];
      check(Object.entries(declared).every(([s,n])=>count(n)&&(actual[s]??0)===n) && Object.keys(actual).every(s=>Object.hasOwn(declared,s)),'state disposition independent matrix replay');
    }
  }
  const goal=await artifact(input,'goal','report.json',2_000_000,signal), access=inputs.access.value;
  const missingBroad=goal.jurisdictions.filter(state=>state.categories.find(c=>c.category_id==='general-business')?.datasets[0]?.availability_status==='unmeasured').map(state=>state.code).sort();
  check(missingBroad.length===40 && goal.all_business_completion_percent===null,'broad business gap');
  const accessCells=access.jurisdictions.flatMap(state=>state.industries.map(industry=>({state:state.state,industry:industry.industry,access_evidence_status:industry.accessEvidenceStatus,app_handoff_status:industry.appHandoff.status,authority_evidence:industry.evidence.filter(row=>row.type==='historical-state-publisher-assessment-hold'),action_class:industry.accessEvidenceStatus.startsWith('unsupported-')?'admission-review':'retained-reprocessing',acquisition_authorization:'not-asserted-by-this-federation'})));
  const accessCounts={};for(const row of accessCells)accessCounts[row.access_evidence_status]=(accessCounts[row.access_evidence_status]??0)+1;
  check(accessCells.length===459 && new Set(accessCells.map(row=>`${row.state}:${row.industry}`)).size===459 && accessCells.every(row=>STATE_DC_CODES.includes(row.state)&&industries.includes(row.industry)) && r.equal(accessCounts,access.summary.accessEvidenceStatusCounts) && accessCounts['unsupported-missing']===150 && accessCounts['unsupported-evidence-not-measured']===2,'access sidecar conservation');
  const temporalGaps=summary.dimensions.filter(row=>['stale','unmeasured'].includes(row.temporal_qualification.review_qualification)).map(row=>({dimension:row.id,...row.temporal_qualification,action_class:row.temporal_qualification.review_qualification==='stale'?'acquisition-required':'retained-reprocessing'}));
  check(temporalGaps.filter(row=>row.review_qualification==='stale').length===2 && temporalGaps.filter(row=>row.review_qualification==='unmeasured').length===20,'temporal gaps');
  const geography=await artifact(input,'geography','national-geography-goal-status.json',100_000,signal);
  const lifecycleSummary=inputs.lifecycle.value.summary;
  check(lifecycleSummary.profile_count===8011835&&Object.values(lifecycleSummary.lifecycle_evidence_counts).reduce((n,v)=>n+v,0)===lifecycleSummary.profile_count,'lifecycle manifest summary conservation');
  const relationshipRegistration=inputs.entity_geography_registration.value,relationshipManifest=inputs.entity_geography.value;
  check(relationshipRegistration.selected_release_id===relationshipManifest.release_id && relationshipRegistration.retained_releases.filter(row=>row.selected).length===1 && relationshipRegistration.retained_releases.find(row=>row.selected)?.manifest_sha256===inputs.entity_geography.proof.sha256,'geography relationship registration selection');
  const relationship=verifyRelationship
    ? await verifyBusinessEntityGeographyRelationship({root,release_id:relationshipManifest.release_id,expectedManifestSha256:inputs.entity_geography.proof.sha256,signal,requireRegistered:true,acceptPinnedHistoricalBindings:true})
    : {release_id:relationshipManifest.release_id,manifest_sha256:inputs.entity_geography.proof.sha256,summary:relationshipManifest.summary};
  const quality=relationship.summary;
  check(quality.profiles===8011835 && quality.profiles===lifecycleSummary.profile_count && Object.values(quality.postal).reduce((n,v)=>n+v,0)===quality.profiles && Object.values(quality.point).reduce((n,v)=>n+v,0)===quality.profiles && quality.reported_state_conflict===11 && Object.values(quality.source_counts).reduce((n,v)=>n+v,0)===quality.profiles,'geography relationship/lifecycle/registry conservation');
  const geographyQuality={schema_version:`${DATASET}-geography-relationship-quality@1.0.0`,relationship_release_id:relationship.release_id,relationship_manifest_sha256:relationship.manifest_sha256,profile_count:quality.profiles,postal_relationship_counts:quality.postal,point_relationship_counts:quality.point,reported_state_conflict_count:quality.reported_state_conflict,source_profile_counts:quality.source_counts,scope:'Aggregate relationship quality for the registry profile cohort; non-numerator and separate from ZIP5 evidence dimensions.',claims:{numerator:false,denominator:false,entity_assignment:false,polygon_assignment:false,usps_validity_verified:false,current_operation_verified:false,geocode_verified:false,business_completeness:null,acquisition_performed:false,production_enrollment:false,current_pointer_written:false,network_requests:0}};
  const summaryResult={schema_version:VERSION,scope:'50 states and District of Columbia; territories reported separately',zip5_cohort_rows:zipRows,source_dimensions:51,matrix_evidence_cells:cells,state_industry_rows:459,operational_industries:industries,dimension_order:dimensions,temporal_assessment:summary.temporal_qualification,geography_scope_counts:scopeCounts,industry_evidence_metrics:industries.map(industry=>{
    const rows=stateIndustry.filter(row=>row.id===industry),numerator=rows.reduce((n,row)=>n+row.measured_zip_dimension_cells,0),denominator=rows.reduce((n,row)=>n+row.zip_dimension_cell_denominator,0);
    return {industry,mapped_dimensions:rows[0].mapped_dimensions,measured_zip_dimension_cells:numerator,zip_dimension_cell_denominator:denominator,exact_zip_measurement_reach_percent:percent(numerator,denominator),scope:'33455 governed dominant-state Census ZCTA cohort rows'};
  }),gaps:{broad_business_missing_states:missingBroad.length,unsupported_industry_access_cells:150,unmeasured_industry_access_cells:2,stale_temporal_dimensions:2,unmeasured_temporal_dimensions:20},sidecars:{goal_matrix:{schema_version:goal.schema_version,denominator:goal.denominator,missing_broad_states:missingBroad},state_access:{generated_at:access.generatedAt,summary:access.summary,scope:'source-reported jurisdiction evidence; separate from Census overlay scopes'},epa:{summary:inputs.epa.value.summary,scope:'nonadditive retained environmental-program facility memberships'},geography:{status:geography},lifecycle:{assessment_as_of:inputs.lifecycle.value.assessment_as_of,summary:lifecycleSummary,scope:'source-profile lifecycle decisions; overlapping evidence units; separate from matrix dimensions'},entity_geography_relationship:geographyQuality},claims:CLAIMS};
  const gapLedger={schema_version:`${DATASET}-gaps@1.0.0`,broad_business:missingBroad.map(state=>({state,status:'missing-retained-broad-organization-layer',action_class:'admission-review',authorization_status:'not-asserted-by-this-federation',authority_evidence:goal.jurisdictions.find(row=>row.code===state).categories.find(row=>row.category_id==='general-business').datasets[0].authorization})),industry_access:accessCells.filter(row=>row.access_evidence_status.startsWith('unsupported-')),temporal:temporalGaps,special_geography:disposition.filter(row=>!row.scope_id.startsWith('state:')&&!row.scope_id.startsWith('territory:')).map(row=>({scope_id:row.scope_id,zip5_rows:row.zip5_rows,action_class:'retained-reprocessing',map_blocked:false})),claim_gaps:[{id:'all-business-denominator',value:null,blocking:false},{id:'current-general-business-operation',value:false,blocking:false}],claims:CLAIMS};
  const territories={schema_version:`${DATASET}-territories@1.0.0`,included_in_51_state_denominator:false,geography:disposition.filter(row=>row.scope_id.startsWith('territory:')).map(row=>({scope_id:row.scope_id,code:row.postal_abbreviation,zip5_rows:row.zip5_rows,dimensions:row.dimensions})),epa:[],claims:CLAIMS};
  await stream(input,'epa','territories.jsonl',signal,row=>territories.epa.push(row));
  check(territories.geography.length===5 && territories.geography.reduce((n,row)=>n+row.zip5_rows,0)===149 && territories.epa.length===5,'territories');
  for(const [name,type,rows] of [['national-summary.json','national-goal-evidence-summary-json',[summaryResult]],['state-industry-status.jsonl','national-goal-state-industry-status-jsonl',stateIndustry],['gap-ledger.json','national-goal-gap-ledger-json',[gapLedger]],['territories.json','national-goal-territory-evidence-json',[territories]]])artifacts.push(await r.writeRows(root,output,name,type,rows,signal,hooks));
  return {artifacts:artifacts.sort((a,b)=>a.path.localeCompare(b.path)),summary:summaryResult};
}

function manifestFor(input,result,createdAt) {
  check(typeof createdAt==='string'&&new Date(createdAt).toISOString()===createdAt,'timestamp');
  const body={schema_version:VERSION,dataset_id:DATASET,status:'immutable-local-review-only',publication_mode:'pointer-free',created_at:createdAt,inputs:input.config.inputs,config_sha256:input.configRead.sha256,contract_sha256:input.contractHashes,summary:{zip5_cohort_rows:48194,source_dimensions:51,matrix_evidence_cells:2457894,state_industry_rows:459,gaps:result.summary.gaps},claims:CLAIMS,verification_scope:'Replays every checksum-bound retained matrix cell and joins pinned aggregate evidence. Upstream record normalization, publisher authentication and current operation are not reverified.',artifacts:result.artifacts};
  return {release_id:`${DATASET}-${r.sha(JSON.stringify(body))}`,...body};
}
async function inventory(directory) { const names=await fs.readdir(directory),nested=names.includes('zip-status')?(await fs.readdir(path.join(directory,'zip-status'))).map(name=>`zip-status/${name}`):[];return sorted([...names.filter(n=>n!=='zip-status'),...nested]); }

export async function buildNationalGoalEvidenceFederation(options={}) {
  const root=await fs.realpath(path.resolve(options.root??APP_ROOT));r.stop(options.signal);
  const input=await load(root,options.configPath,options.signal),base=r.contained(root,`data/${DATASET}`),releases=path.join(base,'releases'),lock=path.join(base,'.build.lock');
  await fs.mkdir(releases,{recursive:true});await r.canonical(root,releases);let locked=false,stage;
  try {
    await fs.mkdir(lock);locked=true;stage=path.join(base,`.stage-${randomUUID()}`);await fs.mkdir(stage);
    const result=await derive(input,stage,options.signal,options.hooks,false),manifest=manifestFor(input,result,options.createdAt??new Date().toISOString());
    await fs.writeFile(path.join(stage,'manifest.json'),r.encoded(manifest),{flag:'wx'});await options.hooks?.('after-manifest-before-verification',{stage,manifest});r.stop(options.signal);
    await verifyNationalGoalEvidenceFederation(path.join(stage,'manifest.json'),{root,configPath:options.configPath,signal:options.signal,allowStaging:true,expectedReleaseId:manifest.release_id});
    await options.hooks?.('after-verification-before-publication',{stage,manifest});r.stop(options.signal);
    // Recheck pins and every output after hooks and before rename.
    check((await r.secureBuffer(root,input.configRead.filename,100_000,options.signal)).sha256===input.configRead.sha256,'publication config mutation');
    for(const [name,pin] of Object.entries(input.config.inputs))check((await r.secureBuffer(root,inputsPath(input,pin),name==='access'?10_000_000:name==='entity_geography'?1_000_000:200_000,options.signal)).sha256===pin.sha256,'publication input mutation');
    for(const [p,hash] of Object.entries(input.contractHashes))check((await r.secureBuffer(root,r.contained(root,p),200_000,options.signal)).sha256===hash,'publication contract mutation');
    check(r.equal(await inventory(stage),sorted(['manifest.json',...manifest.artifacts.map(a=>a.path)])),'publication inventory mutation');
    for(const a of manifest.artifacts) {const proof=await r.secureBuffer(root,r.contained(stage,a.path),100_000_000,options.signal);check(proof.sha256===a.sha256&&proof.bytes===a.bytes,'publication output mutation');}
    check((await r.secureBuffer(root,path.join(stage,'manifest.json'),200_000,options.signal)).sha256===r.sha(r.encoded(manifest)),'publication manifest mutation');
    const destination=path.join(releases,manifest.release_id);try{await fs.lstat(destination);check(false,'immutable destination already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
    await fs.rename(stage,destination);stage=null;return {releaseDirectory:destination,manifest,manifest_sha256:r.sha(r.encoded(manifest))};
  } finally {if(stage){r.contained(base,stage);await fs.rm(stage,{recursive:true,force:true});}if(locked)await fs.rmdir(lock);}
}

function inputsPath(input,pin) {return r.contained(input.root,pin.path);}

export async function verifyNationalGoalEvidenceFederation(manifestPath,options={}) {
  const root=await fs.realpath(path.resolve(options.root??APP_ROOT)),filename=r.contained(root,manifestPath),proof=await json(root,filename,200_000,options.signal),m=proof.value,directory=path.dirname(filename);
  check(m.schema_version===VERSION&&m.dataset_id===DATASET&&m.publication_mode==='pointer-free'&&r.equal(m.claims,CLAIMS),'manifest identity/claims');
  check(path.basename(directory)===m.release_id||options.allowStaging===true&&options.expectedReleaseId===m.release_id&&/^\.stage-[a-f0-9-]+$/.test(path.basename(directory)),'immutable/staging location');
  const expectedInventory=sorted(['manifest.json','national-summary.json','state-industry-status.jsonl','gap-ledger.json','territories.json',...Array.from({length:100},(_,i)=>`zip-status/prefix=${String(i).padStart(2,'0')}.jsonl.gz`)]);
  check(r.equal(await inventory(directory),expectedInventory),'closed output inventory');
  const input=await load(root,options.configPath,options.signal),replay=await fs.mkdtemp(path.join(path.dirname(directory),'.verify-'));
  try {
    const result=await derive(input,replay,options.signal),expected=manifestFor(input,result,m.created_at);check(r.equal(m,expected),'independent semantic reconstruction');
    for(const a of expected.artifacts){const actual=await r.secureBuffer(root,r.contained(directory,a.path),100_000_000,options.signal);check(actual.sha256===a.sha256&&actual.bytes===a.bytes,`artifact replay ${a.path}`);}
    check((await r.secureBuffer(root,filename,200_000,options.signal)).sha256===proof.sha256,'manifest changed');return {verified:true,release_id:m.release_id,manifest_sha256:proof.sha256,...m.summary,claims:m.claims};
  } finally {r.contained(root,replay);await fs.rm(replay,{recursive:true,force:true});}
}
