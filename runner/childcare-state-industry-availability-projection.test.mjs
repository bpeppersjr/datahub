import test from "node:test";
import assert from "node:assert/strict";
import { cp, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { buildChildcareStateIndustryAvailabilityProjection, deriveChildcareStateIndustryAvailabilityProjection, verifyChildcareStateIndustryAvailabilityProjection } from "./childcare-state-industry-availability-projection.mjs";

test("projection exposes seven retained cohorts and 44 unmeasured jurisdictions without denominator claims", async () => {
  const registration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/retained-childcare-zip-evidence.json"))), raw = await readFile(path.join(APP_ROOT, registration.retained_release.manifest)), manifest = JSON.parse(raw);
  const projection = deriveChildcareStateIndustryAvailabilityProjection(manifest, registration.retained_release.manifest_sha256);
  assert.equal(projection.jurisdictions.length, 51); assert.deepEqual(projection.jurisdictions.filter((row) => row.measurement_status !== "unmeasured").map((row) => row.code).sort(), ["CO", "CT", "IA", "MD", "PA", "UT", "VT"]); assert.equal(projection.jurisdictions.filter((row) => row.measurement_status === "unmeasured").length, 44);
  assert.deepEqual(projection.totals, { retained_candidate_rows: 12206, zip_present_candidate_rows: 12205, missing_zip_candidate_rows: 0, invalid_zip_candidate_rows: 1 }); assert.equal(projection.claims.denominator, null); assert.equal(projection.claims.business_count, null); assert.equal(projection.claims.current_operating_count, null); assert.equal(projection.claims.production_enrollment, false);
  assert.equal(projection.source.created_at, manifest.created_at); assert.deepEqual(projection.derivative_time_policy, { derivative_created_at: null, rule: "No derivative clock is invented; source.created_at is retained source metadata only." }); assert.equal("created_at" in projection, false);
});

async function releaseFixture(t) {
  const registration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/childcare-state-industry-availability-projection.json"))), source = path.dirname(path.join(APP_ROOT, registration.retained_release.manifest));
  const parent = await mkdtemp(path.join(APP_ROOT, "data", "tmp-childcare-projection-test-")), directory = path.join(parent, registration.retained_release.release_id); await cp(source, directory, { recursive: true }); t.after(() => rm(parent, { recursive: true, force: true })); return { directory, manifest: path.join(directory, "manifest.json"), artifact: path.join(directory, "projection.json") };
}

test("verifier rejects artifact, manifest, rehashed, extra, missing and hardlinked tampering", async t => {
  for (const mode of ["artifact", "manifest", "rehashed", "extra", "missing", "hardlink"]) {
    const f = await releaseFixture(t);
    if (mode === "artifact") await writeFile(f.artifact, "{}\n");
    if (mode === "manifest") await writeFile(f.manifest, "{}\n");
    if (mode === "rehashed") { const raw = Buffer.from("{}\n"), m = JSON.parse(await readFile(f.manifest)); m.artifacts[0].bytes = raw.length; m.artifacts[0].sha256 = (await import("node:crypto")).createHash("sha256").update(raw).digest("hex"); await writeFile(f.artifact, raw); await writeFile(f.manifest, `${JSON.stringify(m, null, 2)}\n`); }
    if (mode === "extra") await writeFile(path.join(f.directory, "extra.json"), "{}\n");
    if (mode === "missing") await unlink(f.artifact);
    if (mode === "hardlink") { const other = path.join(path.dirname(f.directory), "hardlink.json"); await link(f.artifact, other); }
    await assert.rejects(verifyChildcareStateIndustryAvailabilityProjection(f.manifest), /rejected|ENOENT/);
  }
});

test("pre-cancelled build creates no release or lock", async t => {
  const outputRoot = path.join(APP_ROOT, "data", `cancelled-childcare-${Date.now()}`); t.after(() => rm(outputRoot, { recursive: true, force: true }));
  await assert.rejects(buildChildcareStateIndustryAvailabilityProjection({ outputRoot, signal: AbortSignal.abort() }), { name: "AbortError" });
  await assert.rejects(readFile(path.join(outputRoot, "releases")), /ENOENT|EISDIR/);
});

function checkpointSignal(target) { const signal = new AbortController().signal; let calls = 0; signal.throwIfAborted = () => { calls += 1; if (calls === target) throw new DOMException("cancelled", "AbortError"); }; return signal; }

test("mid-write-boundary cancellation removes owned staging and lock", async t => {
  const outputRoot = path.join(APP_ROOT, "data", `mid-cancelled-childcare-${Date.now()}`); t.after(() => rm(outputRoot, { recursive: true, force: true }));
  await assert.rejects(buildChildcareStateIndustryAvailabilityProjection({ outputRoot, signal: checkpointSignal(8) }), { name: "AbortError" });
  assert.deepEqual(await (async () => { try { return await (await import("node:fs/promises")).readdir(path.join(outputRoot, "releases")); } catch { return []; } })(), []);
});

test("post-rename cancellation preserves immutable release but removes owned lock", async t => {
  const outputRoot = path.join(APP_ROOT, "data", `post-cancelled-childcare-${Date.now()}`); t.after(() => rm(outputRoot, { recursive: true, force: true }));
  await assert.rejects(buildChildcareStateIndustryAvailabilityProjection({ outputRoot, signal: checkpointSignal(22) }), { name: "AbortError" });
  const entries = await (await import("node:fs/promises")).readdir(path.join(outputRoot, "releases")); assert.equal(entries.length, 1); assert.match(entries[0], /^childcare-state-industry-availability-projection-/); await verifyChildcareStateIndustryAvailabilityProjection(path.join(outputRoot, "releases", entries[0], "manifest.json"));
});

test("output escape is rejected and a held lock is never removed by a contender", async t => {
  await assert.rejects(buildChildcareStateIndustryAvailabilityProjection({ outputRoot: path.join(os.tmpdir(), "escaped-childcare") }), /canonical repository data/);
  const outputRoot = path.join(APP_ROOT, "data", `locked-childcare-${Date.now()}`), first = await buildChildcareStateIndustryAvailabilityProjection({ outputRoot }); const lockPath = path.join(outputRoot, "releases", `.${first.manifest.release_id}.lock`); await rm(first.releaseDirectory, { recursive: true }); await mkdir(lockPath); t.after(() => rm(outputRoot, { recursive: true, force: true }));
  await assert.rejects(buildChildcareStateIndustryAvailabilityProjection({ outputRoot }), /EEXIST/); assert.equal((await lstat(lockPath)).isDirectory(), true);
});

test("reparse output ancestry is rejected where the host supports links", async t => {
  const parent = await mkdtemp(path.join(APP_ROOT, "data", "linked-childcare-test-")), target = await mkdtemp(path.join(os.tmpdir(), "childcare-link-target-")), linked = path.join(parent, "linked"); t.after(() => Promise.all([rm(parent, { recursive: true, force: true }), rm(target, { recursive: true, force: true })]));
  try { await symlink(target, linked, process.platform === "win32" ? "junction" : "dir"); } catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("host does not permit directory links"); return; } throw error; }
  await assert.rejects(buildChildcareStateIndustryAvailabilityProjection({ outputRoot: path.join(linked, "projection") }), /link|canonical/);
});

test("registered release verifies by independent replay", async () => {
  const registration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/childcare-state-industry-availability-projection.json")));
  assert.equal(registration.release_only, true); assert.equal(registration.runtime_pointer, null); assert.equal(registration.production_enrollment, false); assert.equal(registration.national_denominator_enrollment, false); assert.equal(registration.claims.denominator, null); assert.equal(registration.claims.business_count, null);
  const result = await verifyChildcareStateIndustryAvailabilityProjection(path.join(APP_ROOT, registration.retained_release.manifest)); assert.equal(result.verified, true); assert.equal(result.manifest_sha256, registration.retained_release.manifest_sha256); assert.equal(result.manifest.retained_candidate_rows, registration.retained_release.retained_candidate_rows);
});

test("derivation rejects broken row and ZIP conservation", async () => {
  const registration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/retained-childcare-zip-evidence.json"))), manifest = JSON.parse(await readFile(path.join(APP_ROOT, registration.retained_release.manifest)));
  manifest.sources.MD.quality.with_zip5 += 1;
  assert.throws(() => deriveChildcareStateIndustryAvailabilityProjection(manifest, registration.retained_release.manifest_sha256), /conservation failed/);
});
