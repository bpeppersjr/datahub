import assert from "node:assert/strict";
import test from "node:test";

import {
  loadVermontBusinessSourceDocumentPrerequisite,
  validateVermontBusinessSourceDocumentPrerequisite,
} from "./vermont-business-source-document-prerequisite.mjs";

test("loads the immutable Vermont supplemental prerequisite with zero authority and no rows", async () => {
  const evidence = await loadVermontBusinessSourceDocumentPrerequisite();
  assert.equal(evidence.assessment_id, "vt-business-source-document-prerequisite-2026-10-07");
  assert.equal(evidence.supersedes_assessment_id, "vt-business-source-reassessment-2026-10-03");
  assert.equal(evidence.supersession_scope, "Document-prerequisite evidence only; the immutable 51-jurisdiction catalog and historical backlog remain unchanged.");
  assert.equal(Object.values(evidence.authority).every((value) => value === false), true);
  assert.equal(evidence.controls.provider_row_requests, 0);
  assert.equal(evidence.controls.datasets_acquired, 0);
  assert.equal(evidence.claims.source_records_acquired, 0);
  assert.equal(evidence.interface_observation.delivery_interface_verified, false);
});

test("rejects identity, authority, action, readiness, and content mutations", async () => {
  const evidence = await loadVermontBusinessSourceDocumentPrerequisite();
  for (const mutate of [
    (value) => { value.state.abbreviation = "VA"; },
    (value) => { value.supersedes_assessment_id = "replacement-primary"; },
    (value) => { value.authority.network_execution_authorized = true; },
    (value) => { value.controls.datasets_acquired = 1; },
    (value) => { value.interface_observation.delivery_interface_verified = true; },
    (value) => { value.claims.source_ready = true; },
    (value) => { value.unresolved_gates.pop(); },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateVermontBusinessSourceDocumentPrerequisite(changed), /rejected/);
  }
});
