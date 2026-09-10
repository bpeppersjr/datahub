import { randomUUID } from 'node:crypto';
import { mkdir, link, unlink, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionWriter as writer, mnSelectionReadJson as readJson,
  mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { OK_RETAINED_VERSION as VERSION, OK_RETAINED_CONTRACT as C, okRetainedClaims,
  deriveOkRetainedCandidates } from './ok-childcare-retained-contract.mjs';
import { collectOkRetainedSearch, collectOkRetainedSearchWithTestTransport, okRetainedFetchSnapshot,
  okRetainedSyntheticClient } from './ok-childcare-retained-fetch.mjs';
import { okRetainedHash } from './ok-childcare-retained-contract.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const CAPS = { 'intent.json': 50000, 'selected.jsonl': 2000000, 'candidates.jsonl': 4000000 };
const fail = () => { throw Error('Oklahoma retained bundle verification failed.'); };
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype
  && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const instant = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;

export function validateOkRetainedOutput(output, operationId) {
  if (typeof output !== 'string' || output !== path.resolve(output) || !UUID.test(operationId)
    || path.basename(output) !== 'output' || path.basename(path.dirname(output)) !== operationId
    || !output.startsWith(path.join(APP_ROOT, 'data') + path.sep)
    || output.startsWith(path.join(APP_ROOT, 'data/tmp') + path.sep)) fail();
}

async function readBundle(manifestPath, sha256, { operationId, operationRoot, requireNative = false, signal } = {}, hook) {
  if (typeof manifestPath !== 'string' || manifestPath !== path.resolve(manifestPath)
    || path.basename(manifestPath) !== 'manifest.json' || !SHA.test(sha256)) fail();
  const directory = path.dirname(manifestPath), runId = path.basename(directory);
  if (!UUID.test(runId)) fail();
  await canonical(directory, { signal });
  const directoryOwner = await lstat(directory, { bigint: true });
  const meter = {}, m = await readJson(manifestPath, 100000, signal, meter);
  if (meter.sha256 !== sha256 || !exact(m, ['schema_version', 'run_id', 'operation_id', 'mode', 'status', 'started_at', 'finished_at',
    'observed_at', 'requests', 'delivery', 'counts', 'claims', 'export_policy', 'artifacts']) || m.schema_version !== VERSION
    || m.run_id !== runId || !['native-fetch', 'synthetic-test-transport'].includes(m.mode)
    || !['accepted-internal-source-candidates', 'rejected'].includes(m.status) || m.export_policy !== 'internal'
    || !same(m.claims, okRetainedClaims()) || !instant(m.started_at) || !instant(m.finished_at) || m.finished_at < m.started_at) fail();
  if (hook && m.mode !== 'synthetic-test-transport') fail();
  if (requireNative && (m.mode !== 'native-fetch' || m.operation_id !== operationId
    || operationRoot !== undefined && manifestPath !== path.join(operationRoot, 'jobs', runId, 'manifest.json'))) fail();
  if (m.mode === 'native-fetch') {
    validateOkRetainedOutput(path.dirname(path.dirname(directory)), m.operation_id);
    if (path.basename(path.dirname(directory)) !== 'jobs') fail();
  } else if (m.operation_id !== null || !directory.startsWith(path.join(APP_ROOT, 'data/tmp/ok-retained-tests') + path.sep)) fail();
  if (!Array.isArray(m.artifacts) || m.artifacts.length !== 3
    || !same((await readdir(directory)).sort(), ['manifest.json', ...Object.keys(CAPS)].sort())) fail();
  const content = {}, identities = new Map([[manifestPath, meter.identity]]);
  for (const [index, name] of Object.keys(CAPS).entries()) {
    const a = m.artifacts[index], aMeter = {};
    if (!exact(a, ['path', 'bytes', 'sha256', 'records']) || a.path !== name || !SHA.test(a.sha256)
      || !Number.isSafeInteger(a.bytes) || a.bytes < 0 || a.bytes > CAPS[name]) fail();
    if (name === 'intent.json') { content[name] = await readJson(path.join(directory, name), CAPS[name], signal, aMeter); aMeter.records = 1; }
    else { content[name] = []; for await (const row of readLines(path.join(directory, name), CAPS[name], signal, aMeter)) content[name].push(row); }
    if (a.bytes !== aMeter.bytes || a.sha256 !== aMeter.sha256 || a.records !== aMeter.records) fail();
    identities.set(path.join(directory, name), aMeter.identity);
    await hook?.({ phase: 'artifact-read', name, file: path.join(directory, name) });
  }
  const intent = content['intent.json'];
  if (!same(intent, { schema_version: VERSION, run_id: runId, operation_id: m.operation_id, mode: m.mode,
    created_at: intent.created_at, contract: C }) || !instant(intent.created_at) || intent.created_at > m.started_at) fail();
  const selected = content['selected.jsonl'], candidates = content['candidates.jsonl'];
  if (!Array.isArray(m.requests) || m.requests.length > 3) fail();
  for (const [index, request] of m.requests.entries()) {
    if (!exact(request, ['url', 'method', 'status', 'decoded_bytes', 'decoded_sha256', 'complete'])
      || request.url !== (index === 1 ? C.results_url : C.client_url) || request.method !== 'GET'
      || request.status !== null && !Number.isInteger(request.status)
      || !Number.isSafeInteger(request.decoded_bytes) || request.decoded_bytes < 0 || request.decoded_bytes > C.html_max_bytes + 65536
      || typeof request.complete !== 'boolean' || request.decoded_sha256 !== null && !SHA.test(request.decoded_sha256)) fail();
  }
  if (m.status === 'accepted-internal-source-candidates') {
    if (m.requests.length !== 3 || m.requests.some(r => !r.complete || r.status !== 200 || !SHA.test(r.decoded_sha256)
      || r.decoded_bytes > C.html_max_bytes) || !instant(m.observed_at) || m.observed_at < m.started_at || m.observed_at > m.finished_at) fail();
    const client = m.mode === 'native-fetch' ? { bytes: C.client_bytes, sha: C.client_sha256 }
      : { bytes: okRetainedSyntheticClient().length, sha: okRetainedHash(okRetainedSyntheticClient()) };
    for (const r of [m.requests[0], m.requests[2]]) if (r.decoded_bytes !== client.bytes || r.decoded_sha256 !== client.sha) fail();
    const derived = deriveOkRetainedCandidates(selected, { observed_at: m.observed_at, response_sha256: m.requests[1].decoded_sha256 });
    if (!same(derived.candidates, candidates) || !same(derived.counts, m.counts)) fail();
    if (!exact(m.delivery, ['response_array_rows', 'selected_rows', 'at_client_row_ceiling', 'unreviewed_page_field_count',
      'pagination_metadata_detected', 'selected_search_completeness', 'zip_coverage_completeness', 'state_coverage_completeness'])
      || m.delivery.response_array_rows !== selected.length || m.delivery.selected_rows !== selected.length
      || m.delivery.at_client_row_ceiling !== (selected.length === C.max_rows)
      || !Number.isSafeInteger(m.delivery.unreviewed_page_field_count) || m.delivery.unreviewed_page_field_count < 0
      || m.delivery.unreviewed_page_field_count > 128 || typeof m.delivery.pagination_metadata_detected !== 'boolean'
      || ['selected_search_completeness', 'zip_coverage_completeness', 'state_coverage_completeness'].some(k => m.delivery[k] !== 'unknown')) fail();
  } else if (selected.length || candidates.length || m.counts !== null || m.delivery !== null || m.observed_at !== null) fail();
  await canonical(directory, { signal });
  const endOwner = await lstat(directory, { bigint: true });
  if (!endOwner.isDirectory() || endOwner.isSymbolicLink() || endOwner.ino !== directoryOwner.ino || endOwner.dev !== directoryOwner.dev
    || !same((await readdir(directory)).sort(), ['manifest.json', ...Object.keys(CAPS)].sort())) fail();
  const finalMeter = {}; await readJson(manifestPath, 100000, signal, finalMeter);
  if (finalMeter.sha256 !== sha256) fail();
  for (const [file, before] of identities) {
    const after = await lstat(file, { bigint: true });
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1n
      || ['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key])) fail();
  }
  return { manifest: m, candidates, retainedProjectionReplayed: true, discardedHtmlReplayed: false };
}
export async function readOkRetainedSearch(manifestPath, sha256, options) { return readBundle(manifestPath, sha256, options); }
export async function readOkRetainedSearchWithTestHook(manifestPath, sha256, hook) {
  if (typeof hook !== 'function') fail();
  return readBundle(manifestPath, sha256, {}, hook);
}

async function build(output, operationId, signal, transport, hook) {
  const callerSignal = signal;
  const synthetic = Boolean(transport);
  if (!synthetic) validateOkRetainedOutput(output, operationId);
  signal?.throwIfAborted();
  const root = synthetic ? path.join(APP_ROOT, 'data/tmp/ok-retained-tests') : path.join(output, 'jobs');
  await canonical(root, { create: true, output: true, signal });
  const runId = randomUUID(), directory = path.join(root, runId); await mkdir(directory);
  const artifacts = []; let w, published = false, descriptor;
  async function write(name, rows) {
    w = await writer(path.join(directory, name), CAPS[name] ?? 100000, signal, new Map());
    for (const row of rows) await w.write(row);
    const result = await w.finish(); w = null; return result;
  }
  try {
    artifacts.push(await write('intent.json', [{ schema_version: VERSION, run_id: runId, operation_id: operationId,
      mode: synthetic ? 'synthetic-test-transport' : 'native-fetch', created_at: new Date().toISOString(), contract: C }]));
    const issued = synthetic ? await collectOkRetainedSearchWithTestTransport(transport, { signal }) : await collectOkRetainedSearch({ signal });
    const result = okRetainedFetchSnapshot(issued);
    // Final rejected evidence is still durable after cooperative cancellation.
    if (result.status === 'rejected') signal = undefined;
    const derived = result.status === 'accepted-internal-source-candidates'
      ? deriveOkRetainedCandidates(result.selected, { observed_at: result.observed_at, response_sha256: result.requests[1].decoded_sha256 }) : null;
    artifacts.push(await write('selected.jsonl', result.selected));
    await hook?.({ phase: 'selected-written', directory });
    artifacts.push(await write('candidates.jsonl', derived?.candidates ?? []));
    const manifest = { schema_version: VERSION, run_id: runId, operation_id: operationId, mode: result.mode, status: result.status,
      started_at: result.started_at, finished_at: result.finished_at, observed_at: result.observed_at, requests: result.requests,
      delivery: result.delivery, counts: derived?.counts ?? null, claims: okRetainedClaims(), export_policy: 'internal', artifacts };
    const meta = await write('manifest.tmp', [manifest]);
    const manifestPath = path.join(directory, 'manifest.json');
    await hook?.({ phase: 'before-publication', directory });
    signal?.throwIfAborted();
    await link(path.join(directory, 'manifest.tmp'), manifestPath); published = true;
    descriptor = { run_id: runId, operation_id: operationId, manifest: manifestPath, sha256: meta.sha256, status: result.status,
      cancellation_after_publication: Boolean(callerSignal?.aborted) };
    await unlink(path.join(directory, 'manifest.tmp'));
    await readOkRetainedSearch(manifestPath, meta.sha256, { operationId, requireNative: !synthetic });
    descriptor.cancellation_after_publication = Boolean(callerSignal?.aborted);
    return descriptor;
  } catch {
    const error = Error(published ? 'Oklahoma retained output requires inspection; do not retry.' : 'Oklahoma retained collection failed; inspect its intent before retry.');
    if (descriptor) error.recovery = descriptor;
    throw error;
  } finally { await w?.close(); }
}
export async function buildOkRetainedSearch(value = {}) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(k => !['output', 'operationId', 'signal'].includes(k))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))
    || value.signal !== undefined && !(value.signal instanceof AbortSignal)) fail();
  return build(value.output, value.operationId, value.signal);
}
export async function buildOkRetainedSearchWithTestTransport(transport, { signal, hook } = {}) {
  if (typeof transport !== 'function') fail();
  if (hook !== undefined && typeof hook !== 'function') fail();
  return build(null, null, signal, transport, hook);
}
