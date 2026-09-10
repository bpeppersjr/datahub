import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { verifySeptember10StateTransition } from './retained-childcare-reassessment.mjs';
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
export const TN_COVERAGE_REASSESSMENT = Object.freeze({
  id: "state-coverage-reassessment-20260908-tn-childcare",
  historicalRelease: INITIAL_REASSESSMENT.historicalRelease,
  historicalManifestSha256: INITIAL_REASSESSMENT.historicalManifestSha256,
  historicalStatesSha256: INITIAL_REASSESSMENT.historicalStatesSha256,
  predecessorRelease: COVERAGE_REASSESSMENT.currentRelease,
  predecessorManifestSha256: COVERAGE_REASSESSMENT.currentManifestSha256,
  predecessorStatesSha256: COVERAGE_REASSESSMENT.currentStatesSha256,
  currentRelease: "national-business-coverage-views-20260908-050200409Z-eff2f522",
  currentManifestSha256: "213b3c09ba2ec7f32e8f22fadac4f0482521cde2ee99f49d60d16ad3ce8c3276",
  currentStatesSha256: "66d48b510544a68a27093edfd9eb73774f8e65f2ee04e98842151422e26f026d",
});
export const RETAINED_COVERAGE_REASSESSMENT = Object.freeze({
  ...TN_COVERAGE_REASSESSMENT,
  id: 'state-coverage-reassessment-20260910-retained-childcare',
  predecessorRelease: TN_COVERAGE_REASSESSMENT.currentRelease,
  predecessorManifestSha256: TN_COVERAGE_REASSESSMENT.currentManifestSha256,
  predecessorStatesSha256: TN_COVERAGE_REASSESSMENT.currentStatesSha256,
  currentRelease: 'national-business-coverage-views-20260910-150931456Z-e22ce20b',
  currentManifestSha256: '74caa4757947b5d3e6457775f7d067594398325d8be9b1de3dd6298579df817b',
  currentStatesSha256: '6773f956fc7e578d41f49ee1c2ede3cc3b65c73d885b2888cc5e953b30a86238',
});
export const COVERAGE_REASSESSMENTS = Object.freeze([INITIAL_REASSESSMENT, DC_REASSESSMENT, COVERAGE_REASSESSMENT, TN_COVERAGE_REASSESSMENT, RETAINED_COVERAGE_REASSESSMENT]);
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

