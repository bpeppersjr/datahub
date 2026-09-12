import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { industryPlanFingerprint } from "./industry-segments.mjs";

const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN"]);
const clone = (value) => structuredClone(value);
const invalid = (message, code = "INVALID_SCHEDULE") => Object.assign(new Error(message), { code, statusCode: 400 });
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const digest = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
export function schedulerOwnerIsDead(pid, probe = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { probe(pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}
function selection(value, regex) {
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== "string" || !regex.test(item))) throw invalid("Explicit non-empty industry and state selections are required.");
  return [...new Set(value)].sort();
}
function normalize(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["industries", "states", "intervalHours", "enabled"].includes(key))) throw invalid("Unsupported schedule fields.");
  if (!Number.isInteger(input.intervalHours) || input.intervalHours < 24 || input.intervalHours > 8760) throw invalid("intervalHours must be an integer from 24 through 8760.");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw invalid("enabled must be boolean.");
  return { industries: selection(input.industries, /^[a-z0-9-]+$/), states: selection(input.states, /^[A-Z]{2}$/), intervalHours: input.intervalHours, enabled: input.enabled ?? false };
}
function planIdentity(plan) {
  if (!plan || !Number.isInteger(plan.taskCount) || plan.taskCount < 1 || !Array.isArray(plan.tasks) || plan.tasks.length !== plan.taskCount) throw invalid("Schedule requires an executable plan.");
  const resources = [...new Set(plan.tasks.flatMap((task) => {
    if (typeof task.sourceId !== "string" || !/^[a-z0-9-]+$/.test(task.sourceId) || typeof task.script !== "string" || !task.script.endsWith(".mjs")) throw invalid("Invalid schedule plan resources.");
    const script = assertInsideApp(path.resolve(APP_ROOT, task.script));
    return [`source:${task.sourceId}`, `script:${process.platform === "win32" ? script.toLowerCase() : script}`];
  }))].sort();
  return { planHash: industryPlanFingerprint(plan), resources };
}

