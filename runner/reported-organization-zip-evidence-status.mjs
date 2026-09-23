import { createHash } from 'node:crypto';
import { lstat, open, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';

export const RELEASE_ID = 'broad-organization-zip-evidence-20260923-002630301Z-9cdbdcd319f2';
export const MANIFEST_SHA256 = 'ee5896c32daf5b50a8b1ac44717ccd4a3005b91d1ca65dfc869c04490d441a7e';
const SCHEMA_SHA256 = 'dcc5a5e710d8346c738356cb363576179bada33aa5b76b2a610b6fd15ec79281';
const STATES = ['CO', 'CT', 'DE', 'FL', 'IA', 'NY', 'OR', 'PA'];
const fail = () => { throw new Error('Reported organization ZIP evidence status unavailable.'); };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink;
async function regularSingleLink(file) { const absolute = path.resolve(file); const stat = await lstat(absolute); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || await realpath(absolute) !== absolute) fail(); return stat; }
export async function hashRegularFileStable(file, { afterRead } = {}) { const absolute = path.resolve(file); await regularSingleLink(absolute); const handle = await open(absolute, 'r'); try { const before = await handle.stat({ bigint: true }); if (!before.isFile() || before.nlink !== 1n) fail(); const hash = createHash('sha256'); let bytes = 0; const stream = handle.createReadStream({ autoClose: false }); for await (const chunk of stream) { bytes += chunk.length; hash.update(chunk); } await afterRead?.(); const after = await handle.stat({ bigint: true }); const current = await lstat(absolute, { bigint: true }); if (!sameIdentity(before, after) || !sameIdentity(after, current) || current.nlink !== 1n || await realpath(absolute) !== absolute) fail(); return { bytes, sha256: hash.digest('hex'), identity: after }; } finally { await handle.close(); } }
async function filesBelow(directory, prefix = '') { const rows = []; for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) { const rel = path.posix.join(prefix.replaceAll('\\', '/'), entry.name); if (entry.isSymbolicLink()) fail(); if (entry.isDirectory()) rows.push(...await filesBelow(directory, rel)); else if (entry.isFile()) rows.push(rel); else fail(); } return rows.sort(); }
function sum(rows, field) { return rows.reduce((total, row) => total + row[field], 0); }

