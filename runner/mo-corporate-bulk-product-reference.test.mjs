import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  loadMoCorporateBulkProductReference,
  validateMoCorporateBulkProductReference,
  verifyMoCorporateBulkProductReferenceBytes,
} from "./mo-corporate-bulk-product-reference.mjs";
import { loadBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";
import { APP_ROOT } from "./paths.mjs";

test("MO documentation preserves current catalog facts and historical implementation provenance only", async () => {
  const reference = await loadMoCorporateBulkProductReference();
  assert.equal(reference.decision, "hold");
  for (const key of ["current_schema_compatibility_verified", "connector_ready", "acquisition_authorized"]) assert.equal(reference[key], false);
  for (const key of ["required_source_files", "source_records_acquired", "broad_layer_gaps_resolved"]) assert.equal(reference[key], 0);
  assert.ok(Object.values(reference.authority).every(value => value === false));
  assert.equal(reference.controls.pdf_files_retained, 0);
  assert.deepEqual(reference.current_documentation.forms_and_services.catalog_services, ["searches", "filings", "copies", "forms"]);
  assert.equal(reference.current_documentation.forms_and_services.http_status, 200);
  assert.equal(reference.current_documentation.corporations_about.http_status, 200);
  assert.match(reference.current_documentation.corporations_about.address_boundary, /does not prove an operating site/);
  assert.equal(reference.historical_implementation.direct_retrieval_status, 404);
  assert.equal(reference.historical_implementation.observed_response_kind, "HTML error response, not PDF");
  assert.equal(reference.historical_implementation.current_product_availability_verified, false);
  assert.equal(reference.historical_implementation.retained_locally, false);
  assert.match(reference.historical_implementation.implementation_claim_origin, /retained historical report claim/);
});

test("MO remains absent from readiness wave and its October assessment remains byte-identical", async () => {
  const wave = await loadBroadOfflineConnectorReadinessWave();
  assert.ok(!wave.states.some(row => row.state === "MO"));
  const prior = await readFile(path.join(APP_ROOT, "config/state-business-source-assessments/mo-2026-10-03.json"));
  assert.equal(createHash("sha256").update(prior).digest("hex"), "d5146361e785d2bedaebcc73d6a1111e9a64c44be632ac7b43bb1723bdc53693");
  assert.equal(JSON.parse(prior).decision, "hold");
});

test("MO reference rejects identity, readiness, authorization, historical, citation and arbitrary content drift", async () => {
  const reference = await loadMoCorporateBulkProductReference();
  const mutations = [
    value => { value.state = "MT"; },
    value => { value.schema_version = "mo-corporate-bulk-product-reference@2.0.0"; },
    value => { value.decision = "ready"; },
    value => { value.current_schema_compatibility_verified = true; },
    value => { value.connector_ready = true; },
    value => { value.acquisition_authorized = true; },
    value => { value.required_source_files = 1; },
    value => { value.source_records_acquired = 1; },
    value => { value.broad_layer_gaps_resolved = 1; },
    ...Object.keys(reference.authority).map(key => value => { value.authority[key] = true; }),
    value => { delete value.authority.source_acquisition; },
    value => { value.controls.portal_automation = true; },
    value => { value.controls.pdf_files_retained = 1; },
    value => { value.historical_implementation.retained_locally = true; },
    value => { value.historical_implementation.current_product_availability_verified = true; },
    value => { value.historical_implementation.current_schema_compatibility_verified = true; },
    value => { value.historical_implementation.direct_retrieval_status = 200; },
    value => { value.historical_implementation.observed_response_sha256 = "0".repeat(64); },
    value => { value.current_documentation.forms_and_services.bulk_route_found = true; },
    value => { value.current_documentation.forms_and_services.url = "https://example.com/"; },
    value => { value.current_documentation.corporations_about.published_information_categories.pop(); },
    value => { value.unresolved_gates.pop(); },
    value => { value.unexpected = "field"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(reference);
    mutate(changed);
    assert.throws(() => validateMoCorporateBulkProductReference(changed), /MO bulk-product reference rejected/);
  }
  for (const invalid of [null, [], {}, "MO"]) assert.throws(() => validateMoCorporateBulkProductReference(invalid), /MO bulk-product reference rejected/);
});

test("MO loader rejects changed bytes, malformed JSON and missing evidence without creating artifacts", async () => {
  const reference = await loadMoCorporateBulkProductReference();
  assert.throws(() => verifyMoCorporateBulkProductReferenceBytes(Buffer.from(JSON.stringify(reference))), /file bytes drifted/);
  assert.throws(() => verifyMoCorporateBulkProductReferenceBytes(Buffer.from("{")), /file bytes drifted/);
  await assert.rejects(loadMoCorporateBulkProductReference({ root: `${APP_ROOT}/missing-mo-reference` }), /ENOENT/);
});
