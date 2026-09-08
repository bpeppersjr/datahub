import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { OH_FIELDS, OH_WHERE, OH_LAYER, OH_ITEM } from "./oh-childcare-preflight.mjs";

test("Ohio development policy binds notice evidence without granting acquisition or widening fields", async () => {
  const policy = JSON.parse(await readFile(new URL("../config/source-policies/oh-childcare-local-review.json", import.meta.url)));
  const evidence = JSON.parse(await readFile(new URL("../docs/states/OH-CHILDCARE-NOTICES-2026-09-08.json", import.meta.url)));
  assert.equal(policy.source_dataset, OH_LAYER); assert.equal(policy.catalog_item_id, OH_ITEM);
  assert.equal(policy.where, OH_WHERE); assert.deepEqual(policy.selected_fields, OH_FIELDS);
  for (const key of ["acquisition_authorized", "connector_ready", "legal_approval", "agreement_acceptance_performed", "export_authorized"]) assert.equal(policy[key], false);
  assert.equal(policy.export_policy, "local-review-only"); assert.equal(policy.field_export_policy.selected_source_snapshot, "internal");
  for (const field of ["licenseInfo", "description"]) {
    assert.equal(policy.notice_fingerprints[`item_${field}_utf8_sha256`], evidence.item_observation[field].utf8_sha256);
    assert.match(evidence.item_observation[field].utf8_sha256, /^[a-f0-9]{64}$/);
    assert.equal(evidence.item_observation[field].unchanged_from_retained_preflight, true);
  }
  assert.deepEqual(evidence.xml_observations.map(o => o.http_status), [404, 400]);
  assert.ok(evidence.xml_observations.every(o => o.xml_document === false && Number.isSafeInteger(o.bytes) && /^[a-f0-9]{64}$/.test(o.sha256)));
  assert.equal(evidence.linked_notice_review.additional_terms_absent, false);
  assert.equal(evidence.raw_http_bodies_retained, false); assert.equal(evidence.facility_records_acquired, 0);
  assert.equal(evidence.acquisition_authorized, false); assert.equal(evidence.national_reporting_integrated, false);
});
