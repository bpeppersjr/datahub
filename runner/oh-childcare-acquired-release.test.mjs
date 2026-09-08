import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { gatedTransport } from "./fixtures/oh-childcare-gated-transport.mjs";
import { buildOhChildcareAcquiredReleaseWithTransport as build, verifyOhChildcareAcquiredRelease as verify } from "./oh-childcare-acquired-release.mjs";
import { buildOhChildcareRelease, verifyOhChildcareRelease } from "./oh-childcare-release.mjs";

const root = () => path.join(APP_ROOT, "data/tmp", `oh-acquired-${randomUUID()}`);
const parse = async (file) => JSON.parse(await readFile(file, "utf8"));
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const encode = (value) => `${JSON.stringify(value)}\n`;
const exec = promisify(execFile);
async function stageDir(outputRoot) { return path.join(outputRoot, ".staging", (await readdir(path.join(outputRoot, ".staging")))[0]); }

test("OH acquired bundle persists prerequisite before IDs, journals each page, independently replays and reuses records offline", async () => {
  const outputRoot = root(); let stages = 0;
  const f = await gatedTransport(async ({ call }) => {
    if (call === 15) {
      const directory = await stageDir(outputRoot);
      assert.equal((await parse(path.join(directory, "ready.json"))).prerequisite_sha256, hash(await readFile(path.join(directory, "prerequisite.json"))));
    }
    if (call === 16 || call === 17) assert.ok(await parse(path.join(await stageDir(outputRoot), `observation-${call === 16 ? "0000" : "0001"}.json`)));
  });
  const result = await build({ ...f.options, outputRoot, logger: () => { stages++; } });
  assert.equal(f.calls.length, 31); assert.equal(result.source_record_count, 3); assert.equal(result.execution_mode, "injected-transport"); assert.ok(stages > 5);
  assert.deepEqual(await verify(result.manifest_path), result);
  const directory = path.dirname(result.manifest_path), manifest = await parse(result.manifest_path);
  assert.equal(manifest.artifacts.length, 6); assert.equal(manifest.native_acquisition_verified, false);
  assert.equal(manifest.transport_accounting_independently_verified, false); assert.equal(manifest.export_authorized, false);
  assert.deepEqual(await readdir(path.join(outputRoot, ".staging")), []);
  await assert.rejects(readFile(path.join(outputRoot, ".acquire.lock")), { code: "ENOENT" });
  const { evidence } = await parse(path.join(directory, "acquisition.json"));
  const offline = await buildOhChildcareRelease({ evidence, outputRoot: root(), now: () => new Date("2026-09-09T00:00:00.000Z") });
  assert.equal((await verifyOhChildcareRelease(offline.manifest_path)).counts.accepted, 3);
  assert.equal(f.calls.length, 31); // Reprocessing made no acquisition request.
});

test("OH acquisition failures retain validated partial evidence without a completed manifest or lock", async () => {
  const outputRoot = root(), f = await gatedTransport(({ call }) => call === 17 ? new Response("SECRET", { status: 403 }) : undefined);
  await assert.rejects(build({ ...f.options, outputRoot }), (error) => /Ohio/.test(error.message) && !error.message.includes("SECRET"));
  const directory = await stageDir(outputRoot);
  assert.deepEqual((await readdir(directory)).sort(), ["observation-0000.json", "observation-0001.json", "prerequisite.json", "ready.json"]);
  assert.equal((await parse(path.join(directory, "observation-0001.json"))).observation.payload.features.length, 3);
  assert.deepEqual(await readdir(path.join(outputRoot, "releases")), []);
  await assert.rejects(verify(path.join(directory, "manifest.json")));
  await assert.rejects(readFile(path.join(outputRoot, ".acquire.lock")), { code: "ENOENT" });
});

