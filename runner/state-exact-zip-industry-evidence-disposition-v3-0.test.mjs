import test from "node:test";
import assert from "node:assert/strict";
import { V30_STATE_TEST as contract, buildStateExactZipIndustryEvidenceDispositionV30 as build,
  readStateExactZipIndustryEvidenceDispositionV30 as read } from "./state-exact-zip-industry-evidence-disposition-v3-0.mjs";
import { readStateExactZipIndustryEvidenceProjectionV30 as project } from "./state-exact-zip-industry-evidence-map-v3-0.mjs";

test("v3.0 replays the registered conserved 51-dimension successor", async () => {
  const value = await build();
  assert.deepEqual([value.scope_rows, value.dimension_count, value.industry_cells], [60, 51, 2457894]);
  assert.equal(value.release_id, "state-exact-zip-industry-evidence-disposition-62e4ced49cfb1c0d41628864f1b867c8b89a9f58bec66de1e146568f777f544a");
  assert.equal(value.manifest_sha256, "1678f94007155d602dd9d803093c1efd368aa862498da8d0108a969b3b0d4f6e");
  assert.equal(value.artifact_sha256, "647da886fc5dceec381b787d2309f593dcb4db6bc8dedb87c8774e2d405fe888");
});

test("v3.0 New York state row preserves stale address evidence", async () => {
  const value = await read({ scopeId: "state:36", dimensionId: contract.DIM });
  assert.equal(value.scope.postal_abbreviation, "NY");
  assert.equal(value.dimension.raw_status_counts.positive > 0, true);
  assert.equal(value.dimension.lifecycle_status_counts.stale, value.scope.zip5_rows);
  assert.equal(value.claims.current_operations_verified, false);
  assert.equal(value.claims.nonadditive_with_ny_retail_food_location_profiles, true);
  assert.equal(value.claims.address_evidence_may_not_qualify_as_physical_site, true);
});

test("v3.0 projection exposes all scopes and 51 dimensions", async () => {
  const value = await project({ dimensionId: contract.DIM });
  assert.equal(value.schema_version, "state-exact-zip-industry-evidence-projection@3.0.0");
  assert.equal(value.states.length, 51);
  assert.equal(value.territories.length, 5);
  assert.equal(value.special_scopes.length, 4);
  assert.equal(value.dimensions.length, 51);
  assert.equal(value.states.find((row) => row.postal_abbreviation === "NY").count_sum > 0, true);
});
