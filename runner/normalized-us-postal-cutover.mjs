import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import process from "node:process";

import {
  DEFAULT_NORMALIZED_US_POSTAL_MIGRATION_DEFINITION,
  NORMALIZED_US_POSTAL_MIGRATION_ID,
  inspectNormalizedUsPostalMigration,
} from "./normalized-us-postal-migration.mjs";
import { APP_ROOT } from "./paths.mjs";

export const NORMALIZED_US_POSTAL_CUTOVER_SCHEMA_VERSION = 1;
export const DEFAULT_NORMALIZED_US_POSTAL_CUTOVER_ROOT = "data/migrations/normalized-us-postal-fields-v1";
const LOCK_FILENAME = "cutover.lock";
const TERMINAL_STATUSES = new Set(["COMMITTED", "ROLLED_BACK"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256(JSON.stringify(value));
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolveInside(root, candidate, label = "Path") {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the datahub root: ${candidate}`);
  }
  return resolved;
}

async function resolveExistingInside(root, candidate, label = "Path") {
  const resolved = resolveInside(root, candidate, label);
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(resolved)]);
  const relative = path.relative(realRoot, realCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} crosses a link or junction outside the datahub root: ${candidate}`);
  }
  return resolved;
}

function normalizedRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\")) {
    throw new Error(`${label} must be a non-empty, forward-slash, root-relative path.`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized !== value) {
    throw new Error(`${label} is not a normalized root-relative path.`);
  }
  return normalized;
}

function relativeToRoot(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate)).replaceAll("\\", "/");
  return normalizedRelativePath(relative, "Cutover path");
}

async function readJsonDocument(filePath, label) {
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    throw new Error(`${label} could not be read at ${filePath}: ${error.message}`);
  }
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
  } catch (error) {
    throw new Error(`${label} is not valid JSON at ${filePath}: ${error.message}`);
  }
}

async function assertRegularFileWithoutLink(root, candidate, label) {
  const resolved = await resolveExistingInside(root, candidate, label);
  const details = await lstat(resolved);
  if (details.isSymbolicLink() || !details.isFile()) throw new Error(`${label} must be a regular file, not a link.`);
  return resolved;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function listReleaseFiles(root, directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release contains a forbidden link: ${relative}`);
    if (entry.isDirectory()) files.push(...await listReleaseFiles(root, absolute, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Release contains an unsupported filesystem entry: ${relative}`);
    await resolveExistingInside(root, absolute, `Release entry ${relative}`);
  }
  return files;
}

async function verifyReleaseDirectory({ appRoot, releaseDirectory, source }) {
  const resolvedDirectory = await resolveExistingInside(appRoot, releaseDirectory, `${source.source_key} release directory`);
  const details = await lstat(resolvedDirectory);
  if (details.isSymbolicLink() || !details.isDirectory()) throw new Error(`${source.source_key} release directory must be a real directory.`);
  const manifestPath = await assertRegularFileWithoutLink(appRoot, path.join(resolvedDirectory, "manifest.json"), `${source.source_key} manifest`);
  const manifestDocument = await readJsonDocument(manifestPath, `${source.source_key} manifest`);
  if (manifestDocument.sha256 !== source.candidate_manifest_sha256) {
    throw new Error(`${source.source_key} manifest changed after the cutover plan was prepared.`);
  }
  const manifest = manifestDocument.value;
  if (manifest.dataset_id !== source.dataset_id || manifest.release_id !== source.candidate_release_id || manifest.status !== "published") {
    throw new Error(`${source.source_key} manifest identity or publication status is invalid.`);
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error(`${source.source_key} manifest has no artifacts to verify.`);
  }
  const expectedPaths = new Set(["manifest.json"]);
  const observations = [];
  for (const artifact of manifest.artifacts) {
    const artifactPath = normalizedRelativePath(artifact.path, `${source.source_key} artifact path`);
    if (expectedPaths.has(artifactPath)) throw new Error(`${source.source_key} manifest repeats artifact ${artifactPath}.`);
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")) {
      throw new Error(`${source.source_key} artifact metadata is invalid for ${artifactPath}.`);
    }
    expectedPaths.add(artifactPath);
    const absolute = await assertRegularFileWithoutLink(appRoot, path.join(resolvedDirectory, artifactPath), `${source.source_key} artifact ${artifactPath}`);
    const artifactStat = await stat(absolute);
    if (artifactStat.size !== artifact.bytes) throw new Error(`${source.source_key} artifact byte count differs for ${artifactPath}.`);
    const artifactSha256 = await hashFile(absolute);
    if (artifactSha256 !== artifact.sha256) throw new Error(`${source.source_key} artifact SHA-256 differs for ${artifactPath}.`);
    observations.push({ path: artifactPath, bytes: artifactStat.size, sha256: artifactSha256 });
  }
  const actualPaths = await listReleaseFiles(appRoot, resolvedDirectory);
  const expected = [...expectedPaths].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expected)) {
    throw new Error(`${source.source_key} release file set differs from its manifest.`);
  }
  observations.sort((left, right) => left.path.localeCompare(right.path));
  return {
    artifact_count: observations.length,
    artifact_bytes: observations.reduce((sum, item) => sum + item.bytes, 0),
    artifact_set_sha256: sha256Json({ manifest_sha256: manifestDocument.sha256, artifacts: observations }),
  };
}

