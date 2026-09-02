import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, link, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { createGunzip, createGzip } from 'node:zlib';
import { parse } from 'csv-parse';
import { assertNormalizedUsPostalFieldsDeep } from './normalized-us-postal-code.mjs';

export const NPPES_ORGANIZATION_SCHEMA_VERSION = '1.0.0';
export const NPPES_ORGANIZATION_TRANSFORMATION = 'cms-nppes-organizations@1.0.1';

const REQUIRED_SOURCE_KINDS = ['main', 'other-names', 'practice-locations', 'endpoints'];
const OTHER_NAME_TYPES = {
  '3': 'doing-business-as',
  '4': 'former-legal-business-name',
  '5': 'other-name',
};

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function hashFile(filename) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}

function isoDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const candidate = `${match[3]}-${match[1]}-${match[2]}`;
  return Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) ? null : candidate;
}

function postalAddress(fields) {
  const postalDigits = digits(fields.postalCode);
  const country = text(fields.country)?.toUpperCase() ?? 'US';
  const state = text(fields.state)?.toUpperCase() ?? null;
  const line1 = text(fields.address1);
  const city = text(fields.city);
  if (country !== 'US' || !line1 || !city || !/^[A-Z]{2}$/.test(state ?? '') || postalDigits.length < 5) return null;
  const zipCode = postalDigits.slice(0, 5);
  const zip4 = postalDigits.length >= 9 ? postalDigits.slice(5, 9) : null;
  return {
    street: line1,
    unit_or_additional: text(fields.address2),
    city,
    state,
    zip_code: zipCode,
    zip4,
    postal_code: zipCode,
    country: 'US',
  };
}

function provenance(context, sourceRecordId) {
  return {
    source_id: 'cms-nppes-monthly-v2',
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: NPPES_ORGANIZATION_TRANSFORMATION,
    policy_id: 'cms-nppes-organizations',
  };
}

