import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { cp, link, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildZipDenominatorDeltaReview, verifyZipDenominatorDeltaReview } from "./zip-denominator-delta-review.mjs";
import { loadZipDenominatorDeltaReviewView } from "./zip-denominator-delta-review-view.mjs";
import { zipDenominatorDeltaReviewHttp } from "./zip-denominator-delta-review-http.mjs";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = fileURLToPath(new URL("../data/zip-denominator-delta-review/releases/zip-denominator-delta-review-20260923223658573-e72836b8/manifest.json", import.meta.url));

test("replays the exact immutable current-versus-prior delta", async () => {
  const verified = await verifyZipDenominatorDeltaReview(MANIFEST);
  assert.equal(verified.artifact.production.key_count, 48194);
  assert.equal(verified.artifact.prior_candidate.key_count, 48190);
  assert.deepEqual(verified.artifact.local_review_drilldown.map((row) => row.zip5), ["01065", "01385", "02363", "45730"]);
  assert.equal(verified.artifact.delta.by_source.ma_childcare_centers, 3);
  assert.equal(verified.artifact.delta.by_source.oh_childcare_centers, 1);
  assert.equal(verified.artifact.claims.usps_operational_denominator_verified, false);
});

test("view binds selection and exposes local review only", async () => {
  const view = await loadZipDenominatorDeltaReviewView();
  assert.equal(view.delta.added_count, 4);
  assert.equal(view.not_operational_usps_denominator, true);
  assert.equal(view.read_only, true);
  assert.equal(view.claims.admission_authorized, false);
  assert.equal(view.claims.production_executed, false);
});

function request(method = "GET", headers = {}) {
  const value = new EventEmitter();
  Object.assign(value, { method, headers, readableEnded: true, readableLength: 0 });
  value.resume = () => {};
  return value;
}

test("HTTP permits only an empty GET, rejects streamed/chunked bodies, and redacts failures", async () => {
  const calls = [];
  const json = (_response, status, payload) => calls.push({ status, payload });
  await zipDenominatorDeltaReviewHttp(request(), {}, new URL("http://x/review"), async () => ({ read_only: true }), json);
  for (const method of ["POST", "OPTIONS"]) await zipDenominatorDeltaReviewHttp(request(method), {}, new URL("http://x/review"), async () => assert.fail(`${method} loaded view`), json);
  await zipDenominatorDeltaReviewHttp(request(), {}, new URL("http://x/review?zip=01065"), async () => assert.fail("query loaded view"), json);
  await zipDenominatorDeltaReviewHttp(request("GET", { "content-length": "2" }), {}, new URL("http://x/review"), async () => assert.fail("body loaded view"), json);
  await zipDenominatorDeltaReviewHttp(request("GET", { "transfer-encoding": "chunked" }), {}, new URL("http://x/review"), async () => assert.fail("chunked loaded view"), json);
  const streamed = request(); streamed.readableEnded = false;
  const pending = zipDenominatorDeltaReviewHttp(streamed, {}, new URL("http://x/review"), async () => assert.fail("stream loaded view"), json);
  streamed.emit("data", Buffer.from("{}")); streamed.emit("end"); await pending;
  await zipDenominatorDeltaReviewHttp(request(), {}, new URL("http://x/review"), async () => { throw Error("C:\\private\\manifest.json bearer-secret"); }, json);
  assert.deepEqual(calls.map(({ status }) => status), [200, 405, 405, 400, 400, 400, 400, 503]);
  assert.deepEqual(calls[0].payload, { read_only: true });
  assert.equal(JSON.stringify(calls.at(-1)).includes("private"), false);
  assert.equal(JSON.stringify(calls.at(-1)).includes("bearer-secret"), false);
});

async function copiedRelease(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "zip-delta-verifier-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const release = path.join(root, "data", "zip-denominator-delta-review", "releases", path.basename(path.dirname(MANIFEST)));
  await cp(path.dirname(MANIFEST), release, { recursive: true });
  return { root, release, manifest: path.join(release, "manifest.json") };
}

test("verifier rejects release identity, artifact contract, path escape, inventory, and byte drift", async (t) => {
  for (const mutate of [
    (value) => { value.release_id = "zip-denominator-delta-review-20260923223658573-deadbeef"; },
    (value) => { value.artifacts[0].artifact_type = "private-record-export"; },
    (value) => { value.artifacts[0].path = "../delta-review.json"; },
    (value) => { value.artifacts[0].record_count = 4; },
    (value) => { value.current_pointer = "current.json"; },
  ]) await t.test("rejects a mutated manifest invariant", async (inner) => {
    const fixture = await copiedRelease(inner);
    const value = JSON.parse(await readFile(fixture.manifest)); mutate(value);
    await writeFile(fixture.manifest, `${JSON.stringify(value)}\n`);
    await assert.rejects(verifyZipDenominatorDeltaReview(fixture.manifest, { root: fixture.root }), /unavailable/);
  });
  await t.test("rejects undeclared files", async (inner) => {
    const fixture = await copiedRelease(inner); await writeFile(path.join(fixture.release, "private.txt"), "undeclared");
    await assert.rejects(verifyZipDenominatorDeltaReview(fixture.manifest, { root: fixture.root }), /unavailable/);
  });
  await t.test("rejects artifact byte drift", async (inner) => {
    const fixture = await copiedRelease(inner); await writeFile(path.join(fixture.release, "delta-review.json"), "{}\n");
    await assert.rejects(verifyZipDenominatorDeltaReview(fixture.manifest, { root: fixture.root }), /unavailable/);
  });
  await t.test("stable reader rejects multiply-linked artifacts", async (inner) => {
    const fixture = await copiedRelease(inner); const extra = path.join(os.tmpdir(), `zip-delta-link-${process.pid}-${Date.now()}`);
    inner.after(() => rm(extra, { force: true })); await link(path.join(fixture.release, "delta-review.json"), extra);
    assert.equal((await lstat(path.join(fixture.release, "delta-review.json"))).nlink, 2);
    await assert.rejects(verifyZipDenominatorDeltaReview(fixture.manifest, { root: fixture.root }), /unavailable/);
  });
  await t.test("stable reader rejects multiply-linked manifests", async (inner) => {
    const fixture = await copiedRelease(inner); const extra = path.join(os.tmpdir(), `zip-delta-manifest-link-${process.pid}-${Date.now()}`);
    inner.after(() => rm(extra, { force: true })); await link(fixture.manifest, extra);
    await assert.rejects(verifyZipDenominatorDeltaReview(fixture.manifest, { root: fixture.root }), /unavailable/);
  });
});