function planCore(plan) {
  return {
    schema_version: plan.schema_version,
    migration_id: plan.migration_id,
    contract_version: plan.contract_version,
    definition_sha256: plan.definition_sha256,
    cutover_root: plan.cutover_root,
    production_plan_sha256: plan.production_plan_sha256,
    candidate_plan_sha256: plan.candidate_plan_sha256,
    sources: plan.sources,
  };
}

function validateHash(value, label) {
  if (!/^[a-f0-9]{64}$/.test(value ?? "")) throw new Error(`${label} must be a lowercase SHA-256.`);
}

function validateCutoverPlan(plan) {
  if (plan?.schema_version !== NORMALIZED_US_POSTAL_CUTOVER_SCHEMA_VERSION) throw new Error("Unsupported postal cutover plan schema version.");
  if (plan.migration_id !== NORMALIZED_US_POSTAL_MIGRATION_ID) throw new Error("Postal cutover plan has the wrong migration ID.");
  normalizedRelativePath(plan.cutover_root, "Cutover root");
  for (const [value, label] of [
    [plan.definition_sha256, "Definition SHA-256"],
    [plan.production_plan_sha256, "Production plan SHA-256"],
    [plan.candidate_plan_sha256, "Candidate plan SHA-256"],
    [plan.plan_sha256, "Cutover plan SHA-256"],
  ]) validateHash(value, label);
  if (!Array.isArray(plan.sources) || plan.sources.length === 0) throw new Error("Postal cutover plan must contain sources.");
  const keys = new Set();
  const productionPointers = new Set();
  for (const source of plan.sources) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(source.source_key ?? "") || keys.has(source.source_key)) {
      throw new Error("Postal cutover plan contains an invalid or duplicate source key.");
    }
    keys.add(source.source_key);
    if (typeof source.dataset_id !== "string" || source.dataset_id.length === 0) throw new Error(`${source.source_key} has no dataset ID.`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(source.candidate_release_id ?? "")) throw new Error(`${source.source_key} has an unsafe candidate release ID.`);
    for (const [property, label] of [
      ["production_pointer", "production pointer"],
      ["candidate_pointer", "candidate pointer"],
      ["candidate_manifest", "candidate manifest"],
      ["candidate_release_directory", "candidate release directory"],
      ["production_release_directory", "production release directory"],
    ]) normalizedRelativePath(source[property], `${source.source_key} ${label}`);
    if (productionPointers.has(source.production_pointer)) throw new Error(`Duplicate production pointer ${source.production_pointer}.`);
    productionPointers.add(source.production_pointer);
    for (const [property, label] of [
      ["production_pointer_sha256", "production pointer SHA-256"],
      ["candidate_pointer_sha256", "candidate pointer SHA-256"],
      ["candidate_manifest_sha256", "candidate manifest SHA-256"],
      ["artifact_set_sha256", "artifact-set SHA-256"],
    ]) validateHash(source[property], `${source.source_key} ${label}`);
    if (!Number.isSafeInteger(source.artifact_count) || source.artifact_count < 1 || !Number.isSafeInteger(source.artifact_bytes) || source.artifact_bytes < 0) {
      throw new Error(`${source.source_key} artifact receipt is invalid.`);
    }
  }
  const calculated = sha256Json(planCore(plan));
  if (calculated !== plan.plan_sha256) throw new Error("Postal cutover plan SHA-256 does not match its contents.");
  return plan;
}

async function currentReports({ appRoot, definition, definitionPath, environment }) {
  return Promise.all([
    inspectNormalizedUsPostalMigration({ appRoot, definition, definitionPath, environment }),
    inspectNormalizedUsPostalMigration({ appRoot, definition, definitionPath, environment, useCandidatePointers: true }),
  ]);
}

function assertEveryCandidateReady(candidateReport) {
  if (!candidateReport.ready_for_registry_2_10 || candidateReport.counts.candidate_pointers_used !== candidateReport.counts.total) {
    const missing = candidateReport.sources.filter((source) => source.status !== "ready" || source.pointer_scope !== "candidate").map((source) => source.source_key);
    const error = new Error(`Postal cutover requires every source to use a ready isolated candidate; pending: ${missing.join(", ") || "unknown"}.`);
    error.code = "ERR_POSTAL_CUTOVER_CANDIDATES_NOT_READY";
    error.report = candidateReport;
    throw error;
  }
}

