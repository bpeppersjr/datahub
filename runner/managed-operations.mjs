import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import { writeReconciliationReceipt } from "./reconciliation-receipt.mjs";
import { APP_ROOT, assertInsideApp, relativeToApp } from "./paths.mjs";
import { buildIndustryPlan, industryPlanFingerprint, loadIndustryConfig, industrySourceCatalog } from "./industry-segments.mjs";
import { verifyRetainedPlan } from './industry-retained-inputs.mjs';
import { AVAILABLE_EXPORT_FIELDS, BUSINESS_FLATFILE_CATEGORIES, parseArguments } from "../scripts/compose-flat-business-export.mjs";
import { COLLECTION_SUPERVISOR_CANCEL_GRACE_MS, EXPORT_CANCEL_GRACE_MS, COLLECTION_CANCEL_WARNING } from "./collection-cancellation.mjs";
import { assertSourcePrerequisiteAllowed, getSourcePrerequisiteGates } from "./source-acquisition-gates.mjs";
import { OVERTURE_LARGE_ACQUISITION_CONFIRMATION } from "./overture-us-places.mjs";
import { mnSelectionCanonical, mnSelectionReadJson } from "./mn-construction-retained-selection.mjs";
import { MN_CREDENTIAL_FLAT_FIELDS, MN_CREDENTIAL_FLAT_REQUIRED_FIELDS, validateMnCredentialFlatRequest, verifyMnCredentialFlatForOperation } from './mn-credential-flat-export.mjs';

const FINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN"]);
const PRIVATE_EVIDENCE = ["cohort-snapshot", "source-prerequisite", "source-acquisition", "source-normalization"];
const ME_ASC_PREREQUISITE_RESULT = Object.freeze({ sourceId: "me-asc-preflight", receiptIntegrityVerified: false, inspectionRequired: true, exportPolicy: "internal",
  collectionReady: false, acquisitionReady: false, conservationVerified: false, publicExportAuthorized: false,
  statewideCompletenessVerified: false, currentOperationsVerified: false });
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const FORMATS = ["csv", "jsonl", "both"];
const POLICIES = ["public-only", "local-review"];
const safeId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const contained = (base, target) => { const relative = path.relative(base, target); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); };
const cleanError = (error) => {
  const text = String(error?.message ?? error ?? "Operation failed.").replace(/[\r\n\t]+/g, " ");
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
};
const publicOperation = (record) => ({
  id: record.id, kind: record.kind, status: record.status, createdAt: record.createdAt,
  finishedAt: record.finishedAt ?? null, error: record.error ?? null,
  artifacts: PRIVATE_EVIDENCE.includes(record.kind) || record.kind==='credential-export'&&(record.status!=='SUCCEEDED'||record.result?.artifactIntegrityVerified!==true) ? [] : (record.artifacts ?? []).map(({ name, bytes }) => ({ name, bytes })),
  result: record.kind==='credential-export' ? publicCredentialResult(record) : ["source-acquisition", "source-normalization"].includes(record.kind) && record.status !== "SUCCEEDED"
    ? { ...(record.result ?? {}), [record.kind === "source-acquisition" ? "snapshotReady" : "normalizationReady"]: false, inspectionRequired: true } : record.result ?? {},
});
function publicCredentialResult(record){const result={...(record.result??{})};delete result.descriptor;if(['FAILED','CANCELLED','UNKNOWN'].includes(record.status)){result.artifactIntegrityVerified=false;result.inspectionRequired=true;}return result;}
async function hashFile(file,signal) { const hash = createHash("sha256"); let bytes = 0; for await (const chunk of createReadStream(file,{signal})) { signal?.throwIfAborted();bytes += chunk.length; hash.update(chunk); } return { bytes, sha256: hash.digest("hex") }; }
const atomicJson = writeReconciliationReceipt;
function processPresence(pid) {
  if (!Number.isInteger(pid) || pid < 1) return "unknown";
  try { process.kill(pid, 0); return "present"; }
  catch (error) { return error.code === "ESRCH" ? "missing" : "unknown"; }
}
function invalid(message) { return Object.assign(new Error(message), { statusCode: 400 }); }
function conflict(message) { return Object.assign(new Error(message), { code: "OPERATION_CONFLICT", statusCode: 409 }); }
function validate(action) { try { return action(); } catch (error) { error.statusCode ??= 400; throw error; } }

export function executeManagedChild({ script, args, signal, onSpawn, cancelGraceMs = EXPORT_CANCEL_GRACE_MS }) {
  if (![EXPORT_CANCEL_GRACE_MS, COLLECTION_SUPERVISOR_CANCEL_GRACE_MS].includes(cancelGraceMs)) throw new Error("Invalid managed cancellation grace period.");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: APP_ROOT, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    onSpawn?.(child.pid);
    let output = ""; let force; let forcedTerminationRequested = false;
    child.stdout.on("data", (chunk) => { if (output.length < 65_536) output += chunk.toString("utf8", 0, 65_536 - output.length); });
    child.stderr.resume();
    const cancel = () => {
      if (force || child.exitCode !== null) return;
      if (child.connected) child.send({ type: "cancel" }, () => {}); else child.kill("SIGTERM");
      force = setTimeout(() => { forcedTerminationRequested = true; child.kill("SIGKILL"); }, cancelGraceMs); force.unref();
    };
    signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel();
    child.once("error", reject);
    child.once("close", (code, childSignal) => { clearTimeout(force); signal.removeEventListener("abort", cancel); resolve({ code: code ?? 1, signal: childSignal, forcedTerminationRequested, stdout: output }); });
  });
}

