import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import registration from "../config/datasets/national-business-lifecycle-industry-jurisdiction-evidence.json" with { type: "json" };
import supplementalRegistration from "../config/datasets/national-irs-eo-supplemental-industry-evidence.json" with { type: "json" };
const require = createRequire(import.meta.url),
  source = await readFile(
    new URL(
      "../app/lifecycle-industry-jurisdiction-panel.tsx",
      import.meta.url,
    ),
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
  rows = JSON.parse(
    await readFile(
      new URL(
        `../${registration.retained_release.manifest.replace(/manifest\.json$/, "jurisdictions.json")}`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  mn = rows.find((row) => row.postal_abbreviation === "MN");
const release = {
    release_id: registration.retained_release.release_id,
    registration_sha256:
      "fee5ead43901852b940c4df492de8f0b5fda51f91c9e5fb7305c1ec0199d3f38",
    manifest_sha256: registration.retained_release.manifest_sha256,
    artifact_sha256: registration.retained_release.artifact_sha256,
    exact_zip_manifest_sha256:
      "830eaec18ee614250e9234386e6fb897a4891e67a2188b6bf39bf16a03e15f4c",
    jurisdiction_manifest_sha256:
      "d2f2114dfdbf6788eea0dd2335c9a9383673d61baf557486ebd2e8aba7ffbf41",
    jurisdiction_artifact_sha256:
      "d29f7047dfe713fd9e95ede930edd0d2642eaa59158e3d2398ee3d5945658c84",
    epa_manifest_sha256:
      "bb154192843c65ccb7723259c6fda50725a2c7c9e4999477608b61f1fd716dc7",
    epa_zip_artifact_sha256:
      "f47b129512c75389897c44b849ca89da0926d4269aad39ae67d80008cb4fa266",
  },
  index = (row) => ({
    scope_id: row.scope_id,
    state_fips: row.state_fips,
    state_name: row.state_name,
    postal_abbreviation: row.postal_abbreviation,
  }),
  scopeOrder = [
    "multi-state-material",
    "zcta-overlay-unresolved",
    "non-zcta-unassigned",
    "explicit-placeholder",
  ],
  summaryView = {
    schema_version:
      "national-business-lifecycle-industry-jurisdiction-evidence-runtime-summary@1.1.0",
    release,
    summary: manifest.summary,
    scopes: {
      states: rows
        .filter((row) => row.scope_kind === "state")
        .sort((a, b) => a.state_fips.localeCompare(b.state_fips))
        .map(index),
      territories: rows
        .filter((row) => row.scope_kind === "territory")
        .sort((a, b) => a.state_fips.localeCompare(b.state_fips))
        .map(index),
      special: scopeOrder.map((scope_id) => {
        const row = rows.find((item) => item.scope_id === scope_id);
        return { scope_id, scope_label: row.scope_label };
      }),
    },
    claims: manifest.claims,
  },
  lookup = {
    schema_version:
      "national-business-lifecycle-industry-jurisdiction-evidence-runtime-lookup@1.1.0",
    release,
    status: "governed-source-relative-industry-memberships",
    scope: mn,
    claims: manifest.claims,
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
  supplementalMn = supplementalScopes.find(
    (row) => row.postal_abbreviation === "MN",
  ),
  supplementalReportedMn = supplementalReported.find(
    (row) => row.reported_filing_address_jurisdiction === "MN",
  ),
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
        .map(index),
      territories: supplementalScopes
        .filter((row) => row.scope_kind === "territory")
        .sort((a, b) => a.state_fips.localeCompare(b.state_fips))
        .map(index),
      special: scopeOrder.map((scope_id) => {
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
      "national-irs-eo-supplemental-industry-evidence-runtime-jurisdiction@1.0.0",
    release: supplementalRelease,
    refresh: supplementalRefresh,
    status: "governed-supplemental-memberships",
    scope: supplementalMn,
    reported_filing_address_comparison: {
      comparison_kind: "separate-marginals-not-record-linkage",
      reported_filing_address_jurisdiction: "MN",
      governed_geography_membership_count:
        supplementalMn.organization_membership_count,
      reported_filing_address_membership_count:
        supplementalReportedMn.organization_membership_count,
    },
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
  const render = (props) => {
    cursor = 0;
    return exports.default(props);
  };
  const mount = async (props) => {
    render(props);
    mounted = true;
    for (const effect of effects) effect();
    effects = [];
    await Promise.allSettled(pending);
    await flush();
    return render(props);
  };
  const remount = async (props) => {
    mounted = false;
    return mount(props);
  };
  return { exports, states, mount, remount };
}
test("v1.1 validators pin rich ordered sources and conserve non-disjoint assignments", () => {
  const h = moduleWith();
  assert.equal(h.exports.validLifecycleIndustrySummary(summaryView), true);
  assert.equal(h.exports.validLifecycleIndustryLookup(lookup, "MN"), true);
  assert.ok(mn.industry_assignment_count > mn.mapped_source_record_union_count);
  for (const mutate of [
    (v) => {
      v.summary.industry_assignment_count =
        v.summary.mapped_source_record_union_count;
    },
    (v) => {
      v.summary.epa_refinement.partially_unmapped_record_count =
        v.summary.epa_refinement.mapped_source_record_union_count + 1;
    },
    (v) => {
      v.scopes.special.reverse();
    },
    (v) => {
      v.claims.industry_completeness = 100;
    },
    (v) => {
      v.release.artifact_sha256 = "0".repeat(64);
    },
  ]) {
    const changed = structuredClone(summaryView);
    mutate(changed);
    assert.equal(h.exports.validLifecycleIndustrySummary(changed), false);
  }
  for (const mutate of [
    (v) => {
      v.scope.mapped_source_record_union_count++;
    },
    (v) => {
      v.scope.industries[0].sources.reverse();
    },
    (v) => {
      v.scope.industries[0].sources[0].lifecycle_evidence_assignment_counts
        .unknown++;
    },
    (v) => {
      v.scope.epa_refinement.multisegment_record_count =
        v.scope.epa_refinement.mapped_source_record_union_count + 1;
    },
    (v) => {
      v.scope.unmapped_sources[0].source_membership_count++;
    },
    (v) => {
      v.scope.postal_abbreviation = "WI";
    },
    (v) => {
      v.claims.current_operation_verified = true;
    },
  ]) {
    const changed = structuredClone(lookup);
    mutate(changed);
    assert.equal(h.exports.validLifecycleIndustryLookup(changed, "MN"), false);
  }
});
test("IRS supplemental validators pin filing-only stale evidence without changing lifecycle assignments", () => {
  const h = moduleWith();
  assert.equal(
    h.exports.validIrsEoSupplementalJurisdictionSummary(supplementalSummary),
    true,
  );
  assert.equal(
    h.exports.validIrsEoSupplementalJurisdictionLookup(
      supplementalLookup,
      "MN",
    ),
    true,
  );
  for (const mutate of [
    (v) => {
      v.refresh.newer_edition_observed_not_collected = false;
    },
    (v) => {
      v.claims.physical_site_verified = true;
    },
    (v) => {
      v.summary.lifecycle_base_changed = true;
    },
    (v) => {
      v.release.refresh_assessment_sha256 = "0".repeat(64);
    },
  ]) {
    const changed = structuredClone(supplementalSummary);
    mutate(changed);
    assert.equal(
      h.exports.validIrsEoSupplementalJurisdictionSummary(changed),
      false,
    );
  }
  for (const mutate of [
    (v) => {
      v.scope.organization_membership_count++;
    },
    (v) => {
      v.scope.review_status = "within-review-window";
    },
    (v) => {
      v.reported_filing_address_comparison.comparison_kind = "record-linkage";
    },
    (v) => {
      v.claims.additive_to_business_or_industry_totals = true;
    },
  ]) {
    const changed = structuredClone(supplementalLookup);
    mutate(changed);
    assert.equal(
      h.exports.validIrsEoSupplementalJurisdictionLookup(changed, "MN"),
      false,
    );
  }
});
test("panel shows nine rows, maintenance independence, allocation context, EPA overlap, and FSIS residual", async () => {
  const calls = [],
    props = {
      maintainedIndustries: ["construction", "health-care"],
      maintenanceAvailable: true,
    },
    h = moduleWith(async (url) => {
      calls.push(url);
      if (url.includes("irs-eo") && url.includes("summary"))
        return structuredClone(supplementalSummary);
      if (url.includes("irs-eo")) return structuredClone(supplementalLookup);
      return url.includes("summary")
        ? structuredClone(summaryView)
        : structuredClone(lookup);
    });
  await h.mount(props);
  h.states[2] = "MN";
  const rendered = text(await h.remount(props));
  assert.ok(
    calls.includes("/api/business-map/lifecycle-industry-jurisdiction-summary"),
  );
  assert.ok(
    calls.includes("/api/business-map/irs-eo-supplemental-industry-summary"),
  );
  assert.ok(
    calls.includes(
      "/api/business-map/irs-eo-supplemental-industry-jurisdiction?state=MN",
    ),
  );
  assert.ok(
    calls.includes(
      "/api/business-map/lifecycle-industry-jurisdiction?state=MN",
    ),
  );
  assert.match(
    rendered,
    /6,780,627 distinct mapped source records · 6,782,745 overlapping industry assignments · 1,230,586 unresolved source records/,
  );
  assert.match(
    rendered,
    /Territories remain five separate scopes: AS, GU, MP, PR, VI/,
  );
  for (const row of summaryView.scopes.special)
    assert.match(rendered, new RegExp(row.scope_label));
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
  assert.match(rendered, /ConstructionSelected for maintenance345/);
  assert.match(
    rendered,
    /Tax-exempt organizationsNot selected — retained evidence remains visible00 lifecycle assignments. 38,608 supplemental IRS current-extract EIN organization memberships · filing address only · non-active reporting · stale review. Newer edition observed, not collected/,
  );
  assert.match(
    rendered,
    /1,955,841 current-extract EIN organization memberships · filing addresses only · non-active reporting · stale review/,
  );
  assert.match(rendered, /separate marginals, not record linkage/);
  assert.match(
    rendered,
    /118,825 distinct mapped records · 118,844 overlapping industry assignments · 30,068 unresolved source records/,
  );
  assert.match(
    rendered,
    /3,464 distinct records with a segment · 3,483 assignments · 19 multisegment · 257 partially unmapped · 29,882 with no mapped segment/,
  );
  assert.match(rendered, /FSIS residual: 186 retained records remain outside/);
  assert.match(
    rendered,
    /regulated food-safety cohort, not the retail-consumer operational segment/,
  );
  assert.match(
    rendered,
    /No unique-business count, completeness percentage, verified current operation/,
  );
});
test("maintenance availability and endpoint failures stay isolated", async () => {
  const unavailable = { maintainedIndustries: [], maintenanceAvailable: false },
    good = moduleWith(async (url) => {
      if (url.includes("irs-eo") && url.includes("summary"))
        return structuredClone(supplementalSummary);
      if (url.includes("irs-eo")) return structuredClone(supplementalLookup);
      return url.includes("summary")
        ? structuredClone(summaryView)
        : structuredClone(lookup);
    });
  await good.mount(unavailable);
  good.states[2] = "MN";
  assert.match(
    text(await good.remount(unavailable)),
    /Maintenance intent unavailable — retained evidence remains visible/,
  );
  const supplementalFailed = moduleWith(async (url) => {
    if (url.includes("irs-eo")) throw Error("supplemental offline");
    return url.includes("summary")
      ? structuredClone(summaryView)
      : structuredClone(lookup);
  });
  await supplementalFailed.mount(unavailable);
  supplementalFailed.states[2] = "MN";
  const isolated = text(await supplementalFailed.remount(unavailable));
  assert.match(
    isolated,
    /IRS EO supplemental evidence for MN is unavailable. Lifecycle industry status remains available/,
  );
  assert.match(isolated, /Retail \/ consumer/);
  assert.match(
    isolated,
    /Tax-exempt organizationsMaintenance intent unavailable — retained evidence remains visible00 lifecycle assignments/,
  );
  const failed = moduleWith(async () => {
    throw Error("offline");
  });
  await failed.mount(unavailable);
  failed.states[2] = "MN";
  const rendered = text(await failed.remount(unavailable));
  assert.match(rendered, /National industry-lifecycle context is unavailable/);
  assert.match(
    rendered,
    /Lifecycle-by-industry evidence for MN is unavailable/,
  );
  assert.equal(
    (
      rendered.match(
        /Existing Industry Status and maintenance controls remain available/g,
      ) ?? []
    ).length,
    2,
  );
});
