import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';

// Fingerprint of all 56 complete metric objects, independently reconciled with
// the retained credential source. This read-time check is not a new source replay.
const METRICS_SHA256='5ad9efe3c40cfd0048b00f1e3b5d7ea6131463df67cc02b478cd05c25af57123';
const lineage={registry_release_id:'national-business-registry-20260911-022652067Z-1ec656c3',
  entity_resolution_release_id:'business-entity-resolution-20260911-040411512Z-e6812503',
  entity_resolution_benchmark_release_id:'business-entity-resolution-benchmark-sample-20260911-040724863Z-9844fbb3'};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const check=value=>{if(!value)throw Error('Unreviewed September 11 credential state transition.');};

/** Only the reviewed lineage replacement and exact credential metrics may differ. */
export function verifySeptember11CredentialStateTransition(before,after){
  for(const rows of [before,after])check(Array.isArray(rows)&&rows.length===56
    &&rows.every(row=>typeof row?.postal_abbreviation==='string')&&new Set(rows.map(row=>row.postal_abbreviation)).size===56);
  const current=new Map(after.map(row=>[row.postal_abbreviation,row]));
  const metrics=after.map(row=>[row.postal_abbreviation,row.mn_construction_credential_reporting]).sort(([a],[b])=>a.localeCompare(b));
  check(createHash('sha256').update(JSON.stringify(canonical(metrics))).digest('hex')===METRICS_SHA256);
  let total=0,nonzero=0,missing=0;
  for(const old of before){
    const latest=current.get(old.postal_abbreviation);check(latest&&!Object.hasOwn(old,'mn_construction_credential_reporting'));
    const metric=latest.mn_construction_credential_reporting;
    check(metric.selected_cohort_rows===11456&&metric.identity_matching_eligible===false&&metric.physical_site_eligible===false
      &&metric.geographic_assignment_performed===false&&metric.current_operations_verified===false
      &&metric.unique_business_count===null&&metric.active_business_count===null&&metric.national_completeness_percent===null
      &&metric.public_export_authorized===false&&metric.export_policy==='local-review-only'&&metric.zip4_aggregated===false);
    const expected=structuredClone(old);expected.lineage={...expected.lineage,...lineage};
    expected.mn_construction_credential_reporting=metric;check(same(expected,latest));
    total+=metric.credential_rows;nonzero+=Number(metric.credential_rows>0);missing+=metric.missing_reported_zip5_rows;
  }
  check(total===11456&&nonzero===34&&missing===1&&current.get('MN').mn_construction_credential_reporting.credential_rows===10899
    &&current.get('WI').mn_construction_credential_reporting.missing_reported_zip5_rows===1);
}
