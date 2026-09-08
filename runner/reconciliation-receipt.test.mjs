import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { writeReconciliationReceipt } from "./reconciliation-receipt.mjs";

async function fixture(t) {
  await mkdir(path.join(APP_ROOT, "data/tmp"), { recursive: true });
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/receipt-sharing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "receipt.json"); await writeFile(file, '{"stopRequested":false}\n'); return { root, file };
}
test("receipt snapshot survives transient Windows sharing failures without losing last good receipt", async t => {
  const { root, file } = await fixture(t), value = { stopRequested: true }, waits = []; let calls = 0;
  const pending = writeReconciliationReceipt(file, value, { platform: "win32", sleep: async ms => { waits.push(ms); }, renameImpl: async (from, to) => {
    calls++; assert.equal(JSON.parse(await readFile(file)).stopRequested, false);
    if (calls <= 3) throw Object.assign(new Error("sharing"), { code: ["EPERM", "EACCES", "EBUSY"][calls - 1] });
    return rename(from, to);
  } });
  value.stopRequested = false;
  await pending; assert.equal(JSON.parse(await readFile(file)).stopRequested, true); assert.equal(calls, 4);
  assert.deepEqual(waits, [20, 40, 60]); assert.deepEqual(await readdir(root), ["receipt.json"]);
});
test("receipt retries are bounded and exhaustion preserves prior bytes and cleans owned temporary", async t => {
  const { root, file } = await fixture(t), original = await readFile(file); let calls = 0; const waits = [];
  await assert.rejects(writeReconciliationReceipt(file, { next: true }, { platform: "win32", sleep: async ms => { waits.push(ms); }, renameImpl: async () => {
    calls++; throw Object.assign(new Error("permanent sharing"), { code: "EPERM" });
  } }), { code: "EPERM" });
  assert.equal(calls, 10); assert.equal(waits.reduce((a,b) => a+b, 0), 900);
  assert.deepEqual(await readFile(file), original); assert.deepEqual(await readdir(root), ["receipt.json"]);
});
test("receipt does not retry disk exhaustion or non-Windows permission errors", async t => {
  const { root, file } = await fixture(t), original = await readFile(file);
  for (const [platform, code] of [["win32", "ENOSPC"], ["win32", "ENOENT"], ["linux", "EPERM"]]) {
    let calls = 0;
    await assert.rejects(writeReconciliationReceipt(file, {}, { platform, sleep: () => assert.fail("unexpected retry"), renameImpl: async () => {
      calls++; throw Object.assign(new Error("unretryable"), { code });
    } }), { code });
    assert.equal(calls, 1); assert.deepEqual(await readFile(file), original); assert.deepEqual(await readdir(root), ["receipt.json"]);
  }
});
test("receipt cleanup never removes a foreign replacement temporary", async t => {
  const { root, file } = await fixture(t); let replaced;
  await assert.rejects(writeReconciliationReceipt(file, {}, { platform: "win32", renameImpl: async from => {
    await rename(from, path.join(root, "owned-original")); await writeFile(from, "foreign"); replaced = from;
    throw Object.assign(new Error("stop"), { code: "ENOSPC" });
  } }), { code: "ENOSPC" });
  assert.equal(await readFile(replaced, "utf8"), "foreign");
});
