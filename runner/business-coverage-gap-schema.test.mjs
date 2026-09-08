import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

test("coverage gap schema preserves exact reviewed transformation versions and nested gap evidence", async () => {
  const require = createRequire(import.meta.url);
  const Ajv2020 = createRequire(require.resolve("ajv-formats/package.json"))("ajv/dist/2020.js").default;
  const schema = JSON.parse(await readFile(new URL("../config/schemas/business-coverage-gap.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const gap = { schema_version: "1.0.0", view_type: "coverage-gap", gap_id: "gap:fixture", gap_type: "reporting-source-zip-unavailable",
    scope_type: "source", scope_id: "tn_childcare_centers", severity: "warning", status: "open",
    evidence: { records: 2, zip_inferred: false }, consequence: "Source ZIP remains unavailable.",
    lineage: Object.fromEntries(["registry_release_id", "geography_release_id", "zcta_jurisdiction_crosswalk_release_id", "entity_resolution_release_id", "entity_resolution_benchmark_release_id", "census_nonemployer_release_id"].map(key => [key, "synthetic-release"])) };
  for (const version of ["2.7.0", "2.8.0", "2.9.0", "2.10.0"]) {
    gap.lineage.transformation_version = `national-business-coverage-views@${version}`;
    assert.equal(validate(gap), true, JSON.stringify(validate.errors));
  }
  gap.lineage.transformation_version = "national-business-coverage-views@2.10.1";
  assert.equal(validate(gap), false);
  gap.lineage.transformation_version = "national-business-coverage-views@2.9.0";
  gap.record_count = 2;
  assert.equal(validate(gap), false, "source-specific counts belong in evidence, not undeclared top-level fields");
});
