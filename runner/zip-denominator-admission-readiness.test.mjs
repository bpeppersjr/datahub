import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { buildZipDenominatorAdmissionReadiness, inspectZipDenominatorAdmissionReadiness, verifyZipDenominatorAdmissionReadiness } from "./zip-denominator-admission-readiness.mjs";

test("inspection replays exact retained ZIP cohort and exposes both fail-closed prerequisite routes", async () => {
  const result = await inspectZipDenominatorAdmissionReadiness({ now: () => new Date("2026-10-03T12:00:00.000Z") });
  assert.equal(result.status, "blocked-on-authorized-authoritative-input");
  assert.deepEqual(result.retained_zip_evidence, { rows: 48194, record_level_source_contribution: 47995, denominator_only: 199, same_code_census_zcta: 33791, source_contributed_outside_zcta: 14361, denominator_only_outside_zcta: 41, explicit_placeholder: 1, usps_unverified: 48194 });
  assert.deepEqual(result.prerequisite_routes.postalpro_area_district.missing_inputs, ["postalpro-current-pointer", "usps-written-permission-evidence", "exact-source-month-release"]);
  assert.deepEqual(result.prerequisite_routes.licensed_city_state.missing_inputs, ["licensed-city-state-projection", "city-state-admission-manifest", "license-or-permission-reference", "four-zip-class-declaration", "reviewed-status-semantics-map", "verified-city-state-candidate-release"]);
  assert.equal(result.prerequisite_routes.licensed_city_state.production_admission_implemented, false);
  assert.deepEqual(result.claims, { authoritative_current_usps_zip_denominator: null, valid_usps_zip_count: null, business_count: null, current_operating_business_count: null, completeness_percent: null, zip_validity_classified: false, deliverability_classified: false, zcta_treated_as_usps: false, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, production_execution: false });
});

test("build publishes one immutable pointer-free release and verifier rejects artifact tamper", async (t) => {
  const output = path.join(APP_ROOT, "data", "tmp", `zip-admission-readiness-${randomUUID()}`);
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  const result = await buildZipDenominatorAdmissionReadiness({ outputRoot: output, now: () => new Date("2026-10-03T12:01:00.000Z") });
  assert.equal(result.manifest.current_pointer, null);
  assert.equal(result.manifest.network_requests, 0);
  assert.equal(result.readiness.claims.authoritative_current_usps_zip_denominator, null);
  const manifestPath = result.manifest_path;
  const verified = await verifyZipDenominatorAdmissionReadiness(manifestPath);
  assert.equal(verified.readiness.retained_zip_evidence.rows, 48194);
  const artifactPath = path.join(path.dirname(manifestPath), "readiness.json"), original = await fs.readFile(artifactPath);
  await fs.writeFile(artifactPath, Buffer.concat([original, Buffer.from(" ")]));
  await assert.rejects(verifyZipDenominatorAdmissionReadiness(manifestPath), /artifact identity/);
});

test("immutable identity refuses a duplicate release without changing registered bytes", async (t) => {
  const output = path.join(APP_ROOT, "data", "tmp", `zip-admission-readiness-duplicate-${randomUUID()}`), now = () => new Date("2026-10-03T12:02:00.000Z");
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  const first = await buildZipDenominatorAdmissionReadiness({ outputRoot: output, now });
  const before = await fs.readFile(first.manifest_path);
  await assert.rejects(buildZipDenominatorAdmissionReadiness({ outputRoot: output, now }), /already exists/);
  assert.deepEqual(await fs.readFile(first.manifest_path), before);
});

test("pre-aborted inspection and output escape fail without publication", async () => {
  const controller = new AbortController(); controller.abort(new Error("cancelled-readiness"));
  await assert.rejects(inspectZipDenominatorAdmissionReadiness({ signal: controller.signal }), /cancelled-readiness/);
  await assert.rejects(buildZipDenominatorAdmissionReadiness({ outputRoot: path.resolve(APP_ROOT, "..", "outside-readiness") }), /containment|inside app/i);
});

test("registered release verifies and preserves null denominator claims", async () => {
  const registrationPath = path.join(APP_ROOT, "config", "datasets", "zip-denominator-admission-readiness.json");
  let registration;
  try { registration = JSON.parse(await fs.readFile(registrationPath, "utf8")); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  const verified = await verifyZipDenominatorAdmissionReadiness(path.join(APP_ROOT, registration.retained_release.manifest));
  assert.equal(verified.manifest_sha256, registration.retained_release.manifest_sha256);
  assert.equal(verified.readiness.claims.completeness_percent, null);
});
