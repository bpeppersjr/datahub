import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { APP_ROOT } from "./paths.mjs";

test("Michigan verifier CLI documents offline scope and rejects malformed commands", () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(APP_ROOT, "scripts/verify-mi-childcare.mjs"), ...args], { cwd: APP_ROOT, encoding: "utf8", timeout: 10_000 });
  const help = run("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Offline verification/);
  assert.match(help.stdout, /not acquisition, legal approval or export authorization/);
  for (const args of [[], ["--download"], ["one.json", "two.json"], ["--help", "--download"]]) {
    const result = run(...args); assert.equal(result.status, 1); assert.match(result.stderr, /manifest path is required/); assert.equal(result.stdout, "");
  }
  for (const target of ["data/current.json", "data/.staging/run/manifest.json"]) {
    const result = run(target); assert.equal(result.status, 1); assert.match(result.stderr, /immutable release manifest/);
  }
});
