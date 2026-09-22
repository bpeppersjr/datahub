import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';

export const NPPES_PHARMACY_SCHEMA_VERSION = '1.0.0';
export const NPPES_PHARMACY_TRANSFORMATION = 'cms-nppes-community-retail-pharmacy@1.0.0';
export const COMMUNITY_RETAIL_TAXONOMY = '3336C0003X';
export const MAIL_ORDER_TAXONOMY = '3336M0002X';

const STATE_CODES = Object.freeze([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'AS', 'GU', 'MP', 'PR', 'VI',
]);

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

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes its local release directory.`);
}

function checkCancelled(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Pharmacy projection cancelled before publication.'), { name: 'AbortError', code: 'ABORT_ERR' });
}

function json(value) { return `${JSON.stringify(value)}\n`; }

async function readPointer(pointerPath, datasetId) {
  const pointerBuffer = await readFile(pointerPath);
  const pointer = JSON.parse(pointerBuffer.toString('utf8'));
  if (pointer.dataset_id !== datasetId || !pointer.release_id || !pointer.manifest) throw new Error(`Invalid ${datasetId} current pointer.`);
  const root = path.dirname(pointerPath);
  const manifestPath = path.resolve(root, pointer.manifest);
  assertContained(root, manifestPath, `${datasetId} manifest`);
  const manifestBuffer = await readFile(manifestPath);
  if (pointer.manifest_sha256 && sha256(manifestBuffer) !== pointer.manifest_sha256) throw new Error(`${datasetId} pointer manifest SHA-256 does not match.`);
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));
  if (manifest.dataset_id !== datasetId || manifest.release_id !== pointer.release_id || manifest.status !== 'published') throw new Error(`Invalid ${datasetId} published manifest.`);
  return { pointer, pointerPath: path.resolve(pointerPath), pointerBuffer, manifest, manifestPath, manifestBuffer };
}

async function verifyArtifactSet(releaseDirectory, artifacts, label = 'artifact') {
  for (const artifact of artifacts ?? []) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `${label} ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`${label} ${artifact.path} failed byte or SHA-256 verification.`);
  }
}

async function loadNppesDependency(sourcePointerPath, signal) {
  checkCancelled(signal);
  const source = await readPointer(sourcePointerPath, 'cms-nppes-organizations');
  const sourceReleaseDirectory = path.dirname(source.manifestPath);
  if (source.manifest.complete_cms_monthly_source_snapshot !== true) throw new Error('NPPES dependency is not a complete CMS monthly source snapshot.');
  if (source.manifest.source_release_id === undefined || source.manifest.source_release_id === null) throw new Error('NPPES dependency is missing source release identity.');
  const organizationArtifacts = (source.manifest.artifacts ?? []).filter((item) => item.artifact_type === 'normalized-nppes-organization-jsonl-gzip').sort((left, right) => left.path.localeCompare(right.path));
  if (organizationArtifacts.length !== 11) throw new Error('NPPES dependency must contain ten ZIP-prefix organization artifacts plus the no-ZIP partition.');
  const zipArtifact = source.manifest.artifacts.find((item) => item.artifact_type === 'nppes-organization-zip-coverage-jsonl');
  if (!zipArtifact) throw new Error('NPPES dependency has no governed ZIP coverage artifact.');
  await verifyArtifactSet(sourceReleaseDirectory, [...organizationArtifacts, zipArtifact], 'NPPES dependency artifact');
  return {
    ...source,
    sourceReleaseDirectory,
    organizationArtifacts,
    zipArtifact,
    pointerSha256: sha256(source.pointerBuffer),
    manifestSha256: sha256(source.manifestBuffer),
  };
}

async function readGzipJsonl(filename, consume, signal) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    checkCancelled(signal);
    if (!line) continue;
    await consume(JSON.parse(line), count + 1);
    count += 1;
  }
  return count;
}

function hasTaxonomy(record, code) {
  return (record.healthcare_taxonomies ?? []).some((item) => String(item.code ?? '').trim().toUpperCase() === code);
}

