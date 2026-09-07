import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { verifyNjChildcareRelease } from "./nj-childcare-release.mjs";

test("NJ reprocess CLI rejects scope overrides and explains offline behavior without requests", () => {
  for (const [args, expected] of [[["--help"], 0], [[], 1], [["--url", "https://example.invalid"], 1], [["manifest.json", "--output", ".."], 1]]) {
    const result = spawnSync(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/reprocess-nj-childcare.mjs", ...args],
      { cwd: APP_ROOT, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(result.error, undefined); assert.equal(result.status, expected, result.stderr);
    assert.match(expected ? result.stderr : result.stdout, expected ? /failed/ : /No network requests/);
  }
});

test("NJ reprocess CLI publishes offline and leaves its original parent unchanged", { timeout: 30000 }, async (t) => {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/nj-reprocess-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = path.join(root, "original"), output = path.join(root, "reprocessed");
  const build = spawnSync(process.execPath, ["--import", "./runner/fixtures/nj-childcare-fetch.mjs", "scripts/build-nj-childcare.mjs", "--output", original],
    { cwd: APP_ROOT, env: { ...process.env, NJ_FIXTURE_INVALID: "0" }, encoding: "utf8", windowsHide: true, timeout: 25000 });
  assert.equal(build.error, undefined); assert.equal(build.status, 0, build.stderr);
  const pointerBytes = await readFile(path.join(original, "current.json"));
  const pointer = JSON.parse(pointerBytes), manifestPath = path.join(original, pointer.manifest);
  const parentBytes = await readFile(manifestPath);
  const overlapping = spawnSync(process.execPath, ["scripts/reprocess-nj-childcare.mjs", manifestPath, "--output", path.dirname(manifestPath)],
    { cwd: APP_ROOT, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(overlapping.error, undefined); assert.equal(overlapping.status, 1);
  assert.equal((await verifyNjChildcareRelease(manifestPath)).artifact_count, 5);
  // Any accidental network request would hang this preload and fail the timeout.
  const result = spawnSync(process.execPath, ["--import", "./runner/fixtures/ak-cancel-fetch.mjs", "scripts/reprocess-nj-childcare.mjs", manifestPath, "--output", output],
    { cwd: APP_ROOT, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readFile(manifestPath), parentBytes);
  assert.deepEqual(await readFile(path.join(original, "current.json")), pointerBytes);
  const nextPointer = JSON.parse(await readFile(path.join(output, "current.json")));
  const nextPath = path.join(output, nextPointer.manifest);
  const verified = await verifyNjChildcareRelease(nextPath);
  assert.equal(verified.artifact_count, 6);
  const manifest = JSON.parse(await readFile(nextPath));
  assert.equal(manifest.transformation_version, "nj-childcare-normalization@1.0.1");
  assert.equal(manifest.source_release_id, JSON.parse(parentBytes).source_release_id);
  assert.equal((await verifyNjChildcareRelease(manifestPath)).artifact_count, 5);
});
