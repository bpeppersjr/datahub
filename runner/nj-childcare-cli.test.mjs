import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { APP_ROOT } from "./paths.mjs";

test("NJ preflight help and invalid arguments do not request source data", () => {
  for (const [args, expected] of [[["--help"], 0], [["--url", "https://example.invalid"], 1], [["--output", "elsewhere"], 1]]) {
    const child = spawnSync(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/preflight-nj-childcare.mjs", ...args], {
      cwd: APP_ROOT, encoding: "utf8", windowsHide: true, timeout: 5000,
    });
    assert.equal(child.error, undefined); assert.equal(child.status, expected, child.stderr);
    assert.match(expected ? child.stderr : child.stdout, expected ? /Unsupported preflight arguments/ : /Does not acquire business rows/);
  }
});

test("NJ metadata-only CLI cooperatively cancels its actual child request through IPC", { timeout: 10000 }, async (t) => {
  const child = spawn(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/preflight-nj-childcare.mjs"], {
    cwd: APP_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const exit = once(child, "exit"); let requests = 0, output = "";
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  const timer = setTimeout(() => child.kill(), 5000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill(); });
  child.on("message", (message) => { if (message.type === "fixture-request") { requests++; child.send({ type: "cancel" }); } });
  const [code, signal] = await exit;
  assert.equal(requests, 1, output); assert.equal(code, 1, output); assert.equal(signal, null, output);
  assert.match(output, /preflight failed/);
  assert.doesNotMatch(output, /metadata-preflight-passed/);
});
