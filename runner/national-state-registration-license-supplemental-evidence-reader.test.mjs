import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  readNationalStateRegistrationLicenseSupplementalJurisdiction,
  readNationalStateRegistrationLicenseSupplementalFileForTest,
  readNationalStateRegistrationLicenseSupplementalSummary,
  readNationalStateRegistrationLicenseSupplementalZip,
  validateNationalStateRegistrationLicenseSupplementalZipForTest,
} from "./national-state-registration-license-supplemental-evidence-reader.mjs";
const rejected =
  /^Error: State registration\/license supplemental runtime evidence rejected\.$/;
test("summary conserves nine issuers, ten dimensions, and five classes", async () => {
  const v = await readNationalStateRegistrationLicenseSupplementalSummary();
  assert.equal(v.summary.source_address_row_count, 14414724);
  assert.equal(v.summary.eligible_address_membership_count, 10014807);
  assert.equal(
    v.summary.missing_or_ineligible_address_membership_count,
    4399917,
  );
  assert.deepEqual(
    [v.issuer_marginals.length, v.sources.length, v.classes.length],
    [9, 10, 5],
  );
  assert.equal(
    v.sources.at(-1).evidence_class,
    "construction-contractor-license",
  );
  assert.equal(v.claims.cross_source_additivity_asserted, false);
});
test("ZIP distinguishes positive, zero, and outside while preserving WA", async () => {
  const positive = await readNationalStateRegistrationLicenseSupplementalZip({
    zip5: "98101",
  });
  assert.equal(positive.status, "governed-supplemental-memberships");
  assert.ok(
    positive.row.dimensions.find((x) => x.issuer_state === "WA")
      .source_address_membership_count > 0,
  );
  assert.equal(
    (
      await readNationalStateRegistrationLicenseSupplementalZip({
        zip5: "00000",
      })
    ).status,
    "governed-zero-supplemental-memberships",
  );
  assert.equal(
    (
      await readNationalStateRegistrationLicenseSupplementalZip({
        zip5: "99002",
      })
    ).status,
    "outside-governed-cohort",
  );
});
test("jurisdiction returns separate issuer marginal and preserves OR split", async () => {
  const wa = await readNationalStateRegistrationLicenseSupplementalJurisdiction(
    { state: "WA" },
  );
  assert.equal(
    wa.issuer_marginal_comparison.comparison_kind,
    "separate-marginals-not-record-linkage",
  );
  assert.equal(
    wa.issuer_marginal_comparison.issuer_source_address_row_count,
    74141,
  );
  const or = await readNationalStateRegistrationLicenseSupplementalJurisdiction(
    { state: "OR" },
  );
  assert.equal(
    or.scope.dimensions.filter((x) => x.issuer_state === "OR").length,
    2,
  );
  assert.equal(
    (
      await readNationalStateRegistrationLicenseSupplementalJurisdiction({
        scopeId: "multi-state-material",
      })
    ).issuer_marginal_comparison,
    null,
  );
});
test("ZIP validator rejects rerouting, Oregon collapse, and WA reclassification", async () => {
  const row = (
    await readNationalStateRegistrationLicenseSupplementalZip({ zip5: "98101" })
  ).row;
  assert.doesNotThrow(() =>
    validateNationalStateRegistrationLicenseSupplementalZipForTest(
      row,
      "98101",
    ),
  );
  for (const mutate of [
    (v) => v.dimensions.pop(),
    (v) => {
      v.dimensions[3].dimension_id = v.dimensions[4].dimension_id;
    },
    (v) => {
      v.dimensions[9].evidence_class = "organization-registration-address";
    },
    (v) => {
      v.zip4 = "1234";
    },
  ]) {
    const changed = structuredClone(row);
    mutate(changed);
    assert.throws(
      () =>
        validateNationalStateRegistrationLicenseSupplementalZipForTest(
          changed,
          "98101",
        ),
      rejected,
    );
  }
});
async function fixture(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "state-registration-runtime-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = `config/datasets/national-state-registration-license-supplemental-evidence.json`,
    r = JSON.parse(await readFile(path.join(APP_ROOT, config))),
    base = path.dirname(r.retained_release.manifest);
  for (const name of [
    config,
    r.retained_release.manifest,
    ...[
      "geography-disposition-scopes.json",
      "issuer-state-marginals.json",
      "national-summary.json",
      "zip2=98.jsonl.gz",
    ].map((x) => path.join(base, x)),
  ]) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(APP_ROOT, name), target);
  }
  return { root, base, config };
}
test("reader rejects aggregate tampering generically", async (t) => {
  const v = await fixture(t),
    target = path.join(v.root, v.base, "national-summary.json"),
    s = JSON.parse(await readFile(target));
  s.positive_zip5_rows++;
  await writeFile(target, JSON.stringify(s) + "\n");
  await assert.rejects(
    () =>
      readNationalStateRegistrationLicenseSupplementalSummary({ root: v.root }),
    rejected,
  );
});
test("reader rejects registration tampering generically", async (t) => {
  const v = await fixture(t),
    target = path.join(v.root, v.config),
    r = JSON.parse(await readFile(target));
  r.claims.unique_business_count = 1;
  await writeFile(target, JSON.stringify(r) + "\n");
  await assert.rejects(
    () =>
      readNationalStateRegistrationLicenseSupplementalSummary({ root: v.root }),
    rejected,
  );
});
test("reader rejects multiply linked ZIP partition", async (t) => {
  const v = await fixture(t),
    target = path.join(v.root, v.base, "zip2=98.jsonl.gz");
  await link(target, `${target}.alias`);
  await assert.rejects(
    () =>
      readNationalStateRegistrationLicenseSupplementalZip({
        root: v.root,
        zip5: "98101",
      }),
    rejected,
  );
});
test("open-file read rejects a concurrently replaced input", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "state-registration-race-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "evidence.bin"),
    original = Buffer.alloc(16_000_000, 0x61),
    replacement = Buffer.alloc(original.length, 0x62),
    digest = createHash("sha256").update(original).digest("hex");
  await writeFile(target, original);
  const reading = readNationalStateRegistrationLicenseSupplementalFileForTest(
      root,
      "evidence.bin",
      original.length,
      digest,
    ),
    rejectedRead = assert.rejects(reading, rejected);
  await writeFile(target, replacement);
  await rejectedRead;
});
