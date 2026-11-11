import assert from "node:assert/strict";
import test from "node:test";
import { readAcsZctaDemographicNetworkReadiness } from "./acs-zcta-demographic-network-readiness.mjs";

test("projects the verified ACS plan without implying execution", async () => {
  const view = await readAcsZctaDemographicNetworkReadiness();
  assert.equal(
    view.schema_version,
    "acs-zcta-demographic-network-readiness-view@1.0.0",
  );
  assert.equal(view.status, "reviewed-plan-awaiting-explicit-network-authorization");
  assert.deepEqual(view.tables, ["B01001", "B02001", "B03002", "B04006"]);
  assert.deepEqual(view.request_budget, {
    metadata_requests: 4,
    data_requests: 4,
    maximum_total_requests: 8,
    maximum_metadata_response_bytes: 5_000_000,
    maximum_group_response_bytes: 536_870_912,
    maximum_total_source_bytes: 1_073_741_824,
    minimum_free_disk_bytes: 2_147_483_648,
    maximum_parallel_requests: 1,
  });
  assert.equal(view.geography.governed_zctas, 33791);
  assert.equal(view.geography.non_zcta_space_blocks_map, false);
  assert.equal(
    view.geography.private_unique_or_po_box_zip_without_zcta,
    "not-applicable-no-census-zcta-demographic-estimate",
  );
  assert.equal(view.prerequisites.plan_verified, true);
  assert.equal(view.prerequisites.network_acquisition_authorized, false);
  assert.deepEqual(view.claims, {
    network_requests: 0,
    acquisition_performed: false,
    current_pointer_written: false,
    production_enrollment: false,
    demographic_percentages: false,
    demographic_gdp_allocation: false,
  });
  assert.equal(
    view.provenance.plan_sha256,
    "7e1b832f596577660b57fb53277fabb01f76ca34d91ba63fd3c59135c53bd1ec",
  );
});
