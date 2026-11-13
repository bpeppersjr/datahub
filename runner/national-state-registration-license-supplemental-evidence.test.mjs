import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildNationalStateRegistrationLicenseSupplementalEvidence, composeNationalStateRegistrationLicenseSupplementalEvidence, nationalStateRegistrationLicenseSupplementalAcquirePublicationLockForTest, nationalStateRegistrationLicenseSupplementalClaimsForTest, nationalStateRegistrationLicenseSupplementalReadForTest } from "./national-state-registration-license-supplemental-evidence.mjs";

test("state registration/license supplemental evidence conserves ten dimensions without overclaiming", async () => {
  const value = await composeNationalStateRegistrationLicenseSupplementalEvidence();
  assert.equal(value.sourceInputs.length, 9); assert.equal(value.zipRows.length, 48_194); assert.equal(value.scopeRows.length, 60); assert.equal(value.issuerRows.length, 9); assert.equal(value.summary.dimension_rows, 10);
  assert.equal(value.summary.positive_zip5_rows, 31_050); assert.equal(value.summary.zero_zip5_rows, 17_144); assert.equal(value.summary.source_address_row_count, 14_414_724); assert.equal(value.summary.eligible_address_membership_count, 10_014_807); assert.equal(value.summary.missing_or_ineligible_address_membership_count, 4_399_917);
  assert.equal(value.zipRows.every(row => row.zip4 === null && row.dimensions.length === 10), true);
  assert.deepEqual(value.zipRows[0].dimensions.filter(row => row.issuer_state === "OR").map(row => row.evidence_class), ["legal-registration-address", "assumed-business-name-address"]);
  const claims = nationalStateRegistrationLicenseSupplementalClaimsForTest(); assert.equal(claims.cross_source_additivity_asserted, false); assert.equal(claims.unique_business_count, null); assert.equal(claims.current_operation_verified, false); assert.equal(claims.all_business_completeness, null); assert.equal(claims.authoritative_current_usps_zip_validity, null); assert.equal(claims.network_requests, 0);
  assert.equal(claims.wa_mailing_address_only, true); assert.equal(claims.wa_record_level_local_review_only, true); assert.equal(claims.de_record_level_local_review_only, true); assert.equal(claims.observed_newer_counts_are_not_net_business_creation, true);
  assert.deepEqual(value.sourceInputs.filter(row => row.refresh_assessment).map(row => [row.issuer_state, row.review.newer_edition_observed, row.review.newer_edition_observed_not_collected, row.review.observed_records_downloaded]), [["DE", true, true, 0], ["IA", true, true, 0], ["NY", true, true, 0], ["WA", true, true, 0]]);
});

test("hardened input reader rejects multi-link files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "state-license-read-"));
  try { const original = path.join(directory, "a.json"), linked = path.join(directory, "b.json"); await fs.writeFile(original, "{}\n"); await fs.link(original, linked); await assert.rejects(() => nationalStateRegistrationLicenseSupplementalReadForTest(original, 100), /single-link/); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("publisher recovers a stale dead-owner lock and then reuses the identical release", async () => {
  const parent = path.resolve("work", "state-license-publish-tests"); await fs.mkdir(parent, { recursive: true }); const outputRoot = await fs.mkdtemp(path.join(parent, "recovery-"));
  try { const releases = path.join(outputRoot, "releases"); await fs.mkdir(releases); const release = "national-state-registration-license-supplemental-evidence-560d12835e8adf6d9c5c627b580ee12e7ccd54fb8210e384ed3f168a2bea2ebd", lock = path.join(releases, `${release}.lock`); await fs.writeFile(lock, `${JSON.stringify({ token: "dead-owner", pid: 2_000_000_000, created_at: "2000-01-01T00:00:00.000Z" })}\n`); const first = await buildNationalStateRegistrationLicenseSupplementalEvidence({ outputRoot }), second = await buildNationalStateRegistrationLicenseSupplementalEvidence({ outputRoot }); assert.equal(first.release_id, release); assert.equal(second.manifest_sha256, first.manifest_sha256); assert.equal(await fs.stat(lock).then(() => true).catch(error => error.code === "ENOENT" ? false : Promise.reject(error)), false); }
  finally { await fs.rm(outputRoot, { recursive: true, force: true }); }
});

test("concurrent stale-lock recovery cannot remove the replacement owner's lock", async () => {
  const parent = path.resolve("work", "state-license-publish-tests"); await fs.mkdir(parent, { recursive: true }); const outputRoot = await fs.mkdtemp(path.join(parent, "concurrent-recovery-"));
  try {
    const lock = path.join(outputRoot, "release.lock"), recovery = `${lock}.recovery`;
    await fs.writeFile(lock, `${JSON.stringify({ token: "dead-owner", pid: 2_000_000_000, created_at: "2000-01-01T00:00:00.000Z" })}\n`);
    const attempts = await Promise.allSettled([nationalStateRegistrationLicenseSupplementalAcquirePublicationLockForTest(lock, "replacement-a"), nationalStateRegistrationLicenseSupplementalAcquirePublicationLockForTest(lock, "replacement-b")]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1); assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
    const winner = attempts.find(result => result.status === "fulfilled"); await winner.value.close(); const owner = JSON.parse(await fs.readFile(lock, "utf8")); assert.ok(["replacement-a", "replacement-b"].includes(owner.token));
    assert.equal(await fs.stat(recovery).then(() => true).catch(error => error.code === "ENOENT" ? false : Promise.reject(error)), false); await fs.unlink(lock);
  }
  finally { await fs.rm(outputRoot, { recursive: true, force: true }); }
});
