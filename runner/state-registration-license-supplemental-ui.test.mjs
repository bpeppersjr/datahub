import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  readNationalStateRegistrationLicenseSupplementalJurisdiction,
  readNationalStateRegistrationLicenseSupplementalSummary,
  readNationalStateRegistrationLicenseSupplementalZip,
} from "./national-state-registration-license-supplemental-evidence-reader.mjs";

const source = await readFile(
    new URL(
      "../app/state-registration-license-supplemental.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  jurisdictionSource = await readFile(
    new URL(
      "../app/lifecycle-industry-jurisdiction-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  zipSource = await readFile(
    new URL("../app/lifecycle-industry-zip-panel.tsx", import.meta.url),
    "utf8",
  ),
  code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
const exports = {},
  fakeRequire = (id) =>
    id === "react"
      ? {
          useEffect() {},
          useState(value) {
            return [value, () => {}];
          },
        }
      : id === "react/jsx-runtime"
        ? { Fragment: Symbol("Fragment"), jsx: () => ({}), jsxs: () => ({}) }
        : id === "./runner-client"
          ? { runnerJson: async () => ({}) }
          : (() => {
              throw Error(`unexpected import ${id}`);
            })();
runInNewContext(code, {
  exports,
  module: { exports },
  require: fakeRequire,
  console,
  AbortController,
  encodeURIComponent,
});

test("strict supplemental UI validators accept final governed envelopes", async () => {
  const summary =
      await readNationalStateRegistrationLicenseSupplementalSummary(),
    zip = await readNationalStateRegistrationLicenseSupplementalZip({
      zip5: "98101",
    }),
    zero = await readNationalStateRegistrationLicenseSupplementalZip({
      zip5: "99998",
    }),
    outside = await readNationalStateRegistrationLicenseSupplementalZip({
      zip5: "12346",
    }),
    wa = await readNationalStateRegistrationLicenseSupplementalJurisdiction({
      state: "WA",
    });
  assert.equal(
    exports.validStateRegistrationLicenseSummary(summary),
    true,
    "summary",
  );
  assert.equal(
    exports.validStateRegistrationLicenseZip(zip, "98101"),
    true,
    "positive ZIP",
  );
  assert.equal(
    exports.validStateRegistrationLicenseZip(zero, "99998"),
    true,
    "zero ZIP",
  );
  assert.equal(
    exports.validStateRegistrationLicenseZip(outside, "12346"),
    true,
    "outside ZIP",
  );
  assert.equal(
    exports.validStateRegistrationLicenseJurisdiction(wa, "WA"),
    true,
    "WA jurisdiction",
  );
  assert.equal(zip.row.dimensions.length, 10);
  assert.equal(wa.scope.dimensions.length, 10);
  assert.equal(summary.classes.length, 5);
  assert.equal(summary.issuer_marginals.length, 9);
});

test("validators reject pin, conservation, class, and zero-status tampering", async () => {
  const summary =
      await readNationalStateRegistrationLicenseSupplementalSummary(),
    zip = await readNationalStateRegistrationLicenseSupplementalZip({
      zip5: "98101",
    }),
    wa = await readNationalStateRegistrationLicenseSupplementalJurisdiction({
      state: "WA",
    });
  const badPin = structuredClone(summary);
  badPin.release.manifest_sha256 = "0".repeat(64);
  assert.equal(exports.validStateRegistrationLicenseSummary(badPin), false);
  const badClaim = structuredClone(summary);
  badClaim.claims.physical_site_verified = true;
  assert.equal(exports.validStateRegistrationLicenseSummary(badClaim), false);
  const badSource = structuredClone(summary);
  badSource.sources[9].source_id = badSource.sources[0].source_id;
  assert.equal(exports.validStateRegistrationLicenseSummary(badSource), false);
  const badClass = structuredClone(zip);
  badClass.row.dimensions[9].evidence_class = "general-business";
  assert.equal(
    exports.validStateRegistrationLicenseZip(badClass, "98101"),
    false,
  );
  const badSum = structuredClone(wa);
  badSum.scope.source_address_membership_count++;
  assert.equal(
    exports.validStateRegistrationLicenseJurisdiction(badSum, "WA"),
    false,
  );
  const badStatus = structuredClone(zip);
  badStatus.status = "governed-zero-supplemental-memberships";
  badStatus.row.status = badStatus.status;
  assert.equal(
    exports.validStateRegistrationLicenseZip(badStatus, "98101"),
    false,
  );
});

test("both lifecycle panels mount the independent supplemental sibling", () => {
  assert.match(
    jurisdictionSource,
    /<StateRegistrationLicenseSupplemental state=\{state \|\| undefined\} \/>/,
  );
  assert.match(
    zipSource,
    /<StateRegistrationLicenseSupplemental zip5=\{zip5\} \/>/,
  );
  for (const endpoint of [
    "state-registration-license-supplemental-summary",
    "state-registration-license-supplemental-jurisdiction",
    "state-registration-license-supplemental-zip",
  ])
    assert.match(source, new RegExp(endpoint));
  assert.match(source, /contractor-license mailing-address evidence/);
  assert.match(source, /not additive businesses/);
  assert.match(source, /this is not zero businesses/);
  assert.match(source, /not a\s+supplemental zero, an invalid ZIP/);
  assert.match(source, /Other status panels are unaffected/);
});
