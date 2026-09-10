import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { readOvertureAcquisitionSession } from './overture-acquisition-receipt.mjs';
const ROOT = path.join(APP_ROOT, 'data/managed-operations');
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const fail = () => { throw new Error('Overture normalization acquisition input rejected; preserve operation evidence.'); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
async function resolve(options, synthetic) {
  const allowed = ['operationId', 'receiptSha256', 'signal', ...(synthetic ? ['root', 'readSnapshot'] : [])];
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Reflect.ownKeys(options).some(k => !allowed.includes(k))
    || Object.values(Object.getOwnPropertyDescriptors(options)).some(d => !Object.hasOwn(d, 'value'))
    || !uuid(options.operationId) || !sha(options.receiptSha256) || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) fail();
  const { operationId, receiptSha256, signal } = options;
  const root = synthetic ? options.root : ROOT;
  if (typeof root !== 'string' || root !== path.resolve(root) || (synthetic && typeof options.readSnapshot !== 'function')) fail();
  signal?.throwIfAborted();
  const filename = path.join(root, operationId, 'receipt.json'), meter = {};
  const record = await readJson(filename, 1024 ** 2, signal, meter), result = record.result, descriptor = result?.snapshot;
  if (meter.sha256 !== receiptSha256 || record.id !== operationId || record.kind !== 'source-acquisition' || record.status !== 'SUCCEEDED'
    || record.details?.sourceId !== 'overture-us-places' || result?.sourceId !== 'overture-us-places'
    || result.receiptIntegrityVerified !== true || result.inspectionRequired !== false || result.snapshotReady !== true
    || result.normalizedPublished !== false || result.completeUsBusinessCoverage !== false || result.exportPolicy !== 'internal'
    || descriptor?.cancellation_after_publication !== false || !uuid(descriptor.run_id) || descriptor.operation_id !== operationId
    || !sha(descriptor.sha256) || descriptor.status !== 'selected-source-retained-not-published'
    || typeof record.startedAt !== 'string' || !Number.isFinite(Date.parse(record.startedAt))) fail();
  const output = path.join(root, operationId, 'output'), directory = path.join(output, 'jobs', descriptor.run_id);
  if (descriptor.manifest !== path.join(directory, 'manifest.json')) fail();
  const checked = await (synthetic ? options.readSnapshot : readOvertureAcquisitionSession)(descriptor, { output, operationId, startedAt: record.startedAt });
  signal?.throwIfAborted();
  const manifest = checked.manifest;
  if (checked.sha256 !== descriptor.sha256 || manifest.operation_id !== operationId || manifest.run_id !== descriptor.run_id
    || manifest.execution_mode !== (synthetic ? 'injected-test-transport' : 'native-fetch')
    || !sha(manifest.plan_sha256) || !sha(manifest.journal?.sha256)) fail();
  for (const key of ['metadata', 'runtime']) {
    const actual = manifest[`${key}_reference`], expected = record.details[key];
    if (!isDeepStrictEqual(actual, expected) || !uuid(actual?.operation_id) || !sha(actual?.descriptor?.sha256)) fail();
  }
  const selected = manifest.selected;
  if (typeof selected?.path !== 'string' || !/^engine\/[a-f0-9-]{36}\/selected\/[a-f0-9-]{36}\/selected-us-places\.jsonl\.gz$/.test(selected.path)
    || !sha(selected.sha256) || !Number.isSafeInteger(selected.bytes) || selected.bytes < 1 || selected.bytes > 4 * 1024 ** 3
    || !Number.isSafeInteger(selected.record_count) || selected.record_count < 0 || selected.record_count > 20000000) fail();
  const end = {}; await readJson(filename, 1024 ** 2, signal, end);
  if (end.sha256 !== receiptSha256 || !same(meter.identity, end.identity)) fail();
  return { sourceFile: path.join(directory, selected.path), descriptor: { ...descriptor },
    metadataReference: structuredClone(manifest.metadata_reference), acquisitionCompletedAt: manifest.completed_at,
    queryFingerprint: manifest.engine?.query_fingerprint,
    binding: { schema_version: 'overture-normalization-acquisition-binding@1', validation_mode: synthetic ? 'synthetic-test-only' : 'native-receipt-reread',
      acquisition_operation_id: operationId, operation_receipt_sha256: receiptSha256, acquisition_run_id: descriptor.run_id,
      acquisition_manifest_sha256: descriptor.sha256, plan_sha256: manifest.plan_sha256, journal_sha256: manifest.journal.sha256,
      metadata_operation_id: manifest.metadata_reference.operation_id, metadata_manifest_sha256: manifest.metadata_reference.descriptor.sha256,
      runtime_operation_id: manifest.runtime_reference.operation_id, runtime_manifest_sha256: manifest.runtime_reference.descriptor.sha256,
      selected_sha256: selected.sha256, selected_bytes: selected.bytes, selected_records: selected.record_count,
      source_authenticity_proven: false, normalized_published: false, complete_us_business_coverage: false } };
}
export async function readOvertureNormalizationInput(options) { try { return await resolve(options, false); } catch { fail(); } }
export async function readOvertureNormalizationInputForTest(options) { try { return await resolve(options, true); } catch { fail(); } }
