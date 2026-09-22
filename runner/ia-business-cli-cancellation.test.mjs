import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";

const exec = promisify(execFile);

test("Iowa build CLI forwards cancellation through every mode and disposes handlers", async () => {
  const source = await readFile(new URL("../scripts/build-ia-business-registry.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ createCliCancellation \}/);
  assert.match(source, /const cancellation = createCliCancellation\(\);/);
  assert.match(source, /resumedSource\([^;]+cancellation\.signal\)/);
  assert.equal(source.match(/signal: cancellation\.signal/g)?.length, 2);
  assert.match(source, /finally\s*\{\s*cancellation\.dispose\(\);\s*\}/);

  const help = await exec(process.execPath, ["scripts/build-ia-business-registry.mjs", "--help"], { cwd: APP_ROOT });
  assert.match(help.stdout, /resume-source-staging-run/);
  assert.equal(help.stderr, "");
});

test("Iowa build CLI rejects malformed input without attempting acquisition", async () => {
  await assert.rejects(
    exec(process.execPath, ["scripts/build-ia-business-registry.mjs", "--not-a-real-option"], { cwd: APP_ROOT }),
    (error) => error.code === 1 && /Unknown argument --not-a-real-option/.test(error.stderr),
  );
});
