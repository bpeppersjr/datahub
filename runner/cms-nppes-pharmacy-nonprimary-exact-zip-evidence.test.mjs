import test from "node:test";
import assert from "node:assert/strict";
import {
  projectCmsNppesPharmacyNonprimaryExactZip as project,
  verifyCmsNppesPharmacyNonprimaryExactZipAdmission as verify,
} from "./cms-nppes-pharmacy-nonprimary-exact-zip-evidence.mjs";
const source = { release_id: "fixture", manifest_sha256: "a".repeat(64) },
  row = (id, zip5, zip4 = null) => ({
    schema_version: "1.0.0",
    secondary_address_id: id,
    address_role: "non-primary-practice-location",
    address: { zip_code: zip5, postal_code: zip5, zip4 },
    claims: {
      confirmed_pharmacy_location: false,
      current_operation: false,
      physical_site: false,
      contributes_to_business_or_site_totals: false,
    },
    temporal: { source_through_date: "2026-08-09" },
    export_policy: "public-normalized-source-evidence",
  });
test("projects ZIP5 aggregates while conserving missing and ZIP+4 separately", () => {
  const p = project(
    [row("a", "12345", "6789"), row("b", "12345"), row("c", null)],
    { source },
  );
  assert.deepEqual(p.summary, {
    source_address_rows: 3,
    zip5_address_rows: 2,
    missing_reported_zip5_rows: 1,
    reported_zip4_rows: 1,
    positive_zip5_rows: 1,
    projected_address_rows: 2,
  });
  assert.equal(p.rows[0].zip4, null);
  assert.equal(p.rows[0].count, 2);
  assert.equal(p.claims.confirmed_pharmacy_locations, false);
  assert.equal(p.claims.additive_to_primary_pharmacy_counts, false);
});
test("rejects duplicate rows and inflated source claims", () => {
  const r = row("a", "12345");
  assert.throws(() => project([r, r], { source }));
  const bad = structuredClone(r);
  bad.claims.current_operation = true;
  assert.throws(() => project([bad], { source }));
});
test("replays the retained projection and policy offline", async () => {
  const r = await verify();
  assert.equal(r.status, "admission-ready-local-aggregate-review-only");
  assert.deepEqual(r.summary, {
    source_address_rows: 420,
    zip5_address_rows: 420,
    missing_reported_zip5_rows: 0,
    reported_zip4_rows: 369,
    positive_zip5_rows: 377,
    projected_address_rows: 420,
  });
  assert.equal(r.claims.matrix_admission_performed, false);
});
