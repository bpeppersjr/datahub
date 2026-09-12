import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { APP_ROOT, assertInsideApp, relativeToApp } from "./paths.mjs";
import { acquireIndustrySourceLocks } from "./industry-source-locks.mjs";
import { normalizeRetainedInputs, retainedSourceArguments, verifyRetainedTask } from './industry-retained-inputs.mjs';
import { COLLECTION_CHILD_CANCEL_GRACE_MS, COLLECTION_CANCEL_WARNING } from "./collection-cancellation.mjs";

export const DEFAULT_CONFIG = path.join(APP_ROOT, "config", "industry-segments.json");
export const MAX_CONCURRENCY = 10;

export function industryPlanFingerprint(plan) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const executablePlan = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "runId"));
  return createHash("sha256").update(JSON.stringify(canonical(executablePlan))).digest("hex");
}

export function industrySourceCatalog(config) {
  validateIndustryConfig(config);
  return Object.entries(config.sources).map(([id, source]) => ({ id, scope: source.scope,
    states: source.states, industries: Object.keys(config.industries).filter(industry => config.industries[industry].includes(id)),
    manualSelectionRequired: source.manual_selection_required === true,
  }));
}

const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];

export async function loadIndustryConfig(configPath = DEFAULT_CONFIG) {
  const resolved = assertInsideApp(path.resolve(APP_ROOT, configPath));
  const config = JSON.parse(await readFile(resolved, "utf8"));
  validateIndustryConfig(config, resolved);
  for (const [id, source] of Object.entries(config.sources)) {
    const scriptPath = assertInsideApp(path.resolve(APP_ROOT, source.script));
    try { await access(scriptPath); } catch { throw new Error(`Invalid industry segment config (${resolved}): ${id}.script does not exist: ${source.script}`); }
  }
  return config;
}

export function validateIndustryConfig(config, source = "config") {
  const fail = (message) => { throw new Error(`Invalid industry segment config (${source}): ${message}`); };
  if (!config || config.version !== 1) fail("version must be 1");
  if (!Number.isInteger(config.max_concurrency) || config.max_concurrency < 1 || config.max_concurrency > MAX_CONCURRENCY) fail(`max_concurrency must be an integer from 1 to ${MAX_CONCURRENCY}`);
  if (!Array.isArray(config.states) || config.states.some((s) => typeof s !== "string" || !/^[A-Z]{2}$/.test(s))) fail("states must be uppercase two-letter codes");
  if (!config.industries || typeof config.industries !== "object" || Array.isArray(config.industries)) fail("industries must be an object");
  if (!config.sources || typeof config.sources !== "object" || Array.isArray(config.sources)) fail("sources must be an object");
  const configuredScripts = new Set();
  for (const [id, source] of Object.entries(config.sources)) {
    if (!/^[-a-z0-9]+$/.test(id)) fail(`source id ${id} is invalid`);
    if (!source || typeof source.script !== "string" || !source.script.endsWith(".mjs")) fail(`${id}.script is required`);
    if (!["national", "state"].includes(source.scope)) fail(`${id}.scope must be national or state`);
    if (source.scope === "national" && source.states !== "all") fail(`${id}.states must be all for national sources`);
    if (source.scope === "state" && (!Array.isArray(source.states) || source.states.length === 0 || source.states.some((s) => !config.states.includes(s)))) fail(`${id}.states must contain configured states`);
    if (source.scope === "state" && source.states.length !== 1) fail(`${id}: state builders must have one publisher state until state arguments are supported`);
    assertInsideApp(path.resolve(APP_ROOT, source.script));
    const scriptIdentity = process.platform === "win32" ? path.resolve(APP_ROOT, source.script).toLowerCase() : path.resolve(APP_ROOT, source.script);
    if (configuredScripts.has(scriptIdentity)) fail(`${id}.script duplicates another source executable`);
    configuredScripts.add(scriptIdentity);
    if (typeof source.state_filter_supported !== "boolean") fail(`${id}.state_filter_supported must be boolean`);
    if (source.manual_selection_required !== undefined && typeof source.manual_selection_required !== "boolean") fail(`${id}.manual_selection_required must be boolean`);
    if (!Array.isArray(source.prerequisites)) fail(`${id}.prerequisites must be an array`);
    if (source.coverage_notes !== undefined && (!Array.isArray(source.coverage_notes) || source.coverage_notes.length > 5 || source.coverage_notes.some((note) => typeof note !== "string" || !note.trim() || note.length > 500))) fail(`${id}.coverage_notes must contain at most five non-empty strings of at most 500 characters`);
    for (const prerequisite of source.prerequisites) {
      if (typeof prerequisite !== "string" || !prerequisite) fail(`${id}.prerequisites must contain paths`);
      assertInsideApp(path.resolve(APP_ROOT, prerequisite));
    }
  }
  for (const [industry, sourceIds] of Object.entries(config.industries)) {
    if (!/^[a-z0-9-]+$/.test(industry) || !Array.isArray(sourceIds) || sourceIds.length === 0) fail(`${industry} must map to a non-empty source array`);
    for (const id of sourceIds) if (!config.sources[id]) fail(`${industry} references unknown source ${id}`);
  }
  return true;
}

