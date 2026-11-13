import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  loadScCorporationBulkContractSchemaReference,
  validateScCorporationBulkContractSchemaReference,
  verifyScCorporationBulkContractSchemaReferenceBytes,
} from "./sc-corporation-bulk-contract-schema-reference.mjs";
import { loadBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";
import { APP_ROOT } from "./paths.mjs";

test("SC documentary reference preserves product facts without schema, delivery or acquisition authority", async () => {
  const reference = await loadScCorporationBulkContractSchemaReference();
  assert.equal(reference.decision, "hold");
  for (const key of ["current_schema_compatibility_verified", "connector_ready", "acquisition_authorized", "registration_authorized", "signature_authorized", "payment_authorized", "credentials_authorized"]) assert.equal(reference[key], false);
  for (const key of ["required_source_files", "source_records_acquired", "broad_layer_gaps_resolved"]) assert.equal(reference[key], 0);
  assert.ok(Object.values(reference.authority).every(value => value === false));
  assert.equal(reference.controls.pdf_files_retained, 0);
  const agreement = reference.current_documentation.subscriber_agreement;
  assert.equal(agreement.http_status, 200);
  assert.equal(agreement.document_version, "2.7");
  assert.equal(agreement.document_revision, "2023-07-19");
  assert.equal(agreement.retained_locally, false);
  assert.equal(agreement.current_schema_proof, false);
  assert.match(reference.current_documentation.service_page.agreement_requirement, /original signatures/);
  const product = reference.corporation_product;
  assert.equal(product.documented_price_usd_per_fiscal_year, 12000);
  assert.equal(product.documented_subscriber_fee_usd, 125);
  assert.equal(product.proration_available, false);
  assert.equal(product.refunds_available, false);
  assert.deepEqual(product.documented_archive_names, ["CORP_NAMES.ZIP", "CORP_TXN.ZIP", "CORPORATION.ZIP"]);
  assert.deepEqual(product.separate_products, ["new-filings", "UCC"]);
  assert.match(product.change_contract_boundary, /not assumed to be a complete delta/);
  assert.match(product.documented_cadence, /fifth.*subscriber FTP/);
  assert.match(reference.schema_review.zip_rule, /ZIP5 and ZIP4 as separate strings/);
  assert.match(reference.schema_review.person_field_rule, /Exclude registered-agent and person-linked/);
  assert.match(reference.current_documentation.business_filings_portal.good_standing_boundary, /does not establish current operation/);
  assert.equal(reference.current_documentation.business_filings_portal.bulk_identity_verification_applicability_verified, false);
});

test("SC remains absent from readiness wave and its October assessment remains byte-identical", async () => {
  const wave = await loadBroadOfflineConnectorReadinessWave();
  assert.ok(!wave.states.some(row => row.state === "SC"));
  const prior = await readFile(path.join(APP_ROOT, "config/state-business-source-assessments/sc-2026-10-03.json"));
  assert.equal(createHash("sha256").update(prior).digest("hex"), "777044cc8a92a8cb4808855c9e119ee387a2c4a3f3141282666c3ab411393c3b");
  assert.equal(JSON.parse(prior).decision, "hold");
});

test("SC immutable reference rejects every widened authority and changed evidence or schema boundary", async () => {
  const reference = await loadScCorporationBulkContractSchemaReference();
  const mutations = [
    value => { value.state = "NC"; },
    value => { value.schema_version = "sc-corporation-bulk-contract-schema-reference@2.0.0"; },
    value => { value.decision = "ready"; },
    ...["current_schema_compatibility_verified", "connector_ready", "acquisition_authorized", "registration_authorized", "signature_authorized", "payment_authorized", "credentials_authorized"].map(key => value => { value[key] = true; }),
    ...["required_source_files", "source_records_acquired", "broad_layer_gaps_resolved"].map(key => value => { value[key] = 1; }),
    ...Object.keys(reference.authority).map(key => value => { value.authority[key] = true; }),
    value => { delete value.authority.registration; },
    value => { value.controls.portal_automation = true; },
    value => { value.controls.pdf_files_retained = 1; },
    value => { value.current_documentation.subscriber_agreement.retained_locally = true; },
    value => { value.current_documentation.subscriber_agreement.current_schema_proof = true; },
    value => { value.current_documentation.subscriber_agreement.document_revision = "2025-06-25"; },
    value => { value.current_documentation.subscriber_agreement.observed_sha256 = "0".repeat(64); },
    value => { value.current_documentation.service_page.url = "https://example.com/"; },
    value => { value.current_documentation.business_filings_portal.bulk_identity_verification_applicability_verified = true; },
    value => { value.corporation_product.documented_archive_names.pop(); },
    value => { value.corporation_product.documented_price_usd_per_fiscal_year = 0; },
    value => { value.corporation_product.change_contract_boundary = "Complete delta"; },
    value => { value.schema_review.current_field_dictionary_verified = true; },
    value => { value.schema_review.person_field_rule = "Include agents"; },
    value => { value.schema_review.zip_rule = "Combine ZIP5 and ZIP4"; },
    value => { value.unresolved_gates.pop(); },
    value => { value.unexpected = "field"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(reference);
    mutate(changed);
    assert.throws(() => validateScCorporationBulkContractSchemaReference(changed), /SC contract-schema reference rejected/);
  }
  for (const invalid of [null, [], {}, "SC"]) assert.throws(() => validateScCorporationBulkContractSchemaReference(invalid), /SC contract-schema reference rejected/);
});

test("SC loader rejects changed bytes, malformed JSON and missing evidence without creating artifacts", async () => {
  const reference = await loadScCorporationBulkContractSchemaReference();
  assert.throws(() => verifyScCorporationBulkContractSchemaReferenceBytes(Buffer.from(JSON.stringify(reference))), /file bytes drifted/);
  assert.throws(() => verifyScCorporationBulkContractSchemaReferenceBytes(Buffer.from("{")), /file bytes drifted/);
  await assert.rejects(loadScCorporationBulkContractSchemaReference({ root: `${APP_ROOT}/missing-sc-reference` }), /ENOENT/);
});