function selectedTaxonomies(record) {
  return (record.healthcare_taxonomies ?? [])
    .filter((item) => [COMMUNITY_RETAIL_TAXONOMY, MAIL_ORDER_TAXONOMY].includes(String(item.code ?? '').trim().toUpperCase()))
    .map((item) => ({ code: String(item.code).trim().toUpperCase(), primary: item.primary === true }));
}

function pharmacyRecord(record, context) {
  const npi = record.external_identifiers?.find((item) => item.type === 'npi')?.value ?? null;
  const address = record.primary_practice_location?.address ?? null;
  const selected = selectedTaxonomies(record);
  const mailOrderAssertions = selected.filter((item) => item.code === MAIL_ORDER_TAXONOMY);
  return {
    schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
    pharmacy_record_id: `cms-nppes-community-retail-pharmacy:${npi}`,
    organization_id: record.entity_candidates?.organization_id ?? null,
    npi,
    legal_business_name: record.legal_business_name ?? null,
    other_organization_name: record.other_organization_name ?? null,
    source_reported_parent_organization_name: record.parent_organization_name ?? null,
    address: address ? {
      street: address.street ?? null,
      unit_or_additional: address.unit_or_additional ?? null,
      city: address.city ?? null,
      state: address.state ?? null,
      zip_code: address.zip_code ?? null,
      zip4: address.zip4 ?? null,
      country: address.country ?? 'US',
    } : null,
    geography: address ? {
      zip_code: address.zip_code ?? null,
      zip4: address.zip4 ?? null,
      zcta_match_status: record.primary_practice_location?.geography?.zcta_match_status ?? 'not-governed',
      zcta_geoid: record.primary_practice_location?.geography?.zcta_geoid ?? null,
      zcta_geo_id: record.primary_practice_location?.geography?.zcta_geo_id ?? null,
    } : null,
    taxonomy_assertions: selected,
    mail_order_taxonomy_assertions: mailOrderAssertions.length ? mailOrderAssertions : null,
    claims: {
      entity_type_2_organization: true,
      npi_status: record.npi_status?.value ?? null,
      unique_business: null,
      current_operation: null,
      physical_site: false,
      governed_geocode: false,
      nationwide_completeness: false,
      nabp_number: null,
      ncpdp_number: null,
      drive_through: null,
      network_affiliation: null,
      parent_company: null,
    },
    temporal: {
      npi_status: record.npi_status?.value ?? null,
      provider_enumeration_date: record.provider_enumeration_date ?? null,
      source_last_update_date: record.source_last_update_date ?? null,
      source_through_date: context.sourceThroughDate ?? null,
      retrieved_at: context.retrievedAt ?? null,
      observed_at: context.observedAt,
    },
    provenance: {
      ...record.provenance,
      projection_source_dataset_id: 'cms-nppes-organizations',
      projection_source_release_id: context.sourceReleaseId,
      projection_transformation_version: NPPES_PHARMACY_TRANSFORMATION,
      projection_policy_id: 'cms-nppes-community-retail-pharmacy',
    },
    observed_at: context.observedAt,
    export_policy: 'public-normalized-source-evidence',
  };
}

async function openWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  const output = createWriteStream(temporary, { flags: 'wx' });
  const gzip = createGzip();
  // One writer is retained for each NPI prefix for the full scan; each can
  // legitimately have many backpressure/error waiters during a large build.
  gzip.setMaxListeners(0);
  gzip.pipe(output);
  return { destination, temporary, relativePath, output, gzip, records: 0 };
}

async function writeRecord(writer, record) {
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await new Promise((resolve, reject) => { writer.gzip.once('drain', resolve); writer.gzip.once('error', reject); });
  writer.records += 1;
}

async function closeWriter(writer, artifactType) {
  const done = finished(writer.output);
  writer.gzip.end();
  await done;
  await rename(writer.temporary, writer.destination);
  return { path: writer.relativePath.replaceAll('\\', '/'), ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, export_policy: 'public-normalized-source-evidence' };
}