function geographyFor(zipCode, context) {
  const baseline = context.baselineByZip?.get(zipCode);
  return {
    zip_code: zipCode,
    zcta_match_status: baseline?.geography?.status ?? 'no-2020-zcta-polygon',
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

export function normalizeNppesOrganization(fields, context) {
  const npi = digits(fields.npi);
  if (npi.length !== 10) return { kind: 'quarantine', reason: 'invalid-npi', npi: npi || null };
  const deactivationDate = isoDate(fields.deactivationDate);
  const reactivationDate = isoDate(fields.reactivationDate);
  if (deactivationDate && !reactivationDate) {
    return {
      kind: 'deactivated',
      record: {
        schema_version: NPPES_ORGANIZATION_SCHEMA_VERSION,
        npi,
        npi_deactivation_date: deactivationDate,
        source_release_id: context.sourceReleaseId,
        export_policy: 'public-deactivated-npi-and-date-only',
      },
    };
  }
  if (String(fields.entityType ?? '').trim() !== '2') return { kind: 'excluded-individual', npi };
  const legalName = text(fields.legalName);
  if (!legalName) return { kind: 'quarantine', reason: 'active-organization-missing-legal-name', npi };
  const address = postalAddress(fields);
  const sourceRecordId = `${npi}:primary`;
  const subpartCode = String(fields.organizationSubpart ?? '').trim().toUpperCase();
  const locationCandidates = address ? {
    physical_site_id: `site:cms_npi_${npi}_primary`,
    establishment_id: `establishment:cms_npi_${npi}_primary`,
  } : { physical_site_id: null, establishment_id: null };
  return {
    kind: 'active-organization',
    record: {
      schema_version: NPPES_ORGANIZATION_SCHEMA_VERSION,
      normalized_record_id: `cms-nppes:${sourceRecordId}`,
      entity_candidates: {
        organization_id: `organization:cms_npi_${npi}`,
        ...locationCandidates,
        identity_status: 'provisional',
      },
      external_identifiers: [{ type: 'npi', value: npi, source_field: 'NPI' }],
      legal_business_name: legalName,
      other_organization_name: text(fields.otherName),
      other_organization_name_type: OTHER_NAME_TYPES[String(fields.otherNameType ?? '').trim()] ?? null,
      organization_subpart: subpartCode === 'Y' ? true : subpartCode === 'N' ? false : null,
      parent_organization_name: text(fields.parentOrganizationName),
      primary_practice_location: address ? {
        address,
        telephone: text(fields.telephone),
        geography: geographyFor(address.zip_code, context),
      } : null,
      healthcare_taxonomies: (fields.taxonomies ?? []).filter((item) => item.code),
      npi_status: {
        value: reactivationDate ? 'npi-reactivated-as-of-source-release' : 'npi-active-as-of-source-release',
        scope: 'NPI enumeration status only; issuance does not validate licensure or credentials and does not prove a practice location is open',
        deactivation_date: deactivationDate,
        reactivation_date: reactivationDate,
      },
      provider_enumeration_date: isoDate(fields.enumerationDate),
      source_last_update_date: isoDate(fields.lastUpdateDate),
      observed_at: context.observedAt,
      provenance: provenance(context, sourceRecordId),
      field_lineage: {
        legal_business_name: 'Provider Organization Name (Legal Business Name)',
        other_organization_name: 'Provider Other Organization Name',
        address: 'Provider Business Practice Location Address fields',
        taxonomies: 'Healthcare Provider Taxonomy Code_1 through _15',
        parent_organization_name: 'Parent Organization LBN',
        npi_status: 'NPI Deactivation Date|NPI Reactivation Date',
      },
      export_policy: 'public',
    },
  };
}

export function normalizeNppesPracticeLocation(fields, context) {
  const npi = digits(fields.npi);
  if (npi.length !== 10) return { kind: 'rejected', reason: 'invalid-npi' };
  const address = postalAddress(fields);
  if (!address) return { kind: 'rejected', reason: 'missing-valid-us-practice-address', npi };
  const locationKey = sha256(JSON.stringify([npi, address.street, address.unit_or_additional, address.city, address.state, address.postal_code])).slice(0, 20);
  const sourceRecordId = `${npi}:practice:${locationKey}`;
  return {
    kind: 'practice-location',
    record: {
      schema_version: NPPES_ORGANIZATION_SCHEMA_VERSION,
      normalized_record_id: `cms-nppes:${sourceRecordId}`,
      npi,
      entity_candidates: {
        organization_id: `organization:cms_npi_${npi}`,
        physical_site_id: `site:cms_npi_${npi}_${locationKey}`,
        establishment_id: `establishment:cms_npi_${npi}_${locationKey}`,
        identity_status: 'provisional',
      },
      address,
      telephone: text(fields.telephone),
      geography: geographyFor(address.zip_code, context),
      source_status: {
        value: 'reported-non-primary-practice-location-for-active-npi',
        scope: 'Reported association with an active organization NPI; not independent evidence that the location is currently open',
      },
      observed_at: context.observedAt,
      provenance: provenance(context, sourceRecordId),
      field_lineage: {
        address: 'Provider Secondary Practice Location Address fields',
        telephone: 'Provider Secondary Practice Location Address - Telephone Number',
      },
      export_policy: 'public',
    },
  };
}

export function normalizeNppesOtherName(fields, context) {
  const npi = digits(fields.npi);
  const name = text(fields.name);
  const typeCode = String(fields.typeCode ?? '').trim();
  if (npi.length !== 10 || !name || !OTHER_NAME_TYPES[typeCode]) return null;
  const createdDate = isoDate(fields.createdDate);
  const recordKey = sha256(JSON.stringify([npi, name, typeCode, createdDate])).slice(0, 20);
  const sourceRecordId = `${npi}:other-name:${recordKey}`;
  return {
    schema_version: NPPES_ORGANIZATION_SCHEMA_VERSION,
    normalized_record_id: `cms-nppes:${sourceRecordId}`,
    npi,
    organization_id: `organization:cms_npi_${npi}`,
    name,
    name_type: OTHER_NAME_TYPES[typeCode],
    source_created_date: createdDate,
    observed_at: context.observedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: 'public',
  };
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return { path: relativePath.replaceAll('\\', '/'), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

async function openGzipWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: 'wx' });
  const gzip = createGzip();
  gzip.pipe(output);
  return { relativePath, destination, temporary, output, gzip, records: 0 };
}

async function writeGzipRecord(writer, record) {
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await once(writer.gzip, 'drain');
  writer.records += 1;
}

async function closeGzipWriters(writers, artifactType) {
  const completion = writers.map((writer) => finished(writer.output));
  for (const writer of writers) writer.gzip.end();
  await Promise.all(completion);
  const artifacts = [];
  for (const writer of writers) {
    await rename(writer.temporary, writer.destination);
    artifacts.push({
      path: writer.relativePath.replaceAll('\\', '/'),
      ...(await hashFile(writer.destination)),
      record_count: writer.records,
      artifact_type: artifactType,
    });
  }
  return artifacts;
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

function assertContained(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function loadManagedSource(sourceDirectory) {
  const metadataPath = path.join(sourceDirectory, 'source.json');
  const metadataBuffer = await readFile(metadataPath);
  const metadata = JSON.parse(metadataBuffer.toString('utf8'));
  const url = new URL(metadata.sourceUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'download.cms.gov' || !/^NPPES_Data_Dissemination_.*_V2\.zip$/i.test(metadata.archiveName ?? '')) {
    throw new Error('Managed NPPES metadata does not identify an approved CMS monthly V2 release.');
  }
  const byKind = new Map((metadata.files ?? []).map((file) => [file.kind, file]));
  for (const kind of REQUIRED_SOURCE_KINDS) if (!byKind.has(kind)) throw new Error(`Managed NPPES source is missing ${kind}.`);
  const files = [];
  for (const kind of REQUIRED_SOURCE_KINDS) {
    const file = byKind.get(kind);
    const filename = path.basename(String(file.file ?? ''));
    if (!filename || filename !== file.file) throw new Error(`Managed NPPES ${kind} filename is invalid.`);
    const absolutePath = path.resolve(sourceDirectory, filename);
    assertContained(sourceDirectory, absolutePath, `Managed NPPES ${kind}`);
    const actual = await hashFile(absolutePath);
    if (actual.bytes !== Number(file.uncompressedBytes) || actual.sha256 !== file.sha256) throw new Error(`Managed NPPES ${kind} failed checksum validation.`);
    files.push({ ...file, absolutePath, bytes: actual.bytes });
  }
  return { metadata, metadataBuffer, metadataPath, files, byKind: new Map(files.map((file) => [file.kind, file])) };
}

async function loadZbpBaseline(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
  const base = path.dirname(pointerPath);
  const manifestPath = path.resolve(base, pointer.manifest ?? '');
  assertContained(base, manifestPath, 'Census ZBP manifest');
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));
  if (manifest.dataset_id !== 'census-zbp-baseline' || !manifest.complete_national_release) throw new Error('A complete Census ZBP baseline release is required.');
  const artifact = manifest.artifacts.find((candidate) => candidate.path === 'derived/zip-coverage.jsonl');
  if (!artifact) throw new Error('Census ZBP release has no ZIP coverage artifact.');
  const artifactPath = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), artifactPath, 'Census ZBP coverage artifact');
  const buffer = await readFile(artifactPath);
  if (buffer.length !== artifact.bytes || sha256(buffer) !== artifact.sha256) throw new Error('Census ZBP ZIP coverage failed checksum validation.');
  const rows = buffer.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

