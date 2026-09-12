import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { APP_ROOT } from "./paths.mjs";
import { createDevStopControl, readDevSession, requestDevStop } from "./dev-stop-control.mjs";

async function fixture() {
  const parent = path.join(APP_ROOT, "data", "tmp"); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "dev-stop-"));
  return root;
}

test("restart preflight permits no running instance but still rejects ambiguity", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await requestDevStop({ root, ifRunning: true }), null);
  const first = await createDevStopControl({ root, stop: () => assert.fail("unexpected stop") });
  const second = await createDevStopControl({ root, stop: () => assert.fail("unexpected stop") });
  try { await assert.rejects(requestDevStop({ root, ifRunning: true }), /found 2/); }
  finally { await first.close(); await second.close(); }
  assert.equal(await requestDevStop({ root, ifRunning: true }), null);
});

test("explicit development stop is observed once and records a terminal receipt", async (t) => {
  const root = await fixture(); let calls = 0;
  const control = await createDevStopControl({ root, intervalMs: 10, stop: async () => { calls++; await control.close(); } });
  t.after(async () => { await control.close(); await rm(root, { recursive: true, force: true }); });
  const requested = await requestDevStop({ root }); assert.equal(requested.id, control.id);
  const deadline = Date.now() + 2000;
  let receipt;
  do { await delay(10); receipt = await readDevSession({ root, id: control.id }); } while (receipt.status !== "STOPPED" && Date.now() < deadline);
  assert.equal(receipt.status, "STOPPED"); assert.equal(calls, 1);
  assert.equal((await requestDevStop({ root, id: control.id })).status, "STOPPED");
  assert.equal(calls, 1);
});

test("development stop never selects ambiguous or dead sessions and validates IDs", async (t) => {
  const root = await fixture();
  const first = await createDevStopControl({ root, stop: () => assert.fail("no stop") });
  const second = await createDevStopControl({ root, stop: () => assert.fail("no stop") });
  t.after(async () => { await first.close(); await second.close(); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(requestDevStop({ root }), /found 2/);
  await assert.rejects(requestDevStop({ root, id: first.id, isAlive: () => false }), /not live/);
  await assert.rejects(requestDevStop({ root, id: "../elsewhere" }), /Invalid/);
  await assert.rejects(readFile(path.join(root, first.id, "stop.json")), { code: "ENOENT" });
});

test("wrong session stop identity does not stop its owner or alter unrelated files", async (t) => {
  const root = await fixture(); let calls = 0;
  const control = await createDevStopControl({ root, intervalMs: 10, stop: async () => { calls++; } });
  t.after(async () => { await control.close(); await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, control.id, "stop.json"), JSON.stringify({ version: 1, id: "wrong" }));
  await delay(40); assert.equal(calls, 0);
  assert.equal((await readDevSession({ root, id: control.id })).status, "RUNNING");
});