export function buildIndustryPlan(config, { industries, states, sourceIds, retainedInputs, runId = randomUUID() } = {}) {
  validateIndustryConfig(config);
  const requestedIndustries = asArray(industries).flatMap((v) => String(v).split(",")).filter(Boolean);
  const requestedStates = asArray(states).flatMap((v) => String(v).split(",")).filter(Boolean);
  const selectedIndustries = requestedIndustries.length ? requestedIndustries : Object.keys(config.industries);
  const selectedStates = [...new Set(requestedStates.length ? requestedStates : config.states)];
  for (const industry of selectedIndustries) if (!config.industries[industry]) throw new Error(`Unsupported industry: ${industry}`);
  for (const state of selectedStates) if (!config.states.includes(state)) throw new Error(`Unsupported state: ${state}`);
  const industrySources = [...new Set(selectedIndustries.flatMap((i) => config.industries[i]))];
  if (sourceIds !== undefined) {
    if (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.some(id => typeof id !== "string" || !/^[-a-z0-9]+$/.test(id)) || new Set(sourceIds).size !== sourceIds.length) throw new Error("sourceIds must be a non-empty array of unique source IDs.");
    for (const id of sourceIds) if (!industrySources.includes(id) || !(config.sources[id].scope === "national" || config.sources[id].states.some(state => selectedStates.includes(state)))) throw new Error(`Source is not applicable to selected industries and states: ${id}`);
  }
  const ids = sourceIds === undefined ? industrySources : [...sourceIds].sort();
  const retained = normalizeRetainedInputs(retainedInputs, sourceIds, config);
  const tasks = [];
  const warnings = [];
  for (const sourceId of ids) {
    const source = config.sources[sourceId];
    if (source.manual_selection_required && sourceIds === undefined) {
      if (source.scope === 'national' || source.states.some(state => selectedStates.includes(state)))
        warnings.push(`${sourceId}: manual selection required; excluded from automatic/default collection plans.`);
      continue;
    }
    for (const note of source.coverage_notes ?? []) warnings.push(`${sourceId}: ${note}`);
    if (source.scope === "national") {
      if (selectedStates.length && !source.state_filter_supported) warnings.push(`${sourceId} is national and will run once without a state filter; state selection is recorded for coverage only.`);
      tasks.push({ id: `${sourceId}:national`, sourceId, scope: "national", states: selectedStates, industries: selectedIndustries.filter((i) => config.industries[i].includes(sourceId)), script: source.script, prerequisites: source.prerequisites });
    } else {
      const matching = selectedStates.filter((state) => source.states.includes(state));
      for (const state of matching) tasks.push({ id: `${sourceId}:${state}`, sourceId, scope: "state", state, states: [state], industries: selectedIndustries.filter((i) => config.industries[i].includes(sourceId)), script: source.script, prerequisites: source.prerequisites });
    }
  }
  const gaps = [];
  if (retained) for (const task of tasks) if (retained[task.sourceId]) task.retainedInput = retained[task.sourceId];
  for (const industry of selectedIndustries) for (const state of selectedStates) {
    const hasStateSource = config.industries[industry].some((id) => config.sources[id].scope === "state" && config.sources[id].states.includes(state)
      && (!config.sources[id].manual_selection_required || sourceIds?.includes(id)));
    if (!hasStateSource) {
      const manualOmitted = config.industries[industry].some(id => config.sources[id].scope === 'state'
        && config.sources[id].states.includes(state) && config.sources[id].manual_selection_required);
      gaps.push({ industry, state, reason: manualOmitted
        ? 'manual-only state source not selected; no automatic state collection'
        : "no configured state-scoped source; national sources are not state-filtered" });
    }
  }
  return { runId, industries: selectedIndustries, states: selectedStates, ...(sourceIds === undefined ? {} : { sourceIds: ids }), ...(retained === undefined ? {} : { retainedInputs: retained }), taskCount: tasks.length, tasks, gaps, warnings, maxConcurrency: Math.min(config.max_concurrency, MAX_CONCURRENCY) };
}

async function checkPrerequisites(task) {
  for (const prerequisite of task.prerequisites ?? []) {
    const resolved = assertInsideApp(path.resolve(APP_ROOT, prerequisite));
    try { await access(resolved); } catch { throw new Error(`${task.sourceId} prerequisite is missing: ${relativeToApp(resolved)}`); }
  }
}