export class ManagedOperations {
  constructor(options = {}) {
    this.root = assertInsideApp(path.resolve(APP_ROOT, options.root ?? "data/managed-operations"));
    this.executor = options.executor ?? executeManagedChild; this.verifyChildReceipts = !options.executor;
    this.credentialVerifier = options.credentialVerifier ?? verifyMnCredentialFlatForOperation;
    this.configLoader = options.configLoader ?? loadIndustryConfig;
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.receiptWriter = options.receiptWriter ?? atomicJson;
    this.operations = new Map(); this.running = new Map(); this.writes = new Map(); this.scheduledStarts = new Map(); this.ready = this.#load(); this.closed = false;
  }
  async #load() {
    await mkdir(this.root, { recursive: true });
    if (!contained(await realpath(APP_ROOT), await realpath(this.root))) throw new Error("Managed operation storage must remain inside datahub.");
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !safeId(entry.name)) continue;
      try {
        const record = JSON.parse(await readFile(path.join(this.root, entry.name, "receipt.json"), "utf8"));
        if (record.id !== entry.name || !["collection", "export", "credential-export", ...PRIVATE_EVIDENCE].includes(record.kind)) continue;
        if (["QUEUED", "RUNNING"].includes(record.status)) {
          const missing = processPresence(record.owner?.supervisorPid) === "missing" && processPresence(record.owner?.childPid) === "missing";
          record.status = missing ? "FAILED" : "UNKNOWN"; record.finishedAt = missing ? this.now() : null;
          record.error = missing ? "Operation was interrupted before service restart." : "Operation process ownership remains unresolved; duplicate execution is blocked.";
          if (missing) await atomicJson(path.join(this.root, entry.name, "receipt.json"), record);
        }
        this.operations.set(record.id, record);
      } catch { /* Ignore malformed history; it cannot be safely exposed. */ }
    }
  }
  async catalog() {
    await this.ready; const config = await this.configLoader();
    return { industries: Object.keys(config.industries).map((id) => ({ id })), states: [...config.states], collectionSources: industrySourceCatalog(config), sourcePrerequisites: getSourcePrerequisiteGates(),
      boundedSourceCollections: [{ sourceId: "ok-childcare-retained-73102", state: "OK", industry: "childcare", zip5: "73102",
        endpoint: "/api/data-operations/ok-childcare-collections", scope: "one-center-only-public-search", requestCount: 3,
        exportPolicy: "internal", currentOperationsVerified: false, statewideCompletenessVerified: false }],
      export: { categories: Object.keys(BUSINESS_FLATFILE_CATEGORIES), fields: [...AVAILABLE_EXPORT_FIELDS], formats: FORMATS, policyModes: POLICIES },
      credentialExport:{exportType:'mn-construction-credentials',fields:[...MN_CREDENTIAL_FLAT_FIELDS],requiredFields:[...MN_CREDENTIAL_FLAT_REQUIRED_FIELDS],formats:['csv','jsonl','both'],policyModes:['local-review-only'],recordUnit:'publisher-business-credential-row'} };
  }
  async plan(input = {}) { await this.ready; this.#only(input, ["industries", "states", "sourceIds", "retainedInputs"]); const config = await this.configLoader(); const plan = validate(() => buildIndustryPlan(config, this.#selection(input))); await verifyRetainedPlan(plan); return plan; }
  async startCollection(input = {}) {
    await this.ready; await this.#refreshUnknown(); this.#reserve();
    try { this.#only(input, ["industries", "states", "sourceIds", "retainedInputs"]); const config = await this.configLoader(); const plan = validate(() => buildIndustryPlan(config, this.#selection(input))); await verifyRetainedPlan(plan); return await this.#start("collection", { plan }); }
    catch (error) { this.reserved = false; throw error; }
  }
  async startCohortSnapshot(input = {}) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).some(key => key !== "includeRetainedSamples" || !Object.hasOwn(Object.getOwnPropertyDescriptor(input,key),"value")) || Object.hasOwn(input,"includeRetainedSamples") && input.includeRetainedSamples !== true) throw invalid("Cohort snapshot accepts only an optional true includeRetainedSamples flag.");
    if (!contained(path.join(APP_ROOT, "data"), this.root) || contained(path.join(APP_ROOT, "data/tmp"), this.root)) throw invalid("Cohort snapshot requires native operation storage.");
    await this.ready; await this.#refreshUnknown(); this.#reserve();
    try { return await this.#start("cohort-snapshot", input.includeRetainedSamples ? { includeRetainedSamples: true } : {}); }
    catch (error) { this.reserved = false; throw error; }
  }
  async startSourcePrerequisite(input = {}) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== 1
      || !Object.hasOwn(input, "sourceId") || !["ne-childcare-pdf", "ok-childcare-schema", "me-asc-preflight", "overture-httpfs-runtime", "overture-source-preflight"].includes(Object.getOwnPropertyDescriptor(input, "sourceId")?.value)) throw invalid("Source prerequisite requires only an allowed sourceId.");
    if (["ok-childcare-schema", "me-asc-preflight", "overture-httpfs-runtime", "overture-source-preflight"].includes(input.sourceId)) {
      if (!contained(path.join(APP_ROOT, "data"), this.root) || contained(path.join(APP_ROOT, "data/tmp"), this.root)) throw invalid("Schema prerequisite requires native operation storage.");
      await this.ready; await this.#refreshUnknown(); this.#reserve();
      try { return await this.#start("source-prerequisite", { sourceId: input.sourceId }); }
      catch (error) { this.reserved = false; throw error; }
    }
    assertSourcePrerequisiteAllowed(input);
    // No capture implementation is enrolled, even if a future gate changes.
    throw conflict("Source prerequisite capture is not enrolled.");
  }
  async startOkRetainedCollection(input = {}) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== 0)
      throw invalid("Oklahoma retained collection has fixed scope and accepts no caller options.");
    if (!contained(path.join(APP_ROOT, "data"), this.root) || contained(path.join(APP_ROOT, "data/tmp"), this.root))
      throw invalid("Oklahoma retained collection requires native operation storage.");
    await this.ready; await this.#refreshUnknown(); this.#reserve();
    try { return await this.#start("source-acquisition", { sourceId: "ok-childcare-retained-73102" }); }
    catch (error) { this.reserved = false; throw error; }
  }
  async startOvertureAcquisition(input) {
    const fields = ["metadataOperationId", "runtimeOperationId", "authorization"];
    if (!input || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== fields.length
      || !fields.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, "value"))) throw invalid("Overture acquisition requires explicit prerequisite IDs and authorization only.");
    const { metadataOperationId, runtimeOperationId, authorization } = input;
    if (!uuid(metadataOperationId) || !uuid(runtimeOperationId) || metadataOperationId === runtimeOperationId
      || authorization !== OVERTURE_LARGE_ACQUISITION_CONFIRMATION) throw invalid("Overture acquisition requires valid distinct prerequisite IDs and explicit large-acquisition authorization.");
    if (!contained(path.join(APP_ROOT, "data"), this.root) || contained(path.join(APP_ROOT, "data/tmp"), this.root)) throw invalid("Overture acquisition requires native operation storage.");
    await this.ready;
    let metadata, runtime;
    try {
      await mnSelectionCanonical(this.root);
      metadata = await this.#retainedOverturePrerequisite(metadataOperationId, true);
      runtime = await this.#retainedOverturePrerequisite(runtimeOperationId, false);
    } catch { throw conflict("Overture prerequisites are missing, unsafe, or not verified; acquisition is blocked."); }
    await this.#refreshUnknown(); this.#reserve();
    try { return await this.#start("source-acquisition", { sourceId: "overture-us-places", metadata, runtime, authorization }); }
    catch (error) { this.reserved = false; throw error; }
  }
  async startOvertureNormalization(input) {
    const fields = ["acquisitionOperationId", "baselineReleaseId", "baselineSha256"];
    if (!input || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== fields.length
      || !fields.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, "value"))
      || !uuid(input.acquisitionOperationId) || !safeId(input.baselineReleaseId) || input.baselineReleaseId.includes("..")
      || typeof input.baselineSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.baselineSha256)) throw invalid("Overture normalization requires an acquisition operation ID and pinned baseline release ID/hash only.");
    const selection = { ...input };
    if (this.root !== path.join(APP_ROOT, "data/managed-operations")) throw invalid("Overture normalization requires the native operation store.");
    await this.ready; await this.#refreshUnknown(); this.#reserve();
    try {
      const meter = {};
      await mnSelectionReadJson(path.join(this.root, selection.acquisitionOperationId, "receipt.json"), 1024 ** 2, undefined, meter);
      const acquisition = { operationId: selection.acquisitionOperationId, receiptSha256: meter.sha256 };
      const { readOvertureNormalizationInput } = await import("./overture-normalization-input.mjs");
      await readOvertureNormalizationInput(acquisition);
      const baseline = { manifest: path.join(APP_ROOT, "data/business-baselines/census-zbp/releases", selection.baselineReleaseId, "manifest.json"), sha256: selection.baselineSha256 };
      const { verifyOvertureZbpSelection } = await import("./overture-zbp-selection.mjs");
      const checked = await verifyOvertureZbpSelection(baseline);
      if (checked.manifest.release_id !== selection.baselineReleaseId) throw Error();
      return await this.#start("source-normalization", { sourceId: "overture-us-places", acquisition, baseline });
    } catch { this.reserved = false; throw conflict("Overture retained inputs are missing, unsafe, or unverified; normalization is blocked."); }
  }
  async #retainedOverturePrerequisite(operationId, metadata) {
    const file = path.join(this.root, operationId, "receipt.json");
    await mnSelectionCanonical(path.dirname(file));
    const record = await mnSelectionReadJson(file, 1024 * 1024);
    const sourceId = metadata ? "overture-source-preflight" : "overture-httpfs-runtime";
    const descriptor = record?.result?.prerequisite;
    if (record?.id !== operationId || record.kind !== "source-prerequisite" || record.status !== "SUCCEEDED"
      || record.details?.sourceId !== sourceId || record.result?.sourceId !== sourceId
      || record.result.receiptIntegrityVerified !== true || record.result.inspectionRequired !== false
      || record.result.acquisitionReady !== false || record.result[metadata ? "metadataReady" : "runtimeReady"] !== true
      || descriptor?.cancellation_after_publication !== false || typeof record.startedAt !== "string") throw new Error("Invalid prerequisite.");
    const output = path.join(this.root, operationId, "output");
    const read = metadata ? (await import("./overture-source-preflight.mjs")).readOvertureSourcePreflight
      : (await import("./overture-httpfs-runtime.mjs")).readOvertureHttpfsRuntime;
    await read(descriptor, { output, operationId, startedAt: record.startedAt });
    return { output, operation_id: operationId, descriptor };
  }
  // Internal scheduler entry point: manual HTTP inputs cannot supply operation IDs.
  async startScheduledCollection(input = {}, options = {}) {
    await this.ready;
    this.#only(options, ["operationId", "expectedPlanHash"]);
    const { operationId, expectedPlanHash } = options;
    if (!safeId(operationId) || operationId.length > 64) throw invalid("Scheduled operation ID is invalid (maximum 64 characters).");
    if (expectedPlanHash !== undefined && (typeof expectedPlanHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedPlanHash))) throw invalid("Expected plan hash must be a 64-character lowercase SHA256 hash.");
    this.#only(input, ["industries", "states"]);
    const selected = this.#selection(input);
    const selection = { industries: [...selected.industries].sort(), states: [...new Set(selected.states)].sort() };
    const identity = JSON.stringify({ selection, expectedPlanHash });
    const pending = this.scheduledStarts.get(operationId);
    if (pending) {
      if (pending.identity !== identity) throw conflict("Scheduled operation ID belongs to a different selection.");
      return pending.promise;
    }
    const promise = this.#dispatchScheduled(operationId, selection, expectedPlanHash);
    this.scheduledStarts.set(operationId, { identity, promise });
    try { return await promise; } finally { this.scheduledStarts.delete(operationId); }
  }
  async #dispatchScheduled(operationId, selection, expectedPlanHash) {
    await this.#refreshUnknown();
    const directory = path.join(this.root, operationId);
    let existing = this.operations.get(operationId);
    // The directory itself is an allocation tombstone, even if a crash preceded its receipt.
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw conflict("Scheduled operation directory is not a safe directory.");
      const receiptInfo = await lstat(path.join(directory, "receipt.json"));
      if (!receiptInfo.isFile() || receiptInfo.isSymbolicLink()) throw conflict("Scheduled operation receipt is not a safe file.");
      const disk = JSON.parse(await readFile(path.join(directory, "receipt.json"), "utf8"));
      if (disk.id !== operationId || disk.kind !== "collection" || disk.scheduling?.operationId !== operationId
        || JSON.stringify(disk.scheduling?.selection) !== JSON.stringify(selection)
        || (expectedPlanHash !== undefined && disk.scheduling?.expectedPlanHash !== expectedPlanHash)
        || !["QUEUED", "RUNNING", ...FINAL].includes(disk.status) || typeof disk.createdAt !== "string") {
        throw conflict("Scheduled operation ID conflicts with its existing receipt.");
      }
      if (!existing) {
        existing = disk;
        if (["QUEUED", "RUNNING"].includes(existing.status)) {
          existing.status = "UNKNOWN";
          existing.error = "Operation process ownership remains unresolved; duplicate execution is blocked.";
        }
        this.operations.set(operationId, existing);
      }
      return this.#snapshot(existing);
    } catch (error) {
      if (error.code === "OPERATION_CONFLICT") throw error;
      if (error.code !== "ENOENT" || existing) throw conflict("Scheduled operation receipt is missing or malformed; execution is blocked.");
      try { await lstat(directory); } catch (directoryError) { if (directoryError.code === "ENOENT") return this.#allocateScheduled(operationId, selection, expectedPlanHash); }
      throw conflict("Scheduled operation directory has no valid receipt; execution is blocked.");
    }
  }
  async #allocateScheduled(operationId, selection, expectedPlanHash) {
    this.#reserve();
    try {
      const config = await this.configLoader();
      const plan = validate(() => buildIndustryPlan(config, selection));
      const actualPlanHash = industryPlanFingerprint(plan);
      if (expectedPlanHash !== undefined && expectedPlanHash !== actualPlanHash) throw conflict("Scheduled industry plan changed; acquisition is blocked.");
      return await this.#start("collection", { plan }, { operationId, selection, expectedPlanHash: actualPlanHash });
    } catch (error) { this.reserved = false; throw error; }
  }
  async startExport(input = {}) {
    await this.ready; await this.#refreshUnknown(); this.#reserve();
    try {
      if(Object.hasOwn(input??{},'exportType')) {
        this.#only(input,['exportType','states','fields','format','policyMode']);
        if(input.exportType!=='mn-construction-credentials')throw invalid('Unsupported export type.');
        const selected=validate(()=>validateMnCredentialFlatRequest({selection:'config/mn-credential-registry-selection.json',policyMode:input.policyMode,format:input.format,fields:input.fields,states:input.states}));
        return await this.#start('credential-export',{fields:selected.fields,states:selected.states,format:selected.format,policyMode:selected.policyMode});
      }
      this.#only(input, ["categories", "states", "fields", "format", "policyMode", "sourceIds", "outputPrefix"]); const args = this.#exportArgs(input); const parsed = validate(() => parseArguments(args)); return await this.#start("export", { args, outputPrefix: parsed.outputPrefix ?? "export" }); }
    catch (error) { this.reserved = false; throw error; }
  }
  async #refreshUnknown() {
    for (const [id, previous] of this.operations) {
      if (previous.status !== "UNKNOWN") continue;
      try {
        const latest = JSON.parse(await readFile(path.join(this.root, id, "receipt.json"), "utf8"));
        if (latest.id !== id || latest.kind !== previous.kind) continue;
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(latest.status)) this.operations.set(id, latest);
        else if (processPresence(latest.owner?.supervisorPid) === "missing" && processPresence(latest.owner?.childPid) === "missing") {
          latest.status = "FAILED"; latest.finishedAt = this.now(); latest.error = "Operation processes stopped before a terminal receipt was published.";
          await this.#persist(latest); this.operations.set(id, latest);
        }
      } catch { /* Keep unresolved ownership protected when evidence is unavailable. */ }
    }
  }
  async #snapshot(record) {
    const snapshot = publicOperation(record);
    if (FINAL.has(snapshot.status)) await this.writes.get(record.id);
    if (record.kind === "collection") {
      snapshot.result = { ...snapshot.result, plan: { taskCount: record.details?.plan?.taskCount ?? 0 } };
      try {
        const receipt = JSON.parse(await readFile(path.join(APP_ROOT, "data", "industry-segments", "runs", record.id, "receipt.json"), "utf8"));
        if (receipt.run_id === record.id && Array.isArray(receipt.tasks)) snapshot.result.tasks = receipt.tasks.map((task) => ({
          task_id: task.task_id, source_id: task.source_id, state: task.state ?? null, status: task.status,
          ...(task.cancellation?.requested === true ? { cancellation: { requested: true, childExitSucceeded: task.cancellation.child_exit_succeeded === true, outputState: "inspection-required" } } : {}),
        }));
      } catch { /* No child receipt yet; keep the operation's recorded state. */ }
    }
    return snapshot;
  }
  async list() { await this.ready; await this.#refreshUnknown(); return Promise.all([...this.operations.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((record) => this.#snapshot(record))); }
  async get(id) { await this.ready; await this.#refreshUnknown(); return this.operations.has(id) ? this.#snapshot(this.operations.get(id)) : null; }
  async cancel(id) { await this.ready; const record = this.operations.get(id); if (!record) return null; this.running.get(id)?.abort(); return this.#snapshot(record); }
  async artifact(id, filename) {
    await this.ready; const record = this.operations.get(id); if (!record || !FINAL.has(record.status) || !safeId(filename) || filename.includes("..")) return null;
    if (PRIVATE_EVIDENCE.includes(record.kind)) return null;
    if(record.kind==='credential-export') {
      if(record.status!=='SUCCEEDED'||record.result?.artifactIntegrityVerified!==true)return null;
      try {await this.#verifyCredentialExport(record,record.result.descriptor);} catch {record.artifacts=[];record.result.artifactIntegrityVerified=false;record.result.inspectionRequired=true;await this.#persist(record);throw new Error('Credential artifact could not be independently verified.');}
    }
    const declared = (record.artifacts ?? []).find((item) => item.name === filename); if (!declared) return null;
    const file = path.resolve(this.root, id, declared.relativePath); const base = await realpath(path.resolve(this.root, id));
    if (!contained(await realpath(this.root), base) || !contained(base, await realpath(file))) return null;
    const info = await stat(file); if (!info.isFile()) return null;
    const actual = await hashFile(file); if (actual.bytes !== declared.bytes || actual.sha256 !== declared.sha256) throw new Error("Artifact integrity check failed.");
    return { path: file, name: filename, ...actual, contentType: filename.endsWith(".json") ? "application/json" : filename.endsWith(".csv") ? "text/csv" : "application/x-ndjson" };
  }
  async close() { await this.ready; this.closed = true; while (this.reserved) await new Promise((resolve) => setTimeout(resolve, 5)); for (const controller of this.running.values()) controller.abort(); await Promise.allSettled([...this.running.values()].map((controller) => controller.done)); }
  #selection(input) { return { industries: this.#strings(input.industries, "industries"), states: this.#strings(input.states, "states").map((x) => x.toUpperCase()), ...(Object.hasOwn(input,"sourceIds") ? {sourceIds: input.sourceIds === undefined ? null : input.sourceIds} : {}), ...(Object.hasOwn(input,'retainedInputs') ? {retainedInputs: input.retainedInputs === undefined ? null : input.retainedInputs} : {}) }; }
  #strings(value, name) { if (value === undefined) return []; if (!Array.isArray(value) || value.some((x) => typeof x !== "string" || !x.trim())) throw invalid(`${name} must be an array of strings.`); return [...new Set(value.map((x) => x.trim()))]; }
  #only(input, allowed) { if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid("Operation input must be an object."); for (const key of Object.keys(input)) if (!allowed.includes(key)) throw invalid(`Unsupported operation option: ${key}`); }
  #reserve() { if (this.closed) throw new Error("Managed operations service is closed."); if (this.reserved || this.running.size || [...this.operations.values()].some((item) => item.status === "UNKNOWN")) { const error = conflict("Another managed operation is already running or has unresolved ownership."); error.retryable = ![...this.operations.values()].some((item) => item.status === "UNKNOWN"); throw error; } this.reserved = true; }
  #persist(record) {
    const snapshot = JSON.parse(JSON.stringify(record));
    // A failed transition must not poison the later terminal-receipt attempt.
    const pending = (this.writes.get(record.id) ?? Promise.resolve()).catch(() => {}).then(() => this.receiptWriter(path.join(this.root, record.id, "receipt.json"), snapshot));
    this.writes.set(record.id, pending);
    return pending;
  }
  #exportArgs(input) {
    const categories = this.#strings(input.categories, "categories"), states = this.#strings(input.states, "states").map((x) => x.toUpperCase()), fields = this.#strings(input.fields, "fields"), sourceIds = this.#strings(input.sourceIds, "sourceIds");
    const args = ["--source", "data/business-registry/current.json"];
    for (const [flag, values] of [["--category", categories], ["--state", states], ["--field", fields], ["--source-id", sourceIds]]) for (const value of values) args.push(flag, value);
    if (input.format !== undefined) args.push("--format", String(input.format)); if (input.policyMode !== undefined) args.push("--policy-mode", String(input.policyMode));
    if (input.outputPrefix !== undefined) args.push("--output-prefix", String(input.outputPrefix)); return args;
  }
  async #start(kind, details, scheduling = null) {
    if (this.closed) throw new Error("Managed operations service is closed.");
    let id, directory;
    for (let attempt = 0; attempt < (scheduling ? 1 : 4); attempt += 1) { id = scheduling?.operationId ?? this.idFactory(); if (!safeId(id)) throw new Error("Generated operation ID is invalid."); directory = path.join(this.root, id); try { await mkdir(directory); break; } catch (error) { if (error.code === "EEXIST") { if (scheduling) throw conflict("Scheduled operation directory already exists; execution is blocked."); directory = null; continue; } throw error; } }
    if (!directory) throw new Error("Could not allocate an operation ID.");
    if (this.operations.has(id)) throw new Error("Operation ID collision.");
    const record = { id, kind, status: "QUEUED", createdAt: this.now(), finishedAt: null, error: null, artifacts: [], result: kind === "source-prerequisite" && details.sourceId === "me-asc-preflight" ? { ...ME_ASC_PREREQUISITE_RESULT } : {}, details, owner: { supervisorPid: process.pid } };
    if (scheduling) record.scheduling = scheduling;
    this.operations.set(id, record); await this.#persist(record);
    const controller = new AbortController(); this.running.set(id, controller);
    this.reserved = false;
    controller.done = this.#run(record, controller).catch((error) => {
      record.status = "FAILED"; record.finishedAt = this.now(); record.error = `Unable to persist operation state: ${cleanError(error)}`;
    }).finally(() => this.running.delete(id));
    return publicOperation(record);
  }
  async #run(record, controller) {
    const directory = path.join(this.root, record.id);
    try {
      record.status = "RUNNING"; record.startedAt = this.now(); record.owner = { supervisorPid: process.pid }; await this.#persist(record);
      controller.signal.throwIfAborted();
      let args; let script;
      if (record.kind === "collection") { script = "scripts/run-industry-segments.mjs"; args = ["run", "--run-id", record.id]; for (const value of record.details.plan.industries) args.push("--industry", value); for (const value of record.details.plan.states) args.push("--state", value); if(record.details.plan.sourceIds !== undefined) args.push("--sources",record.details.plan.sourceIds.join(",")); if(record.details.plan.retainedInputs !== undefined) { await verifyRetainedPlan(record.details.plan, controller.signal); args.push('--retained-inputs-json', JSON.stringify(record.details.plan.retainedInputs), '--expected-plan-sha256', industryPlanFingerprint(record.details.plan)); } }
      else if(record.kind==='credential-export') {script='scripts/export-managed-mn-credentials.mjs';args=['--operation-id',record.id,'--output',path.join(directory,'output'),'--format',record.details.format];for(const field of record.details.fields)args.push('--field',field);for(const state of record.details.states)args.push('--state',state);}
      else if (record.kind === "cohort-snapshot") { script = "scripts/build-retained-childcare-cohort-snapshot.mjs"; args = ["--output", path.join(directory, "output"), "--operation-id", record.id, ...(record.details.includeRetainedSamples ? ["--retained-samples", "true"] : [])]; }
      else if (record.kind === "source-prerequisite") {
        script = record.details.sourceId === "overture-httpfs-runtime" ? "scripts/prepare-overture-httpfs-runtime.mjs"
          : record.details.sourceId === "overture-source-preflight" ? "scripts/probe-overture-source-preflight.mjs"
          : record.details.sourceId === "me-asc-preflight" ? "scripts/preflight-me-asc.mjs" : "scripts/probe-ok-childcare-schema.mjs";
        args = ["--output", path.join(directory, "output"), "--operation-id", record.id];
      }
      else if (record.kind === "source-acquisition" && record.details.sourceId === "ok-childcare-retained-73102") {
        script = "scripts/collect-ok-childcare-retained.mjs";
        args = ["--output", path.join(directory, "output"), "--operation-id", record.id];
      }
      else if (record.kind === "source-acquisition") {
        script = "scripts/run-overture-acquisition-session.mjs";
        args = ["--output", path.join(directory, "output"), "--operation-id", record.id,
          "--metadata-operation-id", record.details.metadata.operation_id, "--runtime-operation-id", record.details.runtime.operation_id,
          "--metadata-sha256", record.details.metadata.descriptor.sha256, "--runtime-sha256", record.details.runtime.descriptor.sha256,
          "--authorization", record.details.authorization];
      }
      else if (record.kind === "source-normalization") {
        script = "scripts/run-overture-normalization-session.mjs";
        args = ["--output", path.join(directory, "output"), "--operation-id", record.id,
          "--acquisition-operation-id", record.details.acquisition.operationId, "--acquisition-receipt-sha256", record.details.acquisition.receiptSha256,
          "--baseline-manifest", record.details.baseline.manifest, "--baseline-sha256", record.details.baseline.sha256];
      }
      else { script = "scripts/compose-flat-business-export.mjs"; args = [...record.details.args, "--output", relativeToApp(path.join(directory, "output"))]; if (!args.includes("--output-prefix")) args.push("--output-prefix", record.details.outputPrefix); }
      if (record.scheduling) args.push("--expected-plan-sha256", record.scheduling.expectedPlanHash);
      const execution = await this.executor({ kind: record.kind, script, args, signal: controller.signal, cancelGraceMs: ['export','credential-export'].includes(record.kind) ? EXPORT_CANCEL_GRACE_MS : COLLECTION_SUPERVISOR_CANCEL_GRACE_MS, onSpawn: (pid) => { record.owner.childPid = pid; void this.#persist(record).catch(() => controller.abort()); } });
      if(record.kind==='credential-export') {
        if(controller.signal.aborted||execution?.code!==0)throw new Error('Credential export did not complete cleanly.');
        if(typeof execution.stdout!=='string'||execution.stdout.length>65536)throw new Error('Credential export descriptor unavailable.');
        const parsed=JSON.parse(execution.stdout);await this.#verifyCredentialExport(record,parsed,controller.signal);
        controller.signal.throwIfAborted();record.status='SUCCEEDED';
      }
      else if (PRIVATE_EVIDENCE.includes(record.kind)) {
        const recovered = record.kind === "source-normalization" ? await this.#verifyOvertureNormalization(record, execution?.stdout)
          : record.kind === "source-acquisition" ? record.details.sourceId === "ok-childcare-retained-73102"
            ? await this.#verifyOkRetainedCollection(record, execution?.stdout) : await this.#verifyOvertureAcquisition(record, execution?.stdout)
          : record.kind === "cohort-snapshot" ? await this.#verifyCohortSnapshot(record, execution?.stdout)
          : ["overture-httpfs-runtime", "overture-source-preflight"].includes(record.details.sourceId) ? await this.#verifyOverturePrerequisite(record, execution?.stdout)
            : record.details.sourceId === "me-asc-preflight" ? await this.#verifyMeAscPrerequisite(record, execution?.stdout)
              : await this.#verifyOkSchemaPrerequisite(record, execution?.stdout);
        if (controller.signal.aborted || execution?.code !== 0 || recovered) {
          record.status = controller.signal.aborted ? "CANCELLED" : "FAILED";
          record.error = "Managed evidence did not complete cleanly; retained output requires inspection.";
          record.result.inspectionRequired = true;
          if (controller.signal.aborted) record.result.cancellation = { requested: true, forcedTerminationRequested: execution?.forcedTerminationRequested === true, outputState: "inspection-required" };
        } else record.status = "SUCCEEDED";
      }
      else if (controller.signal.aborted) {
        record.status = "CANCELLED";
        if (record.kind === "collection") {
          record.error = COLLECTION_CANCEL_WARNING;
          record.result.cancellation = { requested: true, forcedTerminationRequested: execution?.forcedTerminationRequested === true, outputState: "inspection-required" };
        }
      }
      else if (execution?.code !== 0) throw new Error("Managed child process failed.");
      else { if (record.kind === "collection" && this.verifyChildReceipts) await this.#verifyCollection(record); await this.#discover(record, directory); record.status = "SUCCEEDED"; }
    } catch (error) {
      record.status = controller.signal.aborted ? "CANCELLED" : "FAILED"; record.error = PRIVATE_EVIDENCE.includes(record.kind) ? "Managed evidence failed verification; preserve operation outputs for inspection." : cleanError(error);
      if (PRIVATE_EVIDENCE.includes(record.kind)) {
        record.result.inspectionRequired = true;
        if (controller.signal.aborted) record.result.cancellation = { requested: true, forcedTerminationRequested: null, outputState: "inspection-required" };
      }
      if (controller.signal.aborted && record.kind === "collection") {
        record.error = COLLECTION_CANCEL_WARNING;
        record.result.cancellation = { requested: true, forcedTerminationRequested: null, outputState: "inspection-required" };
      }
    }
    if (record.kind === "source-prerequisite" && ["overture-httpfs-runtime", "overture-source-preflight"].includes(record.details.sourceId) && record.status !== "SUCCEEDED") {
      record.result[record.details.sourceId === "overture-source-preflight" ? "metadataReady" : "runtimeReady"] = false;
      record.result.acquisitionReady = false;
    }
    if (record.kind === "source-acquisition" && record.status !== "SUCCEEDED") record.result.snapshotReady = false;
    if (record.kind === "source-normalization" && record.status !== "SUCCEEDED") record.result.normalizationReady = false;
    if(record.kind==='credential-export'&&record.status!=='SUCCEEDED') {record.artifacts=[];record.result={recordUnit:'publisher-business-credential-row',credentialRowsWritten:null,artifactIntegrityVerified:false,inspectionRequired:true,policyMode:'local-review-only',cancellationRequested:controller.signal.aborted};record.error='Credential export did not finish with verified output. Preserve its operation directory for inspection; no automatic retry.';}
    record.finishedAt = this.now(); delete record.owner; await this.#persist(record);
  }
  async #discover(record, directory) {
    if (record.kind === "collection") { record.result = { runId: record.id, plan: { taskCount: record.details.plan.taskCount, gaps: record.details.plan.gaps, warnings: record.details.plan.warnings } }; return; }
    const exportDirectory = path.join(directory, "output", record.details.outputPrefix); const manifest = JSON.parse(await readFile(path.join(exportDirectory, "manifest.json"), "utf8"));
    if (!contained(await realpath(directory), await realpath(exportDirectory))) throw new Error("Export output escapes its operation directory.");
    if (manifest.dataset_id !== "flat-business-export" || !String(manifest.status ?? "").startsWith("published") || !Array.isArray(manifest.artifacts)) throw new Error("Export did not publish a valid manifest.");
    const declared = [...manifest.artifacts, { path: "manifest.json" }]; const artifacts = [];
    for (const item of declared) { if (!safeId(item.path) || item.path.includes("..")) throw new Error("Export manifest contains an invalid artifact path."); const file = path.resolve(exportDirectory, item.path); if (!contained(await realpath(exportDirectory), await realpath(file))) throw new Error("Export artifact escapes its release directory."); const actual = await hashFile(file); if (item.path !== "manifest.json" && (!Number.isSafeInteger(item.bytes) || !/^[a-f0-9]{64}$/.test(item.sha256) || actual.sha256 !== item.sha256 || actual.bytes !== item.bytes)) throw new Error("Export artifact integrity check failed."); artifacts.push({ name: item.path, relativePath: relativeToApp(file).slice(relativeToApp(directory).length + 1), ...actual }); }
    record.artifacts = artifacts; record.result = { rowsWritten: (JSON.parse(await readFile(path.join(exportDirectory, "summary.json"), "utf8"))).counts.rows_written, policyMode: manifest.policy_mode, localReviewOnly: manifest.policy_mode === "local-review" };
  }
  async #verifyCredentialExport(record,descriptor,signal) {
    signal?.throwIfAborted();
    if(!descriptor||!isDeepStrictEqual(Object.keys(descriptor).sort(),'manifest sha256 execution_mode source_credential_rows filtered_out_credential_rows credential_rows_written export_policy cancellation_after_publication'.split(' ').sort())||descriptor.execution_mode!=='verified-retained-input'||descriptor.cancellation_after_publication!==false||descriptor.export_policy!=='local-review-only')throw new Error('Credential export proof rejected.');
    const directory=path.join(this.root,record.id),binding={output:path.join(directory,'output'),operationId:record.id};
    const manifest=await this.credentialVerifier(descriptor.manifest,descriptor.sha256,binding,{signal});
    signal?.throwIfAborted();
    if(!isDeepStrictEqual(manifest.fields,record.details.fields)||!isDeepStrictEqual(manifest.reported_states,record.details.states)||manifest.format!==record.details.format
      ||manifest.credential_rows_written!==descriptor.credential_rows_written||manifest.source_credential_rows!==descriptor.source_credential_rows||manifest.filtered_out_credential_rows!==descriptor.filtered_out_credential_rows)throw new Error('Credential export selection or counts changed.');
    const release=path.dirname(descriptor.manifest),artifacts=[];
    for(const item of [...manifest.artifacts,{path:'manifest.json',sha256:descriptor.sha256}]) {
      signal?.throwIfAborted();const file=path.join(release,item.path),actual=await hashFile(file,signal);
      if(actual.sha256!==item.sha256||(item.path!=='manifest.json'&&actual.bytes!==item.bytes))throw new Error('Credential export artifact changed.');
      artifacts.push({name:item.path,relativePath:path.relative(directory,file),...actual});
    }
    signal?.throwIfAborted();record.artifacts=artifacts;record.result={credentialRowsWritten:manifest.credential_rows_written,recordUnit:'publisher-business-credential-row',policyMode:'local-review-only',localReviewOnly:true,artifactIntegrityVerified:true,inspectionRequired:false,descriptor};
  }
  async #verifyCohortSnapshot(record, stdout) {
    const reject = () => { throw new Error("Cohort snapshot child evidence rejected."); };
    if (typeof stdout !== "string" || stdout.length > 65536) reject();
    let parsed; try { parsed = JSON.parse(stdout); } catch { reject(); }
    const exact = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
    let descriptor = parsed, recovery = false;
    if (parsed && Object.hasOwn(parsed, "committed_snapshot")) {
      if (!exact(parsed, ["status", "committed_snapshot", "committed_snapshot_integrity_verification_required"]) || parsed.status !== "COMMITTED_REQUIRES_INSPECTION" || parsed.committed_snapshot_integrity_verification_required !== true) reject();
      descriptor = parsed.committed_snapshot; recovery = true;
    }
    if (!exact(descriptor, ["manifest_path", "manifest_sha256", "run_id", "industry_run_id", "execution_mode"]) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(descriptor.run_id)
      || typeof descriptor.manifest_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.manifest_sha256)
      || descriptor.industry_run_id !== record.id || descriptor.execution_mode !== "native-root-offline-build"
      || descriptor.manifest_path !== path.join(this.root, record.id, "output", "jobs", descriptor.run_id, "manifest.json")) reject();
    record.result = { snapshot: descriptor, snapshotIntegrityVerified: false, sourceReplayPerformedThisRead: false, inspectionRequired: true, exportPolicy: "internal" };
    // Always verify, even with an injected executor. Cancellation must not discard a committed child reference.
    const { readRetainedChildcareCohortSnapshot } = await import("./retained-childcare-cohort-snapshot.mjs");
    const checked = await readRetainedChildcareCohortSnapshot(descriptor.manifest_path, descriptor.manifest_sha256);
    const m = checked.manifest;
    if (m.schema_version !== (record.details.includeRetainedSamples ? "retained-childcare-cohort-snapshot@2.0.0" : "retained-childcare-cohort-snapshot@1.0.0")) reject();
    if (m.run_id !== descriptor.run_id || m.industry_run_id !== record.id || m.execution_mode !== descriptor.execution_mode || m.started_at < record.startedAt) reject();
    record.result = { ...record.result, snapshotIntegrityVerified: true, sourceReplayPerformedThisRead: checked.verification.source_replay_performed_this_read, inspectionRequired: recovery,
      availableSourceCount: m.available_source_count, unavailableSourceCount: m.unavailable_source_count, notEnrolledSourceCount: m.not_enrolled_source_count };
    record.artifacts = [];
    return recovery;
  }
  async #verifyCollection(record) { const receipt = JSON.parse(await readFile(path.join(APP_ROOT, "data", "industry-segments", "runs", record.id, "receipt.json"), "utf8")); if (receipt.run_id !== record.id || receipt.status !== "succeeded") throw new Error("Collection did not publish a successful canonical receipt."); }
  async #verifyMeAscPrerequisite(record, stdout) {
    const reject = () => { throw new Error("Maine metadata prerequisite evidence rejected."); };
    const fixed = { ...ME_ASC_PREREQUISITE_RESULT };
    record.result = fixed; record.artifacts = [];
    if (typeof stdout !== "string" || stdout.length > 65536) reject();
    let descriptor; try { descriptor = JSON.parse(stdout); } catch { reject(); }
    let recovery = false;
    if (descriptor && Object.hasOwn(descriptor, "recovery")) { if (Object.keys(descriptor).length !== 1) reject(); descriptor = descriptor.recovery; recovery = true; }
    const fields = ["run_id", "operation_id", "manifest", "sha256", "status", "execution_mode", "cancellation_after_publication"];
    if (!descriptor || Object.getPrototypeOf(descriptor) !== Object.prototype || Object.keys(descriptor).length !== fields.length || !fields.every(key => Object.hasOwn(descriptor, key))
      || !uuid(descriptor.run_id) || descriptor.operation_id !== record.id || typeof descriptor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sha256)
      || !["inspection-required", "schema-observed-not-collection-ready"].includes(descriptor.status) || descriptor.execution_mode !== "native-fetch"
      || typeof descriptor.cancellation_after_publication !== "boolean" || descriptor.manifest !== path.join(this.root, record.id, "output", "jobs", descriptor.run_id, "manifest.json")) reject();
    record.result = { ...fixed, prerequisite: descriptor };
    const { readMeAscReceipt } = await import("./me-asc-preflight-reader.mjs");
    // Verify committed evidence even after cancellation, including injected executors.
    const checked = await readMeAscReceipt(descriptor.manifest, { expectedSha256: descriptor.sha256, operationId: record.id,
      operationRoot: path.join(this.root, record.id, "output"), startedAt: record.startedAt });
    if (checked.manifest.run_id !== descriptor.run_id || checked.receipt.status !== descriptor.status || checked.receipt.execution_mode !== descriptor.execution_mode) reject();
    const rejected = recovery || descriptor.status !== "schema-observed-not-collection-ready" || descriptor.cancellation_after_publication;
    record.result = { ...record.result, receiptIntegrityVerified: true, inspectionRequired: rejected, status: descriptor.status, observedSelectionCount: checked.receipt.counts.list_rows };
    return rejected;
  }
  async #verifyOkSchemaPrerequisite(record, stdout) {
    const reject = () => { throw new Error("Oklahoma schema prerequisite evidence rejected."); };
    if (typeof stdout !== "string" || stdout.length > 65536) reject();
    let descriptor; try { descriptor = JSON.parse(stdout); } catch { reject(); }
    let recovery = false;
    if (descriptor && Object.hasOwn(descriptor,"recovery")) {
      if (Object.keys(descriptor).length !== 1) reject();
      descriptor = descriptor.recovery; recovery = true;
    }
    const fields = ["run_id", "manifest", "sha256", "status", "cancellation_after_publication", "operation_id"];
    if (!descriptor || Object.getPrototypeOf(descriptor) !== Object.prototype || Object.keys(descriptor).length !== fields.length || !fields.every(key => Object.hasOwn(descriptor,key))
      || typeof descriptor.run_id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(descriptor.run_id)
      || typeof descriptor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sha256) || descriptor.operation_id !== record.id
      || !["rejected", "schema-observed-not-collection-ready"].includes(descriptor.status) || typeof descriptor.cancellation_after_publication !== "boolean"
      || descriptor.manifest !== path.join(this.root,record.id,"output","jobs",descriptor.run_id,"manifest.json")) reject();
    record.result = { sourceId: "ok-childcare-schema", prerequisite: descriptor, receiptIntegrityVerified: false, inspectionRequired: true, exportPolicy: "internal" };
    // Independently verify injected executors too; cancellation cannot discard a committed reference.
    const { readOkChildcareSchemaReceipt } = await import("./ok-childcare-schema-receipt.mjs");
    const checked = await readOkChildcareSchemaReceipt(descriptor.manifest,descriptor.sha256,{operationId:record.id,operationRoot:path.join(this.root,record.id,"output"),startedAt:record.startedAt});
    const receipt = checked.manifest;
    if (receipt.run_id !== descriptor.run_id || receipt.status !== descriptor.status || receipt.execution_mode !== "native-fetch") reject();
    const rejected = recovery || descriptor.status !== "schema-observed-not-collection-ready" || descriptor.cancellation_after_publication;
    record.result = { ...record.result, receiptIntegrityVerified: true, inspectionRequired: rejected, status: descriptor.status, collectionReady: false,
      observedRows: receipt.schema?.counts?.rows ?? null, centerRows: receipt.schema?.counts?.center_rows ?? null, statewideCompletenessVerified: false };
    record.artifacts = [];
    return rejected;
  }
  async #verifyOkRetainedCollection(record, stdout) {
    const reject = () => { throw new Error("Oklahoma retained collection evidence rejected."); };
    if (typeof stdout !== "string" || stdout.length > 65536) reject();
    let d; try { d = JSON.parse(stdout); } catch { reject(); }
    let recovery = false;
    if (d && Object.hasOwn(d, "recovery")) { if (Object.keys(d).length !== 1) reject(); d = d.recovery; recovery = true; }
    const fields = ["run_id", "operation_id", "manifest", "sha256", "status", "cancellation_after_publication"];
    if (!d || Object.getPrototypeOf(d) !== Object.prototype || Object.keys(d).length !== fields.length
      || !fields.every(k => Object.hasOwn(d, k)) || !uuid(d.run_id) || d.operation_id !== record.id
      || !/^[a-f0-9]{64}$/.test(d.sha256) || typeof d.cancellation_after_publication !== "boolean"
      || !["accepted-internal-source-candidates", "rejected"].includes(d.status)
      || d.manifest !== path.join(this.root, record.id, "output", "jobs", d.run_id, "manifest.json")) reject();
    record.result = { sourceId: "ok-childcare-retained-73102", retained: d, receiptIntegrityVerified: false,
      inspectionRequired: true, snapshotReady: false, exportPolicy: "internal" };
    const { readOkRetainedSearch } = await import("./ok-childcare-retained-bundle.mjs");
    const { manifest } = await readOkRetainedSearch(d.manifest, d.sha256, { operationId: record.id,
      operationRoot: path.join(this.root, record.id, "output"), requireNative: true });
    if (manifest.status !== d.status || manifest.started_at < record.startedAt) reject();
    const rejected = recovery || d.status !== "accepted-internal-source-candidates" || d.cancellation_after_publication;
    record.result = { ...record.result, receiptIntegrityVerified: true, inspectionRequired: rejected, snapshotReady: !rejected,
      sourceCandidateRows: manifest.counts?.rows ?? null, currentOperationsVerified: false, statewideCompletenessVerified: false };
    record.artifacts = [];
    return rejected;
  }
  async #verifyOvertureAcquisition(record, stdout) {
    const reject = () => { throw new Error("Overture acquisition evidence rejected."); };
    if (typeof stdout !== "string" || stdout.length > 65536) reject();
    let parsed; try { parsed = JSON.parse(stdout); } catch { reject(); }
    let descriptor = parsed, recovery = false;
    if (parsed && Object.hasOwn(parsed, "recovery")) {
      if (Object.keys(parsed).length !== 1) reject();
      descriptor = parsed.recovery; recovery = true;
    }
    const fields = ["run_id", "operation_id", "manifest", "sha256", "status", "cancellation_after_publication"];
    if (!descriptor || Object.getPrototypeOf(descriptor) !== Object.prototype || Object.keys(descriptor).length !== fields.length
      || !fields.every(key => Object.hasOwn(descriptor, key)) || !uuid(descriptor.run_id)
      || descriptor.operation_id !== record.id || typeof descriptor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sha256)
      || descriptor.status !== "selected-source-retained-not-published" || typeof descriptor.cancellation_after_publication !== "boolean"
      || descriptor.manifest !== path.join(this.root, record.id, "output", "jobs", descriptor.run_id, "manifest.json")) reject();
    record.result = { sourceId: "overture-us-places", snapshot: descriptor, receiptIntegrityVerified: false,
      inspectionRequired: true, snapshotReady: false, normalizedPublished: false, completeUsBusinessCoverage: false, exportPolicy: "internal" };
    const { readOvertureAcquisitionSession } = await import("./overture-acquisition-receipt.mjs");
    const checked = await readOvertureAcquisitionSession(descriptor, { output: path.join(this.root, record.id, "output"), operationId: record.id, startedAt: record.startedAt });
    for (const key of ["metadata", "runtime"]) {
      const actual = checked.manifest[`${key}_reference`], expected = record.details[key];
      if (!actual || actual.output !== expected.output || actual.operation_id !== expected.operation_id
        || !Object.keys(expected.descriptor).every(field => actual.descriptor?.[field] === expected.descriptor[field])) reject();
    }
    const rejected = recovery || descriptor.cancellation_after_publication;
    record.result = { ...record.result, receiptIntegrityVerified: true, inspectionRequired: rejected, snapshotReady: !rejected };
    record.artifacts = [];
    return rejected;
  }
  async #verifyOvertureNormalization(record, stdout) {
    const reject = () => { throw new Error("Overture normalization evidence rejected."); };
    if (typeof stdout !== "string" || stdout.length > 65536) reject();
    let descriptor; try { descriptor = JSON.parse(stdout); } catch { reject(); }
    let recovery = false;
    if (descriptor && Object.hasOwn(descriptor, "recovery")) {
      if (Object.keys(descriptor).length !== 1) reject();
      descriptor = descriptor.recovery; recovery = true;
    }
    const fields = ["run_id", "operation_id", "manifest", "sha256", "status"];
    if (!descriptor || Object.getPrototypeOf(descriptor) !== Object.prototype || Object.keys(descriptor).length !== fields.length
      || !fields.every(key => Object.hasOwn(descriptor, key)) || !uuid(descriptor.run_id) || descriptor.operation_id !== record.id
      || typeof descriptor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sha256) || descriptor.status !== "normalized-retained-not-promoted"
      || descriptor.manifest !== path.join(this.root, record.id, "output", "jobs", descriptor.run_id, "manifest.json")) reject();
    record.result = { sourceId: "overture-us-places", normalization: descriptor, receiptIntegrityVerified: false, inspectionRequired: true,
      normalizationReady: false, normalizedPublished: false, completeUsBusinessCoverage: false, exportPolicy: "internal" };
    const { readOvertureNormalizationSession } = await import("./overture-normalization-session.mjs");
    const checked = await readOvertureNormalizationSession(descriptor, { output: path.join(this.root, record.id, "output"), operationId: record.id });
    if (!isDeepStrictEqual(checked.receipt.acquisition, record.details.acquisition) || !isDeepStrictEqual(checked.receipt.baseline, record.details.baseline)) reject();
    record.result = { ...record.result, receiptIntegrityVerified: true, inspectionRequired: recovery, normalizationReady: !recovery,
      normalizedPlaces: checked.normalized.coverage.normalized_places };
    record.artifacts = [];
    return recovery;
  }
  async #verifyOverturePrerequisite(record, stdout) {
    const metadata = record.details.sourceId === "overture-source-preflight";
    const readyField = metadata ? "metadataReady" : "runtimeReady";
    const reject = () => { throw new Error("Overture prerequisite evidence rejected."); };
    if (typeof stdout !== "string" || stdout.length > 65536) reject();
    let descriptor; try { descriptor = JSON.parse(stdout); } catch { reject(); }
    let recovery = false;
    if (descriptor && Object.hasOwn(descriptor, "recovery")) {
      if (Object.keys(descriptor).length !== 1) reject();
      descriptor = descriptor.recovery; recovery = true;
    }
    const fields = ["run_id", "operation_id", "manifest", "sha256", "status", "cancellation_after_publication"];
    if (!descriptor || Object.getPrototypeOf(descriptor) !== Object.prototype || Object.keys(descriptor).length !== fields.length
      || !fields.every(key => Object.hasOwn(descriptor, key)) || typeof descriptor.run_id !== "string"
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(descriptor.run_id)
      || descriptor.operation_id !== record.id || !/^[a-f0-9]{64}$/.test(descriptor.sha256)
      || descriptor.status !== (metadata ? "metadata-verified-no-place-acquisition" : "runtime-verified-no-place-acquisition") || typeof descriptor.cancellation_after_publication !== "boolean"
      || descriptor.manifest !== path.join(this.root, record.id, "output", "jobs", descriptor.run_id, "manifest.json")) reject();
    record.result = { sourceId: record.details.sourceId, prerequisite: descriptor, receiptIntegrityVerified: false,
      inspectionRequired: true, [readyField]: false, acquisitionReady: false, exportPolicy: "internal" };
    const read = metadata ? (await import("./overture-source-preflight.mjs")).readOvertureSourcePreflight
      : (await import("./overture-httpfs-runtime.mjs")).readOvertureHttpfsRuntime;
    await read(descriptor, { output: path.join(this.root, record.id, "output"), operationId: record.id, startedAt: record.startedAt });
    const rejected = recovery || descriptor.cancellation_after_publication;
    record.result = { ...record.result, receiptIntegrityVerified: true, inspectionRequired: rejected, [readyField]: !rejected };
    record.artifacts = [];
    return rejected;
  }
}

export function createManagedOperations(options) { return new ManagedOperations(options); }
