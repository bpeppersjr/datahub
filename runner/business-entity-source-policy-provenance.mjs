import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, mkdir, writeFile, rename, realpath, rm } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { readNationalBusinessTemporalClaimRows } from './national-business-temporal-claim-matrix-reader.mjs';

export const BUSINESS_ENTITY_SOURCE_POLICY_PROVENANCE_VERSION = 'business-entity-source-policy-provenance@1.0.0';
const DATASET = 'business-entity-source-policy-provenance';
const LIFECYCLE_DATASET = 'business-entity-lifecycle-eligibility';
const REGISTRY_ID = 'national-business-registry-20260911-022652067Z-1ec656c3';
const REGISTRY_SHA = 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76';
const LIFECYCLE_ID = 'business-entity-lifecycle-eligibility-f37556f8722c5a48c114a763ce1786cbe2e6d11b985b875602a97afb45671057';
const LIFECYCLE_SHA = 'fe97a5b260a7c9c38c8884d668ba6f99b237ca4ec0f6885af587efd349f428ae';
const TAXONOMY_SHA = '7c7dcc49afdae859d20de95e785c2efe3e40b43e395091de934ee76a1f99f6cc';
const AS_OF = '2026-10-02T16:30:00.000Z';
const REGISTRATION_SHA = '6c98e38b8c8605f5b3974c84cc5ce7dbc6c26886af184ccf8a7890ea6732fcb1';
const SHA = /^[a-f0-9]{64}$/;
const check = (value, message = 'Business-entity source-policy provenance contract rejected.') => { if (!value) throw new Error(message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));
const safeRelative = value => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.includes('\\')
  && value.split('/').every(part => part && part !== '.' && part !== '..');

// Closed source roster: profile source ID -> dataset registration + source policy ID + registry profile export policy.
const SOURCES = Object.freeze({
  'alaska-dcced-active-business-licenses': { dataset_id: 'ak-active-business-licenses', registration_path: 'config/datasets/ak-active-business-licenses.json', policy_id: 'ak-active-business-licenses', profile_export_policy: 'local-review-only', profile_count: 94550 },
  'california-abc-daily-active-licenses': { dataset_id: 'ca-abc-active-license-sites', registration_path: 'config/datasets/ca-abc-active-license-sites.json', policy_id: 'ca-abc-active-license-sites', profile_export_policy: 'local-review-only', profile_count: 84497 },
  'city-of-chicago-bacp-current-active-business-licenses': { dataset_id: 'chicago-active-business-license-sites', registration_path: 'config/datasets/chicago-active-business-license-sites.json', policy_id: 'chicago-active-business-licenses', profile_export_policy: 'local-review-only', profile_count: 42940 },
  'cms-nppes-monthly-v2': { dataset_id: 'cms-nppes-organizations', registration_path: 'config/datasets/cms-nppes-organizations.json', policy_id: 'cms-nppes-organizations', profile_export_policy: 'public', profile_count: 2088780 },
  'dc-dlcp-active-basic-business-licenses': { dataset_id: 'dc-basic-business-license-sites', registration_path: 'config/datasets/dc-basic-business-license-sites.json', policy_id: 'dc-basic-business-licenses', profile_export_policy: 'local-review-only', profile_count: 54910 },
  'epa-echo-exporter-active-facility': { dataset_id: 'epa-echo-active-facilities', registration_path: 'config/datasets/epa-echo-active-facilities.json', policy_id: 'epa-echo', profile_export_policy: 'public', profile_count: 1517826 },
  'fdic-bankfind-current-structure': { dataset_id: 'fdic-bankfind', registration_path: 'config/datasets/fdic-bankfind.json', policy_id: 'fdic-bankfind', profile_export_policy: 'public', profile_count: 77285 },
  'fmcsa-company-census-active-us-principal-office': { dataset_id: 'fmcsa-active-us-company-census', registration_path: 'config/datasets/fmcsa-active-us-company-census.json', policy_id: 'fmcsa-company-census', profile_export_policy: 'public', profile_count: 2195563 },
  'los-angeles-office-of-finance-active-businesses': { dataset_id: 'la-active-business-location-accounts', registration_path: 'config/datasets/la-active-business-location-accounts.json', policy_id: 'la-active-businesses', profile_export_policy: 'local-review-only', profile_count: 633232 },
  'ncua-final-quarterly-call-report': { dataset_id: 'ncua-quarterly-credit-unions', registration_path: 'config/datasets/ncua-quarterly-credit-unions.json', policy_id: 'ncua-quarterly', profile_export_policy: 'public', profile_count: 22445 },
  'new-york-agriculture-markets-retail-food-stores': { dataset_id: 'ny-retail-food-store-license-sites', registration_path: 'config/datasets/ny-retail-food-store-license-sites.json', policy_id: 'ny-retail-food-stores', profile_export_policy: 'local-review-only', profile_count: 24230 },
  'nyc-dcwp-issued-licenses-active-premises': { dataset_id: 'nyc-dcwp-active-license-sites', registration_path: 'config/datasets/nyc-dcwp-active-license-sites.json', policy_id: 'nyc-dcwp-active-premises', profile_export_policy: 'local-review-only', profile_count: 31163 },
  'texas-comptroller-active-sales-tax-permits': { dataset_id: 'tx-active-sales-tax-outlets', registration_path: 'config/datasets/tx-active-sales-tax-outlets.json', policy_id: 'tx-active-sales-tax-permits', profile_export_policy: 'local-review-only', profile_count: 885097 },
  'usda-fsis-active-mpi-directory': { dataset_id: 'fsis-active-mpi-establishments', registration_path: 'config/datasets/fsis-active-mpi-establishments.json', policy_id: 'fsis-mpi', profile_export_policy: 'public', profile_count: 7237 },
  'usda-snap-current-retailers': { dataset_id: 'usda-snap-retailers', registration_path: 'config/datasets/usda-snap-retailers.json', policy_id: 'usda-snap-retailers', profile_export_policy: 'public', profile_count: 252080 },
});
const EXPECTED_TOTAL = 8011835;

