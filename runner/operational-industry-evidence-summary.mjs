import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { readExactZipIndustrySummaryV31 } from "./exact-zip-industry-summary-v3-1.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const check = (value, message) => { if (!value) throw new Error(`Operational industry evidence rejected: ${message}.`); };
const STATES = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]);
const DERIVED = ["evidence-present","measured-zero","source-did-not-publish-for-zip","outside-source-evidence-union","outside-source-denominator","absent-from-retained-source-rows","unavailable"];
const percent = (n, d) => d ? Number((n / d * 100).toFixed(1)) : null;
async function boundedJson(file, max) { const resolved = await fs.realpath(file), info = await fs.lstat(resolved); check(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= max, "bounded regular file"); const bytes = await fs.readFile(resolved); const after = await fs.lstat(resolved); check(after.size === info.size && after.mtimeMs === info.mtimeMs, "file changed while reading"); return { value: JSON.parse(bytes), bytes, sha256: sha(bytes), path: resolved }; }

export function projectOperationalIndustryEvidence({ crosswalk, summary, disposition, state }) {
  check(crosswalk?.schema_version === "exact-zip-operational-industry-crosswalk@1.0.0" && crosswalk.matrix_schema_version === summary?.schema_version, "crosswalk version");
  check(STATES.has(state), "state");
  const summaryById = new Map(summary.dimensions.map(row => [row.id, row]));
  const dimensionIds = Object.keys(disposition.dimensions ?? {});
  check(summary.source_dimensions === 51 && summary.zip5_rows === 48194 && summary.industry_cells === 2457894 && summaryById.size === 51, "registered summary totals");
  check(crosswalk.dimensions.length === 51 && dimensionIds.length === 51, "closed dimension count");
  check(new Set(crosswalk.operational_industries).size === 9 && new Set(crosswalk.dimensions.map(row => row.id)).size === 51, "closed crosswalk roster");
  check(crosswalk.dimensions.every(row => dimensionIds.includes(row.id) && summaryById.has(row.id) && Array.isArray(row.industries) && new Set(row.industries).size === row.industries.length && row.industries.every(id => crosswalk.operational_industries.includes(id)) && (row.industries.length > 0 ? row.unmapped_reason === undefined : typeof row.unmapped_reason === "string" && row.unmapped_reason.length > 0)), "dimension mapping");
  check(dimensionIds.every(id => crosswalk.dimensions.some(row => row.id === id)), "unknown disposition dimension");
  check(crosswalk.claims?.cross_source_entity_counts_additive === false && crosswalk.claims.business_completeness === null && crosswalk.claims.industry_completeness === null && crosswalk.claims.current_operation_verified === false && crosswalk.claims.zip4_joined === false, "claim boundary");
  const industries = crosswalk.operational_industries.map(industry => {
    const mappings = crosswalk.dimensions.filter(row => row.industries.includes(industry));
    check(mappings.length > 0, `empty ${industry} mapping`);
    const dimensions = mappings.map(mapping => {
      const source = disposition.dimensions[mapping.id], temporal = summaryById.get(mapping.id).temporal_qualification;
      check(source.dimension_id === mapping.id && DERIVED.every(key => Number.isSafeInteger(source.derived_evidence_status_counts?.[key])) && DERIVED.reduce((n,key)=>n+source.derived_evidence_status_counts[key],0) === disposition.zip5_rows, `invalid ${mapping.id} state cells`);
      const measured = source.derived_evidence_status_counts["evidence-present"] + source.derived_evidence_status_counts["measured-zero"];
      return { id:mapping.id, measured_zip_dimension_cells:measured, positive_zip_dimension_cells:source.derived_evidence_status_counts["evidence-present"], disposition_counts:{...source.derived_evidence_status_counts}, temporal_qualification:{ source_key:temporal.source_key, source_release_id:temporal.source_release_id, source_reference_at:temporal.source_reference_at, review_due_at:temporal.review_due_at, review_qualification:temporal.review_qualification, semantic_class:temporal.semantic_class, source_status_term:temporal.source_status_term } };
    });
    const measured = dimensions.reduce((n,row)=>n+row.measured_zip_dimension_cells,0), denominator = disposition.zip5_rows * dimensions.length;
    const evidenced = dimensions.filter(row => row.measured_zip_dimension_cells > 0).length;
    return { id:industry, mapped_dimensions:dimensions.length, dimensions_with_retained_evidence:evidenced, dimension_evidence_availability_percent:percent(evidenced, dimensions.length), measured_zip_dimension_cells:measured, zip_dimension_cell_denominator:denominator, exact_zip_measurement_reach_percent:percent(measured, denominator), dimensions };
  });
  return { schema_version:"operational-industry-evidence-summary@1.0.0", state:{code:state,name:disposition.state_name,fips:disposition.state_fips,governed_zcta_zip5_rows:disposition.zip5_rows}, industries, unmapped_dimensions:crosswalk.dimensions.filter(row=>row.industries.length===0).map(row=>({id:row.id,reason:row.unmapped_reason})), special_geography:{included_in_state_denominator:false,non_zcta_unassigned_reported_separately:true,material_cross_state_zctas_reported_separately:true}, claims:{metric_unit:"ZIP5-by-source-dimension evidence cells",business_or_entity_counts_added:false,business_completeness:null,industry_completeness:null,current_operation_verified:false,usps_validity_verified:false,zip4_joined:false,network_requests:0,runtime_writes:0,production_enrollment:false,export_authorized:false} };
}

