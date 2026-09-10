import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, link, unlink, lstat, readdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { readOvertureNormalizationInput } from './overture-normalization-input.mjs';
import { readOvertureSourcePreflight } from './overture-source-preflight.mjs';
import { validateOvertureZbpSelection, verifyOvertureZbpSelection } from './overture-zbp-selection.mjs';
import { buildOvertureUsPlaces, verifyOvertureUsPlaces, OVERTURE_SELECTED_FIELDS } from './overture-us-places.mjs';
const VERSION = 'overture-normalization-session@1';
const STATUS = 'normalized-retained-not-promoted';
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length
  && keys.every(k => Object.hasOwn(v, k)) && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value'));
const failure = () => new Error('Overture normalization session rejected; preserve retained operation evidence.');
const native = { readInput: readOvertureNormalizationInput, readMetadata: readOvertureSourcePreflight };
const hash = raw => createHash('sha256').update(raw).digest('hex');
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
async function persist(filename, value, signal) {
  signal?.throwIfAborted(); const raw = Buffer.from(JSON.stringify(value) + '\n');
  if (raw.length > 4 * 1024 ** 2) throw failure();
  const handle = await open(filename, 'wx');
  try { await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
  const meter = {}; await readJson(filename, 4 * 1024 ** 2, signal, meter);
  if (meter.sha256 !== hash(raw)) throw failure(); return meter.sha256;
}
function admitted(v) {
  const keys = ['output', 'operationId', 'acquisition', 'baseline']; if (Object.hasOwn(v ?? {}, 'signal')) keys.push('signal');
  if (!exact(v, keys) || typeof v.output !== 'string' || v.output !== path.resolve(v.output) || !uuid(v.operationId)
    || path.basename(v.output) !== 'output' || path.basename(path.dirname(v.output)) !== v.operationId
    || !exact(v.acquisition, ['operationId', 'receiptSha256']) || !uuid(v.acquisition.operationId) || !sha(v.acquisition.receiptSha256)
    || v.acquisition.operationId === v.operationId || (v.signal !== undefined && !(v.signal instanceof AbortSignal))) throw failure();
  return { ...v, acquisition: { ...v.acquisition }, baseline: validateOvertureZbpSelection(v.baseline) };
}
function preparedMetadata(input, metadata) {
  return JSON.parse(JSON.stringify({ artifact_type: 'overture-us-place-selected-source-jsonl-gzip', overture_release_id: metadata.release_id,
    overture_release_datetime: metadata.assets?.[0]?.datetime ?? null, prepared_at: input.acquisitionCompletedAt,
    stac_fingerprint: metadata.stac_fingerprint, query_contract_sha256: input.queryFingerprint,
    selected_fields: OVERTURE_SELECTED_FIELDS, record_count: input.binding.selected_records,
    bytes: input.binding.selected_bytes, sha256: input.binding.selected_sha256, acquisition_binding: input.binding }));
}
async function inspect(descriptor, options, adapters, synthetic) {
  if (!exact(options, ['output', 'operationId']) || !exact(descriptor, ['run_id', 'operation_id', 'manifest', 'sha256', 'status'])
    || !uuid(options.operationId) || typeof options.output !== 'string' || options.output !== path.resolve(options.output)
    || path.basename(options.output) !== 'output' || path.basename(path.dirname(options.output)) !== options.operationId
    || !uuid(descriptor.run_id) || descriptor.operation_id !== options.operationId || !sha(descriptor.sha256) || descriptor.status !== STATUS) throw failure();
  const directory = path.join(options.output, 'jobs', descriptor.run_id);
  if (descriptor.manifest !== path.join(directory, 'manifest.json')) throw failure();
  await canonical(directory);
  if (!isDeepStrictEqual((await readdir(directory)).sort(), ['manifest.json', 'normalization', 'prepared-metadata.json'])) throw failure();
  const meter = {}, receipt = await readJson(descriptor.manifest, 4 * 1024 ** 2, undefined, meter);
  if (meter.sha256 !== descriptor.sha256 || !exact(receipt, ['schema_version', 'mode', 'run_id', 'operation_id', 'status', 'acquisition', 'acquisition_binding', 'baseline', 'normalized', 'published', 'complete_us_business_coverage'])
    || receipt.schema_version !== VERSION || receipt.run_id !== descriptor.run_id
    || receipt.operation_id !== options.operationId || receipt.status !== STATUS || receipt.mode !== (synthetic ? 'synthetic-test-only' : 'native-retained-inputs')
    || receipt.published !== false || receipt.complete_us_business_coverage !== false) throw failure();
  const input = await adapters.readInput(receipt.acquisition);
  if (!isDeepStrictEqual(input.binding, receipt.acquisition_binding)) throw failure();
  const reference = input.metadataReference;
  const originalMetadata = (await adapters.readMetadata(reference.descriptor, { output: reference.output, operationId: reference.operation_id })).manifest.result;
  const verifiedBaseline = await verifyOvertureZbpSelection(receipt.baseline);
  if (!exact(receipt.normalized, ['staging_run_id', 'release_id', 'manifest_sha256']) || !uuid(receipt.normalized.staging_run_id) || !sha(receipt.normalized.manifest_sha256)) throw failure();
  const normalizedFile = path.join(directory, 'normalization/.staging', receipt.normalized.staging_run_id, 'manifest.json');
  const normalizedMeter = {}, normalized = await readJson(normalizedFile, 4 * 1024 ** 2, undefined, normalizedMeter);
  if (normalizedMeter.sha256 !== receipt.normalized.manifest_sha256 || normalized.release_id !== receipt.normalized.release_id
    || normalized.baseline_selection?.manifest_sha256 !== receipt.baseline.sha256) throw failure();
  await verifyOvertureUsPlaces(normalizedFile);
  const originalBaseline = verifiedBaseline.manifest.artifacts.find(a => a.path === 'derived/zip-coverage.jsonl');
  const retainedBaselines = normalized.artifacts.filter(a => a.artifact_type === 'overture-normalization-baseline');
  if (!originalBaseline || retainedBaselines.length !== 1 || retainedBaselines[0].sha256 !== originalBaseline.sha256
    || retainedBaselines[0].bytes !== originalBaseline.bytes || retainedBaselines[0].record_count !== originalBaseline.record_count) throw failure();
  const metadata = await readJson(path.join(path.dirname(normalizedFile), 'source/source-metadata.json'), 4 * 1024 ** 2);
  const prepared = await readJson(path.join(directory, 'prepared-metadata.json'), 4 * 1024 ** 2);
  const sourceArtifacts = normalized.artifacts.filter(a => a.artifact_type === 'overture-us-place-selected-source-jsonl-gzip');
  if (!isDeepStrictEqual(metadata, preparedMetadata(input, originalMetadata)) || !isDeepStrictEqual(prepared, metadata)
    || sourceArtifacts.length !== 1 || sourceArtifacts[0].sha256 !== input.binding.selected_sha256
    || sourceArtifacts[0].bytes !== input.binding.selected_bytes || sourceArtifacts[0].record_count !== input.binding.selected_records) throw failure();
  const fresh = await adapters.readInput(receipt.acquisition);
  if (!isDeepStrictEqual(fresh.binding, input.binding)) throw failure();
  const normalizedEnd = {}; await readJson(normalizedFile, 4 * 1024 ** 2, undefined, normalizedEnd);
  if (normalizedEnd.sha256 !== normalizedMeter.sha256 || !same(normalizedMeter.identity, normalizedEnd.identity)) throw failure();
  const end = {}; await readJson(descriptor.manifest, 4 * 1024 ** 2, undefined, end);
  if (end.sha256 !== descriptor.sha256 || !same(meter.identity, end.identity)) throw failure();
  return { receipt, normalized, normalizedManifest: normalizedFile };
}
async function run(value, adapters, synthetic) {
  const options = admitted(value), { output, operationId, acquisition, baseline, signal } = options;
  signal?.throwIfAborted();
  const input = await adapters.readInput({ ...acquisition, signal });
  const reference = input.metadataReference;
  const metadata = (await adapters.readMetadata(reference.descriptor, { output: reference.output, operationId: reference.operation_id })).manifest.result;
  signal?.throwIfAborted(); await verifyOvertureZbpSelection(baseline, { signal });
  await canonical(output, { create: true, output: true, signal });
  const jobs = path.join(output, 'jobs'); await canonical(jobs, { create: true, output: true, signal });
  const runId = randomUUID(), directory = path.join(jobs, runId); await mkdir(directory);
  const owner = await lstat(directory, { bigint: true });
  const prepared = preparedMetadata(input, metadata);
  const preparedPath = path.join(directory, 'prepared-metadata.json'); await persist(preparedPath, prepared, signal);
  const built = await buildOvertureUsPlaces({ outputRoot: path.join(directory, 'normalization'), zbpSelection: baseline,
    sourceFile: input.sourceFile, sourceMetadataFile: preparedPath, publicationMode: 'retain',
    ...(synthetic ? { minimumPlaces: 1 } : {}), signal, logger: () => {} });
  if (built.pointerPath !== null || built.status !== 'verified-retained-not-promoted') throw failure();
  const fresh = await adapters.readInput({ ...acquisition, signal });
  if (!isDeepStrictEqual(fresh.binding, input.binding)) throw failure();
  await verifyOvertureZbpSelection(baseline, { signal });
  const normalizedMeter = {}; await readJson(path.join(built.releaseDirectory, 'manifest.json'), 4 * 1024 ** 2, signal, normalizedMeter);
  const receipt = { schema_version: VERSION, mode: synthetic ? 'synthetic-test-only' : 'native-retained-inputs', run_id: runId,
    operation_id: operationId, status: STATUS, acquisition, acquisition_binding: input.binding, baseline,
    normalized: { staging_run_id: built.stagingRunId, release_id: built.manifest.release_id, manifest_sha256: normalizedMeter.sha256 },
    published: false, complete_us_business_coverage: false };
  const temporary = path.join(directory, 'manifest.tmp'), filename = path.join(directory, 'manifest.json');
  const digest = await persist(temporary, receipt, signal); signal?.throwIfAborted();
  await canonical(directory, { signal }); const current = await lstat(directory, { bigint: true });
  if (current.dev !== owner.dev || current.ino !== owner.ino) throw failure();
  const descriptor = { run_id: runId, operation_id: operationId, manifest: filename, sha256: digest, status: STATUS };
  let published = false;
  try { await link(temporary, filename); published = true; await unlink(temporary);
    await inspect(descriptor, { output, operationId }, adapters, synthetic); signal?.throwIfAborted(); }
  catch { const error = failure(); if (published) error.recovery = descriptor; throw error; }
  return descriptor;
}
export async function runOvertureNormalizationSession(options) { try { return await run(options, native, false); } catch (error) { const fixed = failure(); if (error?.recovery) fixed.recovery = error.recovery; throw fixed; } }
export async function readOvertureNormalizationSession(descriptor, options) { try { return await inspect(descriptor, options, native, false); } catch { throw failure(); } }
export async function runOvertureNormalizationSessionForTest(options, adapters) { try { return await run(options, adapters, true); } catch (error) { const fixed = failure(); if (error?.recovery) fixed.recovery = error.recovery; throw fixed; } }
export async function readOvertureNormalizationSessionForTest(descriptor, options, adapters) { try { return await inspect(descriptor, options, adapters, true); } catch { throw failure(); } }
