import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";

const pathIdentity = (value) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);

// These are exclusion receipts, not expiring leases. A dead PID never authorizes reclamation.
async function checkedDirectory(directory, create = false) {
  const absolute = path.resolve(directory);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (create) {
      try { await mkdir(cursor); } catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    const stat = await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink() || pathIdentity(await realpath(cursor)) !== pathIdentity(cursor)) {
      throw new Error("Industry source lock directory must not contain linked or non-directory paths.");
    }
  }
  return absolute;
}

function identity(task) {
  if (!task || typeof task.sourceId !== "string" || !/^[a-z0-9-]+$/.test(task.sourceId)) throw new Error("Invalid industry source lock sourceId.");
  if (!["national", "state"].includes(task.scope)) throw new Error("Invalid industry source lock scope.");
  if (task.scope === "state" && !/^[A-Z]{2}$/.test(task.state ?? "")) throw new Error("State source lock requires an uppercase state code.");
  const state = task.scope === "state" ? task.state : null;
  return { source_id: task.sourceId, scope: task.scope, state, task_id: `${task.sourceId}:${state ?? "national"}` };
}

export async function acquireIndustrySourceLocks(tasks, { runId, root = APP_ROOT } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(runId ?? "")) throw new Error("Source lock runId must be a short filesystem-safe identifier.");
  if (!Array.isArray(tasks)) throw new Error("Industry source lock tasks must be an array.");
  const identities = [...new Map(tasks.map((task) => { const value = identity(task); return [value.task_id, value]; })).values()].sort((a, b) => a.task_id.localeCompare(b.task_id));
  const scripts = new Set();
  for (const task of tasks) if (task.script !== undefined) {
    if (typeof task.script !== "string" || !task.script.endsWith(".mjs")) throw new Error("Invalid source lock executable.");
    const file = assertInsideApp(path.resolve(APP_ROOT, task.script));
    await checkedDirectory(path.dirname(file));
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || pathIdentity(await realpath(file)) !== pathIdentity(file)) throw new Error("Source lock executable must not be linked.");
    const relative = path.relative(APP_ROOT, file).replaceAll("\\", "/");
    scripts.add(process.platform === "win32" ? relative.toLowerCase() : relative);
  }
  // Builders currently have fixed publisher scope and receive no --state argument.
  // Reserve their executable too, preventing custom config aliases from duplicating a pull.
  for (const script of [...scripts].sort()) identities.push({ source_id: null, scope: "executable", state: null, executable_path: script, task_id: `executable:${script}` });
  const directory = path.join(assertInsideApp(path.resolve(root)), "data", "industry-segments", "source-locks");
  await checkedDirectory(directory, true);
  const owned = [];
  const release = async () => {
    await checkedDirectory(directory);
    const errors = [];
    for (const item of [...owned].reverse()) {
      try {
        const stat = await lstat(item.file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Source lock ownership changed for ${item.receipt.task_id}; retained for inspection.`);
        const current = JSON.parse(await readFile(item.file, "utf8"));
        if (current.token !== item.receipt.token || current.run_id !== runId) throw new Error(`Source lock ownership changed for ${item.receipt.task_id}; retained for inspection.`);
        await unlink(item.file);
        owned.splice(owned.indexOf(item), 1);
      } catch (error) {
        if (error.code === "ENOENT") owned.splice(owned.indexOf(item), 1);
        else errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Source lock ownership or receipt could not be verified for release; inspect source-locks before retrying.");
  };
  try {
    for (const item of identities) {
      await checkedDirectory(directory);
      const key = createHash("sha256").update(JSON.stringify([item.source_id, item.scope, item.state, item.executable_path ?? null])).digest("hex");
      const file = path.join(directory, `${key}.json`);
      const receipt = { version: 1, ...item, run_id: runId, pid: process.pid, token: randomUUID(), acquired_at: new Date().toISOString() };
      let handle;
      try { handle = await open(file, "wx"); } catch (error) {
        if (error.code === "EEXIST") throw new Error(`Source acquisition already reserved for ${item.task_id}. Inspect data/industry-segments/source-locks/${key}.json and the owning run receipt; do not reclaim based only on PID or age.`);
        throw error;
      }
      // Track ownership before writing so errors do not silently forget a reservation.
      owned.push({ file, receipt });
      try { await handle.writeFile(JSON.stringify(receipt, null, 2)); await handle.sync(); } finally { await handle.close(); }
    }
  } catch (error) {
    try { await release(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], `${error.message} Partial lock cleanup requires inspection.`); }
    throw error;
  }
  return { locks: owned.map(({ receipt }) => ({ ...receipt })), release };
}
