import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import registration from "../config/datasets/national-business-lifecycle-industry-zip-evidence.json" with { type: "json" };
import supplementalRegistration from "../config/datasets/national-irs-eo-supplemental-industry-evidence.json" with { type: "json" };
const require = createRequire(import.meta.url),
  source = await readFile(
    new URL("../app/lifecycle-industry-zip-panel.tsx", import.meta.url),
    "utf8",
  ),
  intelligence = await readFile(
    new URL("../app/business-intelligence.tsx", import.meta.url),
    "utf8",
  ),
  code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText,
  manifest = JSON.parse(
    await readFile(
      new URL(`../${registration.retained_release.manifest}`, import.meta.url),
      "utf8",
    ),
  ),
  summary = JSON.parse(
    await readFile(
      new URL(
        `../${registration.retained_release.manifest.replace(/manifest\.json$/, "summary.json")}`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  partition = manifest.artifacts.find((row) => row.path === "zip2=01.jsonl.gz"),
  rows = gunzipSync(
    await readFile(
      new URL(
        `../${registration.retained_release.manifest.replace(/manifest\.json$/, partition.path)}`,
        import.meta.url,
      ),
    ),
  )
    .toString("utf8")
    .trim()
    .split("\n")
    .map(JSON.parse),
  row = rows.find((item) => item.zip5 === "01020");
const release = {
    release_id: registration.retained_release.release_id,
    registration_sha256:
      "76a81b1ba71034ea54fd9496f046716664a114bcf443c4c7b2e629fd569abf88",
    manifest_sha256: registration.retained_release.manifest_sha256,
    summary_sha256:
      "3e7f2aa71166c48dbce6fb0ef47d942afcb0f3dbe27febfa070bdfbfd13ac486",
    epa_manifest_sha256:
      "bb154192843c65ccb7723259c6fda50725a2c7c9e4999477608b61f1fd716dc7",
    epa_zip_artifact_sha256:
      "f47b129512c75389897c44b849ca89da0926d4269aad39ae67d80008cb4fa266",
  },
  summaryView = {
    schema_version:
      "national-business-lifecycle-industry-zip-evidence-runtime-summary@1.1.0",
    release,
    summary,
    claims: registration.claims,
  },
  lookup = {
    schema_version:
      "national-business-lifecycle-industry-zip-evidence-runtime-lookup@1.1.0",
    release,
    partition: { path: partition.path, sha256: partition.sha256 },
    zip5: "01020",
    status: "governed-source-relative-industry-memberships",
    row,
    claims: registration.claims,
  };
const supplementalManifest = JSON.parse(
    await readFile(
      new URL(
        `../${supplementalRegistration.retained_release.manifest}`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  supplementalBase = supplementalRegistration.retained_release.manifest.replace(
    /manifest\.json$/,
    "",
  ),
  supplementalSummaryArtifact = JSON.parse(
    await readFile(
      new URL(`../${supplementalBase}national-summary.json`, import.meta.url),
      "utf8",
    ),
  ),
  supplementalScopes = JSON.parse(
    await readFile(
      new URL(
        `../${supplementalBase}geography-disposition-scopes.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  supplementalReported = JSON.parse(
    await readFile(
      new URL(
        `../${supplementalBase}reported-jurisdictions.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  supplementalPartition = supplementalManifest.artifacts.find(
    (item) => item.path === "zip2=01.jsonl.gz",
  ),
  supplementalRows = gunzipSync(
    await readFile(
      new URL(
        `../${supplementalBase}${supplementalPartition.path}`,
        import.meta.url,
      ),
    ),
  )
    .toString("utf8")
    .trim()
    .split("\n")
    .map(JSON.parse),
  supplementalRow = supplementalRows.find((item) => item.zip5 === "01020"),
  supplementalRelease = {
    release_id: supplementalRegistration.retained_release.release_id,
    registration_sha256:
      "09fcf954fd84f622adc08e736d517b594ae760992e9964ac6c3c17183dfd9029",
    manifest_sha256: supplementalRegistration.retained_release.manifest_sha256,
    scope_artifact_sha256:
      "c65867324217a85fa7c47235f1056e67e2ae1fa7eb1e475282912a1ef3053d95",
    reported_jurisdictions_artifact_sha256:
      "12be8e625923b4d97773a202f057713f06c72feaa570846853a5cd3c134db53d",
    summary_artifact_sha256:
      "3875515521d403de10629707015071b3ebabb9db374f40856dcc6a26c6b84e4d",
    source_manifest_sha256:
      "999233d73e42eac72a094d1248d6790680d39d276c3a9e849a496d01ed5288f8",
    overlay_manifest_sha256:
      "3fadc44772bcf2166d5e777d268028f3427342f7bfd0aab0a7706b92058581ce",
    jurisdiction_manifest_sha256:
      "d2f2114dfdbf6788eea0dd2335c9a9383673d61baf557486ebd2e8aba7ffbf41",
    jurisdiction_artifact_sha256:
      "d29f7047dfe713fd9e95ede930edd0d2642eaa59158e3d2398ee3d5945658c84",
    refresh_assessment_sha256:
      "61c5dbfec39137eeea10945dd4a2b167da8d9e955611f71a3512df8f4f3520a5",
  },
  supplementalRefresh = {
    selected_source_posting_date: "2026-08-11",
    assessment_as_of: "2026-11-12",
    review_status: "stale",
    selected_release_stale: true,
    newer_edition_observed: true,
    newer_edition_observed_not_collected: true,
    observed_posting_date: "2026-10-13",
    observed_source_page_claimed_records: 1975975,
    observed_records_downloaded: 0,
    observed_count_is_not_net_organization_creation: true,
  },
  supplementalIndex = (row) => ({
    scope_id: row.scope_id,
    state_fips: row.state_fips,
    state_name: row.state_name,
    postal_abbreviation: row.postal_abbreviation,
  }),
  supplementalSpecial = [
    "multi-state-material",
    "zcta-overlay-unresolved",
    "non-zcta-unassigned",
    "explicit-placeholder",
  ],
  supplementalSummary = {
    schema_version:
      "national-irs-eo-supplemental-industry-evidence-runtime-summary@1.0.0",
    release: supplementalRelease,
    refresh: supplementalRefresh,
    summary: supplementalSummaryArtifact,
    scopes: {
      states: supplementalScopes
        .filter((row) => row.scope_kind === "state")
        .sort((a, b) => a.state_fips.localeCompare(b.state_fips))
        .map(supplementalIndex),
      territories: supplementalScopes
        .filter((row) => row.scope_kind === "territory")
        .sort((a, b) => a.state_fips.localeCompare(b.state_fips))
        .map(supplementalIndex),
      special: supplementalSpecial.map((scope_id) => {
        const row = supplementalScopes.find(
          (item) => item.scope_id === scope_id,
        );
        return { scope_id, scope_label: row.scope_label };
      }),
    },
    reported_filing_address_jurisdictions: supplementalReported.map((row) => ({
      reported_filing_address_jurisdiction:
        row.reported_filing_address_jurisdiction,
      organization_membership_count: row.organization_membership_count,
    })),
    claims: supplementalManifest.claims,
  },
  supplementalLookup = {
    schema_version:
      "national-irs-eo-supplemental-industry-evidence-runtime-zip@1.0.0",
    release: supplementalRelease,
    refresh: supplementalRefresh,
    partition: {
      path: supplementalPartition.path,
      sha256: supplementalPartition.sha256,
    },
    zip5: "01020",
    status: "governed-supplemental-memberships",
    row: supplementalRow,
    claims: supplementalManifest.claims,
  };
const jsx = (type, props) => ({ type, props: props ?? {} }),
  text = (tree) =>
    tree == null || typeof tree === "boolean"
      ? ""
      : typeof tree !== "object"
        ? String(tree)
        : Array.isArray(tree)
          ? tree.map(text).join("")
          : typeof tree.type === "function"
            ? text(tree.type(tree.props))
            : text(tree.props?.children),
  flush = () => new Promise((resolve) => setImmediate(resolve));
function moduleWith(
  request = async () => {
    throw Error("unexpected");
  },
) {
  const exports = {},
    states = [],
    pending = [];
  let cursor = 0,
    mounted = false,
    effects = [];
  const react = {
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          (value) => {
            states[i] = typeof value === "function" ? value(states[i]) : value;
          },
        ];
      },
      useEffect(effect) {
        if (!mounted) effects.push(effect);
      },
    },
    runnerJson = (...args) => {
      const operation = Promise.resolve().then(() => request(...args));
      pending.push(operation);
      return operation;
    };
  runInNewContext(code, {
    exports,
    module: { exports },
    require: (id) =>
      id === "react"
        ? react
        : id === "react/jsx-runtime"
          ? { jsx, jsxs: jsx, Fragment: "fragment" }
          : id === "./runner-client"
            ? { runnerJson }
            : id === "./state-registration-license-supplemental"
              ? { __esModule: true, default: () => jsx("article", {}) }
            : require(id),
    AbortController,
    encodeURIComponent,
  });
  const render = (zip5) => {
    cursor = 0;
    return exports.default({ zip5 });
  };
  const mount = async (zip5) => {
    render(zip5);
    mounted = true;
    for (const effect of effects) effect();
    effects = [];
    await Promise.allSettled(pending);
    await flush();
    return render(zip5);
  };
  return { exports, mount };
}
const zeroRow = (zip5) => {
  const v = structuredClone(row);
  v.zip5 = zip5;
  v.cohort_classification = "denominator-only-outside-zcta";
  v.source_membership_count =
    v.mapped_source_record_union_count =
    v.unresolved_source_record_count =
    v.industry_assignment_count =
      0;
  for (const key of Object.keys(v.lifecycle_evidence_counts))
    v.lifecycle_evidence_counts[key] = v.review_status_counts[key] ?? 0;
  for (const key of Object.keys(v.lifecycle_evidence_counts))
    v.lifecycle_evidence_counts[key] = 0;
  for (const key of Object.keys(v.review_status_counts))
    v.review_status_counts[key] = 0;
  v.unmapped_sources = [];
  for (const x of v.industries) {
    x.source_assignment_count = 0;
    x.sources = [];
    for (const key of Object.keys(x.lifecycle_evidence_assignment_counts))
      x.lifecycle_evidence_assignment_counts[key] = 0;
    for (const key of Object.keys(x.review_status_assignment_counts))
      x.review_status_assignment_counts[key] = 0;
  }
  const e = v.epa_refinement;
  e.source_record_count =
    e.mapped_source_record_union_count =
    e.industry_assignment_count =
    e.multisegment_record_count =
    e.partially_unmapped_record_count =
    e.unresolved_source_record_count =
      0;
  for (const key of Object.keys(e.segment_assignment_counts))
    e.segment_assignment_counts[key] = 0;
  for (const key of Object.keys(e.lifecycle_evidence_counts))
    e.lifecycle_evidence_counts[key] = 0;
  for (const key of Object.keys(e.review_status_counts))
    e.review_status_counts[key] = 0;
  return v;
};
test("v1.1 validators pin release and accept assignments above mapped-record union while enforcing overlap bounds", () => {
  const h = moduleWith();
  assert.equal(h.exports.validLifecycleIndustryZipSummary(summaryView), true);
  assert.equal(
    summary.industry_assignment_count >
      summary.mapped_source_record_union_count,
    true,
  );
  assert.equal(
    h.exports.validLifecycleIndustryZipLookup(lookup, "01020"),
    true,
  );
  assert.equal(
    row.industry_assignment_count > row.mapped_source_record_union_count,
    true,
  );
  for (const mutate of [
    (v) => {
      v.summary.industry_assignment_count =
        v.summary.mapped_source_record_union_count;
    },
    (v) => {
      v.summary.epa_refinement.records_partially_unmapped =
        v.summary.epa_refinement.records_with_segment + 1;
    },
    (v) => {
      v.summary.industry_assignment_counts.construction++;
    },
    (v) => {
      v.claims.industry_assignments_additive = true;
    },
    (v) => {
      v.release.epa_zip_artifact_sha256 = "0".repeat(64);
    },
  ]) {
    const changed = structuredClone(summaryView);
    mutate(changed);
    assert.equal(h.exports.validLifecycleIndustryZipSummary(changed), false);
  }
  for (const mutate of [
    (v) => {
      v.row.mapped_source_record_union_count++;
    },
    (v) => {
      v.row.industry_assignment_count = v.row.mapped_source_record_union_count;
    },
    (v) => {
      v.row.epa_refinement.partially_unmapped_record_count =
        v.row.epa_refinement.mapped_source_record_union_count + 1;
    },
    (v) => {
      v.row.epa_refinement.multisegment_record_count =
        v.row.epa_refinement.mapped_source_record_union_count + 1;
    },
    (v) => {
      v.row.industries[0].source_assignment_count++;
    },
    (v) => {
      v.claims.unique_business_count = 1;
    },
  ]) {
    const changed = structuredClone(lookup);
    mutate(changed);
    assert.equal(
      h.exports.validLifecycleIndustryZipLookup(changed, "01020"),
      false,
    );
  }
});
test("IRS supplemental ZIP validators enforce filing-only stale non-additive evidence", () => {
  const h = moduleWith();
  assert.equal(
    h.exports.validIrsEoSupplementalZipSummary(supplementalSummary),
    true,
  );
  assert.equal(
    h.exports.validIrsEoSupplementalZipLookup(supplementalLookup, "01020"),
    true,
  );
  for (const mutate of [
    (v) => {
      v.refresh.newer_edition_observed_not_collected = false;
    },
    (v) => {
      v.summary.lifecycle_base_changed = true;
    },
    (v) => {
      v.claims.current_operation_verified = true;
    },
    (v) => {
      v.release.source_manifest_sha256 = "0".repeat(64);
    },
  ]) {
    const changed = structuredClone(supplementalSummary);
    mutate(changed);
    assert.equal(h.exports.validIrsEoSupplementalZipSummary(changed), false);
  }
  for (const mutate of [
    (v) => {
      v.row.filing_address_only = false;
    },
    (v) => {
      v.row.review_status = "within-review-window";
    },
    (v) => {
      v.row.zip4 = "1234";
    },
    (v) => {
      v.claims.additive_to_business_or_industry_totals = true;
    },
  ]) {
    const changed = structuredClone(supplementalLookup);
    mutate(changed);
    assert.equal(
      h.exports.validIrsEoSupplementalZipLookup(changed, "01020"),
      false,
    );
  }
});
test("v1.1 panel shows nine overlapping rows and distinct EPA union, assignment, multisegment, partial and FSIS context", async () => {
  const calls = [],
    h = moduleWith(async (url) => {
      calls.push(url);
      if (url.includes("irs-eo") && url.includes("summary"))
        return structuredClone(supplementalSummary);
      if (url.includes("irs-eo")) return structuredClone(supplementalLookup);
      return url.includes("summary")
        ? structuredClone(summaryView)
        : structuredClone(lookup);
    }),
    rendered = text(await h.mount("01020"));
  assert.deepEqual(calls, [
    "/api/business-map/lifecycle-industry-zip-summary",
    "/api/business-map/irs-eo-supplemental-industry-summary",
    "/api/business-map/lifecycle-industry-zip?zip=01020",
    "/api/business-map/irs-eo-supplemental-industry-zip?zip=01020",
  ]);
  for (const label of [
    "Retail / consumer",
    "Health care",
    "Financial services",
    "Transportation",
    "Construction",
    "Tax-exempt organizations",
    "Sales-tax outlets",
    "Local business licenses",
    "Childcare",
  ])
    assert.match(rendered, new RegExp(label));
  assert.match(rendered, /Industry memberships \(overlapping\)/);
  assert.match(
    rendered,
    /6,780,627 distinct mapped source records · 6,782,745 overlapping industry assignments · 1,230,586 unresolved source records/,
  );
  assert.match(
    rendered,
    /54 distinct records with a mapped segment · 55 record-to-segment assignments · 1 multisegment records · 3 partially-unmapped records · 90 records with no mapped segment/,
  );
  assert.match(rendered, /overlapping subsets of the EPA mapped-record union/);
  assert.match(rendered, /FSIS residual/);
  assert.match(
    rendered,
    /Tax-exempt organizations00 lifecycle assignments. 102 supplemental IRS current-extract EIN organization memberships · filing address only · non-active reporting · stale review. Newer edition observed, not collected/,
  );
  assert.match(
    rendered,
    /1,955,841 current-extract EIN organization memberships · filing addresses only · non-active reporting · stale review/,
  );
  assert.match(rendered, /Industry assignments overlap and must not be summed/);
  assert.match(
    rendered,
    /not unique businesses, completeness, verified current operation, physical sites, or an active-business numerator/,
  );
});
test("v1.1 preserves governed zero, outside cohort, and isolated failure states", async () => {
  const zero = {
      ...structuredClone(lookup),
      zip5: "99999",
      partition: { path: "zip2=99.jsonl.gz", sha256: "b".repeat(64) },
      status: "governed-zero-profile",
      row: zeroRow("99999"),
    },
    supplementalZero = {
      ...structuredClone(supplementalLookup),
      zip5: "99999",
      partition: { path: "zip2=99.jsonl.gz", sha256: "d".repeat(64) },
      status: "governed-zero-supplemental-memberships",
      row: {
        ...structuredClone(supplementalRow),
        zip5: "99999",
        organization_membership_count: 0,
      },
    },
    zeroText = text(
      await moduleWith(async (url) => {
        if (url.includes("irs-eo") && url.includes("summary"))
          return supplementalSummary;
        if (url.includes("irs-eo")) return supplementalZero;
        return url.includes("summary") ? summaryView : zero;
      }).mount("99999"),
    );
  assert.match(zeroText, /Governed explicit zero-profile row/);
  assert.equal(
    (
      zeroText.match(
        /No governed lifecycle memberships assigned to this industry in this layer/g,
      ) ?? []
    ).length,
    8,
  );
  assert.match(
    zeroText,
    /Tax-exempt organizations00 lifecycle assignments. 0 supplemental IRS current-extract EIN organization memberships/,
  );
  const outside = {
      ...structuredClone(lookup),
      zip5: "99998",
      partition: { path: "zip2=99.jsonl.gz", sha256: "c".repeat(64) },
      status: "outside-governed-cohort",
      row: null,
    },
    supplementalOutside = {
      ...structuredClone(supplementalLookup),
      zip5: "99998",
      partition: { path: "zip2=99.jsonl.gz", sha256: "e".repeat(64) },
      status: "outside-governed-cohort",
      row: null,
    },
    outsideText = text(
      await moduleWith(async (url) => {
        if (url.includes("irs-eo") && url.includes("summary"))
          return supplementalSummary;
        if (url.includes("irs-eo")) return supplementalOutside;
        return url.includes("summary") ? summaryView : outside;
      }).mount("99998"),
    );
  assert.match(outsideText, /outside the governed cohort/);
  assert.match(outsideText, /not a supplemental zero/);
  const supplementalFailed = text(
    await moduleWith(async (url) => {
      if (url.includes("irs-eo")) throw Error("supplemental offline");
      return url.includes("summary") ? summaryView : lookup;
    }).mount("01020"),
  );
  assert.match(
    supplementalFailed,
    /IRS EO supplemental evidence for ZIP 01020 is unavailable. Lifecycle industry status remains available/,
  );
  assert.match(supplementalFailed, /Retail \/ consumer/);
  assert.match(
    supplementalFailed,
    /Tax-exempt organizations00 lifecycle assignments/,
  );
  const failed = text(
    await moduleWith(async () => {
      throw Error("offline");
    }).mount("99998"),
  );
  assert.match(failed, /National industry lifecycle context is unavailable/);
  assert.match(
    failed,
    /Industry lifecycle evidence for ZIP 99998 is unavailable/,
  );
  assert.equal(
    (failed.match(/Other exact-ZIP evidence remains available/g) ?? []).length,
    2,
  );
});
test("Business Intelligence still mounts the panel from inspectionZip after base lifecycle evidence", () => {
  const base = intelligence.indexOf(
      "<LifecycleZipEvidencePanel zip5={inspectionZip} />",
    ),
    next = intelligence.indexOf(
      "<LifecycleIndustryZipPanel zip5={inspectionZip} />",
    ),
    quality = intelligence.indexOf("{zipQuality &&", next);
  assert.ok(base >= 0 && next > base && quality > next);
});