export async function verifyReportedOrganizationZipEvidenceStatus({ root = APP_ROOT } = {}) {
  const base = await realpath(path.resolve(root));
  const configPath = path.join(base, 'config', 'datasets', 'reported-organization-zip-evidence-status.json'); await regularSingleLink(configPath);
  const schemaPath = path.join(base, 'config', 'schemas', 'reported-organization-zip-evidence-status.schema.json'); await regularSingleLink(schemaPath); const schemaBytes = await readFile(schemaPath);
  if (digest(schemaBytes) !== SCHEMA_SHA256) fail();
  const configBytes = await readFile(configPath); let config; try { config = JSON.parse(configBytes); } catch { fail(); }
  const configKeys = ['current_pointer','dataset_id','manifest_sha256','network_requests','ordinary_response_record_rows','plan57_executed','production_pointer_changes','schema_version','selected_release_id','zip_member_lists_exposed'].sort();
  if (JSON.stringify(Object.keys(config).sort()) !== JSON.stringify(configKeys) || config.schema_version !== 'reported-organization-zip-evidence-status@1.0.0' || config.dataset_id !== 'reported-organization-zip-evidence-status' || config.selected_release_id !== RELEASE_ID || config.manifest_sha256 !== MANIFEST_SHA256 || config.current_pointer !== null || config.ordinary_response_record_rows !== 0 || config.zip_member_lists_exposed !== false || config.network_requests !== 0 || config.production_pointer_changes !== false || config.plan57_executed !== false) fail();
  const releaseDirectory = path.join(base, 'data', 'business-sources', 'broad-organization-zip-evidence', 'releases', RELEASE_ID);
  if (await realpath(releaseDirectory) !== releaseDirectory || (await lstat(releaseDirectory)).isSymbolicLink()) fail();
  const manifestPath = path.join(releaseDirectory, 'manifest.json'); await regularSingleLink(manifestPath);
  const manifestBytes = await readFile(manifestPath); if (digest(manifestBytes) !== MANIFEST_SHA256) fail();
  let manifest; try { manifest = JSON.parse(manifestBytes); } catch { fail(); }
  const artifacts = manifest.artifacts;
  if (manifest.dataset_id !== 'broad-organization-zip-evidence' || manifest.release_id !== RELEASE_ID || manifest.status !== 'published' || !Array.isArray(artifacts) || artifacts.length !== 108) fail();
  const paths = artifacts.map((item) => item.path).sort();
  if (new Set(paths).size !== 108 || paths.some((item) => !/^derived\/organizations\/zip-prefix=(?:\d{2}|missing\/state=(?:CO|CT|DE|FL|IA|NY|OR|PA))\.jsonl\.gz$/.test(item))) fail();
  const actualInventory = await filesBelow(releaseDirectory);
  if (JSON.stringify(actualInventory) !== JSON.stringify(['manifest.json', ...paths].sort())) fail();
  const artifactProofs = [];
  for (const artifact of artifacts) { if (artifact.artifact_type !== 'broad-organization-zip-jsonl-gzip' || !Number.isSafeInteger(artifact.bytes) || !Number.isSafeInteger(artifact.record_count) || !/^[a-f0-9]{64}$/.test(artifact.sha256)) fail(); const filename = path.join(releaseDirectory, ...artifact.path.split('/')); const actual = await hashRegularFileStable(filename); if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) fail(); artifactProofs.push({ filename, identity: actual.identity }); }
  const counts = manifest.conservation?.counts; if (!counts || JSON.stringify(Object.keys(counts)) !== JSON.stringify(STATES)) fail();
  const stateRows = STATES.map((state) => ({ state, ...counts[state] }));
  if (stateRows.some((row) => !Number.isSafeInteger(row.input_records) || row.address_rows !== row.eligible_zip_rows + row.missing_or_ineligible_rows || !row.record_kinds || sum(Object.entries(row.record_kinds).map(([record_kind, count]) => ({ record_kind, count })), 'count') !== row.address_rows)) fail();
  const conservation = manifest.conservation;
  if (conservation.input_record_total !== sum(stateRows, 'input_records') || conservation.address_row_total !== sum(stateRows, 'address_rows') || conservation.eligible_zip_row_total !== sum(stateRows, 'eligible_zip_rows') || conservation.missing_or_ineligible_row_total !== sum(stateRows, 'missing_or_ineligible_rows') || conservation.address_row_total !== sum(artifacts, 'record_count')) fail();
  const claims = manifest.claims;
  if (claims?.source_reported_administrative_address_only !== true || claims.physical_sites_asserted !== false || claims.current_operations_asserted !== false || claims.unique_businesses_asserted !== false || claims.usps_validity_asserted !== false || claims.contributes_to_general_business_or_site_totals !== false || claims.network_requests_performed !== 0) fail();
  if (JSON.stringify(Object.keys(manifest.source_contract ?? {})) !== JSON.stringify(STATES)) fail();
  const sources = stateRows.map((row) => { const contract = manifest.source_contract[row.state]; const policy = contract?.field_export_policy; if (!contract || !policy || typeof contract.redistribution !== 'string') fail(); const values = Object.values(policy); return { ...row, dataset_id: contract.dataset_id, normalized_source_id: contract.normalized_source_id, source_release_id: contract.source_release_id, record_level_access: values.includes('local-review-only') ? 'local-review-only' : 'source-policy-controlled', aggregate_access: values.some((value) => String(value).startsWith('public')) ? 'public-with-provenance-and-semantic-limitations' : 'source-policy-controlled', redistribution: contract.redistribution, field_export_policy: structuredClone(policy) }; });
  if (sources.find((row) => row.state === 'DE')?.record_level_access !== 'local-review-only') fail();
  await regularSingleLink(configPath); await regularSingleLink(schemaPath); await regularSingleLink(manifestPath);
  if (!(await readFile(configPath)).equals(configBytes) || !(await readFile(schemaPath)).equals(schemaBytes) || !(await readFile(manifestPath)).equals(manifestBytes) || JSON.stringify(await filesBelow(releaseDirectory)) !== JSON.stringify(actualInventory)) fail();
  for (const proof of artifactProofs) { const current = await lstat(proof.filename, { bigint: true }); if (!sameIdentity(proof.identity, current) || current.nlink !== 1n || await realpath(proof.filename) !== proof.filename) fail(); }
  return { release_id: RELEASE_ID, manifest_sha256: MANIFEST_SHA256, created_at: manifest.created_at, artifact_count: artifacts.length, artifact_bytes: sum(artifacts, 'bytes'), conservation: structuredClone(conservation), sources, claims: structuredClone(claims) };
}

export async function loadReportedOrganizationZipEvidenceStatusView(options = {}) {
  const verified = await (options.verifier ?? verifyReportedOrganizationZipEvidenceStatus)(options);
  return { schema_version: 'reported-organization-zip-evidence-status-view@1.0.0', available: true, release: { release_id: verified.release_id, manifest_sha256: verified.manifest_sha256, created_at: verified.created_at, artifact_count: verified.artifact_count, artifact_bytes: verified.artifact_bytes }, classification: { evidence_type: 'non-additive reported administrative-address ZIP evidence', not_businesses: true, not_sites: true, not_current_operations: true, not_usps_valid_zips: true, not_zcta_geometry: true, contributes_to_general_business_or_site_totals: false }, totals: { input_records: verified.conservation.input_record_total, address_rows: verified.conservation.address_row_total, eligible_zip_rows: verified.conservation.eligible_zip_row_total, missing_or_ineligible_rows: verified.conservation.missing_or_ineligible_row_total }, sources: verified.sources, governance: { local_review_only_preserved: true, source_export_restrictions_preserved: true, ordinary_response_record_rows: 0, zip_member_lists_exposed: false, current_pointer_present: false, network_requests: 0, production_pointer_changes: false, plan57_executed: false, read_only: true } };
}