/** Reviewed MA/NJ -> TN transition, including unavailable ZIPs and points. */
export function compareTennesseeCoverageForReassessment(historical, current) {
  const states = compareStateCoverageForReassessment(historical, historical);
  if (!Array.isArray(current) || current.length !== 56 || new Set(current.map(row => row.postal_abbreviation)).size !== 56
    || historical.filter(row => row.postal_abbreviation === "TN").length !== 1) throw new Error("Tennessee reassessment requires 56 unique jurisdictions including TN.");
  for (const old of historical) {
    const state = old.postal_abbreviation, isTn = state === "TN", latest = current.find(row => row.postal_abbreviation === state), expected = structuredClone(old);
    const evidence = expected.registry_evidence, source = "tn-dhs-active-childcare-centers";
    if (!evidence || Object.hasOwn(evidence, "tn_childcare_reporting") || Object.hasOwn(evidence.source_profile_counts_by_reported_address_state ?? {}, source)
      || Object.hasOwn(evidence.source_profile_counts_by_coordinate_assigned_state ?? {}, source)) throw new Error("Tennessee predecessor already contains unreviewed source evidence.");
    expected.lineage = { ...expected.lineage,
      registry_release_id: "national-business-registry-20260908-033936268Z-663f4b84",
      entity_resolution_release_id: "business-entity-resolution-20260908-045749556Z-3bd1103d",
      entity_resolution_benchmark_release_id: "business-entity-resolution-benchmark-sample-20260908-050109576Z-eb138cf9",
      transformation_version: "national-business-coverage-views@2.9.0" };
    evidence.tn_childcare_reporting = { records: isTn ? 1863 : 0, with_zip: isTn ? 1691 : 0, without_zip: isTn ? 172 : 0,
      missing_zip_reasons: { "missing-source-zip": isTn ? 27 : 0, "invalid-source-zip-placeholder": isTn ? 145 : 0 }, missing_points: isTn ? 3 : 0, zip_inferred: false };
    if (isTn) {
      evidence.reported_address_profile_count += 1863;
      evidence.reporting_only_count += 1863;
      evidence.reporting_only_coordinate_assigned_count += 1860;
      evidence.coordinate_assigned_profile_count += 1860;
      evidence.source_profile_counts_by_reported_address_state[source] = 1863;
      evidence.source_profile_counts_by_coordinate_assigned_state[source] = 1860;
      evidence.latest_observed_at = "2026-09-08T00:36:36.628Z";
    }
    if (!isDeepStrictEqual(expected, latest)) throw new Error(`Unreviewed Tennessee transition evidence for ${state}.`);
    const reviewed = states.find(row => row.state === state), readiness = assessStateBusinessSourceReadiness(latest);
    reviewed.historical_source_scope_status = reviewed.source_scope_status;
    reviewed.source_scope_status = readiness.source_scope_status;
    reviewed.current_coverage = currentCoverageProjection(latest);
    reviewed.source_profile_counts = latest.registry_evidence.source_profile_counts_by_reported_address_state;
    reviewed.classification_basis = "reviewed-current-readiness-policy-1.2.0-not-historical-snapshot-rewrite";
    if (isTn) {
      if (reviewed.historical_source_scope_status !== "national-sector-layers-only" || reviewed.source_scope_status !== "statewide-scoped-layer-only") throw new Error("Unexpected Tennessee classification transition.");
      reviewed.reviewed_industry_addition = readiness.statewide_reporting_industry_evidence;
      reviewed.reviewed_postal_coordinate_gaps = structuredClone(evidence.tn_childcare_reporting);
    } else if (reviewed.historical_source_scope_status !== reviewed.source_scope_status) throw new Error("Unreviewed non-Tennessee classification change.");
  }
  return states;
}

