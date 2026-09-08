import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeTnChildcareFeature } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_ITEM, TN_CHILDCARE_XML_URL } from "./tn-childcare-preflight.mjs";

test("TN source policy matches normalized provenance without granting public export", async () => {
  const policy = JSON.parse(await readFile(new URL("../config/source-policies/tn-childcare-local-review.json", import.meta.url), "utf8"));
  const row = normalizeTnChildcareFeature({ attributes: {
    OBJECTID: 1, Provider_ID: null, Provider_Status: "Active", Provider_Type: "Child Care", Child_Care_Type: "Child Care Center",
    Provider_Name: "Fixture Center", Street_Address: "10 Main Street", Street_Address_2: null, City: "Nashville", State: "TN", Zip: "37201-0001", County: null,
  }, geometry: null }, { runId: "fixture-run", sourceReleaseId: "fixture-source", observedAt: "2026-09-08T00:00:00.000Z", outputWkid: 4326 });
  assert.equal(row.provenance.policy_id, policy.policy_id);
  assert.equal(row.provenance.policy_profile, `${policy.policy_id}@${policy.version}`);
  assert.equal(row.provenance.attribution, policy.attribution);
  assert.equal(policy.source_dataset, TN_CHILDCARE_LAYER);
  assert.equal(policy.catalog_item_id, TN_CHILDCARE_ITEM);
  assert.equal(policy.publisher_metadata_url, TN_CHILDCARE_XML_URL);
  assert.equal(policy.export_policy, "local-review-only");
  assert.equal(row.export_policy, policy.field_export_policy.normalized_center_records);
  assert.equal(policy.field_export_policy.selected_source_snapshot, "internal");
  assert.equal(policy.field_export_policy.unselected_fields, "excluded-at-query-time");
  assert.equal(policy.contains_personal_data, true);
  assert.equal(policy.contains_secrets, false);
  assert.match(policy.publisher_notice_requirement, /hold-harmless/);
  assert.match(policy.redistribution, /Not authorized/);
  assert.deepEqual([row.physical_address.zip_code, row.physical_address.zip4], ["37201", "0001"]);
  assert.equal(row.source_status.active_business_verified, false);
});