function assertPlanBindsReports({ appRoot, plan, productionReport, candidateReport }) {
  if (plan.cutover_root !== candidateReport.candidate_root || plan.sources.length !== candidateReport.sources.length || plan.sources.length !== productionReport.sources.length) {
    throw new Error("Cutover plan source set does not match the live migration definition.");
  }
  for (const [index, planned] of plan.sources.entries()) {
    const production = productionReport.sources[index];
    const candidate = candidateReport.sources[index];
    const candidateReleaseDirectory = path.dirname(candidate.manifest);
    const expected = {
      source_key: candidate.source_key,
      dataset_id: candidate.dataset_id,
      production_pointer: relativeToRoot(appRoot, production.pointer),
      production_pointer_sha256: production.pointer_sha256,
      production_release_id: production.current_release_id,
      candidate_pointer: relativeToRoot(appRoot, candidate.pointer),
      candidate_pointer_sha256: candidate.pointer_sha256,
      candidate_release_id: candidate.current_release_id,
      candidate_manifest: relativeToRoot(appRoot, candidate.manifest),
      candidate_manifest_sha256: candidate.manifest_sha256,
      candidate_release_directory: relativeToRoot(appRoot, candidateReleaseDirectory),
      production_release_directory: relativeToRoot(appRoot, path.join(path.dirname(production.pointer), "releases", candidate.current_release_id)),
    };
    for (const [property, value] of Object.entries(expected)) {
      if (planned[property] !== value) throw new Error(`${planned.source_key} cutover ${property} does not match the live migration report.`);
    }
    if (candidate.pointer_scope !== "candidate") throw new Error(`${planned.source_key} is not bound to an isolated candidate pointer.`);
  }
}

export async function prepareNormalizedUsPostalCutover({
  appRoot = APP_ROOT,
  definition = null,
  definitionPath = DEFAULT_NORMALIZED_US_POSTAL_MIGRATION_DEFINITION,
  environment = process.env,
  onProgress = null,
} = {}) {
  const resolvedRoot = path.resolve(appRoot);
  const [productionReport, candidateReport] = await currentReports({ appRoot: resolvedRoot, definition, definitionPath, environment });
  assertEveryCandidateReady(candidateReport);
  const productionByKey = new Map(productionReport.sources.map((source) => [source.source_key, source]));
  const sources = [];
  for (const [index, candidate] of candidateReport.sources.entries()) {
    const production = productionByKey.get(candidate.source_key);
    if (!production?.pointer_sha256 || !candidate.pointer_sha256 || !candidate.manifest_sha256) {
      throw new Error(`${candidate.source_key} does not expose all hashes required for cutover.`);
    }
    await assertRegularFileWithoutLink(resolvedRoot, candidate.pointer, `${candidate.source_key} candidate pointer`);
    await assertRegularFileWithoutLink(resolvedRoot, production.pointer, `${candidate.source_key} production pointer`);
    const pointerDocument = await readJsonDocument(candidate.pointer, `${candidate.source_key} candidate pointer`);
    const expectedManifest = `releases/${candidate.current_release_id}/manifest.json`;
    if (pointerDocument.value.manifest !== expectedManifest) throw new Error(`${candidate.source_key} candidate pointer does not use the canonical release manifest path.`);
    const candidateReleaseDirectory = path.dirname(candidate.manifest);
    if (path.basename(candidateReleaseDirectory) !== candidate.current_release_id || path.basename(candidate.manifest) !== "manifest.json") {
      throw new Error(`${candidate.source_key} candidate release layout is not canonical.`);
    }
    const source = {
      source_key: candidate.source_key,
      dataset_id: candidate.dataset_id,
      production_pointer: relativeToRoot(resolvedRoot, production.pointer),
      production_pointer_sha256: production.pointer_sha256,
      production_release_id: production.current_release_id,
      candidate_pointer: relativeToRoot(resolvedRoot, candidate.pointer),
      candidate_pointer_sha256: candidate.pointer_sha256,
      candidate_release_id: candidate.current_release_id,
      candidate_manifest: relativeToRoot(resolvedRoot, candidate.manifest),
      candidate_manifest_sha256: candidate.manifest_sha256,
      candidate_release_directory: relativeToRoot(resolvedRoot, candidateReleaseDirectory),
      production_release_directory: relativeToRoot(resolvedRoot, path.join(path.dirname(production.pointer), "releases", candidate.current_release_id)),
      artifact_count: 0,
      artifact_bytes: 0,
      artifact_set_sha256: "0".repeat(64),
    };
    onProgress?.(`Verifying candidate ${index + 1}/${candidateReport.sources.length}: ${candidate.source_key}`);
    Object.assign(source, await verifyReleaseDirectory({ appRoot: resolvedRoot, releaseDirectory: source.candidate_release_directory, source }));
    sources.push(source);
  }
  const plan = {
    schema_version: NORMALIZED_US_POSTAL_CUTOVER_SCHEMA_VERSION,
    migration_id: candidateReport.migration_id,
    contract_version: candidateReport.contract_version,
    definition_sha256: candidateReport.definition_sha256,
    cutover_root: candidateReport.candidate_root ?? DEFAULT_NORMALIZED_US_POSTAL_CUTOVER_ROOT,
    production_plan_sha256: productionReport.plan_sha256,
    candidate_plan_sha256: candidateReport.plan_sha256,
    sources,
    prepared_at: new Date().toISOString(),
  };
  plan.plan_sha256 = sha256Json(planCore(plan));
  return validateCutoverPlan(plan);
}

