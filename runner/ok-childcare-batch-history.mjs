import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { readOkRetainedSearch } from './ok-childcare-retained-bundle.mjs';
import { APP_ROOT } from './paths.mjs';

const approvalId = '78ec4fe1-dac0-40e9-aac7-e5672f67f7fe';
export const OK_HISTORICAL_BATCH_OPERATION = 'c12cb298-a6be-4493-811b-0196d7905488';
export const OK_HISTORICAL_BATCH_ROOT = path.join(APP_ROOT, 'data/business-sources/ok-childcare/approved-zip-batches', approvalId);
const sourceId = 'state-ok-childcare-spatial-batch';
const scope = 'e92b31b9dc94ff2a3ebbdbdab60afbc9e4e84637ff7f916400427a279beaf122';
const version = 'ok-childcare-spatial-batch@1.0.0';
const mode = 'native-fetch';
const rejectedZip = '66778';
const baselineOperation = 'a5f5ca7d-89b7-450a-9278-3430b436aff6';
const baselineOutput = `data/managed-operations/${baselineOperation}/output`;
const baselineManifest = `${baselineOutput}/jobs/4acdd407-ae61-43fb-ba66-6464f3a5a2a4/manifest.json`;
const baselineHash = 'bd26af2f1f0e83358188fea44cd553ac7d4ed55f022943c57527f6f332fe074b';
const journalNames = [`${rejectedZip}.intent.json`, `${rejectedZip}.result.json`, 'plan.json'];
const pins = {
  plan: [path.join(OK_HISTORICAL_BATCH_ROOT, 'plan.json'), '314118dda5ece4a682fb5941f669777a58f742dbf9825c76fad89cd717839f9e'],
  intent: [path.join(OK_HISTORICAL_BATCH_ROOT, journalNames[0]), '396af5c667f212ba3c34ce1c7e6cc2c26d969ea3049f680a979deb973535c0f2'],
  result: [path.join(OK_HISTORICAL_BATCH_ROOT, journalNames[1]), '0267e342923199cddc13b3b1ea1efb1916dc9297a09c7b15b7267d67d22529b6'],
  dispatch: [path.join(APP_ROOT, 'data/industry-segments/runs', OK_HISTORICAL_BATCH_OPERATION, `${sourceId}-OK/intent.json`), '813c847b58dd1f9e8530d372b59d21f06022830bd04853184f8e41295e935d7f'],
  operation: [path.join(APP_ROOT, 'data/managed-operations', OK_HISTORICAL_BATCH_OPERATION, 'receipt.json'), '6d7db0b1f0f95b9cef804d649e0981585f705431e134478a27b6638e396c2603'],
};
const identityFields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'];

function check(value) {
  if (!value) throw Error('Oklahoma historical batch evidence rejected.');
}

async function snapshot([file, sha256], signal) {
  const meter = {};
  const value = await readJson(file, 16_384, signal, meter);
  check(meter.sha256 === sha256);
  return { value, identity: meter.identity };
}

