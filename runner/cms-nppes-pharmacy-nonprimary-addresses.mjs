import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { APP_ROOT } from './paths.mjs';
import { verifyCmsNppesCommunityRetailPharmacies } from './cms-nppes-community-retail-pharmacy.mjs';

export const NPPES_PHARMACY_SECONDARY_SCHEMA = 'cms-nppes-pharmacy-nonprimary-addresses@1.0.0';
export const NPPES_PHARMACY_SECONDARY_TRANSFORMATION = 'cms-nppes-pharmacy-nonprimary-addresses@1.0.0';
export const PHARMACY_POINTER = 'data/business-sources/cms-nppes-community-retail-pharmacies/current.json';
export const ORGANIZATIONS_POINTER = 'data/business-sources/cms-nppes-organizations/current.json';
export const SECONDARY_DATASET_ID = 'cms-nppes-pharmacy-nonprimary-addresses';
const ARTIFACT_TYPE = 'cms-nppes-pharmacy-nonprimary-addresses-jsonl-gzip';
const SHA = /^[a-f0-9]{64}$/;
const NPI = /^\d{10}$/;
const ZIP5 = /^\d{5}$/;
const ZIP4 = /^\d{4}$/;
const MAX_PHARMACY_NPIS = 250_000;
const MAX_SECONDARY_ROWS = 500_000;
const MAX_ZIPS = 50_000;
const MAX_SOURCE_PRACTICE_ROWS = 1_000_000;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value)}\n`;

function checkCancelled(signal) {
  if (signal?.aborted) throw Object.assign(new Error('NPPES pharmacy non-primary address projection cancelled.'), { name: 'AbortError', code: 'ABORT_ERR' });
}

function contained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes its retained release.`);
}

