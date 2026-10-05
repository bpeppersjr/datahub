import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, lstat, realpath } from 'node:fs/promises';
import { executeProductionStage, revalidateProductionReconciliationPlan } from './production-reconciliation.mjs';
import { writeReconciliationReceipt } from './reconciliation-receipt.mjs';

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const HASH = /^[a-f0-9]{64}$/;
const STAGE_ROSTER = Object.freeze([
  ['registry-build', 'scripts/build-business-registry.mjs'], ['registry-verify', 'scripts/verify-business-registry.mjs'],
  ['resolution-build', 'scripts/build-business-entity-resolution.mjs'], ['resolution-verify', 'scripts/verify-business-entity-resolution.mjs'],
  ['benchmark-build', 'scripts/build-entity-resolution-benchmark.mjs'], ['benchmark-verify', 'scripts/verify-entity-resolution-benchmark.mjs'],
  ['coverage-build', 'scripts/build-national-business-coverage-views.mjs'], ['coverage-verify', 'scripts/verify-national-business-coverage-views.mjs']
]);
const OUTPUTS = new Map([
  ['data/business-registry', 'business-registry'],
  ['data/business-entity-resolution', 'business-entity-resolution'],
  ['data/business-entity-resolution-benchmark', 'business-entity-resolution-benchmark'],
  ['data/business-coverage-views', 'business-coverage-views']
]);
const STAGE_OUTPUT = Object.freeze({
  'registry-build': 'business-registry', 'registry-verify': 'business-registry',
  'resolution-build': 'business-entity-resolution', 'resolution-verify': 'business-entity-resolution',
  'benchmark-build': 'business-entity-resolution-benchmark', 'benchmark-verify': 'business-entity-resolution-benchmark',
  'coverage-build': 'business-coverage-views', 'coverage-verify': 'business-coverage-views'
});
const MAX_LOG_BYTES = 64 * 1024 * 1024;

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = value => value.replaceAll('\\', '/');

async function safeExisting(root, relative, { file = true } = {}) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('Unsafe candidate path.');
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new Error('Candidate path escapes the repository.');
  const relativeParts = path.relative(root, absolute).split(path.sep).filter(Boolean);
  let cursor = root;
  for (const part of relativeParts) {
    cursor = path.join(cursor, part);
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink()) throw new Error('Symbolic links are not accepted in governed candidate paths.');
  }
  const stat = await lstat(absolute);
  if (file && (!stat.isFile() || stat.nlink !== 1)) throw new Error('Governed candidate input must be a singly linked regular file.');
  if (!file && !stat.isDirectory()) throw new Error('Governed candidate path must be a directory.');
  return absolute;
}

export function validateProductionCandidateEnvelope(plan, fileBytes, { confirmationSha256, fileSha256 } = {}) {
  if (!HASH.test(confirmationSha256 ?? '') || !HASH.test(fileSha256 ?? '') || !plan || plan.planSha256 !== confirmationSha256 || sha(fileBytes) !== fileSha256) throw new Error('Exact production plan confirmation or file SHA-256 mismatch.');
  if (plan.mode !== 'production' || !ID.test(plan.runId ?? '') || plan.stages?.length !== STAGE_ROSTER.length) throw new Error('Production plan envelope is invalid.');
  for (let index = 0; index < STAGE_ROSTER.length; index++) {
    const [id, script] = STAGE_ROSTER[index];
    if (plan.stages[index]?.id !== id || plan.stages[index]?.script !== script || !Array.isArray(plan.stages[index]?.args)) throw new Error('Canonical eight-stage production roster changed.');
  }
  return true;
}

export function candidateStages(plan, candidateRunRoot) {
  const absoluteRoot = path.resolve(candidateRunRoot);
  const replacements = new Map([...OUTPUTS].flatMap(([source, leaf]) => [
    [source, slash(path.join(absoluteRoot, 'outputs', leaf))],
    [`${source}/current.json`, slash(path.join(absoluteRoot, 'outputs', leaf, 'current.json'))]
  ]));
  return plan.stages.map(stage => ({ ...stage, args: stage.args.map(arg => replacements.get(slash(arg)) ?? arg) }));
}

