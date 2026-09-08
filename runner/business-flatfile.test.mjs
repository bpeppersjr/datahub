import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { BUSINESS_FLATFILE_CATEGORIES, composeFlatBusinessExport, parseArguments } from "../scripts/compose-flat-business-export.mjs";
import { childcareReportingRow } from "./fixtures/childcare-reporting-row.mjs";
import { createTnChildcareReportingFixture } from "./fixtures/tn-childcare-reporting.mjs";
import { createFreshTnReportingRows } from "./fixtures/tn-childcare-fresh-reporting.mjs";

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

test("reporting-only childcare is exported only in local-review mode with split ZIP and source evidence", async (t) => {
  const item = await fixture(t), release = path.join(item.root, "release");
  const manifestPath = path.join(release, "manifest.json"), manifest = JSON.parse(await readFile(manifestPath));
  const row = childcareReportingRow(), bytes = gzipSync(`${JSON.stringify(row)}\n`);
  await writeFile(path.join(release, "childcare.jsonl.gz"), bytes);
  manifest.artifacts.push({ path: "childcare.jsonl.gz", artifact_type: "business-reporting-location-evidence-jsonl-gzip", bytes: bytes.length, sha256: digest(bytes) });
  await writeFile(manifestPath, JSON.stringify(manifest));
  const common = ["--source", item.pointer, "--output", path.relative(APP_ROOT, item.root), "--category", "childcare", "--format", "jsonl", "--field", "business_name,zip_code,zip4,latitude,longitude,source_status,source_evidence,identity_matching_eligible"];
  const denied = await composeFlatBusinessExport([...common, "--output-prefix", "childcare-public"]);
  assert.equal(denied.summary.counts.rows_written, 0);
  assert.equal(denied.summary.counts.policy_rejected, 1);
  const local = await composeFlatBusinessExport([...common, "--output-prefix", "childcare-local", "--policy-mode", "local-review"]);
  assert.equal(local.summary.counts.rows_written, 1);
  const actual = JSON.parse((await readFile(path.join(local.outputDirectory, "records.jsonl"), "utf8")).trim());
  assert.deepEqual([actual.business_name, actual.zip_code, actual.zip4, actual.latitude, actual.longitude], ["Fixture Childcare", "02536", "5023", 41.57, -70.6]);
  assert.equal(actual.identity_matching_eligible, false);
  assert.deepEqual(actual.source_status, row.source_status);
  assert.deepEqual(actual.source_evidence, row.evidence);
  row.export_policy = "public";
  const altered = gzipSync(`${JSON.stringify(row)}\n`);
  await writeFile(path.join(release, "childcare.jsonl.gz"), altered);
  Object.assign(manifest.artifacts.at(-1), { bytes: altered.length, sha256: digest(altered) });
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(composeFlatBusinessExport([...common, "--output-prefix", "childcare-forged-policy"]), /reporting-only childcare/i);
  manifest.artifacts.at(-1).artifact_type = "entity-resolution-location-profile-jsonl-gzip";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(composeFlatBusinessExport([...common, "--output-prefix", "childcare-mislabelled"]), /cannot appear in matching-profile/i);
  for (const field of ["evidence", "source_status", "address"]) {
    const injected = childcareReportingRow(); injected[field].private_owner_contact = "excluded fixture";
    const bytes = gzipSync(`${JSON.stringify(injected)}\n`);
    await writeFile(path.join(release, "childcare.jsonl.gz"), bytes);
    Object.assign(manifest.artifacts.at(-1), { artifact_type: "business-reporting-location-evidence-jsonl-gzip", bytes: bytes.length, sha256: digest(bytes) });
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(composeFlatBusinessExport([...common, "--output-prefix", `childcare-private-${field}`, "--policy-mode", "local-review"]), /reporting-only childcare/i);
  }
});

