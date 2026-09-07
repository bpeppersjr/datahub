import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { BUSINESS_FLATFILE_CATEGORIES, composeFlatBusinessExport, parseArguments } from "../scripts/compose-flat-business-export.mjs";

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function fixture(t) {
  const name = `flatfile-test-${randomUUID()}`;
  const root = path.join(APP_ROOT, "data", "test-runtime", name);
  const release = path.join(root, "release");
  await mkdir(path.join(release, "resolution", "location-profiles"), { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  const rows = [
    { names: [{ raw: "Public Store" }], address: { street: "1 Main", city: "Austin", state: "TX", zip_code: "78701-1234" }, location: { coordinates: [-97.74, 30.27] }, source: { source_id: "usda-snap-current-retailers", source_release_id: "s1", source_record_id: "r1", ingest_run_id: "i1", policy_id: "p1", transformation_version: "v1" }, export_policy: "public", observed_at: "2026-01-01T00:00:00Z" },
    { names: [{ raw: "=Review Store" }], address: { state: "WA", zip_code: "98101", zip4: "5678" }, location: { latitude: 47.6, longitude: -122.3 }, source: { source_id: "texas-comptroller-active-sales-tax-permits", source_release_id: "s2", source_record_id: "r2", ingest_run_id: "i2", policy_id: "p2", transformation_version: "v1" }, export_policy: "local-review-only" },
    { names: [{ raw: "Bad Coordinates" }], address: { state: "WA", zip_code: "00123" }, location: { latitude: null, longitude: "" }, source: { source_id: "texas-comptroller-active-sales-tax-permits", source_release_id: "s2", source_record_id: "r3", ingest_run_id: "i2", policy_id: "p2", transformation_version: "v1" }, export_policy: "local-review-only" },
  ];
  const zipped = gzipSync(`${rows.map(JSON.stringify).join("\n")}\n`);
  const relativeArtifact = "resolution/location-profiles/zip2=00.jsonl.gz";
  await writeFile(path.join(release, ...relativeArtifact.split("/")), zipped);
  const manifest = { dataset_id: "national-business-registry", release_id: "fixture-1", status: "published-partial", artifacts: [{ path: relativeArtifact, artifact_type: "entity-resolution-location-profile-jsonl-gzip", bytes: zipped.length, sha256: digest(zipped) }] };
  await writeFile(path.join(release, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "current.json"), JSON.stringify({ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest: "release/manifest.json" }));
  return { root, pointer: path.relative(APP_ROOT, path.join(root, "current.json")) };
}

test("flat-file categories use the map-store source identifiers", () => {
  assert.ok(BUSINESS_FLATFILE_CATEGORIES["financial-services"].includes("ncua-final-quarterly-call-report"));
  assert.ok(BUSINESS_FLATFILE_CATEGORIES.transportation.includes("fmcsa-company-census-active-us-principal-office"));
  assert.ok(BUSINESS_FLATFILE_CATEGORIES["licensed-businesses"].includes("texas-comptroller-active-sales-tax-permits"));
});

test("argument validation requires explicit supported policy modes", () => {
  assert.equal(parseArguments([]).policyMode, "public-only");
  assert.throws(() => parseArguments(["--policy-mode", "public"]), /public-only or local-review/);
  assert.throws(() => parseArguments(["--state", "Texas"]), /two-letter/);
});

test("streams governed CSV/JSONL exports with policy filtering and provenance", async (t) => {
  const item = await fixture(t);
  const common = ["--source", item.pointer, "--output", path.relative(APP_ROOT, item.root), "--field", "business_name,state,zip_code,zip4,latitude,longitude,source_id,dataset_id,source_dataset_release_id,export_policy"];
  const publicResult = await composeFlatBusinessExport([...common, "--output-prefix", "public", "--format", "both"], { runId: "public-run" });
  assert.equal(publicResult.summary.counts.rows_written, 1);
  assert.equal(publicResult.summary.counts.policy_rejected, 2);
  const csv = await readFile(path.join(publicResult.outputDirectory, "records.csv"), "utf8");
  assert.match(csv, /Public Store,TX,78701,1234,30.27,-97.74/);
  assert.doesNotMatch(csv, /Review Store/);
  const jsonl = JSON.parse((await readFile(path.join(publicResult.outputDirectory, "records.jsonl"), "utf8")).trim());
  assert.equal(jsonl.dataset_id, "national-business-registry");
  assert.equal(jsonl.source_dataset_release_id, "fixture-1");
  assert.equal(publicResult.manifest.export_policy, "public-policy-filtered");
  assert.equal(publicResult.manifest.source_lineage[0].artifacts[0].sha256.length, 64);
  assert.ok((await stat(publicResult.manifestPath)).mtimeMs >= (await stat(publicResult.summaryPath)).mtimeMs);

  const reviewResult = await composeFlatBusinessExport([...common, "--output-prefix", "review", "--format", "jsonl", "--policy-mode", "local-review", "--state", "WA"], { runId: "review-run" });
  assert.equal(reviewResult.summary.counts.rows_written, 2);
  assert.equal(reviewResult.manifest.export_policy, "local-review-only");
  const reviewText = await readFile(path.join(reviewResult.outputDirectory, "records.jsonl"), "utf8"); const review = JSON.parse(reviewText.trim().split("\n")[0]);
  assert.deepEqual([review.zip_code, review.zip4, review.latitude, review.longitude], ["98101", "5678", 47.6, -122.3]);
  const reviewCsvResult = await composeFlatBusinessExport([...common, "--output-prefix", "review-csv", "--format", "csv", "--policy-mode", "local-review", "--state", "WA"], { runId: "review-csv-run" });
  const reviewCsv = await readFile(path.join(reviewCsvResult.outputDirectory, "records.csv"), "utf8");
  assert.match(reviewCsv, /'=Review Store/);
  assert.match(reviewCsv, /Bad Coordinates,WA,00123,,/);
});

test("rejects a source artifact whose governed hash is wrong and removes partial output", async (t) => {
  const item = await fixture(t); const manifestPath = path.join(item.root, "release", "manifest.json"); const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts[0].sha256 = "0".repeat(64); await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(() => composeFlatBusinessExport(["--source", item.pointer, "--output", path.relative(APP_ROOT, item.root), "--output-prefix", "bad"]), /checksum mismatch/);
  await assert.rejects(() => stat(path.join(item.root, "bad")));
});

test("repeated output backpressure completes without listener warnings and preserves hashes", { concurrency: false }, async (t) => {
  const item = await fixture(t);
  const release = path.join(item.root, "release");
  const artifactPath = path.join(release, "resolution", "location-profiles", "zip2=00.jsonl.gz");
  const payload = "x".repeat(64 * 1024);
  const rows = Array.from({ length: 100 }, (_, index) => ({
    names: [{ raw: `Store ${String(index).padStart(3, "0")} ${payload}` }],
    address: { state: "TX", zip_code: "00123" },
    source: {
      source_id: "usda-snap-current-retailers",
      source_release_id: "large-source-1",
      source_record_id: `large-${index}`,
      ingest_run_id: "large-ingest-1",
      policy_id: "public-test-policy",
      transformation_version: "v1",
    },
    export_policy: "public",
  }));
  const zipped = gzipSync(`${rows.map(JSON.stringify).join("\n")}\n`);
  await writeFile(artifactPath, zipped);
  const manifestPath = path.join(release, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts[0].bytes = zipped.length;
  manifest.artifacts[0].sha256 = digest(zipped);
  await writeFile(manifestPath, JSON.stringify(manifest));

  const warnings = [];
  const onWarning = (warning) => warnings.push(warning);
  process.on("warning", onWarning);
  t.after(() => process.off("warning", onWarning));
  const result = await composeFlatBusinessExport([
    "--source", item.pointer,
    "--output", path.relative(APP_ROOT, item.root),
    "--output-prefix", "backpressure",
    "--format", "both",
    "--field", "business_name,zip_code",
  ], { runId: "backpressure-run" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.summary.counts.rows_written, 100);
  const jsonlPath = path.join(result.outputDirectory, "records.jsonl");
  const output = await readFile(jsonlPath, "utf8");
  assert.equal(output.trimEnd().split("\n").length, 100);
  assert.match(output, /Store 000/);
  assert.match(output, /Store 099/);
  const governed = result.manifest.artifacts.find((artifact) => artifact.path === "records.jsonl");
  const outputBuffer = await readFile(jsonlPath);
  assert.equal(governed.bytes, outputBuffer.length);
  assert.equal(governed.sha256, digest(outputBuffer));
  assert.deepEqual(warnings.filter((warning) => warning.name === "MaxListenersExceededWarning"), []);
});