async function snapshotPointers(root, plan) {
  const result = {};
  for (const pin of Object.values(plan.previousOutputs)) {
    const absolute = await safeExisting(root, pin.path);
    const bytes = await readFile(absolute);
    if (sha(bytes) !== pin.sha256) throw new Error(`Production pointer pin drift: ${pin.id}.`);
    result[pin.path] = { absolute, bytes, sha256: sha(bytes) };
  }
  return result;
}
async function assertPointers(snapshot) {
  for (const [name, pin] of Object.entries(snapshot)) {
    const stat = await lstat(pin.absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`Production pointer ownership changed: ${name}.`);
    const after = await readFile(pin.absolute);
    if (!after.equals(pin.bytes)) throw new Error(`Production pointer bytes changed during candidate rehearsal: ${name}.`);
  }
}

async function fileEvidence(file, label, boundary = path.dirname(file)) {
  const relative = path.relative(boundary, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes its governed boundary.`);
  let cursor = boundary;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    const component = await lstat(cursor);
    if (component.isSymbolicLink()) throw new Error(`${label} contains a symbolic link.`);
  }
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_LOG_BYTES) throw new Error(`${label} is not a bounded governed file.`);
  const bytes = await readFile(file);
  return { bytes: stat.size, sha256: sha(bytes) };
}
async function outputEvidence(runRoot, stageId) {
  const leaf = STAGE_OUTPUT[stageId];
  if (!leaf) throw new Error('Unknown canonical production stage output.');
  const outputRoot = path.join(runRoot, 'outputs', leaf), pointerPath = path.join(outputRoot, 'current.json');
  const pointerFile = await fileEvidence(pointerPath, 'Candidate output pointer', runRoot);
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
  if (typeof pointer.release_id !== 'string' || typeof pointer.dataset_id !== 'string' || typeof pointer.manifest !== 'string' || path.isAbsolute(pointer.manifest)) throw new Error('Candidate output pointer metadata is invalid.');
  const manifestPath = path.resolve(outputRoot, pointer.manifest);
  if (!manifestPath.startsWith(`${outputRoot}${path.sep}`)) throw new Error('Candidate output manifest escapes its isolated output.');
  const manifestFile = await fileEvidence(manifestPath, 'Candidate output manifest', runRoot);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.release_id !== pointer.release_id || manifest.dataset_id !== pointer.dataset_id || manifest.production_enrollment === true) throw new Error('Candidate output release metadata is invalid or claims production enrollment.');
  return { dataset_id: pointer.dataset_id, release_id: pointer.release_id, pointer_sha256: pointerFile.sha256, manifest_sha256: manifestFile.sha256 };
}

async function rejectPreexistingRun(runRoot) {
  try { await mkdir(runRoot, { recursive: false }); return; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let status = 'INCOMPLETE';
    try {
      const file = await fileEvidence(path.join(runRoot, 'receipt.json'), 'Existing candidate receipt', runRoot);
      if (file.bytes > 1024 * 1024) throw new Error('Receipt too large.');
      const prior = JSON.parse(await readFile(path.join(runRoot, 'receipt.json'), 'utf8'));
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(prior?.status)) status = prior.status;
    } catch { /* fail closed without exposing content */ }
    throw new Error(`Candidate run ID already exists (${status}); choose a new immutable run ID.`);
  }
}

export async function runProductionCandidateReconciliation({ root, planPath, candidateRunId, confirmationSha256, planFileSha256, signal, validator = revalidateProductionReconciliationPlan, executor = executeProductionStage, pointerSnapshotter = snapshotPointers, now = () => new Date().toISOString() } = {}) {
  root = await realpath(path.resolve(root));
  if (!ID.test(candidateRunId ?? '')) throw new Error('Invalid candidate rehearsal run ID.');
  const absolutePlanPath = await safeExisting(root, planPath), planBytes = await readFile(absolutePlanPath), plan = JSON.parse(planBytes);
  if (candidateRunId === plan.runId) throw new Error('Candidate run ID must differ from the production plan run ID.');
  validateProductionCandidateEnvelope(plan, planBytes, { confirmationSha256, fileSha256: planFileSha256 });
  await validator(plan, { root, expectedPlanSha256: confirmationSha256 });
  const pointers = await pointerSnapshotter(root, plan);
  const parentRelative = 'data/reconciliations/production-candidate-runs';
  const parent = path.resolve(root, parentRelative);
  await mkdir(parent, { recursive: true });
  await safeExisting(root, parentRelative, { file: false });
  const runRoot = path.join(parent, candidateRunId);
  await rejectPreexistingRun(runRoot);
  const stages = candidateStages(plan, runRoot), receiptPath = path.join(runRoot, 'receipt.json');
  const receipt = { schema_version: 2, mode: 'production-candidate-rehearsal', production_enrollment: false, network_requests: 0, source_acquisition_stages: 0, candidate_run_id: candidateRunId, plan_run_id: plan.runId, plan_path: slash(path.relative(root, absolutePlanPath)), plan_confirmation_sha256: confirmationSha256, plan_file_sha256: planFileSha256, output_root: slash(path.relative(root, runRoot)), status: 'RUNNING', started_at: now(), completed_at: null, stages: [], production_pointers: Object.fromEntries(Object.entries(pointers).map(([key, value]) => [key, { before_sha256: value.sha256, unchanged: null }])) };
  let failure;
  try {
    await writeReconciliationReceipt(receiptPath, receipt);
    for (const stage of stages) {
      if (signal?.aborted) { receipt.status = 'CANCELLED'; await writeReconciliationReceipt(receiptPath, receipt); break; }
      const logPath = path.join(runRoot, `${String(receipt.stages.length + 1).padStart(2, '0')}-${stage.id}.log`);
      const stageReceipt = { id: stage.id, status: 'RUNNING', started_at: now(), completed_at: null, pid: null, exit_code: null, log: null, output_release: null };
      receipt.stages.push(stageReceipt); await writeReconciliationReceipt(receiptPath, receipt);
      const result = await executor(stage, { cwd: root, logPath, memoryPolicy: plan.memoryPolicy, onSpawn: async pid => { stageReceipt.pid = Number.isSafeInteger(pid) && pid > 0 ? pid : null; await writeReconciliationReceipt(receiptPath, receipt); } });
      await assertPointers(pointers);
      stageReceipt.completed_at = now(); stageReceipt.exit_code = result.exitCode; stageReceipt.log = await fileEvidence(logPath, 'Candidate stage log', runRoot);
      if (result.exitCode === 0) stageReceipt.output_release = await outputEvidence(runRoot, stage.id);
      stageReceipt.status = result.exitCode === 0 ? 'SUCCEEDED' : 'FAILED'; await writeReconciliationReceipt(receiptPath, receipt);
      if (result.exitCode !== 0) throw new Error(`Candidate rehearsal stage failed: ${stage.id}.`);
      if (signal?.aborted) { receipt.status = 'CANCELLED'; await writeReconciliationReceipt(receiptPath, receipt); break; }
    }
    if (receipt.status === 'RUNNING') receipt.status = 'SUCCEEDED';
  } catch (error) {
    const active = receipt.stages.at(-1); if (active?.status === 'RUNNING') { active.status = 'FAILED'; active.completed_at = now(); }
    receipt.status = 'FAILED'; receipt.failure = { code: 'candidate_rehearsal_failed', stage_id: active?.id ?? null }; failure = error;
  }
  finally {
    try { await assertPointers(pointers); for (const value of Object.values(receipt.production_pointers)) value.unchanged = true; }
    catch (error) { for (const value of Object.values(receipt.production_pointers)) value.unchanged = false; receipt.status = 'FAILED'; failure ??= error; }
    receipt.completed_at = now();
    await writeReconciliationReceipt(receiptPath, receipt);
  }
  if (failure) throw failure;
  return receipt;
}
