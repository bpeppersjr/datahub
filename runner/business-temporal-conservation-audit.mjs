import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (value, message = 'Temporal conservation audit rejected.') => { if (!value) throw Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));

function contained(root, value) {
  const base = path.resolve(root), file = path.resolve(base, value), relative = path.relative(base, file);
  check(!relative.startsWith('..') && !path.isAbsolute(relative), 'Temporal audit path escapes datahub.');
  return file;
}

async function noLinks(root, file) {
  const base = path.resolve(root), relative = path.relative(base, file); let cursor = base;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part); const info = await lstat(cursor);
    check(!info.isSymbolicLink() && path.resolve(await realpath(cursor)) === path.resolve(cursor), 'Temporal audit path crosses a link.');
  }
}

async function loadDataset(root, relativePointer, datasetId, signal) {
  signal?.throwIfAborted(); const pointerPath = contained(root, relativePointer); await noLinks(root, pointerPath);
  const pointerBytes = await readFile(pointerPath, { signal }), pointer = JSON.parse(pointerBytes);
  const manifestPath = contained(path.dirname(pointerPath), pointer.manifest); await noLinks(root, manifestPath);
  const manifestBytes = await readFile(manifestPath, { signal }), manifest = JSON.parse(manifestBytes);
  check(pointer.dataset_id === datasetId && manifest.dataset_id === datasetId && pointer.release_id === manifest.release_id, `${datasetId} pointer identity mismatch.`);
  return { pointerPath, pointerSha256: sha(pointerBytes), manifestPath, manifestSha256: sha(manifestBytes), manifest, directory: path.dirname(manifestPath) };
}

function artifactFile(root, dataset, artifact) {
  const file = contained(dataset.directory, artifact.path); check(contained(root, file) === file, 'Artifact escapes datahub.'); return file;
}

async function jsonArtifact(root, dataset, artifact, signal) {
  const file = artifactFile(root, dataset, artifact); await noLinks(root, file); const bytes = await readFile(file, { signal });
  check(bytes.length === artifact.bytes && sha(bytes) === artifact.sha256 && artifact.record_count === 1, 'Temporal audit JSON artifact integrity mismatch.');
  return JSON.parse(bytes);
}

async function* gzipRows(root, dataset, artifact, signal) {
  const file = artifactFile(root, dataset, artifact); await noLinks(root, file); signal?.throwIfAborted();
  const hash = createHash('sha256'); let bytes = 0, records = 0;
  const input = createReadStream(file); input.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
  const gunzip = createGunzip(), lines = createInterface({ input: input.pipe(gunzip), crlfDelay: Infinity });
  const abort = () => input.destroy(signal.reason ?? Error('Aborted'));
  signal?.addEventListener('abort', abort, { once: true });
  try { for await (const line of lines) { signal?.throwIfAborted(); if (!line) continue; records++; yield JSON.parse(line); } }
  finally { signal?.removeEventListener('abort', abort); lines.close(); }
  check(bytes === artifact.bytes && hash.digest('hex') === artifact.sha256 && records === artifact.record_count, 'Temporal audit artifact integrity mismatch.');
}

async function* jsonlRows(root, dataset, artifact, signal) {
  const file = artifactFile(root, dataset, artifact); await noLinks(root, file); signal?.throwIfAborted();
  const hash = createHash('sha256'); let bytes = 0, records = 0; const input = createReadStream(file);
  input.on('data', chunk => { bytes += chunk.length; hash.update(chunk); }); const lines = createInterface({ input, crlfDelay: Infinity });
  const abort = () => input.destroy(signal.reason ?? Error('Aborted')); signal?.addEventListener('abort', abort, { once: true });
  try { for await (const line of lines) { signal?.throwIfAborted(); if (!line) continue; records++; yield JSON.parse(line); } }
  finally { signal?.removeEventListener('abort', abort); lines.close(); }
  check(bytes === artifact.bytes && hash.digest('hex') === artifact.sha256 && records === artifact.record_count, 'Temporal audit artifact integrity mismatch.');
}

function dependency(manifest, datasetId, expected) {
  const candidates = [...(manifest.dependencies ?? []), ...(manifest.dependency ? [manifest.dependency] : [])];
  const matches = candidates.filter(item => item.dataset_id === datasetId);
  check(matches.length === 1 && matches[0].release_id === expected.manifest.release_id && matches[0].manifest_sha256 === expected.manifestSha256, `${manifest.dataset_id} dependency pin mismatch.`);
}

