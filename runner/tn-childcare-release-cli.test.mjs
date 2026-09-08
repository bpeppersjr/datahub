import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

test("TN release CLI help invalid flags and escaped output do not request data", () => {
  for (const script of ["scripts/build-tn-childcare.mjs", "scripts/verify-tn-childcare.mjs"]) for (const [args, code] of [[["--help"], 0], [["--url", "https://invalid.example"], 1]]) {
    const child = spawnSync(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", script, ...args], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(child.error, undefined); assert.equal(child.status, code); assert.match(code ? child.stderr : child.stdout, code ? /failed/ : /Usage/);
  }
  const child = spawnSync(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/build-tn-childcare.mjs", "--output", ".."], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 1);
});
test("TN actual CLI cancels through app IPC and cleans owned staging and lock", { timeout: 10000 }, async (t) => {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/tn-cli-cancel-")); t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = path.join(root, "output");
  const child = spawn(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/build-tn-childcare.mjs", "--output", outputRoot], { cwd: APP_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const exit = once(child, "exit"); let output = "", requests = 0;
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  const timer = setTimeout(() => child.kill(), 5000); t.after(() => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill(); });
  child.on("message", (message) => { if (message.type === "fixture-request") { requests++; child.send({ type: "cancel" }); } });
  const [code, signal] = await exit; assert.equal(requests, 1, output); assert.equal(code, 1, output); assert.equal(signal, null, output);
  await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" }); await assert.rejects(readFile(path.join(outputRoot, ".publish.lock")), { code: "ENOENT" });
  assert.deepEqual(await readdir(path.join(outputRoot, ".staging")), []);
});
