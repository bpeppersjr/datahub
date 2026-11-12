import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import {
  buildNationalBusinessLifecycleIndustryZipEvidence,
  lifecycleIndustryZipClaimsForTest,
  projectLifecycleIndustryZipRowForTest,
  verifyNationalBusinessLifecycleIndustryZipEvidence,
  verifyRegisteredNationalBusinessLifecycleIndustryZipEvidence,
} from "./national-business-lifecycle-industry-zip-evidence.mjs";

test("registered lifecycle-industry ZIP release fully replays and conserves the dense cohort", async () => {
  const result = await verifyRegisteredNationalBusinessLifecycleIndustryZipEvidence();
  assert.equal(result.zip5_rows, 48_194);
  assert.equal(result.positive_zip5_rows, 42_267);
  assert.equal(result.zero_profile_zip5_rows, 5_927);
  assert.equal(result.profile_membership_count, 8_011_213);
  assert.equal(result.artifact_count, 102);
  assert.equal(result.mapped_source_count, 13);
  assert.equal(result.unmapped_source_count, 2);
  assert.equal(result.mapped_source_membership_count + result.unmapped_source_membership_count, result.profile_membership_count);
  assert.deepEqual(result.cohort_classification_counts, { "same-code-census-zcta": 33791, "source-contributed-outside-zcta": 14361, "denominator-only-outside-zcta": 41, "explicit-placeholder": 1 });
});

test("row projection retains every industry including zero and preserves sparse source counts", async () => {
  const crosswalk = JSON.parse(await fs.readFile(path.join(APP_ROOT, "config/lifecycle-operational-industry-crosswalk.json"), "utf8"));
  const counts = { "source-defined-current": 0, "non-active-reporting": 2, unknown: 0, contradictory: 0 };
  const reviews = { "within-review-window": 2, stale: 0, unmeasured: 0, unmapped: 0 };
  const projected = projectLifecycleIndustryZipRowForTest({ schema_version: "national-business-lifecycle-zip-evidence-row@1.0.0", zip5: "00000", cohort_classification: "explicit-placeholder", profile_membership_count: 2, lifecycle_evidence_counts: counts, review_status_counts: reviews, sources: [{ source_id: "cms-nppes-monthly-v2", profile_membership_count: 2, lifecycle_evidence_counts: counts, review_status_counts: reviews }] }, crosswalk);
  assert.equal(projected.industries.length, 9);
  assert.equal(projected.industries.find(row => row.industry_id === "health-care").profile_membership_count, 2);
  assert.equal(projected.industries.find(row => row.industry_id === "childcare").profile_membership_count, 0);
  assert.equal(projected.mapped_source_membership_count, 2);
  assert.equal(projected.unmapped_source_membership_count, 0);
  assert.equal(projected.cohort_classification, "explicit-placeholder");
});

test("claims prohibit USPS, additivity, operation, active-business and completeness overclaims", () => {
  const claims = lifecycleIndustryZipClaimsForTest();
  assert.equal(claims.authoritative_current_usps_zip_denominator, null);
  assert.equal(claims.usps_zip_state_assignment, false);
  assert.equal(claims.zip4_joined, false);
  assert.equal(claims.source_memberships_additive_across_industries, false);
  assert.equal(claims.unique_business_count, null);
  assert.equal(claims.active_business_count, null);
  assert.equal(claims.current_operation_verified, false);
  assert.equal(claims.industry_completeness, null);
  assert.equal(claims.network_requests, 0);
});

test("full verifier rejects compressed artifact and manifest tampering", async t => {
  const temp = await fs.mkdtemp(path.join(APP_ROOT, "data", ".test-lifecycle-industry-zip-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const firstRoot = path.join(temp, "artifact"), first = await buildNationalBusinessLifecycleIndustryZipEvidence({ outputRoot: firstRoot });
  const firstManifest = path.join(firstRoot, "releases", first.release_id, "manifest.json"), artifact = path.join(path.dirname(firstManifest), "zip2=00.jsonl.gz");
  await fs.appendFile(artifact, "x");
  await assert.rejects(() => verifyNationalBusinessLifecycleIndustryZipEvidence(firstManifest), /artifact replay zip2=00/);
  const secondRoot = path.join(temp, "manifest"), second = await buildNationalBusinessLifecycleIndustryZipEvidence({ outputRoot: secondRoot });
  const secondManifest = path.join(secondRoot, "releases", second.release_id, "manifest.json"), value = JSON.parse(await fs.readFile(secondManifest, "utf8"));
  value.summary.profile_membership_count--;
  await fs.writeFile(secondManifest, `${JSON.stringify(value)}\n`);
  await assert.rejects(() => verifyNationalBusinessLifecycleIndustryZipEvidence(secondManifest), /manifest identity|manifest replay/);
});