async function snapshotSourceFiles(stagingDirectory, source) {
  const artifacts = [];
  for (const file of source.files) {
    const relativePath = `source/${file.file}`;
    const destination = path.join(stagingDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await link(file.absolutePath, destination);
    } catch (error) {
      if (error.code !== 'EXDEV' && error.code !== 'EPERM') throw error;
      await copyFile(file.absolutePath, destination);
    }
    artifacts.push({
      path: relativePath,
      bytes: file.bytes,
      sha256: file.sha256,
      artifact_type: `cms-nppes-raw-${file.kind}-csv`,
      export_policy: 'internal-source-snapshot',
    });
  }
  artifacts.push(await writeArtifact(stagingDirectory, 'source/source.json', source.metadataBuffer, {
    artifact_type: 'cms-nppes-source-metadata',
    export_policy: 'internal-source-snapshot',
  }));
  return artifacts;
}

function indexColumns(headers, required, optional = []) {
  const byName = new Map(headers.map((header, index) => [header, index]));
  const result = {};
  for (const [key, name] of [...required, ...optional]) result[key] = byName.has(name) ? byName.get(name) : -1;
  const missing = required.filter(([, name]) => !byName.has(name)).map(([, name]) => name);
  if (missing.length) throw new Error(`NPPES file is missing required columns: ${missing.join(', ')}.`);
  return { result, byName };
}

