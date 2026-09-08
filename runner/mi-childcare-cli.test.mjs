import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

test("Michigan preflight CLI documents metadata-only scope and rejects expanded scope", () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(APP_ROOT, "scripts", "preflight-mi-childcare.mjs"), ...args], {
    cwd: APP_ROOT, encoding: "utf8", timeout: 10_000,
  });
  const help = run("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /metadata\/count only/);
  assert.match(help.stdout, /No facility rows/);
  for (const args of [["--url", "https://example.invalid"], ["--help", "--run"], ["--download"], ["--output", "C:\\outside"]]) {
    const result = run(...args);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Unsupported preflight arguments/);
    assert.equal(result.stdout, "");
  }
});
