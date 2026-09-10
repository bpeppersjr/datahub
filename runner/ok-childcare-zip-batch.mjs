import { randomUUID } from 'node:crypto';
import { link, unlink, lstat, readdir, statfs, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { acquireIndustrySourceLocks } from './industry-source-locks.mjs';
import { mnSelectionCanonical as canonical, mnSelectionWriter as writer, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { buildOkSpatialInventory } from './ok-childcare-spatial-inventory.mjs';
import { OK_RETAINED_CONTRACT as C, okRetainedHash as hash, okRetainedClaims } from './ok-childcare-retained-contract.mjs';
import { OK_QUERY_VERSION, okQueryUrl, deriveOkQueryCandidates } from './ok-childcare-query-contract.mjs';
import { collectOkZipQuery, collectOkZipQueryWithTestTransport, okQuerySyntheticClient, OK_QUERY_LIMITS } from './ok-childcare-query-fetch.mjs';

export const OK_BATCH_VERSION = 'ok-childcare-spatial-batch@1.0.0';
const CAP = 7000000, RESERVE = 256 * 1024 * 1024;
const fail = () => { throw Error('Oklahoma ZIP batch requires inspection; no automatic retry.'); };
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && same(Object.keys(v).sort(), [...keys].sort());
const digest = v => hash(JSON.stringify(v));
const identitySnapshot = snapshot => ({ sha256: snapshot.sha256, identity: snapshot.identity });
const exists = file => lstat(file).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
const IMPLEMENTATION = [
  'runner/ok-childcare-zip-batch.mjs', 'runner/ok-childcare-query-contract.mjs', 'runner/ok-childcare-query-fetch.mjs',
  'runner/ok-childcare-publisher-lock.mjs', 'runner/ok-childcare-spatial-inventory.mjs', 'runner/ok-childcare-retained-contract.mjs',
  'runner/ok-childcare-retained-bundle.mjs', 'runner/ok-childcare-retained-fetch.mjs', 'runner/ok-childcare-profile-fields.mjs',
  'runner/ok-childcare-schema-probe.mjs', 'runner/industry-source-locks.mjs', 'runner/paths.mjs',
  'runner/mn-construction-retained-selection.mjs', 'runner/mn-construction-diagnostics.mjs',
  'runner/mn-construction-selected-stream.mjs', 'runner/cli-cancellation.mjs', 'scripts/collect-ok-childcare-zip-batch.mjs',
  'runner/business-state-source-readiness.mjs', 'runner/mn-construction-preflight.mjs', 'runner/mn-construction-normalization.mjs',
  'runner/mn-construction-code-profile.mjs', 'runner/normalized-us-postal-code.mjs', 'package.json', 'package-lock.json',
  'runner/ok-childcare-zip-batch-app.mjs', 'scripts/build-ok-childcare-zip-batch.mjs',
  'runner/industry-segments.mjs', 'config/industry-segments.json', 'config/source-policies/ok-childcare-zip-batch-internal.json',
];
async function implementationPins(signal) {
  const pins = [];
  for (const relative of IMPLEMENTATION) {
    signal?.throwIfAborted(); const file = path.join(APP_ROOT, relative);
    if (path.dirname(file) === APP_ROOT) { if (await realpath(APP_ROOT) !== APP_ROOT) fail(); }
    else await canonical(path.dirname(file), { signal });
    const before = await lstat(file, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > 2000000n) fail();
    const bytes = await readFile(file), after = await lstat(file, { bigint: true });
    if (['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].some(k => before[k] !== after[k]) || BigInt(bytes.length) !== before.size) fail();
    pins.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
  }
  return pins;
}

export async function createOkZipBatchPlan({ signal } = {}) {
  const inventory = await buildOkSpatialInventory({ signal });
  const plan = {
    schema_version: OK_BATCH_VERSION,
    implementation: await implementationPins(signal),
    inventory_sha256: digest(inventory),
    source_id: 'ok-childcare-public-search', facility_type: 'childcare-center',
    basis: 'material-census-zcta-intersections-with-oklahoma',
    zip5: inventory.items.filter(r => r.spatial_priority === 'material-intersection' && r.acquisition_status === 'not-queried-in-this-inventory').map(r => r.zip5),
    reuse: inventory.items.filter(r => r.retained_evidence).map(r => ({ zip5: r.zip5, evidence: r.retained_evidence, source_rows: r.source_rows, observed_at: r.observed_at })),
    sliver_only_deferred: inventory.counts.sliver_only_candidates,
    limits: { ...OK_QUERY_LIMITS, batch_deadline_ms: 8 * 60 * 60 * 1000, result_file_max_bytes: CAP, free_disk_reserve_bytes: RESERVE },
    policy_id: 'ok-public-center-spatial-batch-internal@1.0.0', export_policy: 'internal',
    source_use: 'operator-approved-bounded-internal-collection-required',
    retry_policy: 'never-reissue-a-query-with-a-retained-intent-automatically',
    claims: { statewide_completeness: false, active_businesses_verified: false, public_export_authorized: false },
  };
  return { plan, sha256: digest(plan), budget: {
    new_queries: plan.zip5.length, maximum_requests: plan.zip5.length * 3,
    maximum_accepted_decoded_bytes: plan.zip5.length * 3 * C.html_max_bytes,
    maximum_result_storage_bytes: plan.zip5.length * CAP,
    minimum_free_disk_bytes: plan.zip5.length * CAP + RESERVE,
    request_gap_floor_seconds: plan.zip5.length * 6,
    // This floor excludes network, parsing and persistence time; not an ETA.
    batch_deadline_seconds: plan.limits.batch_deadline_ms / 1000,
  } };
}

function checkResult(result, zip5, mode, intent) {
  if (!exact(result, ['query', 'derived', 'claims']) || !same(result.claims, okRetainedClaims())) fail();
  const q = result.query;
  const keys = ['schema_version', 'zip5', 'mode', 'started_at', 'finished_at', 'status', 'requests', 'selected', 'delivery', 'observed_at'];
  if (q?.status === 'rejected') keys.push('failure');
  if (!exact(q, keys) || q.schema_version !== OK_QUERY_VERSION || q.zip5 !== zip5 || q.mode !== mode
    || !instant(q.started_at) || !instant(q.finished_at) || q.started_at < intent.created_at || q.finished_at < q.started_at
    || !Array.isArray(q.requests) || q.requests.length > 3) fail();
  const expectedClient = mode === 'native-fetch' ? { bytes: C.client_bytes, sha256: C.client_sha256 }
    : { bytes: okQuerySyntheticClient().length, sha256: hash(okQuerySyntheticClient()) };
  for (const [index, r] of q.requests.entries()) {
    if (!exact(r, ['url', 'method', 'started_at', 'status', 'decoded_bytes', 'decoded_sha256', 'complete'])
      || r.url !== (index === 1 ? okQueryUrl(zip5) : C.client_url) || r.method !== 'GET'
      || !instant(r.started_at) || r.started_at < q.started_at || r.started_at > q.finished_at
      || r.status !== null && !Number.isInteger(r.status)
      || !Number.isSafeInteger(r.decoded_bytes) || r.decoded_bytes < 0 || r.decoded_bytes > C.html_max_bytes
      || r.decoded_sha256 !== null && !/^[a-f0-9]{64}$/.test(r.decoded_sha256) || typeof r.complete !== 'boolean') fail();
    if (index && (r.started_at < q.requests[index - 1].started_at
      || mode === 'native-fetch' && Date.parse(r.started_at) - Date.parse(q.requests[index - 1].started_at) < OK_QUERY_LIMITS.request_spacing_ms)) fail();
  }
  if (q.status === 'accepted-internal-source-candidates') {
    if (q.requests.length !== 3 || q.requests.some(r => !r.complete || r.status !== 200 || !/^[a-f0-9]{64}$/.test(r.decoded_sha256))
      || !instant(q.observed_at) || q.observed_at < q.requests[1].started_at || q.observed_at > q.requests[2].started_at) fail();
    for (const r of [q.requests[0], q.requests[2]]) if (r.decoded_bytes !== expectedClient.bytes || r.decoded_sha256 !== expectedClient.sha256) fail();
    const derived = deriveOkQueryCandidates(q.selected, { observed_at: q.observed_at, response_sha256: q.requests[1].decoded_sha256 }, zip5);
    if (!same(result.derived, derived) || !exact(q.delivery, ['response_array_rows', 'selected_rows', 'at_client_row_ceiling',
      'unreviewed_page_field_count', 'pagination_metadata_detected', 'selected_search_completeness', 'zip_coverage_completeness', 'state_coverage_completeness'])
      || q.delivery.response_array_rows !== q.selected.length || q.delivery.selected_rows !== q.selected.length
      || q.delivery.at_client_row_ceiling !== (q.selected.length === C.max_rows)
      || !Number.isInteger(q.delivery.unreviewed_page_field_count) || q.delivery.unreviewed_page_field_count < 0 || q.delivery.unreviewed_page_field_count > 128
      || typeof q.delivery.pagination_metadata_detected !== 'boolean'
      || ['selected_search_completeness', 'zip_coverage_completeness', 'state_coverage_completeness'].some(k => q.delivery[k] !== 'unknown')) fail();
  } else if (q.status !== 'rejected' || !['cancelled-or-deadline', 'source-contract-not-satisfied'].includes(q.failure)
    || !same(q.selected, []) || q.delivery !== null || q.observed_at !== null || result.derived !== null) fail();
  return result;
}

async function save(directory, name, value, signal) {
  const temporary = path.join(directory, `${name}.pending`);
  const w = await writer(temporary, CAP, signal, new Map());
  try {
    await w.write(value); const meta = await w.finish(); signal?.throwIfAborted();
    await link(temporary, path.join(directory, name)); await unlink(temporary);
    return { path: name, sha256: meta.sha256 };
  } finally { await w.close(); }
}
async function snapshot(file, signal) {
  const meter = {}, value = await readJson(file, CAP, signal, meter);
  return { value, sha256: meter.sha256, identity: meter.identity };
}
function validateRoot(root, synthetic) {
  if (typeof root !== 'string' || root !== path.resolve(root)) fail();
  const allowed = synthetic ? path.join(APP_ROOT, 'data/tmp/ok-zip-batch-tests') : path.join(APP_ROOT, 'data');
  if (!root.startsWith(allowed + path.sep) || !synthetic && root.startsWith(path.join(APP_ROOT, 'data/tmp') + path.sep)) fail();
}
function opts(v, keys) {
  if (!v || Object.getPrototypeOf(v) !== Object.prototype || Reflect.ownKeys(v).some(k => !keys.includes(k))
    || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))
    || v.signal !== undefined && !(v.signal instanceof AbortSignal)) fail();
}

async function inspect(root, plan, mode, signal, hook) {
  await canonical(root, { signal });
  const directoryIdentity = await lstat(root, { bigint: true });
  const start = await snapshot(path.join(root, 'plan.json'), signal);
  if (!exact(start.value, ['schema_version', 'mode', 'plan', 'plan_sha256', 'created_at'])
    || start.value.schema_version !== OK_BATCH_VERSION || start.value.mode !== mode || !same(start.value.plan, plan)
    || start.value.plan_sha256 !== digest(plan) || !instant(start.value.created_at)) fail();
  const names = new Set(await readdir(root)), allowed = new Set(['plan.json', 'receipt.json']);
  const completed = [], pending = [], snapshots = new Map([[path.join(root, 'plan.json'), identitySnapshot(start)]]);
  let stopped = false, priorFinished = start.value.created_at;
  for (const zip5 of plan.zip5) {
    const intentName = `${zip5}.intent.json`, resultName = `${zip5}.result.json`;
    allowed.add(intentName); allowed.add(resultName);
    if (!names.has(intentName)) { if (names.has(resultName)) fail(); pending.push(zip5); continue; }
    if (pending.length) fail(); // committed work must be an ordered prefix
    const intent = await snapshot(path.join(root, intentName), signal);
    snapshots.set(path.join(root, intentName), identitySnapshot(intent));
    if (!same(intent.value, { schema_version: OK_BATCH_VERSION, plan_sha256: digest(plan), zip5, mode, created_at: intent.value.created_at })
      || !instant(intent.value.created_at) || intent.value.created_at < priorFinished) fail();
    if (!names.has(resultName)) { stopped = true; continue; }
    if (stopped) fail();
    const result = await snapshot(path.join(root, resultName), signal);
    snapshots.set(path.join(root, resultName), identitySnapshot(result));
    checkResult(result.value, zip5, mode, intent.value);
    await hook?.({ phase: 'result-read', file: path.join(root, resultName) });
    priorFinished = result.value.query.finished_at;
    completed.push({ zip5, intent_sha256: intent.sha256, result_sha256: result.sha256,
      status: result.value.query.status, rows: result.value.derived?.counts.rows ?? null });
    if (result.value.query.status !== 'accepted-internal-source-candidates') stopped = true;
  }
  if ([...names].some(n => !allowed.has(n))) fail();
  const summary = { schema_version: OK_BATCH_VERSION, mode, plan_sha256: digest(plan),
    status: stopped ? 'inspection-required' : pending.length ? 'incomplete' : 'completed-internal-candidates',
    completed, pending_zip5: pending, reused: plan.reuse,
    selected_search_completeness: 'unknown', statewide_completeness: 'unknown', ...okRetainedClaims() };
  if (names.has('receipt.json')) {
    const receipt = await snapshot(path.join(root, 'receipt.json'), signal);
    snapshots.set(path.join(root, 'receipt.json'), identitySnapshot(receipt));
    if (summary.status !== 'completed-internal-candidates' || !same(receipt.value, summary)) fail();
  }
  // Refuse cross-file changes during replay, including a plan/result swap.
  for (const [file, before] of snapshots) {
    const after = await snapshot(file, signal);
    if (after.sha256 !== before.sha256 || ['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].some(k => before.identity[k] !== after.identity[k])) fail();
  }
  await canonical(root, { signal });
  const finalIdentity = await lstat(root, { bigint: true });
  if (finalIdentity.ino !== directoryIdentity.ino || finalIdentity.dev !== directoryIdentity.dev) fail();
  if (!same([...names].sort(), (await readdir(root)).sort())) fail();
  return summary;
}

async function run(value, plan, transport) {
  const synthetic = Boolean(transport), mode = synthetic ? 'synthetic-test-transport' : 'native-fetch';
  validateRoot(value.outputRoot, synthetic);
  if (value.approvedScopeSha256 !== digest(plan)) fail();
  value.signal?.throwIfAborted();
  const timerController = new AbortController(), timer = setTimeout(() => timerController.abort(), plan.limits.batch_deadline_ms);
  const signal = value.signal ? AbortSignal.any([value.signal, timerController.signal]) : timerController.signal;
  let lock;
  try {
    // A separate batch identity prevents concurrent resume or a second batch;
    // native individual requests also acquire the shared publisher exclusion.
    lock = await acquireIndustrySourceLocks([{ sourceId: synthetic ? `ok-zip-batch-test-${path.basename(value.outputRoot)}` : 'ok-childcare-zip-batch', scope: 'state', state: 'OK' }], { runId: randomUUID() });
    await canonical(value.outputRoot, { create: true, output: true, signal });
    const names = await readdir(value.outputRoot);
    if (!names.length) await save(value.outputRoot, 'plan.json', { schema_version: OK_BATCH_VERSION, mode, plan,
      plan_sha256: digest(plan), created_at: new Date().toISOString() }, signal);
    let state = await inspect(value.outputRoot, plan, mode, signal, synthetic ? value.hook : undefined);
    if (state.status === 'inspection-required') fail();
    const disk = await statfs(value.outputRoot);
    if (disk.bavail * disk.bsize < state.pending_zip5.length * CAP + RESERVE) fail();
    for (const zip5 of state.pending_zip5) {
      signal.throwIfAborted();
      if (!synthetic && !same(await implementationPins(signal), plan.implementation)) fail();
      if (!synthetic && value.approvalSha256 !== undefined) {
        const approval = await snapshot(path.join(APP_ROOT, 'config/source-approvals/ok-childcare-zip-batch.json'), signal);
        if (approval.sha256 !== value.approvalSha256 || approval.value.status !== 'approved' || approval.value.scope_sha256 !== digest(plan)) fail();
      }
      await save(value.outputRoot, `${zip5}.intent.json`, { schema_version: OK_BATCH_VERSION, plan_sha256: digest(plan), zip5,
        mode, created_at: new Date().toISOString() }, signal);
      const query = synthetic ? await collectOkZipQueryWithTestTransport({ zip5, signal }, transport) : await collectOkZipQuery({ zip5, signal });
      const derived = query.status === 'accepted-internal-source-candidates'
        ? deriveOkQueryCandidates(query.selected, { observed_at: query.observed_at, response_sha256: query.requests[1].decoded_sha256 }, zip5) : null;
      // Preserve the diagnostic for a rejected or cancelled query. No further
      // query is dispatched; its intent is never silently retried on resume.
      await save(value.outputRoot, `${zip5}.result.json`, { query, derived, claims: okRetainedClaims() }, query.status === 'rejected' ? undefined : signal);
      if (query.status !== 'accepted-internal-source-candidates') fail();
    }
    state = await inspect(value.outputRoot, plan, mode, signal, synthetic ? value.hook : undefined);
    if (!synthetic && !same(await implementationPins(signal), plan.implementation)) fail();
    if (state.status !== 'completed-internal-candidates') fail();
    if (!await exists(path.join(value.outputRoot, 'receipt.json'))) await save(value.outputRoot, 'receipt.json', state, signal);
    await inspect(value.outputRoot, plan, mode, signal);
    return { receipt: path.join(value.outputRoot, 'receipt.json'), sha256: (await snapshot(path.join(value.outputRoot, 'receipt.json'), signal)).sha256,
      status: state.status, completed_queries: state.completed.length, reused_queries: plan.reuse.length };
  } finally { clearTimeout(timer); await lock?.release(); }
}
export async function runOkZipBatch(value) {
  opts(value, ['outputRoot', 'approvedScopeSha256', 'signal', 'approvalSha256']);
  if (value.approvalSha256 !== undefined && (typeof value.approvalSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.approvalSha256))) fail();
  const { plan } = await createOkZipBatchPlan({ signal: value.signal });
  return run(value, plan);
}
export async function inspectOkZipBatch(outputRoot, { signal } = {}) {
  validateRoot(outputRoot, false);
  const { plan } = await createOkZipBatchPlan({ signal });
  return inspect(outputRoot, plan, 'native-fetch', signal);
}
export async function runOkZipBatchWithTestTransport(value, transport) {
  opts(value, ['outputRoot', 'signal', 'zip5', 'hook']);
  if (typeof transport !== 'function' || !Array.isArray(value.zip5) || !value.zip5.length || value.zip5.length > 10
    || new Set(value.zip5).size !== value.zip5.length || value.hook !== undefined && typeof value.hook !== 'function') fail();
  value.zip5.forEach(okQueryUrl);
  const plan = { schema_version: OK_BATCH_VERSION, zip5: value.zip5, reuse: [], limits: { batch_deadline_ms: 90000 }, synthetic: true };
  return run({ outputRoot: value.outputRoot, signal: value.signal, hook: value.hook, approvedScopeSha256: digest(plan) }, plan, transport);
}
