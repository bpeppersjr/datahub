import {loadCmsNursingHomeChainAssertions,pageCmsNursingHomeChainAssertions} from './cms-nursing-home-chain-assertions.mjs';

const VERSION='cms-nursing-home-chain-review@1.0.0';
const CLAIM='Shared ownership, officers, or operational/managerial control is publisher-reported affiliation; it is not proof of legal parenthood, network identity, a unique business, a physical site, or current operation.';
const check=v=>{if(!v)throw Object.assign(Error('CMS nursing-home chain review rejected.'),{statusCode:400});};
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};

export function createCmsNursingHomeChainReview({load=loadCmsNursingHomeChainAssertions,page=pageCmsNursingHomeChainAssertions}={}){
 check(typeof load==='function'&&typeof page==='function');
 return async function review(options={}){
  check(options&&Object.getPrototypeOf(options)===Object.prototype&&Reflect.ownKeys(options).every(k=>['chainId','ccn','offset','limit','signal'].includes(k)));
  const {chainId,ccn,offset=0,limit=50,signal}=options;signal?.throwIfAborted();
  check(chainId===undefined||typeof chainId==='string'&&/^\d{1,64}$/.test(chainId));
  check(ccn===undefined||typeof ccn==='string'&&/^[A-Za-z0-9]{6}$/.test(ccn));
  check(Number.isSafeInteger(offset)&&offset>=0&&offset<=25000&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100);
  const assertions=await load({signal});signal?.throwIfAborted();
  const result=page(assertions,{chainId,ccn,offset,limit});signal?.throwIfAborted();
  check(result&&Array.isArray(result.rows)&&result.rows.length<=limit&&Number.isSafeInteger(result.total)&&result.total>=0&&result.total<=assertions.summary.assertionRows&&assertions.summary.assertionRows===assertions.summary.sourceRows);
  const rows=result.rows.map(row=>{
   check(row&&typeof row.assertionId==='string'&&row.lineage&&typeof row.lineage.rawCsvSha256==='string'&&typeof row.lineage.sourceRecordId==='string'&&typeof row.lineage.ccn==='string');
   check(row.chainName.raw.length<=256&&row.chainId.raw.length<=64&&row.reportedFacilities.raw.length<=32&&row.temporal.publisherProcessingDateRaw.length<=100);
   return {assertion_id:row.assertionId,ccn:row.lineage.ccn,chain:{publisher_chain_id:row.chainId.raw||null,id_state:row.chainId.status,name:row.chainName.raw||null,name_state:row.chainName.status,reported_facility_count_raw:row.reportedFacilities.raw||null,reported_facility_count:row.reportedFacilities.value,count_state:row.reportedFacilities.status},observation:{publisher_processing_date_raw:row.temporal.publisherProcessingDateRaw,source_dates:row.temporal.sourceDates,observed_at:row.temporal.observedAt,recovery_created_at:row.temporal.recoveryCreatedAt},lineage:{source_id:'cms-nursing-home-provider-information',source_release_sha256:row.lineage.rawCsvSha256,source_row:row.lineage.sourceRow,source_record_id:row.lineage.sourceRecordId,selected_assertion_sha256:row.lineage.selectedArtifactSha256},reconciliation:row.retainedGroupEvidence?{retained_member_assertion_rows:row.retainedGroupEvidence.memberRows,publisher_reported_facility_counts:row.retainedGroupEvidence.reportedFacilityCounts,name_variant_count:row.retainedGroupEvidence.nameVariantCount,status:row.retainedGroupEvidence.reportedCountReconciliation}:null,flags:[...row.flags]};
  });
  return freeze({schema_version:VERSION,status:'verified-retained-local-review',filters:{publisher_chain_id:chainId??null,ccn:ccn??null},page:{offset,limit,total_matching_assertion_rows:result.total,next_offset:offset+rows.length<result.total?offset+rows.length:null},rows,conservation:{retained_assertion_rows:assertions.summary.assertionRows,retained_source_rows:assertions.summary.sourceRows,rows_with_chain_id:assertions.summary.rowsWithLexicallyValidChainId,rows_missing_chain_id:assertions.summary.rowsMissingChainId,rows_unresolved_chain_id:assertions.summary.rowsUnresolvedChainId,all_source_rows_preserved:assertions.summary.assertionRows===14690&&assertions.summary.sourceRows===14690},semantics:{record_unit:'publisher-reported-chain-affiliation-assertion',chain_id_is_opaque:true,claim_boundary:CLAIM,local_review_only:true,public_export_authorized:false}});
 };
}

export const cmsNursingHomeChainReview=createCmsNursingHomeChainReview();