export async function writeNormalizedUsPostalCutoverPlan({ appRoot = APP_ROOT, plan, destination }) {
  validateCutoverPlan(plan);
  const resolvedRoot = path.resolve(appRoot);
  const resolved = resolveInside(resolvedRoot, destination, "Cutover plan destination");
  await mkdir(path.dirname(resolved), { recursive: true });
  await resolveExistingInside(resolvedRoot, path.dirname(resolved), "Cutover plan parent");
  const handle = await open(resolved, "wx");
  try {
    await handle.writeFile(json(plan));
    await handle.sync();
  } finally {
    await handle.close();
  }
  return resolved;
}

async function atomicReplace(filePath, bytes, tag) {
  const temporary = `${filePath}.${tag}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function persistState(runRoot, state, status = state.status) {
  const next = {
    ...state,
    status,
    state_revision: (state.state_revision ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  await atomicReplace(path.join(runRoot, "state.json"), Buffer.from(json(next)), "state");
  return next;
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

async function acquireLock({ appRoot, cutoverRoot, cutoverId, operation, reclaimDeadOwner = false }) {
  const root = resolveInside(appRoot, cutoverRoot, "Cutover root");
  await mkdir(root, { recursive: true });
  await resolveExistingInside(appRoot, root, "Cutover root");
  const lockPath = path.join(root, LOCK_FILENAME);
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      const lock = {
        schema_version: 1,
        cutover_id: cutoverId,
        pid: process.pid,
        hostname: hostname(),
        token,
        operation,
        acquired_at: new Date().toISOString(),
      };
      await handle.writeFile(json(lock));
      await handle.sync();
      return { handle, lock, lockPath };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = await readJsonDocument(lockPath, "Postal cutover lock");
      const owner = existing.value;
      if (!reclaimDeadOwner || owner.cutover_id !== cutoverId || owner.hostname !== hostname() || processIsAlive(owner.pid)) {
        const locked = new Error(`Postal cutover lock is held by cutover ${owner.cutover_id ?? "unknown"} on PID ${owner.pid ?? "unknown"}.`);
        locked.code = "ERR_POSTAL_CUTOVER_LOCKED";
        throw locked;
      }
      const unchanged = await readFile(lockPath);
      if (sha256(unchanged) !== existing.sha256) throw new Error("Postal cutover lock changed while attempting dead-owner recovery.");
      await rm(lockPath);
    }
  }
  throw new Error("Unable to acquire the postal cutover lock.");
}

async function releaseLock(lock) {
  await lock.handle.close().catch(() => undefined);
  let current;
  try {
    current = await readJsonDocument(lock.lockPath, "Postal cutover lock");
  } catch (error) {
    if (error.cause?.code === "ENOENT" || /ENOENT/.test(error.message)) return;
    throw error;
  }
  if (current.value.token !== lock.lock.token) throw new Error("Postal cutover lock ownership changed before release.");
  await rm(lock.lockPath);
}

async function readPlan({ appRoot, plan, planPath }) {
  if (plan) return validateCutoverPlan(plan);
  if (!planPath) throw new Error("A cutover plan or plan path is required.");
  const resolved = await assertRegularFileWithoutLink(appRoot, planPath, "Cutover plan");
  return validateCutoverPlan((await readJsonDocument(resolved, "Cutover plan")).value);
}

function assertExpectedPlan(plan, expectedPlanSha256) {
  validateHash(expectedPlanSha256, "Expected cutover plan SHA-256");
  if (expectedPlanSha256 !== plan.plan_sha256) throw new Error("Expected cutover plan SHA-256 does not match the supplied plan.");
}

async function assertReportsUnchanged({ appRoot, definition, definitionPath, environment, plan }) {
  const [productionReport, candidateReport] = await currentReports({ appRoot, definition, definitionPath, environment });
  assertEveryCandidateReady(candidateReport);
  if (productionReport.plan_sha256 !== plan.production_plan_sha256) throw new Error("Production inputs changed after the cutover plan was prepared.");
  if (candidateReport.plan_sha256 !== plan.candidate_plan_sha256) throw new Error("Candidate inputs changed after the cutover plan was prepared.");
  assertPlanBindsReports({ appRoot, plan, productionReport, candidateReport });
}

async function readAndCheckPointer(appRoot, relative, expectedSha256, label) {
  const resolved = await assertRegularFileWithoutLink(appRoot, relative, label);
  const bytes = await readFile(resolved);
  if (sha256(bytes) !== expectedSha256) throw new Error(`${label} changed after the cutover plan was prepared.`);
  return { resolved, bytes };
}

async function createJournal({ appRoot, plan, cutoverId }) {
  const cutoverRoot = resolveInside(appRoot, plan.cutover_root, "Cutover root");
  const cutoversRoot = path.join(cutoverRoot, "cutovers");
  await mkdir(cutoversRoot, { recursive: true });
  await resolveExistingInside(appRoot, cutoversRoot, "Cutover journal root");
  const runRoot = path.join(cutoversRoot, cutoverId);
  await mkdir(runRoot);
  await mkdir(path.join(runRoot, "backups"));
  const planHandle = await open(path.join(runRoot, "plan.json"), "wx");
  try {
    await planHandle.writeFile(json(plan));
    await planHandle.sync();
  } finally {
    await planHandle.close();
  }
  for (const source of plan.sources) {
    const production = await readAndCheckPointer(appRoot, source.production_pointer, source.production_pointer_sha256, `${source.source_key} production pointer`);
    const backup = path.join(runRoot, "backups", `${source.source_key}.current.json`);
    const handle = await open(backup, "wx");
    try {
      await handle.writeFile(production.bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  const now = new Date().toISOString();
  const state = {
    schema_version: 1,
    cutover_id: cutoverId,
    migration_id: plan.migration_id,
    plan_sha256: plan.plan_sha256,
    status: "PREPARING_RELEASES",
    state_revision: 1,
    created_at: now,
    updated_at: now,
    prepared_sources: [],
    promoted_sources: [],
  };
  const stateHandle = await open(path.join(runRoot, "state.json"), "wx");
  try {
    await stateHandle.writeFile(json(state));
    await stateHandle.sync();
  } finally {
    await stateHandle.close();
  }
  return { runRoot, state };
}

async function destinationExists(destination) {
  try {
    await access(destination);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function prepareProductionRelease({ appRoot, source, cutoverId }) {
  const candidateReceipt = await verifyReleaseDirectory({ appRoot, releaseDirectory: source.candidate_release_directory, source });
  if (candidateReceipt.artifact_set_sha256 !== source.artifact_set_sha256) throw new Error(`${source.source_key} artifact receipt changed after planning.`);
  const destination = resolveInside(appRoot, source.production_release_directory, `${source.source_key} production release directory`);
  if (await destinationExists(destination)) {
    const existing = await verifyReleaseDirectory({ appRoot, releaseDirectory: destination, source });
    if (existing.artifact_set_sha256 !== source.artifact_set_sha256) throw new Error(`${source.source_key} existing production release conflicts with the candidate.`);
    return { reused: true };
  }
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true });
  await resolveExistingInside(appRoot, parent, `${source.source_key} production releases directory`);
  const staging = path.join(parent, `.${path.basename(destination)}.cutover-${cutoverId}.staging`);
  if (await destinationExists(staging)) throw new Error(`${source.source_key} cutover staging directory already exists.`);
  try {
    await cp(resolveInside(appRoot, source.candidate_release_directory), staging, { recursive: true, force: false, errorOnExist: true });
    const copied = await verifyReleaseDirectory({ appRoot, releaseDirectory: staging, source });
    if (copied.artifact_set_sha256 !== source.artifact_set_sha256) throw new Error(`${source.source_key} copied release receipt does not match the candidate.`);
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return { reused: false };
}

async function pointerClassifications({ appRoot, plan }) {
  const classifications = [];
  for (const source of plan.sources) {
    const pointerPath = await assertRegularFileWithoutLink(appRoot, source.production_pointer, `${source.source_key} production pointer`);
    const currentSha256 = sha256(await readFile(pointerPath));
    let state = "CONFLICT";
    if (currentSha256 === source.production_pointer_sha256) state = "ORIGINAL";
    if (currentSha256 === source.candidate_pointer_sha256) state = "CANDIDATE";
    classifications.push({ source, pointerPath, currentSha256, state });
  }
  return classifications;
}

async function restorePointers({ appRoot, runRoot, plan, onProgress }) {
  const classifications = await pointerClassifications({ appRoot, plan });
  const conflicts = classifications.filter((item) => item.state === "CONFLICT");
  if (conflicts.length > 0) {
    const error = new Error(`Guarded pointer rollback refused ${conflicts.length} independently changed pointer(s): ${conflicts.map((item) => item.source.source_key).join(", ")}.`);
    error.code = "ERR_POSTAL_CUTOVER_ROLLBACK_CONFLICT";
    throw error;
  }
  const restored = [];
  for (const item of classifications.reverse()) {
    if (item.state === "ORIGINAL") continue;
    const backupPath = await assertRegularFileWithoutLink(appRoot, path.join(runRoot, "backups", `${item.source.source_key}.current.json`), `${item.source.source_key} pointer backup`);
    const backup = await readFile(backupPath);
    if (sha256(backup) !== item.source.production_pointer_sha256) throw new Error(`${item.source.source_key} pointer backup SHA-256 is invalid.`);
    onProgress?.(`Restoring production pointer: ${item.source.source_key}`);
    await atomicReplace(item.pointerPath, backup, "rollback");
    if (sha256(await readFile(item.pointerPath)) !== item.source.production_pointer_sha256) throw new Error(`${item.source.source_key} pointer rollback verification failed.`);
    restored.push(item.source.source_key);
  }
  return restored;
}

export async function executeNormalizedUsPostalCutover({
  appRoot = APP_ROOT,
  definition = null,
  definitionPath = DEFAULT_NORMALIZED_US_POSTAL_MIGRATION_DEFINITION,
  environment = process.env,
  plan = null,
  planPath = null,
  expectedPlanSha256,
  confirm = false,
  onProgress = null,
  testHooks = null,
} = {}) {
  if (confirm !== true) throw new Error("Postal cutover execution requires explicit confirmation.");
  const resolvedRoot = path.resolve(appRoot);
  const loadedPlan = await readPlan({ appRoot: resolvedRoot, plan, planPath });
  assertExpectedPlan(loadedPlan, expectedPlanSha256);
  const cutoverId = `${new Date().toISOString().replaceAll(/[-:.TZ]/g, "")}-${randomUUID()}`;
  const lock = await acquireLock({ appRoot: resolvedRoot, cutoverRoot: loadedPlan.cutover_root, cutoverId, operation: "execute" });
  let runRoot;
  let state;
  let thrown;
  try {
    await assertReportsUnchanged({ appRoot: resolvedRoot, definition, definitionPath, environment, plan: loadedPlan });
    ({ runRoot, state } = await createJournal({ appRoot: resolvedRoot, plan: loadedPlan, cutoverId }));
    for (const [index, source] of loadedPlan.sources.entries()) {
      onProgress?.(`Preparing immutable release ${index + 1}/${loadedPlan.sources.length}: ${source.source_key}`);
      await prepareProductionRelease({ appRoot: resolvedRoot, source, cutoverId });
      state = await persistState(runRoot, { ...state, prepared_sources: [...state.prepared_sources, source.source_key] });
      await testHooks?.afterReleasePrepared?.({ index, source, state });
    }
    await assertReportsUnchanged({ appRoot: resolvedRoot, definition, definitionPath, environment, plan: loadedPlan });
    for (const [index, source] of loadedPlan.sources.entries()) {
      onProgress?.(`Re-verifying prepared release ${index + 1}/${loadedPlan.sources.length}: ${source.source_key}`);
      const receipt = await verifyReleaseDirectory({ appRoot: resolvedRoot, releaseDirectory: source.production_release_directory, source });
      if (receipt.artifact_set_sha256 !== source.artifact_set_sha256) throw new Error(`${source.source_key} prepared production release changed before pointer promotion.`);
    }
    state = await persistState(runRoot, state, "PROMOTING_POINTERS");
    for (const [index, source] of loadedPlan.sources.entries()) {
      const production = await readAndCheckPointer(resolvedRoot, source.production_pointer, source.production_pointer_sha256, `${source.source_key} production pointer`);
      const candidate = await readAndCheckPointer(resolvedRoot, source.candidate_pointer, source.candidate_pointer_sha256, `${source.source_key} candidate pointer`);
      onProgress?.(`Promoting production pointer ${index + 1}/${loadedPlan.sources.length}: ${source.source_key}`);
      await atomicReplace(production.resolved, candidate.bytes, "cutover");
      if (sha256(await readFile(production.resolved)) !== source.candidate_pointer_sha256) throw new Error(`${source.source_key} promoted pointer verification failed.`);
      state = await persistState(runRoot, { ...state, promoted_sources: [...state.promoted_sources, source.source_key] });
      await testHooks?.afterPointerPromoted?.({ index, source, state });
    }
    const productionAfter = await inspectNormalizedUsPostalMigration({ appRoot: resolvedRoot, definition, definitionPath, environment });
    if (!productionAfter.ready_for_registry_2_10 || productionAfter.sources.some((source, index) => source.current_release_id !== loadedPlan.sources[index].candidate_release_id)) {
      throw new Error("Production migration verification failed after pointer promotion.");
    }
    state = await persistState(runRoot, { ...state, completed_at: new Date().toISOString() }, "COMMITTED");
    return { state, plan: loadedPlan, run_root: runRoot };
  } catch (error) {
    thrown = error;
    if (runRoot && state) {
      try {
        state = await persistState(runRoot, { ...state, failure: { message: error.message, code: error.code ?? null } }, "ROLLING_BACK");
        const restored = await restorePointers({ appRoot: resolvedRoot, runRoot, plan: loadedPlan, onProgress });
        state = await persistState(runRoot, { ...state, restored_sources: restored, completed_at: new Date().toISOString() }, "ROLLED_BACK");
        const rolledBack = new Error(`Postal cutover failed and production pointers were rolled back: ${error.message}`);
        rolledBack.code = "ERR_POSTAL_CUTOVER_ROLLED_BACK";
        rolledBack.cutover_id = cutoverId;
        rolledBack.state = state;
        thrown = rolledBack;
      } catch (rollbackError) {
        state = await persistState(runRoot, { ...state, rollback_failure: { message: rollbackError.message, code: rollbackError.code ?? null } }, "BLOCKED_ROLLBACK").catch(() => state);
        const blocked = new Error(`Postal cutover failed and guarded rollback is blocked: ${rollbackError.message}`);
        blocked.code = "ERR_POSTAL_CUTOVER_ROLLBACK_BLOCKED";
        blocked.cutover_id = cutoverId;
        blocked.state = state;
        thrown = blocked;
      }
    }
  } finally {
    try {
      await releaseLock(lock);
    } catch (lockError) {
      if (!thrown) thrown = lockError;
      else thrown.message = `${thrown.message} Lock release also failed: ${lockError.message}`;
    }
  }
  throw thrown;
}

async function loadRun({ appRoot, cutoverId }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(cutoverId ?? "")) throw new Error("Cutover ID is invalid.");
  const cutoverRoot = resolveInside(appRoot, DEFAULT_NORMALIZED_US_POSTAL_CUTOVER_ROOT, "Cutover root");
  const runRoot = await resolveExistingInside(appRoot, path.join(cutoverRoot, "cutovers", cutoverId), "Cutover run");
  const plan = validateCutoverPlan((await readJsonDocument(path.join(runRoot, "plan.json"), "Cutover run plan")).value);
  const stateDocument = await readJsonDocument(path.join(runRoot, "state.json"), "Cutover state");
  if (stateDocument.value.cutover_id !== cutoverId || stateDocument.value.plan_sha256 !== plan.plan_sha256) throw new Error("Cutover journal identity does not match its plan.");
  return { cutoverRoot, runRoot, plan, state: stateDocument.value, stateSha256: stateDocument.sha256 };
}

export async function readNormalizedUsPostalCutover({ appRoot = APP_ROOT, cutoverId } = {}) {
  const run = await loadRun({ appRoot: path.resolve(appRoot), cutoverId });
  return { ...run.state, state_sha256: run.stateSha256 };
}

export async function inspectNormalizedUsPostalCutoverControl({
  appRoot = APP_ROOT,
  cutoverRoot = DEFAULT_NORMALIZED_US_POSTAL_CUTOVER_ROOT,
} = {}) {
  const resolvedRoot = path.resolve(appRoot);
  const root = resolveInside(resolvedRoot, cutoverRoot, "Cutover root");
  const lockPath = path.join(root, LOCK_FILENAME);
  let lock = null;
  try {
    const document = await readJsonDocument(lockPath, "Postal cutover lock");
    lock = {
      readable: true,
      cutover_id: document.value.cutover_id ?? null,
      pid: Number.isInteger(document.value.pid) ? document.value.pid : null,
      hostname: document.value.hostname ?? null,
      operation: document.value.operation ?? null,
      acquired_at: document.value.acquired_at ?? null,
      owner_alive: document.value.hostname === hostname() ? processIsAlive(document.value.pid) : null,
    };
  } catch (error) {
    if (!/ENOENT/.test(error.message)) {
      lock = { readable: false, cutover_id: null, pid: null, hostname: null, operation: null, acquired_at: null, owner_alive: null };
    }
  }

  const cutoversRoot = path.join(root, "cutovers");
  const runs = [];
  try {
    for (const entry of await readdir(cutoversRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try {
        const state = await readJsonDocument(path.join(cutoversRoot, entry.name, "state.json"), "Postal cutover state");
        runs.push({
          cutover_id: state.value.cutover_id ?? entry.name,
          status: state.value.status ?? "UNKNOWN",
          plan_sha256: state.value.plan_sha256 ?? null,
          state_revision: state.value.state_revision ?? null,
          updated_at: state.value.updated_at ?? null,
        });
      } catch {
        runs.push({ cutover_id: entry.name, status: "UNREADABLE", plan_sha256: null, state_revision: null, updated_at: null });
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  runs.sort((left, right) => String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")) || right.cutover_id.localeCompare(left.cutover_id));
  return {
    lock_present: lock !== null,
    lock,
    run_count: runs.length,
    latest_run: runs[0] ?? null,
  };
}

async function rollbackRun({ appRoot, cutoverId, expectedPlanSha256, confirm, recovery, onProgress }) {
  if (confirm !== true) throw new Error(`Postal cutover ${recovery ? "recovery" : "rollback"} requires explicit confirmation.`);
  const resolvedRoot = path.resolve(appRoot);
  let run = await loadRun({ appRoot: resolvedRoot, cutoverId });
  assertExpectedPlan(run.plan, expectedPlanSha256);
  if (TERMINAL_STATUSES.has(run.state.status)) {
    if (!recovery && run.state.status === "ROLLED_BACK") return run.state;
    if (!recovery && run.state.status !== "COMMITTED") throw new Error(`Cutover ${cutoverId} cannot be rolled back from ${run.state.status}.`);
  } else if (!recovery && run.state.status !== "COMMITTED") {
    throw new Error(`Cutover ${cutoverId} is ${run.state.status}; use recovery rather than committed rollback.`);
  }
  const lock = await acquireLock({
    appRoot: resolvedRoot,
    cutoverRoot: run.plan.cutover_root,
    cutoverId,
    operation: recovery ? "recover" : "rollback",
    reclaimDeadOwner: recovery,
  });
  let thrown;
  try {
    run = await loadRun({ appRoot: resolvedRoot, cutoverId });
    assertExpectedPlan(run.plan, expectedPlanSha256);
    if (recovery && TERMINAL_STATUSES.has(run.state.status)) return run.state;
    if (!recovery && run.state.status !== "COMMITTED") throw new Error(`Cutover ${cutoverId} is no longer committed.`);
    await pointerClassifications({ appRoot: resolvedRoot, plan: run.plan }).then((items) => {
      const conflicts = items.filter((item) => item.state === "CONFLICT");
      if (conflicts.length > 0) throw new Error(`Guarded pointer rollback refused ${conflicts.length} independently changed pointer(s): ${conflicts.map((item) => item.source.source_key).join(", ")}.`);
    });
    let state = await persistState(run.runRoot, run.state, "ROLLING_BACK");
    const restored = await restorePointers({ appRoot: resolvedRoot, runRoot: run.runRoot, plan: run.plan, onProgress });
    state = await persistState(run.runRoot, { ...state, restored_sources: restored, completed_at: new Date().toISOString() }, "ROLLED_BACK");
    return state;
  } catch (error) {
    thrown = error;
    if (recovery && run?.runRoot && run?.state && !TERMINAL_STATUSES.has(run.state.status)) {
      await persistState(run.runRoot, {
        ...run.state,
        recovery_failure: { message: error.message, code: error.code ?? null },
      }, "BLOCKED_ROLLBACK").catch(() => undefined);
    }
  } finally {
    try {
      await releaseLock(lock);
    } catch (lockError) {
      if (!thrown) thrown = lockError;
      else thrown.message = `${thrown.message} Lock release also failed: ${lockError.message}`;
    }
  }
  throw thrown;
}

export async function recoverNormalizedUsPostalCutover(options = {}) {
  return rollbackRun({ ...options, recovery: true });
}

export async function rollbackNormalizedUsPostalCutover(options = {}) {
  return rollbackRun({ ...options, recovery: false });
}

export async function assertNoNormalizedUsPostalCutoverInProgress({
  appRoot = APP_ROOT,
  cutoverRoot = DEFAULT_NORMALIZED_US_POSTAL_CUTOVER_ROOT,
} = {}) {
  const lockPath = resolveInside(path.resolve(appRoot), path.join(cutoverRoot, LOCK_FILENAME), "Postal cutover lock");
  try {
    await lstat(lockPath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const error = new Error("Registry publication is blocked while a postal migration cutover lock exists. Inspect or recover the owning cutover first.");
  error.code = "ERR_POSTAL_CUTOVER_IN_PROGRESS";
  throw error;
}
