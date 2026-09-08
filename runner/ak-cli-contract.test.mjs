import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

const execute = promisify(execFile);
test("Alaska CLIs reject ambiguous inputs before output and redact arbitrary argument values", async t => {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/ak-cli-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const build = "scripts/build-ak-active-business-licenses.mjs";
  const output = path.join(root, "output");
  for (const args of [["--output", output, "--output", output], ["--output", "--zbp"], ["--help", "--output", output], ["--unknown", "private-fixture-value"]]) {
    await assert.rejects(execute(process.execPath, [build, ...args], { cwd: APP_ROOT, timeout: 5000, windowsHide: true }), error => error.code === 1 && !error.stderr.includes("private-fixture-value"));
  }
  assert.deepEqual(await readdir(root), []);
  for (const script of [build, "scripts/verify-ak-active-business-licenses.mjs"]) {
    const result = await execute(process.execPath, [script, "--help"], { cwd: APP_ROOT, timeout: 5000, windowsHide: true });
    assert.match(result.stdout, /Usage:/);
    const source = await readFile(path.join(APP_ROOT, script), "utf8");
    assert.match(source, /finally\s*\{\s*cancellation.dispose/);
    assert.doesNotMatch(source, /process\.exit\(/);
  }
  await assert.rejects(execute(process.execPath, ["scripts/verify-ak-active-business-licenses.mjs", "private-fixture-value", "extra"], { cwd: APP_ROOT, timeout: 5000, windowsHide: true }), error => error.code === 1 && !error.stderr.includes("private-fixture-value"));
});

test("Alaska CLI publication-incomplete evidence takes precedence over cancellation", async () => {
  const source = await readFile(path.join(APP_ROOT, "scripts/build-ak-active-business-licenses.mjs"), "utf8");
  assert.ok(source.indexOf('error.code === "AK_PUBLICATION_INCOMPLETE"') < source.indexOf("cancellation.signal.aborted"));
  assert.match(source, /release-rename.*pointer-write.*pointer-rename.*post-publication/);
  assert.match(source, /a release or pointer may already exist/);
  assert.doesNotMatch(source, /error\.message/);
});
