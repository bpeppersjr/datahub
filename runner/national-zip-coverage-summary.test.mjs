import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildNationalZipCoverageSummary,
  publishNationalZipCoverageSummary,
  verifyNationalZipCoverageSummary,
} from "./national-zip-coverage-summary.mjs";

const digest = (digit) => digit.repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const set = (count, digit) => ({ count, zip5_member_set_sha256: digest(digit) });

function audit({ usps = false } = {}) {
  const listed = usps ? set(2, "7") : set(0, "0");
  return {
    schema_version: "1.3.0", audit_id: "zip-denominator-audit-fixture", overall_contract_status: "passed",
    claim_boundary: { valid_usps_zip_denominator_complete: usps, reason: usps ? "exact" : "not integrated" },
    cohorts: [{
      cohort_id: "fixture", availability: "available", contract_status: "passed", release_id: "registry-r1",
      dataset_id: "national-business-registry", release_status: "published-partial", publisher_version: "2.15.0", complete_national_business_registry: false,
      pointer_path: "registry/current.json", pointer_dataset_id: "national-business-registry", pointer_release_id: "registry-r1", pointer_status: "published-partial", pointer_manifest: "releases/registry-r1/manifest.json",
      pointer_sha256: digest("1"), manifest_sha256: digest("2"), artifact: { path: "derived/zip-coverage.jsonl", bytes: 123, record_count: 4, artifact_type: "registry-zip-coverage-jsonl", distribution_policy: "local-review-only", sha256: digest("3") },
      registry_zip5_members: set(4, "4"),
      registry_coverage: { record_level_source_contribution: set(3, "5"), denominator_only_no_record_level_contribution: set(1, "6"), conservation: { status: "passed" } },
      source_reported_zip5_quality: { conservation: { status: "passed" }, classes: { explicit_placeholder: set(0, "0") } },
      governed_zcta_membership: { ...set(2, "8"), source_release_ids: ["census-zcta-r1"] },
      source_reported_zip5_outside_governed_zcta: set(1, "9"), denominator_only_zip5_outside_governed_zcta: set(1, "a"),
      usps_operational_evidence: { listed_members: listed, not_listed_members: usps ? set(2, "b") : set(0, "0"), unverified_members: usps ? set(0, "0") : set(4, "c") },
      authoritative_current_usps_zip_denominator: usps ? { count: 2, member_set_sha256: digest("7"), dataset_id: "usps-operational-zip-assignments", release_id: "usps-r1", source_month: "2026-08", assignment_artifact_sha256: digest("e") } : null,
      usps_zip_member_set_reconciliation: usps ? { exact_member_set_match: true, member_count: 2, sha256: digest("d"), source_dataset_id: "usps-operational-zip-assignments", source_release_id: "usps-r1", source_manifest_sha256: digest("f"), source_month: "2026-08", assignment_artifact_sha256: digest("e") } : null,
      complete_current_usps_assignment_denominator_verified: usps,
      split_postal_field_contract: { applicability: "required", status: "passed", invalid_counts: { missing_postal_code: 0, joined_postal_code: 0, mismatched_postal_code: 0, missing_zip4: 0, non_null_zip4: 0 } },
      postal_field_policy: { zip4_joined_to_zip5: false },
    }],
  };
}

function hasArray(value) { return Array.isArray(value) || (value && typeof value === "object" && Object.values(value).some(hasArray)); }