const empty = () => ({ records: 0, statusPresent: 0, statusMissing: 0, observedPresent: 0, observedMissing: 0, earliestObservedAt: null, latestObservedAt: null, statuses: new Map(), releases: new Set() });
function addProfile(summary, row) {
  const source = row.source?.source_id; check(typeof source === 'string' && source && row.source?.source_release_id, 'Registry profile provenance is incomplete.');
  const item = summary.get(source) ?? empty(); summary.set(source, item); item.records++;
  item.releases.add(row.source.source_release_id); check(item.releases.size === 1, `Registry source ${source} spans multiple releases.`);
  if (row.source_status === null || row.source_status === undefined) item.statusMissing++;
  else { item.statusPresent++; const value = stable(row.source_status); item.statuses.set(value, (item.statuses.get(value) ?? 0) + 1); }
  if (typeof row.observed_at === 'string' && Number.isFinite(Date.parse(row.observed_at))) {
    item.observedPresent++; if (!item.earliestObservedAt || row.observed_at < item.earliestObservedAt) item.earliestObservedAt = row.observed_at;
    if (!item.latestObservedAt || row.observed_at > item.latestObservedAt) item.latestObservedAt = row.observed_at;
  } else item.observedMissing++;
}
function finish(source, item) {
  const distribution = [...item.statuses].sort(([a], [b]) => a.localeCompare(b));
  return { sourceId: source, sourceReleaseId: [...item.releases][0], records: item.records, sourceStatusPresent: item.statusPresent, sourceStatusMissing: item.statusMissing,
    observedAtPresent: item.observedPresent, observedAtMissing: item.observedMissing, earliestObservedAt: item.earliestObservedAt,
    latestObservedAt: item.latestObservedAt, distinctSourceStatuses: distribution.length, sourceStatusDistributionSha256: sha(stable(distribution)) };
}

