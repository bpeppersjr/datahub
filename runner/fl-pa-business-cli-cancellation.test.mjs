import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { publishFlBusinessRegistryStaging, verifyFlBusinessRegistry } from "./fl-business-registry.mjs";
import { publishPaBusinessRegistryStaging, requestPaJson, verifyPaBusinessRegistry } from "./pa-business-registry.mjs";

const exec = promisify(execFile);

for (const state of ["fl", "pa"]) {
  test(`${state.toUpperCase()} verification CLI exits promptly on parent IPC cancellation during stalled read`, async () => {
    const child = spawn(process.execPath, ["--import", "./runner/fixtures/business-registry-cli-stalled-read.mjs", `scripts/verify-${state}-business-registry.mjs`, "data/tmp/not-read.json"], {
      cwd: APP_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let output = "", timedOut = false, started = 0;
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("message", (message) => { if (message.type === "fixture-read-started") { started += 1; child.send({ type: "cancel" }); } });
    const deadline = setTimeout(() => { timedOut = true; child.kill(); }, 10_000);
    let status;
    try { status = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }); }
    finally { clearTimeout(deadline); }
    assert.equal(timedOut, false, output);
    assert.equal(started, 1, output);
    assert.equal(status, 1, output);
    assert.match(output, /verification cancelled/);
  });
}

for (const state of ["fl", "pa"]) {
  test(`${state.toUpperCase()} build CLI preserves the published pointer on IPC cancellation during stalled prerequisite acquisition`, async () => {
    const root = await mkdtemp(path.join(APP_ROOT, `data/tmp/${state}-cli-cancel-`));
    const output = path.join(root, "output");
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "current.json"), "prior publication sentinel");
    const child = spawn(process.execPath, ["--import", "./runner/fixtures/business-registry-cli-stalled-read.mjs", `scripts/build-${state}-business-registry.mjs`, "--output", output, "--zbp", path.join(root, "baseline/current.json")], {
      cwd: APP_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let outputText = "", timedOut = false, started = 0;
    child.stdout.on("data", (chunk) => { outputText += chunk; });
    child.stderr.on("data", (chunk) => { outputText += chunk; });
    child.on("message", (message) => { if (message.type === "fixture-read-started") { started += 1; child.send({ type: "cancel" }); } });
    const deadline = setTimeout(() => { timedOut = true; child.kill(); }, 10_000);
    let status;
    try { status = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }); }
    finally { clearTimeout(deadline); }
    assert.equal(timedOut, false, outputText);
    assert.equal(started, 1, outputText);
    assert.equal(status, 1, outputText);
    assert.match(outputText, /build cancelled/);
    assert.equal(await readFile(path.join(output, "current.json"), "utf8"), "prior publication sentinel");
  });
}

test("Florida and Pennsylvania runners reject pre-cancelled build lifecycle entry points", async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(verifyFlBusinessRegistry("unused", { signal }), { name: "AbortError" });
  await assert.rejects(verifyPaBusinessRegistry("unused", { signal }), { name: "AbortError" });
  await assert.rejects(publishFlBusinessRegistryStaging({ outputRoot: "unused", stagingRunId: "00000000-0000-4000-8000-000000000000", signal }), { name: "AbortError" });
  await assert.rejects(publishPaBusinessRegistryStaging({ outputRoot: "unused", stagingRunId: "00000000-0000-4000-8000-000000000000", signal }), { name: "AbortError" });
});

test("Pennsylvania transport interrupts a non-cooperative stalled fetch", async () => {
  const controller = new AbortController();
  const pending = requestPaJson("https://data.pa.gov/api/views/3urc-uaba", { type: "metadata", signal: controller.signal, fetchImpl: () => new Promise(() => {}) });
  setImmediate(() => controller.abort());
  await assert.rejects(pending, { name: "AbortError" });
});

for (const state of ["fl", "pa"]) {
  test(`${state.toUpperCase()} build CLI rejects malformed flags before acquisition`, async () => {
    for (const args of [["--output", "--zbp"], ["--output", "data/tmp/unused", "--output", "data/tmp/unused2"]]) {
      await assert.rejects(exec(process.execPath, [`scripts/build-${state}-business-registry.mjs`, ...args], { cwd: APP_ROOT }), (error) => error.code === 1 && /requires a value|only be supplied once/.test(error.stderr));
    }
  });
}
