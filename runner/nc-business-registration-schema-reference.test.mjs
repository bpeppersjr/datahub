import assert from "node:assert/strict";
import test from "node:test";

import {
  loadNcBusinessRegistrationSchemaReference,
  validateNcBusinessRegistrationSchemaReference,
  verifyNcBusinessRegistrationSchemaReferenceBytes,
} from "./nc-business-registration-schema-reference.mjs";
import { loadBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";
import { APP_ROOT } from "./paths.mjs";

test("NC reference preserves dated documentary evidence without connector or acquisition claims", async () => {
  const reference = await loadNcBusinessRegistrationSchemaReference();
  assert.equal(reference.current_schema_compatibility_verified, false);
  assert.equal(reference.connector_ready, false);
  assert.equal(reference.acquisition_authorized, false);
  assert.equal(reference.required_source_files, 0);
  assert.equal(reference.source_records_acquired, 0);
  assert.ok(Object.values(reference.authority).every(value => value === false));
  assert.equal(reference.historical_layout.latest_documented_change, "2015-06-12");
  assert.equal(reference.historical_layout.direct_retrieval_status, 404);
  assert.equal(reference.current_documentation.about_data.published_format, "CSV");
  assert.equal(reference.current_documentation.subscription_manual.retained_locally, false);
  const wave = await loadBroadOfflineConnectorReadinessWave();
  assert.ok(!wave.states.some(row => row.state === "NC"));
});

test("NC reference rejects authorization, readiness, schema, citation, identity and arbitrary content drift", async () => {
  const reference = await loadNcBusinessRegistrationSchemaReference();
  const mutations = [
    value => { value.state = "SC"; },
    value => { value.schema_version = "nc-business-registration-schema-reference@2.0.0"; },
    value => { value.current_schema_compatibility_verified = true; },
    value => { value.connector_ready = true; },
    value => { value.acquisition_authorized = true; },
    value => { value.required_source_files = 1; },
    value => { value.source_records_acquired = 1; },
    value => { value.broad_layer_gaps_resolved = 1; },
    value => { value.authority.source_acquisition = true; },
    value => { delete value.authority.source_acquisition; },
    value => { value.controls.portal_automation = true; },
    value => { value.controls.pdf_files_retained = 1; },
    value => { value.historical_layout.current_schema_compatibility_verified = true; },
    value => { value.historical_layout.currently_linked_verified = true; },
    value => { value.historical_layout.facts.pop(); },
    value => { value.current_documentation.about_data.url = "https://example.com/"; },
    value => { value.current_documentation.subscription_manual.observed_sha256 = "0".repeat(64); },
    value => { value.unresolved_gates.pop(); },
    value => { value.unexpected = "field"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(reference);
    mutate(changed);
    assert.throws(() => validateNcBusinessRegistrationSchemaReference(changed), /NC schema reference rejected/);
  }
  for (const invalid of [null, [], {}, "NC"]) {
    assert.throws(() => validateNcBusinessRegistrationSchemaReference(invalid), /NC schema reference rejected/);
  }
});

test("NC loader rejects changed bytes, malformed JSON, and missing evidence without creating anything", async () => {
  const reference = await loadNcBusinessRegistrationSchemaReference();
  assert.throws(() => verifyNcBusinessRegistrationSchemaReferenceBytes(Buffer.from(JSON.stringify(reference))), /file bytes drifted/);
  assert.throws(() => verifyNcBusinessRegistrationSchemaReferenceBytes(Buffer.from("{")), /file bytes drifted/);
  await assert.rejects(loadNcBusinessRegistrationSchemaReference({ root: `${APP_ROOT}/missing-nc-reference` }), /ENOENT/);
});
