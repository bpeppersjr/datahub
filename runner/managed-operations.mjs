import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import { writeReconciliationReceipt } from "./reconciliation-receipt.mjs";
import { APP_ROOT, assertInsideApp, relativeToApp } from "./paths.mjs";
import { buildIndustryPlan, industryPlanFingerprint, loadIndustryConfig } from "./industry-segments.mjs";
import { AVAILABLE_EXPORT_FIELDS, BUSINESS_FLATFILE_CATEGORIES, parseArguments } from "../scripts/compose-flat-business-export.mjs";
import { COLLECTION_SUPERVISOR_CANCEL_GRACE_MS, EXPORT_CANCEL_GRACE_MS, COLLECTION_CANCEL_WARNING } from "./collection-cancellation.mjs";

const FINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN"]);
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
  artifacts: (record.artifacts ?? []).map(({ name, bytes }) => ({ name, bytes })), result: record.result ?? {},
});
async function hashFile(file) { const hash = createHash("sha256"); let bytes = 0; for await (const chunk of createReadStream(file)) { bytes += chunk.length; hash.update(chunk); } return { bytes, sha256: hash.digest("hex") }; }
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
        if (record.id !== entry.name || !["collection", "export"].includes(record.kind)) continue;
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
    return { industries: Object.keys(config.industries).map((id) => ({ id })), states: [...config.states], export: { categories: Object.keys(BUSINESS_FLATFILE_CATEGORIES), fields: [...AVAILABLE_EXPORT_FIELDS], formats: FORMATS, policyModes: POLICIES } };
  }
  async plan(input = {}) { await this.ready; this.#only(input, ["industries", "states", "sourceIds"]); const config = await this.configLoader(); return validate(() => buildIndustryPlan(config, this.#selection(input))); }
  async startCollection(input = {}) {
    await this.ready; await this.#refreshUnknown(); this.#reserve();
    try { this.#only(input, ["industries", "states", "sourceIds"]); const config = await this.configLoader(); const plan = validate(() => buildIndustryPlan(config, this.#selection(input))); return await this.#start("collection", { plan }); }
    catch (error) { this.reserved = false; throw error; }
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
    try { this.#only(input, ["categories", "states", "fields", "format", "policyMode", "sourceIds", "outputPrefix"]); const args = this.#exportArgs(input); const parsed = validate(() => parseArguments(args)); return await this.#start("export", { args, outputPrefix: parsed.outputPrefix ?? "export" }); }
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
    const declared = (record.artifacts ?? []).find((item) => item.name === filename); if (!declared) return null;
    const file = path.resolve(this.root, id, declared.relativePath); const base = await realpath(path.resolve(this.root, id));
    if (!contained(await realpath(this.root), base) || !contained(base, await realpath(file))) return null;
    const info = await stat(file); if (!info.isFile()) return null;
    const actual = await hashFile(file); if (actual.bytes !== declared.bytes || actual.sha256 !== declared.sha256) throw new Error("Artifact integrity check failed.");
    return { path: file, name: filename, ...actual, contentType: filename.endsWith(".json") ? "application/json" : filename.endsWith(".csv") ? "text/csv" : "application/x-ndjson" };
  }
  async close() { await this.ready; this.closed = true; while (this.reserved) await new Promise((resolve) => setTimeout(resolve, 5)); for (const controller of this.running.values()) controller.abort(); await Promise.allSettled([...this.running.values()].map((controller) => controller.done)); }
  #selection(input) { return { industries: this.#strings(input.industries, "industries"), states: this.#strings(input.states, "states").map((x) => x.toUpperCase()), ...(Object.hasOwn(input,"sourceIds") ? {sourceIds: input.sourceIds === undefined ? null : input.sourceIds} : {}) }; }
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
    const record = { id, kind, status: "QUEUED", createdAt: this.now(), finishedAt: null, error: null, artifacts: [], result: {}, details, owner: { supervisorPid: process.pid } };
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
      if (record.kind === "collection") { script = "scripts/run-industry-segments.mjs"; args = ["run", "--run-id", record.id]; for (const value of record.details.plan.industries) args.push("--industry", value); for (const value of record.details.plan.states) args.push("--state", value); if(record.details.plan.sourceIds !== undefined) args.push("--sources",record.details.plan.sourceIds.join(",")); }
      else { script = "scripts/compose-flat-business-export.mjs"; args = [...record.details.args, "--output", relativeToApp(path.join(directory, "output"))]; if (!args.includes("--output-prefix")) args.push("--output-prefix", record.details.outputPrefix); }
      if (record.scheduling) args.push("--expected-plan-sha256", record.scheduling.expectedPlanHash);
      const execution = await this.executor({ kind: record.kind, script, args, signal: controller.signal, cancelGraceMs: record.kind === "collection" ? COLLECTION_SUPERVISOR_CANCEL_GRACE_MS : EXPORT_CANCEL_GRACE_MS, onSpawn: (pid) => { record.owner.childPid = pid; void this.#persist(record).catch(() => controller.abort()); } });
      if (controller.signal.aborted) {
        record.status = "CANCELLED";
        if (record.kind === "collection") {
          record.error = COLLECTION_CANCEL_WARNING;
          record.result.cancellation = { requested: true, forcedTerminationRequested: execution?.forcedTerminationRequested === true, outputState: "inspection-required" };
        }
      }
      else if (execution?.code !== 0) throw new Error("Managed child process failed.");
      else { if (record.kind === "collection" && this.verifyChildReceipts) await this.#verifyCollection(record); await this.#discover(record, directory); record.status = "SUCCEEDED"; }
    } catch (error) {
      record.status = controller.signal.aborted ? "CANCELLED" : "FAILED"; record.error = cleanError(error);
      if (controller.signal.aborted && record.kind === "collection") {
        record.error = COLLECTION_CANCEL_WARNING;
        record.result.cancellation = { requested: true, forcedTerminationRequested: null, outputState: "inspection-required" };
      }
    }
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
  async #verifyCollection(record) { const receipt = JSON.parse(await readFile(path.join(APP_ROOT, "data", "industry-segments", "runs", record.id, "receipt.json"), "utf8")); if (receipt.run_id !== record.id || receipt.status !== "succeeded") throw new Error("Collection did not publish a successful canonical receipt."); }
}

export function createManagedOperations(options) { return new ManagedOperations(options); }
