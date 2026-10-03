import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { stableRead } from './zip-denominator-delta-review.mjs';

export const DATASET = 'national-nppes-pharmacy-registry-overlay';
export const VERSION = `${DATASET}@1.0.0`;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const fail = message => { throw new Error(`NPPES pharmacy registry overlay rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const stop = signal => signal?.throwIfAborted();
const within = (root, file) => { const resolved = path.resolve(root, file), relative = path.relative(root, resolved); check(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'path containment'); return resolved; };
const artifactBytes = rows => Buffer.concat(rows.map(json));

async function pinnedRead(root, relative, expectedHash, maxBytes, signal) {
  stop(signal); const file = within(root, relative), proof = await stableRead(file); stop(signal);
  check(proof.bytes <= maxBytes && proof.sha256 === expectedHash, `pinned input drift: ${relative}`);
  return { file, proof, value: JSON.parse(proof.value) };
}

async function gzipRows(root, base, declaration, signal, onRow) {
  check(declaration.bytes <= 50_000_000 && declaration.record_count <= 2_500_000, 'gzip declaration bounds');
  const relative = path.relative(root, path.join(base, declaration.path)), proof = await stableRead(within(root, relative));
  check(proof.bytes === declaration.bytes && proof.sha256 === declaration.sha256, 'gzip artifact binding');
  const raw = zlib.gunzipSync(proof.value, { maxOutputLength: 700_000_000 }); let count = 0, offset = 0;
  while (offset < raw.length) { stop(signal); let newline = raw.indexOf(10, offset); if (newline < 0) newline = raw.length; let line = raw.subarray(offset, newline); offset = newline + 1; if (line.at(-1) === 13) line = line.subarray(0, -1); if (!line.length) continue; check(line.length <= 262_144, 'JSONL line bound'); count += 1; await onRow(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line))); }
  check(count === declaration.record_count, 'gzip row count');
}

async function load(root, configPath, signal) {
  const configFile = within(root, configPath ?? 'config/national-nppes-pharmacy-registry-overlay.json');
  const configProof = await stableRead(configFile), config = JSON.parse(configProof.value);
  check(config.schema_version === `${DATASET}-config@1.0.0`, 'config version');
  const pharmacy = await pinnedRead(root, config.pharmacy.manifest, config.pharmacy.manifest_sha256, 1_000_000, signal);
  const nppes = await pinnedRead(root, config.nppes.manifest, config.nppes.manifest_sha256, 2_000_000, signal);
  const registry = await pinnedRead(root, config.registry.manifest, config.registry.manifest_sha256, 2_000_000, signal);
  const denominator = await pinnedRead(root, config.zip_denominator.manifest, config.zip_denominator.manifest_sha256, 100_000, signal);
  check(pharmacy.value.release_id === config.pharmacy.release_id && nppes.value.release_id === config.nppes.release_id && registry.value.release_id === config.registry.release_id, 'release binding');
  check(pharmacy.value.source_release_id === config.nppes.source_release_id && nppes.value.source_release_id === config.nppes.source_release_id, 'same NPPES source release');
  check(pharmacy.value.dependencies?.nppes_organizations_manifest?.sha256 === config.nppes.manifest_sha256, 'pharmacy-to-NPPES dependency');
  check(registry.value.coverage?.nppes_organization_records === nppes.value.coverage?.active_organization_npis, 'registry NPPES cohort binding');
  const denominatorDecl = denominator.value.artifacts?.find(x => x.path === config.zip_denominator.artifact);
  check(denominatorDecl?.sha256 === config.zip_denominator.artifact_sha256 && denominatorDecl.record_count === config.zip_denominator.rows, 'ZIP denominator declaration');
  return { root, config, configProof, pharmacy, nppes, registry, denominator, denominatorDecl };
}

async function derive(input, signal) {
  const pharmacyBase = path.dirname(input.pharmacy.file), nppesBase = path.dirname(input.nppes.file);
  const pharmacyArtifacts = input.pharmacy.value.artifacts.filter(x => x.artifact_type === 'normalized-nppes-community-retail-pharmacy-jsonl-gzip');
  const organizationArtifacts = input.nppes.value.artifacts.filter(x => x.artifact_type === 'normalized-nppes-organization-jsonl-gzip');
  check(pharmacyArtifacts.length === 10 && organizationArtifacts.length === 11, 'artifact roster');
  const pharmacy = new Map();
  for (const artifact of pharmacyArtifacts) await gzipRows(input.root, pharmacyBase, artifact, signal, row => {
    check(/^\d{10}$/.test(row.npi) && row.organization_id === `organization:cms_npi_${row.npi}` && !pharmacy.has(row.npi), 'pharmacy identity');
    check(row.provenance?.projection_source_release_id === input.nppes.value.release_id, 'projection lineage');
    pharmacy.set(row.npi, row);
  });
  check(pharmacy.size === input.config.expected.pharmacy_rows, 'pharmacy count');
  const matched = new Map();
  for (const artifact of organizationArtifacts) await gzipRows(input.root, nppesBase, artifact, signal, row => {
    const npi = row.external_identifiers?.find(x => x.type === 'npi')?.value;
    if (!pharmacy.has(npi)) return;
    check(!matched.has(npi) && row.entity_candidates?.organization_id === pharmacy.get(npi).organization_id, 'exact base identity');
    matched.set(npi, row);
  });
  check(matched.size === pharmacy.size, 'exact NPI membership conservation');
  const memberships = [...pharmacy.values()].sort((a, b) => a.npi.localeCompare(b.npi)).map(row => ({
    schema_version: 'national-nppes-pharmacy-registry-overlay-membership@1.0.0', npi: row.npi, organization_id: row.organization_id,
    classification: 'already-present-same-source-identity', registry_entity_addition: false, registry_site_addition: false, registry_establishment_addition: false,
    source_release_id: input.nppes.value.source_release_id, pharmacy_taxonomy_code: '3336C0003X', mail_order_taxonomy_assertion_count: row.mail_order_taxonomy_assertions?.length ?? 0,
    claims: { active_npi_enumeration_as_of_source_release: true, current_operation: null, licensed_pharmacy: null, physical_site: false, unique_business: null, parent_company: null }
  }));
  const stateDecl = input.pharmacy.value.artifacts.find(x => x.path === 'derived/state-aggregates.json');
  const stateProof = await stableRead(path.join(pharmacyBase, stateDecl.path)); check(stateProof.sha256 === stateDecl.sha256 && stateProof.bytes === stateDecl.bytes, 'state aggregate binding');
  const jurisdictions = JSON.parse(stateProof.value).rows.map(row => ({ ...row, classification: 'industry-overlay-nonadditive', generic_business_additivity_delta: 0 })).sort((a, b) => a.state.localeCompare(b.state));
  check(jurisdictions.length === input.config.expected.jurisdiction_rows, 'jurisdiction count');
  const zipDecl = input.pharmacy.value.artifacts.find(x => x.path === 'derived/zip5-aggregates.jsonl');
  const zipProof = await stableRead(path.join(pharmacyBase, zipDecl.path)); check(zipProof.sha256 === zipDecl.sha256 && zipProof.bytes === zipDecl.bytes, 'pharmacy ZIP binding');
  const pharmacyZips = new Map(zipProof.value.toString('utf8').split('\n').filter(Boolean).map(line => { const row = JSON.parse(line); return [row.zip_code, row]; }));
  const denominatorFile = path.join(path.dirname(input.denominator.file), input.config.zip_denominator.artifact), denominatorProof = await stableRead(denominatorFile);
  check(denominatorProof.sha256 === input.denominatorDecl.sha256 && denominatorProof.bytes === input.denominatorDecl.bytes, 'ZIP denominator bytes');
  const zips = denominatorProof.value.toString('utf8').split('\n').filter(Boolean).map(line => {
    const base = JSON.parse(line), source = pharmacyZips.get(base.zip5);
    return { schema_version: 'national-nppes-pharmacy-registry-overlay-zip@1.0.0', zip5: base.zip5, denominator_classification: base.classification,
      pharmacy_organization_count: source?.unique_npi_count ?? 0, reported_primary_address_count: source?.reported_address_count ?? 0,
      mail_order_taxonomy_assertion_count: source?.mail_order_taxonomy_assertion_count ?? 0, classification: 'industry-overlay-nonadditive', generic_business_additivity_delta: 0,
      authoritative_current_usps_zip: null, current_operating_business_count: null, completeness_percent: null };
  });
  check(zips.length === input.config.zip_denominator.rows && zips.filter(x => x.pharmacy_organization_count > 0).length === input.config.expected.positive_zip5_rows, 'ZIP conservation');
  const mailRows = memberships.filter(x => x.mail_order_taxonomy_assertion_count > 0), mailAssertions = memberships.reduce((n, x) => n + x.mail_order_taxonomy_assertion_count, 0);
  check(mailRows.length === input.config.expected.mail_order_organizations && mailAssertions === input.config.expected.mail_order_assertions, 'mail-order conservation');
  return { memberships, jurisdictions, zips, mailAssertions };
}

function shape(input, derived, createdAt) {
  const raws = { 'membership.jsonl': artifactBytes(derived.memberships), 'jurisdictions.jsonl': artifactBytes(derived.jurisdictions), 'zip5-overlay.jsonl': artifactBytes(derived.zips) };
  const body = { schema_version: VERSION, dataset_id: DATASET, status: 'immutable-local-review-only', publication_mode: 'pointer-free', created_at: createdAt,
    inputs: { pharmacy_manifest: { path: path.relative(input.root, input.pharmacy.file).replaceAll('\\', '/'), sha256: input.pharmacy.proof.sha256, release_id: input.pharmacy.value.release_id }, nppes_manifest: { path: path.relative(input.root, input.nppes.file).replaceAll('\\', '/'), sha256: input.nppes.proof.sha256, release_id: input.nppes.value.release_id }, registry_manifest: { path: path.relative(input.root, input.registry.file).replaceAll('\\', '/'), sha256: input.registry.proof.sha256, release_id: input.registry.value.release_id }, zip_denominator_manifest: { path: path.relative(input.root, input.denominator.file).replaceAll('\\', '/'), sha256: input.denominator.proof.sha256, artifact_sha256: input.denominatorDecl.sha256 }, config_sha256: input.configProof.sha256 },
    summary: { pharmacy_rows: derived.memberships.length, exact_npi_membership_matches: derived.memberships.length, already_present_same_source_identity: derived.memberships.length, generic_business_additivity_delta: 0, organization_additions: 0, site_additions: 0, establishment_additions: 0, jurisdiction_rows: derived.jurisdictions.length, zip5_denominator_rows: derived.zips.length, positive_zip5_rows: derived.zips.filter(x => x.pharmacy_organization_count > 0).length, mail_order_taxonomy_organizations: derived.memberships.filter(x => x.mail_order_taxonomy_assertion_count > 0).length, mail_order_taxonomy_assertions: derived.mailAssertions },
    claims: { active_npi_enumeration_as_of: input.nppes.value.source_through_date, current_operation: null, licensed_pharmacy: null, physical_site: false, unique_business: null, nationwide_completeness: false, authoritative_current_usps_zip_denominator: null, parent_company: null, nabp_number: null, ncpdp_number: null, drive_through: null, network_affiliation: null, mail_order_taxonomy_only: true, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, production_execution: false },
    artifacts: Object.entries(raws).map(([artifactPath, raw]) => ({ path: artifactPath, bytes: raw.length, sha256: hash(raw), record_count: raw.toString('utf8').split('\n').filter(Boolean).length })) };
  return { manifest: { release_id: `${DATASET}-${hash(JSON.stringify(body))}`, ...body }, raws };
}

async function expected(root, configPath, signal, createdAt) { const input = await load(root, configPath, signal), derived = await derive(input, signal); return { input, derived, shaped: shape(input, derived, createdAt) }; }

export async function buildNationalNppesPharmacyRegistryOverlay(options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)); check(!options._testHooks || root !== APP_ROOT, 'test hooks require isolated root'); check(options.createdAt === undefined || root !== APP_ROOT, 'createdAt override requires isolated root');
  const createdAt = options.createdAt ?? new Date().toISOString(); check(new Date(createdAt).toISOString() === createdAt, 'created_at');
  const result = await expected(root, options.configPath, options.signal, createdAt), base = within(root, `data/${DATASET}`), releases = path.join(base, 'releases'), lock = path.join(base, '.build.lock');
  await fs.mkdir(releases, { recursive: true }); let locked = false, stage, published = false;
  try {
    await fs.mkdir(lock); locked = true; stage = path.join(base, `.stage-${randomUUID()}`); await fs.mkdir(stage);
    for (const [name, raw] of Object.entries(result.shaped.raws)) await fs.writeFile(path.join(stage, name), raw, { flag: 'wx' });
    const manifestRaw = json(result.shaped.manifest); await fs.writeFile(path.join(stage, 'manifest.json'), manifestRaw, { flag: 'wx' }); stop(options.signal);
    const destination = path.join(releases, result.shaped.manifest.release_id); await fs.rename(stage, destination); published = true;
    await verifyNationalNppesPharmacyRegistryOverlay(path.join(destination, 'manifest.json'), { root, configPath: options.configPath, signal: options.signal });
    return { releaseDirectory: destination, manifest: result.shaped.manifest, manifest_sha256: hash(manifestRaw), ...result.shaped.manifest.summary };
  } catch (error) { if (published) error.inspection_required = true; else if (stage) await fs.rm(stage, { recursive: true, force: true }); throw error; }
  finally { if (locked) await fs.rmdir(lock).catch(error => { if (!published) throw error; }); }
}

export async function verifyNationalNppesPharmacyRegistryOverlay(manifestPath, options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)), manifestFile = within(root, manifestPath), proof = await stableRead(manifestFile), manifest = JSON.parse(proof.value);
  check(path.basename(path.dirname(manifestFile)) === manifest.release_id && manifest.publication_mode === 'pointer-free', 'release location/boundary');
  check(JSON.stringify((await fs.readdir(path.dirname(manifestFile))).sort()) === JSON.stringify(['jurisdictions.jsonl', 'manifest.json', 'membership.jsonl', 'zip5-overlay.jsonl']), 'closed inventory');
  const result = await expected(root, options.configPath, options.signal, manifest.created_at); check(JSON.stringify(result.shaped.manifest) === JSON.stringify(manifest), 'manifest reconstruction');
  for (const [name, raw] of Object.entries(result.shaped.raws)) { const actual = await stableRead(path.join(path.dirname(manifestFile), name)); check(actual.sha256 === hash(raw) && Buffer.compare(actual.value, raw) === 0, `artifact replay: ${name}`); }
  return { verified: true, release_id: manifest.release_id, manifest_sha256: proof.sha256, ...manifest.summary, claims: manifest.claims };
}