function field(object, key) { return { present: Object.hasOwn(object, key), value: Object.hasOwn(object, key) ? object[key] : null }; }
async function readContainedBytes(root, relativePath, maximum = 2_000_000, signal) {
  check(safeRelative(relativePath), 'unsafe relative path');
  root = path.resolve(root);
  check(await realpath(root) === root, 'root directory alias');
  let cursor = root;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index++) {
    signal?.throwIfAborted(); cursor = path.join(cursor, segments[index]);
    const stat = await lstat(cursor, { bigint: true });
    check(!stat.isSymbolicLink() && (index === segments.length - 1
      ? stat.isFile() && stat.nlink === 1n && stat.size <= BigInt(maximum)
      : stat.isDirectory()), 'input must be contained, single-link, and bounded');
  }
  const before = await lstat(cursor, { bigint: true }), handle = await open(cursor, 'r');
  try {
    const opened = await handle.stat({ bigint: true });
    check(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino && opened.nlink === 1n && opened.size === before.size, 'input identity changed before read');
    const bytes = await handle.readFile(); signal?.throwIfAborted();
    const after = await handle.stat({ bigint: true }), named = await lstat(cursor, { bigint: true });
    check(bytes.length === Number(before.size) && bytes.length <= maximum && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => before[key] === after[key] && before[key] === named[key])
      && named.nlink === 1n && !named.isSymbolicLink(), 'input changed during read');
    return { bytes, sha256: hash(bytes) };
  } finally { await handle.close(); }
}
async function readJson(root, relativePath, maximum, signal) {
  const read = await readContainedBytes(root, relativePath, maximum, signal);
  return { ...read, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read.bytes)) };
}

function expectedPolicySemantics(policy, source) {
  return {
    authorization: {
      source_access: field(policy, 'source_access'), allowed_use: field(policy, 'allowed_use'), prohibited_use: field(policy, 'prohibited_use'),
      acquisition_authorized: field(policy, 'acquisition_authorized'), legal_approval: field(policy, 'legal_approval'),
      agreement_acceptance_performed: field(policy, 'agreement_acceptance_performed'), export_authorized: field(policy, 'export_authorized'),
    },
    export: { profile_export_policy: source.profile_export_policy, export_policy: field(policy, 'export_policy'), field_export_policy: field(policy, 'field_export_policy') },
    retention: field(policy, 'retention'), redistribution: field(policy, 'redistribution'),
  };
}

