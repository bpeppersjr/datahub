import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStateBusinessSourceAssessmentCatalog } from "./state-business-source-assessment.mjs";
import { auditStateBusinessSourceExactZipAdmission, reconcileStateBusinessSourceExactZipAdmission } from "./state-business-source-exact-zip-admission-audit.mjs";

const json = async (relative) => JSON.parse(await readFile(new URL(`../${relative}`, import.meta.url), "utf8"));
async function inputs() {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  const broadRegistration = await json("config/datasets/national-broad-organization-zip-summary.json");
  const broadManifest = await json(broadRegistration.retained_release.manifest);
  const upstreamManifest = await json(broadManifest.bindings.upstream_release.manifest_path);
  const matrixRegistration = await json("config/datasets/national-exact-zip-industry-evidence-matrix.json");
  const matrixManifest = await json(matrixRegistration.retained_release.manifest);
  return { catalog, broadRegistration, broadManifest, upstreamManifest, matrixRegistration, matrixManifest };
}
const clone = (value) => structuredClone(value);

test("reconciles exactly eight ready publishers to nine exact-ZIP dimensions without authority escalation", async () => {
  const result = await auditStateBusinessSourceExactZipAdmission();
  assert.deepEqual(result.publishers, ["CO", "CT", "DE", "FL", "IA", "NY", "OR", "PA"]);
  assert.equal(result.dimensions.length, 9);
  assert.deepEqual(result.dimensions.filter((id) => id.startsWith("broad_org_or_")), ["broad_org_or_legal_registration_addresses", "broad_org_or_brand_registration_addresses"]);
  assert.deepEqual(result.counts, { publishers: 8, dimensions: 9, input_records: 14340575, address_rows: 14340583, eligible_address_rows: 9940777, missing_or_ineligible_address_rows: 4399806 });
  assert.deepEqual(result.claims, { network_requests: 0, production_enrollment: false, current_operation_verified: false, all_business_completeness: false, zip4_joined: false });
});

test("fails closed on missing or extra publisher and Oregon mapping drift", async () => {
  const base = await inputs();
  for (const mutate of [
    (v) => { v.catalog.states.find((row) => row.state_abbreviation === "CO").production_ready = false; },
    (v) => { v.upstreamManifest.source_contract.AK = clone(v.upstreamManifest.source_contract.CO); },
    (v) => { v.matrixManifest.bindings.sources.find((row) => row.id === "broad_org_or_brand_registration_addresses").record_kind = "registration"; },
  ]) {
    const value = clone(base); mutate(value);
    assert.throws(() => reconcileStateBusinessSourceExactZipAdmission(value));
  }
});

test("fails closed on release, policy, provenance, ZIP key, and ZIP+4 drift", async () => {
  const base = await inputs();
  for (const mutate of [
    (v) => { v.broadRegistration.retained_release.manifest_sha256 = "0".repeat(64); },
    (v) => { v.matrixRegistration.retained_release.release_id = "replacement"; },
    (v) => { v.matrixManifest.bindings.sources.find((row) => row.id === "broad_org_co_organization_addresses").source_provenance.policy_sha256 = "0".repeat(64); },
    (v) => { v.matrixManifest.bindings.sources.find((row) => row.id === "broad_org_ct_organization_addresses").source_provenance.normalized_release_id = "replacement"; },
    (v) => { v.upstreamManifest.dependencies.sources.CO.transformation = "co-business-registry@9.9.9"; },
    (v) => { v.broadManifest.bindings.dimensions[0].zip4_joined = true; },
    (v) => { v.matrixManifest.bindings.sources.find((row) => row.id === "broad_org_fl_organization_addresses").key = "zip9"; },
  ]) {
    const value = clone(base); mutate(value);
    assert.throws(() => reconcileStateBusinessSourceExactZipAdmission(value));
  }
});

test("fails closed on dropped conservation and completeness or operation claims", async () => {
  const base = await inputs();
  for (const mutate of [
    (v) => { v.broadManifest.summary.missing_or_ineligible_address_rows--; },
    (v) => { v.broadManifest.summary.eligible_rows_by_dimension.broad_org_pa_organization_addresses--; },
    (v) => { v.broadManifest.claims.production_enrollment = true; },
    (v) => { v.matrixRegistration.claims.current_operation_verified = true; },
    (v) => { v.matrixManifest.claims.all_business_completeness = true; },
  ]) {
    const value = clone(base); mutate(value);
    assert.throws(() => reconcileStateBusinessSourceExactZipAdmission(value));
  }
});
