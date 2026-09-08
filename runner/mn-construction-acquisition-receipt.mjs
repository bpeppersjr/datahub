import { createHash, randomUUID } from 'node:crypto';
import { lstat, realpath, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { validateMnConstructionPreflight } from './mn-construction-preflight.mjs';
import { bindMnConstructionSourceUse } from './mn-construction-source-use.mjs';
import { verifyMnConstructionRetainedSelection, mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';

const VERSION = 'mn-construction-acquisition-receipt@1.0.0', MAXIMUM = 2_000_000;
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const check = (value, reason) => { if (!value) throw new Error(`Minnesota acquisition evidence rejected: ${reason}.`); };
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const owned = (a, b) => a && b && b.isFile() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev && b.nlink === 1n;
const directorySame = (a, b) => a && b && b.isDirectory() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev;

/** Historical replay, not a new-download permission check or native authentication. */
export async function verifyMnConstructionAcquiredEvidence(evidence, { signal } = {}) {
  signal?.throwIfAborted();
  evidence = structuredClone(evidence);
  check(Buffer.byteLength(JSON.stringify(evidence)) < MAXIMUM - 1000, 'evidence byte ceiling');
  check(exact(evidence, ['schema_version','bundle','preflight','transport','before_notices','before_binding','after_notices','after_binding',
    'evidence_persisted','native_acquisition_verified','app_job_enrolled','national_reporting_integrated'])
    && evidence.schema_version === 'mn-construction-acquired-selection@1.1.0'
    && ['evidence_persisted','native_acquisition_verified','app_job_enrolled','national_reporting_integrated'].every(key => evidence[key] === false), 'evidence envelope');
  validateMnConstructionPreflight(evidence.preflight);
  const transport = evidence.transport, bundle = evidence.bundle;
  check(exact(transport, ['schema_version','cohort','url','started_at','body_finished_at','finished_at','preflight_sha256','source_identity','source_bytes','source_file_sha256',
    'request_count','execution_mode','native_acquisition_verified','source_authenticity_verified','source_use_authorized','app_job_enrolled','public_export_authorized'])
    && transport.schema_version === 'mn-construction-export-transport@1.0.0' && ['registrations','residential'].includes(transport.cohort)
    && transport.execution_mode === 'injected-transport' && transport.request_count === 3
    && ['native_acquisition_verified','source_authenticity_verified','source_use_authorized','app_job_enrolled','public_export_authorized'].every(key => transport[key] === false), 'transport claims');
  const observation = evidence.preflight.observations[transport.cohort === 'registrations' ? 0 : 1];
  check(transport.url === observation.url && same(transport.source_identity, observation.source_identity)
    && transport.preflight_sha256 === sha(evidence.preflight) && transport.source_bytes === observation.source_identity.file_bytes && transport.source_bytes <= 50000000
    && typeof transport.source_file_sha256 === 'string' && /^[a-f0-9]{64}$/.test(transport.source_file_sha256), 'transport measurement');
  const before = bindMnConstructionSourceUse(evidence.before_notices, { checkedAt: evidence.before_binding?.checked_at });
  const after = bindMnConstructionSourceUse(evidence.after_notices, { checkedAt: evidence.after_binding?.checked_at });
  check(same(before, evidence.before_binding) && same(after, evidence.after_binding), 'binding replay');
  const times = [evidence.before_notices.finished_at, transport.started_at, before.checked_at, transport.body_finished_at,
    evidence.after_notices.started_at, evidence.after_notices.finished_at, after.checked_at, transport.finished_at];
  check(times.every((value, index) => time(value) && (!index || value >= times[index - 1])), 'cross-stage chronology');
  for (const at of [transport.started_at, before.checked_at]) {
    check([evidence.preflight.started_at, evidence.preflight.finished_at, observation.observed_at].every(value => value <= at && Date.parse(at) - Date.parse(value) <= 900000), 'schema freshness at acquisition');
  }
  check(exact(bundle, ['manifest_path','bundle_id','counts','native_acquisition_verified','manifest_sha256']) && UUID.test(bundle.bundle_id)
    && bundle.native_acquisition_verified === false && typeof bundle.manifest_path === 'string'
    && path.basename(path.dirname(bundle.manifest_path)) === bundle.bundle_id, 'bundle descriptor');
  const verified = await verifyMnConstructionRetainedSelection(bundle.manifest_path, { signal }), selected = verified.selection_receipt;
  check(bundle.manifest_sha256 === verified.manifest_sha256 && same(bundle.counts, verified.manifest.counts)
    && selected.source_bytes === transport.source_bytes && selected.source_file_sha256 === transport.source_file_sha256
    && selected.context.cohort === transport.cohort && selected.context.observedAt <= transport.started_at
    && Date.parse(transport.started_at) - Date.parse(selected.context.observedAt) <= 900000, 'retained bundle linkage');
  return { bundle_id: bundle.bundle_id, manifest_sha256: verified.manifest_sha256, counts: verified.manifest.counts,
    run_id: selected.context.runId, source_release_id: selected.context.sourceReleaseId,
    evidence_sha256: sha(evidence), source_authenticity_verified: false, native_acquisition_verified: false, app_job_enrolled: false };
}

async function inspect(receipt, signal) {
  check(exact(receipt, ['schema_version','receipt_id','status','created_at','evidence','evidence_sha256']) && receipt.schema_version === VERSION
    && UUID.test(receipt.receipt_id) && receipt.status === 'verified-injected-acquisition-evidence' && time(receipt.created_at), 'receipt envelope');
  const verified = await verifyMnConstructionAcquiredEvidence(receipt.evidence, { signal });
  check(receipt.evidence_sha256 === verified.evidence_sha256 && receipt.created_at >= receipt.evidence.transport.finished_at, 'receipt digest or chronology');
  return verified;
}

export async function verifyMnConstructionAcquisitionReceipt(filename, { signal } = {}) {
  try {
    check(typeof filename === 'string' && path.basename(filename).endsWith('.json') && UUID.test(path.basename(filename, '.json')), 'receipt filename');
    const first = {}, last = {}, receipt = await readJson(filename, MAXIMUM, signal, first);
    check(receipt.receipt_id === path.basename(filename, '.json'), 'receipt filename identity');
    const verified = await inspect(receipt, signal);
    await readJson(filename, MAXIMUM, signal, last);
    check(first.sha256 === last.sha256 && owned(first.identity, last.identity), 'receipt changed during replay');
    return { ...verified, receipt_path: filename, receipt_sha256: first.sha256, receipt_bytes: first.bytes, evidence_persisted: true, receipt };
  } catch { signal?.throwIfAborted(); throw new Error('Minnesota acquisition receipt verification failed.'); }
}

export async function writeMnConstructionAcquisitionReceipt(evidence, { signal, outputRoot = path.join(APP_ROOT, 'data/business-sources/mn-dli-construction/acquisitions') } = {}) {
  signal?.throwIfAborted();
  // Freeze the logical input before the first await, including retained path pins.
  const snapshot = structuredClone(evidence);
  check(Buffer.byteLength(JSON.stringify(snapshot)) < MAXIMUM - 1000, 'evidence byte ceiling');
  const verified = await verifyMnConstructionAcquiredEvidence(snapshot, { signal });
  await canonical(outputRoot, { output: true, signal });
  await canonical(outputRoot, { create: true, output: true, signal });
  const directoryOwner = await lstat(outputRoot, { bigint: true }), id = randomUUID();
  const temporary = path.join(outputRoot, id + '.tmp'), destination = path.join(outputRoot, id + '.json'), owners = new Map();
  const receipt = { schema_version: VERSION, receipt_id: id, status: 'verified-injected-acquisition-evidence', created_at: new Date().toISOString(), evidence: snapshot, evidence_sha256: verified.evidence_sha256 };
  let output, published = false;
  try {
    output = await writer(temporary, MAXIMUM, signal, owners); await output.write(receipt); const descriptor = await output.finish();
    const stored = await readJson(temporary, MAXIMUM, signal); check(same(stored, receipt), 'written receipt'); await inspect(stored, signal);
    const meter = {}; await readJson(temporary, MAXIMUM, signal, meter);
    check(meter.sha256 === descriptor.sha256 && owned(owners.get(temporary), meter.identity)
      && directorySame(directoryOwner, await lstat(outputRoot, { bigint: true })), 'publication ownership or bytes');
    await canonical(outputRoot, { output: true, signal }); signal?.throwIfAborted();
    await link(temporary, destination); published = true; await unlink(temporary);
    return await verifyMnConstructionAcquisitionReceipt(destination);
  } catch {
    await output?.close().catch(() => {});
    if (signal?.aborted && !published && await realpath(outputRoot).catch(() => null) === outputRoot
      && directorySame(directoryOwner, await lstat(outputRoot, { bigint: true }).catch(() => null))
      && owned(owners.get(temporary), await lstat(temporary, { bigint: true }).catch(() => null))) await unlink(temporary);
    signal?.throwIfAborted(); throw new Error('Minnesota acquisition receipt write failed; incomplete evidence retained.');
  }
}
