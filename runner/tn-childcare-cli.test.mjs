import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { APP_ROOT } from "./paths.mjs";

test("TN metadata CLI cancels its actual child request through app IPC", { timeout: 10000 }, async (t) => {
  const child = spawn(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/preflight-tn-childcare.mjs"], {
    cwd: APP_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const exit = once(child, "exit"); let requests = 0, output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const timer = setTimeout(() => child.kill(), 5000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill(); });
  child.on("message", (message) => {
    if (message.type === "fixture-request") { requests++; child.send({ type: "cancel" }); }
  });
  const [code, signal] = await exit;
  assert.equal(requests, 1, output); assert.equal(code, 1, output); assert.equal(signal, null, output);
  assert.match(output, /Tennessee childcare preflight failed/);
  assert.doesNotMatch(output, /metadata-preflight-passed/);
});