test("selection rejects config/schema substitution, extras, and release mismatch", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zip-delta-selection-")); t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(APP_ROOT, "config"), path.join(root, "config"), { recursive: true });
  const configPath = path.join(root, "config", "datasets", "zip-denominator-delta-review.json");
  const schemaPath = path.join(root, "config", "schemas", "zip-denominator-delta-review.schema.json");
  const originalConfig = await readFile(configPath), config = JSON.parse(originalConfig);
  const verified = { release_id: config.release_id, manifest_sha256: config.manifest_sha256, artifact_sha256: config.artifact_sha256, artifact: { created_at: "2026-09-23T22:36:58.573Z", classification: "registry ZIP evidence keys", production: {}, prior_candidate: {}, delta: {}, local_review_drilldown: [], claims: {} } };
  await assert.doesNotReject(loadZipDenominatorDeltaReviewView({ root, verifier: async () => verified }));
  await writeFile(configPath, `${originalConfig.toString().trimEnd().slice(0, -1)},\"extra\":true}\n`);
  await assert.rejects(loadZipDenominatorDeltaReviewView({ root, verifier: async () => verified }), /unavailable/);
  await writeFile(configPath, originalConfig);
  const originalSchema = await readFile(schemaPath); await writeFile(schemaPath, Buffer.concat([originalSchema, Buffer.from(" ")]));
  await assert.rejects(loadZipDenominatorDeltaReviewView({ root, verifier: async () => verified }), /unavailable/);
  await writeFile(schemaPath, originalSchema);
  await assert.rejects(loadZipDenominatorDeltaReviewView({ root, verifier: async () => ({ ...verified, release_id: `${verified.release_id}-wrong` }) }), /unavailable/);
  for (const [name, target] of [["config", configPath], ["schema", schemaPath]]) {
    const extra = path.join(os.tmpdir(), `zip-delta-${name}-link-${process.pid}-${Date.now()}`); await link(target, extra);
    try { await assert.rejects(loadZipDenominatorDeltaReviewView({ root, verifier: async () => verified }), /unavailable/); }
    finally { await rm(extra, { force: true }); }
  }
});

test("builder publishes atomically, refuses collision, and cleans failed staging", { timeout: 120_000 }, async (t) => {
  const asOf = new Date("2099-01-02T03:04:05.678Z"), releases = path.join(APP_ROOT, "data", "zip-denominator-delta-review", "releases");
  let built; t.after(async () => { if (built) await rm(built.releaseDirectory, { recursive: true, force: true }); });
  const before = (await readdir(releases)).filter((name) => name.startsWith(".staging-")).sort();
  built = await buildZipDenominatorDeltaReview({ root: APP_ROOT, asOf });
  assert.match(path.basename(built.releaseDirectory), /^zip-denominator-delta-review-20990102030405678-[a-f0-9]{8}$/);
  assert.deepEqual((await readdir(built.releaseDirectory)).sort(), ["delta-review.json", "manifest.json"]);
  await assert.rejects(buildZipDenominatorDeltaReview({ root: APP_ROOT, asOf }));
  assert.deepEqual((await readdir(releases)).filter((name) => name.startsWith(".staging-")).sort(), before);
  assert.deepEqual((await readdir(built.releaseDirectory)).sort(), ["delta-review.json", "manifest.json"]);
});

test("cohort snapshots are held through replay and detect replacement races", async () => {
  const source = await readFile(new URL("./zip-denominator-delta-review.mjs", import.meta.url), "utf8");
  assert.match(source, /const snapshots=await acquireSnapshots\(root\)/);
  assert.match(source, /finally\{await releaseSnapshots\(snapshots\);\}/);
  assert.match(source, /same\(item\.identity,after\)/);
  assert.match(source, /same\(after,current\)/);
  assert.match(source, /realpath\(item\.file\)!==item\.file/);
});

test("UI is stale-safe and has no mutation controls", async () => {
  const ui = await readFile(new URL("../app/zip-denominator-delta-review.tsx", import.meta.url), "utf8");
  assert.match(ui, /AbortController/); assert.doesNotMatch(ui, />Download|>Build|>Approve|>Execute/);
});
