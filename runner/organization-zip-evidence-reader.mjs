import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { APP_ROOT } from './paths.mjs';

export const ORGANIZATION_ZIP_EVIDENCE_SELECTION = Object.freeze({
  release_id: 'broad-organization-zip-evidence-20260923-002630301Z-9cdbdcd319f2',
  manifest_sha256: 'ee5896c32daf5b50a8b1ac44717ccd4a3005b91d1ca65dfc869c04490d441a7e',
});
export const ORGANIZATION_ZIP_PUBLISHERS = Object.freeze(['CO', 'CT', 'DE', 'FL', 'IA', 'NY', 'OR', 'PA']);
const DATASET = 'broad-organization-zip-evidence';
const ARTIFACT_TYPE = 'broad-organization-zip-jsonl-gzip';
const MAX_ARTIFACT_BYTES = 2_000_000_000;
const MAX_UNCOMPRESSED_BYTES = 12_000_000_000;
const MAX_RECORD_BYTES = 2_000_000;
const MAX_ROWS = 50_000_000;
const MAX_SCAN_MS = 300_000;
const MAX_WAITERS = 16;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = (message = 'Selected organization ZIP evidence is unavailable.') => { throw new Error(message); };
function abort(signal) { signal?.throwIfAborted(); }
function inside(root, target) { const relative = path.relative(path.resolve(root), path.resolve(target)); if (relative.startsWith('..') || path.isAbsolute(relative)) reject(); }
async function safeFile(root, file) {
  inside(root, file);
  const resolvedRoot = path.resolve(root);
  if (await realpath(resolvedRoot) !== resolvedRoot) reject();
  let cursor = resolvedRoot;
  for (const part of path.relative(resolvedRoot, file).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { const stat = await lstat(cursor); if (stat.isSymbolicLink()) reject(); }
    catch (error) { if (error.code === 'ENOENT') reject(); throw error; }
  }
  const stat = await lstat(file);
  if (!stat.isFile() || stat.nlink !== 1) reject();
  return stat;
}
function exactArtifact(manifest, prefix) {
  const relative = `derived/organizations/zip-prefix=${prefix}.jsonl.gz`;
  const entries = manifest.artifacts?.filter(item => item.path === relative && item.artifact_type === ARTIFACT_TYPE) ?? [];
  if (entries.length !== 1) reject();
  const artifact = entries[0];
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > MAX_ARTIFACT_BYTES
    || !Number.isSafeInteger(artifact.record_count) || artifact.record_count < 0 || artifact.record_count > MAX_ROWS
    || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) reject();
  return artifact;
}
function addressFor(row, contract) {
  const source = row.source_record?.[contract.address_field];
  const address = Array.isArray(source) ? source[row.address_index] : source;
  if (!address || typeof address !== 'object' || Array.isArray(address)) reject('Selected organization ZIP row has no source address.');
  return address;
}
function validateSourceRow(row, manifest, prefix) {
  const contract = manifest.source_contract?.[row?.state]; const source = row?.source_record;
  if (!contract || !source || row.schema_version !== 'broad-organization-zip-evidence@1.0.0') reject(`Organization ZIP row ${row?.row_id ?? 'unknown'} has no source descriptor.`);
  if (!['organization', 'registration', 'brand'].includes(row.record_kind)
    || row.record_kind === 'brand' && (row.state !== 'OR' || contract.record_kind !== 'registration')
    || row.record_kind !== 'brand' && row.record_kind !== contract.record_kind) reject(`Organization ZIP row ${row.row_id} record unit drifted.`);
  if (typeof source.normalized_record_id !== 'string' || !source.normalized_record_id || row.row_id !== `${source.normalized_record_id}:address:${row.address_index}`
    || row.address_field !== contract.address_field || !Number.isSafeInteger(row.address_index) || row.address_index < 0
    || typeof row.display_name !== 'string' || !row.display_name.trim()) reject(`Organization ZIP row ${row.row_id} source/address key drifted.`);
  if (source.provenance?.source_id !== contract.normalized_source_id || source.provenance?.source_release_id !== contract.source_release_id
    || source.provenance?.policy_id !== contract.policy_id || source.provenance?.transformation_version !== manifest.dependencies?.sources?.[row.state]?.transformation) reject(`Organization ZIP row ${row.row_id} provenance drifted.`);
  if (row.zip_partition !== 'eligible-zip5-prefix' || !/^\d{5}$/.test(row.zip_fields?.zip5 ?? '')
    || !row.zip_fields.zip5.startsWith(prefix) || row.zip_fields.eligible_for_zip_partition !== true
    || typeof row.export_policy !== 'string') reject(`Organization ZIP row ${row.row_id} ZIP or policy fields drifted.`);
  const address = addressFor(row, contract);
  if (address.eligible_for_us_zip_coverage !== true || address.zip_code !== row.zip_fields.zip5 || (address.zip4 ?? null) !== (row.zip_fields.zip4 ?? null)) reject(`Organization ZIP row ${row.row_id} address fields do not match its source linkage.`);
}
export function projectOrganizationZipEvidenceRow(row, sourceContract, policyMode) {
  if (!row || typeof row !== 'object' || !ORGANIZATION_ZIP_PUBLISHERS.includes(row.state) || !sourceContract?.[row.state]) reject();
  if (row.zip_partition !== 'eligible-zip5-prefix' || !/^\d{5}$/.test(row.zip_fields?.zip5 ?? '') || !row.zip_fields.zip5.startsWith(row.zip_fields.zip5.slice(0, 2))) reject();
  const contract = sourceContract[row.state];
  if (row.record_kind !== (row.state === 'OR' && row.record_kind === 'brand' ? 'brand' : contract.record_kind)) reject();
  if (contract.field_export_policy?.normalized_record_level_organizations_addresses_assertions_and_match_profiles === 'local-review-only'
    && (policyMode !== 'local-review' || row.state !== 'DE')) reject('Delaware details require explicit local-review mode.');
  const source = row.source_record;
  if (!source || typeof source !== 'object' || source.normalized_record_id == null || source.provenance?.source_id !== contract.normalized_source_id
    || source.provenance?.source_release_id !== contract.source_release_id || source.provenance?.policy_id !== contract.policy_id) reject();
  const address = addressFor(row, contract);
  const state = address.state_code ?? address.state ?? address.state_source ?? null;
  const street = address.street ?? address.address_line_1 ?? null;
  const unit = address.unit_or_additional ?? address.address_line_2 ?? null;
  const city = address.city ?? null;
  const zip5 = row.zip_fields.zip5;
  const zip4 = row.zip_fields.zip4 ?? null;
  const sourceStatus = source.source_status ?? {};
  return {
    row_id: row.row_id,
    record_kind: row.record_kind,
    publisher_jurisdiction: row.state,
    address_state: typeof state === 'string' ? state : null,
    display_name: row.display_name,
    address: { street: typeof street === 'string' ? street : null, unit_or_additional: typeof unit === 'string' ? unit : null, city: typeof city === 'string' ? city : null, zip5, zip4 },
    source_status: {
      status: typeof sourceStatus.status === 'string' ? sourceStatus.status : null,
      status_class: typeof sourceStatus.status_class === 'string' ? sourceStatus.status_class : null,
      semantics: typeof sourceStatus.semantics === 'string' ? sourceStatus.semantics : null,
    },
    temporal: {
      observed_at: typeof source.observed_at === 'string' ? source.observed_at : null,
      source_status_updated_at: typeof sourceStatus.source_rows_updated_at === 'string' ? sourceStatus.source_rows_updated_at : null,
      formation_date: typeof source.registration_profile?.formation_date === 'string' ? source.registration_profile.formation_date : null,
      effective_date: typeof source.registration_profile?.effective_date === 'string' ? source.registration_profile.effective_date : null,
      source_release_id: contract.source_release_id,
    },
    provenance: { source_id: contract.normalized_source_id, source_release_id: contract.source_release_id, source_record_id: typeof source.provenance.source_record_id === 'string' ? source.provenance.source_record_id : null, transformation_version: source.provenance.transformation_version, policy_id: contract.policy_id, policy_version: contract.policy_version },
    policy: { mode: policyMode, row_policy: row.export_policy, local_review_only: row.export_policy === 'local-review-only', redistribution: contract.redistribution },
    claims: { source_reported_administrative_address: true, physical_site: false, current_operation: false, unique_business: false, usps_validity: false, contributes_to_general_business_or_site_totals: false },
  };
}

