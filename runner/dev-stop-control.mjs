import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { setTimeout as delay } from "node:timers/promises";

const defaultRoot = path.join(APP_ROOT, "data", "dev-runtime");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function replaceFile(from, to) {
  for (let attempt = 0; ; attempt++) {
    try { await rename(from, to); return; }
    catch (error) { if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 10) throw error; await delay(20 * (attempt + 1)); }
  }
}
async function safeRoot(root) {
  const absolute = assertInsideApp(path.resolve(root));
  await mkdir(absolute, { recursive: true });
  if (await realpath(absolute) !== absolute) throw new Error("Development control storage contains a redirected path.");
  return absolute;
}
async function safeSession(root, id) {
  if (!uuid.test(id)) throw new Error("Invalid development session ID.");
  const directory = path.join(root, id);
  if (await realpath(directory) !== directory) throw new Error("Development session path was redirected.");
  return directory;
}
async function publish(directory, record) {
  const temporary = path.join(directory, `session-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(record), { flag: "wx" });
  await replaceFile(temporary, path.join(directory, "session.json"));
}
async function readSession(root, id) {
  const directory = await safeSession(root, id);
  const record = JSON.parse(await readFile(path.join(directory, "session.json"), "utf8"));
  if (record.version !== 1 || record.id !== id || !Number.isInteger(record.pid) || record.pid < 1 || !["RUNNING", "STOPPING", "STOPPED"].includes(record.status)) throw new Error("Invalid development session receipt.");
  return { directory, record };
}

export async function createDevStopControl({ stop, root = defaultRoot, intervalMs = 500 } = {}) {
  if (typeof stop !== "function") throw new Error("Development stop callback is required.");
  const base = await safeRoot(root), id = randomUUID(), directory = path.join(base, id);
  await mkdir(directory);
  const record = { version: 1, id, pid: process.pid, status: "RUNNING", createdAt: new Date().toISOString() };
  await publish(directory, record);
  let closed = false, pending = false;
  const timer = setInterval(async () => {
    if (closed || pending) return;
    pending = true;
    try {
      await safeSession(base, id);
      const request = JSON.parse(await readFile(path.join(directory, "stop.json"), "utf8"));
      if (request.version !== 1 || request.id !== id) return;
      record.status = "STOPPING";
      await publish(directory, record);
      clearInterval(timer);
      await stop();
    } catch (error) {
      if (error.code !== "ENOENT") { clearInterval(timer); console.error("Development stop request requires inspection."); }
    } finally { pending = false; }
  }, intervalMs);
  timer.unref();
  return { id, async close() {
    if (closed) return;
    closed = true; clearInterval(timer);
    await safeSession(base, id);
    record.status = "STOPPED"; record.finishedAt = new Date().toISOString();
    await publish(directory, record);
  } };
}

export async function requestDevStop({ root = defaultRoot, id, isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } } } = {}) {
  const base = await safeRoot(root);
  let selected = id;
  if (!selected) {
    const sessions = [];
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || !uuid.test(entry.name)) continue;
      const { record } = await readSession(base, entry.name);
      if (record.status !== "STOPPED" && isAlive(record.pid)) sessions.push(record.id);
    }
    if (sessions.length !== 1) throw new Error(`Expected one live development session; found ${sessions.length}. Supply --run-id for an explicit session.`);
    [selected] = sessions;
  }
  const { directory, record } = await readSession(base, selected);
  if (record.status === "STOPPED") return record;
  if (!isAlive(record.pid)) throw new Error("Development launcher is not live; inspect its retained receipts without deleting locks.");
  const request = { version: 1, id: selected };
  // Atomic no-replace publication is unnecessary here: concurrent callers write
  // exactly the same request via an atomic rename, never changing its identity.
  const temporary = path.join(directory, `stop-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(request), { flag: "wx" });
  await replaceFile(temporary, path.join(directory, "stop.json"));
  return record;
}

export async function readDevSession({ root = defaultRoot, id }) {
  return (await readSession(await safeRoot(root), id)).record;
}
