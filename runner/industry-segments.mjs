import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { APP_ROOT, assertInsideApp, relativeToApp } from "./paths.mjs";

export const DEFAULT_CONFIG = path.join(APP_ROOT, "config", "industry-segments.json");
export const MAX_CONCURRENCY = 10;

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
  for (const [id, source] of Object.entries(config.sources)) {
    if (!/^[-a-z0-9]+$/.test(id)) fail(`source id ${id} is invalid`);
    if (!source || typeof source.script !== "string" || !source.script.endsWith(".mjs")) fail(`${id}.script is required`);
    if (!["national", "state"].includes(source.scope)) fail(`${id}.scope must be national or state`);
    if (source.scope === "national" && source.states !== "all") fail(`${id}.states must be all for national sources`);
    if (source.scope === "state" && (!Array.isArray(source.states) || source.states.length === 0 || source.states.some((s) => !config.states.includes(s)))) fail(`${id}.states must contain configured states`);
    if (source.scope === "state" && source.states.length !== 1) fail(`${id}: state builders must have one publisher state until state arguments are supported`);
    assertInsideApp(path.resolve(APP_ROOT, source.script));
    if (typeof source.state_filter_supported !== "boolean") fail(`${id}.state_filter_supported must be boolean`);
    if (!Array.isArray(source.prerequisites)) fail(`${id}.prerequisites must be an array`);
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

export function buildIndustryPlan(config, { industries, states, runId = randomUUID() } = {}) {
  validateIndustryConfig(config);
  const requestedIndustries = asArray(industries).flatMap((v) => String(v).split(",")).filter(Boolean);
  const requestedStates = asArray(states).flatMap((v) => String(v).split(",")).filter(Boolean);
  const selectedIndustries = requestedIndustries.length ? requestedIndustries : Object.keys(config.industries);
  const selectedStates = [...new Set(requestedStates.length ? requestedStates : config.states)];
  for (const industry of selectedIndustries) if (!config.industries[industry]) throw new Error(`Unsupported industry: ${industry}`);
  for (const state of selectedStates) if (!config.states.includes(state)) throw new Error(`Unsupported state: ${state}`);
  const ids = [...new Set(selectedIndustries.flatMap((i) => config.industries[i]))];
  const tasks = [];
  const warnings = [];
  for (const sourceId of ids) {
    const source = config.sources[sourceId];
    if (source.scope === "national") {
      if (selectedStates.length && !source.state_filter_supported) warnings.push(`${sourceId} is national and will run once without a state filter; state selection is recorded for coverage only.`);
      tasks.push({ id: `${sourceId}:national`, sourceId, scope: "national", states: selectedStates, industries: selectedIndustries.filter((i) => config.industries[i].includes(sourceId)), script: source.script, prerequisites: source.prerequisites });
    } else {
      const matching = selectedStates.filter((state) => source.states.includes(state));
      for (const state of matching) tasks.push({ id: `${sourceId}:${state}`, sourceId, scope: "state", state, states: [state], industries: selectedIndustries.filter((i) => config.industries[i].includes(sourceId)), script: source.script, prerequisites: source.prerequisites });
    }
  }
  const gaps = [];
  for (const industry of selectedIndustries) for (const state of selectedStates) {
    const hasStateSource = config.industries[industry].some((id) => config.sources[id].scope === "state" && config.sources[id].states.includes(state));
    if (!hasStateSource) gaps.push({ industry, state, reason: "no configured state-scoped source; national sources are not state-filtered" });
  }
  return { runId, industries: selectedIndustries, states: selectedStates, taskCount: tasks.length, tasks, gaps, warnings, maxConcurrency: Math.min(config.max_concurrency, MAX_CONCURRENCY) };
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
    const args = [task.script, "--output", outputPath];
    const child = spawn(process.execPath, args, {
      cwd: APP_ROOT,
      env: { ...process.env, INDUSTRY_SEGMENT_RUN_ID: runId },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    let forceTimer;
    const cancelChild = () => {
      if (forceTimer || child.exitCode !== null) return;
      if (child.connected) child.send({ type: "cancel" }, () => {});
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 10_000);
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
      void finish({ code: spawnError || logError ? 1 : (code ?? 1), signal: sig, error: spawnError?.message || logError?.message });
    });
    child.on("error", (error) => { spawnError = error; if (!log.destroyed) log.write(`${error.message}\n`); });
  });
}