async function readInputs(root, signal) {
  root = path.resolve(root);
  const [registryRegistrationRead, taxonomyRead, lifecycleRegistrationRead, lifecycleManifestRead] = await Promise.all([
    readJson(root, 'config/datasets/national-business-registry.json', 2_000_000, signal),
    readJson(root, 'config/datasets/business-entity-lifecycle-eligibility-taxonomy.json', 128_000, signal),
    readJson(root, `config/datasets/${LIFECYCLE_DATASET}.json`, 1_000_000, signal),
    readJson(root, `data/${LIFECYCLE_DATASET}/releases/${LIFECYCLE_ID}/manifest.json`, 1_000_000, signal),
  ]);
  const registryRegistration = registryRegistrationRead.value, registryRelease = registryRegistration.current_release;
  check(registryRelease?.release_id === REGISTRY_ID && registryRelease.manifest_sha256 === REGISTRY_SHA && safeRelative(registryRelease.manifest), 'selected registry release pin');
  const registryManifestRead = await readJson(root, registryRelease.manifest, 16_000_000, signal), registryManifest = registryManifestRead.value;
  check(registryManifestRead.sha256 === REGISTRY_SHA && registryManifest.release_id === REGISTRY_ID && registryManifest.dataset_id === 'national-business-registry'
    && registryManifest.coverage?.resolution_location_profiles === EXPECTED_TOTAL, 'selected registry manifest identity/count');
  const taxonomy = taxonomyRead.value;
  check(taxonomyRead.sha256 === TAXONOMY_SHA && taxonomy.status === 'closed-local-review-taxonomy' && taxonomy.profile_source_count === 15
    && taxonomy.sources.length === 15 && taxonomy.expected_profile_counts && stable(taxonomy.claims) !== '{}', 'lifecycle taxonomy pin');
  const lifecycleRegistration = lifecycleRegistrationRead.value, lifecycleSelected = lifecycleRegistration.retained_releases?.filter(row => row.selected === true) ?? [];
  check(lifecycleRegistrationRead.sha256 === 'f7531c0a06b4259ae46f6887c69eb9d8d5f0135ae52f30237556c84e89a66035'
    && lifecycleSelected.length === 1 && lifecycleSelected[0].release_id === LIFECYCLE_ID && lifecycleSelected[0].manifest_sha256 === LIFECYCLE_SHA
    && lifecycleManifestRead.sha256 === LIFECYCLE_SHA && lifecycleManifestRead.value.release_id === LIFECYCLE_ID
    && lifecycleManifestRead.value.bindings?.taxonomy?.sha256 === TAXONOMY_SHA && lifecycleManifestRead.value.summary?.profile_count === EXPECTED_TOTAL,
  'selected lifecycle release/taxonomy pin');
  const temporal = await readNationalBusinessTemporalClaimRows({ root, signal });
  check(temporal.provenance.registry_release_id === REGISTRY_ID && temporal.provenance.registry_manifest_sha256 === REGISTRY_SHA);
  const temporalBySource = new Map(temporal.rows.filter(row => Object.hasOwn(SOURCES, row.profile_source_id)).map(row => [row.profile_source_id, row]));
  check(temporalBySource.size === 15 && taxonomy.sources.length === Object.keys(SOURCES).length);
  const dependencies = registryManifest.dependencies.filter(dep => Object.values(SOURCES).some(source => source.dataset_id === dep.dataset_id));
  check(dependencies.length === 15 && new Set(dependencies.map(dep => dep.dataset_id)).size === 15);
  const rows = [];
  for (const [source_id, source] of Object.entries(SOURCES).sort(([a], [b]) => a.localeCompare(b))) {
    signal?.throwIfAborted();
    const tax = taxonomy.sources.find(row => row.source_id === source_id), semantic = temporalBySource.get(source_id);
    const count = taxonomy.expected_profile_counts[source_id];
    check(tax && semantic && count === source.profile_count && tax.source_key === semantic.source_key && tax.source_release_id === semantic.source_release_id
      && tax.policy_sha256 === semantic.policy_sha256 && semantic.policy_path && tax.lifecycle_evidence && !tax.unknown_status_behavior,
    `closed taxonomy row for ${source_id}`);
    const registrationRead = await readJson(root, source.registration_path, 2_000_000, signal), registration = registrationRead.value;
    check(registration.dataset_id === source.dataset_id && registration.source_policy === semantic.policy_path, `dataset registration identity for ${source_id}`);
    const dependency = dependencies.find(dep => dep.dataset_id === source.dataset_id);
    check(dependency && SHA.test(dependency.manifest_sha256) && typeof dependency.release_id === 'string', `selected source dependency for ${source_id}`);
    const currentPath = registration.output ?? registration.runtime_pointer;
    check(safeRelative(currentPath) && path.posix.basename(currentPath) === 'current.json', `dataset current path for ${source_id}`);
    const manifestPath = `${path.posix.dirname(currentPath)}/releases/${dependency.release_id}/manifest.json`;
    const sourceManifestRead = await readJson(root, manifestPath, 8_000_000, signal), sourceManifest = sourceManifestRead.value;
    check(sourceManifestRead.sha256 === dependency.manifest_sha256 && sourceManifest.dataset_id === source.dataset_id && sourceManifest.release_id === dependency.release_id
      && sourceManifest.source_release_id === tax.source_release_id, `selected source manifest for ${source_id}`);
    const policyRead = await readJson(root, semantic.policy_path, 256_000, signal), policy = policyRead.value;
    check(policyRead.sha256 === semantic.policy_sha256 && policy.policy_id === source.policy_id && policy.version === '1.0.0'
      && registration.source_policy === semantic.policy_path, `raw policy identity/hash for ${source_id}`);
    const embeddedField = ['policy', 'privacy_and_export_controls', 'export_policy'].find(key => Object.hasOwn(sourceManifest, key));
    const embedded = embeddedField ? { status: 'present', field: embeddedField, sha256: hash(stable(sourceManifest[embeddedField])) }
      : { status: 'absent-in-selected-source-manifest', field: null, sha256: null };
    if (embedded.status === 'present' && sourceManifest[embeddedField] && typeof sourceManifest[embeddedField] === 'object'
      && sourceManifest[embeddedField].policy_id !== undefined) check(sourceManifest[embeddedField].policy_id === policy.policy_id, `embedded policy identity for ${source_id}`);
    rows.push({ schema_version: `${DATASET}-row@1.0.0`, source_id, source_key: tax.source_key, profile_count: count,
      dataset_id: source.dataset_id, dataset_registration_path: source.registration_path, dataset_registration_sha256: registrationRead.sha256,
      source_release_id: tax.source_release_id, selected_dataset_release_id: dependency.release_id, source_manifest_path: manifestPath,
      source_manifest_sha256: sourceManifestRead.sha256, policy_profile_path: semantic.policy_path, policy_profile_sha256: policyRead.sha256,
      policy_id: policy.policy_id, policy_version: policy.version, source_manifest_policy: embedded,
      semantics: expectedPolicySemantics(policy, source), lifecycle_policy_sha256: tax.policy_sha256, temporal_policy_sha256: semantic.policy_sha256 });
  }
  check(rows.length === 15 && rows.reduce((sum, row) => sum + row.profile_count, 0) === EXPECTED_TOTAL
    && new Set(rows.map(row => row.source_id)).size === 15 && new Set(rows.map(row => row.dataset_registration_path)).size === 15
    && new Set(rows.map(row => row.policy_profile_path)).size === 15, '15-source denominator/path conservation');
  const bindings = {
    registry: { registration_path: 'config/datasets/national-business-registry.json', registration_sha256: registryRegistrationRead.sha256,
      release_id: REGISTRY_ID, manifest_path: registryRelease.manifest, manifest_sha256: REGISTRY_SHA },
    lifecycle: { registration_path: `config/datasets/${LIFECYCLE_DATASET}.json`, registration_sha256: lifecycleRegistrationRead.sha256,
      release_id: LIFECYCLE_ID, manifest_path: `data/${LIFECYCLE_DATASET}/releases/${LIFECYCLE_ID}/manifest.json`, manifest_sha256: LIFECYCLE_SHA,
      taxonomy_path: 'config/datasets/business-entity-lifecycle-eligibility-taxonomy.json', taxonomy_sha256: taxonomyRead.sha256 },
    temporal: { release_id: temporal.provenance.release_id, manifest_sha256: temporal.provenance.manifest_sha256, artifact_sha256: temporal.provenance.artifact_sha256 },
  };
  return { rows, bindings, summary: { source_count: 15, profile_count: EXPECTED_TOTAL,
    source_profile_counts: Object.fromEntries(rows.map(row => [row.source_id, row.profile_count]).sort(([a], [b]) => a.localeCompare(b))),
    profile_export_policy_counts: rows.reduce((counts, row) => { const value = SOURCES[row.source_id].profile_export_policy; counts[value] = (counts[value] ?? 0) + row.profile_count; return counts; }, {}),
    current_operation_verified: false, active_business_eligible: false, source_acquisition_performed: false, network_requests: 0 },
    taxonomy, temporalBySource, sources: SOURCES };
}

