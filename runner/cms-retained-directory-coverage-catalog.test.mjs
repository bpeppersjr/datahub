import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { buildCmsRetainedDirectoryCoverageCatalog, verifyCmsRetainedDirectoryCoverageCatalog } from "./cms-retained-directory-coverage-catalog.mjs";

test("catalog replays the two retained loaders and conserves ordered, minimized CMS jurisdiction totals", async (t) => {
  const outputRoot = await mkdtemp(path.join(APP_ROOT, "data/tmp/cms-retained-directory-catalog-test-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const built = await buildCmsRetainedDirectoryCoverageCatalog({ outputRoot });
  const manifestPath = path.join(built.releaseDirectory, "manifest.json");
  const verified = await verifyCmsRetainedDirectoryCoverageCatalog(manifestPath, { expectedManifestSha256: built.manifestSha256 });
  assert.equal(verified.manifestSha256, built.manifestSha256);
  assert.equal(verified.manifest.schema_version, "cms-retained-directory-coverage-catalog@1.0.0");
  assert.equal(verified.manifest.dataset_id, "cms-retained-directory-coverage-catalog");
  assert.equal(verified.manifest.status, "published-pre-production-evidence");
  assert.equal(verified.manifest.production_enrollment, false);
  assert.equal(verified.manifest.national_reporting_denominator_enrollment, false);
  assert.equal(verified.manifest.current_pointer_written, false);
  assert.equal(verified.manifest.network_requests_performed, 0);
  assert.equal(verified.manifest.claims.identity_reconciliation_status, "not-yet-reconciled");
  assert.equal(verified.manifest.claims.county_assignment_performed, false);
  assert.equal(verified.manifest.claims.zcta_membership_inferred, false);
  assert.equal(verified.manifest.claims.spatial_assignment_performed, false);
  assert.equal(verified.manifest.claims.publisher_coordinates_spatially_approved, false);
  assert.equal(verified.manifest.claims.zip4_aggregated, false);
  assert.equal(verified.manifest.claims.export_policy, "local-review-only");
  assert.equal(verified.manifest.claims.national_completeness_percent, null);
  assert.equal(verified.manifest.claims.public_export_authorized, false);
  await assert.rejects(verifyCmsRetainedDirectoryCoverageCatalog(manifestPath, { expectedManifestSha256: "0".repeat(64) }), /expected pin/);
  assert.deepEqual(verified.manifest.denominators, { all_retained_directory_rows: 20109, state_dc_retained_directory_rows: 20034, territory_retained_directory_rows: 75 });
  assert.deepEqual(verified.manifest.source_denominators.hospital, { all_retained_directory_rows: 5419, state_dc_retained_directory_rows: 5354, territory_retained_directory_rows: 65 });
  assert.deepEqual(verified.manifest.source_denominators.nursing_home, { all_retained_directory_rows: 14690, state_dc_retained_directory_rows: 14680, territory_retained_directory_rows: 10 });
  assert.equal(verified.jurisdictions.length, 56);
  const stateDc = verified.jurisdictions.slice(0, 51), territories = verified.jurisdictions.slice(51);
  assert.deepEqual(stateDc.reduce((sum, row) => ({ hospital: sum.hospital + row.directory_row_counts.hospital, nursing: sum.nursing + row.directory_row_counts.nursing_home }), { hospital: 0, nursing: 0 }), { hospital: 5354, nursing: 14680 });
  assert.deepEqual(territories.reduce((sum, row) => ({ hospital: sum.hospital + row.directory_row_counts.hospital, nursing: sum.nursing + row.directory_row_counts.nursing_home }), { hospital: 0, nursing: 0 }), { hospital: 65, nursing: 10 });
  assert.deepEqual(verified.jurisdictions.slice(51).map((row) => row.jurisdiction_code), ["AS", "GU", "MP", "PR", "VI"]);
  assert.equal(verified.sources.sources.length, 2);
  assert.ok(verified.jurisdictions.every((row) => row.export_policy === "local-review-only" && row.claims.public_export_authorized === false && row.claims.physical_site_count === null));
  assert.ok(verified.sources.sources.every((row) => row.export_policy === "local-review-only" && row.claims.public_export_authorized === false && row.claims.current_operating_count === null));
  const serialized = await readFile(path.join(built.releaseDirectory, "jurisdictions.jsonl"), "utf8");
  assert.doesNotMatch(serialized, /address|zip5|latitude|longitude|sourceRecordId|identifier|facility/i);
  await assert.rejects(readFile(path.join(outputRoot, "current.json")));
});

test("verifier rejects extra files, artifact tampering, and output roots outside data", async (t) => {
  const outputRoot = await mkdtemp(path.join(APP_ROOT, "data/tmp/cms-retained-directory-catalog-tamper-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const built = await buildCmsRetainedDirectoryCoverageCatalog({ outputRoot });
  const manifestPath = path.join(built.releaseDirectory, "manifest.json");
  const extra = path.join(built.releaseDirectory, "unexpected.txt");
  await writeFile(extra, "unexpected");
  await assert.rejects(verifyCmsRetainedDirectoryCoverageCatalog(manifestPath, { expectedManifestSha256: built.manifestSha256 }), /unexpected files/);
  await rm(extra);
  const artifactPath = path.join(built.releaseDirectory, "jurisdictions.jsonl");
  const original = await readFile(artifactPath);
  await writeFile(artifactPath, Buffer.concat([original, Buffer.from("{}\n")]));
  await assert.rejects(verifyCmsRetainedDirectoryCoverageCatalog(manifestPath, { expectedManifestSha256: built.manifestSha256 }), /byte count or checksum mismatch/);
  await writeFile(artifactPath, original);
  const outside = await mkdtemp(path.join(os.tmpdir(), "cms-retained-directory-catalog-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await assert.rejects(buildCmsRetainedDirectoryCoverageCatalog({ outputRoot: outside }), /APP_ROOT\/data/);
  const linkedRoot = path.join(outputRoot, "linked-outside");
  try {
    await symlink(outside, linkedRoot, "junction");
    await assert.rejects(buildCmsRetainedDirectoryCoverageCatalog({ outputRoot: linkedRoot }), /link or reparse point/);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) throw error;
  } finally {
    await rm(linkedRoot, { force: true });
  }
});

test("verification CLI requires one manifest path and one exact SHA-256 pin", () => {
  const script = path.join(APP_ROOT, "scripts/verify-cms-retained-directory-coverage-catalog.mjs");
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: APP_ROOT, encoding: "utf8", timeout: 10000, windowsHide: true });
  assert.equal(run("--help").status, 0);
  for (const args of [[], ["--manifest", "x"], ["--expected-manifest-sha256", "a".repeat(64)], ["--manifest", "x", "--manifest", "y", "--expected-manifest-sha256", "a".repeat(64)], ["--manifest", "x", "--expected-manifest-sha256", "a".repeat(64), "--unknown", "x"], ["--manifest", "x", "--expected-manifest-sha256", "not-a-sha"]]) {
    const result = run(...args); assert.equal(result.status, 1, result.stdout + result.stderr); assert.match(result.stderr, /Usage:/);
  }
});
