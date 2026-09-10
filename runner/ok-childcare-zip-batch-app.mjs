import path from 'node:path';
import { lstat, link, unlink, readdir } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionCanonical as canonical, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';
import { createOkZipBatchPlan, runOkZipBatch, inspectOkZipBatch } from './ok-childcare-zip-batch.mjs';

export const OK_BATCH_APP_SOURCE_ID = 'state-ok-childcare-spatial-batch';
export const OK_BATCH_APPROVAL_PATH = path.join(APP_ROOT, 'config/source-approvals/ok-childcare-zip-batch.json');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = () => { throw Error('Oklahoma app batch is not approved for this exact scope or requires retained-output inspection.'); };

export function validateOkBatchApproval(approval, scopeSha256) {
  if (!approval || Object.getPrototypeOf(approval) !== Object.prototype
    || !same(Object.keys(approval).sort(), ['schema_version', 'status', 'approval_id', 'approved_at', 'scope_sha256'].sort())
    || approval.schema_version !== 'ok-childcare-batch-approval@1.0.0'
    || approval.status !== 'approved' || typeof approval.approval_id !== 'string' || !UUID.test(approval.approval_id)
    || !instant(approval.approved_at) || approval.approved_at > new Date().toISOString()
    || typeof scopeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(scopeSha256) || approval.scope_sha256 !== scopeSha256) fail();
  return { ...approval };
}

export function validateOkBatchAppOutput(outputRoot, industryRunId) {
  if (typeof industryRunId !== 'string' || !UUID.test(industryRunId) || typeof outputRoot !== 'string'
    || outputRoot !== path.join(APP_ROOT, 'data/industry-segments/runs', industryRunId, `${OK_BATCH_APP_SOURCE_ID}-OK`)) fail();
}

async function approved(signal) {
  const meter = {}, approval = await readJson(OK_BATCH_APPROVAL_PATH, 10000, signal, meter);
  // Fail pending/revoked states before loading large retained planning inputs.
  if (approval.status !== 'approved') fail();
  const scope = await createOkZipBatchPlan({ signal });
  validateOkBatchApproval(approval, scope.sha256);
  return { approval, approvalSha256: meter.sha256, scope };
}

export async function inspectOkBatchAppApproval({ signal } = {}) {
  const result = await approved(signal);
  return { approval_id: result.approval.approval_id, scope_sha256: result.scope.sha256,
    approval_sha256: result.approvalSha256, budget: result.scope.budget };
}

export async function runOkBatchApp(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).some(k => !['outputRoot', 'industryRunId', 'signal'].includes(k))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))
    || value.signal !== undefined && !(value.signal instanceof AbortSignal)) fail();
  validateOkBatchAppOutput(value.outputRoot, value.industryRunId);
  value.signal?.throwIfAborted();
  const authorization = await approved(value.signal);
  const batchRoot = path.join(APP_ROOT, 'data/business-sources/ok-childcare/approved-zip-batches', authorization.approval.approval_id);
  // Every app dispatch for the same approval targets the same retained batch.
  // A new supervisor run must not silently create a fresh source acquisition.
  await canonical(value.outputRoot, { create: true, output: true, signal: value.signal });
  if ((await readdir(value.outputRoot)).length) fail();
  const owner = await lstat(value.outputRoot, { bigint: true });
  const w = await writer(path.join(value.outputRoot, 'intent.json'), 20000, value.signal, new Map());
  try {
    await w.write({ schema_version: 'ok-childcare-batch-app@1.0.0', industry_run_id: value.industryRunId,
      source_id: OK_BATCH_APP_SOURCE_ID, approval: authorization.approval, approval_sha256: authorization.approvalSha256,
      batch_root: batchRoot, created_at: new Date().toISOString() });
    await w.finish();
  } finally { await w.close(); }
  const descriptor = await runOkZipBatch({ outputRoot: batchRoot, approvedScopeSha256: authorization.scope.sha256,
    approvalSha256: authorization.approvalSha256, signal: value.signal });
  const state = await inspectOkZipBatch(batchRoot, { signal: value.signal });
  if (state.status !== 'completed-internal-candidates' || state.plan_sha256 !== authorization.scope.sha256) fail();
  const finalAuthorization = await approved(value.signal);
  if (finalAuthorization.approvalSha256 !== authorization.approvalSha256) fail();
  await canonical(value.outputRoot, { signal: value.signal });
  const finalOwner = await lstat(value.outputRoot, { bigint: true });
  if (owner.ino !== finalOwner.ino || owner.dev !== finalOwner.dev || !same(await readdir(value.outputRoot), ['intent.json'])) fail();
  const receipt = { schema_version: 'ok-childcare-batch-app@1.0.0', industry_run_id: value.industryRunId,
    source_id: OK_BATCH_APP_SOURCE_ID, approval_id: authorization.approval.approval_id,
    approval_sha256: authorization.approvalSha256, scope_sha256: authorization.scope.sha256,
    batch: descriptor, source_queries: state.completed.length, reused_queries: state.reused.length,
    status: 'completed-internal-candidates', statewide_completeness: 'unknown', current_operations_verified: false,
    public_export_authorized: false, national_reporting_integrated: false };
  const output = await writer(path.join(value.outputRoot, 'receipt.pending'), 100000, value.signal, new Map());
  let meta;
  try { await output.write(receipt); meta = await output.finish(); } finally { await output.close(); }
  value.signal?.throwIfAborted();
  const receiptPath = path.join(value.outputRoot, 'receipt.json');
  await link(path.join(value.outputRoot, 'receipt.pending'), receiptPath); await unlink(path.join(value.outputRoot, 'receipt.pending'));
  const meter = {}; const reread = await readJson(receiptPath, 100000, value.signal, meter);
  if (meter.sha256 !== meta.sha256 || !same(reread, receipt)) fail();
  return { receipt: receiptPath, sha256: meta.sha256, status: receipt.status, source_queries: receipt.source_queries, reused_queries: receipt.reused_queries };
}