export class ManagedRefreshScheduler {
  constructor({ operations, root = "data/refresh-schedules", now = () => new Date().toISOString(), intervalMs = 60_000, autoStart = true } = {}) {
    if (!operations || !["plan", "get", "startScheduledCollection"].every((key) => typeof operations[key] === "function")) throw invalid("Managed operations implementation is required.");
    if (!Number.isInteger(intervalMs) || intervalMs < 10) throw invalid("Invalid scheduler poll interval.");
    this.operations = operations; this.root = assertInsideApp(path.resolve(APP_ROOT, root));
    if (this.root === APP_ROOT) throw invalid("Scheduler requires a dedicated storage directory.");
    this.now = now; this.closed = false; this.queue = Promise.resolve(); this.schedules = []; this.ownerToken = randomUUID();
    this.ready = this.initialize();
    if (autoStart) this.ready.then(() => { if (!this.closed) { this.timer = setInterval(() => { this.tick().catch(() => { this.runtimeError = "SCHEDULER_STORAGE_OR_RUNTIME_FAILURE"; clearInterval(this.timer); }); }, intervalMs); this.timer.unref(); } }, () => {});
  }
  time() { const value = this.now(); if (!validDate(value)) throw invalid("Scheduler clock is invalid."); return new Date(value).toISOString(); }
  async safePath(file, directory = false) {
    const relative = path.relative(APP_ROOT, file);
    let current = APP_ROOT;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      try { const info = await lstat(current); if (info.isSymbolicLink() || (current !== file && !info.isDirectory())) throw invalid("Scheduler storage contains a link or invalid path."); }
      catch (error) { if (error.code !== "ENOENT") throw error; if (directory || current !== file) await mkdir(current); }
    }
    const canonical = await realpath(directory ? file : path.dirname(file));
    const rel = path.relative(await realpath(APP_ROOT), canonical);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw invalid("Scheduler storage must remain inside datahub.");
  }
  async initialize() {
    await this.safePath(this.root, true);
    this.lockPath = path.join(this.root, "owner.lock"); this.statePath = path.join(this.root, "state.json");
    const recoveryPath = path.join(this.root, 'recovery.lock');
    await this.safePath(recoveryPath);
    let guard;
    try { guard = await open(recoveryPath, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') throw invalid('Scheduler recovery or initialization is in progress or interrupted; inspect recovery.lock before restarting.', 'SCHEDULER_OWNERSHIP_CONFLICT'); throw error; }
    try {
    await guard.writeFile(JSON.stringify({ pid: process.pid, createdAt: this.time() })); await guard.sync();
    await this.safePath(this.lockPath);
    try { this.lock = await open(this.lockPath, "wx"); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await this.recoverDeadOwner();
      try { this.lock = await open(this.lockPath, 'wx'); }
      catch (error) { if (error.code === 'EEXIST') throw invalid('Another scheduler acquired ownership after recovery.', 'SCHEDULER_OWNERSHIP_CONFLICT'); throw error; }
    }
    try {
      await this.lock.writeFile(JSON.stringify({ token: this.ownerToken, pid: process.pid })); await this.lock.sync();
      await this.safePath(this.statePath);
      let state; let exists = true;
      try { state = JSON.parse(await readFile(this.statePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw invalid("Stored scheduler state is malformed; inspect before restarting."); exists = false; }
      if (exists) {
        if (!state || state.version !== 1 || !Array.isArray(state.schedules) || Object.keys(state).some((key) => !["version", "schedules"].includes(key))) throw invalid("Unsupported stored scheduler state.");
        const ids = new Set();
        for (const schedule of state.schedules) {
          if (!schedule || Object.keys(schedule).some((key) => !["id", "industries", "states", "intervalHours", "enabled", "planHash", "resources", "createdAt", "status", "nextDueAt", "lastOccurrence", "reason"].includes(key))) throw invalid("Unsupported stored schedule fields.");
          if (typeof schedule.enabled !== "boolean" || (schedule.lastOccurrence !== null && (typeof schedule.lastOccurrence !== "object" || Array.isArray(schedule.lastOccurrence)))) throw invalid("Stored schedule fields are malformed.");
          const normalized = normalize({ industries: schedule.industries, states: schedule.states, intervalHours: schedule.intervalHours, enabled: schedule.enabled });
          if (!/^[a-f0-9-]{36}$/.test(schedule.id) || ids.has(schedule.id) || !/^[a-f0-9]{64}$/.test(schedule.planHash) || !Array.isArray(schedule.resources) || !schedule.resources.length || schedule.resources.some((v) => typeof v !== "string") || !["READY", "DISABLED", "RUNNING", "PAUSED"].includes(schedule.status) || !validDate(schedule.createdAt) || (schedule.nextDueAt !== null && !validDate(schedule.nextDueAt)) || JSON.stringify(normalized.industries) !== JSON.stringify(schedule.industries) || JSON.stringify(normalized.states) !== JSON.stringify(schedule.states)) throw invalid("Stored schedule is malformed.");
          const occurrence = schedule.lastOccurrence;
          if (occurrence && (!/^refresh-[a-f0-9]{48}$/.test(occurrence.operationId) || !["DISPATCHING", "RUNNING", ...terminal].includes(occurrence.status) || !validDate(occurrence.dueAt) || !validDate(occurrence.createdAt))) throw invalid("Stored schedule occurrence is malformed.");
          if (occurrence && (Object.keys(occurrence).some((key) => !["operationId", "status", "dueAt", "createdAt", "finishedAt"].includes(key)) || occurrence.operationId !== `refresh-${digest({ id: schedule.id, dueAt: occurrence.dueAt }).slice(0, 48)}` || (occurrence.finishedAt !== undefined && !validDate(occurrence.finishedAt)))) throw invalid("Stored schedule occurrence identity is invalid.");
          if (schedule.reason !== null && (typeof schedule.reason !== "string" || !/^[A-Z_]{1,100}$/.test(schedule.reason))) throw invalid("Stored schedule reason is invalid.");
          if ((schedule.enabled && !["READY", "RUNNING"].includes(schedule.status)) || (!schedule.enabled && schedule.status === "READY") || (schedule.enabled && !validDate(schedule.nextDueAt)) || (schedule.status === "RUNNING" && (!occurrence || !["RUNNING", "DISPATCHING"].includes(occurrence.status)))) throw invalid("Stored schedule state is inconsistent.");
          ids.add(schedule.id);
        }
        this.schedules = state.schedules;
        for (const schedule of this.schedules) {
          try {
            const identity = planIdentity(await this.operations.plan({ industries: schedule.industries, states: schedule.states }));
            if (identity.planHash !== schedule.planHash || JSON.stringify(identity.resources) !== JSON.stringify(schedule.resources)) this.pause(schedule, "PLAN_DRIFT_REQUIRES_REVIEW");
          } catch { this.pause(schedule, "PLAN_VALIDATION_FAILED"); }
        }
        for (const schedule of this.schedules.filter((item) => item.enabled)) this.assertNoOverlap(schedule);
        await this.persist();
      } else await this.persist();
    } catch (error) { await this.releaseLock(); throw error; }
    } finally {
      await guard.close();
      if (!this.recoveryInterrupted) await unlink(recoveryPath);
    }
  }
  async recoverDeadOwner() {
    // Only an ESRCH probe proves a local process is gone. PID reuse, EPERM,
    // malformed ownership, and interrupted recovery all require inspection.
    let archived = false, completed = false;
    try {
      await this.safePath(this.lockPath);
      const original = await readFile(this.lockPath);
      let owner;
      try { owner = JSON.parse(original); } catch { throw invalid('Malformed scheduler owner requires inspection.', 'SCHEDULER_OWNERSHIP_CONFLICT'); }
      if (!owner || typeof owner.token !== 'string' || !/^[a-f0-9-]{36}$/.test(owner.token) || !schedulerOwnerIsDead(owner.pid)) throw invalid('Scheduler owner is live, unknown, or malformed; ownership was preserved.', 'SCHEDULER_OWNERSHIP_CONFLICT');
      const recoveryId = randomUUID();
      const archiveName = `owner-dead-${recoveryId}.lock`;
      const receiptPath = path.join(this.root, `recovery-${recoveryId}.json`);
      const archivePath = path.join(this.root, archiveName);
      await this.safePath(archivePath); await this.safePath(receiptPath); await this.safePath(this.statePath);
      const stateBytes = await readFile(this.statePath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (!original.equals(await readFile(this.lockPath)) || !schedulerOwnerIsDead(owner.pid)) throw invalid('Scheduler owner changed during recovery; inspect ownership.', 'SCHEDULER_OWNERSHIP_CONFLICT');
      await rename(this.lockPath, archivePath); archived = true;
      const receipt = await open(receiptPath, 'wx');
      try {
        await receipt.writeFile(`${JSON.stringify({ version: 1, recoveryId, status: 'CONFIRMED_DEAD_OWNER_ARCHIVED', recoveredAt: this.time(), previousPid: owner.pid, ownerProbe: 'ESRCH', archivedOwner: archiveName, ownerSha256: createHash('sha256').update(original).digest('hex'), stateSha256: stateBytes ? createHash('sha256').update(stateBytes).digest('hex') : null, schedulesChanged: false, dispatchedOperations: 0 }, null, 2)}\n`);
        await receipt.sync();
      } finally { await receipt.close(); }
      completed = true;
    } finally {
      // Preserve an interrupted archive/receipt transition for inspection.
      this.recoveryInterrupted = archived && !completed;
    }
  }
  async persist() {
    try {
    await this.safePath(this.statePath);
    const temporary = path.join(this.root, `state-${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx");
    try { await handle.writeFile(`${JSON.stringify({ version: 1, schedules: this.schedules }, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, this.statePath);
    } catch (error) { this.runtimeError = "SCHEDULER_STORAGE_FAILURE_REQUIRES_INSPECTION"; throw error; }
  }
  run(action) {
    const pending = this.queue.then(async () => { await this.ready; if (this.closed) throw invalid("Scheduler is closed."); if (this.runtimeError) throw invalid(this.runtimeError); return action(); });
    this.queue = pending.catch(() => {}); return pending;
  }
  assertNoOverlap(schedule) {
    if (this.schedules.some((other) => other.id !== schedule.id && other.enabled && other.resources.some((key) => schedule.resources.includes(key)))) throw invalid("Enabled schedules may not share a source or executable.", "SCHEDULE_OVERLAP");
  }
  list() { return this.run(() => clone(this.schedules)); }
  create(input) { return this.run(async () => {
    const normalized = normalize(input); const identity = planIdentity(await this.operations.plan({ industries: normalized.industries, states: normalized.states }));
    const time = this.time(); const schedule = { id: randomUUID(), ...normalized, ...identity, createdAt: time, status: normalized.enabled ? "READY" : "DISABLED", nextDueAt: normalized.enabled ? time : null, lastOccurrence: null, reason: null };
    if (schedule.enabled) this.assertNoOverlap(schedule);
    this.schedules.push(schedule); await this.persist(); return clone(schedule);
  }); }
  setEnabled(id, enabled) { return this.run(async () => {
    if (typeof enabled !== "boolean") throw invalid("enabled must be boolean.");
    const schedule = this.schedules.find((item) => item.id === id); if (!schedule) return null;
    if (enabled) {
      const identity = planIdentity(await this.operations.plan({ industries: schedule.industries, states: schedule.states }));
      if (identity.planHash !== schedule.planHash || JSON.stringify(identity.resources) !== JSON.stringify(schedule.resources)) throw invalid("Plan changed; create a newly reviewed schedule.", "SCHEDULE_PLAN_DRIFT");
      this.assertNoOverlap(schedule);
      if (schedule.lastOccurrence && ["DISPATCHING", "UNKNOWN"].includes(schedule.lastOccurrence.status)) throw invalid("Unresolved occurrence requires inspection before enabling.");
    }
    schedule.enabled = enabled; schedule.reason = null;
    schedule.status = schedule.lastOccurrence?.status === "RUNNING" ? "RUNNING" : enabled ? "READY" : "DISABLED";
    schedule.nextDueAt = enabled ? schedule.nextDueAt ?? this.time() : null;
    await this.persist(); return clone(schedule);
  }); }
  pause(schedule, reason) { schedule.enabled = false; schedule.status = "PAUSED"; schedule.nextDueAt = null; schedule.reason = reason; }
  tick() { return this.run(async () => {
    let busy = false;
    for (const schedule of this.schedules) {
      const occurrence = schedule.lastOccurrence;
      if (!occurrence || !["DISPATCHING", "RUNNING"].includes(occurrence.status)) continue;
      const operation = await this.operations.get(occurrence.operationId);
      if (!operation || operation.id !== occurrence.operationId || !["QUEUED", "RUNNING", ...terminal].includes(operation.status)) { this.pause(schedule, "UNRESOLVED_DISPATCH_REQUIRES_INSPECTION"); occurrence.status = "UNKNOWN"; }
      else if (terminal.has(operation.status)) {
        occurrence.status = operation.status; occurrence.finishedAt = this.time();
        if (operation.status === "SUCCEEDED") { schedule.status = schedule.enabled ? "READY" : "DISABLED"; schedule.nextDueAt = schedule.enabled ? new Date(Date.parse(this.time()) + schedule.intervalHours * 3_600_000).toISOString() : null; }
        else this.pause(schedule, "OPERATION_NOT_SUCCESSFUL_REQUIRES_INSPECTION");
      } else { occurrence.status = "RUNNING"; busy = true; }
      await this.persist();
    }
    if (busy || this.closed) return clone(this.schedules);
    for (const schedule of this.schedules) {
      if (!schedule.enabled || !schedule.nextDueAt || Date.parse(schedule.nextDueAt) > Date.parse(this.time())) continue;
      let identity;
      try { identity = planIdentity(await this.operations.plan({ industries: schedule.industries, states: schedule.states })); }
      catch { this.pause(schedule, "PLAN_VALIDATION_FAILED"); await this.persist(); continue; }
      if (identity.planHash !== schedule.planHash || JSON.stringify(identity.resources) !== JSON.stringify(schedule.resources)) { this.pause(schedule, "PLAN_DRIFT_REQUIRES_REVIEW"); await this.persist(); continue; }
      if (this.closed) break;
      const previous = schedule.lastOccurrence;
      const occurrence = { operationId: `refresh-${digest({ id: schedule.id, dueAt: schedule.nextDueAt }).slice(0, 48)}`, status: "DISPATCHING", dueAt: schedule.nextDueAt, createdAt: this.time() };
      schedule.lastOccurrence = occurrence; schedule.status = "RUNNING"; await this.persist();
      if (this.closed) { schedule.lastOccurrence = previous; schedule.status = "READY"; await this.persist(); break; }
      try {
        const operation = await this.operations.startScheduledCollection({ industries: schedule.industries, states: schedule.states }, { operationId: occurrence.operationId, expectedPlanHash: schedule.planHash });
        if (!operation || operation.id !== occurrence.operationId) throw invalid("Operation dispatch receipt did not match.");
        occurrence.status = "RUNNING"; await this.persist();
      } catch (error) {
        if (error.code === "OPERATION_CONFLICT" && error.retryable === true) { schedule.lastOccurrence = previous; schedule.status = "READY"; schedule.reason = "DEFERRED_OPERATION_BUSY"; }
        else this.pause(schedule, "DISPATCH_FAILED_REQUIRES_INSPECTION");
        await this.persist();
      }
      break;
    }
    return clone(this.schedules);
  }); }
  async releaseLock() {
    if (!this.lock) return;
    await this.lock.close(); this.lock = null;
    await this.safePath(this.lockPath);
    const owner = JSON.parse(await readFile(this.lockPath, "utf8"));
    if (owner.token === this.ownerToken) await unlink(this.lockPath);
  }
  async close() { this.closed = true; clearInterval(this.timer); await this.ready.catch(() => {}); await this.queue; await this.releaseLock(); }
}

export function createManagedRefreshScheduler(options) { return new ManagedRefreshScheduler(options); }