test("OH retention failures stop requests; cancellation cleans only owned staging and preserves a completed release", async () => {
  const outputRoot = root(), first = await build({ ...(await gatedTransport()).options, outputRoot });
  for (const phase of ["prerequisites-retained", "observation-retained", "verify", "before-commit"]) {
    const f = await gatedTransport(), controller = new AbortController();
    await assert.rejects(build({ ...f.options, outputRoot, signal: controller.signal, logger: (stage) => { if (stage === phase) controller.abort(); } }), { name: "AbortError" });
    assert.deepEqual(await readdir(path.join(outputRoot, ".staging")), []);
    if (phase === "prerequisites-retained") assert.equal(f.calls.length, 14);
    if (phase === "observation-retained") assert.equal(f.calls.length, 15);
    assert.equal((await verify(first.manifest_path)).source_record_count, 3);
  }
  const f = await gatedTransport();
  await assert.rejects(build({ ...f.options, outputRoot, logger: (stage) => { if (stage === "prerequisites-retained") throw new Error("disk unavailable"); } }), /disk unavailable/);
  assert.equal(f.calls.length, 14);
});

test("OH verifier rejects corruption and rehashed journal, source-use, accounting, clock and claims substitutions", async () => {
  for (const mutation of [
    async (directory) => { await writeFile(path.join(directory, "extra.json"), "{}"); },
    async (directory) => { await writeFile(path.join(directory, "observation-0001.json"), "bad"); },
    async (_directory, manifest) => { manifest.native_acquisition_verified = true; },
    async (directory, manifest) => {
      const name = "observation-0001.json", value = await parse(path.join(directory, name)); value.observation.payload.features[0].attributes.program_name = "substitution";
      const raw = encode(value); await writeFile(path.join(directory, name), raw); Object.assign(manifest.artifacts.find((a) => a.path === name), { bytes: Buffer.byteLength(raw), sha256: hash(raw) });
    },
    async (directory) => { const file = path.join(directory, "acquisition.json"), value = await parse(file); value.source_use_evidence.after.binding.export_authorized = true; await writeFile(file, encode(value)); },
    async (directory) => { const file = path.join(directory, "acquisition.json"), value = await parse(file); value.transport.requests = 0; await writeFile(file, encode(value)); },
    async (directory) => { const file = path.join(directory, "ready.json"), value = await parse(file); value.retained_at = "2026-09-08T07:06:00.000Z"; await writeFile(file, encode(value)); },
  ]) {
    const result = await build({ ...(await gatedTransport()).options, outputRoot: root() }), manifest = await parse(result.manifest_path);
    await mutation(path.dirname(result.manifest_path), manifest); await writeFile(result.manifest_path, encode(manifest));
    await assert.rejects(verify(result.manifest_path));
  }
});

test("OH acquisition excludes concurrent builders and preserves ambiguous lock ownership", async () => {
  const outputRoot = root(), f = await gatedTransport(); let resume, entered;
  const waiting = new Promise((resolve) => { entered = resolve; }), block = new Promise((resolve) => { resume = resolve; });
  const pending = build({ ...f.options, outputRoot, logger: async (phase) => { if (phase === "prerequisites-retained") { entered(); await block; } } });
  await waiting; const second = await gatedTransport();
  await assert.rejects(build({ ...second.options, outputRoot }), { code: "EEXIST" }); assert.equal(second.calls.length, 0); resume();
  await verify((await pending).manifest_path);
  const foreignRoot = root(), foreign = await gatedTransport();
  await assert.rejects(build({ ...foreign.options, outputRoot: foreignRoot, logger: async (phase) => {
    if (phase === "before-commit") { await rename(path.join(foreignRoot, ".acquire.lock"), path.join(foreignRoot, "prior-lock.json")); await writeFile(path.join(foreignRoot, ".acquire.lock"), "foreign"); }
  } }), { code: "OH_CHILDCARE_INSPECTION_REQUIRED" });
  assert.equal(await readFile(path.join(foreignRoot, ".acquire.lock"), "utf8"), "foreign");
  assert.deepEqual(await readdir(path.join(foreignRoot, "releases")), []);
});

