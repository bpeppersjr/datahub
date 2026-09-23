import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough, Transform } from 'node:stream';
import { pipeline, finished } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { APP_ROOT } from './paths.mjs';
import { createOrganizationZipEvidenceReader, ORGANIZATION_ZIP_EVIDENCE_SELECTION } from './organization-zip-evidence-reader.mjs';

const SCHEMA = 'organization-zip-evidence-export@1.0.0';
const MAX_BYTES = 2_000_000_000;
const MAX_LINE = 2_000_000;
const COLUMNS = Object.freeze(['row_id', 'record_kind', 'publisher_jurisdiction', 'address_state', 'display_name', 'address.street', 'address.unit_or_additional', 'address.city', 'address.zip5', 'address.zip4', 'source_status.status', 'source_status.status_class', 'source_status.semantics', 'temporal.observed_at', 'temporal.source_status_updated_at', 'temporal.formation_date', 'temporal.effective_date', 'temporal.source_release_id', 'provenance.source_id', 'provenance.source_release_id', 'provenance.source_record_id', 'provenance.transformation_version', 'provenance.policy_id', 'provenance.policy_version', 'policy.mode', 'policy.row_policy', 'policy.local_review_only', 'policy.redistribution']);
const reject = message => { throw new Error(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
const field = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
function csvCell(value) { const text = value == null ? '' : String(value); if (/[\r\n]/.test(text)) reject('Export fields contain line breaks and cannot be represented safely.'); const safe = /^[=+\-@\t]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
function rowLine(row, format) { return format === 'jsonl' ? `${JSON.stringify(row)}\n` : `${COLUMNS.map(column => csvCell(field(row, column))).join(',')}\n`; }
function inside(parent, child) { const relative = path.relative(path.resolve(parent), path.resolve(child)); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) reject('Export path is outside its output root.'); }
async function safeDirectory(root, directory) {
  inside(root, directory); const base = path.resolve(root); let cursor = base;
  for (const part of path.relative(base, directory).split(path.sep).filter(Boolean)) { cursor = path.join(cursor, part); const item = await lstat(cursor); if (!item.isDirectory() || item.isSymbolicLink()) reject('Export output traverses an unsafe directory.'); }
  if (path.resolve(await realpath(directory)) !== path.resolve(directory)) reject('Export output path is aliased.');
}
async function createSafeDirectory(root, directory) {
  inside(root, directory); const base = path.resolve(root); if (await realpath(base) !== base) reject('Export root is aliased.');
  let cursor = base;
  for (const part of path.relative(base, directory).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { const info = await lstat(cursor); if (!info.isDirectory() || info.isSymbolicLink()) reject('Export output traverses an unsafe directory.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(cursor); }
  }
  await safeDirectory(root, directory);
}
async function writeManifestLast(directory, value, onOwned) { const file = path.join(directory, 'manifest.json'); const handle = await open(file, 'wx'); try { const identity = await handle.stat(); onOwned(identity); const bytes = Buffer.from(`${JSON.stringify(value)}\n`); if (bytes.length > 100_000) reject('Export manifest exceeds its size limit.'); await handle.writeFile(bytes); await handle.sync(); return { sha256: sha(bytes), identity }; } finally { await handle.close(); } }

async function createWriter(directory, name, format, signal) {
  const file = path.join(directory, name); const stream = createWriteStream(file, { flags: 'wx' }); await once(stream, 'open'); const identity = await lstat(file); const hash = createHash('sha256'); let bytes = 0; let rows = 0;
  async function write(text) { signal?.throwIfAborted(); const chunk = Buffer.from(text); bytes += chunk.length; if (bytes > MAX_BYTES) reject('Export artifact exceeds its byte limit.'); hash.update(chunk); if (!stream.write(chunk)) await new Promise((resolve, rejectPromise) => { stream.once('drain', resolve); stream.once('error', rejectPromise); }); }
  if (format === 'csv') await write(`${COLUMNS.map(csvCell).join(',')}\n`);
  return { name, identity, async append(row) { await write(rowLine(row, format)); rows += 1; }, async close() { const done = finished(stream); stream.end(); await done; return { path: name, bytes, sha256: hash.digest('hex'), record_count: rows, format }; }, async abort() { stream.destroy(); await finished(stream).catch(() => {}); } };
}

async function* artifactLines(file, signal, meter) {
  const input = createReadStream(file, { signal }); const hash = createHash('sha256'); let bytes = 0;
  const tap = new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; if (bytes > MAX_BYTES) return callback(new Error('Export artifact exceeds its byte limit.')); hash.update(chunk); callback(null, chunk); } });
  const output = new PassThrough(); const piped = pipeline(input, tap, output, { signal }); piped.catch(() => {}); const lines = createInterface({ input: output, crlfDelay: Infinity });
  try { for await (const text of lines) { signal?.throwIfAborted(); if (Buffer.byteLength(text) > MAX_LINE) reject('Export line exceeds its byte limit.'); yield text; } await piped; meter.bytes = bytes; meter.sha256 = hash.digest('hex'); }
  finally { lines.close(); input.destroy(); tap.destroy(); output.destroy(); }
}

export async function verifyOrganizationZipEvidenceExport(manifestPath, expectedManifestSha256, { root = APP_ROOT, reader = createOrganizationZipEvidenceReader(), selection = ORGANIZATION_ZIP_EVIDENCE_SELECTION, signal } = {}) {
  const absolute = path.resolve(root, manifestPath); inside(root, absolute); await safeDirectory(root, path.dirname(absolute));
  const manifestStat = await lstat(absolute); if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink !== 1) reject('Organization ZIP export manifest is unsafe.');
  const manifestBytes = await readFile(absolute); if (manifestBytes.length > 100_000 || sha(manifestBytes) !== expectedManifestSha256) reject('Organization ZIP export manifest checksum mismatch.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const runIdValid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(manifest.run_id ?? '');
  if (manifest.schema_version !== SCHEMA || manifest.release_binding?.release_id !== selection.release_id
    || manifest.release_binding?.manifest_sha256 !== selection.manifest_sha256
    || !/^\d{5}$/.test(manifest.selection?.zip5 ?? '') || !['public-only', 'local-review'].includes(manifest.selection?.policy_mode)
    || !['jsonl', 'csv', 'both'].includes(manifest.selection?.format) || !Array.isArray(manifest.artifacts)
    || !runIdValid || path.basename(path.dirname(absolute)) !== manifest.run_id || !Number.isSafeInteger(manifest.row_count) || manifest.row_count < 0
    || manifest.claims?.physical_sites_asserted !== false || manifest.claims?.current_operations_asserted !== false
    || manifest.claims?.general_business_or_site_totals_changed !== false || manifest.claims?.source_acquisition_performed !== false) reject('Organization ZIP export manifest contract drifted.');
  const names = manifest.selection.format === 'both' ? ['organization-addresses.jsonl', 'organization-addresses.csv'] : [`organization-addresses.${manifest.selection.format}`];
  if (manifest.artifacts.length !== names.length || manifest.artifacts.some((item, index) => item.path !== names[index] || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_BYTES || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') || !Number.isSafeInteger(item.record_count))) reject('Organization ZIP export artifacts are malformed.');
  const directory = path.dirname(absolute); const entries = (await readdir(directory)).sort(); if (entries.join(',') !== [...names, 'manifest.json'].sort().join(',')) reject('Organization ZIP export directory has unexpected files.');
  for (const item of manifest.artifacts) {
    const file = path.join(directory, item.path); const stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) reject('Organization ZIP export artifact is unsafe.');
    const meter = {}; const iterator = artifactLines(file, signal, meter);
    if (item.format === 'csv') { const first = await iterator.next(); if (first.done || first.value !== COLUMNS.map(csvCell).join(',')) reject('Organization ZIP CSV header drifted.'); }
    let count = 0;
    const proof = await reader.scan({ zip5: manifest.selection.zip5, publisherState: manifest.selection.publisher_state, policyMode: manifest.selection.policy_mode, signal, onRow: async row => {
      const actual = await iterator.next(); const expected = rowLine(row, item.format).replace(/\n$/, '');
      if (actual.done || actual.value !== expected) reject('Organization ZIP export row differs from its pinned source projection.'); count += 1;
    } });
    if (proof.total !== manifest.row_count || count !== item.record_count) reject('Organization ZIP export row conservation drifted.');
    if (!(await iterator.next()).done) reject('Organization ZIP export contains orphan rows.');
    if (meter.bytes !== item.bytes || meter.sha256 !== item.sha256) reject('Organization ZIP export artifact checksum mismatch.');
    await iterator.return?.();
  }
  return { status: 'verified', run_id: manifest.run_id, rows: manifest.row_count, manifest_sha256: expectedManifestSha256 };
}

export async function exportOrganizationZipEvidence({ zip5, publisherState = null, policyMode, format = 'jsonl', signal, root = APP_ROOT, outputRoot = path.join(root, 'data/exports/organization-zip-evidence/jobs'), reader = createOrganizationZipEvidenceReader(), runId = randomUUID() } = {}) {
  if (!/^\d{5}$/.test(zip5 ?? '') || publisherState !== null && !['CO', 'CT', 'DE', 'FL', 'IA', 'NY', 'OR', 'PA'].includes(publisherState)
    || !['public-only', 'local-review'].includes(policyMode) || !['jsonl', 'csv', 'both'].includes(format) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId)) reject('Organization ZIP export selection is invalid.');
  const jobs = path.resolve(root, outputRoot); if (path.relative(path.resolve(root), jobs).startsWith('..')) reject('Export root escapes the datahub.'); await createSafeDirectory(root, jobs);
  const staging = path.join(jobs, `.staging-${runId}`); const final = path.join(jobs, runId); await mkdir(staging, { recursive: false }); const owner = await lstat(staging); const formats = format === 'both' ? ['jsonl', 'csv'] : [format]; const writers = [];
  let published = false; let manifestIdentity = null; let publishedManifestPath = null; let publishedManifestSha256 = null;
  async function owned() { const current = await lstat(staging); if (!current.isDirectory() || current.isSymbolicLink() || current.ino !== owner.ino || current.dev !== owner.dev) reject('Export staging ownership changed.'); }
  async function cleanup() { if (published) return; try { for (const writer of writers) await writer.abort(); await owned(); for (const writer of writers) { const file = path.join(staging, writer.name); const info = await lstat(file).catch(() => null); if (info?.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.ino === writer.identity.ino && info.dev === writer.identity.dev) await unlink(file); } if (manifestIdentity) { const file = path.join(staging, 'manifest.json'); const info = await lstat(file).catch(() => null); if (info?.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.ino === manifestIdentity.ino && info.dev === manifestIdentity.dev) await unlink(file); } await rmdir(staging); } catch { /* Preserve anything whose ownership cannot be proven. */ } }
  try {
    for (const extension of formats) { const writer = await createWriter(staging, `organization-addresses.${extension}`, extension, signal); writer.name = `organization-addresses.${extension}`; writers.push(writer); }
    const proof = await reader.scan({ zip5, publisherState, policyMode, signal, onRow: async row => { for (const writer of writers) await writer.append(row); } });
    signal?.throwIfAborted(); const artifacts = await Promise.all(writers.map(writer => writer.close()));
    const manifest = { schema_version: SCHEMA, run_id: runId, created_at: new Date().toISOString(), release_binding: { dataset_id: 'broad-organization-zip-evidence', release_id: proof.release_id, manifest_sha256: proof.manifest_sha256, shard_path: proof.shard_path, shard_sha256: proof.shard_sha256 }, selection: { zip5, publisher_state: publisherState, policy_mode: policyMode, format }, row_count: proof.total, claims: { reported_administrative_addresses_only: true, physical_sites_asserted: false, current_operations_asserted: false, general_business_or_site_totals_changed: false, source_acquisition_performed: false }, artifacts };
    await owned(); signal?.throwIfAborted(); const manifestWritten = await writeManifestLast(staging, manifest, identity => { manifestIdentity = identity; }); await rename(staging, final); published = true;
    const manifestSha256 = manifestWritten.sha256;
    const manifestPath = path.join(final, 'manifest.json'); publishedManifestPath = manifestPath; publishedManifestSha256 = manifestSha256;
    const verified = await verifyOrganizationZipEvidenceExport(manifestPath, manifestSha256, { root, reader, selection: reader.selection, signal });
    return { manifest_path: manifestPath, manifest_sha256: manifestSha256, run_id: runId, row_count: proof.total, status: verified.status, artifact_paths: artifacts.map(item => path.join(final, item.path)) };
  } catch (error) {
    await cleanup();
    if (published && publishedManifestPath) { error.code = 'ORGANIZATION_ZIP_EXPORT_UNCERTAIN'; error.recovery = { manifest_path: publishedManifestPath, manifest_sha256: publishedManifestSha256, run_id: runId, inspection_required: true }; }
    throw error;
  }
}
