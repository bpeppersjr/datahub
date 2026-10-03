import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {FIFTY_STATES_AND_DC} from './business-state-source-readiness.mjs';
import {readNationalIrsEoBmfOrganizationCoverage} from './national-irs-eo-bmf-organization-coverage.mjs';

const DATASET='national-irs-eo-bmf-organization-coverage';
const check=(value,message='Retained IRS adjacent evidence is unavailable.')=>{if(!value)throw Error(message);};

export async function readRetainedIrsStateAdjacentEvidence({root=APP_ROOT,state,pointerPath,signal,coverageReader=readNationalIrsEoBmfOrganizationCoverage}={}){
 check(FIFTY_STATES_AND_DC.includes(state),'Adjacent IRS evidence requires one state or D.C. code.');signal?.throwIfAborted();
 const coverage=await coverageReader({pointerPath:path.resolve(pointerPath??path.join(root,'data',DATASET,'current.json')),signal});
 const manifest=coverage?.verified?.manifest,summary=coverage?.summary,rows=coverage?.jurisdictions;
 check(manifest?.dataset_id===DATASET&&manifest.status==='published-governed-aggregate'&&manifest.source_actions_performed===0&&manifest.network_requests_performed===0&&manifest.additive_to_generic_totals===false,'Authoritative IRS verification returned an invalid authority envelope.');
 check(summary?.dataset_id===DATASET&&summary.source_date===manifest.source?.source_date&&summary.source?.release_id===manifest.source?.release_id&&summary.geography?.release_id===manifest.geography?.release_id,'Authoritative IRS source or geography binding changed.');
 check(Array.isArray(rows)&&rows.length===56,'Authoritative IRS jurisdiction set is incomplete.');
 const row=rows.find(item=>item.code===state);check(row,'Selected IRS state row is missing.');
 return {dataset_id:DATASET,evidence_kind:'adjacent-retained-national-organization-cohort',included_in_broad_layer:false,included_in_dataset_availability:false,release_id:manifest.release_id,source_release_id:manifest.source.source_release_id,source_date:summary.source_date,state:row.code,row_semantics:'IRS EO BMF current-extract organization record grouped by reported filing-address state; not a physical site',organization_count:row.organization_count,record_zcta_count:row.record_zcta_count,record_nonpolygon_count:row.record_nonpolygon_count,limitations:['Tax-exempt filing-address evidence only; not a broad state organization layer.','Not all businesses, all nonprofits, unique businesses, current operations, or verified physical sites.','Same-code ZCTA evidence does not establish current USPS validity.','Excluded from generic totals, matrix datasets, availability, denominator, and broad-layer gap status.']};
}