test("TN exports conserve mixed and all-null ZIP cohorts under explicit local review", async t => {
  const previousFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("Network forbidden"); };
  t.after(() => { globalThis.fetch = previousFetch; });
  for (const fresh of [false, true]) for (const allMissing of [false, true]) {
    const item = await fixture(t), release = path.join(item.root, "release"), manifestPath = path.join(release, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath));
    const rows = fresh ? await createFreshTnReportingRows(t, { allMissing, zip: "37201-0123" }) : [
      createTnChildcareReportingFixture({ zip: allMissing ? null : "37201-0123", attributes: { OBJECTID: 1, Street_Address_2: "Suite 4" } }).row,
      createTnChildcareReportingFixture({ zip: null, attributes: { OBJECTID: 2 } }).row,
      createTnChildcareReportingFixture({ zip: "0", attributes: { OBJECTID: 3 }, geometry: null }).row,
    ];
    manifest.publisher = { id: "national-business-registry", version: fresh ? "2.14.0" : "2.13.0" };
    manifest.dependencies = [{ dataset_id: rows[0].source.source_id, release_id: rows[0].evidence.release_id, manifest_sha256: rows[0].evidence.manifest_sha256 }];
    const missing = allMissing ? 3 : 2;
    manifest.coverage = { tn_childcare_center_sites: 3, tn_childcare_center_sites_with_zip: 3 - missing, tn_childcare_center_sites_without_zip: missing,
      reporting_location_evidence_without_zip: missing, tn_childcare_missing_zip_reasons: { "missing-source-zip": missing - 1, "invalid-source-zip-placeholder": 1 } };
    for (const [partition, records] of Map.groupBy(rows, row => row.zip_code?.slice(0, 2) ?? "unassigned")) {
      const relative = `reporting/location-evidence/zip2=${partition}/records.jsonl.gz`, file = path.join(release, relative), bytes = gzipSync(records.map(JSON.stringify).join("\n") + "\n");
      await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
      manifest.artifacts.push({ path: relative, artifact_type: "business-reporting-location-evidence-jsonl-gzip", record_count: records.length, export_policy: "local-review-only", bytes: bytes.length, sha256: digest(bytes) });
    }
    await writeFile(manifestPath, JSON.stringify(manifest));
    const args = ["--source", item.pointer, "--output", path.relative(APP_ROOT, item.root), "--category", "childcare", "--state", "TN", "--format", "both"];
    const denied = await composeFlatBusinessExport([...args, "--output-prefix", "tn-public"]);
    assert.equal(denied.summary.counts.rows_written, 0); assert.equal(denied.summary.counts.policy_rejected, 3);
    const result = await composeFlatBusinessExport([...args, "--output-prefix", "tn-local", "--policy-mode", "local-review"]);
    const exported = (await readFile(path.join(result.outputDirectory, "records.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(exported.length, 3); assert.equal(exported.filter(row => row.zip_code === null && row.zip4 === null).length, missing);
    for (const row of exported) {
      const source = rows.find(r => r.source.source_record_id === row.source_record_id);
      assert.deepEqual(row.source_evidence, source.evidence); assert.deepEqual(row.source_status, source.source_status); assert.equal(row.identity_matching_eligible, false);
      assert.equal(row.latitude, source.location.latitude); assert.equal(row.longitude, source.location.longitude);
    }
    assert.equal(exported.find(row => row.source_record_id === rows[fresh ? 1 : 0].source.source_record_id).unit_or_additional, fresh ? "Suite 200" : "Suite 4");
    if (!allMissing) assert.equal(exported.find(row => row.zip_code !== null).zip4, "0123");
    for (const [index, mutate] of [m => { m.publisher.version = fresh ? "2.13.0" : "2.14.0"; }, m => { m.publisher.version = "2.15.0"; }, m => { m.publisher.version = "2.13.1"; }, m => { m.dependencies = []; }, m => { m.dependencies.push(structuredClone(m.dependencies[0])); }, m => { m.coverage.tn_childcare_center_sites++; }, m => { m.coverage.tn_childcare_missing_zip_reasons["missing-source-zip"]++; }].entries()) {
      const bad = structuredClone(manifest); mutate(bad); await writeFile(manifestPath, JSON.stringify(bad));
      await assert.rejects(composeFlatBusinessExport([...args, "--output-prefix", `tn-bad-${index}`, "--policy-mode", "local-review"]), /TN|Tennessee/);
    }
    const oversized = structuredClone(manifest); oversized.artifacts.find(a => a.path.includes("unassigned")).bytes = 100_000_001;
    await writeFile(manifestPath, JSON.stringify(oversized));
    await assert.rejects(composeFlatBusinessExport([...args, "--output-prefix", "tn-oversized", "--policy-mode", "local-review"]), /byte limit/);
    const mislabelled = structuredClone(manifest); mislabelled.artifacts.find(a => a.path.includes("unassigned")).artifact_type = "entity-resolution-location-profile-jsonl-gzip";
    await writeFile(manifestPath, JSON.stringify(mislabelled));
    await assert.rejects(composeFlatBusinessExport([...args, "--output-prefix", "tn-matching", "--policy-mode", "local-review"]), /cannot appear in matching-profile/);
    const a = manifest.artifacts.find(a => a.path.includes("unassigned")), file = path.join(release, a.path);
    const { gunzipSync } = await import("node:zlib"); const clean = await readFile(file);
    for (const [index, mutate] of [r => { r.export_policy = "public"; }, r => { r.address.private_contact = "excluded"; }, r => { r.evidence.manifest_sha256 = "e".repeat(64); }, r => { r.zip_code = "37201"; }].entries()) {
      const changed = gunzipSync(clean).toString().trim().split("\n").map(JSON.parse); mutate(changed[0]);
      const bytes = gzipSync(changed.map(JSON.stringify).join("\n") + "\n"), bad = structuredClone(manifest), entry = bad.artifacts.find(x => x.path === a.path);
      Object.assign(entry, { bytes: bytes.length, sha256: digest(bytes) }); await writeFile(file, bytes); await writeFile(manifestPath, JSON.stringify(bad));
      await assert.rejects(composeFlatBusinessExport([...args, "--output-prefix", `tn-row-${index}`, "--policy-mode", "local-review"]), /TN|Tennessee/);
    }
  }
});

test("argument validation requires explicit supported policy modes", () => {
  assert.equal(parseArguments([]).policyMode, "public-only");
  assert.throws(() => parseArguments(["--policy-mode", "public"]), /public-only or local-review/);
  assert.throws(() => parseArguments(["--state", "Texas"]), /two-letter/);
});

test("cancellation removes an incomplete export without publishing a manifest", async (t) => {
  const item = await fixture(t);
  const controller = new AbortController();
  const task = composeFlatBusinessExport(["--source", item.pointer, "--output", path.relative(APP_ROOT, item.root), "--output-prefix", "cancelled"], { signal: controller.signal });
  controller.abort();
  await assert.rejects(task, /abort/i);
  await assert.rejects(() => stat(path.join(item.root, "cancelled")), { code: "ENOENT" });
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
