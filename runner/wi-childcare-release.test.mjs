import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, link, unlink, symlink } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { APP_ROOT } from "./paths.mjs";
import { evidence, rehash } from "./fixtures/wi-childcare-acquisition.mjs";
import { buildWiChildcareRelease, verifyWiChildcareRelease, readWiChildcareEvidence } from "./wi-childcare-release.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function sample() { return { evidence: await evidence(), outputRoot: path.join(APP_ROOT, "data", "tmp", `wi-release-test-${randomUUID()}`), now: () => new Date("2026-09-09T00:00:00.000Z") }; }
async function manifest(result) { return JSON.parse(await readFile(result.manifest_path, "utf8")); }

test("WI immutable offline bundle replays five artifacts and never claims authorized coverage", async () => {
  const options = await sample(), result = await buildWiChildcareRelease(options), verified = await verifyWiChildcareRelease(result.manifest_path);
  assert.deepEqual(result.counts, { selected: 2, accepted: 2, quarantined: 0 });
  assert.equal(result.mode, "offline-review-only"); assert.equal(result.acquisition_authorized, false);
  assert.equal(verified.manifest_sha256, result.manifest_sha256); assert.equal(verified.artifact_count, 5);
  const m = await manifest(result);
  assert.equal(m.status, "offline-review-only"); assert.equal(m.mode, "offline-retained-acquisition-release");
  assert.equal(m.claims.acquisition_authorized, false); assert.equal(m.claims.source_authenticity_verified, false); assert.equal(m.nationalReportingIntegrated, false);
  assert.equal(m.observed_at, options.evidence.observed_at); assert.equal(m.processed_at, options.now().toISOString());
  assert.equal(m.quality.accepted_with_zip5, 1);
  const pointer = JSON.parse(await readFile(path.join(options.outputRoot, "current.json"), "utf8"));
  assert.equal(pointer.release_id, result.release_id);
});
test("WI review preserves all-quarantine evidence without pretending business quality passed", async () => {
  const options = await sample();
  for (const f of options.evidence.observations[1].payload.features) f.attributes.LocationLineAddress1 = "PO Box 1";
  rehash(options.evidence);
  const result = await buildWiChildcareRelease(options), m = await manifest(result);
  assert.deepEqual(result.counts, { selected: 2, accepted: 0, quarantined: 2 });
  assert.equal((await readFile(path.join(path.dirname(result.manifest_path), "normalized.jsonl"))).length, 0);
  assert.equal(m.status, "offline-review-only"); assert.equal(m.nationalReportingIntegrated, false);
  await verifyWiChildcareRelease(result.manifest_path);
});
test("WI reprocessing preserves source snapshot and observation but writes a distinct run", async () => {
  const options = await sample(), first = await buildWiChildcareRelease(options), prior = await readFile(first.manifest_path);
  const second = await buildWiChildcareRelease({ ...options, now: () => new Date("2026-09-10T00:00:00.000Z") });
  const a = await manifest(first), b = await manifest(second);
  assert.notEqual(first.release_id, second.release_id); assert.equal(a.source_release_id, b.source_release_id); assert.equal(a.observed_at, b.observed_at);
  assert.notEqual(a.processed_at, b.processed_at); assert.ok((await readFile(first.manifest_path)).equals(prior));
});
test("WI verifier rejects self-rehashed normalized ZIP tampering and forged claims", async () => {
  const options = await sample(), result = await buildWiChildcareRelease(options), m = await manifest(result);
  const filename = path.join(path.dirname(result.manifest_path), "normalized.jsonl"), rows = (await readFile(filename, "utf8")).trim().split("\n").map(JSON.parse);
  rows[0].physical_address.zip_code = "99999"; rows[0].physical_address.postal_code = "99999";
  const bytes = Buffer.from(rows.map((r) => JSON.stringify(r) + "\n").join("")); await writeFile(filename, bytes);
  const descriptor = m.artifacts.find((v) => v.path === "normalized.jsonl"); descriptor.bytes = bytes.length; descriptor.sha256 = sha(bytes);
  await writeFile(result.manifest_path, JSON.stringify(m) + "\n");
  await assert.rejects(verifyWiChildcareRelease(result.manifest_path), /artifact bytes/);
  const clean = await buildWiChildcareRelease(await sample()), forged = await manifest(clean); forged.claims.acquisition_authorized = true;
  await writeFile(clean.manifest_path, JSON.stringify(forged) + "\n"); await assert.rejects(verifyWiChildcareRelease(clean.manifest_path), /manifest policy/);
});
test("WI extra artifacts, hardlinks and redirected output are rejected", async () => {
  const result = await buildWiChildcareRelease(await sample()), directory = path.dirname(result.manifest_path);
  const extra = path.join(directory, "extra.txt"); await writeFile(extra, "unselected"); await assert.rejects(verifyWiChildcareRelease(result.manifest_path), /roster/); await unlink(extra);
  const alias = path.join(path.dirname(path.dirname(directory)), "outside-artifact-alias"); await link(path.join(directory, "normalized.jsonl"), alias);
  await assert.rejects(verifyWiChildcareRelease(result.manifest_path), /hard-linked file/); await unlink(alias);
  const options = await sample(), target = options.outputRoot + "-target"; await mkdir(target, { recursive: true }); await symlink(target, options.outputRoot, "junction");
  await assert.rejects(buildWiChildcareRelease(options), /alias/); assert.deepEqual(await readdir(target), []);
});
test("WI cancellation removes owned staging only and preserves previous release/pointer", async () => {
  const options = await sample(), first = await buildWiChildcareRelease(options), pointerPath = path.join(options.outputRoot, "current.json"), pointer = await readFile(pointerPath);
  const controller = new AbortController();
  await assert.rejects(buildWiChildcareRelease({ ...options, signal: controller.signal, logger: (phase) => { if (phase === "normalize") controller.abort(); } }), { name: "AbortError" });
  assert.ok((await readFile(pointerPath)).equals(pointer)); await verifyWiChildcareRelease(first.manifest_path);
  assert.deepEqual(await readdir(path.join(options.outputRoot, ".staging")), []);
  assert.equal((await readdir(options.outputRoot)).includes(".publish.lock"), false);
});
test("WI ordinary failure keeps retained evidence and before-commit mutation fails final verification", async () => {
  const options = await sample();
  await assert.rejects(buildWiChildcareRelease({ ...options, logger: (phase) => { if (phase === "normalize") throw new Error("fixture fault"); } }), /fixture fault/);
  const stagingRoot = path.join(options.outputRoot, ".staging"), stages = await readdir(stagingRoot);
  assert.equal(stages.length, 1); assert.ok((await readdir(path.join(stagingRoot, stages[0]))).includes("source-observation.json"));
  const second = await sample();
  await assert.rejects(buildWiChildcareRelease({ ...second, logger: async (phase) => {
    if (phase === "before-commit") { const roots = await readdir(path.join(second.outputRoot, ".staging")); await writeFile(path.join(second.outputRoot, ".staging", roots[0], "normalized.jsonl"), "tampered\n"); }
  } }), /artifact bytes/);
  assert.deepEqual(await readdir(path.join(second.outputRoot, "releases")), []);
});
test("WI refuses existing locks, unsupported options, future observations and pre-cancellation", async () => {
  const options = await sample(); await mkdir(options.outputRoot, { recursive: true });
  await writeFile(path.join(options.outputRoot, ".publish.lock"), "foreign-lock");
  await assert.rejects(buildWiChildcareRelease(options)); assert.equal(await readFile(path.join(options.outputRoot, ".publish.lock"), "utf8"), "foreign-lock");
  await assert.rejects(buildWiChildcareRelease({ fetchImpl() {} }), /options/);
  await assert.rejects(buildWiChildcareRelease({ ...(await sample()), now: () => new Date("2020-01-01T00:00:00.000Z") }), /processing clock/);
  await assert.rejects(buildWiChildcareRelease({ signal: AbortSignal.abort() }), { name: "AbortError" });
});
test("WI evidence reader and standalone CLI are bounded, offline and immutable-manifest-only", async () => {
  const options = await sample(); await mkdir(options.outputRoot, { recursive: true });
  const input = path.join(options.outputRoot, "input.json"); await writeFile(input, JSON.stringify(options.evidence));
  assert.deepEqual(await readWiChildcareEvidence(input), options.evidence);
  const cli = spawnSync(process.execPath, ["scripts/build-wi-childcare-offline.mjs", input, "--output", path.join(options.outputRoot, "bundle")], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(cli.status, 0, cli.stderr); const result = JSON.parse(cli.stdout);
  const verified = spawnSync(process.execPath, ["scripts/verify-wi-childcare.mjs", result.manifest_path], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true });
  assert.equal(verified.status, 0, verified.stderr);
  const pointer = spawnSync(process.execPath, ["scripts/verify-wi-childcare.mjs", path.join(options.outputRoot, "bundle", "current.json")], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true });
  assert.notEqual(pointer.status, 0);
  await writeFile(input, "SECRET-NOT-JSON"); await assert.rejects(readWiChildcareEvidence(input), (e) => !e.message.includes("SECRET"));
});
test("WI builder and CLI cannot nest outputs inside retained immutable bundles", async () => {
  const options = await sample(), result = await buildWiChildcareRelease(options), directory = path.dirname(result.manifest_path);
  const roster = await readdir(directory), prior = await readFile(result.manifest_path);
  for (const outputRoot of [directory, path.join(directory, "nested")]) await assert.rejects(buildWiChildcareRelease({ ...options, outputRoot }), /immutable|bundle/);
  const cli = spawnSync(process.execPath, ["scripts/build-wi-childcare-offline.mjs", path.join(directory, "source-observation.json"), "--output", directory], { cwd: APP_ROOT, encoding: "utf8", windowsHide: true });
  assert.notEqual(cli.status, 0); assert.deepEqual(await readdir(directory), roster); assert.ok((await readFile(result.manifest_path)).equals(prior));
  await verifyWiChildcareRelease(result.manifest_path);
});
