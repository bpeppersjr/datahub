import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import {
  buildNationalBusinessLifecycleIndustryJurisdictionEvidence,
  lifecycleIndustryJurisdictionClaimsForTest,
  verifyNationalBusinessLifecycleIndustryJurisdictionEvidence,
  verifyRegisteredNationalBusinessLifecycleIndustryJurisdictionEvidence,
} from "./national-business-lifecycle-industry-jurisdiction-evidence.mjs";

test("registered lifecycle-industry-jurisdiction release replays and conserves all memberships", async () => {
  const result = await verifyRegisteredNationalBusinessLifecycleIndustryJurisdictionEvidence();
  assert.equal(result.scope_rows, 60);
  assert.equal(result.state_scope_rows, 51);
  assert.equal(result.territory_scope_rows, 5);
  assert.equal(result.special_scope_rows, 4);
  assert.equal(result.zip5_rows, 48_194);
  assert.equal(result.profile_membership_count, 8_011_213);
  assert.equal(result.mapped_source_count, 13);
  assert.equal(result.unmapped_source_count, 2);
  assert.equal(result.mapped_source_membership_count + result.unmapped_source_membership_count, result.profile_membership_count);
  assert.equal(Object.values(result.source_disposition).reduce((total, row) => total + row.profile_membership_count, 0), result.profile_membership_count);
});

test("crosswalk keeps ambiguous regulated cohorts unmapped and leaves unsupported industries at zero", async () => {
  const result = await verifyRegisteredNationalBusinessLifecycleIndustryJurisdictionEvidence();
  assert.deepEqual(result.source_disposition["epa-echo-exporter-active-facility"].industries, []);
  assert.match(result.source_disposition["epa-echo-exporter-active-facility"].unmapped_reason, /crosses operational industries/);
  assert.deepEqual(result.source_disposition["usda-fsis-active-mpi-directory"].industries, []);
  assert.equal(result.industry_membership_counts.construction, 0);
  assert.equal(result.industry_membership_counts.childcare, 0);
  assert.equal(result.industry_membership_counts["tax-exempt-organizations"], 0);
});

test("claims prohibit additivity, active-business, operation and completeness overclaims", () => {
  const claims = lifecycleIndustryJurisdictionClaimsForTest();
  assert.equal(claims.source_memberships_additive_across_industries, false);
  assert.equal(claims.cross_source_additivity, false);
  assert.equal(claims.unique_business_count, null);
  assert.equal(claims.active_business_count, null);
  assert.equal(claims.current_operation_verified, false);
  assert.equal(claims.industry_completeness, null);
  assert.equal(claims.network_requests, 0);
  assert.equal(claims.production_enrollment, false);
});

test("verifier rejects artifact and manifest tampering", async t => {
  const temp = await fs.mkdtemp(path.join(APP_ROOT, "data", ".test-lifecycle-industry-jurisdiction-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const firstRoot = path.join(temp, "artifact"), first = await buildNationalBusinessLifecycleIndustryJurisdictionEvidence({ outputRoot: firstRoot });
  const firstManifest = path.join(firstRoot, "releases", first.release_id, "manifest.json");
  const artifact = path.join(path.dirname(firstManifest), "jurisdictions.json");
  await fs.appendFile(artifact, " ");
  await assert.rejects(() => verifyNationalBusinessLifecycleIndustryJurisdictionEvidence(firstManifest), /artifact replay|bounded regular file|artifact descriptor/);

  const secondRoot = path.join(temp, "manifest"), second = await buildNationalBusinessLifecycleIndustryJurisdictionEvidence({ outputRoot: secondRoot });
  const secondManifest = path.join(secondRoot, "releases", second.release_id, "manifest.json");
  const value = JSON.parse(await fs.readFile(secondManifest, "utf8"));
  value.summary.profile_membership_count--;
  await fs.writeFile(secondManifest, `${JSON.stringify(value)}\n`);
  await assert.rejects(() => verifyNationalBusinessLifecycleIndustryJurisdictionEvidence(secondManifest), /manifest identity|summary replay|manifest replay/);
});
