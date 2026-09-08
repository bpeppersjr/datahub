import { randomUUID } from "node:crypto";
import { open, rename, lstat, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

/** Persist a snapshot despite brief Windows reader/antivirus sharing contention.
 * Callers serialize mutations. Stop signals intentionally do not cancel their own receipt.
 * Dependency overrides are for deterministic local fault tests, not runtime configuration.
 */
export async function writeReconciliationReceipt(file, value, { renameImpl = rename, sleep = ms => delay(ms), platform = process.platform } = {}) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`, temporary = `${file}.tmp-${randomUUID()}`;
  let identity;
  try {
    const handle = await open(temporary, "wx");
    try {
      identity = await handle.stat({ bigint: true });
      await handle.writeFile(bytes); await handle.sync();
    } finally { await handle.close(); }
    for (let attempt = 0; ; attempt++) {
      const current = await lstat(temporary, { bigint: true });
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error("Receipt temporary ownership changed; inspection required.");
      try { await renameImpl(temporary, file); return; }
      catch (error) {
        if (platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 9) throw error;
        await sleep((attempt + 1) * 20);
      }
    }
  } finally {
    if (identity) {
      let remaining;
      try { remaining = await lstat(temporary, { bigint: true }); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (remaining?.isFile() && !remaining.isSymbolicLink() && remaining.nlink === 1n && remaining.dev === identity.dev && remaining.ino === identity.ino) await unlink(temporary);
    }
  }
}
