export type Operation = {
  id: string; kind: string; status: string; createdAt: string; finishedAt: string | null;
  error: string | null; artifacts: Array<{ name: string; bytes: number }>;
  result: { rowsWritten?: number; credentialRowsWritten?:number|null; recordUnit?:string; artifactIntegrityVerified?:boolean; policyMode?: string; sourceId?: string; receiptIntegrityVerified?: boolean;
    inspectionRequired?: boolean; snapshotReady?: boolean; normalizationReady?: boolean; normalizedPublished?: boolean;
    normalizedPlaces?: number; metadataReady?: boolean; runtimeReady?: boolean;
    plan?: { taskCount?: number }; tasks?: Array<{ task_id: string; source_id?: string; state?: string; status: string }> } | null;
};
export function operationLabel(kind: string) {
  const labels: Record<string, string> = { collection: 'Industry collection', export: 'Flat-file export', 'credential-export':'Credential flat-file export',
    'source-prerequisite': 'Source prerequisite', 'source-acquisition': 'Source acquisition',
    'source-normalization': 'Retained-data normalization', 'cohort-snapshot': 'Retained cohort snapshot' };
  return Object.hasOwn(labels, kind) ? labels[kind] : 'Data operation';
}
export function eligibleOvertureAcquisition(operation: Operation) {
  return operation.kind === 'source-acquisition' && operation.status === 'SUCCEEDED'
    && operation.result?.sourceId === 'overture-us-places' && operation.result.receiptIntegrityVerified === true
    && operation.result.inspectionRequired === false && operation.result.snapshotReady === true;
}
export function operationEvidence(operation: Operation) {
  const result = operation.result;
  if(operation.kind==='credential-export'&&operation.status==='SUCCEEDED'&&result?.artifactIntegrityVerified===true)return 'Credential rows independently verified. Local review only; not business or physical-site totals.';
  if (result?.inspectionRequired || (['source-acquisition', 'source-normalization'].includes(operation.kind) && ['FAILED', 'CANCELLED', 'UNKNOWN'].includes(operation.status))) {
    return 'Retained evidence requires inspection. Not ready for downstream processing.';
  }
  if (operation.status !== 'SUCCEEDED' || result?.receiptIntegrityVerified !== true) return null;
  if (operation.kind === 'source-acquisition' && result.snapshotReady === true) return 'Selected source retained. Not normalized or published.';
  if (operation.kind === 'source-normalization' && result.normalizationReady === true && result.normalizedPublished === false) {
    return 'Normalized output retained and verified. Not promoted to the national registry.';
  }
  if (operation.kind === 'source-prerequisite' && (result.metadataReady || result.runtimeReady)) return 'Prerequisite retained. Business data has not been acquired by this operation.';
  return null;
}
