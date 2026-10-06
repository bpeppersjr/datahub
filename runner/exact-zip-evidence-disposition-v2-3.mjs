import { classifyExactZipEvidenceDispositionV22 } from './exact-zip-evidence-disposition-v2-2.mjs';

export const EXACT_ZIP_RAW_STATUSES_V23 = Object.freeze([
  'positive','measured-zero','outside-source-denominator','absent-from-retained-source-rows','unavailable',
  'measured-positive','not-published-for-zip','outside-zbp-zcta-evidence-union',
  'retained-linkage-evidence-row','no-retained-linkage-decisions',
]);

export function classifyExactZipEvidenceDispositionV23(input) {
  if (input.raw_status === 'retained-linkage-evidence-row') return {raw_status:input.raw_status,evidence_state:'linkage-evidence-present',lifecycle_status:'linkage-readiness-evidence-present',label:'retained linkage evidence row · linkage readiness evidence present',current_operations_verified:false,identity_merge_applied:false,additive:false};
  if (input.raw_status === 'no-retained-linkage-decisions') return {raw_status:input.raw_status,evidence_state:'no-retained-linkage-decisions',lifecycle_status:'linkage-readiness-unmeasured',label:'no retained linkage decisions · linkage readiness unmeasured',current_operations_verified:false,identity_merge_applied:false,additive:false};
  return {...classifyExactZipEvidenceDispositionV22(input),identity_merge_applied:false};
}
