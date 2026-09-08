import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

test("production CLI limits resolution recovery to one explicit planning mode", () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(APP_ROOT, "scripts/reconcile-business-production.mjs"), ...args], {
    cwd: APP_ROOT, encoding: "utf8", timeout: 10_000,
  });
  const help = run("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--recover-resolution-from/);
  assert.match(help.stdout, /six remaining stages/);
  for (const [args, message] of [
    [["run", "--recover-resolution-from", "old-run"], /Only plan accepts/],
    [["stop", "--recover-resolution-from", "old-run"], /Only plan accepts/],
    [["plan", "--recover-resolution-from", "old-run", "--recover-benchmark-from", "another-run"], /mutually exclusive/],
    [["plan", "--recover-resolution-from", "old-run", "--recover-resolution-from", "another-run"], /repeated/],
    [["plan", "--recover-resolution-from"], /requires a value/],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, message);
    assert.equal(result.stdout, "");
  }
});
