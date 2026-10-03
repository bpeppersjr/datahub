import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { loadMiMdLaBusinessSourceReassessment, loadMiMdLaBusinessSourceReassessments, validateMiMdLaBusinessSourceReassessment } from "./mi-md-la-business-source-reassessment.mjs";

test("Michigan evidence updates the fiscal authority without claiming a bulk source", async () => {
  const value = await loadMiMdLaBusinessSourceReassessment("MI");
  assert.match(value.access.bulk, /FY2027 PA 21 of 2026, Article 10 section 252/);
  assert.equal(value.fields.published, false);
  assert.match(value.fields.summary, /COFS endpoints are retired/);
  assert.match(value.strongest_next_action, /before sending the inquiry/);
});

test("Maryland distinguishes a published layout from missing codebooks and encoding", async () => {
  const value = await loadMiMdLaBusinessSourceReassessment("MD");
  assert.equal(value.fields.published, true);
  assert.match(value.fields.summary, /FL_ACTIVE but not its allowed values/);
  assert.match(value.address_zip, /AD_ZIP CHAR 9/);
  assert.match(value.statewide_completeness, /not a completion denominator/);
  assert.ok(value.unresolved_gates.includes("schema-encoding-and-version"));
});

test("Louisiana preserves the bulk/lookup distinction and route ambiguity", async () => {
  const value = await loadMiMdLaBusinessSourceReassessment("LA");
  assert.match(value.access.api, /18 calls\/minute and 1,000 search results/);
  assert.match(value.fields.summary, /\/api\/Commercial\/Search.*\/api\/Commercial\/Lookup/);
  assert.ok(value.unresolved_gates.includes("api-route-and-version-clarification"));
  assert.match(value.strongest_next_action, /do not substitute capped name searches/);
});

test("loaders preserve exact state membership and reject cross-state files", async () => {
  const values = await loadMiMdLaBusinessSourceReassessments();
  assert.deepEqual(values.map((value) => value.state.abbreviation), ["MI", "MD", "LA"]);
  await assert.rejects(loadMiMdLaBusinessSourceReassessment("MI", path.join(APP_ROOT, "config", "state-business-source-assessments", "md-2026-10-03.json")), /reassessment rejected/);
  await assert.rejects(loadMiMdLaBusinessSourceReassessment("../MI"), /reassessment rejected/);
});

for (const state of ["MI", "MD", "LA"]) {
  test(`${state} rejects evidence and authority drift and returns an isolated clone`, async () => {
    const original = await loadMiMdLaBusinessSourceReassessment(state);
    const mutations = [
      (value) => { value.decision = "proceed-to-bounded-connector"; },
      (value) => { value.connector_candidate = true; },
      (value) => { value.authorized = true; },
      (value) => { value.supersedes_assessment_id = "other"; },
      (value) => { value.observed_at = "2026-10-04"; },
      (value) => { value.citations[0].url = "https://example.com"; },
      (value) => { value.address_zip = "verified physical site"; },
      (value) => { value.unresolved_gates = []; },
      ...Object.keys(original.authority).map((key) => (value) => { value.authority[key] = true; }),
      ...Object.keys(original.controls).map((key) => (value) => {
        value.controls[key] = key === "official_primary_sources_only" ? false : key === "portal_automation" ? true : 1;
      }),
    ];
    for (const mutate of mutations) {
      const value = structuredClone(original);
      mutate(value);
      assert.throws(() => validateMiMdLaBusinessSourceReassessment(value), /reassessment rejected/);
    }
    const clone = validateMiMdLaBusinessSourceReassessment(original);
    clone.citations[0].evidence = "changed";
    assert.notEqual(original.citations[0].evidence, "changed");
  });
}