function manifestFor(input, artifact) {
  const body = { schema_version: `${DATASET}-release@1.0.0`, contract_version: BUSINESS_ENTITY_SOURCE_POLICY_PROVENANCE_VERSION,
    status: 'immutable-pointer-free-local-review-only', publication_mode: 'pointer-free', assessment_as_of: AS_OF,
    bindings: input.bindings, summary: input.summary, claims: { source_acquisition_performed: false, network_requests: 0,
      approval_granted: false, current_operation_verified: false, active_business_eligible: false, current_pointer_written: false }, artifact };
  return { ...body, release_id: `${DATASET}-${hash(stable(body))}` };
}

export async function buildBusinessEntitySourcePolicyProvenance({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); signal?.throwIfAborted(); const input = await readInputs(root, signal);
  const artifactBytes = Buffer.from(`${JSON.stringify({ schema_version: `${DATASET}-rows@1.0.0`, rows: input.rows }, null, 2)}\n`);
  const artifact = { path: 'source-policies.json', bytes: artifactBytes.length, sha256: hash(artifactBytes), record_count: input.rows.length };
  const manifest = manifestFor(input, artifact), manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), manifestSha = hash(manifestBytes);
  const releases = path.join(root, 'data', DATASET, 'releases'); await mkdir(releases, { recursive: true });
  const final = path.join(releases, manifest.release_id); const present = await lstat(final).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!present) {
    const stage = path.join(releases, `.stage-${randomUUID()}`); await mkdir(stage);
    const owner = await lstat(stage, { bigint: true });
    try {
      await writeFile(path.join(stage, artifact.path), artifactBytes, { flag: 'wx' });
      await writeFile(path.join(stage, 'manifest.json'), manifestBytes, { flag: 'wx' });
      await rename(stage, final);
    } catch (error) {
      const current = await lstat(stage, { bigint: true }).catch(() => null);
      if (current?.dev === owner.dev && current?.ino === owner.ino && current.isDirectory() && !current.isSymbolicLink()) await rm(stage, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
  const old = await readJson(root, `config/datasets/${DATASET}.json`, 2_000_000, signal).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  const retained = (old?.value.retained_releases ?? []).map(row => ({ ...row, selected: false }));
  if (!retained.some(row => row.release_id === manifest.release_id)) retained.push({ release_id: manifest.release_id,
    manifest_path: `data/${DATASET}/releases/${manifest.release_id}/manifest.json`, manifest_sha256: manifestSha, artifact_sha256: artifact.sha256,
    record_count: artifact.record_count, selected: true });
  else for (const row of retained) if (row.release_id === manifest.release_id) row.selected = true;
  const registration = { schema_version: `${DATASET}-registration@1.0.0`, dataset_id: DATASET,
    status: 'registered-pointer-free-local-review-only', runtime_pointer: null, production_enrollment: false,
    current_pointer_written: false, selected_release_id: manifest.release_id, retained_releases: retained };
  const registrationPath = path.join(root, `config/datasets/${DATASET}.json`), tmp = `${registrationPath}.tmp-${randomUUID()}`;
  await writeFile(tmp, `${JSON.stringify(registration, null, 2)}\n`, { flag: 'wx' }); await rename(tmp, registrationPath);
  return { release_id: manifest.release_id, manifest_sha256: manifestSha, artifact_sha256: artifact.sha256, summary: input.summary };
}

export async function readBusinessEntitySourcePolicyProvenance({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); signal?.throwIfAborted();
  const registrationRead = await readJson(root, `config/datasets/${DATASET}.json`, 2_000_000, signal), registration = registrationRead.value;
  check(registrationRead.sha256 === REGISTRATION_SHA && registration.schema_version === `${DATASET}-registration@1.0.0` && registration.dataset_id === DATASET
    && registration.status === 'registered-pointer-free-local-review-only' && registration.runtime_pointer === null
    && registration.production_enrollment === false && registration.current_pointer_written === false, 'registration');
  const selected = registration.retained_releases?.filter(row => row.selected === true) ?? []; check(selected.length === 1);
  const pin = selected[0]; check(pin.release_id === registration.selected_release_id && typeof pin.release_id === 'string'
    && pin.manifest_path === `data/${DATASET}/releases/${pin.release_id}/manifest.json` && SHA.test(pin.manifest_sha256) && SHA.test(pin.artifact_sha256));
  const manifestRead = await readJson(root, pin.manifest_path, 2_000_000, signal), manifest = manifestRead.value;
  check(manifestRead.sha256 === pin.manifest_sha256 && manifest.release_id === pin.release_id
    && manifest.schema_version === `${DATASET}-release@1.0.0` && manifest.contract_version === BUSINESS_ENTITY_SOURCE_POLICY_PROVENANCE_VERSION
    && manifest.status === 'immutable-pointer-free-local-review-only' && manifest.publication_mode === 'pointer-free'
    && manifest.claims?.network_requests === 0 && manifest.claims?.source_acquisition_performed === false
    && manifest.claims?.approval_granted === false && manifest.claims?.current_operation_verified === false
    && manifest.claims?.active_business_eligible === false && manifest.claims?.current_pointer_written === false,
  'release manifest or claims');
  const artifact = manifest.artifact; check(artifact?.path === 'source-policies.json' && artifact.record_count === 15
    && Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && SHA.test(artifact.sha256));
  const artifactRead = await readJson(root, `${path.posix.dirname(pin.manifest_path)}/${artifact.path}`, 2_000_000, signal);
  check(artifactRead.sha256 === artifact.sha256 && artifactRead.bytes.length === artifact.bytes && artifactRead.sha256 === pin.artifact_sha256);
  const input = await readInputs(root, signal), expectedManifest = manifestFor(input, artifact);
  check(stable(manifest) === stable(expectedManifest) && stable(pin.release_id) === stable(expectedManifest.release_id)
    && stable(artifactRead.value) === stable({ schema_version: `${DATASET}-rows@1.0.0`, rows: input.rows })
    && stable(manifest.bindings) === stable(input.bindings) && stable(manifest.summary) === stable(input.summary),
  'source policy provenance lineage/replay');
  return { available: true, release_id: manifest.release_id, registration_sha256: registrationRead.sha256,
    manifest_sha256: manifestRead.sha256, artifact_sha256: artifact.sha256, record_count: artifact.record_count,
    registry_release_id: REGISTRY_ID, registry_manifest_sha256: REGISTRY_SHA, lifecycle_release_id: LIFECYCLE_ID,
    lifecycle_manifest_sha256: LIFECYCLE_SHA, taxonomy_sha256: TAXONOMY_SHA, temporal_release_id: input.bindings.temporal.release_id,
    temporal_manifest_sha256: input.bindings.temporal.manifest_sha256, summary: input.summary,
    rows: input.rows, source_by_id: new Map(input.rows.map(row => [row.source_id, row])) };
}