function cursorEncode(payload) { return Buffer.from(JSON.stringify(payload)).toString('base64url'); }
function cursorDecode(cursor, binding) {
  if (!cursor) return 0;
  if (typeof cursor !== 'string' || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) reject('Cursor is invalid.');
  let value;
  try { const bytes = Buffer.from(cursor, 'base64url'); value = JSON.parse(bytes.toString('utf8')); if (cursorEncode(value) !== cursor) reject('Cursor is invalid.'); } catch { reject('Cursor is invalid.'); }
  if (!value || Object.keys(value).sort().join(',') !== 'limit,manifest_sha256,offset,policy_mode,publisher_state,release_id,shard_sha256,zip5'
    || value.release_id !== binding.release_id || value.zip5 !== binding.zip5 || value.publisher_state !== binding.publisher_state
    || value.policy_mode !== binding.policy_mode || value.limit !== binding.limit || value.manifest_sha256 !== binding.manifest_sha256
    || value.shard_sha256 !== binding.shard_sha256 || !Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > MAX_ROWS) reject('Cursor does not match this release and selection.');
  return value.offset;
}

export function createOrganizationZipEvidenceReader({ root = APP_ROOT, selection = ORGANIZATION_ZIP_EVIDENCE_SELECTION, concurrency = 1 } = {}) {
  if (concurrency !== 1) throw new Error('Organization ZIP evidence permits only one shard scan in flight.');
  let active = 0; const waiters = [];
  async function acquire(signal) {
    abort(signal);
    if (active < concurrency) { active += 1; return; }
    if (waiters.length >= MAX_WAITERS) throw Object.assign(new Error('Organization ZIP evidence reader is busy.'), { statusCode: 503 });
    await new Promise((resolve, rejectPromise) => {
      const waiter = { resolve, reject: rejectPromise, signal, onAbort: null };
      waiter.onAbort = () => { const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1); rejectPromise(signal.reason ?? new Error('Operation aborted')); };
      signal?.addEventListener('abort', waiter.onAbort, { once: true }); waiters.push(waiter);
    });
  }
  function release() { active -= 1; const waiter = waiters.shift(); if (waiter) { waiter.signal?.removeEventListener('abort', waiter.onAbort); active += 1; waiter.resolve(); } }
  async function loadManifest(signal) {
    abort(signal);
    const selectionPath = path.join(root, 'config/broad-organization-zip-evidence-selection.json'); await safeFile(root, selectionPath);
    const selected = JSON.parse((await readFile(selectionPath)).toString('utf8'));
    if (Object.keys(selected).sort().join(',') !== 'dataset_id,manifest_sha256,release_id,schema_version'
      || selected.schema_version !== 'broad-organization-zip-evidence-selection@1.0.0' || selected.dataset_id !== DATASET
      || selected.release_id !== selection.release_id || selected.manifest_sha256 !== selection.manifest_sha256) reject('Pinned organization ZIP selection config drifted.');
    const directory = path.join(root, 'data/business-sources/broad-organization-zip-evidence/releases', selection.release_id);
    const manifestPath = path.join(directory, 'manifest.json'); const manifestInfo = await safeFile(root, manifestPath);
    if (manifestInfo.size > 2_000_000) reject('Pinned organization ZIP manifest exceeds its byte limit.');
    const bytes = await readFile(manifestPath); if (sha(bytes) !== selection.manifest_sha256) reject('Pinned organization ZIP manifest checksum drifted.');
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (manifest.dataset_id !== DATASET || manifest.release_id !== selection.release_id || manifest.status !== 'published'
      || manifest.claims?.network_requests_performed !== 0 || manifest.claims?.contributes_to_general_business_or_site_totals !== false
      || !manifest.source_contract || !Array.isArray(manifest.artifacts)) reject('Pinned organization ZIP manifest contract drifted.');
    return { directory, manifest, manifestBytes: bytes };
  }
  async function* verifiedRows(context, zip5, policyMode, signal) {
    const prefix = zip5.slice(0, 2); const artifact = exactArtifact(context.manifest, prefix); const file = path.join(context.directory, artifact.path);
    const before = await safeFile(root, file);
    const hash = createHash('sha256'); let inputBytes = 0; let uncompressedBytes = 0; let records = 0; const deadline = Date.now() + MAX_SCAN_MS; const decoder = new TextDecoder('utf-8', { fatal: true });
    const input = createReadStream(file, { signal });
    const meter = new Transform({ transform(chunk, _encoding, callback) { abort(signal); inputBytes += chunk.length; if (inputBytes > MAX_ARTIFACT_BYTES) return callback(new Error('Artifact byte limit exceeded.')); hash.update(chunk); callback(null, chunk); } });
    const gunzip = createGunzip(); const plainMeter = new Transform({ transform(chunk, _encoding, callback) { try { decoder.decode(chunk, { stream: true }); uncompressedBytes += chunk.length; if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) return callback(new Error('Artifact decompressed byte limit exceeded.')); callback(null, chunk); } catch (error) { callback(error); } }, flush(callback) { try { decoder.decode(); callback(); } catch (error) { callback(error); } } });
    const output = new PassThrough();
    const piped = pipeline(input, meter, gunzip, plainMeter, output, { signal });
    piped.catch(() => {});
    const lines = createInterface({ input: output, crlfDelay: Infinity });
    try {
      for await (const text of lines) {
        abort(signal); if (Date.now() > deadline) reject('Organization ZIP shard scan exceeded its time limit.'); if (!text) continue; if (Buffer.byteLength(text) > MAX_RECORD_BYTES) reject('Organization ZIP record exceeds the line limit.');
        const row = JSON.parse(text); records += 1; if (records > artifact.record_count || records > MAX_ROWS) reject('Organization ZIP row count exceeds its declared bound.');
        validateSourceRow(row, context.manifest, prefix);
        if (row.zip_fields.zip5 === zip5) yield row;
      }
      await piped;
      abort(signal);
      const after = await safeFile(root, file);
      if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs
        || inputBytes !== artifact.bytes || hash.digest('hex') !== artifact.sha256 || records !== artifact.record_count) reject('Organization ZIP shard integrity or row count failed verification.');
    } finally { lines.close(); input.destroy(); meter.destroy(); gunzip.destroy(); plainMeter.destroy(); output.destroy(); }
  }
  return {
    selection: Object.freeze({ ...selection }),
    async scan({ zip5, publisherState = null, policyMode, signal, onRow } = {}) {
      if (!/^\d{5}$/.test(zip5 ?? '') || publisherState !== null && !ORGANIZATION_ZIP_PUBLISHERS.includes(publisherState)
        || !['public-only', 'local-review'].includes(policyMode) || typeof onRow !== 'function') throw Object.assign(new Error('Invalid organization ZIP evidence scan.'), { statusCode: 400 });
      await acquire(signal);
      try {
        const context = await loadManifest(signal); let total = 0; let policyExcludedRows = 0;
        for await (const row of verifiedRows(context, zip5, policyMode, signal)) {
          if (publisherState && row.state !== publisherState) continue;
          if (policyMode === 'public-only' && row.state === 'DE') { policyExcludedRows += 1; continue; }
          await onRow(projectOrganizationZipEvidenceRow(row, context.manifest.source_contract, policyMode)); total += 1;
        }
        abort(signal);
        return { total, policy_excluded_row_count: policyMode === 'public-only' ? policyExcludedRows : null, release_id: context.manifest.release_id, manifest_sha256: selection.manifest_sha256, shard_path: `derived/organizations/zip-prefix=${zip5.slice(0, 2)}.jsonl.gz`, shard_sha256: exactArtifact(context.manifest, zip5.slice(0, 2)).sha256 };
      } finally { release(); }
    },
    async get({ zip5, publisherState = null, policyMode, limit = 50, cursor = null, signal } = {}) {
      if (!/^\d{5}$/.test(zip5 ?? '') || publisherState !== null && !ORGANIZATION_ZIP_PUBLISHERS.includes(publisherState)
        || !['public-only', 'local-review'].includes(policyMode) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw Object.assign(new Error('Invalid organization ZIP evidence selection.'), { statusCode: 400 });
      }
      const binding = { release_id: selection.release_id, zip5, publisher_state: publisherState, policy_mode: policyMode, limit };
      await acquire(signal);
      try {
        const context = await loadManifest(signal); const artifact = exactArtifact(context.manifest, zip5.slice(0, 2)); const cursorBinding = { ...binding, manifest_sha256: selection.manifest_sha256, shard_sha256: artifact.sha256 }; const offset = cursorDecode(cursor, cursorBinding); const rows = []; let total = 0; let policyExcludedRows = 0;
        for await (const row of verifiedRows(context, zip5, policyMode, signal)) {
          if (publisherState && row.state !== publisherState) continue;
          if (policyMode === 'public-only' && row.state === 'DE') { policyExcludedRows += 1; continue; }
          if (total >= offset && rows.length < limit) rows.push(projectOrganizationZipEvidenceRow(row, context.manifest.source_contract, policyMode));
          total += 1;
        }
        abort(signal);
        const nextOffset = offset + rows.length;
        if (offset > total) reject('Cursor offset exceeds this exact ZIP result set.');
        const nextCursor = nextOffset < total ? cursorEncode({ ...cursorBinding, offset: nextOffset }) : null;
        return {
          status: 'available', zip5, policy_mode: policyMode, publisher_state_filter: publisherState,
          bindings: { dataset_id: DATASET, release_id: context.manifest.release_id, manifest_sha256: selection.manifest_sha256, shard_path: `derived/organizations/zip-prefix=${zip5.slice(0, 2)}.jsonl.gz`, shard_sha256: exactArtifact(context.manifest, zip5.slice(0, 2)).sha256 },
          semantics: { row_unit: 'one source-reported normalized organization or registration address row', publisher_jurisdiction_is_distinct_from_reported_address_state: true, rows_are_physical_sites: false, rows_assert_current_operations: false, contributes_to_business_or_site_totals: false, local_review_restriction: policyMode === 'local-review' ? 'Delaware record-level details remain local-review-only.' : null, policy_exclusion_count_is_not_missing_or_zero_evidence: policyMode === 'public-only' },
          page: { limit, offset, total_matching_rows: total, next_cursor: nextCursor }, rows,
          ...(policyMode === 'public-only' ? { policy_excluded_row_count: policyExcludedRows, policy_excluded_row_semantics: 'Delaware rows withheld by source redistribution policy; not missing or zero evidence.' } : {}),
          source_policy_summary: policyMode === 'local-review' ? context.manifest.source_contract : Object.fromEntries(Object.entries(context.manifest.source_contract).filter(([state]) => state !== 'DE')),
        };
      } finally { release(); }
    },
  };
}

export const organizationZipEvidenceReader = createOrganizationZipEvidenceReader();
