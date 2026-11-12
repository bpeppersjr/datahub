import assert from "node:assert/strict";
import {
  cp,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import {
  readNationalBusinessLifecycleIndustryJurisdiction,
  readNationalBusinessLifecycleIndustryJurisdictionSummary,
  validateNationalBusinessLifecycleIndustryJurisdictionRowForTest,
} from "./national-business-lifecycle-industry-jurisdiction-evidence-reader.mjs";

const rejected =
  /^Error: Lifecycle industry jurisdiction runtime evidence rejected\.$/;

test("summary returns v1.1 union and assignment totals with the ordered closed scope roster", async () => {
  const view = await readNationalBusinessLifecycleIndustryJurisdictionSummary();
  assert.equal(
    view.schema_version,
    "national-business-lifecycle-industry-jurisdiction-evidence-runtime-summary@1.1.0",
  );
  assert.deepEqual(
    [
      view.scopes.states.length,
      view.scopes.territories.length,
      view.scopes.special.length,
    ],
    [51, 5, 4],
  );
  assert.deepEqual(Object.keys(view.summary.industry_assignment_counts), [
    "retail-consumer",
    "health-care",
    "financial-services",
    "transportation",
    "construction",
    "tax-exempt-organizations",
    "sales-tax-outlets",
    "local-business-licenses",
    "childcare",
  ]);
  assert.deepEqual(
    view.scopes.special.map((row) => row.scope_id),
    [
      "multi-state-material",
      "zcta-overlay-unresolved",
      "non-zcta-unassigned",
      "explicit-placeholder",
    ],
  );
  assert.equal(view.summary.source_membership_count, 8011213);
  assert.equal(view.summary.mapped_source_record_union_count, 6780627);
  assert.equal(view.summary.industry_assignment_count, 6782745);
  assert.equal(
    view.release.registration_sha256,
    "fee5ead43901852b940c4df492de8f0b5fda51f91c9e5fb7305c1ec0199d3f38",
  );
  assert.equal(view.claims.industry_completeness, null);
});

test("lookup accepts one exact state or governed scope and rejects territory-as-state", async () => {
  const state = await readNationalBusinessLifecycleIndustryJurisdiction({
    state: "MN",
  });
  assert.equal(state.status, "governed-source-relative-industry-memberships");
  assert.equal(state.scope.scope_id, "state:27");
  assert.equal(state.scope.industries.length, 9);
  assert.equal(
    (
      await readNationalBusinessLifecycleIndustryJurisdiction({
        scopeId: "multi-state-material",
      })
    ).scope.scope_kind,
    "multi-state-material",
  );
  await assert.rejects(
    () => readNationalBusinessLifecycleIndustryJurisdiction({ state: "PR" }),
    rejected,
  );
  await assert.rejects(
    () =>
      readNationalBusinessLifecycleIndustryJurisdiction({
        state: "MN",
        scopeId: "state:27",
      }),
    rejected,
  );
});

test("row validator closes source routing, ordering, EPA segments, and FSIS residual", async () => {
  const row = (
    await readNationalBusinessLifecycleIndustryJurisdiction({ state: "MN" })
  ).scope;
  assert.doesNotThrow(() =>
    validateNationalBusinessLifecycleIndustryJurisdictionRowForTest(row),
  );
  const moved = structuredClone(row);
  [moved.industries[0].sources[0], moved.industries[0].sources[1]] = [
    moved.industries[0].sources[1],
    moved.industries[0].sources[0],
  ];
  assert.throws(
    () =>
      validateNationalBusinessLifecycleIndustryJurisdictionRowForTest(moved),
    rejected,
  );
  const duplicate = structuredClone(row);
  duplicate.industries[0].sources[1].source_id =
    duplicate.industries[0].sources[0].source_id;
  assert.throws(
    () =>
      validateNationalBusinessLifecycleIndustryJurisdictionRowForTest(
        duplicate,
      ),
    rejected,
  );
  const epa = structuredClone(row);
  epa.epa_refinement.segment_assignment_counts["retail-consumer"]++;
  assert.throws(
    () => validateNationalBusinessLifecycleIndustryJurisdictionRowForTest(epa),
    rejected,
  );
  const fsis = structuredClone(row);
  fsis.unmapped_sources[0].source_id = "epa-echo-exporter-active-facility";
  assert.throws(
    () => validateNationalBusinessLifecycleIndustryJurisdictionRowForTest(fsis),
    rejected,
  );
});

async function fixture(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "industry-jurisdiction-reader-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const config =
    "config/datasets/national-business-lifecycle-industry-jurisdiction-evidence.json";
  const registration = JSON.parse(await readFile(path.join(APP_ROOT, config)));
  await mkdir(path.join(root, "config/datasets"), { recursive: true });
  await cp(path.join(APP_ROOT, config), path.join(root, config));
  const release = path.dirname(registration.retained_release.manifest);
  await mkdir(path.join(root, release), { recursive: true });
  await cp(path.join(APP_ROOT, release), path.join(root, release), {
    recursive: true,
  });
  const manifest = JSON.parse(
    await readFile(path.join(APP_ROOT, registration.retained_release.manifest)),
  );
  const zipManifest =
    manifest.bindings.lifecycle_industry_zip_evidence.manifest_path;
  await mkdir(path.dirname(path.join(root, zipManifest)), { recursive: true });
  await cp(path.join(APP_ROOT, zipManifest), path.join(root, zipManifest));
  return { root, release, config };
}

test("reader rejects artifact tampering with a generic error", async (t) => {
  const value = await fixture(t),
    target = path.join(value.root, value.release, "jurisdictions.json"),
    rows = JSON.parse(await readFile(target));
  rows[0].source_membership_count++;
  await writeFile(target, JSON.stringify(rows) + "\n");
  await assert.rejects(
    () =>
      readNationalBusinessLifecycleIndustryJurisdictionSummary({
        root: value.root,
      }),
    rejected,
  );
});

test("reader rejects altered registration history with a generic error", async (t) => {
  const value = await fixture(t),
    target = path.join(value.root, value.config),
    registration = JSON.parse(await readFile(target));
  registration.retained_releases.reverse();
  await writeFile(target, JSON.stringify(registration) + "\n");
  await assert.rejects(
    () =>
      readNationalBusinessLifecycleIndustryJurisdictionSummary({
        root: value.root,
      }),
    rejected,
  );
});

test("reader rejects multiply linked immutable artifact", async (t) => {
  const value = await fixture(t),
    target = path.join(value.root, value.release, "jurisdictions.json");
  await link(target, `${target}.alias`);
  await assert.rejects(
    () =>
      readNationalBusinessLifecycleIndustryJurisdictionSummary({
        root: value.root,
      }),
    rejected,
  );
});