export async function loadStateCoverageReassessment(pointer,{root=APP_ROOT}={}) {
  const proof=COVERAGE_REASSESSMENTS.find(item=>item.currentRelease===pointer?.release_id);
  if(!proof || pointer?.dataset_id!=="national-business-coverage-views" || pointer.release_id!==proof.currentRelease
    || pointer.manifest!==`releases/${proof.currentRelease}/manifest.json`)throw new Error("Current coverage has no reviewed reassessment transition.");
  root=path.resolve(root);
  const rows=[];
  const isTennessee = proof.id === TN_COVERAGE_REASSESSMENT.id;
  const isRetained = proof.id === RETAINED_COVERAGE_REASSESSMENT.id;
  for(const side of isTennessee || isRetained ? ['predecessor','current'] : proof.intermediateRelease ? ['historical','intermediate','current'] : ['historical','current']){
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
  let states, reviewedTransitionChangedStates=[], historicalEligibilityRows=rows[0];
  if(isRetained){
    const previous=await loadStateCoverageReassessment({dataset_id:pointer.dataset_id,release_id:proof.predecessorRelease,manifest:`releases/${proof.predecessorRelease}/manifest.json`},{root});
    if(!isDeepStrictEqual(previous.currentRows,rows[0]))throw new Error('Retained childcare predecessor changed.');
    verifySeptember10StateTransition(rows[0],rows[1]);
    states=compareStateCoverageForReassessment(rows[0],rows[0]);
    for(const state of states){
      const latest=rows[1].find(row=>row.postal_abbreviation===state.state);
      if(assessStateBusinessSourceReadiness(latest).source_scope_status!==state.source_scope_status)throw new Error('Unreviewed retained readiness change.');
      state.historical_coverage=previous.states.find(row=>row.state===state.state).historical_coverage;
      state.current_coverage=currentCoverageProjection(latest);
      state.source_profile_counts=latest.registry_evidence.source_profile_counts_by_reported_address_state;
      state.reviewed_retained_candidate_rows=latest.retained_childcare_reporting.candidate_rows;
      state.classification_basis='exact-reviewed-september10-transition-current-readiness-policy-1.2.0';
    }
    reviewedTransitionChangedStates=['OH'];
    historicalEligibilityRows=getReviewedHistoricalEligibilityRows(previous,rows[0]);
  }else if(isTennessee){
    const previous = await loadStateCoverageReassessment({ dataset_id: pointer.dataset_id, release_id: proof.predecessorRelease, manifest: `releases/${proof.predecessorRelease}/manifest.json` }, { root });
    if (!isDeepStrictEqual(previous.currentRows, rows[0]) || previous.currentManifestSha256 !== proof.predecessorManifestSha256 || previous.currentStatesSha256 !== proof.predecessorStatesSha256) throw new Error("Tennessee predecessor proof changed.");
    states=compareTennesseeCoverageForReassessment(rows[0],rows[1]);
    reviewedTransitionChangedStates=['TN'];
    historicalEligibilityRows=getReviewedHistoricalEligibilityRows(previous,rows[0]);
    for(const state of states)state.historical_coverage=previous.states.find(prior=>prior.state===state.state).historical_coverage;
  }else if(isChildcare){
    const historical=compareStateCoverageForReassessment(rows[0],rows[1]);
    states=compareChildcareCoverageForReassessment(rows[1],rows[2]);
    reviewedTransitionChangedStates=states.filter(state=>JSON.stringify(state.historical_coverage)!==JSON.stringify(state.current_coverage)).map(state=>state.state);
    for(const state of states)state.historical_coverage=historical.find(prior=>prior.state===state.state).historical_coverage;
  }else states=compareStateCoverageForReassessment(...rows);
  const result={schemaVersion:1,...proof,states,currentRows:rows.at(-1),sourcePolicyRevalidated:false,sourceDecisionsCarriedForward:true,
    reviewedTransitionChangedStates,
    ...(isRetained ? {reviewedRetainedCandidateAdditions:{PA:4995,CT:1390,MD:1772,CO:1648,UT:422},retainedCandidatesWithoutReportedState:1979} : {}),
    coverageProjectionChangedStates:states.filter(state=>JSON.stringify(state.historical_coverage)!==JSON.stringify(state.current_coverage)).map(state=>state.state),
    reviewedIndustryAdditions:isRetained ? {OH:4237} : isTennessee ? { TN:1863 } : isChildcare ? { MA:3007, NJ:4075 } : {},
    semantics:isRetained ? 'Exact reviewed Ohio reporting-only and retained candidate transition. Preserves historical eligibility, source-policy holds and unknown address states. Retained counts are separate from canonical profiles; no acquisition, export, accuracy or completeness approval.' : isTennessee ? "Exact reviewed MA/NJ-to-Tennessee reporting-only transition under readiness policy 1.2.0; preserves all 172 unavailable ZIPs, three missing points and historical eligibility/holds. No identity matching, source-policy approval, new acquisition authority or complete-business claim."
      : isChildcare ? "Explicit reviewed MA/NJ childcare reporting-only addition; current industry scope is derived under policy 1.1.0. Historical broad-registry observations, holds and authorizations remain unchanged. Counts are source rows, not unique businesses or completeness percentages."
      : "Coverage-only reassessment; retain historical source observations, holds and authorizations. Counts are profiles, not business completeness percentages."};
  verifiedEligibility.set(result,{historicalRows:structuredClone(historicalEligibilityRows),currentRowsSha256:hash(JSON.stringify(rows.at(-1)))});
  return result;
}