export async function runIndustryPlan(config, plan, { executor = executeChild, outputRoot = path.join("data", "industry-segments", "runs", plan.runId), signal } = {}) {
  validateIndustryConfig(config);
  for (const [id, source] of Object.entries(config.sources)) {
    try { await access(assertInsideApp(path.resolve(APP_ROOT, source.script))); } catch { throw new Error(`${id}.script does not exist: ${source.script}`); }
  }
  const runDir = assertInsideApp(path.resolve(APP_ROOT, outputRoot));
  const canonical = buildIndustryPlan(config, { industries: plan.industries, states: plan.states, runId: plan.runId });
  if (JSON.stringify(canonical.tasks) !== JSON.stringify(plan.tasks) || JSON.stringify(canonical.gaps) !== JSON.stringify(plan.gaps) || canonical.maxConcurrency !== plan.maxConcurrency) throw new Error("Plan does not match the validated configuration.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(plan.runId)) throw new Error("runId must be a short filesystem-safe identifier.");
  await mkdir(path.dirname(runDir), { recursive: true });
  await mkdir(runDir);
  await mkdir(path.join(runDir, "logs"));
  const receiptPath = path.join(runDir, "receipt.json");
  await writeFile(path.join(runDir, "plan.json"), JSON.stringify(plan, null, 2));
  const receipt = { run_id: plan.runId, status: "running", started_at: new Date().toISOString(), plan: { industries: plan.industries, states: plan.states, gaps: plan.gaps, warnings: plan.warnings }, tasks: [], log_sha256: {} };
  let receiptWrite = Promise.resolve();
  const persist = () => { receiptWrite = receiptWrite.then(async () => { const temp = `${receiptPath}.tmp`; await writeFile(temp, JSON.stringify(receipt, null, 2)); const { rename } = await import("node:fs/promises"); await rename(temp, receiptPath); }); return receiptWrite; };
  await persist();
  if (plan.tasks.length === 0) { receipt.status = "failed"; receipt.error = "Plan contains no executable tasks."; receipt.finished_at = new Date().toISOString(); await persist(); return { receiptPath, receipt }; }
  const prerequisiteErrors = [];
  for (const task of plan.tasks) { try { await checkPrerequisites(task); } catch (error) { prerequisiteErrors.push({ task, error }); } }
  if (prerequisiteErrors.length) {
    for (const task of plan.tasks) { const failure = prerequisiteErrors.find((item) => item.task.id === task.id); receipt.tasks.push({ task_id: task.id, source_id: task.sourceId, state: task.state ?? null, status: failure ? "failed" : "cancelled", error: failure?.error.message }); }
    receipt.status = "failed"; receipt.finished_at = new Date().toISOString(); await persist(); return { receiptPath, receipt };
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < plan.tasks.length && !signal?.aborted) {
      const task = plan.tasks[cursor++];
      const record = { task_id: task.id, source_id: task.sourceId, state: task.state ?? null, status: "running", started_at: new Date().toISOString() };
      receipt.tasks.push(record); await persist();
      if (signal?.aborted) { record.status = "cancelled"; record.finished_at = new Date().toISOString(); await persist(); break; }
      try {
        const result = await executor(task, { runDir, runId: plan.runId, outputRoot: runDir, signal });
        const succeeded = result?.code === 0 || result?.ok === true || result?.status === "succeeded";
        Object.assign(record, result);
        record.status = signal?.aborted ? "cancelled" : succeeded ? "succeeded" : "failed";
      } catch (error) { record.status = "failed"; record.error = error.message; }
      record.finished_at = new Date().toISOString(); await persist();
    }
  };
  const workers = Array.from({ length: Math.min(plan.maxConcurrency, plan.tasks.length || 1) }, () => worker());
  await Promise.all(workers);
  if (signal?.aborted) receipt.status = "cancelled";
  else receipt.status = receipt.tasks.some((task) => task.status === "failed") ? "failed" : "succeeded";
  receipt.finished_at = new Date().toISOString();
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
  return { receiptPath, receipt };
}
