import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { buildNationalIrsEoSupplementalIndustryEvidence, nationalIrsEoSupplementalClaimsForTest, nationalIrsEoSupplementalJsonlForTest, nationalIrsEoSupplementalReadForTest, verifyNationalIrsEoSupplementalIndustryEvidence, verifyRegisteredNationalIrsEoSupplementalIndustryEvidence } from "./national-irs-eo-supplemental-industry-evidence.mjs";

test("registered IRS EO supplemental evidence fully replays", async () => {
  const value = await verifyRegisteredNationalIrsEoSupplementalIndustryEvidence();
  assert.equal(value.zip5_rows, 48_194); assert.equal(value.positive_zip5_rows, 36_950); assert.equal(value.organization_membership_count, 1_955_841);
  assert.equal(value.geography_disposition_scope_rows, 60); assert.equal(value.state_scope_rows, 51); assert.equal(value.territory_scope_rows, 5); assert.equal(value.special_scope_rows, 4); assert.equal(value.reported_filing_address_jurisdiction_rows, 56);
  assert.equal(value.review_status, "stale"); assert.equal(value.lifecycle_base_changed, false);
});

test("closed claims prohibit promotion, additivity, and geographic inference", () => {
  const claims = nationalIrsEoSupplementalClaimsForTest();
  assert.equal(claims.evidence_kind, "supplemental-non-active-reporting-membership"); assert.equal(claims.industry, "tax-exempt-organizations"); assert.equal(claims.filing_address_only, true);
  assert.equal(claims.lifecycle_base_denominator_changed, false); assert.equal(claims.lifecycle_base_assignments_changed, false); assert.equal(claims.current_operation_verified, false); assert.equal(claims.physical_site_verified, false);
  assert.equal(claims.additive_to_business_or_industry_totals, false); assert.equal(claims.state_inferred_from_zip_prefix, false); assert.equal(claims.reported_jurisdiction_overwrites_geography_disposition, false); assert.equal(claims.zip4_joined, false);
});

test("release keeps governed and reported jurisdictions separate", async () => {
  const registration = JSON.parse(await fs.readFile(path.join(APP_ROOT, "config/datasets/national-irs-eo-supplemental-industry-evidence.json"), "utf8"));
  const manifest = JSON.parse(await fs.readFile(path.join(APP_ROOT, registration.retained_release.manifest), "utf8")), directory = path.dirname(path.join(APP_ROOT, registration.retained_release.manifest));
  const scopes = JSON.parse(await fs.readFile(path.join(directory, "geography-disposition-scopes.json"), "utf8")), reported = JSON.parse(await fs.readFile(path.join(directory, "reported-jurisdictions.json"), "utf8"));
  assert.equal(scopes.length, 60); assert.equal(reported.length, 56); assert.equal(scopes.reduce((n, row) => n + row.organization_membership_count, 0), 1_955_841); assert.equal(reported.reduce((n, row) => n + row.organization_membership_count, 0), 1_955_841);
  assert(scopes.some(row => row.scope_kind === "special" || !["state", "territory"].includes(row.scope_kind))); assert(reported.every(row => row.geography_disposition_scope_id === null && row.comparison_only === true));
  assert.equal(manifest.review.source_posting_date, "2026-08-11"); assert.equal(manifest.review.retrieved_date, "2026-09-03"); assert.equal(manifest.review.assessment_as_of, "2026-11-12"); assert.equal(manifest.review.internal_review_window_days, 75); assert.equal(manifest.review.refresh_context.status, "refresh-available-not-collected"); assert.equal(manifest.review.refresh_context.source_page_claimed_records, 1_975_975);
});

test("verifier rejects payload and manifest tampering", async t => {
  const temp = await fs.mkdtemp(path.join(APP_ROOT, "data", ".test-irs-eo-supplemental-")); t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const first = await buildNationalIrsEoSupplementalIndustryEvidence({ outputRoot: path.join(temp, "payload") }), firstManifest = path.join(temp, "payload", "releases", first.release_id, "manifest.json");
  await fs.appendFile(path.join(path.dirname(firstManifest), "national-summary.json"), " "); await assert.rejects(() => verifyNationalIrsEoSupplementalIndustryEvidence(firstManifest), /artifact replay/);
  const second = await buildNationalIrsEoSupplementalIndustryEvidence({ outputRoot: path.join(temp, "manifest") }), secondManifest = path.join(temp, "manifest", "releases", second.release_id, "manifest.json"), manifest = JSON.parse(await fs.readFile(secondManifest, "utf8"));
  manifest.summary.organization_membership_count--; await fs.writeFile(secondManifest, `${JSON.stringify(manifest)}\n`); await assert.rejects(() => verifyNationalIrsEoSupplementalIndustryEvidence(secondManifest), /manifest identity|manifest replay/);
});

test("bounded reader rejects symbolic links and hard links", async t => {
  const temp = await fs.mkdtemp(path.join(APP_ROOT, "data", ".test-irs-eo-read-boundary-")); t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const targetDirectory = path.join(temp, "target"), linkedDirectory = path.join(temp, "linked"), source = path.join(targetDirectory, "source.json"), hard = path.join(targetDirectory, "hard.json"); await fs.mkdir(targetDirectory); await fs.writeFile(source, "{}\n");
  await fs.symlink(targetDirectory, linkedDirectory, "junction"); await assert.rejects(() => nationalIrsEoSupplementalReadForTest(path.join(linkedDirectory, "source.json"), 100), /symbolic-link path component/);
  await fs.link(source, hard); await assert.rejects(() => nationalIrsEoSupplementalReadForTest(source, 100), /single-link/); await assert.rejects(() => nationalIrsEoSupplementalReadForTest(hard, 100), /single-link/);
});

test("JSONL decoder rejects malformed UTF-8, oversized lines, excess rows, and malformed JSON", () => {
  const limits = { maxLines: 2, maxLineBytes: 16 };
  assert.throws(() => nationalIrsEoSupplementalJsonlForTest(Buffer.from([0xc3, 0x28]), limits), /JSONL UTF-8/);
  assert.throws(() => nationalIrsEoSupplementalJsonlForTest(Buffer.from(`${JSON.stringify({ value: "x".repeat(32) })}\n`), limits), /JSONL line length/);
  assert.throws(() => nationalIrsEoSupplementalJsonlForTest(Buffer.from("{}\n{}\n{}\n"), limits), /JSONL line count/);
  assert.throws(() => nationalIrsEoSupplementalJsonlForTest(Buffer.from("{]\n"), limits), /JSONL syntax/);
  assert.deepEqual(nationalIrsEoSupplementalJsonlForTest(Buffer.from("{}\n"), limits), [{}]);
});