export async function auditBusinessTemporalConservation({ root = APP_ROOT, registryPointer = 'data/business-registry/current.json', resolutionPointer = 'data/business-entity-resolution/current.json', coveragePointer = 'data/business-coverage-views/current.json', signal } = {}) {
  const [registry, resolution, coverage] = await Promise.all([
    loadDataset(root, registryPointer, 'national-business-registry', signal), loadDataset(root, resolutionPointer, 'national-business-entity-resolution', signal), loadDataset(root, coveragePointer, 'national-business-coverage-views', signal),
  ]);
  dependency(resolution.manifest, 'national-business-registry', registry); dependency(coverage.manifest, 'national-business-registry', registry); dependency(coverage.manifest, 'national-business-entity-resolution', resolution);
  const profiles = registry.manifest.artifacts.filter(item => item.artifact_type === 'entity-resolution-location-profile-jsonl-gzip');
  const decisions = resolution.manifest.artifacts.filter(item => item.artifact_type === 'entity-resolution-decision-jsonl-gzip');
  check(profiles.length && decisions.length, 'Required temporal audit artifacts are absent.');
  const bySource = new Map(); let profileRows = 0;
  for (const artifact of profiles) for await (const row of gzipRows(root, registry, artifact, signal)) { addProfile(bySource, row); profileRows++; }
  let decisionRows = 0, activeDecisionRows = 0;
  for (const artifact of decisions) for await (const row of gzipRows(root, resolution, artifact, signal)) {
    decisionRows++; check(!Object.hasOwn(row, 'source_status') && !Object.hasOwn(row, 'current_operations_verified') && !Object.hasOwn(row, 'active_business'), 'Resolution decision contains a business temporal claim.');
    if (row.decision_type === 'automatic-link') check(row.source?.source_id && row.source?.source_release_id && typeof row.observed_at === 'string', 'Automatic resolution decision temporal provenance is incomplete.');
    else if (row.decision_type === 'review-candidate') check(row.decision_status === 'pending-review' && Array.isArray(row.evidence?.source_ids) && row.evidence.source_ids.length > 0 && typeof row.decided_at === 'string', 'Review decision provenance is incomplete.');
    else check(false, 'Unknown resolution decision type.');
    if (row.decision_status === 'active') activeDecisionRows++;
  }
  check(profileRows === registry.manifest.coverage?.resolution_location_profiles && profileRows === resolution.manifest.coverage?.profiles && profileRows === coverage.manifest.coverage?.location_profiles_assessed, 'Registry, resolution and coverage profile counts differ.');
  const sourceRows = [...bySource].map(([source, item]) => finish(source, item)).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const sourceArtifact = coverage.manifest.artifacts.find(item => item.artifact_type === 'source-coverage-view-jsonl');
  check(sourceArtifact, 'Coverage source view is absent.'); const coverageSources = new Map(), coverageSourcesByRelease = new Map();
  for await (const row of jsonlRows(root, coverage, sourceArtifact, signal)) {
    if (row.profile_source_id) { check(!coverageSources.has(row.profile_source_id), 'Coverage source view identity is invalid.'); coverageSources.set(row.profile_source_id, row); }
    const release = row.release_metadata?.source_release_id;
    if (release) { check(!coverageSourcesByRelease.has(release), 'Coverage source release identity is duplicated.'); coverageSourcesByRelease.set(release, row); }
  }
  for (const source of sourceRows) {
    const row = coverageSources.get(source.sourceId) ?? coverageSourcesByRelease.get(source.sourceReleaseId), geography = row?.location_profile_geography;
    check(geography?.profile_count === source.records && geography.earliest_observed_at === source.earliestObservedAt && geography.latest_observed_at === source.latestObservedAt, `Coverage source summary differs for ${source.sourceId}.`);
  }
  let reportingOnlyRows = 0;
  for (const artifact of registry.manifest.artifacts.filter(item => item.artifact_type === 'business-reporting-location-evidence-jsonl-gzip')) {
    for await (const row of gzipRows(root, registry, artifact, signal)) {
      check(row.identity_matching_eligible === false && row.source_status?.active_business_verified === false, 'Reporting-only childcare contains an operating-business claim.'); reportingOnlyRows++;
    }
  }
  check(reportingOnlyRows === registry.manifest.coverage?.reporting_location_evidence, 'Reporting-only childcare count differs.');
  const retainedRegistryArtifact = coverage.manifest.artifacts.find(item => item.artifact_type === 'retained-registry-manifest-json');
  check(retainedRegistryArtifact, 'Coverage retained registry evidence is absent.');
  const retainedRegistry = await jsonArtifact(root, coverage, retainedRegistryArtifact, signal);
  check(retainedRegistry.release_id === registry.manifest.release_id, 'Coverage retained registry evidence identifies another release.');
  const retained = coverage.manifest.retained_childcare_reporting?.summary, mn = coverage.manifest.mn_construction_credential_reporting;
  check(!retained || retained.current_operations_verified === false && retained.identity_matching_eligible === false && retained.national_completeness_percent === null, 'Retained childcare temporal claims are unsafe.');
  const mnRegistry = retainedRegistry.mn_construction_credential_reporting;
  check(!mn || mn.identity_matching_applied === false && mn.public_export_authorized === false
    && mnRegistry?.current_operations_verified === false && mnRegistry.active_business_count === null && mnRegistry.identity_matching_eligible === false, 'Minnesota credential temporal claims are unsafe.');
  return { schemaVersion: 'business-temporal-conservation-audit@1.0.0', auditMode: 'read-only', releases: {
    registry: { releaseId: registry.manifest.release_id, pointerSha256: registry.pointerSha256, manifestSha256: registry.manifestSha256 },
    resolution: { releaseId: resolution.manifest.release_id, pointerSha256: resolution.pointerSha256, manifestSha256: resolution.manifestSha256 },
    coverage: { releaseId: coverage.manifest.release_id, pointerSha256: coverage.pointerSha256, manifestSha256: coverage.manifestSha256 },
  }, counts: { registryLocationProfiles: profileRows, resolutionProfiles: resolution.manifest.coverage.profiles, coverageProfilesAssessed: coverage.manifest.coverage.location_profiles_assessed, resolutionDecisions: decisionRows, activeDecisionLifecycleRows: activeDecisionRows },
  claims: { activeDecisionMeansBusinessActive: false, generalBusinessOperationInferred: false, coverageRetainsPerRecordStatusDistribution: false },
  sources: sourceRows, extensions: { reportingOnlyChildcareRows: reportingOnlyRows,
    retainedChildcare: retained ? { rows: retained.candidate_rows, currentOperationsVerified: false, identityMatchingEligible: false } : null,
    mnCredentials: mn ? { rows: mn.selected_cohort_rows, activeBusinessCount: null, currentOperationsVerified: false, identityMatchingApplied: false } : null } };
}
