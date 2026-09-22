import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {open, lstat, mkdir, readdir, readFile} from 'node:fs/promises';
import {APP_ROOT, assertInsideApp, relativeToApp} from './paths.mjs';
import {mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';
import {FL_RETAIL_LIMITS, FL_RETAIL_VERSION, replayFlRetailSequence} from './fl-food-retail-contract.mjs';

export const FL_RETAIL_OFFLINE_VERSION = 'fl-food-retail-offline-lifecycle@1.0.0';
export const FL_RETAIL_OFFLINE_POLICY = 'fl-food-retail-acquisition@1.0.0';
const POLICY_PATH = path.join(APP_ROOT, 'config/source-policies/fl-food-retail-acquisition.json');
const DEFAULT_ROOT = path.join(APP_ROOT, 'data/tmp/fl-food-retail-offline/jobs');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const STAGES = ['preflight', 'plan', 'acquire', 'validate', 'normalize', 'reconcile', 'quality-gate', 'publish', 'finalize'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const check = (value, message = 'Florida retail offline lifecycle rejected.') => { if (!value) throw new Error(message); };

function plain(value) {
  return value && Object.getPrototypeOf(value) === Object.prototype;
}

function validateOptions(value) {
  check(plain(value));
  const allowed = new Set(['fixtures', 'includePoints', 'signal', 'outputRoot', 'faultAt']);
  check(Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.has(key)));
  check(value.fixtures instanceof Map);
  check(typeof value.includePoints === 'boolean');
  check(value.signal === undefined || value.signal instanceof AbortSignal);
  check(value.outputRoot === undefined || typeof value.outputRoot === 'string');
  check(value.faultAt === undefined || value.faultAt === 'before-manifest');
  for (const [name, bytes] of value.fixtures) check(typeof name === 'string' && /^[a-z0-9.-]+$/.test(name) && Buffer.isBuffer(bytes));
}

async function safeRoot(candidate) {
  const root = assertInsideApp(candidate ?? DEFAULT_ROOT);
  await canonical(root, {create: true, output: true});
  const stat = await lstat(root);
  check(stat.isDirectory() && !stat.isSymbolicLink(), 'Florida retail offline output root is unsafe.');
  return root;
}

async function writeNew(file, bytes) {
  const handle = await open(file, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return {name: path.basename(file), bytes: bytes.length, sha256: sha256(bytes)};
}

async function loadPolicy() {
  const bytes = await readFile(POLICY_PATH);
  const policy = JSON.parse(bytes.toString('utf8'));
  check(policy.policy_id === 'fl-food-retail-acquisition' && policy.version === '1.0.0');
  check(policy.status === 'blocked-offline-fixture-only' && policy.native_acquisition_authorized === false);
  check(policy.public_export_authorized === false && policy.provider_record_acquisition_performed === false);
  return {bytes, policy};
}

function publicError(error, cancelled) {
  return cancelled ? 'Offline fixture lifecycle cancelled; no manifest was published.' : 'Offline fixture lifecycle failed; inspect run-scoped evidence. No provider request was made.';
}

export async function runFlRetailOfflineFixture(options) {
  validateOptions(options);
  const {fixtures, includePoints, signal, faultAt} = options;
  signal?.throwIfAborted();
  const outputRoot = await safeRoot(options.outputRoot);
  const runId = randomUUID();
  const directory = path.join(outputRoot, runId);
  await mkdir(directory);
  const artifacts = [];
  let manifestPublished = false;
  let fixtureRequests = 0;
  let totalResponseBytes = 0;
  let stageIndex = 0;
  const startedAt = new Date().toISOString();
  const persist = async (name, bytes) => {
    signal?.throwIfAborted();
    const artifact = await writeNew(path.join(directory, name), bytes);
    artifacts.push(artifact);
    return artifact;
  };
  const stage = async (name, detail = {}) => {
    signal?.throwIfAborted();
    check(STAGES[stageIndex] === name);
    const receipt = {schemaVersion: FL_RETAIL_OFFLINE_VERSION, runId, executionMode: 'injected-fixture', stage: name, sequence: stageIndex + 1, status: 'SUCCEEDED', recordedAt: new Date().toISOString(), ...detail};
    await persist(`stage-${String(stageIndex + 1).padStart(2, '0')}-${name}.json`, json(receipt));
    stageIndex += 1;
  };

  try {
    const {bytes: policyBytes} = await loadPolicy();
    const policySha256 = sha256(policyBytes);
    await persist('intent.json', json({schemaVersion: FL_RETAIL_OFFLINE_VERSION, runId, executionMode: 'injected-fixture', includePoints, nativeAcquisitionAuthorized: false, providerRequestsAllowed: 0, startedAt}));
    await persist('policy.json', policyBytes);
    await stage('preflight', {policyProfile: FL_RETAIL_OFFLINE_POLICY, nativeTransportAvailable: false});
    await stage('plan', {fixtureEntriesProvided: fixtures.size, maximumFixtureRequests: FL_RETAIL_LIMITS.requests, nativeRequestsPlanned: 0});

    const get = async route => {
      signal?.throwIfAborted();
      check(route && typeof route.name === 'string' && typeof route.maxBytes === 'number');
      fixtureRequests += 1;
      check(fixtureRequests <= FL_RETAIL_LIMITS.requests, 'Florida retail fixture request budget exceeded.');
      const raw = fixtures.get(route.name);
      check(Buffer.isBuffer(raw), `Missing injected fixture ${route.name}.`);
      check(raw.length <= route.maxBytes, `Injected fixture ${route.name} exceeded its response limit.`);
      totalResponseBytes += raw.length;
      check(totalResponseBytes <= FL_RETAIL_LIMITS.totalResponseBytes, 'Florida retail fixture total-response budget exceeded.');
      const name = `response-${String(fixtureRequests).padStart(3, '0')}-${route.name}`;
      const artifact = await persist(name, raw);
      return {raw, artifact, request: {completedAt: new Date().toISOString(), transport: 'injected-fixture', providerRequestPerformed: false}};
    };

    const replay = await replayFlRetailSequence(get, {includePoints, runId, signal, checkpoint: async () => signal?.throwIfAborted()});
    await stage('acquire', {fixtureRequests, totalResponseBytes, nativeRequestsPerformed: 0});
    await stage('validate', {sourceInventoryConservationVerified: replay.result.sourceInventoryConservationVerified, sourceRows: replay.result.sourceRows});
    const selectedArtifact = await persist('selected.synthetic.jsonl', replay.selected);
    await stage('normalize', {selectedArtifact, normalizedCanonicalEntities: 0, unreconciledSourceRows: replay.result.selectedRows});
    await stage('reconcile', {identityReconciled: false, uniqueBusinessCount: null});
    await stage('quality-gate', {status: 'BLOCKED', classificationMappingVerified: false, currentOperationsVerified: false, publicExportAuthorized: false});
    await stage('publish', {publicationKind: 'offline-engineering-evidence-only', datasetPublished: false, currentPointerUpdated: false});
    await stage('finalize', {nativeAcquisitionAuthorized: false, providerRecordAcquisitionPerformed: false});
    signal?.throwIfAborted();
    if (faultAt === 'before-manifest') throw new Error('Injected pre-manifest fault.');

    const manifest = {
      schemaVersion: FL_RETAIL_OFFLINE_VERSION,
      connectorVersion: FL_RETAIL_VERSION,
      policyProfile: FL_RETAIL_OFFLINE_POLICY,
      policySha256,
      runId,
      executionMode: 'injected-fixture',
      status: 'OFFLINE_EVIDENCE_VERIFIED_ACQUISITION_BLOCKED',
      startedAt,
      finishedAt: new Date().toISOString(),
      limits: {...FL_RETAIL_LIMITS, nativeRequests: 0, retries: 0},
      usage: {fixtureRequests, totalResponseBytes, selectedBytes: replay.selected.length, nativeRequests: 0},
      result: replay.result,
      claims: {providerRecordsAcquired: false, nativeTransportVerified: false, currentOperationsVerified: false, identityReconciled: false, publicExportAuthorized: false, productionDispatchRegistered: false},
      artifacts,
      manifestPublishedLast: true
    };
    const manifestArtifact = await writeNew(path.join(directory, 'manifest.json'), json(manifest));
    manifestPublished = true;
    const verified = await verifyFlRetailOfflineFixture(path.join(directory, 'manifest.json'), manifestArtifact.sha256);
    return {...verified, directory, manifestPath: path.join(directory, 'manifest.json')};
  } catch (error) {
    if (!manifestPublished) {
      const cancelled = signal?.aborted === true || error?.name === 'AbortError';
      try {
        await writeNew(path.join(directory, 'failure.json'), json({schemaVersion: FL_RETAIL_OFFLINE_VERSION, runId, executionMode: 'injected-fixture', status: cancelled ? 'CANCELLED' : 'FAILED', failedAt: new Date().toISOString(), fixtureRequests, totalResponseBytes, nativeRequestsPerformed: 0, manifestPublished: false, error: publicError(error, cancelled)}));
      } catch {/* Preserve the original failure when failure evidence cannot be committed. */}
    }
    throw error;
  }
}

export async function verifyFlRetailOfflineFixture(manifestPath, expectedSha256) {
  check(typeof manifestPath === 'string' && typeof expectedSha256 === 'string' && /^[a-f0-9]{64}$/.test(expectedSha256));
  const resolved = assertInsideApp(manifestPath);
  check(path.basename(resolved) === 'manifest.json');
  const directory = path.dirname(resolved);
  check(UUID.test(path.basename(directory)));
  await canonical(directory);
  const manifestStat = await lstat(resolved);
  check(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.nlink === 1);
  const manifestBytes = await readFile(resolved);
  check(sha256(manifestBytes) === expectedSha256);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  check(manifest.schemaVersion === FL_RETAIL_OFFLINE_VERSION && manifest.executionMode === 'injected-fixture');
  check(manifest.status === 'OFFLINE_EVIDENCE_VERIFIED_ACQUISITION_BLOCKED' && manifest.manifestPublishedLast === true);
  check(manifest.claims?.providerRecordsAcquired === false && manifest.claims?.nativeTransportVerified === false);
  check(manifest.claims?.publicExportAuthorized === false && manifest.claims?.productionDispatchRegistered === false);
  check(manifest.usage?.nativeRequests === 0 && manifest.usage.fixtureRequests <= FL_RETAIL_LIMITS.requests);
  check(manifest.usage.totalResponseBytes <= FL_RETAIL_LIMITS.totalResponseBytes && manifest.usage.selectedBytes <= FL_RETAIL_LIMITS.selectedBytes);
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0);
  const expectedFiles = new Set(['manifest.json']);
  for (const artifact of manifest.artifacts) {
    check(artifact && typeof artifact.name === 'string' && path.basename(artifact.name) === artifact.name && !expectedFiles.has(artifact.name));
    expectedFiles.add(artifact.name);
    const bytes = await readFile(path.join(directory, artifact.name));
    check(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256);
  }
  const entries = await readdir(directory, {withFileTypes: true});
  check(entries.every(entry => entry.isFile() && !entry.isSymbolicLink()));
  const actualFiles = new Set(entries.map(entry => entry.name));
  check(actualFiles.size === expectedFiles.size && [...actualFiles].every(name => expectedFiles.has(name)));
  const policy = JSON.parse((await readFile(path.join(directory, 'policy.json'))).toString('utf8'));
  check(policy.status === 'blocked-offline-fixture-only' && policy.native_acquisition_authorized === false);
  const canonicalPolicy = await readFile(POLICY_PATH);
  check(manifest.policySha256 === sha256(canonicalPolicy) && manifest.policySha256 === sha256(await readFile(path.join(directory, 'policy.json'))));
  const stages = manifest.artifacts.filter(artifact => artifact.name.startsWith('stage-')).map(artifact => artifact.name.replace(/^stage-\d+-/, '').replace(/\.json$/, ''));
  check(JSON.stringify(stages) === JSON.stringify(STAGES));
  return {runId: manifest.runId, manifestSha256: expectedSha256, directory: relativeToApp(directory), status: manifest.status, usage: manifest.usage};
}
