import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile(
  new URL("../app/workspace-views.tsx", import.meta.url),
  "utf8",
);
test("industry summary exposes bounded national exact-ZIP matrix and non-ZCTA status without completeness claims", () => {
  for (const phrase of [
    "Retained source-dimension status",
    "Joined evidence disposition:",
    "source-specific evidence cells, not business counts",
    "no disposition verifies current operation",
    "Joined cell disposition:",
    "current operation unverified",
    "evidence_disposition_counts",
    "by_cell_status",
    "by_lifecycle_status",
    "validExactZipIndustrySummary",
    "Download governed status JSON",
    "cotive-national-zip-industry-status",
    "application/json",
    "document.body.append",
    "link.remove",
    "setTimeout",
    "same-code Census ZCTA polygon",
    "source-contributed keys",
    "denominator-only keys",
    "Non-ZCTA status does not mean an invalid ZIP",
    "All {view.source_dimensions} governed source dimensions",
    "Source dimension / retained source release",
    "No temporal source mapping",
    "No retained source release mapped",
    "ZIPs with positive evidence",
    "ZIPs with measured status",
    "Review qualification",
    "Publisher status meaning",
    "publisher-defined current status",
    "non-active reporting",
    "does not verify general business operation",
    "No publisher status meaning mapped",
    "within-review-window",
    "stale",
    "unmeasured",
    "unmapped",
    "Entity-resolution evidence",
    "ZIPs have retained candidate evidence",
    "ZIPs have no resolution decision",
    "Candidate groups are not applied business merges",
    "Source quality gaps",
    "address rows lack an eligible ZIP5",
    "not missing-business counts",
    "Governed release provenance",
    "Matrix release",
    "Temporal qualification",
    "Geography cohort",
    "Resolution evidence",
    "Industries outside these {view.source_dimensions} dimensions are unavailable",
    "not an authoritative current USPS denominator or all-business completeness",
    "Source dimensions overlap and are not additive",
    "Current operation is not independently verified",
  ])
    assert.match(source, new RegExp(phrase));
  assert.match(
    source,
    /\{industries \? \(\s*<>\s*<GovernedIndustryStatus \/>/,
  );
  assert.equal(
    source.match(/<ExactZipIndustryNationalSummary \/>/g)?.length,
    1,
  );
});