test("OH rejects invalid locations, pre-abort, options and prerequisite mutations before record requests", async () => {
  const f = await gatedTransport();
  await assert.rejects(build({ ...f.options, outputRoot: APP_ROOT }));
  await assert.rejects(build({ ...f.options, outputRoot: path.join(root(), "releases", "nested") }));
  await assert.rejects(build({ ...f.options, outputRoot: root(), signal: AbortSignal.abort() }), { name: "AbortError" });
  await assert.rejects(build({ ...f.options, sourceUseRequired: false })); assert.equal(f.calls.length, 0);
  const outputRoot = root(); await mkdir(outputRoot, { recursive: true }); await writeFile(path.join(outputRoot, "manifest.json"), "{}");
  await assert.rejects(build({ ...f.options, outputRoot: path.join(outputRoot, "nested") }), /manifest-bearing/);
  const changedRoot = root();
  await assert.rejects(build({ ...f.options, outputRoot: changedRoot, logger: async (phase) => {
    if (phase === "prerequisites-retained") await writeFile(path.join(await stageDir(changedRoot), "prerequisite.json"), "{}");
  } }), /prerequisite changed/);
  assert.equal(f.calls.length, 14);
});

test("OH retention checkpoint binds original file bytes, not merely reserialized values", async () => {
  const result = await build({ ...(await gatedTransport()).options, outputRoot: root() }), directory = path.dirname(result.manifest_path);
  const file = path.join(directory, "prerequisite.json"), raw = ` ${await readFile(file, "utf8")}`; await writeFile(file, raw);
  const manifest = await parse(result.manifest_path);
  Object.assign(manifest.artifacts.find((a) => a.path === "prerequisite.json"), { bytes: Buffer.byteLength(raw), sha256: hash(raw) });
  await writeFile(result.manifest_path, encode(manifest));
  await assert.rejects(verify(result.manifest_path), /checkpoint file hash/);
});

test("OH verifier rejects padded journal by expected envelope ceiling and invalid acquisition before journal loading", async () => {
  const result = await build({ ...(await gatedTransport()).options, outputRoot: root() }), directory = path.dirname(result.manifest_path);
  const handle = await open(path.join(directory, "observation-0000.json"), "r+");
  try { await handle.truncate(9_000_000); } finally { await handle.close(); }
  await assert.rejects(verify(result.manifest_path), /byte ceiling/);
  const file = path.join(directory, "acquisition.json"), value = await parse(file);
  value.evidence.observations = Array(502).fill({ kind: "invalid" }); await writeFile(file, encode(value));
  await assert.rejects(verify(result.manifest_path), /Ohio acquisition/);
});

test("OH standalone verify and reprocess commands use retained snapshots without an AI or download process", async () => {
  const result = await build({ ...(await gatedTransport()).options, outputRoot: root() });
  const verified = await exec(process.execPath, ["scripts/verify-oh-childcare-acquired.mjs", result.manifest_path], { cwd: APP_ROOT, windowsHide: true });
  assert.equal(JSON.parse(verified.stdout).manifest_sha256, result.manifest_sha256);
  const reprocessed = await exec(process.execPath, ["scripts/reprocess-oh-childcare.mjs", result.manifest_path, "--output", root()], { cwd: APP_ROOT, windowsHide: true });
  const receipt = JSON.parse(reprocessed.stdout);
  assert.equal(receipt.acquisition_performed, false); assert.equal(receipt.acquisition_manifest_sha256, result.manifest_sha256);
  assert.equal((await verifyOhChildcareRelease(receipt.manifest_path)).counts.accepted, 3);
  await assert.rejects(exec(process.execPath, ["scripts/verify-oh-childcare-acquired.mjs", "SECRET"], { cwd: APP_ROOT, windowsHide: true }), (error) => !error.stderr.includes("SECRET"));
  await assert.rejects(exec(process.execPath, ["scripts/reprocess-oh-childcare.mjs", result.manifest_path, "--url", "SECRET"], { cwd: APP_ROOT, windowsHide: true }), (error) => !error.stderr.includes("SECRET"));
});
