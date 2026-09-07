import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, rename } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { NJ_CHILDCARE_SCHEMA, NJ_CHILDCARE_ITEM, NJ_CHILDCARE_LAYER } from "./nj-childcare-preflight.mjs";
import { buildNjChildcareRelease, verifyNjChildcareRelease } from "./nj-childcare-release.mjs";

const now = () => new Date("2026-09-07T20:00:00.000Z"), sleep = async () => {};
const xml = Buffer.from("\ufeff<?xml version=\"1.0\"?>\\n<metadata>Strc_DCF_childcare</metadata>\\n".replaceAll("\\n", "\n"));
function fixture(change = () => {}, count = 20) {
  return async (url) => {
    const parsed = new URL(url), params = parsed.searchParams;
    const kind = parsed.pathname.endsWith("metadata.xml") ? "xml" : parsed.pathname.includes("sharing/rest") ? "item"
      : !parsed.pathname.endsWith("/query") ? "metadata" : params.has("returnCountOnly") ? "count"
        : params.has("outStatistics") ? "dates" : params.has("returnIdsOnly") ? "inventory" : "features";
    if (kind === "xml") return new Response(xml, { headers: { "content-type": "application/xml" } });
    const payload = kind === "metadata" ? { id: 4, name: "Child Care Centers", type: "Feature Layer",
      geometryType: "esriGeometryPoint", extent: { spatialReference: { wkid: 102100, latestWkid: 3857 } },
      capabilities: "Map,Query,Data", maxRecordCount: 100, advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
      fields: NJ_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length ? { length } : {}), domain: null })) }
      : kind === "item" ? { id: NJ_CHILDCARE_ITEM, owner: "NJDEPBGIS", access: "public", type: "Feature Service",
        title: "Child Care Centers of New Jersey", url: NJ_CHILDCARE_LAYER, modified: 1758741707000, created: 1500000000000, licenseInfo: "Preserve NJDEP metadata and notices." }
      : kind === "count" ? { count } : kind === "dates" ? { features: [{ attributes: { download_date_min: 1786463205000, download_date_max: 1786463205000, download_date_count: count } }] }
      : kind === "inventory" ? { objectIdFieldName: "OBJECTID", objectIds: Array.from({ length: count }, (_, i) => i + 1) }
        : { spatialReference: { wkid: 4326 }, features: params.get("objectIds").split(",").map((id) => ({ attributes: {
          ...Object.fromEntries(NJ_CHILDCARE_SCHEMA.map(([name]) => [name, null])),
          OBJECTID: Number(id), center_id: `000${id}`, center_name: "Fixture Center", address: "10 Main Street", city: "Trenton", zip: "08625-1234",
          state: "NJ", licensed_capacity: 20, foips: "Y", download_date: 1786463205000,
        }, geometry: { x: -74.76, y: 40.22 } })) };
    change(payload, kind); return new Response(JSON.stringify(payload));
  };
}
async function workspace(t) {
  const tmp = path.join(APP_ROOT, "data/tmp"); await mkdir(tmp, { recursive: true });
  const root = await mkdtemp(path.join(tmp, "nj-release-"));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
const build = (outputRoot, extra = {}) => buildNjChildcareRelease({ outputRoot, fetchImpl: fixture(), sleep, now, ...extra });

test("NJ release publishes immutable evidence and independently reproduces selected normalization", async (t) => {
  const root = await workspace(t), result = await build(root);
  assert.equal(result.status, "complete"); assert.deepEqual(result.counts, { selected: 20, accepted: 20, quarantined: 0 });
  assert.equal((await verifyNjChildcareRelease(result.manifest_path)).artifact_count, 5);
  assert.deepEqual(await readFile(path.join(path.dirname(result.manifest_path), "publisher-metadata.xml")), xml);
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

test("NJ release quarantines at most 5% while rejecting source scope/private drift wholesale", async (t) => {
  const root = await workspace(t);
  const accepted = await build(path.join(root, "accepted"), { fetchImpl: fixture((p, k) => { if (k === "features") p.features[0].attributes.zip = "bad"; }) });
  assert.equal(accepted.counts.quarantined, 1); await verifyNjChildcareRelease(accepted.manifest_path);
  for (const [index, change] of [
    (p) => { p.features[0].attributes.state = "NY"; p.features[0].attributes.center_name = null; },
    (p) => { p.features[0].attributes.center_phone = "not allowed"; },
    (p) => { p.features[0].attributes.address2 = { owner: "private" }; },
    (p) => { p.features[0].geometry.x = { owner: "private" }; },
    (p) => { p.features[0].attributes.zip = "bad"; p.features[1].attributes.zip = "bad"; },
    (p) => { p.features[1] = p.features[0]; },
  ].entries()) {
    const output = path.join(root, String(index));
    await assert.rejects(build(output, { fetchImpl: fixture((p, k) => { if (k === "features") change(p); }) }));
    assert.equal((await readdir(path.join(output, ".staging"))).length, 1);
    await assert.rejects(readFile(path.join(output, "current.json")), { code: "ENOENT" });
  }
});

test("NJ verifier rejects changed artifacts, manifest counts/policy, duplicates and inconsistent provenance", async (t) => {
  const root = await workspace(t), result = await build(root), directory = path.dirname(result.manifest_path);
  const changes = [
    ["normalized.jsonl", (s) => s.replace('"ingest_run_id":"', '"ingest_run_id":"wrong-')],
    ["selected-features.jsonl", (s) => s.replace('"OBJECTID":2', '"OBJECTID":1')],
    ["quarantine.jsonl", () => '{}\n'],
    ["publisher-metadata.xml", (s) => s.replace("Strc_DCF_childcare", "different")],
    ["source-observation.json", (s) => s.replace('"output_wkid":4326', '"output_wkid":26986')],
    ["source-observation.json", (s) => s.replace('"kind":"count"', '"kind":"inventory"')],
    ["manifest.json", (s) => s.replace('"accepted":20', '"accepted":19')],
    ["manifest.json", (s) => s.replace('"active_business_verified":false', '"active_business_verified":true')],
    ["manifest.json", (s) => s.replace('"local-review-only"', '"public"')],
    ["manifest.json", (s) => s.replace('"path":"normalized.jsonl"', '"path":"../../outside"')],
  ];
  for (const [name, mutate] of changes) {
    const filename = path.join(directory, name), original = await readFile(filename, "utf8");
    await writeFile(filename, mutate(original)); await assert.rejects(verifyNjChildcareRelease(result.manifest_path)); await writeFile(filename, original);
  }
  await writeFile(path.join(directory, "extra.json"), "{}"); await assert.rejects(verifyNjChildcareRelease(result.manifest_path), /extra artifacts/);
});

test("NJ verifier replays self-consistently rehashed unsafe JSON and XML rather than trusting artifact checksums", async (t) => {
  const root = await workspace(t), result = await build(root), directory = path.dirname(result.manifest_path);
  const original = Object.fromEntries(await Promise.all(["manifest.json", "source-observation.json", "selected-features.jsonl", "publisher-metadata.xml"].map(async (name) => [name, await readFile(path.join(directory, name))])));
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  for (const variant of ["private-nested", "private-field", "xml-dtd"]) {
    const source = JSON.parse(original["source-observation.json"]), manifest = JSON.parse(original["manifest.json"]);
    let retainedXml = original["publisher-metadata.xml"], selected = original["selected-features.jsonl"];
    if (variant === "xml-dtd") {
      retainedXml = Buffer.from('<!DOCTYPE metadata [<!ENTITY hidden "private">]><metadata>Strc_DCF_childcare</metadata>');
      for (const entry of source.observations.filter((entry) => entry.kind === "xml")) {
        entry.payload_sha256 = hash(retainedXml); entry.payload.sha256 = hash(retainedXml); entry.payload.bytes = retainedXml.length;
      }
    } else {
      for (const entry of source.observations.filter((entry) => entry.kind === "features")) {
        if (variant === "private-nested") entry.payload.features[0].attributes.address2 = { owner: "private" };
        else entry.payload.features[0].attributes.center_email = "private";
        entry.payload_sha256 = hash(JSON.stringify(entry.payload));
      }
      source.selected_json_bytes = source.observations.filter((entry) => entry.kind === "features").reduce((total, entry) => total + Buffer.byteLength(JSON.stringify(entry.payload)), 0);
      selected = Buffer.from(source.observations.filter((entry) => entry.kind === "features").flatMap((entry) => entry.payload.features).map((entry) => `${JSON.stringify(entry)}\n`).join(""));
    }
    const replacements = { "source-observation.json": Buffer.from(`${JSON.stringify(source)}\n`), "selected-features.jsonl": selected, "publisher-metadata.xml": retainedXml };
    for (const artifact of manifest.artifacts) if (replacements[artifact.path]) {
      artifact.sha256 = hash(replacements[artifact.path]); artifact.bytes = replacements[artifact.path].length;
    }
    for (const [name, bytes] of Object.entries(replacements)) await writeFile(path.join(directory, name), bytes);
    await writeFile(result.manifest_path, `${JSON.stringify(manifest)}\n`);
    await assert.rejects(verifyNjChildcareRelease(result.manifest_path), variant === "xml-dtd" ? /metadata request rejected/ : /private|selected fields/);
    for (const [name, bytes] of Object.entries(original)) await writeFile(path.join(directory, name), bytes);
  }
  assert.equal((await verifyNjChildcareRelease(result.manifest_path)).status, "verified");
});

test("NJ cancellation removes only owned staging and preserves previous release and siblings", async (t) => {
  const root = await workspace(t), first = await build(root), pointer = await readFile(path.join(root, "current.json"), "utf8");
  const sibling = path.join(root, ".staging/sibling"); await mkdir(sibling); await writeFile(path.join(sibling, "resume"), "preserve");
  for (const phase of ["acquire", "normalize", "verify", "before-commit"]) {
    const abort = new AbortController();
    await assert.rejects(build(root, { signal: abort.signal, logger: (message) => { if (message === phase) abort.abort(); } }), { name: "AbortError" });
    assert.equal(await readFile(path.join(root, "current.json"), "utf8"), pointer);
    assert.deepEqual(await readdir(path.join(root, ".staging")), ["sibling"]);
    await verifyNjChildcareRelease(first.manifest_path);
  }
});

test("NJ output lock excludes concurrent publication without stale-lock reclamation", async (t) => {
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

test("NJ rejects escaping paths, directory aliases and renamed manifest identity", async (t) => {
  const root = await workspace(t);
  await assert.rejects(build(path.dirname(APP_ROOT)), /inside/);
  await assert.rejects(build(APP_ROOT), /workspace root/);
  const target = path.join(root, "target"); await mkdir(target);
  const alias = path.join(root, "alias"); await symlink(target, alias, "junction");
  await assert.rejects(build(path.join(alias, "child")), /alias/);
  const result = await build(target);
  await assert.rejects(verifyNjChildcareRelease(path.join(alias, "releases", result.release_id, "manifest.json")), /alias/);
  await assert.rejects(verifyNjChildcareRelease(path.join(target, "current.json")), /manifest filename/);
});

test("NJ cleanup never deletes substituted staging or a foreign replacement lock", async (t) => {
  const root = await workspace(t), abort = new AbortController(); let replaced;
  await assert.rejects(build(root, { signal: abort.signal, fetchImpl: async () => {
    const [run] = await readdir(path.join(root, ".staging")); replaced = path.join(root, ".staging", run);
    await rename(replaced, `${replaced}-original`); await mkdir(replaced); await writeFile(path.join(replaced, "foreign"), "preserve");
    await rename(path.join(root, ".publish.lock"), path.join(root, "original.lock"));
    await writeFile(path.join(root, ".publish.lock"), JSON.stringify({ run_id: "foreign", pid: 0 }));
    abort.abort(); throw abort.signal.reason;
  } }), { name: "AggregateError", code: "NJ_CHILDCARE_INSPECTION_REQUIRED" });
  assert.equal(await readFile(path.join(replaced, "foreign"), "utf8"), "preserve");
  assert.equal(JSON.parse(await readFile(path.join(root, ".publish.lock"), "utf8")).run_id, "foreign");
});

test("NJ refuses publication if lock ownership changes immediately before commit", async (t) => {
  const root = await workspace(t);
  await assert.rejects(build(root, { logger: async (phase) => {
    if (phase !== "before-commit") return;
    await rename(path.join(root, ".publish.lock"), path.join(root, "original.lock"));
    await writeFile(path.join(root, ".publish.lock"), JSON.stringify({ run_id: "foreign", pid: 0 }));
  } }), { name: "AggregateError", code: "NJ_CHILDCARE_INSPECTION_REQUIRED" });
  assert.deepEqual(await readdir(path.join(root, "releases")), []);
  await assert.rejects(readFile(path.join(root, "current.json")), { code: "ENOENT" });
  assert.equal(JSON.parse(await readFile(path.join(root, ".publish.lock"), "utf8")).run_id, "foreign");
});