function executeChild(task, { runDir, runId, outputRoot, signal }) {
  return new Promise((resolve) => {
    const logPath = path.join(runDir, "logs", `${task.id.replaceAll(":", "-")}.log`);
    const outputPath = path.join(outputRoot, task.id.replaceAll(":", "-"));
    const args = [task.script, "--output", outputPath, ...retainedSourceArguments(task)];
    const child = spawn(process.execPath, args, {
      cwd: APP_ROOT,
      env: { ...process.env, INDUSTRY_SEGMENT_RUN_ID: runId },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    let forceTimer; let forcedTerminationRequested = false;
    const cancelChild = () => {
      if (forceTimer || child.exitCode !== null) return;
      if (child.connected) child.send({ type: "cancel" }, () => {});
      forceTimer = setTimeout(() => { forcedTerminationRequested = true; child.kill("SIGKILL"); }, COLLECTION_CHILD_CANCEL_GRACE_MS);
      forceTimer.unref();
    };
    signal?.addEventListener("abort", cancelChild, { once: true });
    if (signal?.aborted) cancelChild();
    const log = createWriteStream(logPath, { flags: "w" });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    let settled = false; let spawnError = null; let logError = null;
    log.on("error", (error) => { logError = error; });
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (!log.closed) await new Promise((done) => { log.once("close", done); log.end(); });
      resolveResult(logError ? { ...result, code: 1, error: logError.message } : result);
    };
    const resolveResult = (result) => resolve({ ...result, log: relativeToApp(logPath) });
    child.on("close", (code, sig) => {
      clearTimeout(forceTimer);
      signal?.removeEventListener("abort", cancelChild);
      void finish({ code: spawnError || logError ? 1 : (code ?? 1), signal: sig, forcedTerminationRequested, error: spawnError?.message || logError?.message });
    });
    child.on("error", (error) => { spawnError = error; if (!log.destroyed) log.write(`${error.message}\n`); });
  });
}

export async function runIndustryPlan(config, plan, { executor = executeChild, outputRoot = path.join("data", "industry-segments", "runs", plan.runId), signal: requestedSignal } = {}) {
  const controller = new AbortController();
  const signal = requestedSignal ? AbortSignal.any([requestedSignal, controller.signal]) : controller.signal;
  validateIndustryConfig(config);
  for (const [id, source] of Object.entries(config.sources)) {
    try { await access(assertInsideApp(path.resolve(APP_ROOT, source.script))); } catch { throw new Error(`${id}.script does not exist: ${source.script}`); }
  }
  const runDir = assertInsideApp(path.resolve(APP_ROOT, outputRoot));
  const canonical = buildIndustryPlan(config, { industries: plan.industries, states: plan.states, sourceIds: plan.sourceIds, retainedInputs: plan.retainedInputs, runId: plan.runId });
  if (JSON.stringify(canonical.tasks) !== JSON.stringify(plan.tasks) || JSON.stringify(canonical.gaps) !== JSON.stringify(plan.gaps) || JSON.stringify(canonical.warnings) !== JSON.stringify(plan.warnings) || canonical.maxConcurrency !== plan.maxConcurrency) throw new Error("Plan does not match the validated configuration.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(plan.runId)) throw new Error("runId must be a short filesystem-safe identifier.");
  await mkdir(path.dirname(runDir), { recursive: true });
  await mkdir(runDir);
  await mkdir(path.join(runDir, "logs"));
  const receiptPath = path.join(runDir, "receipt.json");
  await writeFile(path.join(runDir, "plan.json"), JSON.stringify(plan, null, 2));
  const receipt = { run_id: plan.runId, status: "running", started_at: new Date().toISOString(), plan: { industries: plan.industries, states: plan.states, ...(plan.sourceIds === undefined ? {} : {sourceIds: canonical.sourceIds}), gaps: plan.gaps, warnings: plan.warnings }, tasks: [], log_sha256: {} };
  let receiptWrite = Promise.resolve();
  const persist = () => { receiptWrite = receiptWrite.catch(() => {}).then(async () => { const temp = `${receiptPath}.tmp`; await writeFile(temp, JSON.stringify(receipt, null, 2)); const { rename } = await import("node:fs/promises"); await rename(temp, receiptPath); }); return receiptWrite; };
  await persist();
  if (canonical.retainedInputs) { receipt.plan.retainedInputs = canonical.retainedInputs; await persist(); }
  if (plan.tasks.length === 0) { receipt.status = "failed"; receipt.error = "Plan contains no executable tasks."; receipt.finished_at = new Date().toISOString(); await persist(); return { receiptPath, receipt }; }
  const prerequisiteErrors = [];
  for (const task of plan.tasks) { try { await checkPrerequisites(task); await verifyRetainedTask(task, signal); } catch (error) { prerequisiteErrors.push({ task, error }); } }
  // Cancellation during retained replay is not a broken prerequisite. No source
  // reservations or children have been created at this boundary.
  if (signal.aborted) {
    receipt.status = "cancelled"; receipt.finished_at = new Date().toISOString();
    receipt.tasks = plan.tasks.map((task) => ({ task_id: task.id, source_id: task.sourceId, state: task.state ?? null, status: "cancelled" }));
    await persist(); return { receiptPath, receipt };
  }
  if (prerequisiteErrors.length) {
    for (const task of plan.tasks) { const failure = prerequisiteErrors.find((item) => item.task.id === task.id); receipt.tasks.push({ task_id: task.id, source_id: task.sourceId, state: task.state ?? null, status: failure ? "failed" : "cancelled", error: failure?.error.message }); }
    receipt.status = "failed"; receipt.finished_at = new Date().toISOString(); await persist(); return { receiptPath, receipt };
  }
  if (signal.aborted) {
    receipt.status = "cancelled"; receipt.finished_at = new Date().toISOString();
    receipt.tasks = plan.tasks.map((task) => ({ task_id: task.id, source_id: task.sourceId, state: task.state ?? null, status: "cancelled" }));
    await persist(); return { receiptPath, receipt };
  }
  let reservation;
  try {
    reservation = await acquireIndustrySourceLocks(plan.tasks, { runId: plan.runId });
    receipt.source_locks = reservation.locks;
  } catch (error) {
    receipt.status = "failed"; receipt.error = error.message; receipt.finished_at = new Date().toISOString();
    receipt.tasks = plan.tasks.map((task) => ({ task_id: task.id, source_id: task.sourceId, state: task.state ?? null, status: "cancelled" }));
    await persist(); return { receiptPath, receipt };
  }
  let terminalPersisted = false;
  try {
  let cursor = 0;
  const worker = async () => {
    while (cursor < plan.tasks.length && !signal?.aborted) {
      const task = plan.tasks[cursor++];
      const record = { task_id: task.id, source_id: task.sourceId, state: task.state ?? null, status: "running", started_at: new Date().toISOString() };
      receipt.tasks.push(record); await persist();
      if (signal?.aborted) { record.status = "cancelled"; record.finished_at = new Date().toISOString(); await persist(); break; }
      try {
        if (task.retainedInput) { record.retained_input = task.retainedInput; record.retained_verification = await verifyRetainedTask(task, signal); await persist(); }
        const result = await executor(task, { runDir, runId: plan.runId, outputRoot: runDir, signal });
        await verifyRetainedTask(task, signal);
        const succeeded = result?.code === 0 || result?.ok === true || result?.status === "succeeded";
        Object.assign(record, result);
        record.status = signal?.aborted ? "cancelled" : succeeded ? "succeeded" : "failed";
        if (signal?.aborted) record.cancellation = { requested: true, child_exit_succeeded: succeeded, output_state: "inspection-required", warning: COLLECTION_CANCEL_WARNING };
      } catch (error) { record.status = "failed"; record.error = error.message; }
      record.finished_at = new Date().toISOString(); await persist();
    }
  };
  const workers = Array.from({ length: Math.min(plan.maxConcurrency, plan.tasks.length || 1) }, () => worker().catch((error) => { controller.abort(); throw error; }));
  const outcomes = await Promise.allSettled(workers);
  const workerFailure = outcomes.find((outcome) => outcome.status === "rejected");
  if (workerFailure) { receipt.status = "failed"; receipt.error = workerFailure.reason?.message ?? "Industry worker failed."; }
  else if (signal?.aborted) receipt.status = "cancelled";
  else receipt.status = receipt.tasks.some((task) => task.status === "failed") ? "failed" : "succeeded";
  receipt.finished_at = new Date().toISOString();
  for (const task of receipt.tasks) if (task.status === "running") { task.status = workerFailure ? "failed" : "cancelled"; task.finished_at = receipt.finished_at; }
  for (const task of plan.tasks) if (!receipt.tasks.some((item) => item.task_id === task.id)) receipt.tasks.push({ task_id: task.id, source_id: task.sourceId, state: task.state ?? null, status: "cancelled" });
  for (const task of receipt.tasks) if (task.log) {
    try {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(assertInsideApp(path.join(APP_ROOT, task.log)))) hash.update(chunk);
      receipt.log_sha256[task.task_id] = hash.digest("hex");
    } catch (error) {
      task.log_integrity_error = error.message;
      if (receipt.status === "succeeded") receipt.status = "failed";
    }
  }
  await persist();
  terminalPersisted = true;
  return { receiptPath, receipt };
  } finally {
    // A failed terminal write retains reservations for explicit operator recovery.
    if (terminalPersisted) {
      try { await reservation.release(); }
      catch (error) {
        receipt.lock_release_status = "inspection-required";
        receipt.lock_release_error = error.message;
        await persist();
        throw error;
      }
    }
  }
}
