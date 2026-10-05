import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message = 'Flat business export governance binding rejected.') => { if (!ok) throw new Error(message); };

async function readPinned(root, relativePath, maximum = 2_000_000, signal) {
  check(typeof relativePath === 'string' && !path.isAbsolute(relativePath) && !relativePath.includes('\\')
    && relativePath.split('/').every(part => part && part !== '.' && part !== '..'));
  root = path.resolve(root); check(await realpath(root) === root, 'Export governance root is not canonical.');
  let file = root;
  const pieces = relativePath.split('/');
  for (let i = 0; i < pieces.length; i++) {
    signal?.throwIfAborted(); file = path.join(file, pieces[i]);
    const info = await lstat(file, { bigint: true });
    check(!info.isSymbolicLink() && (i === pieces.length - 1
      ? info.isFile() && info.nlink === 1n && info.size <= BigInt(maximum) : info.isDirectory()), 'Export governance input must be contained, single-link, and bounded.');
  }
  const before = await lstat(file, { bigint: true }), handle = await open(file, 'r');
  try {
    const opened = await handle.stat({ bigint: true });
    check(opened.dev === before.dev && opened.ino === before.ino && opened.nlink === 1n && opened.size === before.size);
    const bytes = await handle.readFile(); signal?.throwIfAborted();
    const after = await handle.stat({ bigint: true }), named = await lstat(file, { bigint: true });
    check(bytes.length === Number(before.size) && bytes.length <= maximum && before.size === after.size && before.mtimeNs === after.mtimeNs
      && before.ctimeNs === after.ctimeNs && named.dev === before.dev && named.ino === before.ino && named.nlink === 1n, 'Export governance input changed during read.');
    return { bytes, sha256: hash(bytes), value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } finally { await handle.close(); }
}

export async function readFlatBusinessExportGovernance({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); signal?.throwIfAborted();
  const [{ readBusinessEntityLifecycleEligibilitySummary }, { readBusinessEntityGeographyRelationshipSummary },
    { readReportingOnlySiteQualification }, { readBusinessEntitySourcePolicyProvenance }] = await Promise.all([
    import('./business-entity-lifecycle-eligibility.mjs'), import('./business-entity-geography-relationship.mjs'),
    import('./reporting-only-site-qualification.mjs'), import('./business-entity-source-policy-provenance.mjs'),
  ]);
  const [registryRegistration, sourcePolicies, lifecycle, geography, reporting] = await Promise.all([
    readPinned(root, 'config/datasets/national-business-registry.json', 2_000_000, signal),
    readBusinessEntitySourcePolicyProvenance({ root, signal }),
    readBusinessEntityLifecycleEligibilitySummary({ root, signal }),
    readBusinessEntityGeographyRelationshipSummary({ root }),
    readReportingOnlySiteQualification({ root, signal }),
  ]);
  const selected = registryRegistration.value.current_release;
  check(selected && selected.release_id === sourcePolicies.registry_release_id && selected.manifest_sha256 === sourcePolicies.registry_manifest_sha256,
    'Selected registry and policy-provenance lineage differ.');
  const registryManifestRead = await readPinned(root, selected.manifest, 32_000_000, signal);
  check(registryManifestRead.sha256 === selected.manifest_sha256 && registryManifestRead.value.dataset_id === 'national-business-registry'
    && registryManifestRead.value.release_id === selected.release_id && Array.isArray(registryManifestRead.value.artifacts), 'Selected registry manifest is not verified.');
  const geographyRegistration = await readPinned(root, 'config/datasets/business-entity-geography-relationship.json', 1_000_000, signal);
  const reportingRegistration = await readPinned(root, 'config/datasets/reporting-only-site-qualification.json', 2_000_000, signal);
  const lifecycleRegistration = await readPinned(root, 'config/datasets/business-entity-lifecycle-eligibility.json', 1_000_000, signal);
  const lineage = {
    registry: { registration_path: 'config/datasets/national-business-registry.json', registration_sha256: registryRegistration.sha256,
      release_id: selected.release_id, manifest_path: selected.manifest, manifest_sha256: selected.manifest_sha256,
      artifact_inventory_sha256: hash(Buffer.from(JSON.stringify(registryManifestRead.value.artifacts))) },
    lifecycle: { registration_path: lifecycle.registration_path, registration_sha256: lifecycle.registration_sha256,
      release_id: lifecycle.release_id, manifest_path: lifecycle.manifest_path, manifest_sha256: lifecycle.manifest_sha256,
      taxonomy_path: lifecycle.taxonomy_path, taxonomy_sha256: lifecycle.taxonomy_sha256, artifact_count: lifecycle.artifact_count,
      artifact_inventory_sha256: lifecycle.artifact_inventory_sha256 },
    entity_geography: { registration_path: 'config/datasets/business-entity-geography-relationship.json', registration_sha256: geographyRegistration.sha256,
      release_id: geography.release_id, manifest_sha256: geography.manifest_sha256, profile_count: geography.profile_count,
      artifact_inventory_sha256: hash(Buffer.from(JSON.stringify((await readPinned(root, `data/business-entity-geography-relationship/releases/${geography.release_id}/manifest.json`, 8_000_000, signal)).value.artifacts))) },
    reporting_only_qualification: { registration_path: 'config/datasets/reporting-only-site-qualification.json', registration_sha256: reporting.provenance.registration_sha256,
      release_id: reporting.provenance.release_id, manifest_sha256: reporting.provenance.manifest_sha256,
      artifact_sha256: reporting.provenance.artifact_sha256, artifact_bytes: reporting.provenance.artifact_bytes,
      record_count: reporting.provenance.record_count, policy_sources: reporting.provenance.bindings.sources },
    source_policy_provenance: { registration_path: 'config/datasets/business-entity-source-policy-provenance.json',
      registration_sha256: sourcePolicies.registration_sha256, release_id: sourcePolicies.release_id,
      manifest_sha256: sourcePolicies.manifest_sha256, artifact_sha256: sourcePolicies.artifact_sha256,
      record_count: sourcePolicies.record_count, source_rows: sourcePolicies.rows },
  };
  check(lineage.lifecycle.release_id === lifecycleRegistration.value.selected_release_id
    && lineage.entity_geography.release_id === geographyRegistration.value.selected_release_id
    && lineage.reporting_only_qualification.release_id === reportingRegistration.value.selected_release_id,
  'A selected qualification release differs from its registration.');
  return { lineage, registryArtifacts: registryManifestRead.value.artifacts, sourcePolicyById: sourcePolicies.source_by_id, reportingByRecord: reporting.byRecord };
}
