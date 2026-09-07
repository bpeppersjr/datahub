import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

test("Massachusetts childcare CLI help and invalid options perform no acquisition", () => {
  for (const script of ["scripts/build-ma-childcare.mjs", "scripts/verify-ma-childcare.mjs"]) {
    for (const [args, code] of [[["--help"], 0], [["--url", "https://example.invalid"], 1]]) {
      const child = spawnSync(process.execPath, [script, ...args], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true, timeout: 5000 });
      assert.equal(child.error, undefined); assert.equal(child.status, code, child.stderr);
      assert.match(code ? child.stderr : child.stdout, code ? /failed/ : /Usage/);
    }
  }
  const missing = spawnSync(process.execPath, ["scripts/verify-ma-childcare.mjs"], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /manifest path is required/);
});

test("Massachusetts childcare actual CLI stops acquisition through app IPC", { timeout: 10000 }, async (t) => {
  const root = await mkdtemp(path.join(APP_ROOT, "data", "tmp", "ma-cli-cancel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = path.join(root, "output");
  // The test preload replaces fetch with a cancellable pending request; no network.
  const child = spawn(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/build-ma-childcare.mjs", "--output", outputRoot], {
    cwd: APP_ROOT, stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  const exit = once(child, "exit"); let output = "", requests = 0;
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  const timer = setTimeout(() => child.kill(), 5000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill(); });
  child.on("message", (message) => { if (message.type === "fixture-request") { requests++; child.send({ type: "cancel" }); } });
  const [code, signal] = await exit;
  assert.equal(requests, 1, output); assert.equal(code, 1, output); assert.equal(signal, null, output);
  await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(outputRoot, ".publish.lock")), { code: "ENOENT" });
  const staged = await readdir(path.join(outputRoot, ".staging")).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
  assert.deepEqual(staged, []);
});
