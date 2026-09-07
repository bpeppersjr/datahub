import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { buildNjChildcareRelease, reprocessNjChildcareRelease } from "./nj-childcare-release.mjs";
import { loadNjChildcareRegistryInput } from "./nj-childcare-registry-input.mjs";

const originalFetch = globalThis.fetch;
await import("./fixtures/nj-childcare-fetch.mjs");
const fixtureFetch = globalThis.fetch;
globalThis.fetch = originalFetch;
const now = () => new Date("2026-09-07T21:00:00.000Z");
async function fixture(t) {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/nj-registry-input-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const release = await buildNjChildcareRelease({ outputRoot: path.join(root, "source"), fetchImpl: fixtureFetch, sleep: async () => {}, now });
  return { root, release };
}

test("NJ verified input converts original and reprocessed releases locally with stable row identities", async (t) => {
  const { root, release } = await fixture(t);
  const before = await readFile(release.manifest_path);
  const reprocessed = await reprocessNjChildcareRelease(release.manifest_path, { outputRoot: path.join(root, "reprocessed"), now });
  const savedFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Network forbidden during registry conversion"); };
  let original, latest;
  try { original = await loadNjChildcareRegistryInput(release.manifest_path); latest = await loadNjChildcareRegistryInput(reprocessed.manifest_path); }
  finally { globalThis.fetch = savedFetch; }
  assert.equal(original.contributions.length, 1); assert.equal(latest.contributions.length, 1);
  assert.equal(latest.nationalReportingIntegrated, false); assert.equal(latest.exportPolicy, "local-review-only");
  assert.equal(latest.source.observedAt, original.source.observedAt); assert.equal(latest.source.sourceReleaseId, original.source.sourceReleaseId);
  assert.equal(latest.source.parentManifestSha256, release.manifest_sha256); assert.equal(original.source.processedAt, null);
  assert.deepEqual(latest.contributions[0].entities.map(e => e.entity_id), original.contributions[0].entities.map(e => e.entity_id));
  assert.equal(latest.contributions[0].matchProfiles.length, 0);
  assert.deepEqual(await readFile(release.manifest_path), before);
});

test("NJ registry input rejects tampered data and metadata instead of converting unverified records", async (t) => {
  const { release } = await fixture(t);
  const file = path.join(path.dirname(release.manifest_path), "normalized.jsonl");
  const original = await readFile(file);
  const record = JSON.parse(original.toString("utf8")); record.business_name = "Tampered";
  await writeFile(file, `${JSON.stringify(record)}\n`);
  await assert.rejects(loadNjChildcareRegistryInput(release.manifest_path));
  await writeFile(file, original);
  await writeFile(path.join(path.dirname(file), "publisher-metadata.xml"), "<metadata>wrong</metadata>");
  await assert.rejects(loadNjChildcareRegistryInput(release.manifest_path));
});

test("NJ registry input rejects transport options, current pointers and pre-cancellation", async (t) => {
  const { root, release } = await fixture(t);
  await assert.rejects(loadNjChildcareRegistryInput(release.manifest_path, { fetchImpl: fixtureFetch }), /Unsupported/);
  await assert.rejects(loadNjChildcareRegistryInput(release.manifest_path, { signal: AbortSignal.abort() }), { name: "AbortError" });
  await assert.rejects(loadNjChildcareRegistryInput(path.join(root, "source/current.json")), /manifest filename/);
});