// One archived approval and terminal journal. Current acquisition never calls this reader.
export async function readOkChildcareBatchHistory({ signal } = {}) {
  await canonical(OK_HISTORICAL_BATCH_ROOT, { signal });
  const directory = await lstat(OK_HISTORICAL_BATCH_ROOT, { bigint: true });
  check(isDeepStrictEqual((await readdir(OK_HISTORICAL_BATCH_ROOT)).sort(), journalNames));

  const snapshots = {};
  for (const [key, pin] of Object.entries(pins)) snapshots[key] = await snapshot(pin, signal);
  const { plan: saved, intent, result, dispatch, operation } = Object.fromEntries(
    Object.entries(snapshots).map(([key, entry]) => [key, entry.value]),
  );
  const { plan } = saved;
  const { query } = result;
  check(saved.schema_version === version && saved.mode === mode && saved.plan_sha256 === scope
    && createHash('sha256').update(JSON.stringify(plan)).digest('hex') === scope
    && plan.schema_version === version && plan.zip5.length === 666 && plan.zip5[0] === rejectedZip
    && plan.reuse.length === 1);
  check(dispatch.schema_version === 'ok-childcare-batch-app@1.0.0'
    && dispatch.industry_run_id === OK_HISTORICAL_BATCH_OPERATION && dispatch.source_id === sourceId
    && isDeepStrictEqual(dispatch.approval, {
      schema_version: 'ok-childcare-batch-approval@1.0.0', status: 'approved', approval_id: approvalId,
      approved_at: '2026-09-10T17:14:56.076Z', scope_sha256: scope,
    })
    && dispatch.approval_sha256 === 'cbb0bc1e9cc0bfd10fcb773755ce76a3c4163c345c5a61ddf040759340e98d24'
    && dispatch.approval.approved_at < dispatch.created_at && dispatch.created_at < saved.created_at);
  check(intent.schema_version === version && intent.plan_sha256 === scope && intent.mode === mode
    && intent.zip5 === rejectedZip && saved.created_at <= intent.created_at
    && intent.created_at <= query.started_at && query.finished_at <= operation.finishedAt);
  check(operation.id === OK_HISTORICAL_BATCH_OPERATION && operation.kind === 'collection' && operation.status === 'FAILED'
    && isDeepStrictEqual(operation.details.plan.sourceIds, [sourceId]) && isDeepStrictEqual(operation.artifacts, []));
  check(query.schema_version === 'ok-childcare-zip-query@1.0.0' && query.zip5 === rejectedZip && query.mode === mode
    && query.status === 'rejected' && query.failure === 'source-contract-not-satisfied'
    && query.requests.length === 2 && query.requests[0].status === 200 && query.requests[0].complete === true
    && query.requests[1].status === 502 && query.requests[1].complete === false
    && query.requests[1].decoded_bytes === 0 && query.requests[1].decoded_sha256 === null
    && query.selected.length === 0 && query.delivery === null && query.observed_at === null && result.derived === null);

  const { manifest } = await readOkRetainedSearch(path.join(APP_ROOT, baselineManifest), baselineHash, {
    operationId: baselineOperation, operationRoot: path.join(APP_ROOT, baselineOutput), requireNative: true, signal,
  });
  check(manifest.status === 'accepted-internal-source-candidates' && manifest.counts.rows === 4
    && isDeepStrictEqual(plan.reuse[0], {
      zip5: '73102', evidence: { manifest: baselineManifest, sha256: baselineHash, operation_id: baselineOperation },
      source_rows: manifest.counts.rows, observed_at: manifest.observed_at,
    }));

  for (const [key, pin] of Object.entries(pins)) {
    const after = await snapshot(pin, signal);
    check(identityFields.every(field => after.identity[field] === snapshots[key].identity[field]));
  }
  await canonical(OK_HISTORICAL_BATCH_ROOT, { signal });
  const after = await lstat(OK_HISTORICAL_BATCH_ROOT, { bigint: true });
  check(after.isDirectory() && !after.isSymbolicLink() && after.dev === directory.dev && after.ino === directory.ino
    && isDeepStrictEqual((await readdir(OK_HISTORICAL_BATCH_ROOT)).sort(), journalNames));
  signal?.throwIfAborted();

  return {
    plan,
    state: {
      mode, plan_sha256: scope, status: 'inspection-required', pending_zip5: plan.zip5.slice(1), reused: plan.reuse,
      completed: [{ zip5: rejectedZip, status: query.status, rows: null, intent_sha256: pins.intent[1], result_sha256: pins.result[1] }],
    },
    provenance: {
      approval_id: approvalId, operation_id: operation.id, finished_at: operation.finishedAt,
      plan_file_sha256: pins.plan[1], rejected_zip5: rejectedZip, failure_http_status: query.requests[1].status,
    },
  };
}
