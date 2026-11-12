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
  readNationalIrsEoSupplementalIndustryJurisdiction,
  readNationalIrsEoSupplementalIndustrySummary,
  readNationalIrsEoSupplementalIndustryZip,
  validateNationalIrsEoSupplementalIndustryZipForTest,
} from "./national-irs-eo-supplemental-industry-evidence-reader.mjs";

const rejected =
  /^Error: IRS EO supplemental industry runtime evidence rejected\.$/;

test("summary exposes conserved stale supplemental evidence without additivity", async () => {
  const value = await readNationalIrsEoSupplementalIndustrySummary();
  assert.equal(
    value.schema_version,
    "national-irs-eo-supplemental-industry-evidence-runtime-summary@1.0.0",
  );
  assert.equal(value.summary.organization_membership_count, 1955841);
  assert.deepEqual(
    [
      value.scopes.states.length,
      value.scopes.territories.length,
      value.scopes.special.length,
    ],
    [51, 5, 4],
  );
  assert.equal(value.reported_filing_address_jurisdictions.length, 56);
  assert.equal(value.refresh.selected_release_stale, true);
  assert.equal(value.refresh.newer_edition_observed_not_collected, true);
  assert.equal(
    value.refresh.observed_count_is_not_net_organization_creation,
    true,
  );
  assert.equal(value.claims.additive_to_business_or_industry_totals, false);
});

test("exact ZIP reads one governed partition and distinguishes positive, zero, and outside", async () => {
  const positive = await readNationalIrsEoSupplementalIndustryZip({
    zip5: "55001",
  });
  assert.equal(positive.status, "governed-supplemental-memberships");
  assert.equal(positive.row.organization_membership_count, 25);
  assert.equal(positive.row.geography_disposition_scope_id, "state:27");
  const zero = await readNationalIrsEoSupplementalIndustryZip({
    zip5: "00000",
  });
  assert.equal(zero.status, "governed-zero-supplemental-memberships");
  assert.equal(
    (await readNationalIrsEoSupplementalIndustryZip({ zip5: "99002" })).status,
    "outside-governed-cohort",
  );
});

test("jurisdiction returns separate marginals and never a cross-tab", async () => {
  const value = await readNationalIrsEoSupplementalIndustryJurisdiction({
    state: "MN",
  });
  assert.equal(value.scope.scope_id, "state:27");
  assert.equal(value.scope.organization_membership_count, 38608);
  assert.deepEqual(value.reported_filing_address_comparison, {
    comparison_kind: "separate-marginals-not-record-linkage",
    reported_filing_address_jurisdiction: "MN",
    governed_geography_membership_count: 38608,
    reported_filing_address_membership_count: 40094,
  });
  assert.equal(
    (
      await readNationalIrsEoSupplementalIndustryJurisdiction({
        scopeId: "multi-state-material",
      })
    ).reported_filing_address_comparison,
    null,
  );
  await assert.rejects(
    () => readNationalIrsEoSupplementalIndustryJurisdiction({ state: "PR" }),
    rejected,
  );
});

test("ZIP schema rejects geography, additivity, and count drift", async () => {
  const row = (
    await readNationalIrsEoSupplementalIndustryZip({ zip5: "55001" })
  ).row;
  assert.doesNotThrow(() =>
    validateNationalIrsEoSupplementalIndustryZipForTest(row, "55001"),
  );
  for (const mutate of [
    (value) => {
      value.zip4 = "1234";
    },
    (value) => {
      value.industry = "retail-consumer";
    },
    (value) => {
      value.organization_membership_count = -1;
    },
    (value) => {
      value.geography_disposition_scope_id = "";
    },
  ]) {
    const changed = structuredClone(row);
    mutate(changed);
    assert.throws(
      () =>
        validateNationalIrsEoSupplementalIndustryZipForTest(changed, "55001"),
      rejected,
    );
  }
});

async function fixture(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "irs-eo-supplemental-runtime-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const config =
      "config/datasets/national-irs-eo-supplemental-industry-evidence.json",
    registration = JSON.parse(await readFile(path.join(APP_ROOT, config))),
    manifest = JSON.parse(
      await readFile(
        path.join(APP_ROOT, registration.retained_release.manifest),
      ),
    ),
    base = path.dirname(registration.retained_release.manifest);
  for (const name of [
    config,
    registration.retained_release.manifest,
    manifest.bindings.refresh_assessment.path,
    ...[
      "geography-disposition-scopes.json",
      "reported-jurisdictions.json",
      "national-summary.json",
      "zip2=55.jsonl.gz",
    ].map((name) => path.join(base, name)),
  ]) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(APP_ROOT, name), target);
  }
  return { root, config, base };
}

test("reader rejects aggregate tampering with a generic error", async (t) => {
  const value = await fixture(t),
    target = path.join(value.root, value.base, "national-summary.json"),
    summary = JSON.parse(await readFile(target));
  summary.organization_membership_count++;
  await writeFile(target, JSON.stringify(summary) + "\n");
  await assert.rejects(
    () => readNationalIrsEoSupplementalIndustrySummary({ root: value.root }),
    rejected,
  );
});

test("reader rejects refresh-assessment tampering with a generic error", async (t) => {
  const value = await fixture(t),
    target = path.join(
      value.root,
      "config/governed-source-refresh-assessments/irs-eo-bmf-2026-11-12.json",
    ),
    assessment = JSON.parse(await readFile(target));
  assessment.observation.aggregate_records++;
  await writeFile(target, JSON.stringify(assessment) + "\n");
  await assert.rejects(
    () => readNationalIrsEoSupplementalIndustrySummary({ root: value.root }),
    rejected,
  );
});

test("reader rejects multiply linked partition", async (t) => {
  const value = await fixture(t),
    target = path.join(value.root, value.base, "zip2=55.jsonl.gz");
  await link(target, `${target}.alias`);
  await assert.rejects(
    () =>
      readNationalIrsEoSupplementalIndustryZip({
        root: value.root,
        zip5: "55001",
      }),
    rejected,
  );
});
