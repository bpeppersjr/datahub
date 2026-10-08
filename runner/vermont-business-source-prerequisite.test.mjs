import assert from "node:assert/strict";
import test from "node:test";
import { loadVermontBusinessSourcePrerequisite, validateVermontBusinessSourcePrerequisite } from "./vermont-business-source-prerequisite.mjs";
import { loadOkNeVtMeBusinessSourceReassessment } from "./ok-ne-vt-me-business-source-reassessment.mjs";

test("Vermont successor loads offline and preserves its dated predecessor", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Network is forbidden for this loader"); };
  try {
    const before = await loadOkNeVtMeBusinessSourceReassessment("VT");
    const successor = await loadVermontBusinessSourcePrerequisite();
    assert.equal(successor.supersedes_assessment_id, before.assessment_id);
    assert.equal(successor.observed_at, "2026-10-07");
    assert.equal(successor.observation_timezone, "America/Chicago");
    assert.equal(successor.audit_started_at, "2026-10-08T02:27:56Z");
    assert.deepEqual(await loadOkNeVtMeBusinessSourceReassessment("VT"), before);
    assert.equal(successor.decision, "hold");
    assert(Object.values(successor.authority).every(value => value === false));
    assert.equal(successor.controls.public_document_reads_performed, true);
    assert.equal(successor.controls.provider_row_requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("application-shell access and historical testimony cannot establish current bulk readiness", async () => {
  const value = await loadVermontBusinessSourcePrerequisite();
  assert.equal(value.interface_observation.http_status, 200);
  assert.equal(value.interface_observation.content_class, "application-shell");
  assert.equal(value.interface_observation.delivery_interface_verified, false);
  assert.equal(value.interface_observation.rendered_interface_inspected, false);
  assert.equal(value.interface_observation.raw_response_retained, false);
  assert.equal(value.access.historical_free_weekly_evidence.business_data_described_as_free, true);
  assert.equal(value.access.historical_free_weekly_evidence.current_access_contract_verified, false);
  assert.equal(value.access.historical_free_weekly_evidence.bulk_no_account_requirement_explicitly_established, false);
  assert.equal(value.access.current_account_requirement, "unverified");
  assert.equal(value.access.current_payment_requirement, "unverified");
  assert.equal(value.fields.website_address_roles_documented, true);
  assert.equal(value.fields.bulk_field_mapping_verified, false);
  assert.equal(value.status_semantics.website_good_standing_definition_established, true);
  assert.equal(value.status_semantics.current_operations_verified, false);
  assert.equal(value.reuse.redistribution_rights_established, false);
  assert.equal(value.reuse.blanket_prohibition_asserted, false);
});

test("changed observations, source identities, or authority claims fail closed", async () => {
  const original = await loadVermontBusinessSourcePrerequisite();
  const mutations = [
    value => { value.decision = "ready"; },
    value => { value.observed_at = "2026-10-08"; },
    value => { value.interface_observation.delivery_interface_verified = true; },
    value => { value.interface_observation.reported_response_bytes = 0; },
    value => { value.fields.bulk_header_verified = true; },
    value => { value.fields.bulk_field_mapping_verified = true; },
    value => { value.status_semantics.current_operations_verified = true; },
    value => { value.access.current_payment_requirement = "free"; },
    value => { value.reuse.redistribution_rights_established = true; },
    value => { value.citations[0].url = "https://example.com"; },
    value => { value.supersedes_assessment_id = "unrelated"; },
    value => { value.unresolved_gates = []; },
    value => { value.controls.public_document_reads_performed = false; },
    value => { value.production_enrollment = true; },
    ...Object.keys(original.authority).map(key => value => { value.authority[key] = true; }),
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original); mutate(changed);
    assert.throws(() => validateVermontBusinessSourcePrerequisite(changed), /Vermont document prerequisite rejected/);
  }
});

test("validation returns isolated reviewed evidence", async () => {
  const original = await loadVermontBusinessSourcePrerequisite();
  const copy = validateVermontBusinessSourcePrerequisite(original);
  copy.fields.website_address_roles.length = 0;
  copy.authority.acquisition_authorized = true;
  assert.equal(original.fields.website_address_roles.length, 4);
  assert.equal(original.authority.acquisition_authorized, false);
});