function emptyZipRow(zipCode, baseline) {
  return {
    schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
    zip_code: zipCode,
    zip4: null,
    reported_address_count: 0,
    unique_npi_count: 0,
    mail_order_taxonomy_assertion_count: 0,
    zcta_membership: baseline?.geography ? {
      status: baseline.geography.status ?? 'not-governed',
      geoid: baseline.geography.geoid ?? baseline.geography.zcta_geoid ?? null,
      geo_id: baseline.geography.geo_id ?? baseline.geography.zcta_geo_id ?? null,
    } : { status: 'not-governed', geoid: null, geo_id: null },
    source_reported_zip5_only: true,
    zip4_separate_field: true,
    claims: { current_operation: null, physical_site: false, governed_geocode: false, complete_zip5_pharmacy_coverage: false },
  };
}

function emptyStateRow(state) {
  return {
    schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
    state,
    reported_address_count: 0,
    unique_npi_count: 0,
    reported_zip5_count: 0,
    mail_order_taxonomy_assertion_count: 0,
    source_reported_state_aggregate: true,
    claims: { current_operation: null, physical_site: false, governed_geocode: false, complete_state_pharmacy_coverage: false },
  };
}

export async function buildCmsNppesCommunityRetailPharmacies({
  outputRoot = 'data/business-sources/cms-nppes-community-retail-pharmacies',
  sourcePointer = 'data/business-sources/cms-nppes-organizations/current.json',
  logger = () => {},
  now = () => new Date(),
  signal,
} = {}) {
  if (!outputRoot || !sourcePointer) throw new Error('outputRoot and sourcePointer are required.');
  const observedAt = now().toISOString();
  const dependency = await loadNppesDependency(path.resolve(sourcePointer), signal);
  const runId = `${observedAt.replaceAll(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}-${Math.random().toString(16).slice(2, 10)}`;
  const releaseId = `cms-nppes-community-retail-pharmacies-${runId}`;
  const root = path.resolve(outputRoot);
  const stagingDirectory = path.join(root, '.staging', runId);
  const releaseDirectory = path.join(root, 'releases', releaseId);
  await mkdir(stagingDirectory, { recursive: true });
  const writers = new Map();
  for (const prefix of '0123456789') writers.set(prefix, await openWriter(stagingDirectory, `derived/pharmacies/npi-prefix=${prefix}.jsonl.gz`));
  const recordsByZip = new Map();
  const recordsByState = new Map(STATE_CODES.map((state) => [state, emptyStateRow(state)]));
  const zipRows = new Map();
  let accepted = 0;
  let withAddress = 0;
  let mailOrderAssertions = 0;
  let retailTaxonomyOccurrences = 0;
  let retailPrimaryRows = 0;
  let mailOrderOrganizationRows = 0;
  let repeatedRetailTaxonomyExcess = 0;
  let exactZctaRows = 0;
  let nonPolygonRows = 0;
  let unassignedRows = 0;
  const npiSet = new Set();
  try {
    for (const artifact of dependency.organizationArtifacts) {
      checkCancelled(signal);
      const filename = path.join(dependency.sourceReleaseDirectory, artifact.path);
      await readGzipJsonl(filename, async (record) => {
        checkCancelled(signal);
        if (!hasTaxonomy(record, COMMUNITY_RETAIL_TAXONOMY)) return;
        const npi = record.external_identifiers?.find((item) => item.type === 'npi')?.value;
        if (!/^\d{10}$/.test(npi ?? '') || npiSet.has(npi)) throw new Error(`Invalid or duplicate pharmacy NPI ${npi ?? '(missing)'}.`);
        npiSet.add(npi);
        const normalized = pharmacyRecord(record, { sourceReleaseId: dependency.manifest.release_id, sourceThroughDate: dependency.manifest.source_through_date, retrievedAt: dependency.manifest.retrieved_at, observedAt });
        await writeRecord(writers.get(npi[0]), normalized);
        accepted += 1;
        const retailAssertions = normalized.taxonomy_assertions.filter((item) => item.code === COMMUNITY_RETAIL_TAXONOMY);
        retailTaxonomyOccurrences += retailAssertions.length;
        repeatedRetailTaxonomyExcess += Math.max(0, retailAssertions.length - 1);
        if (retailAssertions.some((item) => item.primary)) retailPrimaryRows += 1;
        const address = normalized.address;
        const mailAssertions = normalized.mail_order_taxonomy_assertions ?? [];
        const mail = mailAssertions.length > 0;
        mailOrderAssertions += mailAssertions.length;
        if (mail) mailOrderOrganizationRows += 1;
        if (address?.zip_code) {
          withAddress += 1;
          if (normalized.geography?.zcta_match_status === '2020-zcta-polygon-available') exactZctaRows += 1;
          else if (normalized.geography?.zcta_match_status === 'no-2020-zcta-polygon') nonPolygonRows += 1;
          else unassignedRows += 1;
          const zip = recordsByZip.get(address.zip_code) ?? { ...emptyZipRow(address.zip_code, null), _npis: new Set() };
          zip._npis.add(npi);
          zip.reported_address_count += 1;
          zip.unique_npi_count = zip._npis.size;
          zip.mail_order_taxonomy_assertion_count += mail ? 1 : 0;
          zip.zcta_membership = normalized.geography ? { status: normalized.geography.zcta_match_status, geoid: normalized.geography.zcta_geoid, geo_id: normalized.geography.zcta_geo_id } : zip.zcta_membership;
          recordsByZip.set(address.zip_code, zip);
          const state = recordsByState.get(address.state);
          if (state) {
            state.reported_address_count += 1;
            state.unique_npi_count += 1;
            state.reported_zip5_count = new Set([...(state._zips ?? []), address.zip_code]).size;
            state._zips = [...new Set([...(state._zips ?? []), address.zip_code])];
            state.mail_order_taxonomy_assertion_count += mail ? 1 : 0;
          }
        } else unassignedRows += 1;
      }, signal);
      logger(`Scanned ${artifact.path}; accepted ${accepted.toLocaleString('en-US')} community/retail pharmacy organizations.`);
    }
    const zipArtifactPath = path.join(dependency.sourceReleaseDirectory, dependency.zipArtifact.path);
    const zipLines = await readFile(zipArtifactPath, 'utf8');
    for (const line of zipLines.split(/\r?\n/).filter(Boolean)) {
      checkCancelled(signal);
      const baseline = JSON.parse(line);
      if (!/^\d{5}$/.test(baseline.zip_code)) continue;
      const row = recordsByZip.get(baseline.zip_code) ?? emptyZipRow(baseline.zip_code, baseline);
      if (row._npis) delete row._npis;
      if (!row.zcta_membership || row.zcta_membership.status === 'not-governed') row.zcta_membership = { status: baseline.geography?.status ?? 'not-governed', geoid: baseline.geography?.geoid ?? baseline.geography?.zcta_geoid ?? null, geo_id: baseline.geography?.geo_id ?? baseline.geography?.zcta_geo_id ?? null };
      zipRows.set(baseline.zip_code, row);
    }
    for (const [zip, row] of recordsByZip) {
      if (row._npis) delete row._npis;
      if (!zipRows.has(zip)) zipRows.set(zip, row);
    }
    const zipAggregateContent = [...zipRows.values()].sort((a, b) => a.zip_code.localeCompare(b.zip_code)).map((row) => JSON.stringify(row)).join('\n') + '\n';
    const stateAggregateContent = JSON.stringify({
      schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
      rows: [...recordsByState.values()].sort((a, b) => a.state.localeCompare(b.state)).map((row) => { const copy = { ...row }; delete copy._zips; return copy; }),
    }) + '\n';
    const artifacts = [];
    for (const writer of writers.values()) artifacts.push(await closeWriter(writer, 'normalized-nppes-community-retail-pharmacy-jsonl-gzip'));
    const zipDestination = path.join(stagingDirectory, 'derived/zip5-aggregates.jsonl');
    await mkdir(path.dirname(zipDestination), { recursive: true });
    await writeFile(zipDestination, zipAggregateContent, 'utf8');
    artifacts.push({ path: 'derived/zip5-aggregates.jsonl', ...(await hashFile(zipDestination)), record_count: zipRows.size, artifact_type: 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl', export_policy: 'public-aggregate-source-evidence' });
    const stateDestination = path.join(stagingDirectory, 'derived/state-aggregates.json');
    await writeFile(stateDestination, stateAggregateContent, 'utf8');
    artifacts.push({ path: 'derived/state-aggregates.json', ...(await hashFile(stateDestination)), record_count: recordsByState.size, artifact_type: 'nppes-community-retail-pharmacy-state-aggregate-json', export_policy: 'public-aggregate-source-evidence' });
    const summary = {
      schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
      community_retail_taxonomy: COMMUNITY_RETAIL_TAXONOMY,
      mail_order_taxonomy: MAIL_ORDER_TAXONOMY,
      accepted_organization_rows: accepted,
      retail_taxonomy_occurrences: retailTaxonomyOccurrences,
      repeated_retail_taxonomy_excess: repeatedRetailTaxonomyExcess,
      retail_primary_taxonomy_rows: retailPrimaryRows,
      rows_with_reported_primary_address: withAddress,
      rows_without_reported_primary_address: accepted - withAddress,
      exact_zcta_membership_rows: exactZctaRows,
      nonpolygon_zip_rows: nonPolygonRows,
      unmatched_geography_rows: unassignedRows,
      mail_order_taxonomy_assertion_rows: mailOrderAssertions,
      mail_order_taxonomy_assertion_organization_rows: mailOrderOrganizationRows,
    };
    const summaryDestination = path.join(stagingDirectory, 'derived/source-summary.json');
    await writeFile(summaryDestination, json(summary), 'utf8');
    artifacts.push({ path: 'derived/source-summary.json', ...(await hashFile(summaryDestination)), artifact_type: 'nppes-community-retail-pharmacy-source-summary', export_policy: 'public-aggregate-source-evidence' });
    const sourcePointerRelative = path.relative(process.cwd(), dependency.pointerPath).replaceAll('\\', '/');
    const sourceManifestRelative = path.relative(process.cwd(), dependency.manifestPath).replaceAll('\\', '/');
    const manifest = {
      schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
      dataset_id: 'cms-nppes-community-retail-pharmacies',
      connector: { id: 'cms-nppes-community-retail-pharmacy', version: '1.0.0' },
      release_id: releaseId,
      run_id: runId,
      status: 'published',
      observed_at: observedAt,
      source_release_id: dependency.manifest.source_release_id,
      source_through_date: dependency.manifest.source_through_date ?? null,
      selection: { entity_type_code: '2', required_taxonomy_code: COMMUNITY_RETAIL_TAXONOMY, mail_order_taxonomy_code: MAIL_ORDER_TAXONOMY, source_dataset_id: 'cms-nppes-organizations' },
      coverage: { accepted_organization_rows: accepted, retail_taxonomy_occurrences: retailTaxonomyOccurrences, repeated_retail_taxonomy_excess: repeatedRetailTaxonomyExcess, retail_primary_taxonomy_rows: retailPrimaryRows, rows_with_reported_primary_address: withAddress, rows_without_reported_primary_address: accepted - withAddress, exact_zcta_membership_rows: exactZctaRows, nonpolygon_zip_rows: nonPolygonRows, unmatched_geography_rows: unassignedRows, mail_order_taxonomy_assertion_rows: mailOrderAssertions, mail_order_taxonomy_assertion_organization_rows: mailOrderOrganizationRows, reported_zip5_aggregate_rows: zipRows.size, state_aggregate_rows: recordsByState.size },
      dependencies: {
        nppes_organizations_pointer: { path: sourcePointerRelative, sha256: dependency.pointerSha256, dataset_id: dependency.pointer.dataset_id, release_id: dependency.pointer.release_id },
        nppes_organizations_manifest: { path: sourceManifestRelative, sha256: dependency.manifestSha256, release_id: dependency.manifest.release_id },
        nppes_organizations_artifacts: [...dependency.organizationArtifacts, dependency.zipArtifact].map((item) => ({ path: item.path, bytes: item.bytes, sha256: item.sha256, artifact_type: item.artifact_type })),
      },
      source: { publisher: 'U.S. Centers for Medicare & Medicaid Services', source_policy: 'config/source-policies/cms-nppes-organizations.json', attribution: 'Source: CMS National Plan and Provider Enumeration System (NPPES) Data Dissemination V2.' },
      policy: { id: 'cms-nppes-community-retail-pharmacy', version: '1.0.0', export_policy: 'public-normalized-source-evidence', raw_source_retained: false, network_requests_performed: 0 },
      claims: { unique_business: null, current_operation: null, physical_site: false, nationwide_completeness: false, governed_geocode: false, nabp_number: null, ncpdp_number: null, drive_through: null, network_affiliation: null, parent_company: null, mail_order_only_from_source_taxonomy: true },
      limitations: ['NPPES taxonomy and address fields are provider-reported source evidence, not proof of licensure, current operation, or an open physical site.', 'This projection is not a complete pharmacy directory and does not assert nationwide completeness.', 'ZIP5 and ZIP4 remain separate; ZIP5 aggregation uses reported primary practice addresses only.', 'ZCTA membership is copied only from the already-governed NPPES organization dependency; no pharmacy geocode or new polygon assignment is produced.', 'Mail-order is asserted only when source taxonomy 3336M0002X is present; it is never inferred from name or address.'],
      artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
    };
    const manifestDestination = path.join(stagingDirectory, 'manifest.json');
    const manifestBuffer = Buffer.from(json(manifest), 'utf8');
    await writeFile(manifestDestination, manifestBuffer);
    await mkdir(path.dirname(releaseDirectory), { recursive: true });
    await rename(stagingDirectory, releaseDirectory);
    const pointerPath = path.join(root, 'current.json');
    const pointerTemporary = `${pointerPath}.tmp-${runId}`;
    await writeFile(pointerTemporary, json({ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest: `releases/${releaseId}/manifest.json`, manifest_sha256: sha256(manifestBuffer), updated_at: observedAt }), 'utf8');
    await rename(pointerTemporary, pointerPath);
    return { manifest, releaseDirectory, pointerPath };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function verifyCmsNppesCommunityRetailPharmacies(pointerPath = 'data/business-sources/cms-nppes-community-retail-pharmacies/current.json') {
  const projection = await readPointer(path.resolve(pointerPath), 'cms-nppes-community-retail-pharmacies');
  const failures = [];
  const manifest = projection.manifest;
  const dependency = manifest.dependencies?.nppes_organizations_pointer;
  const dependencyManifest = manifest.dependencies?.nppes_organizations_manifest;
  if (!dependency || !dependencyManifest) failures.push({ path: 'manifest.json', reason: 'missing exact NPPES pointer and manifest dependency hashes' });
  else {
    try {
      const source = await readPointer(path.resolve(dependency.path), 'cms-nppes-organizations');
      if (sha256(source.pointerBuffer) !== dependency.sha256 || sha256(source.manifestBuffer) !== dependencyManifest.sha256 || source.pointer.release_id !== dependency.release_id || source.manifest.release_id !== dependencyManifest.release_id) failures.push({ path: 'dependencies', reason: 'NPPES pointer or manifest hash/release mismatch' });
      await verifyArtifactSet(path.dirname(source.manifestPath), manifest.dependencies.nppes_organizations_artifacts, 'NPPES dependency artifact');
    } catch (error) { failures.push({ path: 'dependencies', reason: error.message }); }
  }
  try { await verifyArtifactSet(path.dirname(projection.manifestPath), manifest.artifacts, 'Projection artifact'); }
  catch (error) { failures.push({ path: 'artifacts', reason: error.message }); }
  const rows = [];
  const pharmacyArtifacts = (manifest.artifacts ?? []).filter((item) => item.artifact_type === 'normalized-nppes-community-retail-pharmacy-jsonl-gzip');
  const npiSet = new Set();
  let retailOccurrences = 0;
  let repeatedRetailExcess = 0;
  let retailPrimaryRows = 0;
  let addressRows = 0;
  let exactZctaRows = 0;
  let nonpolygonRows = 0;
  let unmatchedRows = 0;
  let mailOccurrences = 0;
  let mailOrganizationRows = 0;
  for (const artifact of pharmacyArtifacts) {
    try {
      await readGzipJsonl(path.join(path.dirname(projection.manifestPath), artifact.path), async (record) => {
        const npi = record.npi;
        const retail = (record.taxonomy_assertions ?? []).filter((item) => item.code === COMMUNITY_RETAIL_TAXONOMY);
        const mail = (record.mail_order_taxonomy_assertions ?? []).filter((item) => item.code === MAIL_ORDER_TAXONOMY);
        const prohibited = ['authorized_official', 'authorized_official_name', 'ein', 'tin', 'mailing_address', 'endpoint', 'license_number', 'other_provider_identifier'];
        if (!/^\d{10}$/.test(npi ?? '') || npiSet.has(npi) || record.export_policy !== 'public-normalized-source-evidence' || record.claims?.governed_geocode !== false || record.claims?.nabp_number !== null || record.claims?.ncpdp_number !== null || record.claims?.drive_through !== null || record.claims?.network_affiliation !== null || record.claims?.parent_company !== null || record.claims?.physical_site !== false || !retail.length || prohibited.some((key) => Object.hasOwn(record, key))) throw new Error(`invalid pharmacy record ${npi ?? '(missing)'}`);
        npiSet.add(npi); rows.push(record);
        retailOccurrences += retail.length;
        repeatedRetailExcess += Math.max(0, retail.length - 1);
        if (retail.some((item) => item.primary === true)) retailPrimaryRows += 1;
        mailOccurrences += mail.length;
        if (mail.length) mailOrganizationRows += 1;
        if (record.address?.zip_code) {
          addressRows += 1;
          if (record.geography?.zcta_match_status === '2020-zcta-polygon-available') exactZctaRows += 1;
          else if (record.geography?.zcta_match_status === 'no-2020-zcta-polygon') nonpolygonRows += 1;
          else unmatchedRows += 1;
        } else unmatchedRows += 1;
      });
    } catch (error) { failures.push({ path: artifact.path, reason: error.message }); }
  }
  if (rows.length !== manifest.coverage?.accepted_organization_rows) failures.push({ path: 'manifest.json', reason: 'pharmacy row count mismatch' });
  const expected = manifest.coverage ?? {};
  for (const [key, actual] of Object.entries({ retail_taxonomy_occurrences: retailOccurrences, repeated_retail_taxonomy_excess: repeatedRetailExcess, retail_primary_taxonomy_rows: retailPrimaryRows, rows_with_reported_primary_address: addressRows, exact_zcta_membership_rows: exactZctaRows, nonpolygon_zip_rows: nonpolygonRows, unmatched_geography_rows: unmatchedRows, mail_order_taxonomy_assertion_rows: mailOccurrences, mail_order_taxonomy_assertion_organization_rows: mailOrganizationRows })) {
    if (actual !== expected[key]) failures.push({ path: 'manifest.json', reason: `${key} conservation mismatch` });
  }
  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl');
  if (!zipArtifact) failures.push({ path: 'derived/zip5-aggregates.jsonl', reason: 'missing ZIP5 aggregate artifact' });
  if (failures.length) { const error = new Error(`CMS NPPES pharmacy release verification failed for ${failures.length} check(s).`); error.failures = failures; throw error; }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, coverage: manifest.coverage, artifact_count: manifest.artifacts.length };
}