test("compact no-USPS summary separates Census, registry coverage, and ZIP+4 without member arrays", () => {
  const summary = buildNationalZipCoverageSummary(audit(), { cohortId: "fixture", releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z" });
  assert.equal(summary.schema_version, "national-zip-coverage-summary@1.0.0");
  assert.equal(summary.census_zcta.statistical_geography_not_usps_postal_delivery_boundary, true);
  assert.equal(summary.usps_assignment.governed_dependency_present, false);
  assert.equal(summary.usps_assignment.registry_unverified_members.count, 4);
  assert.equal(summary.zip4_policy.geometric, false);
  assert.equal(summary.claim_boundary.all_business_completion_percentage, null);
  assert.equal(summary.claim_boundary.active_business_completion_percentage, null);
  assert.equal(summary.bindings.registry_zip_artifact_distribution_policy, "local-review-only");
  assert.equal(summary.bindings.census_zcta_source_release_id, "census-zcta-r1");
  assert.equal(hasArray(summary), false);
});

test("exact USPS summary requires the assignment digest to equal registry-listed members", () => {
  const value = audit({ usps: true });
  const summary = buildNationalZipCoverageSummary(value, { cohortId: "fixture", releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z" });
  assert.equal(summary.usps_assignment.exact_member_set_reconciliation, true);
  assert.equal(summary.usps_assignment.complete_current_assignment_denominator_verified, true);
  value.cohorts[0].usps_operational_evidence.listed_members.zip5_member_set_sha256 = digest("e");
  assert.throws(() => buildNationalZipCoverageSummary(value, { cohortId: "fixture", releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z" }), /reconciliation is not exact/);
});

test("same-count different members and broken conservation fail closed", () => {
  const swapped = audit({ usps: true });
  swapped.cohorts[0].authoritative_current_usps_zip_denominator.member_set_sha256 = digest("e");
  assert.throws(() => buildNationalZipCoverageSummary(swapped, { cohortId: "fixture", releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z" }), /reconciliation is not exact/);
  const broken = audit();
  broken.cohorts[0].registry_coverage.denominator_only_no_record_level_contribution.count = 2;
  assert.throws(() => buildNationalZipCoverageSummary(broken, { cohortId: "fixture", releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z" }), /conservation failed/);
});

test("USPS completeness flags and absent-dependency states are exact", () => {
  const inconsistent = audit({ usps: true });
  inconsistent.cohorts[0].complete_current_usps_assignment_denominator_verified = false;
  assert.throws(() => buildNationalZipCoverageSummary(inconsistent, { cohortId: "fixture", releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z" }), /completeness flags/);
  const absent = audit(); absent.cohorts[0].usps_operational_evidence.listed_members = set(1, "7"); absent.cohorts[0].usps_operational_evidence.unverified_members = set(3, "c");
  assert.throws(() => buildNationalZipCoverageSummary(absent, { cohortId: "fixture", releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z" }), /No-USPS state/);
  const split = audit(); split.cohorts[0].split_postal_field_contract.status = "failed";
  assert.throws(() => buildNationalZipCoverageSummary(split, { cohortId: "fixture", releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z" }), /split-field contract/);
});

test("published summary verifies current evidence and rejects artifact or evidence digest drift", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "national-zip-summary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let current = audit();
  const auditReader = async () => structuredClone(current);
  const cohort = { cohort_id: "fixture", pointer: "registry/current.json" };
  const published = await publishNationalZipCoverageSummary({ root, cohort, releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z", auditReader });
  const manifestPath = path.join(published.directory, "manifest.json");
  assert.equal((await verifyNationalZipCoverageSummary(manifestPath, { root, cohort, auditReader })).status, "verified");
  current = audit(); current.cohorts[0].artifact.sha256 = digest("e");
  await assert.rejects(() => verifyNationalZipCoverageSummary(manifestPath, { root, cohort, auditReader }), { code: "ZIP_COVERAGE_EVIDENCE_REBUILD_REQUIRED" });
  current = audit();
  const artifactPath = path.join(published.directory, "zip-coverage-summary.json");
  const bytes = await readFile(artifactPath, "utf8");
  const tampered = bytes.replace("registry-r1", "registry-r2");
  await writeFile(artifactPath, tampered);
  await assert.rejects(() => verifyNationalZipCoverageSummary(manifestPath, { root, cohort, auditReader }), { code: "ZIP_COVERAGE_SEMANTIC_TAMPER" });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts[0].bytes = Buffer.byteLength(tampered);
  manifest.artifacts[0].sha256 = sha256(tampered);
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await assert.rejects(() => verifyNationalZipCoverageSummary(manifestPath, { root, cohort, auditReader }), { code: "ZIP_COVERAGE_SEMANTIC_TAMPER" });
});

test("rehashed semantic changes with unchanged evidence are tamper, not source drift", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "national-zip-summary-semantic-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const auditReader = async () => audit();
  const cohort = { cohort_id: "fixture", pointer: "registry/current.json" };
  const published = await publishNationalZipCoverageSummary({ root, cohort, releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z", auditReader });
  const manifestPath = path.join(published.directory, "manifest.json");
  const artifactPath = path.join(published.directory, "zip-coverage-summary.json");
  const summary = JSON.parse(await readFile(artifactPath, "utf8"));
  summary.claim_boundary.reason = "rehashed semantic alteration";
  const tampered = `${JSON.stringify(summary, null, 2)}\n`;
  await writeFile(artifactPath, tampered);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts[0].bytes = Buffer.byteLength(tampered);
  manifest.artifacts[0].sha256 = sha256(tampered);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(() => verifyNationalZipCoverageSummary(manifestPath, { root, cohort, auditReader }), { code: "ZIP_COVERAGE_SEMANTIC_TAMPER" });
});

test("verifier rejects relocated manifests and symlinked artifacts", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "national-zip-summary-path-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const auditReader = async () => audit();
  const cohort = { cohort_id: "fixture", pointer: "registry/current.json" };
  const published = await publishNationalZipCoverageSummary({ root, cohort, releaseId: "summary-r1", createdAt: "2026-09-23T00:00:00.000Z", auditReader });
  const manifestPath = path.join(published.directory, "manifest.json");
  const relocated = path.join(root, "relocated", "manifest.json");
  await mkdir(path.dirname(relocated)); await copyFile(manifestPath, relocated);
  await assert.rejects(() => verifyNationalZipCoverageSummary(relocated, { root, cohort, auditReader }), /path, ID, or created_at/);
  const outsideRelease = path.join(root, "outside-release"); await mkdir(outsideRelease);
  await copyFile(manifestPath, path.join(outsideRelease, "manifest.json"));
  await copyFile(path.join(published.directory, "zip-coverage-summary.json"), path.join(outsideRelease, "zip-coverage-summary.json"));
  await rm(published.directory, { recursive: true }); await symlink(outsideRelease, published.directory, "junction");
  await assert.rejects(() => verifyNationalZipCoverageSummary(manifestPath, { root, cohort, auditReader }), /path, ID, or created_at/);
});
