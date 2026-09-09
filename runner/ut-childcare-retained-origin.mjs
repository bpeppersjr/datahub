import path from 'node:path';
import {lstat, open, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical, mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {runUtChildcarePdfPrerequisite} from './ut-childcare-pdf-runtime.mjs';

export const UT_RETAINED_ORIGIN_VERSION = 'ut-childcare-retained-origin@1.0.0';
export const UT_RETAINED_ORIGIN = Object.freeze({
  sourceUrl: 'https://dlbc.utah.gov/wp-content/uploads/All-Child-Care-Licensing-Facilities-Report-September-2026.pdf',
  sourceSha256: '85af831248bac41ffae8eef23145ce8935d58d31c66ce92caa3c99519358e8fa', sourceBytes: 332869,
  manifestSha256: 'a374c84c7c405f47bd757bed468c9875a9ef5eff35c6e4b2e8c49876e361b7f5',
  requestSha256: '2dc704f3e0c0aff4707872b545378626859cc0c0ccdf42107e592b456c9b4519',
  prerequisiteId: 'e3332e6b-da88-4110-820b-24ad87758caf',
  prerequisiteSha256: '2263a8731bc9774c057d3c260b69c46d564bb50630a49ca01f3f23fbe4082ccb',
  selectedSha256: '7133e8ff5aeb83bc7c86f01b661496961e1506ae906d2d3d71e7343e0c527d02',
  reportEdition: 'September 2026', observedAt: '2026-09-08T22:59:26.309Z',
});
const C = UT_RETAINED_ORIGIN;
const ASSESSMENT = path.join(APP_ROOT, 'data/business-sources/ut-childcare/assessments', C.sourceSha256);
const PREREQUISITE = path.join(APP_ROOT, 'data/business-sources/ut-childcare/pdf-prerequisites', C.prerequisiteId);
const hash = value => createHash('sha256').update(value).digest('hex');
const check = value => { if (!value) throw Error('Utah retained-origin evidence rejected.'); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && same(Object.keys(value).sort(), [...keys].sort());
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

// Logical validation only; the reader below additionally checks pinned raw bytes.
export function validateUtOriginMetadata(manifest, request) {
  check(exact(manifest, ['schema_version', 'purpose', 'retained_at', 'export_policy', 'original_document_unmodified',
    'source_url', 'source_observed_at', 'artifacts', 'claims']));
  check(manifest.schema_version === 'ut-childcare-document-assessment@1.0.0'
    && manifest.purpose === 'source-format-assessment-not-app-acquisition'
    && manifest.export_policy === 'internal-assessment-only' && manifest.original_document_unmodified === true
    && manifest.source_url === C.sourceUrl && manifest.source_observed_at === C.observedAt);
  check(same(manifest.artifacts, [{path: 'source.pdf', bytes: C.sourceBytes, sha256: C.sourceSha256},
    {path: 'assessment-receipt.json', bytes: 638, sha256: C.requestSha256}]));
  check(same(manifest.claims, {production_acquisition_verified: false, normalized_candidates_published: false,
    current_operations_verified: false, national_coverage_integrated: false}));
  check(exact(request, ['purpose', 'url', 'method', 'status', 'started_at', 'finished_at', 'bytes', 'sha256', 'etag', 'last_modified', 'file', 'export_policy']));
  check(request.purpose === 'bounded-source-format-assessment-not-production-acquisition' && request.url === C.sourceUrl
    && request.method === 'GET' && request.status === 200 && request.bytes === C.sourceBytes && request.sha256 === C.sourceSha256
    && request.finished_at === C.observedAt && request.export_policy === 'internal-assessment-only'
    && request.etag === '"6a9704c0-51445"' && request.last_modified === 'Tue, 01 Sep 2026 17:00:48 GMT'
    && typeof request.file === 'string');
  check([request.started_at, request.finished_at, manifest.retained_at].every(time)
    && request.started_at <= request.finished_at && request.finished_at <= manifest.retained_at);
  return {source_url: C.sourceUrl, observed_at: C.observedAt, original_get_recorded: true,
    historical_app_acquisition_verified: false, independent_publisher_authentication: false,
    redirect_chain_recorded: false, content_type_recorded: false};
}
async function sourceHash(signal) {
  await canonical(ASSESSMENT, {signal});
  const file = path.join(ASSESSMENT, 'source.pdf'), before = await lstat(file, {bigint: true});
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size === BigInt(C.sourceBytes));
  const handle = await open(file, 'r'), digest = createHash('sha256');
  let bytes = 0;
  const stable = value => value.ino === before.ino && value.dev === before.dev && value.nlink === 1n
    && value.size === before.size && value.mtimeNs === before.mtimeNs && value.ctimeNs === before.ctimeNs;
  try {
    check(stable(await handle.stat({bigint: true})));
    for (;;) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(65536), read = await handle.read(buffer);
      if (!read.bytesRead) break;
      bytes += read.bytesRead; check(bytes <= C.sourceBytes); digest.update(buffer.subarray(0, read.bytesRead));
    }
    check(bytes === C.sourceBytes && digest.digest('hex') === C.sourceSha256
      && stable(await handle.stat({bigint: true})) && stable(await lstat(file, {bigint: true})));
  } finally { await handle.close(); }
}
async function retained(signal) {
  const pins = {}, read = async (file, maximum, expected) => {
    const meter = {}, value = await readJson(file, maximum, signal, meter);
    check(meter.sha256 === expected); pins[path.relative(APP_ROOT, file).replaceAll('\\', '/')] = meter.sha256;
    return value;
  };
  const manifest = await read(path.join(ASSESSMENT, 'manifest.json'), 4096, C.manifestSha256);
  const request = await read(path.join(ASSESSMENT, 'assessment-receipt.json'), 4096, C.requestSha256);
  const origin = validateUtOriginMetadata(manifest, request);
  check(same((await readdir(ASSESSMENT)).sort(), ['assessment-receipt.json', 'manifest.json', 'source.pdf']));
  await sourceHash(signal);
  const receipt = await read(path.join(PREREQUISITE, 'receipt.json'), 16000, C.prerequisiteSha256);
  const selected = await read(path.join(PREREQUISITE, 'selected-observations.json'), 1_000_000, C.selectedSha256);
  check(same((await readdir(PREREQUISITE)).sort(), ['receipt.json', 'selected-observations.json']));
  check(exact(receipt, ['schema_version', 'status', 'started_at', 'finished_at', 'source', 'runtime', 'implementation_sha256',
    'resource_guard', 'process', 'selected_sha256', 'total_rows', 'selected_rows', 'claims', 'export_policy', 'artifact']));
  check(receipt.schema_version === 'ut-childcare-pdf-prerequisite@1.0.0' && receipt.status === 'validated-local-source'
    && receipt.export_policy === 'internal-prerequisite-only' && receipt.selected_sha256 === C.selectedSha256
    && same(receipt.artifact, {path: 'selected-observations.json', bytes: 195994, sha256: C.selectedSha256})
    && same(receipt.source, {path: path.relative(APP_ROOT, path.join(ASSESSMENT, 'source.pdf')).replaceAll('\\', '/'),
      sha256: C.sourceSha256, bytes: C.sourceBytes, report_edition: C.reportEdition}));
  check(time(receipt.started_at) && time(receipt.finished_at) && receipt.started_at >= manifest.retained_at
    && receipt.finished_at >= receipt.started_at && receipt.process.exitCode === 0 && receipt.process.signal === null
    && receipt.process.stderrBytes === 0 && receipt.process.forcedTermination === false
    && receipt.total_rows === 1961 && receipt.selected_rows === 422
    && hash(JSON.stringify(selected)) === C.selectedSha256);
  check(same(receipt.claims, {app_acquisition_verified: false, source_authenticity_independently_verified: false,
    public_export_authorized: false, current_operations_verified: false, national_coverage_integrated: false,
    runtime_independently_security_audited: false}));
  return {origin, pins, receipt, selected};
}

