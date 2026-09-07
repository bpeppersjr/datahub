import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { assessStateBusinessSourceReadiness } from "./business-state-source-readiness.mjs";

// An explicit reviewed transition, not automatic acceptance of future reporting releases.
export const COVERAGE_REASSESSMENT = Object.freeze({
  id: "state-coverage-reassessment-20260907",
  historicalRelease: "national-business-coverage-views-20260902-115337634Z-ba689784",
  currentRelease: "national-business-coverage-views-20260907-174411739Z-4169d204",
  historicalManifestSha256: "594e8bcd3add044662815598eba86138e2657562147b3d79357cfb423de6b672",
  currentManifestSha256: "66484ec880b47164d269318039e402fd7e304e4aef8f442e1ecc3b7d509a3d01",
  historicalStatesSha256: "6a3d4054953190a2f6f43c94630e2edaf2bd6e6d87039fd7f2b0af56916860a4",
  currentStatesSha256: "4d02b711e45a4fd69f633f9f91349712f21066afd50c95926cdb89d01a5bb330",
});
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export function currentCoverageProjection(row) {
  const reported=row.registry_evidence?.reported_address_profile_count;
  const baseline=row.nonemployer_baseline?.nonemployer_establishments;
  return { reported_profiles:reported, coordinate_profiles:row.registry_evidence?.coordinate_assigned_profile_count,
    nonemployer_baseline_2023:baseline, baseline_minus_profiles:baseline-reported,
    diagnostic_profile_percent:Number.isFinite(baseline)&&baseline>0?Number((reported/baseline*100).toFixed(1)):null,
    material_zctas:row.zcta_coverage?.material_intersecting_zcta_count,
    zctas_with_record_level_evidence:row.zcta_coverage?.zctas_with_record_level_source_contribution };
}

export function compareStateCoverageForReassessment(historical,current) {
  const index = rows => {
    if(!Array.isArray(rows)||rows.length!==56)throw new Error("Reassessment requires all 56 state-equivalent views.");
    const map=new Map();
    for(const row of rows){if(!row.postal_abbreviation || map.has(row.postal_abbreviation))throw new Error("Duplicate or missing reassessment jurisdiction.");map.set(row.postal_abbreviation,row);}
    return map;
  };
  const before=index(historical),after=index(current),states=[];
  for(const [state,oldRow] of before){
    const newRow=after.get(state);
    if(!newRow || oldRow.state_fips!==newRow.state_fips || oldRow.is_50_states_or_dc!==newRow.is_50_states_or_dc)throw new Error("Reassessment jurisdiction identity changed.");
    const oldScope=assessStateBusinessSourceReadiness(oldRow).source_scope_status;
    const newScope=assessStateBusinessSourceReadiness(newRow).source_scope_status;
    if(oldScope!==newScope)throw new Error(`Source-scope classification changed for ${state}; a new source assessment is required.`);
    const roster=row=>Object.keys(row.registry_evidence?.source_profile_counts_by_reported_address_state??{}).sort();
    if(JSON.stringify(roster(oldRow))!==JSON.stringify(roster(newRow)))throw new Error(`Reported source roster changed for ${state}; a new source assessment is required.`);
    states.push({state,source_scope_status:newScope,classification_basis:'current-readiness-policy',historical_coverage:currentCoverageProjection(oldRow),current_coverage:currentCoverageProjection(newRow),
      source_profile_counts:newRow.registry_evidence?.source_profile_counts_by_reported_address_state??{},
      source_policy_revalidated:false,acquisition_authorization_changed:false});
  }
  return states;
}

async function checkedFile(root,file) {
  const absolute=path.resolve(root,file),relative=path.relative(root,absolute);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error("Reassessment path escapes datahub.");
  if(path.resolve(await realpath(absolute))!==absolute)throw new Error("Reassessment evidence crosses a link.");
  return readFile(absolute);
}

export async function loadStateCoverageReassessment(pointer,{root=APP_ROOT}={}) {
  const proof=COVERAGE_REASSESSMENT;
  if(pointer?.dataset_id!=="national-business-coverage-views" || pointer.release_id!==proof.currentRelease
    || pointer.manifest!==`releases/${proof.currentRelease}/manifest.json`)throw new Error("Current coverage has no reviewed reassessment transition.");
  root=path.resolve(root);
  const rows=[];
  for(const side of ['historical','current']){
    const release=proof[`${side}Release`], directory=`data/business-coverage-views/releases/${release}`;
    const manifestBytes=await checkedFile(root,`${directory}/manifest.json`);
    if(hash(manifestBytes)!==proof[`${side}ManifestSha256`])throw new Error("Reassessment manifest evidence changed.");
    const manifest=JSON.parse(manifestBytes);
    if(manifest.release_id!==release||manifest.dataset_id!==pointer.dataset_id)throw new Error("Reassessment manifest identity mismatch.");
    const artifact=manifest.artifacts.find(item=>item.artifact_type==='state-coverage-view-jsonl');
    if(artifact?.path!=='views/states.jsonl'||artifact.record_count!==56||artifact.sha256!==proof[`${side}StatesSha256`])throw new Error("Reassessment state artifact identity mismatch.");
    const bytes=await checkedFile(root,`${directory}/${artifact.path}`);
    if(bytes.length!==artifact.bytes||hash(bytes)!==artifact.sha256)throw new Error("Reassessment state artifact evidence changed.");
    rows.push(bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse));
  }
  const states=compareStateCoverageForReassessment(...rows);
  return {schemaVersion:1,...proof,states,currentRows:rows[1],sourcePolicyRevalidated:false,sourceDecisionsCarriedForward:true,
    coverageProjectionChangedStates:states.filter(state=>JSON.stringify(state.historical_coverage)!==JSON.stringify(state.current_coverage)).map(state=>state.state),
    semantics:"Coverage-only reassessment; retain historical source observations, holds and authorizations. Counts are profiles, not business completeness percentages."};
}