async function scanCsv(filename, configure, consume) {
  const parser = createReadStream(filename).pipe(parse({ bom: true, skip_empty_lines: true, relax_column_count: true }));
  let indexes;
  let count = 0;
  for await (const row of parser) {
    if (!indexes) {
      indexes = configure(row);
      continue;
    }
    count += 1;
    await consume(row, indexes, count);
  }
  if (!indexes) throw new Error(`NPPES CSV ${path.basename(filename)} is empty.`);
  return count;
}

function mainColumns(headers) {
  const required = [
    ['npi', 'NPI'],
    ['entityType', 'Entity Type Code'],
    ['legalName', 'Provider Organization Name (Legal Business Name)'],
    ['address1', 'Provider First Line Business Practice Location Address'],
    ['city', 'Provider Business Practice Location Address City Name'],
    ['state', 'Provider Business Practice Location Address State Name'],
    ['postalCode', 'Provider Business Practice Location Address Postal Code'],
    ['deactivationDate', 'NPI Deactivation Date'],
    ['reactivationDate', 'NPI Reactivation Date'],
  ];
  const optional = [
    ['otherName', 'Provider Other Organization Name'],
    ['otherNameType', 'Provider Other Organization Name Type Code'],
    ['address2', 'Provider Second Line Business Practice Location Address'],
    ['country', 'Provider Business Practice Location Address Country Code (If outside U.S.)'],
    ['telephone', 'Provider Business Practice Location Address Telephone Number'],
    ['enumerationDate', 'Provider Enumeration Date'],
    ['lastUpdateDate', 'Last Update Date'],
    ['organizationSubpart', 'Is Organization Subpart'],
    ['parentOrganizationName', 'Parent Organization LBN'],
  ];
  const { result, byName } = indexColumns(headers, required, optional);
  result.taxonomies = [];
  for (let slot = 1; slot <= 15; slot += 1) {
    const code = byName.get(`Healthcare Provider Taxonomy Code_${slot}`);
    if (code === undefined) continue;
    result.taxonomies.push({
      code,
      primary: byName.get(`Healthcare Provider Primary Taxonomy Switch_${slot}`) ?? -1,
    });
  }
  if (!result.taxonomies.length) throw new Error('NPPES main file has no healthcare taxonomy columns.');
  return result;
}

function value(row, index) {
  return index >= 0 ? row[index] : '';
}

function mainFields(row, indexes) {
  return {
    ...Object.fromEntries(Object.entries(indexes).filter(([key]) => key !== 'taxonomies').map(([key, index]) => [key, value(row, index)])),
    taxonomies: indexes.taxonomies.map((item) => ({
      code: text(value(row, item.code)),
      primary: String(value(row, item.primary)).trim().toUpperCase() === 'Y',
    })),
  };
}

function sourceThroughDate(source) {
  const filename = source.byKind.get('main').file;
  const match = filename.match(/-(\d{4})(\d{2})(\d{2})\.csv$/i);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function zipCoverageRows(baselineRows, primaryCounts, secondaryCounts, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...baselineByZip.keys(), ...primaryCounts.keys(), ...secondaryCounts.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const primary = primaryCounts.get(zipCode) ?? 0;
    const secondary = secondaryCounts.get(zipCode) ?? 0;
    return {
      schema_version: NPPES_ORGANIZATION_SCHEMA_VERSION,
      zip_code: zipCode,
      nppes_organization_provider_snapshot: {
        status: primary + secondary > 0 ? 'published-organization-provider-location-evidence' : 'no-organization-provider-location-in-source-snapshot',
        primary_practice_location_count: primary,
        non_primary_practice_location_count: secondary,
        source_release_id: context.sourceReleaseId,
        source_through_date: context.sourceThroughDate,
        scope: 'Organization NPI and reported practice-location evidence; not proof of licensure, credentials, or currently open premises',
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: 'unverified', reason: 'ZIP appears in NPPES but is outside the current ZBP/ZCTA union.' },
      geography: baseline?.geography ?? { status: 'no-2020-zcta-polygon', geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? 'outside-zbp-zcta-union',
    };
  });
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z');
}

