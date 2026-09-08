import assert from "node:assert/strict";
import test from "node:test";
import { MN_CONSTRUCTION_COLUMNS } from "./mn-construction-preflight.mjs";
import { normalizeMnConstructionRecord } from "./mn-construction-normalization.mjs";
import { projectMnConstructionCredential, validateMnConstructionCredentialReporting } from "./mn-construction-credential-reporting.mjs";

const context = { runId: "reporting-fixture", sourceReleaseId: "source-fixture", observedAt: "2026-09-08T12:00:00.000Z", cohort: "residential", sourceFileSha256: "a".repeat(64), rowNumber: 1 };
function normalized(changes = {}, provenance = {}) {
  return normalizeMnConstructionRecord({
    ...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map((key) => [key, ""])),
    Bus_Pers: "Business", Lic_Number: "BC123456", Status: "Issued", Name: "Fixture Contractor LLC", DBA_Name: "Fixture Builder",
    Addr1: "PO Box 12", Addr2: "Unit 3", City: "Fixture City", St: "MN", Zip: "00501-0012", Orig_Date: "1/2/2020", Exp_Date: "3/31/2027",
    Phone_No: "EXCLUDED PRIVATE PHONE", Email_Address: "EXCLUDED PRIVATE EMAIL", ...changes,
  }, { ...context, ...provenance });
}

test("MN credential reporting is deterministic, pure and source-row preserving", () => {
  const record = normalized(), before = structuredClone(record);
  const first = projectMnConstructionCredential(record);
  assert.deepEqual(record, before);
  assert.deepEqual(projectMnConstructionCredential(record), first);
  assert.doesNotThrow(() => validateMnConstructionCredentialReporting(first));
  const second = projectMnConstructionCredential(normalized({}, { rowNumber: 2 }));
  assert.notDeepEqual(first, second, "repeated credential on a distinct source row must not be merged");
  assert.notEqual(first.reporting_id, second.reporting_id);
  assert.deepEqual(first.record.external_identifiers, second.record.external_identifiers);
  assert.ok(!JSON.stringify(first).includes("EXCLUDED PRIVATE"));
});

test("MN reporting preserves source name, credentials, unparsed dates and split postal fields", () => {
  const input = normalized(), report = projectMnConstructionCredential(input);
  assert.deepEqual(report.record, input);
  assert.equal(report.record.business_name, "Fixture Contractor LLC");
  assert.equal(report.record.dba_name, "Fixture Builder");
  assert.equal(report.record.external_identifiers[0].value, "BC123456");
  assert.equal(report.record.credential.original_date_source, "1/2/2020");
  assert.equal(report.record.credential.expiration_date_source, "3/31/2027");
  assert.equal(report.record.credential.date_semantics, "unparsed-publisher-values-not-business-lifecycle");
  assert.equal(report.record.reported_address.zip_code, "00501");
  assert.equal(report.record.reported_address.postal_code, "00501");
  assert.equal(report.record.reported_address.zip4, "0012");
  assert.equal(report.record.reported_address.street, "PO Box 12");
  assert.equal(report.record.reported_address.street2, "Unit 3");
  assert.equal(report.record.provenance.observed_at, context.observedAt);
  assert.equal(Object.hasOwn(report, "processed_at"), false);
  assert.equal(Object.hasOwn(report.record, "processed_at"), false);
  const registration = projectMnConstructionCredential(normalized({ Lic_Number: "IR123456" }, { cohort: "registrations" }));
  assert.equal(registration.record.credential.kind, "registration");
  assert.equal(registration.record.credential.active_business_verified, false);
  report.record.business_name = "Mutated projection";
  assert.equal(input.business_name, "Fixture Contractor LLC", "projection must not alias source input");
});

test("MN reporting retains missing ZIP and foreign addresses with no geocode, site or match assertions", () => {
  for (const changes of [{ Zip: "" }, { Zip: "ABCDE" }, { St: "ON", Zip: "M5V 1A1" }]) {
    const report = projectMnConstructionCredential(normalized(changes));
    assert.doesNotThrow(() => validateMnConstructionCredentialReporting(report));
    assert.equal(report.record.reported_address.zip_code, null);
    assert.equal(report.record.reported_address.postal_code, null);
    assert.equal(report.record.reported_address.zip4, null);
    assert.deepEqual(report.record.geocode, { latitude: null, longitude: null, status: "not-provided-by-source", address_role: "unresolved" });
    assert.deepEqual(report.claims, { record_unit: "publisher-business-credential-row", matching_eligible: false, physical_site_eligible: false, unique_business_identity_verified: false, public_export_authorized: false, national_reporting_integrated: false });
    assert.equal(report.record.export_policy, "local-review-only");
    for (const field of ["geometry", "site_entity_id", "establishment_entity_id", "matching_profile"]) assert.equal(Object.hasOwn(report, field), false);
  }
  assert.equal(projectMnConstructionCredential(normalized({ St: "WI" })).record.reported_address.state, "WI", "publisher jurisdiction must not replace reported address state");
});

test("MN reporting rejects tampered IDs, provenance, nested extensions, false scope and unsafe accessors", () => {
  for (const mutate of [
    (report) => { report.reporting_id += "0"; },
    (report) => { report.publisher_jurisdiction = "WI"; },
    (report) => { report.claims.record_unit = "unique-business"; },
    (report) => { report.claims.public_export_authorized = true; },
    (report) => { report.record.credential.status_source = "Active"; },
    (report) => { report.record.reported_address.zip4 = "00501-0012"; },
    (report) => { report.record.reported_address.postal_code = "99999"; },
    (report) => { report.record.provenance.source_row_number = 2; },
    (report) => { report.record.provenance.source_url = "https://example.invalid"; },
    (report) => { report.record.geocode.geometry = {}; },
    (report) => { report.record.affiliation.parent_company = "Unproven parent"; },
  ]) {
    const report = projectMnConstructionCredential(normalized()); mutate(report);
    assert.throws(() => validateMnConstructionCredentialReporting(report));
  }
  const report = projectMnConstructionCredential(normalized());
  Object.defineProperty(report.record, "business_name", { enumerable: true, get: () => assert.fail("untrusted accessor must not be evaluated") });
  assert.throws(() => validateMnConstructionCredentialReporting(report), /Minnesota credential reporting record rejected/);
});

test("MN credential reporting rejects unknown report fields and altered source input claims", () => {
  const report = projectMnConstructionCredential(normalized());
  assert.throws(() => validateMnConstructionCredentialReporting({ ...report, private_contact: "EXCLUDED PRIVATE" }));
  for (const mutate of [
    (record) => { record.quality.matching_eligible = true; },
    (record) => { record.quality.physical_site_eligible = true; },
    (record) => { record.credential.active_business_verified = true; },
    (record) => { record.geocode.latitude = 45; record.geocode.longitude = -93; },
    (record) => { record.owner = "EXCLUDED PRIVATE"; },
    (record) => { record.provenance.observed_at = "today"; },
  ]) {
    const record = normalized(); mutate(record);
    assert.throws(() => projectMnConstructionCredential(record));
  }
});