async function assertNoSymlinkPath(candidate, label) {
  const root = path.resolve(APP_ROOT); const absolute = path.resolve(candidate); contained(root, absolute, label);
  if (await realpath(root) !== root) throw new Error('Application root resolves through a symbolic link.');
  const relative = path.relative(root, absolute); let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { const stat = await lstat(current); if (stat.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link or junction.`); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
  }
}

async function hashFile(filename, signal) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(filename)) { checkCancelled(signal); bytes += chunk.length; hash.update(chunk); }
  return { bytes, sha256: hash.digest('hex') };
}

async function readPointer(pointerPath, datasetId, readFileImpl = readFile) {
  await assertNoSymlinkPath(pointerPath, `${datasetId} pointer`);
  const pointerBuffer = await readFileImpl(pointerPath); const pointer = JSON.parse(pointerBuffer.toString('utf8'));
  if (pointer.dataset_id !== datasetId || !pointer.release_id || !pointer.manifest || (pointer.manifest_sha256 && !SHA.test(pointer.manifest_sha256))) throw new Error(`Invalid ${datasetId} retained pointer.`);
  const root = path.dirname(pointerPath); const manifestPath = path.resolve(root, pointer.manifest); contained(root, manifestPath, `${datasetId} manifest`);
  await assertNoSymlinkPath(manifestPath, `${datasetId} manifest`);
  const manifestBuffer = await readFileImpl(manifestPath);
  if (pointer.manifest_sha256 && sha256(manifestBuffer) !== pointer.manifest_sha256) throw new Error(`${datasetId} pointer manifest hash mismatch.`);
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));
  if (manifest.dataset_id !== datasetId || manifest.release_id !== pointer.release_id || manifest.status !== 'published') throw new Error(`Invalid ${datasetId} published manifest.`);
  return { pointerPath: path.resolve(pointerPath), pointerBuffer, pointer, manifestPath, manifestBuffer, manifest, releaseDirectory: path.dirname(manifestPath) };
}

function artifactFor(manifest, type, label) {
  const artifacts = (manifest.artifacts ?? []).filter((item) => item.artifact_type === type);
  if (!artifacts.length || artifacts.some((item) => !SHA.test(item.sha256 ?? '') || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || typeof item.path !== 'string')) throw new Error(`${label} artifacts are missing or malformed.`);
  const paths = new Set(artifacts.map((item) => item.path));
  if (paths.size !== artifacts.length) throw new Error(`${label} artifact paths are duplicated.`);
  return artifacts;
}

async function verifyArtifacts(directory, artifacts, label, signal) {
  for (const item of artifacts) {
    checkCancelled(signal); const filename = path.resolve(directory, item.path); contained(directory, filename, `${label} ${item.path}`); await assertNoSymlinkPath(filename, `${label} ${item.path}`);
    const actual = await hashFile(filename, signal);
    if (actual.bytes !== item.bytes || actual.sha256 !== item.sha256) throw new Error(`${label} ${item.path} failed byte or SHA-256 verification.`);
  }
}

async function* gzipJsonl(filename, signal) {
  const input = createReadStream(filename); const gunzip = createGunzip(); input.pipe(gunzip);
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  try {
    for await (const line of lines) { checkCancelled(signal); if (line) yield JSON.parse(line); }
  } finally { lines.close(); input.destroy(); gunzip.destroy(); }
}

async function* plainJsonl(filename, signal) {
  const lines = createInterface({ input: createReadStream(filename), crlfDelay: Infinity });
  for await (const line of lines) { checkCancelled(signal); if (line) yield JSON.parse(line); }
}

function validatePharmacyRecord(record, organizationsManifest) {
  const npi = record?.npi;
  if (record?.schema_version !== '1.0.0' || !NPI.test(npi ?? '') || record.pharmacy_record_id !== `cms-nppes-community-retail-pharmacy:${npi}`
    || record.export_policy !== 'public-normalized-source-evidence' || record.provenance?.projection_source_dataset_id !== 'cms-nppes-organizations'
    || record.provenance?.projection_source_release_id !== organizationsManifest.release_id || record.provenance?.source_release_id !== organizationsManifest.source_release_id || record.provenance?.source_record_id !== `${npi}:primary`
    || !Array.isArray(record.taxonomy_assertions) || !record.taxonomy_assertions.some((item) => item.code === '3336C0003X')) throw new Error('Retained pharmacy record schema or NPI linkage is invalid.');
  return npi;
}

function validatePracticeRecord(record, sourceReleaseId, observedAt) {
  const recordFields = ['schema_version', 'normalized_record_id', 'npi', 'entity_candidates', 'address', 'telephone', 'geography', 'source_status', 'observed_at', 'provenance', 'field_lineage', 'export_policy'];
  const addressFields = ['street', 'unit_or_additional', 'city', 'state', 'zip_code', 'zip4', 'postal_code', 'country'];
  const geographyFields = ['zip_code', 'zcta_match_status', 'zcta_geo_id', 'zcta_geoid', 'zcta_geometry_file'];
  const provenanceFields = ['source_id', 'source_release_id', 'source_record_id', 'ingest_run_id', 'transformation_version', 'policy_id'];
  if (!record || Object.keys(record).sort().join('|') !== recordFields.sort().join('|')
    || Object.keys(record.address ?? {}).sort().join('|') !== addressFields.sort().join('|')
    || Object.keys(record.geography ?? {}).sort().join('|') !== geographyFields.sort().join('|')
    || Object.keys(record.provenance ?? {}).sort().join('|') !== provenanceFields.sort().join('|')) throw new Error('Retained NPPES practice-location schema drifted.');
  if (record?.schema_version !== '1.0.0' || !NPI.test(record.npi ?? '') || record.normalized_record_id !== `cms-nppes:${record.provenance?.source_record_id}`
    || record.provenance?.source_id !== 'cms-nppes-monthly-v2' || record.provenance?.source_release_id !== sourceReleaseId
    || record.provenance?.source_record_id !== `${record.npi}:practice:${record.provenance?.source_record_id?.split(':practice:')[1]}`
    || !/^[a-f0-9]{20}$/.test(record.provenance?.source_record_id?.split(':practice:')[1] ?? '')
    || record.provenance?.policy_id !== 'cms-nppes-organizations' || record.provenance?.transformation_version !== 'cms-nppes-organizations@1.0.1'
    || record.observed_at !== observedAt || record.source_status?.value !== 'reported-non-primary-practice-location-for-active-npi'
    || record.field_lineage?.address !== 'Provider Secondary Practice Location Address fields' || record.export_policy !== 'public') throw new Error('Retained NPPES practice-location schema or provenance drifted.');
  const address = record.address;
  if (!address || address.country !== 'US' || !/^[A-Z]{2}$/.test(address.state ?? '') || !ZIP5.test(address.zip_code ?? '')
    || (address.zip4 !== null && !ZIP4.test(address.zip4 ?? '')) || address.postal_code !== address.zip_code
    || typeof address.street !== 'string' || typeof address.city !== 'string'
    || record.geography.zip_code !== address.zip_code || !['2020-zcta-polygon-available', 'no-2020-zcta-polygon'].includes(record.geography.zcta_match_status)
    || record.geography.zcta_match_status === '2020-zcta-polygon-available' && (!ZIP5.test(record.geography.zcta_geoid ?? '') || record.geography.zcta_geo_id !== `zcta:${record.geography.zcta_geoid}`)
    || record.geography.zcta_match_status === 'no-2020-zcta-polygon' && (record.geography.zcta_geo_id !== null || record.geography.zcta_geoid !== null || record.geography.zcta_geometry_file !== null)) throw new Error(`Retained NPPES practice address is invalid for ${record.npi}.`);
  return record.npi;
}

function secondaryAddress(pharmacy, practice, sourceThroughDate) {
  const npi = practice.npi; const sourceRecordId = practice.provenance.source_record_id;
  return {
    schema_version: '1.0.0',
    secondary_address_id: `cms-nppes-pharmacy-secondary:${npi}:${sourceRecordId.slice(sourceRecordId.lastIndexOf(':') + 1)}`,
    npi,
    organization_id: pharmacy.organization_id,
    legal_business_name: pharmacy.legal_business_name,
    pharmacy_record_id: pharmacy.pharmacy_record_id,
    address_role: 'non-primary-practice-location',
    address: { ...practice.address },
    source_status: { ...practice.source_status },
    claims: {
      reported_address_associated_with_pharmacy_classified_organization: true,
      confirmed_pharmacy_location: false,
      current_operation: false,
      physical_site: false,
      contributes_to_business_or_site_totals: false,
    },
    temporal: { source_release_id: sourceThroughDate.source_release_id, source_through_date: sourceThroughDate.source_through_date, observed_at: sourceThroughDate.observed_at },
    provenance: {
      source_id: practice.provenance.source_id,
      source_release_id: practice.provenance.source_release_id,
      source_record_id: practice.provenance.source_record_id,
      ingest_run_id: practice.provenance.ingest_run_id,
      transformation_version: NPPES_PHARMACY_SECONDARY_TRANSFORMATION,
      projection_source_dataset_id: 'cms-nppes-community-retail-pharmacies',
      projection_source_release_id: sourceThroughDate.pharmacy_release_id,
      projection_source_record_id: pharmacy.pharmacy_record_id,
      projection_policy_id: 'cms-nppes-pharmacy-nonprimary-addresses',
    },
    semantics: 'Reported secondary NPPES practice address associated by exact NPI with an organization classified by pharmacy taxonomy; not a confirmed pharmacy location or evidence of current operations.',
    export_policy: 'public-normalized-source-evidence',
  };
}

async function openWriter(directory, zipDigit) {
  const relativePath = `derived/addresses/zip-prefix=${zipDigit}.jsonl.gz`; const destination = path.join(directory, relativePath); await assertNoSymlinkPath(destination, `Secondary projection artifact ${relativePath}`); await mkdir(path.dirname(destination), { recursive: true }); await assertNoSymlinkPath(destination, `Secondary projection artifact ${relativePath}`);
  const temporary = `${destination}.tmp-${randomUUID()}`; const output = createWriteStream(temporary, { flags: 'wx' }); const gzip = createGzip(); gzip.pipe(output);
  return { relativePath, destination, temporary, output, gzip, records: 0 };
}

async function writeRecord(writer, record, signal) {
  if (!writer.gzip.write(json(record))) await once(writer.gzip, 'drain', { signal }); writer.records += 1;
}

async function closeWriters(writers) {
  const completions = writers.map((writer) => finished(writer.output)); for (const writer of writers) writer.gzip.end(); await Promise.all(completions);
  const artifacts = [];
  for (const writer of writers) { await assertNoSymlinkPath(writer.destination, `Secondary projection artifact ${writer.relativePath}`); await rename(writer.temporary, writer.destination); await assertNoSymlinkPath(writer.destination, `Secondary projection artifact ${writer.relativePath}`); artifacts.push({ path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: ARTIFACT_TYPE }); }
  return artifacts;
}

async function exists(filename) {
  try { await lstat(filename); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function readPointerSnapshot(pointerPath) {
  await assertNoSymlinkPath(pointerPath, 'secondary projection current pointer');
  if (!await exists(pointerPath)) return null;
  return (await readPointer(pointerPath, SECONDARY_DATASET_ID)).pointerBuffer;
}

async function publishPointerCas(pointerPath, expectedBuffer, pointer) {
  await assertNoSymlinkPath(pointerPath, 'secondary projection current pointer');
  const lockPath = `${pointerPath}.lock`; const token = randomUUID(); let lockHandle; let temporaryPath; let temporaryOwned = false;
  try {
    lockHandle = await open(lockPath, 'wx'); await lockHandle.writeFile(`${token}\n`); await lockHandle.sync();
    const current = await readPointerSnapshot(pointerPath);
    if (expectedBuffer === null ? current !== null : current === null || !current.equals(expectedBuffer)) throw new Error('Secondary projection pointer changed during the build; compare-and-swap publication was refused.');
    temporaryPath = `${pointerPath}.tmp-${token}`; await assertNoSymlinkPath(temporaryPath, 'secondary projection pointer staging file');
    await writeFile(temporaryPath, json(pointer), { flag: 'wx' }); temporaryOwned = true;
    const currentBeforeRename = await readPointerSnapshot(pointerPath);
    if (expectedBuffer === null ? currentBeforeRename !== null : currentBeforeRename === null || !currentBeforeRename.equals(expectedBuffer)) throw new Error('Secondary projection pointer changed before publication; compare-and-swap was refused.');
    await rename(temporaryPath, pointerPath); temporaryOwned = false;
  } finally {
    if (temporaryOwned && temporaryPath) await unlink(temporaryPath).catch(() => {});
    if (lockHandle) { await lockHandle.close(); try { if ((await readFile(lockPath, 'utf8')) === `${token}\n`) await unlink(lockPath); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  }
}

async function loadInputs({ pharmacyPointerPath, organizationsPointerPath, signal, readFileImpl = readFile, verifyPharmacyProjection = verifyCmsNppesCommunityRetailPharmacies }) {
  checkCancelled(signal);
  const pharmacy = await readPointer(pharmacyPointerPath, 'cms-nppes-community-retail-pharmacies', readFileImpl);
  await verifyPharmacyProjection(pharmacyPointerPath);
  const pharmacyArtifacts = artifactFor(pharmacy.manifest, 'normalized-nppes-community-retail-pharmacy-jsonl-gzip', 'Pharmacy');
  const pharmacyZipArtifacts = artifactFor(pharmacy.manifest, 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl', 'Pharmacy ZIP aggregate');
  const dependency = pharmacy.manifest.dependencies?.nppes_organizations_manifest;
  const dependencyPointer = pharmacy.manifest.dependencies?.nppes_organizations_pointer;
  if (!dependency || !dependencyPointer || path.resolve(APP_ROOT, dependencyPointer.path) !== path.resolve(organizationsPointerPath)) throw new Error('Pharmacy release does not pin the requested retained NPPES organizations pointer.');
  const organizations = await readPointer(organizationsPointerPath, 'cms-nppes-organizations', readFileImpl);
  if (sha256(organizations.pointerBuffer) !== dependencyPointer.sha256 || organizations.pointer.release_id !== dependencyPointer.release_id
    || sha256(organizations.manifestBuffer) !== dependency.sha256 || organizations.manifest.release_id !== dependency.release_id) throw new Error('Pharmacy release and exact retained NPPES organization dependency do not match.');
  const practiceArtifacts = artifactFor(organizations.manifest, 'normalized-nppes-practice-location-jsonl-gzip', 'NPPES practice-location');
  if (practiceArtifacts.length !== 10 || pharmacyArtifacts.length !== 10) throw new Error('Source artifact partition schema drifted.');
  if (pharmacyZipArtifacts.length !== 1) throw new Error('Retained pharmacy ZIP aggregate schema drifted.');
  await verifyArtifacts(pharmacy.releaseDirectory, [...pharmacyArtifacts, ...pharmacyZipArtifacts], 'Retained pharmacy artifact', signal);
  await verifyArtifacts(organizations.releaseDirectory, practiceArtifacts, 'Retained NPPES practice-location artifact', signal);
  return { pharmacy, organizations, pharmacyArtifacts, pharmacyZipArtifacts, practiceArtifacts };
}

async function collectPharmacyNpis(inputs, signal) {
  const byNpi = new Map();
  for (const artifact of inputs.pharmacyArtifacts) {
    for await (const record of gzipJsonl(path.join(inputs.pharmacy.releaseDirectory, artifact.path), signal)) {
      checkCancelled(signal); const npi = validatePharmacyRecord(record, inputs.organizations.manifest);
      if (byNpi.has(npi)) throw new Error(`Duplicate retained pharmacy NPI ${npi}.`);
      if (byNpi.size >= MAX_PHARMACY_NPIS) throw new Error('Retained pharmacy NPI set exceeded the bounded join limit.');
      byNpi.set(npi, record);
    }
  }
  return byNpi;
}

async function assertInputsStable(inputs, signal, readFileImpl = readFile) {
  checkCancelled(signal);
  const stable = await Promise.all([readFileImpl(inputs.pharmacy.pointerPath), readFileImpl(inputs.pharmacy.manifestPath), readFileImpl(inputs.organizations.pointerPath), readFileImpl(inputs.organizations.manifestPath)]);
  if (!stable[0].equals(inputs.pharmacy.pointerBuffer) || !stable[1].equals(inputs.pharmacy.manifestBuffer) || !stable[2].equals(inputs.organizations.pointerBuffer) || !stable[3].equals(inputs.organizations.manifestBuffer)) throw new Error('A retained pharmacy or NPPES release changed during projection; publication was withheld.');
  await verifyArtifacts(inputs.pharmacy.releaseDirectory, [...inputs.pharmacyArtifacts, ...inputs.pharmacyZipArtifacts], 'Retained pharmacy artifact', signal);
  await verifyArtifacts(inputs.organizations.releaseDirectory, inputs.practiceArtifacts, 'Retained NPPES practice-location artifact', signal);
  checkCancelled(signal);
  const finalPointers = await Promise.all([readFileImpl(inputs.pharmacy.pointerPath), readFileImpl(inputs.pharmacy.manifestPath), readFileImpl(inputs.organizations.pointerPath), readFileImpl(inputs.organizations.manifestPath)]);
  if (!finalPointers[0].equals(inputs.pharmacy.pointerBuffer) || !finalPointers[1].equals(inputs.pharmacy.manifestBuffer) || !finalPointers[2].equals(inputs.organizations.pointerBuffer) || !finalPointers[3].equals(inputs.organizations.manifestBuffer)) throw new Error('A retained pharmacy or NPPES release changed during verification; publication was withheld.');
}

async function deriveRows(inputs, consume, signal) {
  const pharmacies = await collectPharmacyNpis(inputs, signal); const seenSourceIds = new Set(); const counts = { rows: 0, distinct_npis: new Set(), distinct_zip5: new Set(), view_only_zip5: new Set() }; let sourceRows = 0;
  const primaryZips = new Set();
  for (const artifact of inputs.pharmacyZipArtifacts) {
    for await (const row of plainJsonl(path.join(inputs.pharmacy.releaseDirectory, artifact.path), signal)) { if (Number(row.reported_address_count) > 0) primaryZips.add(row.zip_code); if (primaryZips.size > MAX_ZIPS) throw new Error('Retained pharmacy ZIP set exceeded the bounded join limit.'); }
  }
  const context = { source_release_id: inputs.organizations.manifest.source_release_id, source_through_date: inputs.organizations.manifest.source_through_date, observed_at: inputs.organizations.manifest.observed_at, pharmacy_release_id: inputs.pharmacy.manifest.release_id };
  for (const artifact of inputs.practiceArtifacts) {
    for await (const practice of gzipJsonl(path.join(inputs.organizations.releaseDirectory, artifact.path), signal)) {
      checkCancelled(signal); sourceRows += 1; if (sourceRows > MAX_SOURCE_PRACTICE_ROWS) throw new Error('Retained NPPES practice-location scan exceeded the bounded input limit.'); const npi = validatePracticeRecord(practice, context.source_release_id, context.observed_at);
      if (seenSourceIds.has(practice.provenance.source_record_id)) throw new Error(`Duplicate NPPES source practice location ${practice.provenance.source_record_id}.`);
      if (seenSourceIds.size >= MAX_SOURCE_PRACTICE_ROWS) throw new Error('Retained NPPES source-identity set exceeded the bounded join limit.'); seenSourceIds.add(practice.provenance.source_record_id);
      const pharmacy = pharmacies.get(npi); if (!pharmacy) continue;
      const row = secondaryAddress(pharmacy, practice, context); counts.rows += 1; counts.distinct_npis.add(npi); counts.distinct_zip5.add(row.address.zip_code);
      if (!primaryZips.has(row.address.zip_code)) counts.view_only_zip5.add(row.address.zip_code);
      if (counts.rows > MAX_SECONDARY_ROWS || counts.distinct_zip5.size > MAX_ZIPS) throw new Error('Secondary address projection exceeded a bounded output limit.');
      await consume(row);
    }
  }
  return { pharmacies, counts, context };
}

function serializeCounts(counts) {
  return { rows: counts.rows, distinct_npis: counts.distinct_npis.size, distinct_zip5: counts.distinct_zip5.size, view_only_zip5: counts.view_only_zip5.size };
}

export async function inspectCmsNppesPharmacyNonprimaryAddresses({ pharmacyPointer = PHARMACY_POINTER, organizationsPointer = ORGANIZATIONS_POINTER, signal, readFileImpl = readFile } = {}) {
  const inputs = await loadInputs({ pharmacyPointerPath: path.resolve(APP_ROOT, pharmacyPointer), organizationsPointerPath: path.resolve(APP_ROOT, organizationsPointer), signal, readFileImpl });
  const derived = await deriveRows(inputs, async () => {}, signal);
  await assertInputsStable(inputs, signal, readFileImpl);
  return { coverage: serializeCounts(derived.counts), dependency_release_ids: { pharmacy: inputs.pharmacy.manifest.release_id, organizations: inputs.organizations.manifest.release_id }, network_requests_performed: 0 };
}

export async function buildCmsNppesPharmacyNonprimaryAddresses({
  pharmacyPointer = PHARMACY_POINTER,
  organizationsPointer = ORGANIZATIONS_POINTER,
  outputRoot = 'data/business-sources/cms-nppes-pharmacy-nonprimary-addresses',
  signal,
  onProgress = () => {},
  now = new Date(),
  readFileImpl = readFile,
  verifyPharmacyProjection = verifyCmsNppesCommunityRetailPharmacies,
} = {}) {
  const pharmacyPointerPath = path.resolve(APP_ROOT, pharmacyPointer); const organizationsPointerPath = path.resolve(APP_ROOT, organizationsPointer); const root = path.resolve(APP_ROOT, outputRoot); contained(APP_ROOT, root, 'secondary pharmacy projection output'); await assertNoSymlinkPath(root, 'secondary pharmacy projection output');
  const inputs = await loadInputs({ pharmacyPointerPath, organizationsPointerPath, signal, readFileImpl, verifyPharmacyProjection }); checkCancelled(signal);
  const releaseId = `${SECONDARY_DATASET_ID}-${now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}-${randomUUID().slice(0, 8)}`;
  await mkdir(root, { recursive: true }); await assertNoSymlinkPath(root, 'secondary pharmacy projection output');
  const releasesDirectory = path.join(root, 'releases'); await assertNoSymlinkPath(releasesDirectory, 'secondary pharmacy projection releases'); await mkdir(releasesDirectory, { recursive: true }); await assertNoSymlinkPath(releasesDirectory, 'secondary pharmacy projection releases');
  const pointerPath = path.join(root, 'current.json'); const previousPointerBuffer = await readPointerSnapshot(pointerPath); const staging = path.join(root, `.staging-${releaseId}`); const releaseDirectory = path.join(releasesDirectory, releaseId);
  onProgress(1, 'Verified retained releases; deriving reported non-primary addresses.');
  await assertNoSymlinkPath(staging, 'secondary projection staging directory'); await assertNoSymlinkPath(releaseDirectory, 'secondary projection release directory');
  if (await exists(staging)) throw new Error('Secondary projection staging identity already exists.');
  if (await exists(releaseDirectory)) throw new Error('Secondary projection release identity already exists.');
  await mkdir(staging, { recursive: false });
  let writers = []; let writersClosed = false; let stagingOwned = true;
  try {
    writers = await Promise.all(Array.from({ length: 10 }, (_, digit) => openWriter(staging, String(digit))));
    const projected = await deriveRows(inputs, async (row) => { checkCancelled(signal); await writeRecord(writers[Number(row.address.zip_code[0])], row, signal); }, signal);
    const artifacts = await closeWriters(writers); writersClosed = true; checkCancelled(signal);
    await assertInputsStable(inputs, signal, readFileImpl);
    await verifyArtifacts(staging, artifacts, 'Staged projection artifact', signal);
    const counts = serializeCounts(projected.counts); const manifest = {
      schema_version: '1.0.0', dataset_id: SECONDARY_DATASET_ID, release_id: releaseId, status: 'published',
      connector: { id: SECONDARY_DATASET_ID, version: '1.0.0', transformation: NPPES_PHARMACY_SECONDARY_TRANSFORMATION },
      created_at: now.toISOString(), source_release_id: inputs.organizations.manifest.source_release_id,
      source_through_date: inputs.organizations.manifest.source_through_date, observed_at: inputs.organizations.manifest.observed_at,
      projection_semantics: 'Reported secondary NPPES practice addresses associated by exact NPI with organizations in the retained CMS community/retail pharmacy taxonomy projection.',
      claims: { confirmed_pharmacy_locations: false, current_operations: false, physical_sites: false, business_or_site_total_contribution: false, network_requests_performed: 0 },
      coverage: counts,
      dependencies: {
        pharmacy_pointer: { path: path.relative(APP_ROOT, pharmacyPointerPath).replaceAll('\\', '/'), sha256: sha256(inputs.pharmacy.pointerBuffer), dataset_id: inputs.pharmacy.manifest.dataset_id, release_id: inputs.pharmacy.manifest.release_id },
        pharmacy_manifest: { path: path.relative(APP_ROOT, inputs.pharmacy.manifestPath).replaceAll('\\', '/'), sha256: sha256(inputs.pharmacy.manifestBuffer), release_id: inputs.pharmacy.manifest.release_id },
        organizations_pointer: { path: path.relative(APP_ROOT, organizationsPointerPath).replaceAll('\\', '/'), sha256: sha256(inputs.organizations.pointerBuffer), dataset_id: inputs.organizations.manifest.dataset_id, release_id: inputs.organizations.manifest.release_id },
        organizations_manifest: { path: path.relative(APP_ROOT, inputs.organizations.manifestPath).replaceAll('\\', '/'), sha256: sha256(inputs.organizations.manifestBuffer), release_id: inputs.organizations.manifest.release_id },
        pharmacy_artifacts: inputs.pharmacyArtifacts.map(({ path: artifactPath, bytes, sha256: digest }) => ({ path: artifactPath, bytes, sha256: digest })),
        practice_location_artifacts: inputs.practiceArtifacts.map(({ path: artifactPath, bytes, sha256: digest }) => ({ path: artifactPath, bytes, sha256: digest })),
      },
      artifacts,
      limitations: ['These are provider-reported non-primary NPPES practice addresses linked by exact NPI to a pharmacy-classified organization.', 'An address is not confirmed to be a pharmacy location, an operating location, or a current operation.', 'ZIP5 and ZIP4 are preserved as separate source fields; secondary addresses do not contribute to business, site, or national totals.', 'No source was fetched and no network request was performed.'],
    };
    const manifestBuffer = Buffer.from(json(manifest)); const manifestPath = path.join(staging, 'manifest.json'); await assertNoSymlinkPath(manifestPath, 'secondary projection manifest'); await writeFile(manifestPath, manifestBuffer, { flag: 'wx' });
    checkCancelled(signal); await assertNoSymlinkPath(staging, 'secondary projection staging directory'); await assertNoSymlinkPath(releaseDirectory, 'secondary projection release directory');
    if (await exists(releaseDirectory)) throw new Error('Secondary projection release identity appeared before publication.');
    await rename(staging, releaseDirectory); stagingOwned = false;
    const pointer = { dataset_id: SECONDARY_DATASET_ID, release_id: releaseId, manifest: path.relative(root, path.join(releaseDirectory, 'manifest.json')).replaceAll('\\', '/'), manifest_sha256: sha256(manifestBuffer), updated_at: now.toISOString() };
    await publishPointerCas(pointerPath, previousPointerBuffer, pointer);
    onProgress(100, `Published ${counts.rows} retained secondary practice addresses.`);
    return { manifest, releaseDirectory, pointerPath };
  } catch (error) {
    if (!writersClosed) {
      for (const writer of writers) { writer.gzip.destroy(); writer.output.destroy(); }
      await Promise.allSettled(writers.map((writer) => finished(writer.output)));
    }
    if (stagingOwned) await rm(staging, { recursive: true, force: true }).catch(() => {}); throw error;
  }
}

function fail(failures) { const error = new Error('CMS NPPES pharmacy non-primary address projection verification failed.'); error.failures = failures; throw error; }

export async function verifyCmsNppesPharmacyNonprimaryAddresses(pointerPath = 'data/business-sources/cms-nppes-pharmacy-nonprimary-addresses/current.json', { signal, readFileImpl = readFile, verifyPharmacyProjection = verifyCmsNppesCommunityRetailPharmacies } = {}) {
  const absolutePointer = path.resolve(APP_ROOT, pointerPath); contained(APP_ROOT, absolutePointer, 'secondary pharmacy projection pointer');
  const projection = await readPointer(absolutePointer, SECONDARY_DATASET_ID, readFileImpl); const manifest = projection.manifest; const failures = [];
  if (manifest.schema_version !== '1.0.0' || manifest.connector?.id !== SECONDARY_DATASET_ID || manifest.connector?.version !== '1.0.0' || manifest.status !== 'published' || manifest.claims?.network_requests_performed !== 0 || manifest.claims?.business_or_site_total_contribution !== false || manifest.claims?.confirmed_pharmacy_locations !== false || manifest.claims?.current_operations !== false) failures.push({ path: 'manifest.json', reason: 'Projection contract or non-additive claim boundary mismatch.' });
  const outputArtifacts = artifactFor(manifest, ARTIFACT_TYPE, 'Secondary projection'); if (outputArtifacts.length !== 10) failures.push({ path: 'manifest.json', reason: 'Expected exactly ten ZIP5-prefix output shards.' });
  try { await verifyArtifacts(projection.releaseDirectory, outputArtifacts, 'Projection artifact', signal); } catch (error) { failures.push({ path: 'artifacts', reason: error.message }); }
  let inputs;
  try {
    inputs = await loadInputs({ pharmacyPointerPath: path.resolve(APP_ROOT, manifest.dependencies?.pharmacy_pointer?.path ?? ''), organizationsPointerPath: path.resolve(APP_ROOT, manifest.dependencies?.organizations_pointer?.path ?? ''), signal, readFileImpl, verifyPharmacyProjection });
    for (const [key, expected] of [['pharmacy_pointer', inputs.pharmacy.pointerBuffer], ['pharmacy_manifest', inputs.pharmacy.manifestBuffer], ['organizations_pointer', inputs.organizations.pointerBuffer], ['organizations_manifest', inputs.organizations.manifestBuffer]]) {
      if (manifest.dependencies?.[key]?.sha256 !== sha256(expected)) failures.push({ path: `dependencies.${key}`, reason: 'Pinned source dependency changed.' });
    }
    if (manifest.dependencies?.pharmacy_pointer?.release_id !== inputs.pharmacy.manifest.release_id || manifest.dependencies?.organizations_pointer?.release_id !== inputs.organizations.manifest.release_id) failures.push({ path: 'dependencies', reason: 'Pinned source release identity changed.' });
  } catch (error) { failures.push({ path: 'dependencies', reason: error.message }); }
  if (!inputs || failures.length) fail(failures);

  const actualById = new Map();
  try {
    for (const artifact of outputArtifacts) for await (const row of gzipJsonl(path.join(projection.releaseDirectory, artifact.path), signal)) {
      checkCancelled(signal);
      if (row?.schema_version !== '1.0.0' || row.address_role !== 'non-primary-practice-location' || row.claims?.confirmed_pharmacy_location !== false || row.claims?.current_operation !== false || row.claims?.physical_site !== false || row.claims?.contributes_to_business_or_site_totals !== false || row.export_policy !== 'public-normalized-source-evidence' || row.semantics !== 'Reported secondary NPPES practice address associated by exact NPI with an organization classified by pharmacy taxonomy; not a confirmed pharmacy location or evidence of current operations.' || row.address?.zip_code?.[0] !== artifact.path.match(/zip-prefix=(\d)/)?.[1]) throw new Error('Projected record schema, shard, or claim boundary is invalid.');
      if (actualById.has(row.secondary_address_id)) throw new Error(`Duplicate projected secondary address ${row.secondary_address_id}.`);
      actualById.set(row.secondary_address_id, row);
    }
  } catch (error) { failures.push({ path: 'projection-records', reason: error.message }); }
  const expectedIds = new Set();
  let expectedCounts;
  try {
    const derived = await deriveRows(inputs, async (expected) => {
      const id = expected.secondary_address_id; expectedIds.add(id); const actual = actualById.get(id);
      if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) failures.push({ path: id, reason: 'Projected record does not exactly match the pinned source records.' });
    }, signal);
    expectedCounts = serializeCounts(derived.counts);
  } catch (error) { failures.push({ path: 'source-join', reason: error.message }); }
  if (expectedCounts && (JSON.stringify(manifest.coverage) !== JSON.stringify(expectedCounts) || actualById.size !== expectedIds.size)) failures.push({ path: 'coverage', reason: 'Coverage totals or projected row count do not reconcile to source join.' });
  for (const id of actualById.keys()) if (!expectedIds.has(id)) failures.push({ path: id, reason: 'Projection contains an orphan or extra source join.' });
  if (failures.length) fail(failures);
  return { status: 'verified', dataset_id: manifest.dataset_id, release_id: manifest.release_id, coverage: expectedCounts, dependency_release_ids: { pharmacy: inputs.pharmacy.manifest.release_id, organizations: inputs.organizations.manifest.release_id } };
}

const verifiedProjectionCache = new Map();

async function loadVerifiedProjection(pointerPath, signal, verifyProjection = verifyCmsNppesPharmacyNonprimaryAddresses) {
  const absolute = path.resolve(APP_ROOT, pointerPath); const pointerBytes = await readFile(absolute); const cached = verifiedProjectionCache.get(absolute);
  if (cached?.pointerBuffer.equals(pointerBytes)) {
    const currentManifest = await readFile(cached.projection.manifestPath);
    if (currentManifest.equals(cached.projection.manifestBuffer)) {
      await verifyArtifacts(cached.projection.releaseDirectory, artifactFor(cached.projection.manifest, ARTIFACT_TYPE, 'Secondary projection'), 'Projection artifact', signal);
      return cached.projection;
    }
    verifiedProjectionCache.delete(absolute);
  }
  const projection = await readPointer(absolute, SECONDARY_DATASET_ID); await verifyProjection(pointerPath, { signal });
  const stableBytes = await readFile(absolute);
  if (!stableBytes.equals(pointerBytes)) throw new Error('Secondary pharmacy projection changed while it was being verified.');
  const value = { ...projection, pointerBuffer: pointerBytes };
  verifiedProjectionCache.set(absolute, { pointerBuffer: pointerBytes, projection: value });
  return value;
}

export async function loadCmsNppesPharmacyNonprimaryRows({ pointerPath = 'data/business-sources/cms-nppes-pharmacy-nonprimary-addresses/current.json', state, zip, query, limit = 25, signal, verifyProjection } = {}) {
  if (!/^[A-Z]{2}$/.test(state ?? '') || !ZIP5.test(zip ?? '') || !Number.isInteger(limit) || limit < 1 || String(query ?? '').length > 100) { const error = new Error('A valid state, ZIP5, query, and positive limit are required.'); error.statusCode = 400; throw error; }
  const absolute = path.resolve(APP_ROOT, pointerPath); const projection = await loadVerifiedProjection(pointerPath, signal, verifyProjection);
  const artifacts = artifactFor(projection.manifest, ARTIFACT_TYPE, 'Secondary projection'); const matches = []; const safeQuery = String(query ?? '').trim().toLocaleLowerCase('en-US'); let total = 0;
  for (const artifact of artifacts.filter((item) => item.path.endsWith(`zip-prefix=${zip[0]}.jsonl.gz`))) {
    const actual = await hashFile(path.join(projection.releaseDirectory, artifact.path), signal);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`Secondary projection artifact ${artifact.path} failed byte or SHA-256 verification.`);
    for await (const row of gzipJsonl(path.join(projection.releaseDirectory, artifact.path), signal)) {
      if (row.address.state !== state || row.address.zip_code !== zip || safeQuery && !`${row.legal_business_name ?? ''} ${row.npi} ${row.address.street} ${row.address.city}`.toLocaleLowerCase('en-US').includes(safeQuery)) continue;
      total += 1; if (matches.length < Math.min(limit, 100)) matches.push(row);
    }
  }
  const stablePointer = await readFile(absolute); if (!stablePointer.equals(projection.pointerBuffer)) { verifiedProjectionCache.delete(absolute); throw new Error('Secondary pharmacy projection changed while addresses were being read.'); }
  return { schema_version: 'cms-nppes-pharmacy-nonprimary-address-view@1.0.0', status: 'available', semantics: projection.manifest.projection_semantics, source: { release_id: projection.manifest.release_id, pharmacy_release_id: projection.manifest.dependencies.pharmacy_pointer.release_id, organizations_release_id: projection.manifest.dependencies.organizations_pointer.release_id }, coverage: projection.manifest.coverage, selection: { state, zip5: zip, query: query ?? null, limit: Math.min(limit, 100) }, rows: matches, total, truncated: total > matches.length, limitations: projection.manifest.limitations };
}