export async function readOperationalIndustryEvidenceSummary({ root=APP_ROOT, state, summaryReader=readExactZipIndustrySummaryV31 }={}) {
  check(STATES.has(state), "state"); root=await fs.realpath(path.resolve(root));
  const crosswalkRead=await boundedJson(path.join(root,"config","exact-zip-operational-industry-crosswalk.json"),200_000);
  const registrationRead=await boundedJson(path.join(root,"config","datasets","state-exact-zip-industry-evidence-disposition-v3-0.json"),200_000), registration=registrationRead.value;
  check(registration.schema_version==="3.0.0"&&registration.runtime_pointer===null&&registration.production_enrollment===false&&registration.retained_release?.dimension_count===51&&registration.retained_release?.industry_cells===2457894,"disposition registration");
  const manifestRead=await boundedJson(path.join(root,...registration.retained_release.manifest.split("/")),100_000), manifest=manifestRead.value;
  check(manifestRead.sha256===registration.retained_release.manifest_sha256&&manifest.release_id===registration.retained_release.release_id&&manifest.bindings?.matrix?.release_id,"disposition manifest");
  const artifact=manifest.artifacts?.[0], artifactRead=await boundedJson(path.join(path.dirname(manifestRead.path),artifact?.path??""),4_000_000);
  check(artifactRead.sha256===registration.retained_release.artifact_sha256&&artifactRead.bytes.length===registration.retained_release.artifact_bytes&&artifact.sha256===artifactRead.sha256,"disposition artifact");
  const states=artifactRead.value.filter(row=>/^state:\d{2}$/.test(row.scope_id)); check(states.length===51&&new Set(states.map(row=>row.postal_abbreviation)).size===51,"state roster");
  const row=states.find(item=>item.postal_abbreviation===state); check(row,"state row");
  const summary=await summaryReader({root}); check(summary.release_id===manifest.bindings.matrix.release_id&&summary.manifest_sha256===manifest.bindings.matrix.manifest_sha256,"summary matrix binding");
  return {...projectOperationalIndustryEvidence({crosswalk:crosswalkRead.value,summary,disposition:row,state}),provenance:{crosswalk_sha256:crosswalkRead.sha256,summary_release_id:summary.release_id,summary_manifest_sha256:summary.manifest_sha256,state_disposition_release_id:manifest.release_id,state_disposition_manifest_sha256:manifestRead.sha256,state_disposition_artifact_sha256:artifactRead.sha256}};
}
