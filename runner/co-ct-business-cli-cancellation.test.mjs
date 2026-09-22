import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";

const exec = promisify(execFile);

for (const state of [
  { name: "Colorado", slug: "co", module: "Co" },
  { name: "Connecticut", slug: "ct", module: "Ct" },
]) {
  test(`${state.name} CLIs propagate cancellation through build, resume, and verification`, async () => {
    const build = await readFile(new URL(`../scripts/build-${state.slug}-business-registry.mjs`, import.meta.url), "utf8");
    const verify = await readFile(new URL(`../scripts/verify-${state.slug}-business-registry.mjs`, import.meta.url), "utf8");
    for (const source of [build, verify]) {
      assert.match(source, /createCliCancellation/);
      assert.match(source, /signal:\s*cancellation\.signal/);
      assert.match(source, /finally\s*\{\s*cancellation\.dispose/);
    }
    assert.match(build, /resume-source-staging-run/);
    assert.match(build, new RegExp(`publish${state.module}BusinessRegistryStaging\\(\\{[^}]+signal: cancellation\\.signal`));
    assert.match(verify, new RegExp(`verify${state.module}BusinessRegistry\\(manifestPath, \\{ signal: cancellation\\.signal \\}\\)`));
  });

  test(`${state.name} build CLI rejects malformed flags before acquisition`, async () => {
    for (const args of [
      ["--not-a-real-option"],
      ["--output", "--zbp"],
      ["--output", "data/tmp/unused", "--output", "data/tmp/unused2"],
      ["--resume-staging-run", "not-a-uuid"],
    ]) {
      await assert.rejects(
        exec(process.execPath, [`scripts/build-${state.slug}-business-registry.mjs`, ...args], { cwd: APP_ROOT }),
        (error) => error.code === 1 && /Unknown argument|requires a value|only be supplied once|requires a UUID/.test(error.stderr),
      );
    }
    const help = await exec(process.execPath, [`scripts/build-${state.slug}-business-registry.mjs`, "--help"], { cwd: APP_ROOT });
    assert.match(help.stdout, /resume-source-staging-run/);
  });

  test(`${state.name} verification CLI rejects extra positional input`, async () => {
    await assert.rejects(
      exec(process.execPath, [`scripts/verify-${state.slug}-business-registry.mjs`, "one", "two"], { cwd: APP_ROOT }),
      (error) => error.code === 1 && /at most one manifest or pointer path/.test(error.stderr),
    );
  });
}
