import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { assessStateBusinessSourceReadiness } from "./business-state-source-readiness.mjs";

// Explicit reviewed transitions, not automatic acceptance of future releases.
const INITIAL_REASSESSMENT = Object.freeze({
  id: "state-coverage-reassessment-20260907",
  historicalRelease: "national-business-coverage-views-20260902-115337634Z-ba689784",
  currentRelease: "national-business-coverage-views-20260907-174411739Z-4169d204",
  historicalManifestSha256: "594e8bcd3add044662815598eba86138e2657562147b3d79357cfb423de6b672",
  currentManifestSha256: "66484ec880b47164d269318039e402fd7e304e4aef8f442e1ecc3b7d509a3d01",
  historicalStatesSha256: "6a3d4054953190a2f6f43c94630e2edaf2bd6e6d87039fd7f2b0af56916860a4",
  currentStatesSha256: "4d02b711e45a4fd69f633f9f91349712f21066afd50c95926cdb89d01a5bb330",
});
const DC_REASSESSMENT = Object.freeze({
  ...INITIAL_REASSESSMENT,
  id: "state-coverage-reassessment-20260907-dc-refresh",
  currentRelease: "national-business-coverage-views-20260907-223035676Z-eaf37740",
  currentManifestSha256: "6add23501019da0e5c503f3a7eaada6ce5e653362866f29741b302fa5ed6beb8",
  currentStatesSha256: "ca25ca31b50144ca1167475b75ca8ca6e3df3f252e8ce4aa7bb137e270133bef",
});
export const COVERAGE_REASSESSMENT = Object.freeze({
  ...INITIAL_REASSESSMENT,
  id: "state-coverage-reassessment-20260908-childcare",
  intermediateRelease: DC_REASSESSMENT.currentRelease, intermediateManifestSha256: DC_REASSESSMENT.currentManifestSha256, intermediateStatesSha256: DC_REASSESSMENT.currentStatesSha256,
  currentRelease: "national-business-coverage-views-20260908-021343856Z-ac4a5790",
  currentManifestSha256: "b01948f88932a2cbe3059e3a3583e4a036fd3455c6e20bc7c9551a47fa0e322a",
  currentStatesSha256: "659b1ef7519e12cb288df439e887345afeeb092d7b08715500a444ab1ff8018b",
});
export const COVERAGE_REASSESSMENTS = Object.freeze([INITIAL_REASSESSMENT, DC_REASSESSMENT, COVERAGE_REASSESSMENT]);
const REVIEWED_CHILDCARE_ADDITIONS = Object.freeze({ MA: Object.freeze(["ma-licensed-center-based-childcare", 3007]), NJ: Object.freeze(["nj-licensed-childcare-centers", 4075]) });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const verifiedEligibility = new WeakMap();

export function getReviewedHistoricalEligibilityRows(reassessment, currentRows) {
  const verified = verifiedEligibility.get(reassessment);
  if(!verified || hash(JSON.stringify(currentRows))!==verified.currentRowsSha256)throw new Error("Historical eligibility requires an unaltered, verified coverage reassessment.");
  return structuredClone(verified.historicalRows);
}

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