export async function buildCmsNppesOrganizations({
  outputRoot,
  sourceDirectory,
  zbpPointer,
  minimumOrganizations = 1_000_000,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !sourceDirectory || !zbpPointer) throw new Error('outputRoot, sourceDirectory, and zbpPointer are required.');
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error('minimumOrganizations must be a positive integer.');
  const observedAt = now().toISOString();
  const runId = randomUUID();
  const source = await loadManagedSource(sourceDirectory);
  const baseline = await loadZbpBaseline(zbpPointer);
  const throughDate = sourceThroughDate(source);
  if (!throughDate) throw new Error('Cannot derive the NPPES source-through date from the main filename.');
  const releaseId = `cms-nppes-organizations-${releaseTimestamp(observedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, '.staging', runId);
  await mkdir(stagingDirectory, { recursive: true });
  const artifacts = await snapshotSourceFiles(stagingDirectory, source);

  const organizationWriters = new Map();
  const locationWriters = new Map();
  const nameWriters = new Map();
  const deactivatedWriters = new Map();
  for (const prefix of '0123456789') {
    organizationWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/prefix=${prefix}.jsonl.gz`));
    locationWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/practice-locations/prefix=${prefix}.jsonl.gz`));
    nameWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/other-names/npi-prefix=${prefix}.jsonl.gz`));
    deactivatedWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/deactivated-npis/npi-prefix=${prefix}.jsonl.gz`));
  }
  const noZipOrganizationWriter = await openGzipWriter(stagingDirectory, 'derived/organizations/no-valid-us-zip.jsonl.gz');
  const quarantineWriter = await openGzipWriter(stagingDirectory, 'quarantine/records.jsonl.gz');
  const activeOrganizationNpis = new Set();
  const practiceRecordIds = new Set();
  const otherNameRecordIds = new Set();
  const primaryCounts = new Map();
  const secondaryCounts = new Map();
  const stateCounts = new Map();
  const taxonomyCounts = new Map();
  const context = {
    runId,
    observedAt,
    sourceReleaseId: source.metadata.releaseId,
    baselineByZip: baseline.byZip,
  };
  const counts = {
    source_main_rows: 0,
    active_organization_npis: 0,
    active_individual_npis_excluded: 0,
    deactivated_npis_limited: 0,
    organization_primary_locations_with_us_zip: 0,
    organizations_without_valid_us_primary_zip: 0,
    source_practice_location_rows: 0,
    accepted_non_primary_practice_locations: 0,
    excluded_practice_locations: 0,
    rejected_practice_locations: 0,
    source_other_name_rows: 0,
    accepted_other_names: 0,
    excluded_other_names: 0,
    quarantined_main_rows: 0,
  };

  counts.source_main_rows = await scanCsv(source.byKind.get('main').absolutePath, mainColumns, async (row, indexes, rowNumber) => {
    const normalized = normalizeNppesOrganization(mainFields(row, indexes), context);
    assertNormalizedUsPostalFieldsDeep(normalized.record);
    if (normalized.kind === 'deactivated') {
      await writeGzipRecord(deactivatedWriters.get(normalized.record.npi[0]), normalized.record);
      counts.deactivated_npis_limited += 1;
    } else if (normalized.kind === 'excluded-individual') {
      counts.active_individual_npis_excluded += 1;
    } else if (normalized.kind === 'quarantine') {
      await writeGzipRecord(quarantineWriter, { source_row_number: rowNumber, npi: normalized.npi, reason: normalized.reason });
      counts.quarantined_main_rows += 1;
    } else {
      const record = normalized.record;
      const npi = record.external_identifiers[0].value;
      if (activeOrganizationNpis.has(npi)) throw new Error(`Duplicate active organization NPI ${npi}.`);
      activeOrganizationNpis.add(npi);
      counts.active_organization_npis += 1;
      const zipCode = record.primary_practice_location?.address.zip_code;
      if (zipCode) {
        await writeGzipRecord(organizationWriters.get(zipCode[0]), record);
        increment(primaryCounts, zipCode);
        increment(stateCounts, record.primary_practice_location.address.state);
        counts.organization_primary_locations_with_us_zip += 1;
      } else {
        await writeGzipRecord(noZipOrganizationWriter, record);
        counts.organizations_without_valid_us_primary_zip += 1;
      }
      for (const taxonomy of record.healthcare_taxonomies) increment(taxonomyCounts, taxonomy.code);
    }
    if (rowNumber % 250_000 === 0) logger(`Scanned ${rowNumber.toLocaleString('en-US')} NPPES main records; accepted ${counts.active_organization_npis.toLocaleString('en-US')} organization NPIs.`);
  });
  if (counts.active_organization_npis < minimumOrganizations) throw new Error(`NPPES active organization count ${counts.active_organization_npis} is below the ${minimumOrganizations} quality floor.`);
  if (counts.quarantined_main_rows / counts.active_organization_npis > 0.01) throw new Error('NPPES main-row quarantine rate exceeds 1% of active organizations.');

  const practiceRequired = [
    ['npi', 'NPI'],
    ['address1', 'Provider Secondary Practice Location Address- Address Line 1'],
    ['city', 'Provider Secondary Practice Location Address - City Name'],
    ['state', 'Provider Secondary Practice Location Address - State Name'],
    ['postalCode', 'Provider Secondary Practice Location Address - Postal Code'],
  ];
  const practiceOptional = [
    ['address2', 'Provider Secondary Practice Location Address-  Address Line 2'],
    ['country', 'Provider Secondary Practice Location Address - Country Code (If outside U.S.)'],
    ['telephone', 'Provider Secondary Practice Location Address - Telephone Number'],
  ];
  counts.source_practice_location_rows = await scanCsv(
    source.byKind.get('practice-locations').absolutePath,
    (headers) => indexColumns(headers, practiceRequired, practiceOptional).result,
    async (row, indexes, rowNumber) => {
      const npi = digits(value(row, indexes.npi));
      if (!activeOrganizationNpis.has(npi)) {
        counts.excluded_practice_locations += 1;
      } else {
        const normalized = normalizeNppesPracticeLocation(Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, value(row, index)])), context);
        if (normalized.record) assertNormalizedUsPostalFieldsDeep(normalized.record);
        if (normalized.kind !== 'practice-location') counts.rejected_practice_locations += 1;
        else if (!practiceRecordIds.has(normalized.record.normalized_record_id)) {
          practiceRecordIds.add(normalized.record.normalized_record_id);
          const zipCode = normalized.record.address.zip_code;
          await writeGzipRecord(locationWriters.get(zipCode[0]), normalized.record);
          increment(secondaryCounts, zipCode);
          counts.accepted_non_primary_practice_locations += 1;
        }
      }
      if (rowNumber % 250_000 === 0) logger(`Scanned ${rowNumber.toLocaleString('en-US')} NPPES non-primary practice locations.`);
    },
  );

  const nameRequired = [
    ['npi', 'NPI'],
    ['name', 'Provider Other Organization Name'],
    ['typeCode', 'Provider Other Organization Name Type Code'],
  ];
  const nameOptional = [['createdDate', 'Created Date']];
  counts.source_other_name_rows = await scanCsv(
    source.byKind.get('other-names').absolutePath,
    (headers) => indexColumns(headers, nameRequired, nameOptional).result,
    async (row, indexes, rowNumber) => {
      const fields = Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, value(row, index)]));
      const npi = digits(fields.npi);
      const normalized = activeOrganizationNpis.has(npi) ? normalizeNppesOtherName(fields, context) : null;
      if (!normalized || otherNameRecordIds.has(normalized.normalized_record_id)) counts.excluded_other_names += 1;
      else {
        otherNameRecordIds.add(normalized.normalized_record_id);
        await writeGzipRecord(nameWriters.get(npi[0]), normalized);
        counts.accepted_other_names += 1;
      }
      if (rowNumber % 250_000 === 0) logger(`Scanned ${rowNumber.toLocaleString('en-US')} NPPES organization other names.`);
    },
  );

  artifacts.push(...await closeGzipWriters([...organizationWriters.values(), noZipOrganizationWriter], 'normalized-nppes-organization-jsonl-gzip'));
  artifacts.push(...await closeGzipWriters([...locationWriters.values()], 'normalized-nppes-practice-location-jsonl-gzip'));
  artifacts.push(...await closeGzipWriters([...nameWriters.values()], 'normalized-nppes-other-name-jsonl-gzip'));
  artifacts.push(...await closeGzipWriters([...deactivatedWriters.values()], 'limited-deactivated-npi-jsonl-gzip'));
  artifacts.push(...await closeGzipWriters([quarantineWriter], 'quarantine-jsonl-gzip'));

  const coverageRows = zipCoverageRows(baseline.rows, primaryCounts, secondaryCounts, {
    sourceReleaseId: source.metadata.releaseId,
    sourceThroughDate: throughDate,
  });
  artifacts.push(await writeArtifact(stagingDirectory, 'derived/zip-coverage.jsonl', jsonLines(coverageRows), {
    artifact_type: 'nppes-organization-zip-coverage-jsonl',
    record_count: coverageRows.length,
  }));
  const summary = {
    counts,
    states_and_territories: Object.fromEntries([...stateCounts].sort(([left], [right]) => left.localeCompare(right))),
    top_taxonomies: [...taxonomyCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 100).map(([code, count]) => ({ code, count })),
  };
  artifacts.push(await writeArtifact(stagingDirectory, 'derived/source-summary.json', json(summary), { artifact_type: 'nppes-organization-source-summary' }));

  const manifest = {
    schema_version: NPPES_ORGANIZATION_SCHEMA_VERSION,
    dataset_id: 'cms-nppes-organizations',
    connector: { id: 'cms-nppes-organizations', version: '1.0.1' },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: source.metadata.fetchedAt,
    observed_at: observedAt,
    source_through_date: throughDate,
    source_release_id: source.metadata.releaseId,
    status: 'published',
    complete_cms_monthly_source_snapshot: true,
    public_normalization_scope: 'Active or reactivated Entity Type 2 organization NPIs, their reported primary and non-primary U.S. practice locations, taxonomies, and organization other names',
    coverage: {
      ...counts,
      source_zip_codes: new Set([...primaryCounts.keys(), ...secondaryCounts.keys()]).size,
      zip_union_records: coverageRows.length,
      states_and_territories: stateCounts.size,
      unique_taxonomy_codes: taxonomyCounts.size,
    },
    dependencies: [
      { dataset_id: 'cms-nppes-managed-source', release_id: source.metadata.releaseId, source_metadata_sha256: sha256(source.metadataBuffer) },
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: 'U.S. Centers for Medicare & Medicaid Services',
      source_page: source.metadata.sourcePage,
      source_url: source.metadata.sourceUrl,
      archive_sha256: source.metadata.archiveSha256,
      source_policy: 'config/source-policies/cms-nppes-organizations.json',
      raw_snapshot_export_policy: 'internal-source-snapshot',
    },
    privacy_and_export_controls: [
      'Active individual Entity Type 1 NPI records are excluded from public normalization.',
      'Authorized-official names, titles, and telephone numbers are not normalized or published.',
      'EIN, TIN, mailing-address, endpoint, license-number, and other-provider-identifier fields are not normalized by this connector.',
      'Deactivated records publish only NPI and deactivation date, following CMS redistribution guidance.',
      'Raw source files are retained as internal immutable source artifacts and must not enter public combined exports.',
    ],
    limitations: [
      'An NPI identifies a health care provider; it is not a general business registration.',
      'NPI issuance or active enumeration does not validate licensure or credentials and does not prove that a practice location is currently open.',
      'Addresses and names are provider-reported to NPPES and may be stale or contain errors.',
      'Organization NPIs and organization subparts are provisional canonical identities until cross-source entity resolution is applied.',
      'A parent organization name is source-reported text only; no ownership relationship is inferred without a resolvable identifier.',
      'This source covers health care providers and suppliers, not all U.S. businesses.',
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, 'manifest.json', json(manifest));
  const releaseDirectory = path.join(outputRoot, 'releases', releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, 'current.json');
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json({
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: observedAt,
  }));
  await rename(temporaryPointer, pointerPath);
  return { manifest, releaseDirectory, pointerPath };
}

async function forEachGzipRecord(filename, consume) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    consume(JSON.parse(line));
    count += 1;
  }
  return count;
}

export async function verifyCmsNppesOrganizations(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, 'utf8'));
  const failures = [];
  if (manifest.dataset_id !== 'cms-nppes-organizations' || manifest.status !== 'published' || !manifest.complete_cms_monthly_source_snapshot) {
    failures.push({ path: 'manifest.json', reason: 'unexpected or incomplete dataset manifest' });
  }
  for (const artifact of manifest.artifacts ?? []) {
    try {
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const actual = await hashFile(filename);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: 'size or SHA-256 mismatch' });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === 'ENOENT' ? 'missing' : error.message });
    }
  }

  const activeNpis = new Set();
  let organizations = 0;
  for (const artifact of manifest.artifacts?.filter((item) => item.artifact_type === 'normalized-nppes-organization-jsonl-gzip') ?? []) {
    try {
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const npi = record.external_identifiers?.find((item) => item.type === 'npi')?.value;
        if (!/^\d{10}$/.test(npi ?? '') || activeNpis.has(npi)) throw new Error(`invalid or duplicate organization NPI ${npi}`);
        if (!record.legal_business_name || !record.provenance?.source_record_id || record.export_policy !== 'public') throw new Error(`invalid organization ${npi}`);
        if (!['npi-active-as-of-source-release', 'npi-reactivated-as-of-source-release'].includes(record.npi_status?.value)) throw new Error(`invalid source status ${npi}`);
        activeNpis.add(npi);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: 'actual organization line count mismatch' });
      organizations += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `organization validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.active_organization_npis) failures.push({ path: 'manifest.json', reason: 'organization count mismatch' });

  let practiceLocations = 0;
  const practiceIds = new Set();
  for (const artifact of manifest.artifacts?.filter((item) => item.artifact_type === 'normalized-nppes-practice-location-jsonl-gzip') ?? []) {
    try {
      const partition = artifact.path.match(/prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        if (!activeNpis.has(record.npi) || practiceIds.has(record.normalized_record_id)) throw new Error(`invalid or duplicate practice location ${record.normalized_record_id}`);
        if (record.address?.zip_code?.[0] !== partition || record.source_status?.value !== 'reported-non-primary-practice-location-for-active-npi') throw new Error(`invalid practice location semantics ${record.normalized_record_id}`);
        practiceIds.add(record.normalized_record_id);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: 'actual practice-location line count mismatch' });
      practiceLocations += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `practice-location validation failed: ${error.message}` });
    }
  }
  if (practiceLocations !== manifest.coverage?.accepted_non_primary_practice_locations) failures.push({ path: 'manifest.json', reason: 'practice-location count mismatch' });

  let otherNames = 0;
  const nameIds = new Set();
  for (const artifact of manifest.artifacts?.filter((item) => item.artifact_type === 'normalized-nppes-other-name-jsonl-gzip') ?? []) {
    try {
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        if (!activeNpis.has(record.npi) || nameIds.has(record.normalized_record_id) || !Object.values(OTHER_NAME_TYPES).includes(record.name_type)) throw new Error(`invalid other name ${record.normalized_record_id}`);
        nameIds.add(record.normalized_record_id);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: 'actual other-name line count mismatch' });
      otherNames += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `other-name validation failed: ${error.message}` });
    }
  }
  if (otherNames !== manifest.coverage?.accepted_other_names) failures.push({ path: 'manifest.json', reason: 'other-name count mismatch' });

  let deactivated = 0;
  for (const artifact of manifest.artifacts?.filter((item) => item.artifact_type === 'limited-deactivated-npi-jsonl-gzip') ?? []) {
    try {
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const keys = Object.keys(record).sort();
        const allowed = ['export_policy', 'npi', 'npi_deactivation_date', 'schema_version', 'source_release_id'].sort();
        if (JSON.stringify(keys) !== JSON.stringify(allowed) || !/^\d{10}$/.test(record.npi) || record.export_policy !== 'public-deactivated-npi-and-date-only') throw new Error(`deactivated record exposes unsupported fields for ${record.npi}`);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: 'actual deactivated line count mismatch' });
      deactivated += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `deactivated-record validation failed: ${error.message}` });
    }
  }
  if (deactivated !== manifest.coverage?.deactivated_npis_limited) failures.push({ path: 'manifest.json', reason: 'deactivated count mismatch' });

  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === 'nppes-organization-zip-coverage-jsonl');
  try {
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records) throw new Error('ZIP coverage count mismatch');
    if (new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error('duplicate ZIP coverage row');
    const primary = rows.reduce((sum, row) => sum + row.nppes_organization_provider_snapshot.primary_practice_location_count, 0);
    const secondary = rows.reduce((sum, row) => sum + row.nppes_organization_provider_snapshot.non_primary_practice_location_count, 0);
    if (primary !== manifest.coverage.organization_primary_locations_with_us_zip || secondary !== manifest.coverage.accepted_non_primary_practice_locations) throw new Error('ZIP location counts do not reconcile');
    if (rows.some((row) => row.current_usps_validity?.status !== 'unverified')) throw new Error('unsupported current USPS ZIP validity claim');
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? 'derived/zip-coverage.jsonl', reason: `ZIP coverage validation failed: ${error.message}` });
  }
  if (failures.length) {
    const error = new Error(`CMS NPPES organization release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    source_release_id: manifest.source_release_id,
    artifact_count: manifest.artifacts.length,
    coverage: manifest.coverage,
  };
}
