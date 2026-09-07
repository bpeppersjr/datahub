import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, rename } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { MA_CHILDCARE_SCHEMA, MA_CHILDCARE_ITEM } from "./ma-childcare-preflight.mjs";
import { buildMaChildcareRelease, verifyMaChildcareRelease } from "./ma-childcare-release.mjs";

const now = () => new Date("2026-09-07T20:00:00.000Z"), sleep = async () => {};
function fixture(change = () => {}, count = 20) {
  return async (url) => {
    const parsed = new URL(url), params = parsed.searchParams;
    const kind = !parsed.pathname.endsWith("/query") ? "metadata" : params.has("returnCountOnly") ? "count" : params.has("returnIdsOnly") ? "inventory" : "features";
    const payload = kind === "metadata" ? { id: 0, name: "Licensed Child Care Programs", type: "Feature Layer", serviceItemId: MA_CHILDCARE_ITEM,
      objectIdField: "OBJECTID", geometryType: "esriGeometryPoint", spatialReference: { wkid: 26986 }, extent: { spatialReference: { wkid: 26986 } },
      capabilities: "Query", maxRecordCount: 500, advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true },
      fields: MA_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, length, nullable: name !== "OBJECTID" })),
      editingInfo: { lastEditDate: 1778802655030, schemaLastEditDate: 1778802655030, dataLastEditDate: 1777567917233 } }
      : kind === "count" ? { count } : kind === "inventory" ? { objectIdFieldName: "OBJECTID", objectIds: Array.from({ length: count }, (_, i) => i + 1) }
        : { spatialReference: { wkid: 4326 }, features: params.get("objectIds").split(",").map((id) => ({ attributes: {
          OBJECTID: Number(id), PROV_NUM: `P-${id}`, PROG_NAME: "Fixture Center", ADDRESS: "10 Main Street", CITY: "Boston", ZIPCODE: "02108-1234",
          LICENSED_STATUS: "Current", PROG_TYPE: "Center-based Care", CAPACITY: 20, PROG_UM: null, LICENSED_FUNDED: "Licensed", MAD_ID: null,
        }, geometry: { x: -71, y: 42 } })) };
    change(payload, kind); return new Response(JSON.stringify(payload));
  };
}
async function workspace(t) {
  const tmp = path.join(APP_ROOT, "data/tmp"); await mkdir(tmp, { recursive: true });
  const root = await mkdtemp(path.join(tmp, "ma-release-"));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
const build = (outputRoot, extra = {}) => buildMaChildcareRelease({ outputRoot, fetchImpl: fixture(), sleep, now, ...extra });

test("MA release publishes immutable evidence and independently reproduces selected normalization", async (t) => {
  const root = await workspace(t), result = await build(root);
  assert.equal(result.status, "complete"); assert.deepEqual(result.counts, { selected: 20, accepted: 20, quarantined: 0 });
  assert.equal((await verifyMaChildcareRelease(result.manifest_path)).artifact_count, 4);
  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8"));
  assert.equal(manifest.claims.active_business_verified, false);
  const pointer = JSON.parse(await readFile(path.join(root, "current.json"), "utf8"));
  assert.equal(pointer.manifest_sha256, result.manifest_sha256);
  const original = await readFile(result.manifest_path, "utf8"), next = await build(root);
  assert.notEqual(result.release_id, next.release_id); assert.equal(await readFile(result.manifest_path, "utf8"), original);
  const nextManifest = JSON.parse(await readFile(next.manifest_path, "utf8"));
  assert.equal(manifest.source_release_id, nextManifest.source_release_id);
  assert.deepEqual(await readdir(path.join(root, ".staging")), []);
});

test("MA verifier preserves earlier release version support but rejects unknown versions", async (t) => {
  const root = await workspace(t), result = await build(root);
  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8"));
  assert.equal(manifest.connector_version, "1.0.1");
  // This 20-record fixture has one batch under both versioned contracts.
  manifest.connector_version = "1.0.0";
  await writeFile(result.manifest_path, JSON.stringify(manifest));
  assert.equal((await verifyMaChildcareRelease(result.manifest_path)).status, "verified");
  manifest.connector_version = "0.9.9";
  await writeFile(result.manifest_path, JSON.stringify(manifest));
  await assert.rejects(verifyMaChildcareRelease(result.manifest_path), /connector version/);
});

test("MA release quarantines at most 5% while rejecting source scope/private drift wholesale", async (t) => {
  const root = await workspace(t);
  const accepted = await build(path.join(root, "accepted"), { fetchImpl: fixture((p, k) => { if (k === "features") p.features[0].attributes.ZIPCODE = "bad"; }) });
  assert.equal(accepted.counts.quarantined, 1); await verifyMaChildcareRelease(accepted.manifest_path);
  for (const [index, change] of [
    (p) => { p.features[0].attributes.PROG_TYPE = "Family Child Care"; p.features[0].attributes.PROG_NAME = null; },
    (p) => { p.features[0].attributes.PHONE = "not allowed"; },
    (p) => { p.features[0].attributes.ZIPCODE = "bad"; p.features[1].attributes.ZIPCODE = "bad"; },
    (p) => { p.features[1] = p.features[0]; },
  ].entries()) {
    const output = path.join(root, String(index));
    await assert.rejects(build(output, { fetchImpl: fixture((p, k) => { if (k === "features") change(p); }) }));
    assert.equal((await readdir(path.join(output, ".staging"))).length, 1);
    await assert.rejects(readFile(path.join(output, "current.json")), { code: "ENOENT" });
  }
});

test("MA verifier rejects changed artifacts, manifest counts/policy, duplicates and inconsistent provenance", async (t) => {
  const root = await workspace(t), result = await build(root), directory = path.dirname(result.manifest_path);
  const changes = [
    ["normalized.jsonl", (s) => s.replace('"ingest_run_id":"', '"ingest_run_id":"wrong-')],
    ["selected-features.jsonl", (s) => s.replace('"OBJECTID":2', '"OBJECTID":1')],
    ["quarantine.jsonl", () => '{}\n'],
    ["source-observation.json", (s) => s.replace('"output_wkid":4326', '"output_wkid":26986')],
    ["source-observation.json", (s) => s.replace('"kind":"count"', '"kind":"inventory"')],
    ["manifest.json", (s) => s.replace('"accepted":20', '"accepted":19')],
    ["manifest.json", (s) => s.replace('"active_business_verified":false', '"active_business_verified":true')],
    ["manifest.json", (s) => s.replace('"local-review-only"', '"public"')],
    ["manifest.json", (s) => s.replace('"path":"normalized.jsonl"', '"path":"../../outside"')],
  ];
  for (const [name, mutate] of changes) {
    const filename = path.join(directory, name), original = await readFile(filename, "utf8");
    await writeFile(filename, mutate(original)); await assert.rejects(verifyMaChildcareRelease(result.manifest_path)); await writeFile(filename, original);
  }
  await writeFile(path.join(directory, "extra.json"), "{}"); await assert.rejects(verifyMaChildcareRelease(result.manifest_path), /extra artifacts/);
});

test("MA cancellation removes only owned staging and preserves previous release and siblings", async (t) => {
  const root = await workspace(t), first = await build(root), pointer = await readFile(path.join(root, "current.json"), "utf8");
  const sibling = path.join(root, ".staging/sibling"); await mkdir(sibling); await writeFile(path.join(sibling, "resume"), "preserve");
  for (const phase of ["acquire", "normalize", "verify", "before-commit"]) {
    const abort = new AbortController();
    await assert.rejects(build(root, { signal: abort.signal, logger: (message) => { if (message === phase) abort.abort(); } }), { name: "AbortError" });
    assert.equal(await readFile(path.join(root, "current.json"), "utf8"), pointer);
    assert.deepEqual(await readdir(path.join(root, ".staging")), ["sibling"]);
    await verifyMaChildcareRelease(first.manifest_path);
  }
});

test("MA output lock excludes concurrent publication without stale-lock reclamation", async (t) => {
  const root = await workspace(t); let release, entered;
  const blocked = new Promise((resolve) => { entered = resolve; }), gate = new Promise((resolve) => { release = resolve; });
  const base = fixture(); let firstCall = true;
  const running = build(root, { fetchImpl: async (...args) => { if (firstCall) { firstCall = false; entered(); await gate; } return base(...args); } });
  await blocked;
  try { await assert.rejects(build(root), { code: "EEXIST" }); } finally { release(); }
  await running;
  await writeFile(path.join(root, ".publish.lock"), "old");
  await assert.rejects(build(root), { code: "EEXIST" }); assert.equal(await readFile(path.join(root, ".publish.lock"), "utf8"), "old");
});

test("MA rejects escaping paths, directory aliases and renamed manifest identity", async (t) => {
  const root = await workspace(t);
  await assert.rejects(build(path.dirname(APP_ROOT)), /inside/);
  await assert.rejects(build(APP_ROOT), /workspace root/);
  const target = path.join(root, "target"); await mkdir(target);
  const alias = path.join(root, "alias"); await symlink(target, alias, "junction");
  await assert.rejects(build(path.join(alias, "child")), /alias/);
  const result = await build(target);
  await assert.rejects(verifyMaChildcareRelease(path.join(alias, "releases", result.release_id, "manifest.json")), /alias/);
  await assert.rejects(verifyMaChildcareRelease(path.join(target, "current.json")), /manifest filename/);
});

test("MA cleanup never deletes substituted staging or a foreign replacement lock", async (t) => {
  const root = await workspace(t), abort = new AbortController(); let replaced;
  await assert.rejects(build(root, { signal: abort.signal, fetchImpl: async () => {
    const [run] = await readdir(path.join(root, ".staging")); replaced = path.join(root, ".staging", run);
    await rename(replaced, `${replaced}-original`); await mkdir(replaced); await writeFile(path.join(replaced, "foreign"), "preserve");
    await rename(path.join(root, ".publish.lock"), path.join(root, "original.lock"));
    await writeFile(path.join(root, ".publish.lock"), JSON.stringify({ run_id: "foreign", pid: 0 }));
    abort.abort(); throw abort.signal.reason;
  } }), { name: "AggregateError", code: "MA_CHILDCARE_INSPECTION_REQUIRED" });
  assert.equal(await readFile(path.join(replaced, "foreign"), "utf8"), "preserve");
  assert.equal(JSON.parse(await readFile(path.join(root, ".publish.lock"), "utf8")).run_id, "foreign");
});

test("MA refuses publication if lock ownership changes immediately before commit", async (t) => {
  const root = await workspace(t);
  await assert.rejects(build(root, { logger: async (phase) => {
    if (phase !== "before-commit") return;
    await rename(path.join(root, ".publish.lock"), path.join(root, "original.lock"));
    await writeFile(path.join(root, ".publish.lock"), JSON.stringify({ run_id: "foreign", pid: 0 }));
  } }), { name: "AggregateError", code: "MA_CHILDCARE_INSPECTION_REQUIRED" });
  assert.deepEqual(await readdir(path.join(root, "releases")), []);
  await assert.rejects(readFile(path.join(root, "current.json")), { code: "ENOENT" });
  assert.equal(JSON.parse(await readFile(path.join(root, ".publish.lock"), "utf8")).run_id, "foreign");
});
