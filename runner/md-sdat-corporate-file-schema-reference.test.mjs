import assert from "node:assert/strict";
import test from "node:test";

import {
  loadMdSdatCorporateFileSchemaReference,
  validateMdSdatCorporateFileSchemaReference,
  verifyMdSdatCorporateFileSchemaReferenceBytes,
} from "./md-sdat-corporate-file-schema-reference.mjs";
import { loadBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";
import { loadMiMdLaBusinessSourceReassessment } from "./mi-md-la-business-source-reassessment.mjs";
import { APP_ROOT } from "./paths.mjs";

test("MD documentary reference preserves HOLD, absent wave admission and the immutable prior assessment", async () => {
  const reference = await loadMdSdatCorporateFileSchemaReference();
  assert.equal(reference.current_schema_compatibility_verified, false);
  assert.equal(reference.connector_ready, false);
  assert.equal(reference.acquisition_authorized, false);
  assert.equal(reference.required_source_files, 0);
  assert.equal(reference.source_records_acquired, 0);
  assert.ok(Object.values(reference.authority).every(value => value === false));
  assert.equal(reference.controls.pdf_files_retained, 0);
  assert.equal(reference.published_layout.retained_locally, false);
  assert.equal(reference.published_layout.table_count, 25);
  assert.deepEqual(reference.published_layout.identifier.candidate_fields, ["ID_BUS_PREFIX", "ID_BUS"]);
  assert.equal(reference.published_layout.postal.declared_type, "CHAR 9");
  assert.equal(reference.published_layout.status.allowed_values_verified, false);
  assert.equal(reference.published_layout.record_encoding_verified, false);
  assert.equal((await loadMiMdLaBusinessSourceReassessment("MD")).assessment_id, reference.related_assessment_id);
  assert.ok(!(await loadBroadOfflineConnectorReadinessWave()).states.some(row => row.state === "MD"));
});

test("MD reference distinguishes retrievable documentation from source automation authority", async () => {
  const reference = await loadMdSdatCorporateFileSchemaReference();
  assert.equal(reference.current_documentation.services.http_status, 200);
  assert.equal(reference.current_documentation.contractor_pricing.http_status, 200);
  assert.equal(reference.published_layout.http_status, 200);
  assert.equal(reference.documentation_transport_observation.http_status, 406);
  assert.match(reference.documentation_transport_observation.interpretation, /does not grant unattended source-file access/);
  assert.equal(reference.current_documentation.website_usage.data_mining_software_access, "will-be-blocked");
  assert.equal(reference.current_documentation.website_usage.interactive_search_automation_permitted, false);
  assert.match(reference.policy.terms, /Do not automate interactive search or data mining/);
  assert.equal(reference.current_documentation.contractor_pricing.unique_entity_denominator_verified, false);
});

test("MD reference fails closed on authority, policy, schema, citation and arbitrary content drift", async () => {
  const reference = await loadMdSdatCorporateFileSchemaReference();
  const mutations = [
    value => { value.state = "NC"; },
    value => { value.schema_version = "md-sdat-corporate-file-schema-reference@2.0.0"; },
    value => { value.current_schema_compatibility_verified = true; },
    value => { value.connector_ready = true; },
    value => { value.acquisition_authorized = true; },
    value => { value.required_source_files = 1; },
    value => { value.source_records_acquired = 1; },
    value => { value.broad_layer_gaps_resolved = 1; },
    value => { value.authority.source_acquisition = true; },
    value => { delete value.authority.source_acquisition; },
    value => { value.controls.portal_automation = true; },
    value => { value.controls.data_mining = true; },
    value => { value.controls.pdf_files_retained = 1; },
    value => { value.published_layout.retained_locally = true; },
    value => { value.published_layout.current_schema_compatibility_verified = true; },
    value => { value.published_layout.compatibility_promise_verified = true; },
    value => { value.published_layout.table_count = 24; },
    value => { value.published_layout.observed_sha256 = "0".repeat(64); },
    value => { value.current_documentation.website_usage.interactive_search_automation_permitted = true; },
    value => { value.current_documentation.website_usage.data_mining_software_access = "permitted"; },
    value => { value.current_documentation.services.url = "https://example.com/"; },
    value => { value.documentation_transport_observation.http_status = 200; },
    value => { value.policy.terms = "Unrestricted automation"; },
    value => { value.unresolved_gates.pop(); },
    value => { value.unexpected = "field"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(reference);
    mutate(changed);
    assert.throws(() => validateMdSdatCorporateFileSchemaReference(changed), /MD schema reference rejected/);
  }
  for (const invalid of [null, [], {}, "MD"]) {
    assert.throws(() => validateMdSdatCorporateFileSchemaReference(invalid), /MD schema reference rejected/);
  }
});

test("MD loader rejects altered bytes, malformed JSON and absent evidence without writing artifacts", async () => {
  const reference = await loadMdSdatCorporateFileSchemaReference();
  assert.throws(() => verifyMdSdatCorporateFileSchemaReferenceBytes(Buffer.from(JSON.stringify(reference))), /file bytes drifted/);
  assert.throws(() => verifyMdSdatCorporateFileSchemaReferenceBytes(Buffer.from("{")), /file bytes drifted/);
  await assert.rejects(loadMdSdatCorporateFileSchemaReference({ root: `${APP_ROOT}/missing-md-reference` }), /ENOENT/);
});