/** Exact reviewed addition, never a general source-roster exception. */
export function compareChildcareCoverageForReassessment(historical, current) {
  const sanitized = structuredClone(current), before = new Map(historical.map(row => [row.postal_abbreviation, row]));
  const canonicalMap = value => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  for (const row of sanitized) {
    const state = row.postal_abbreviation, old = before.get(state)?.registry_evidence, latest = row.registry_evidence;
    if (!old || !latest) throw new Error("Missing reviewed childcare state evidence.");
    const addition = REVIEWED_CHILDCARE_ADDITIONS[state], amount = addition?.[1] ?? 0;
    for (const key of ["source_profile_counts_by_reported_address_state", "source_profile_counts_by_coordinate_assigned_state"]) {
      const map = latest[key] ?? {};
      if (addition) {
        if (Object.hasOwn(old[key] ?? {}, addition[0]) || map[addition[0]] !== amount) throw new Error("Reviewed childcare source count differs.");
        delete map[addition[0]];
      }
      if (canonicalMap(old[key]) !== canonicalMap(map)) throw new Error(`Unreviewed source count or roster changed for ${state}.`);
    }
    if (latest.matching_profile_count !== old.reported_address_profile_count || latest.reporting_only_count !== amount
      || latest.reporting_only_coordinate_assigned_count !== amount || latest.reported_address_profile_count !== old.reported_address_profile_count + amount
      || latest.coordinate_assigned_profile_count !== old.coordinate_assigned_profile_count + amount
      || latest.reported_coordinate_state_conflict_count !== old.reported_coordinate_state_conflict_count) throw new Error(`Reviewed childcare/matching totals differ for ${state}.`);
  }
  const states = compareStateCoverageForReassessment(historical, sanitized);
  for (const state of states) {
    const latest = current.find(row => row.postal_abbreviation === state.state), readiness = assessStateBusinessSourceReadiness(latest);
    state.historical_source_scope_status = state.source_scope_status;
    state.source_scope_status = readiness.source_scope_status;
    state.source_profile_counts = latest.registry_evidence.source_profile_counts_by_reported_address_state;
    state.classification_basis = "reviewed-current-readiness-policy-1.1.0-not-historical-snapshot-rewrite";
    if (REVIEWED_CHILDCARE_ADDITIONS[state.state]) {
      if (state.historical_source_scope_status !== "national-sector-layers-only" || state.source_scope_status !== "statewide-scoped-layer-only") throw new Error("Unexpected reviewed childcare classification transition.");
      state.reviewed_industry_addition = readiness.statewide_reporting_industry_evidence;
    } else if (state.historical_source_scope_status !== state.source_scope_status) throw new Error("Unreviewed state classification transition.");
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
  const proof=COVERAGE_REASSESSMENTS.find(item=>item.currentRelease===pointer?.release_id);
  if(!proof || pointer?.dataset_id!=="national-business-coverage-views" || pointer.release_id!==proof.currentRelease
    || pointer.manifest!==`releases/${proof.currentRelease}/manifest.json`)throw new Error("Current coverage has no reviewed reassessment transition.");
  root=path.resolve(root);
  const rows=[];
  for(const side of proof.intermediateRelease ? ['historical','intermediate','current'] : ['historical','current']){
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
  const isChildcare = proof.id === COVERAGE_REASSESSMENT.id;
  let states, reviewedTransitionChangedStates=[];
  if(isChildcare){
    const historical=compareStateCoverageForReassessment(rows[0],rows[1]);
    states=compareChildcareCoverageForReassessment(rows[1],rows[2]);
    reviewedTransitionChangedStates=states.filter(state=>JSON.stringify(state.historical_coverage)!==JSON.stringify(state.current_coverage)).map(state=>state.state);
    for(const state of states)state.historical_coverage=historical.find(prior=>prior.state===state.state).historical_coverage;
  }else states=compareStateCoverageForReassessment(...rows);
  const result={schemaVersion:1,...proof,states,currentRows:rows.at(-1),sourcePolicyRevalidated:false,sourceDecisionsCarriedForward:true,
    reviewedTransitionChangedStates,
    coverageProjectionChangedStates:states.filter(state=>JSON.stringify(state.historical_coverage)!==JSON.stringify(state.current_coverage)).map(state=>state.state),
    reviewedIndustryAdditions:isChildcare ? { MA:3007, NJ:4075 } : {},
    semantics:isChildcare ? "Explicit reviewed MA/NJ childcare reporting-only addition; current industry scope is derived under policy 1.1.0. Historical broad-registry observations, holds and authorizations remain unchanged. Counts are source rows, not unique businesses or completeness percentages."
      : "Coverage-only reassessment; retain historical source observations, holds and authorizations. Counts are profiles, not business completeness percentages."};
  verifiedEligibility.set(result,{historicalRows:structuredClone(rows[0]),currentRowsSha256:hash(JSON.stringify(rows.at(-1)))});
  return result;
}