export async function verifyUtRetainedOrigin(options = {}) {
  try {
    check(options && Object.keys(options).every(key => key === 'signal')
      && (options.signal === undefined || options.signal instanceof AbortSignal));
    const {signal} = options;
    signal?.throwIfAborted();
    const initial = await retained(signal);
    const replay = await runUtChildcarePdfPrerequisite({sourcePath: path.join(ASSESSMENT, 'source.pdf'),
      sourceSha256: C.sourceSha256, reportEdition: C.reportEdition, signal});
    check(same(initial.selected, replay.selected) && same(initial.receipt.runtime, replay.receipt.runtime)
      && same(initial.receipt.implementation_sha256, replay.receipt.implementation_sha256)
      && same(initial.receipt.resource_guard, replay.receipt.resource_guard));
    const final = await retained(signal);
    check(same(initial, final)); signal?.throwIfAborted();
    return {selected: initial.selected, verification: {schema_version: UT_RETAINED_ORIGIN_VERSION,
      status: 'retained-origin-linked-and-locally-replayed', source: initial.origin, retained_pins: initial.pins,
      source_sha256: C.sourceSha256, source_bytes: C.sourceBytes, report_edition: C.reportEdition,
      prerequisite_receipt_sha256: C.prerequisiteSha256, origin_receipt_sha256: C.requestSha256,
      prerequisite_finished_at: initial.receipt.finished_at,
      replay_runtime: replay.receipt.runtime, replay_implementation_sha256: replay.receipt.implementation_sha256,
      selected_sha256: C.selectedSha256, claims: {local_replay_verified: true, refetch_performed: false,
        app_acquisition_verified: false, independent_publisher_authentication: false, public_export_authorized: false,
        current_operations_verified: false, national_coverage_integrated: false}}};
  } catch {
    if (options?.signal?.aborted) options.signal.throwIfAborted();
    throw new Error('Utah retained-origin verification failed.');
  }
}
