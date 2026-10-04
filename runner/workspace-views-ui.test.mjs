import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url),
  code = await readFile(
    new URL("../app/workspace-views.tsx", import.meta.url),
    "utf8",
  );
const pageCode = await readFile(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);
const childcarePin = JSON.parse(
  await readFile(
    new URL(
      "../config/datasets/retained-childcare-zip-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
).retained_release;
const nativeStatusRegistration = JSON.parse(
  await readFile(
    new URL(
      "../config/datasets/zip-source-native-status-distribution.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const nativeStatusPin = nativeStatusRegistration.retained_release;
const exactZipMatrixRegistration = JSON.parse(
  await readFile(
    new URL(
      "../config/datasets/national-exact-zip-industry-evidence-matrix.json",
      import.meta.url,
    ),
    "utf8",
  ),
),
  exactZipMatrixManifest = JSON.parse(
    await readFile(
      new URL(`../${exactZipMatrixRegistration.retained_release.manifest}`, import.meta.url),
      "utf8",
    ),
  );
const nodes = (t) =>
  !t || typeof t !== "object"
    ? []
    : Array.isArray(t)
      ? t.flatMap(nodes)
      : [t, ...nodes(t.props?.children)];
const text = (t) =>
  t == null || typeof t === "boolean"
    ? ""
    : typeof t !== "object"
      ? String(t)
      : Array.isArray(t)
        ? t.map(text).join("")
        : text(t.props?.children);
function harness(request, sourceCode = code) {
  const values = [],
    effects = [],
    cleanup = [],
    deps = [];
  let cursor = 0,
    effectCursor = 0;
  const exports = {},
    focused = [];
  runInNewContext(
    ts.transpileModule(sourceCode, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      AbortController,
      URLSearchParams,
      document: { getElementById: (id) => ({ focus: () => focused.push(id) }) },
      require: (name) =>
        name === "../config/datasets/retained-childcare-zip-evidence.json"
          ? { default: { retained_release: childcarePin } }
          : name ===
              "../config/datasets/zip-source-native-status-distribution.json"
            ? { default: nativeStatusRegistration }
            : name === "./runner-client"
              ? { runnerJson: request }
              : name === "./business-intelligence"
                ? { StateAvailabilityChoropleth: () => null }
                : name.startsWith("./census-")
                  ? { default: () => null }
                  : name.startsWith("./")
                    ? {}
                    : name === "react"
                      ? {
                          useMemo: (fn) => fn(),
                          useState: (initial) => {
                            const n = cursor++;
                            if (!(n in values)) values[n] = initial;
                            return [values[n], (v) => (values[n] = v)];
                          },
                          useEffect: (effect, nextDeps) => {
                            const n = effectCursor++;
                            if (
                              !deps[n] ||
                              nextDeps.some(
                                (value, index) => value !== deps[n][index],
                              )
                            ) {
                              deps[n] = nextDeps;
                              effects.push(() => {
                                cleanup[n]?.();
                                cleanup[n] = effect();
                              });
                            }
                          },
                        }
                      : require(name),
    },
  );
  return {
    focused,
    render: (name, props = {}, ...args) => {
      cursor = 0;
      effectCursor = 0;
      const tree = exports[name](props, ...args);
      effects.splice(0).forEach((effect) => effect());
      return tree;
    },
    close: () => cleanup.forEach((fn) => fn?.()),
  };
}
function pageHarness() {
  const values = [];
  let cursor = 0;
  const exports = {};
  const marker = (name) =>
    Object.defineProperty(
      function () {
        return null;
      },
      "name",
      { value: name },
    );
  const WorkspaceTabs = marker("WorkspaceTabs"),
    OperationsTabs = marker("OperationsTabs"),
    CoverageWorkspace = marker("CoverageWorkspace"),
    ZipEconomyWorkspace = marker("ZipEconomyWorkspace"),
    DataOperations = marker("DataOperations"),
    ConnectorCatalog = marker("ConnectorCatalog"),
    BusinessIntelligence = marker("BusinessIntelligence"),
    CoverageExplorer = marker("CoverageExplorer"),
    BenchmarkReview = marker("BenchmarkReview");
  const workspaceViews = {
    workspaceTabs: [
      "State Completion",
      "Industry Summary",
      "ZIP Economics",
      "Operations",
    ],
    operationsTabs: ["Jobs", "Collection", "Evidence", "Connectors"],
    WorkspaceTabs,
    OperationsTabs,
    CoverageWorkspace,
    ZipEconomyWorkspace,
  };
  const react = {
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (initial) => ({ current: initial }),
    useState: (initial) => {
      const n = cursor++;
      if (!(n in values))
        values[n] = typeof initial === "function" ? initial() : initial;
      return [
        values[n],
        (next) =>
          (values[n] = typeof next === "function" ? next(values[n]) : next),
      ];
    },
    useEffect: () => {},
  };
  runInNewContext(
    ts.transpileModule(pageCode, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      AbortController,
      Blob,
      URL,
      document: { createElement: () => ({ click() {} }) },
      window: { requestAnimationFrame: (callback) => callback() },
      require: (name) =>
        name === "react"
          ? react
          : name === "./workspace-views"
            ? workspaceViews
            : name === "./data-operations"
              ? { default: DataOperations }
              : name === "./connector-catalog"
                ? { default: ConnectorCatalog }
                : name === "./business-intelligence"
                  ? { default: BusinessIntelligence }
                  : name === "./coverage-explorer"
                    ? { default: CoverageExplorer }
                    : name === "./benchmark-review"
                      ? { default: BenchmarkReview }
                      : name === "./text-size-control"
                        ? { default: marker("TextSizeControl") }
                        : name === "./runner-client"
                          ? {
                              downloadRunnerArtifact: async () => ({}),
                              runnerJson: async () => ({}),
                            }
                          : require(name),
    },
  );
  return {
    render: () => {
      cursor = 0;
      return exports.default();
    },
  };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const broadDimensions = {
  broad_org_co_organization_addresses: {
    scope: "CO",
    kind: "organization",
    measure: "organization_address_rows",
    unit: "organization address rows",
  },
  broad_org_ct_organization_addresses: {
    scope: "CT",
    kind: "organization",
    measure: "organization_address_rows",
    unit: "organization address rows",
  },
  broad_org_de_license_addresses: {
    scope: "DE",
    kind: "organization",
    measure: "license_address_rows",
    unit: "license address rows",
  },
  broad_org_fl_organization_addresses: {
    scope: "FL",
    kind: "organization",
    measure: "organization_address_rows",
    unit: "organization address rows",
  },
  broad_org_ia_organization_addresses: {
    scope: "IA",
    kind: "organization",
    measure: "organization_address_rows",
    unit: "organization address rows",
  },
  broad_org_ny_organization_addresses: {
    scope: "NY",
    kind: "organization",
    measure: "organization_address_rows",
    unit: "organization address rows",
  },
  broad_org_or_legal_registration_addresses: {
    scope: "OR",
    kind: "registration",
    measure: "legal_registration_address_rows",
    unit: "legal registration address rows",
  },
  broad_org_or_brand_registration_addresses: {
    scope: "OR",
    kind: "brand",
    measure: "brand_registration_address_rows",
    unit: "brand registration address rows",
  },
  broad_org_pa_organization_addresses: {
    scope: "PA",
    kind: "organization",
    measure: "organization_address_rows",
    unit: "organization address rows",
  },
};
const reportingSpecs = {
  childcare_ma_reporting_centers: {
    publisher_scope: "MA",
    source_id: "ma-licensed-center-based-childcare",
    source_release_id:
      "ma-childcare-c6b4990deeedb98fb2bc384c420b2fe3c0d37892398f1596d11ca077ed2e80b5",
    source_manifest:
      "data/industry-segments/runs/ma-app-acquisition-20260907-02/state-ma-childcare-MA/releases/ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6/manifest.json",
    source_manifest_sha256:
      "c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc",
    source_reference_field: "source_observed_at",
    current_operation_verified: false,
    semantics:
      "Publisher source status labels are not verification of current operation.",
    row_unit: "publisher-reported-center-row",
    export_policy: "local-review-only",
    accepted_reporting_rows: 3007,
    source_zip_count: 438,
    source_status_counts: {
      Current: 2561,
      "Renewal in progress": 431,
      Expired: 13,
      "Regional Enrollment Freeze": 2,
    },
    source_observed_at: "2026-09-07T19:10:25.331Z",
    earliest_observed_at: "2026-09-07T19:10:25.331Z",
    latest_observed_at: "2026-09-07T19:10:25.331Z",
    source_refresh_at: null,
    source_refresh_asserted: false,
    zip4_rows: 1113,
    coordinate_rows: 3007,
    coordinate_ineligible_rows: 0,
    identity_matching_eligible: false,
    active_business_verified: false,
  },
  childcare_nj_reporting_centers: {
    publisher_scope: "NJ",
    source_id: "nj-licensed-childcare-centers",
    source_release_id:
      "nj-childcare-a9ed3d970922f919cee26a93310677b81a8319ae6ce960d83b34f607fec34f69",
    source_manifest:
      "data/business-sources/nj-licensed-childcare-centers-reprocessed/releases/nj-childcare-c79b679e-3267-4238-b4c6-6b43dbef9812/manifest.json",
    source_manifest_sha256:
      "b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e",
    source_reference_field: "source_observed_at",
    current_operation_verified: false,
    semantics:
      "Publisher source status labels are not verification of current operation.",
    row_unit: "publisher-reported-center-row",
    export_policy: "local-review-only",
    accepted_reporting_rows: 4075,
    source_zip_count: 525,
    source_status_counts: { null: 4075 },
    source_observed_at: "2026-09-07T20:05:27.313Z",
    earliest_observed_at: "2026-09-07T20:05:27.313Z",
    latest_observed_at: "2026-09-07T20:05:27.313Z",
    source_refresh_at: null,
    source_refresh_asserted: false,
    zip4_rows: 0,
    coordinate_rows: 4075,
    coordinate_ineligible_rows: 0,
    identity_matching_eligible: false,
    active_business_verified: false,
  },
  childcare_tn_reporting_centers: {
    publisher_scope: "TN",
    source_id: "tn-dhs-active-childcare-centers",
    source_release_id:
      "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
    source_manifest:
      "data/business-sources/tn-dhs-active-childcare-centers-recovered/releases/tn-childcare-recovered-307bc79c-4f4f-4c77-a349-73dfd9fb1801/manifest.json",
    source_manifest_sha256:
      "98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d",
    source_reference_field: "source_observed_at",
    current_operation_verified: false,
    semantics:
      "Publisher source status labels are not verification of current operation.",
    row_unit: "publisher-reported-center-row",
    export_policy: "local-review-only",
    accepted_reporting_rows: 1863,
    source_zip_count: 327,
    source_status_counts: { Active: 1863 },
    source_observed_at: "2026-09-08T00:36:36.628Z",
    earliest_observed_at: "2026-09-08T00:36:36.628Z",
    latest_observed_at: "2026-09-08T00:36:36.628Z",
    source_refresh_at: null,
    source_refresh_asserted: false,
    zip4_rows: 259,
    coordinate_rows: 1860,
    coordinate_ineligible_rows: 0,
    identity_matching_eligible: false,
    active_business_verified: false,
  },
  childcare_oh_reporting_centers: {
    publisher_scope: "OH",
    source_id: "oh-dcy-publisher-open-childcare-centers",
    source_release_id:
      "oh-childcare-2c38df58d6d977c7e93a26d6b1e730e7850ec893b6f5a947b76d5060e1cc6e4b",
    source_manifest:
      "data/industry-segments/runs/bd35c825-a6d0-4922-8508-7954ce00f5d5/state-oh-childcare-OH/normalized/releases/oh-childcare-c253c884-2048-47f9-8d7f-5ed29531acee/manifest.json",
    source_manifest_sha256:
      "e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171",
    source_reference_field: "row.observed_at",
    current_operation_verified: false,
    semantics:
      "Publisher source status labels are not verification of current operation.",
    row_unit: "publisher-reported-center-row",
    export_policy: "local-review-only",
    accepted_reporting_rows: 4237,
    source_zip_count: 674,
    source_status_counts: { Open: 4237 },
    source_observed_at: null,
    earliest_observed_at: "2026-09-08T08:30:15.824Z",
    latest_observed_at: "2026-09-08T08:31:02.735Z",
    source_refresh_at: null,
    source_refresh_asserted: false,
    zip4_rows: 0,
    coordinate_rows: 4237,
    coordinate_ineligible_rows: 4237,
    identity_matching_eligible: false,
    active_business_verified: false,
  },
};
const profileDimensions = {
  ak_license_location_profiles: {
    source_id: "alaska-dcced-active-business-licenses",
    release_id: "ak-active-business-licenses-2026-09-03-d77a60ab0d6e75dc",
    count: 94550,
    zips: 4383,
  },
  ca_abc_license_location_profiles: {
    source_id: "california-abc-daily-active-licenses",
    release_id: "ca-abc-active-licenses-2026-09-07-4adb619cd534904b",
    count: 84497,
    zips: 2920,
  },
  chicago_license_location_profiles: {
    source_id: "city-of-chicago-bacp-current-active-business-licenses",
    release_id: "chicago-active-business-licenses-2026-09-02-5509fc257e382b49",
    count: 42940,
    zips: 1033,
  },
  dc_basic_license_location_profiles: {
    source_id: "dc-dlcp-active-basic-business-licenses",
    release_id: "dc-basic-business-licenses-2026-09-07-70f09a6a032c9408",
    count: 54910,
    zips: 3125,
  },
  la_registered_location_profiles: {
    source_id: "los-angeles-office-of-finance-active-businesses",
    release_id: "la-active-businesses-2026-08-15-7a4190d1dfe2b2ac",
    count: 633232,
    zips: 5371,
  },
  ny_retail_food_location_profiles: {
    source_id: "new-york-agriculture-markets-retail-food-stores",
    release_id: "ny-retail-food-stores-2025-09-30-9dfbb0199594dab8",
    count: 24230,
    zips: 1498,
  },
  nyc_dcwp_license_location_profiles: {
    source_id: "nyc-dcwp-issued-licenses-active-premises",
    release_id: "nyc-dcwp-active-premises-2026-08-20-6c47b96b3ab94aec",
    count: 31163,
    zips: 1550,
  },
  tx_sales_tax_outlet_profiles: {
    source_id: "texas-comptroller-active-sales-tax-permits",
    release_id: "tx-active-sales-tax-2026-08-29-98b90d177d81493e",
    count: 885097,
    zips: 2156,
  },
};
const crossSources = [
  "healthcare_organizations",
  "regulated_facilities",
  "fdic_offices",
  "food_safety_establishments",
  "credit_union_locations",
  "snap_retailers",
  "pharmacy",
  "transportation",
  "tax_exempt_organizations",
  "cms_hospital_directory",
  "cms_nursing_home_directory",
  "childcare_pa_candidates",
  "childcare_ct_candidates",
  "childcare_md_candidates",
  "childcare_vt_candidates",
  "childcare_co_candidates",
  "childcare_ut_candidates",
  "childcare_ia_candidates",
  "childcare_ma_reporting_centers",
  "childcare_nj_reporting_centers",
  "childcare_tn_reporting_centers",
  "childcare_oh_reporting_centers",
  ...Object.keys(profileDimensions),
  ...Object.keys(broadDimensions),
];
function crossView(zip = "00601", status = "available") {
  const hash = "c".repeat(64),
    sourceDate = "2026-08-09";
  const cells = Object.fromEntries(
    crossSources.map((source, index) => {
      const childcare =
          source.startsWith("childcare_") && source.endsWith("_candidates"),
        reporting =
          source.startsWith("childcare_") && !source.endsWith("_candidates"),
        broad = broadDimensions[source],
        profile = profileDimensions[source],
        unresolved = [
          "childcare_ut_candidates",
          "childcare_ia_candidates",
        ].includes(source),
        countValue = profile
          ? source === "ak_license_location_profiles"
            ? 2
            : 0
          : source === "fdic_offices"
            ? null
            : childcare
            ? 0
            : reporting
              ? 1
              : index
                ? 0
                : 2;
      return [
        source,
        {
          status: source === "fdic_offices"
            ? "outside-source-denominator"
            : childcare
            ? "absent-from-retained-source-rows"
            : countValue
              ? "positive"
              : (source.startsWith("broad_org_") || profile || reporting)
                ? "absent-from-retained-source-rows"
                : "measured-zero",
          count: countValue,
          measure: profile
            ? "registry_location_profile_count"
            : (broad?.measure ??
              (source.startsWith("cms_")
                ? "directory_rows"
                : childcare
                  ? "candidate_rows"
                  : reporting
                    ? "reported_center_rows"
                    : `measure_${index}`)),
          source_release_id: profile?.release_id ?? `${source}-release`,
          temporal_status: {
            status: unresolved
              ? "source-reference-unresolved"
              : "source-referenced-current-operation-unverified",
            source_reference_date:
              profile?.release_id.match(/-(\d{4}-\d{2}-\d{2})-/)?.[1] ??
              (unresolved ? null : sourceDate),
          },
          ...(reporting
            ? {
                source_status_counts:
                  source === "childcare_ma_reporting_centers"
                    ? { Current: 1 }
                    : source === "childcare_nj_reporting_centers"
                      ? { null: 1 }
                      : source === "childcare_tn_reporting_centers"
                        ? { Active: 1 }
                        : { Open: 1 },
              }
            : profile
              ? {
                  source_status_counts:
                    source === "ak_license_location_profiles"
                      ? { present: 2, "empty-object": 0, missing: 0, null: 0 }
                      : source === "la_registered_location_profiles"
                        ? { present: 0, "empty-object": 0, missing: 0, null: 0 }
                        : {
                            present: 0,
                            "empty-object": 0,
                            missing: 0,
                            null: 0,
                          },
                }
              : {}),
        },
      ];
    }),
  );
  const source_metadata = Object.fromEntries(
    crossSources.map((source) => {
      const profile = profileDimensions[source],
        metadata = {
          source_reference_field: profile
            ? "source_release_id.date_token"
            : "source.source_date",
          current_operation_verified: false,
          semantics: profile
            ? "Retained registry-location profiles; not unique businesses, sites, or current operations."
            : "Source snapshot only; current operation is not verified.",
          source_manifest:
            source.startsWith("childcare_") && source.endsWith("_candidates")
              ? childcarePin.manifest
              : profile
                ? nativeStatusPin.manifest
                : `data/${source}/releases/source-release/manifest.json`,
          source_manifest_sha256:
            source.startsWith("childcare_") && source.endsWith("_candidates")
              ? childcarePin.manifest_sha256
              : profile
                ? nativeStatusPin.manifest_sha256
                : hash,
          zero_evidence_semantics: (() => {
            const stateLocal = source.startsWith("childcare_") ||
                source.startsWith("broad_org_") || !!profile,
              outside = [
                "healthcare_organizations",
                "regulated_facilities",
                "fdic_offices",
                "food_safety_establishments",
                "credit_union_locations",
                "snap_retailers",
              ].includes(source),
              exact = [
                "pharmacy",
                "transportation",
                "tax_exempt_organizations",
                "cms_hospital_directory",
                "cms_nursing_home_directory",
              ].includes(source);
            return {
              absent_cell_status: stateLocal
                ? "absent-from-retained-source-rows"
                : outside
                  ? "outside-source-denominator"
                  : "measured-zero",
              exact_zip_denominator: exact,
              explicit_zero_evidence_allowed: !stateLocal,
              interpretation: stateLocal
                ? "Retained source rows only; not measured zero or completeness; jurisdiction not inferred from ZCTA."
                : outside
                  ? "A ZIP absent from this source is outside-source-denominator; explicit retained zero rows are evidence."
                  : "Nationwide source supports a zero source-row count for exact ZIP membership.",
            };
          })(),
        };
      if (source.startsWith("childcare_") && source.endsWith("_candidates")) {
        const publisher_scope = source
            .slice("childcare_".length, -"_candidates".length)
            .toUpperCase(),
          retained = childcarePin.sources[publisher_scope];
        Object.assign(metadata, {
          publisher_scope,
          source_id: retained.source_id,
          row_unit: retained.source_claims.row_unit,
          export_policy: "internal",
          accepted_candidate_rows: retained.accepted_candidate_rows,
          retained_source: retained,
        });
      } else if (reportingSpecs[source]) {
        Object.assign(metadata, { ...reportingSpecs[source] });
      } else if (broadDimensions[source]) {
        const dimension = broadDimensions[source],
          sourceManifest = {
            publisher_jurisdiction: dimension.scope,
            source_dataset_id: `${dimension.scope.toLowerCase()}-registry`,
            normalized_release_id: "normalized-release",
            normalized_manifest_path: `data/${dimension.scope.toLowerCase()}-registry/releases/normalized-release/manifest.json`,
            normalized_manifest_sha256: hash,
            source_release_id: "source-release",
            source_rows_reference_field: "manifest.source_rows_updated_at",
            source_reference_date: sourceDate,
            source_manifest_sha256: hash,
            policy_id: "policy",
            policy_version: "1.0.0",
            policy_path: `config/source-policies/${dimension.scope.toLowerCase()}.json`,
            policy_sha256: hash,
            export_policy:
              dimension.scope === "DE"
                ? "local-review-only"
                : "source-policy-controlled",
            record_unit_semantics: "Publisher-specific source record unit.",
            address_semantics: "Source-reported administrative address only.",
            current_operation_verified: false,
            physical_establishment_verified: false,
            zip4_joined: false,
            usps_validity: "unknown",
            dimension_ids: [source],
          };
        Object.assign(metadata, {
          source_reference_field: sourceManifest.source_rows_reference_field,
          publisher_scope: dimension.scope,
          source_id: sourceManifest.source_dataset_id,
          row_unit: dimension.unit,
          export_policy: sourceManifest.export_policy,
          record_kind: dimension.kind,
          accepted_address_rows: 123,
          source_provenance: sourceManifest,
        });
      } else if (profile) {
        const sourceReferenceDate =
            profile.release_id.match(/-(\d{4}-\d{2}-\d{2})-/)?.[1] ?? null,
          statusCounts =
            source === "la_registered_location_profiles"
              ? {
                  present: 0,
                  "empty-object": 0,
                  missing: 0,
                  null: profile.count,
                }
              : {
                  present: profile.count,
                  "empty-object": 0,
                  missing: 0,
                  null: 0,
                };
        Object.assign(metadata, {
          source_id: profile.source_id,
          source_release_id: profile.release_id,
          row_unit: "registry-location-profile",
          export_policy: "local-review-only",
          accepted_profile_count: profile.count,
          source_zip_count: profile.zips,
          source_reference_date: sourceReferenceDate,
          source_reference_basis:
            "date token in pinned native source release ID; not an observed-at or refresh timestamp",
          source_status_counts: statusCounts,
          source_observation: {
            earliest_observed_at: "2026-09-03T00:36:59.626Z",
            latest_observed_at: "2026-09-03T00:36:59.626Z",
            observed_at_present: profile.count,
            observed_at_missing: 0,
          },
          source_refresh_at: null,
          source_refresh_asserted: false,
        });
      }
      return [source, metadata];
    }),
  );
  const qualityGap = {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "MD",
      source_id: "md-msde-childcare-centers",
      reason: "invalid-source-zip-range",
      candidate_rows: 1,
      source_release_id: childcarePin.release_id,
      source_reference_date:
        childcarePin.sources.MD.provenance.source_updated_at,
    },
    reportingQualityGaps = [
      {
        zip5: null,
        quality_dimension: "source-zip",
        publisher_scope: "TN",
        source_id: "tn-dhs-active-childcare-centers",
        reason: "missing-source-zip",
        reported_center_rows: 27,
        source_release_id:
          reportingSpecs.childcare_tn_reporting_centers.source_release_id,
        source_observed_at: "2026-09-08T00:36:36.628Z",
      },
      {
        zip5: null,
        quality_dimension: "source-zip",
        publisher_scope: "TN",
        source_id: "tn-dhs-active-childcare-centers",
        reason: "invalid-source-zip-placeholder",
        reported_center_rows: 145,
        source_release_id:
          reportingSpecs.childcare_tn_reporting_centers.source_release_id,
        source_observed_at: "2026-09-08T00:36:36.628Z",
      },
    ],
    addressRowGap = {
      gap_type: "source-address-row-without-eligible-zip5",
      publisher_jurisdiction: "DE",
      record_kind: "organization",
      dimension_id: "broad_org_de_license_addresses",
      zip5: null,
      zip_partition_reason: "missing-or-ineligible-source-zip",
      address_rows: 12,
      source_release_id: "broad-org-release",
      source_manifest_path:
        "data/broad-organization-zip-evidence/releases/broad-organization-zip-evidence-20260923-002630301Z-9cdbdcd319f2/manifest.json",
      source_manifest_sha256: hash,
      source_reference_date: sourceDate,
      temporal_status: {
        status: "source-referenced-current-operation-unverified",
        source_reference_date: sourceDate,
      },
    };
  const row =
    status === "unavailable-exact-zip-evidence"
      ? null
      : {
          schema_version:
            "national-exact-zip-industry-evidence-matrix-row@1.7.0",
          zip5: zip,
          zip4: null,
          cohort_classification: "same-code-census-zcta",
          usps_validity: null,
          zcta_geoid:
            status === "not-applicable-no-same-code-zcta" ? "00602" : zip,
          cells,
        };
  const industry_evidence = {
    schema_version: "national-exact-zip-industry-evidence-matrix@1.7.0",
    status: "present",
    row,
    out_of_cohort_source_zip_gaps: [],
    source_quality_gaps: [qualityGap, ...reportingQualityGaps],
    source_address_row_gaps: [addressRowGap],
    source_metadata,
    status_counts: exactZipMatrixManifest.summary.status_counts,
    cell_status_counts_by_dimension:
      exactZipMatrixManifest.summary.cell_status_counts_by_dimension,
    reclassified_absent_source_row_cells:
      exactZipMatrixManifest.summary.reclassified_absent_source_row_cells,
    release_id: `national-exact-zip-industry-evidence-matrix-${hash}`,
    manifest_sha256: hash,
    source_bytes_read: 4000,
    full_matrix_replay_performed: false,
    claims: {
      authoritative_current_usps_zip_denominator: null,
      usps_validity_classified: false,
      zip4_joined: false,
      additive_cross_industry_total: false,
      current_operation_verified: false,
      all_business_completeness: false,
      network_requests: 0,
      acquisition_performed: false,
      current_pointer_written: false,
      production_enrollment: false,
      production_execution: false,
    },
  };
  const demographic_context =
    status === "available"
      ? {
          status: "partial-input-readiness",
          population_2020: 17242,
          housing_units_2020: 7605,
          availability: {
            population_2020: true,
            housing_units_2020: true,
            race: false,
            ancestry_lineage: false,
            sex: false,
            age: false,
          },
          blockers: ["race-input-unavailable"],
          provenance: {
            release_id: "demographic-release",
            manifest_sha256: hash,
            artifact_sha256: hash,
            created_at: "2026-10-03T06:00:52.153Z",
            geography_release_id: "geography-release",
          },
        }
      : null;
  return {
    schema_version: "zip-industry-demographic-cross-view@1.0.0",
    zip5: zip,
    status,
    zcta_geoid: row?.zcta_geoid ?? null,
    industry_evidence,
    demographic_context,
    semantics: {
      geography: "Exact same-code governed Census ZCTA only.",
      industry:
        "Thirty-nine source-specific nonadditive units preserve registry-location profile status counts and source observation clocks; current operation is unverified.",
      demographic: "Population and housing are aggregate context only.",
    },
    claims: {
      same_code_zcta_required: true,
      ratios_computed: false,
      cross_industry_total: false,
      numeric_gdp: false,
      demographic_shares: false,
      authoritative_usps_validity: null,
      network_requests: 0,
      acquisition_performed: false,
      current_pointer_written: false,
      production_enrollment: false,
    },
  };
}
test("cross-view renders thirty-nine temporal cells with source-native status and Census context", async () => {
  const view = crossView(),
    h = harness(async (url) => {
      assert.equal(
        url,
        "/api/business-map/zip-industry-demographic-cross-view?zip=00601",
      );
      return view;
    });
  assert.equal(
    h.render("validZipIndustryDemographicCrossView", view, "00601"),
    true,
  );
  for (const malformed of [
    { ...view, extra: true },
    { ...view, claims: { ...view.claims, numeric_gdp: true } },
    { ...view, claims: { ...view.claims, ratios_computed: true } },
    {
      ...view,
      demographic_context: { ...view.demographic_context, population_2020: -1 },
    },
  ])
    assert.equal(
      h.render("validZipIndustryDemographicCrossView", malformed, "00601"),
      false,
    );
  h.render("ZipIndustryDemographicCrossViewPanel", { zip: "00601" });
  await flush();
  const tree = h.render("ZipIndustryDemographicCrossViewPanel", {
      zip: "00601",
    }),
    value = text(tree);
  assert.equal(
    nodes(tree)
      .filter((node) => node.type === "tbody")
      .flatMap(nodes)
      .filter((node) => node.type === "tr").length,
    39,
  );
  assert.match(value, /population 17,242/);
  assert.match(value, /housing units 7,605/);
  assert.match(
    value,
    /no ratio, total, GDP allocation, demographic share, or USPS-validity conclusion/,
  );
  assert.match(value, /source reference unresolved/);
  assert.match(value, /nonadditive/);
  assert.match(value, /Current 1/);
  assert.match(value, /Coordinates are not eligible for governed geography/);
  assert.match(value, /observation, not refresh/);
  h.close();
  const na = crossView("00601", "not-applicable-no-same-code-zcta"),
    notApplicable = harness(async () => na);
  notApplicable.render("ZipIndustryDemographicCrossViewPanel", {
    zip: "00601",
  });
  await flush();
  assert.match(
    text(
      notApplicable.render("ZipIndustryDemographicCrossViewPanel", {
        zip: "00601",
      }),
    ),
    /Not applicable: this ZIP has no exact same-code governed Census ZCTA/,
  );
  notApplicable.close();
});

test("shared geography distinguishes unknown from measured nonmembership, preserves zero and exposes proof gaps accessibly", () => {
  const h = harness(() => assert.fail()),
    base = {
      zip5: "00501",
      governed_zcta: { status: "not-in-denominator", geoid: null },
    };
  let tree = h.render("ZipGeographySummary", { view: base });
  assert.match(text(tree), /Unknown — no registry classification/);
  assert.doesNotMatch(text(tree), /Not in the selected governed/);
  assert.match(text(tree), /Unknown — not measured/);
  assert.equal(tree.props.style.fontSize, "1rem");
  assert.equal(tree.props.style.overflowWrap, "anywhere");
  assert.equal(tree.props.style.minWidth, 0);
  assert.equal(nodes(tree).filter((n) => n.type === "summary").length, 1);
  tree = h.render("ZipGeographySummary", {
    view: {
      ...base,
      classification: {
        class: "valid-format-source-reported-no-same-code-zcta",
      },
      coverage_status: "record-level-source-contribution",
      selected_coverage_geography: {
        zcta_status: "missing",
        zcta_geoid: null,
        spatial_zip_polygon_membership_status: "not-included",
        material_county_count: 0,
        county_assignment: "not-uniquely-assigned",
      },
      zip_quality: {
        usps_operational_evidence: {
          evidence_status: "unverified",
          operational_status: null,
        },
        unresolved_proof_gap_codes: ["gap-one"],
      },
      coverage_gap_codes: ["gap-one", "gap-two"],
    },
  });
  assert.match(text(tree), /Not in the selected governed ZCTA denominator/);
  assert.match(text(tree), /Material county intersections0/);
  assert.match(text(tree), /not uniquely assigned/);
  assert.match(text(tree), /USPS operational evidenceunverified/);
  assert.match(text(tree), /Current USPS operation is not verified/);
  assert.match(text(tree), /2 reported/);
  assert.equal(nodes(tree).filter((n) => n.type === "li").length, 2);
  assert.match(text(tree), /not segment-filtered/);
  assert.match(text(tree), /neither resolves these geography gaps/);
  tree = h.render("ZipGeographySummary", {
    view: {
      ...base,
      governed_zcta: { status: "included", geoid: "00501" },
      selected_coverage_geography: {
        material_county_count: 2,
        county_assignment: "not-uniquely-assigned",
        spatial_zip_polygon_membership_status: "cross-boundary",
      },
    },
  });
  assert.match(text(tree), /included/);
  assert.match(text(tree), /cross boundary/);
  assert.match(text(tree), /Material county intersections2/);
});

test("geography is shared once across subtabs; observed overview precedes GDP and ordinary pending failures are not absence", async () => {
  const pending = [],
    h = harness(
      (url, { signal }) =>
        new Promise((resolve, reject) =>
          pending.push({ url, signal, resolve, reject }),
        ),
    );
  let tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy ZIP5")
    .props.onChange({ target: { value: "00501" } });
  tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-1")
    .props.onClick();
  tree = h.render("ZipEconomyWorkspace");
  assert.match(
    text(tree),
    /contributions are loading; absence has not been established/,
  );
  assert.doesNotMatch(text(tree), /No verified positive segment evidence/);
  pending[0].reject(Error("fixture"));
  await flush();
  tree = h.render("ZipEconomyWorkspace");
  assert.match(text(tree), /contributions are unavailable/);
  assert.doesNotMatch(text(tree), /No verified positive segment evidence/);
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  h.render("ZipEconomyWorkspace");
  pending[1].resolve({
    zip5: "00501",
    evidence_status: "selected-evidence-present",
    governed_zcta: { status: "included", geoid: "00501" },
    bindings: {},
    counts: { physical_sites: 3 },
    category_evidence: {
      category_id: "all",
      status: "no-selected-positive-evidence",
      positive_source_contributions: [],
    },
  });
  await flush();
  tree = h.render("ZipEconomyWorkspace");
  assert.match(
    text(tree),
    /No verified positive segment evidence in the selected release/,
  );
  const summary = (tree) =>
    nodes(tree).filter(
      (n) =>
        typeof n.type === "function" && n.type.name === "ZipGeographySummary",
    );
  assert.equal(summary(tree).length, 1);
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-0")
    .props.onClick();
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(summary(tree).length, 1);
  assert.ok(
    text(tree).indexOf("Total extrapolated ZIP GDP") <
      text(tree).indexOf("Observed evidence · ZIP"),
  );
  assert.match(text(tree), /not filtered by the business segment/);
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy business segment")
    .props.onChange({ target: { value: "childcare" } });
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(summary(tree).length, 0);
  assert.equal(pending[1].signal.aborted, true);
  h.close();
});

test("reviewed segment options retain exact childcare selection through keyboard tab navigation and empty ordinary evidence", async () => {
  const stub = code.replace(
    'import ZipEvidenceQualificationPanel from "./zip-evidence-qualification-panel";',
    "function ZipEvidenceQualificationPanel(){return null;}",
  );
  const requests = [];
  const h = harness(async (url) => {
    requests.push(url);
    return {
      zip5: "00501",
      evidence_status: "selected-evidence-present",
      governed_zcta: { geoid: null },
      bindings: {
        coverage_release_id: "coverage-fixture",
        registry_release_id: "registry-fixture",
      },
      category_evidence: {
        category_id: "childcare",
        status: "no-selected-positive-evidence",
        semantics: "No ordinary contribution is not qualification support.",
        positive_source_contributions: [],
      },
    };
  }, stub);
  let tree = h.render("ZipEconomyWorkspace");
  const select = nodes(tree).find(
    (n) => n.props?.["aria-label"] === "Economy business segment",
  );
  assert.equal(select.type, "select");
  assert.equal(select.props.onKeyDown, undefined);
  const options = nodes(select)
    .filter((n) => n.type === "option")
    .map((n) => n.props.value);
  for (const id of [
    "childcare",
    "licensed-businesses",
    "registrations-nonprofits",
  ])
    assert.ok(options.includes(id));
  assert.ok(!options.includes("aggregate-baseline-context"));
  select.props.onChange({ target: { value: "childcare" } });
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy ZIP5")
    .props.onChange({ target: { value: "00501" } });
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(requests.length, 0);
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  tree = h.render("ZipEconomyWorkspace");
  await flush();
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-0")
    .props.onKeyDown({ key: "ArrowRight", preventDefault() {} });
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(h.focused.at(-1), "economy-tab-1");
  assert.equal(
    nodes(tree).find((n) => n.props?.id === "economy-tab-1").props.tabIndex,
    0,
  );
  assert.deepEqual(requests, [
    "/api/business-map/zip-inspector?zip=00501&category=childcare",
  ]);
  assert.match(text(tree), /Childcare · ZIP 00501/);
  assert.match(text(tree), /not a measured zero/);
  assert.match(text(tree), /Source segments can overlap/);
  assert.match(
    text(tree),
    /GDP and demographic allocations require governed inputs/,
  );
  assert.ok(
    nodes(tree).find(
      (n) =>
        typeof n.type === "function" &&
        n.type.name === "ZipEvidenceQualificationPanel",
    ).props.supplied,
    "mounted panel always uses the inspector envelope, including unknown responses",
  );
  const panel = nodes(tree).find(
    (n) =>
      typeof n.type === "function" &&
      n.type.name === "ZipEvidenceQualificationPanel",
  );
  assert.equal(panel.props.categoryId, "childcare");
  assert.equal(panel.props.coverageReleaseId, "coverage-fixture");
  assert.equal(panel.props.registryReleaseId, "registry-fixture");
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-1")
    .props.onKeyDown({ key: "ArrowLeft", preventDefault() {} });
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(
    nodes(tree).find(
      (n) => n.props?.["aria-label"] === "Economy business segment",
    ).props.value,
    "childcare",
  );
  h.close();
});

test("ZIP qualification mounts only in Business segments with exact bound ordinary evidence and navigation state", async () => {
  const stub = code.replace(
    'import ZipEvidenceQualificationPanel from "./zip-evidence-qualification-panel";',
    "function ZipEvidenceQualificationPanel(){return null;}",
  );
  const pending = [];
  const h = harness(
    (url, { signal }) =>
      new Promise((resolve) => pending.push({ url, signal, resolve })),
    stub,
  );
  const panel = (tree) =>
    nodes(tree).find(
      (n) =>
        typeof n.type === "function" &&
        n.type.name === "ZipEvidenceQualificationPanel",
    );
  let tree = h.render("ZipEconomyWorkspace", { stateCode: "PA" });
  assert.equal(panel(tree), undefined);
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-1")
    .props.onClick();
  tree = h.render("ZipEconomyWorkspace", { stateCode: "PA" });
  assert.equal(panel(tree).props.zip, "");
  assert.equal(pending.length, 0);
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy ZIP5")
    .props.onChange({ target: { value: "00501" } });
  tree = h.render("ZipEconomyWorkspace", { stateCode: "PA" });
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  tree = h.render("ZipEconomyWorkspace", { stateCode: "PA" });
  assert.equal(panel(tree).props.coverageReleaseId, "");
  pending[0].resolve({
    zip5: "00501",
    evidence_status: "selected-evidence-present",
    governed_zcta: { geoid: null },
    bindings: {
      coverage_release_id: "coverage-fixture",
      registry_release_id: "registry-fixture",
    },
    category_evidence: {
      category_id: "all",
      status: "positive-source-contribution",
      semantics: "Ordinary source evidence",
      positive_source_contributions: [
        {
          source_id: "ordinary-source",
          source_release_id: "r1",
          positive_counts: { record_count: 7 },
        },
      ],
    },
  });
  await flush();
  tree = h.render("ZipEconomyWorkspace", { stateCode: "PA" });
  assert.equal(panel(tree).props.coverageReleaseId, "coverage-fixture");
  assert.equal(panel(tree).props.registryReleaseId, "registry-fixture");
  assert.equal(panel(tree).props.categoryId, "all");
  assert.match(text(tree), /ordinary-source/);
  tree = h.render("ZipEconomyWorkspace", { stateCode: "MD" });
  assert.equal(panel(tree).props.navigationState, "MD");
  assert.match(text(tree), /ordinary-source/);
  assert.equal(pending.length, 1);
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy business segment")
    .props.onChange({ target: { value: "health-care" } });
  tree = h.render("ZipEconomyWorkspace", { stateCode: "MD" });
  assert.equal(panel(tree).props.coverageReleaseId, "");
  assert.equal(panel(tree).props.categoryId, "health-care");
  assert.doesNotMatch(text(tree), /ordinary-source/);
  tree = h.render("ZipEconomyWorkspace", { stateCode: "MD" });
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-2")
    .props.onClick();
  tree = h.render("ZipEconomyWorkspace", { stateCode: "MD" });
  assert.equal(panel(tree), undefined);
  h.close();
});
test("outside denominator panel separates configuration from measurements and is keyboard readable", () => {
  const h = harness(() => assert.fail()),
    comparison = {
      available: true,
      denominator_version: "national-reporting-ten@1.0.0+broad",
      configuration: {
        path: "config/industry-segments.json",
        version: 1,
        sha256: "a".repeat(64),
      },
      catalog: {
        path: "config/national-reporting-sources.json",
        schema_version: "national-reporting-catalog@2.0.0",
        denominator_version: "national-reporting-ten@1.0.0",
        predecessor_sha256: "b".repeat(64),
      },
      industries: [
        "construction",
        "sales-tax-outlets",
        "local-business-licenses",
        "childcare",
      ].map((id) => ({
        id,
        sources: [
          {
            id: `state-${id}`,
            scope: "state",
            publisher_states: ["MN"],
            manual_selection_required: true,
          },
        ],
      })),
    };
  const tree = h.render("OutsideNationalReporting", { comparison }),
    value = text(tree);
  assert.match(value, /Outside national reporting denominator/);
  assert.match(value, /not evidence of acquisition or nationwide coverage/);
  assert.match(value, /totals above are unchanged/);
  assert.match(value, /State-only: MN/);
  assert.match(value, /manual selection required/);
  assert.match(value, /national-reporting-ten@1.0.0/);
  assert.match(value, /a{64}/);
  assert.equal(
    nodes(tree).find((row) => row.props?.role === "region").props.tabIndex,
    0,
  );
  assert.equal(nodes(tree).filter((row) => row.type === "summary").length, 1);
  assert.equal(
    nodes(tree).filter((row) => row.props?.scope === "row").length,
    4,
  );
  assert.doesNotMatch(value, /\d+%/);
  for (const comparison of [
    undefined,
    { available: false, industries: null },
    { available: true, industries: null },
  ]) {
    const unavailable = text(
      h.render("OutsideNationalReporting", { comparison }),
    );
    assert.match(unavailable, /Scope comparison unavailable/);
    assert.doesNotMatch(unavailable, /No excluded configured industry/);
    assert.doesNotMatch(unavailable, /\d+%/);
  }
});
test("both Coverage and Industries mount the same outside-denominator panel", () => {
  for (const industries of [false, true]) {
    const h = harness(async () => ({ available: false, jurisdictions: [] })),
      tree = h.render("CoverageWorkspace", { industries });
    assert.equal(
      nodes(tree).filter(
        (row) =>
          typeof row.type === "function" &&
          row.type.name === "OutsideNationalReporting",
      ).length,
      1,
    );
    h.close();
  }
});

test("simplified Coverage and Industries keep retained county evidence separate and follow the selected state", () => {
  const stub = code.replace(
    'import { RetainedCountyWorkspace } from "./retained-county-panel";',
    "function RetainedCountyWorkspace(){return null;}",
  );
  for (const industries of [false, true]) {
    const h = harness(
        async () => ({ available: false, jurisdictions: [] }),
        stub,
      ),
      tree = h.render("CoverageWorkspace", { industries, stateCode: "MD" });
    const panel = nodes(tree).find(
      (row) =>
        typeof row.type === "function" &&
        row.type.name === "RetainedCountyWorkspace",
    );
    assert.equal(panel.props.stateCode, "MD");
    assert.equal(
      nodes(tree).filter((row) => row.type === panel.type).length,
      1,
    );
    h.close();
  }
});
test("national expectation summary uses explicit dataset-state cells and null denominators", () => {
  const h = harness(() => assert.fail());
  const summary = h.render("summarizeAvailability", [
    { available: 1, measured: 2, denominator: 3, unmeasured: 1 },
    { available: 0, measured: 0, denominator: 3, unmeasured: 3 },
  ]);
  assert.equal(summary.expected, 6);
  assert.equal(summary.unmeasured, 4);
  assert.equal(summary.availabilityPercent, 50);
  assert.equal(summary.connectivityPercent, 50);
  assert.equal(summary.connected, 1);
  assert.equal(h.render("summarizeAvailability", []).availabilityPercent, null);
});
test("ZIP segment changes abort stale requests, reject mismatched scopes and allow same-ZIP retry", async () => {
  const requests = [];
  const h = harness(
    (url, options) =>
      new Promise((resolve, reject) =>
        requests.push({ url, signal: options.signal, resolve, reject }),
      ),
  );
  let tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy ZIP5")
    .props.onChange({ target: { value: "00501" } });
  tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  tree = h.render("ZipEconomyWorkspace");
  assert.match(requests[0].url, /zip=00501&category=all/);
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy business segment")
    .props.onChange({ target: { value: "health-care" } });
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(requests[0].signal.aborted, true);
  assert.match(requests[1].url, /category=health-care/);
  requests[0].resolve({
    zip5: "00501",
    category_evidence: { category_id: "all" },
    counts: { physical_sites: 999 },
  });
  requests[1].reject(Error("fixture"));
  await flush();
  tree = h.render("ZipEconomyWorkspace");
  assert.match(text(tree), /Exact ZIP evidence is unavailable/);
  assert.doesNotMatch(text(tree), /999/);
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  h.render("ZipEconomyWorkspace");
  assert.equal(requests.length, 3);
  requests[2].resolve({
    zip5: "00501",
    category_evidence: { category_id: "all" },
  });
  await flush();
  assert.match(text(h.render("ZipEconomyWorkspace")), /did not match/);
  h.close();
  assert.equal(requests[2].signal.aborted, true);
});
test("same-code governed ZCTA triggers exact readiness lookup and renders governed status, lineage and limitations", async () => {
  const requests = [],
    h = harness(
      (url, options) =>
        new Promise((resolve, reject) =>
          requests.push({ url, signal: options.signal, resolve, reject }),
        ),
    );
  let tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy ZIP5")
    .props.onChange({ target: { value: "00501" } });
  tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  h.render("ZipEconomyWorkspace");
  requests[0].resolve({
    zip5: "00501",
    evidence_status: "selected-evidence-present",
    governed_zcta: { status: "included", geoid: "00501" },
    bindings: {},
    counts: {
      physical_sites: 0,
      establishments: 0,
      employer_establishments: 0,
    },
    category_evidence: {
      category_id: "all",
      status: "no-selected-positive-evidence",
      positive_source_contributions: [],
    },
  });
  await flush();
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(
    requests[1].url,
    "/api/business-map/zcta-economic-readiness?zcta=00501",
  );
  const response = {
    schema_version: "zcta-economic-readiness-view@1.0.0",
    zcta: "00501",
    available: true,
    status: "found",
    readiness: {
      population_2020: 1200,
      housing_units_2020: 500,
      zbp_publication_status: "zbp-and-zcta",
      relationship_count: 2,
      material_relationship_count: 1,
      state_fips: ["36"],
      county_geoids: ["36001", "36003"],
      direct_county_gdp_count: 1,
      missing_county_gdp_geoids: ["36003"],
      direct_gdp_relationship_coverage: 0.5,
      model_status: "withheld",
      blockers: ["no-official-zip-gdp", "no-governed-allocation-model"],
    },
    provenance: {
      release_id: "readiness-r1",
      manifest_sha256: "a".repeat(64),
      artifact_sha256: "b".repeat(64),
      created_at: "2026-10-02T00:00:00.000Z",
      geography_release_id: "geo-r1",
      input_releases: [
        {
          dataset_id: "bea-regional-gdp",
          release_id: "bea-r1",
          manifest_sha256: "c".repeat(64),
        },
      ],
    },
    limitations: ["No ZIP GDP is produced."],
    claims: {
      official_zip_code: false,
      active_businesses: false,
      numeric_gdp_or_demographic_allocation: false,
    },
  };
  requests[1].resolve(response);
  await flush();
  tree = h.render("ZipEconomyWorkspace");
  assert.ok(
    nodes(tree).find(
      (n) =>
        typeof n.type === "function" &&
        n.type.name === "ZctaEconomicReadinessPanel",
    ),
  );
  const value = text(
    h.render("ZctaEconomicReadinessPanel", { view: response }),
  );
  assert.match(value, /model_statuswithheld/);
  assert.match(value, /no-official-zip-gdp/);
  assert.match(
    value,
    /Direct county GDP coverage1 \/ 2 relationships · 50\.0%/,
  );
  assert.match(value, /2020 Census population1,200 · aggregate context/);
  assert.match(value, /ZIP Business Patterns statuszbp-and-zcta/);
  assert.match(value, /readiness-r1/);
  assert.match(value, /bea-regional-gdp/);
  assert.match(value, /No ZIP GDP is produced/);
  tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-2")
    .props.onClick();
  tree = h.render("ZipEconomyWorkspace");
  assert.match(
    text(tree),
    /2020 Census housing context500 · aggregate context only/,
  );
  assert.match(
    text(tree),
    /Readiness for one same-code ZCTA cannot be generalized to the country/,
  );
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-1")
    .props.onClick();
  tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find(
      (n) =>
        n.props?.categoryId === "all" && typeof n.props?.onRetry === "function",
    )
    .props.onRetry();
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(
    nodes(tree).some(
      (n) =>
        typeof n.type === "function" &&
        n.type.name === "ZctaEconomicReadinessPanel",
    ),
    false,
  );
  requests[2].reject(Error("retry failed"));
  await flush();
  assert.match(
    text(h.render("ZipEconomyWorkspace")),
    /Exact ZIP evidence is unavailable/,
  );
  assert.doesNotMatch(text(h.render("ZipEconomyWorkspace")), /readiness-r1/);
  h.close();
});
test("readiness is not applicable without same-code ZCTA and stale or mismatched responses cannot render", async () => {
  const requests = [],
    h = harness(
      (url, options) =>
        new Promise((resolve, reject) =>
          requests.push({ url, signal: options.signal, resolve, reject }),
        ),
    );
  let tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy ZIP5")
    .props.onChange({ target: { value: "99999" } });
  tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  h.render("ZipEconomyWorkspace");
  requests[0].resolve({
    zip5: "99999",
    governed_zcta: { status: "matched", geoid: "99999" },
    bindings: {},
    category_evidence: {
      category_id: "all",
      status: "no-selected-positive-evidence",
      positive_source_contributions: [],
    },
  });
  await flush();
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(requests.length, 1);
  assert.match(text(tree), /readiness: not applicable/);
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy ZIP5")
    .props.onChange({ target: { value: "00501" } });
  tree = h.render("ZipEconomyWorkspace");
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  h.render("ZipEconomyWorkspace");
  requests[1].resolve({
    zip5: "00501",
    governed_zcta: { status: "included", geoid: "00501" },
    bindings: {},
    category_evidence: {
      category_id: "all",
      status: "no-selected-positive-evidence",
      positive_source_contributions: [],
    },
  });
  await flush();
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(
    requests[2].url,
    "/api/business-map/zcta-economic-readiness?zcta=00501",
  );
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "Economy business segment")
    .props.onChange({ target: { value: "health-care" } });
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(requests[2].signal.aborted, true);
  requests[2].resolve({
    zcta: "00501",
    available: true,
    readiness: { model_status: "should-not-render" },
  });
  await flush();
  assert.doesNotMatch(
    text(h.render("ZipEconomyWorkspace")),
    /should-not-render/,
  );
  requests[3].resolve({
    zip5: "00501",
    governed_zcta: { status: "included", geoid: "00501" },
    bindings: {},
    category_evidence: {
      category_id: "health-care",
      status: "no-selected-positive-evidence",
      positive_source_contributions: [],
    },
  });
  await flush();
  h.render("ZipEconomyWorkspace");
  requests[4].resolve({
    schema_version: "zcta-economic-readiness-view@1.0.0",
    zcta: "00501",
    available: false,
    status: "not-found",
    readiness: null,
    provenance: {
      release_id: "malformed-prohibited",
      manifest_sha256: "a".repeat(64),
      artifact_sha256: "b".repeat(64),
      created_at: "2026-10-02T00:00:00.000Z",
      geography_release_id: "geo-r1",
      input_releases: [],
    },
    limitations: [],
    claims: {
      official_zip_code: true,
      active_businesses: false,
      numeric_gdp_or_demographic_allocation: false,
    },
  });
  await flush();
  assert.match(
    text(h.render("ZipEconomyWorkspace")),
    /Economic-model readiness is unavailable/,
  );
  assert.doesNotMatch(
    text(h.render("ZipEconomyWorkspace")),
    /malformed-prohibited/,
  );
  h.close();
});
test("readiness validator fails closed on malformed same-ZCTA envelopes and prohibited claims", () => {
  const h = harness(() => assert.fail()),
    base = {
      schema_version: "zcta-economic-readiness-view@1.0.0",
      zcta: "00501",
      available: false,
      status: "not-found",
      readiness: null,
      provenance: {
        release_id: "r1",
        manifest_sha256: "a".repeat(64),
        artifact_sha256: "b".repeat(64),
        created_at: "2026-10-02T00:00:00.000Z",
        geography_release_id: "g1",
        input_releases: [],
      },
      limitations: [],
      claims: {
        official_zip_code: false,
        active_businesses: false,
        numeric_gdp_or_demographic_allocation: false,
      },
    },
    row = {
      population_2020: 1,
      housing_units_2020: 1,
      zbp_publication_status: "zbp-and-zcta",
      relationship_count: 2,
      material_relationship_count: 1,
      state_fips: ["36"],
      county_geoids: ["36001", "36003"],
      direct_county_gdp_count: 1,
      missing_county_gdp_geoids: ["36003"],
      direct_gdp_relationship_coverage: 0.5,
      model_status: "withheld",
      blockers: ["no-official-zip-gdp"],
    },
    found = { ...base, available: true, status: "found", readiness: row };
  assert.equal(h.render("validZctaEconomicReadiness", base), true);
  assert.equal(h.render("validZctaEconomicReadiness", found), true);
  for (const value of [
    { ...base, status: "found" },
    { ...base, claims: { ...base.claims, official_zip_code: true } },
    { ...base, provenance: { ...base.provenance, manifest_sha256: "bad" } },
    { ...base, provenance: { ...base.provenance, created_at: "2026-10-02" } },
    { ...found, readiness: { ...row, zbp_publication_status: "published" } },
    { ...found, readiness: { ...row, state_fips: ["36", "36"] } },
    { ...found, readiness: { ...row, county_geoids: ["36001", "36001"] } },
    {
      ...found,
      readiness: {
        ...row,
        missing_county_gdp_geoids: ["36003", "36003"],
        direct_county_gdp_count: 0,
        direct_gdp_relationship_coverage: 0,
      },
    },
    { ...found, readiness: { ...row, blockers: ["duplicate", "duplicate"] } },
    { ...base, extra: true },
    null,
  ])
    assert.equal(h.render("validZctaEconomicReadiness", value), false);
});
test("ZIP economy subtabs include national demographic model empty states and support keyboard navigation", () => {
  const h = harness(() => assert.fail());
  let tree = h.render("ZipEconomyWorkspace", { stateCode: "MN" });
  assert.match(text(tree), /A ZIP is not inferred/);
  const first = nodes(tree).find((n) => n.props?.id === "economy-tab-0");
  first.props.onKeyDown({ key: "End", preventDefault() {} });
  tree = h.render("ZipEconomyWorkspace");
  assert.equal(h.focused.at(-1), "economy-tab-2");
  assert.match(text(tree), /Cross-country GDP by demographic dimension/);
  assert.match(text(tree), /Coverage is unknown, not zero/);
  assert.equal(
    (text(tree).match(/Withheld · no governed national estimate/g) || [])
      .length,
    4,
  );
  assert.match(
    text(tree),
    /Readiness for one same-code ZCTA cannot be generalized to the country/,
  );
});
test("state heat map is driven only by scoped matrix availability and distinguishes zero, unknown, and not applicable", async () => {
  const mapCode = await readFile(
    new URL("../app/business-intelligence.tsx", import.meta.url),
    "utf8",
  );
  const h = harness(
    async () => ({
      available: true,
      features: ["AK", "DC", "HI"].map((code, index) => ({
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-100, 40],
              [-99, 40],
              [-99, 41],
              [-100, 40],
            ],
          ],
        },
        properties: {
          geoid: String(index),
          postal_abbreviation: code,
          name: code,
          heat_value: 999999,
          business_count: 999999,
        },
      })),
    }),
    mapCode,
  );
  let selected;
  const props = {
    rows: [
      {
        code: "AK",
        name: "Alaska",
        available: 0,
        measured: 2,
        unmeasured: 1,
        denominator: 3,
        measurement_status: "partially-measured",
        percent: 0,
      },
      {
        code: "DC",
        name: "District",
        available: 0,
        measured: 0,
        unmeasured: 3,
        denominator: 3,
        measurement_status: "unmeasured",
        percent: null,
      },
      {
        code: "HI",
        name: "Hawaii",
        available: 0,
        measured: 0,
        unmeasured: 0,
        denominator: 0,
        measurement_status: "measured",
        percent: null,
      },
    ],
    selected: "",
    categoryLabel: "Health care",
    onSelect: (code) => (selected = code),
    measure: "expected",
  };
  h.render("StateAvailabilityChoropleth", props);
  await flush();
  const tree = h.render("StateAvailabilityChoropleth", props),
    paths = nodes(tree).filter(
      (node) => node.type === "path" && node.props.role === "button",
    ),
    value = text(tree);
  assert.equal(paths.length, 3);
  assert.match(
    paths[0].props["aria-label"],
    /Zero available — 0 of 3 expected datasets/,
  );
  assert.match(
    paths[1].props["aria-label"],
    /Unknown — 3 required dataset cells unmeasured/,
  );
  assert.match(paths[1].props.fill, /availability-unmeasured/);
  assert.match(
    paths[2].props["aria-label"],
    /Not applicable — no expected dataset cells/,
  );
  assert.match(paths[2].props.fill, /availability-not-applicable/);
  assert.match(value, /Measured zero available/);
  assert.match(value, /Unknown \/ unmeasured/);
  assert.match(value, /Not applicable \/ no expectations/);
  assert.match(
    nodes(tree).find((node) => node.type === "svg").props["aria-label"],
    /Health care dataset availability/,
  );
  assert.doesNotMatch(paths[0].props["aria-label"], /999999/);
  assert.equal(
    nodes(tree).find((node) => node.type === "svg").props.onWheel,
    undefined,
  );
  paths[1].props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.equal(selected, "DC");
  h.close();
});
test("five primary tab cards expose their work areas and arrow Home End keyboard navigation", () => {
  let selected;
  const h = harness(() => assert.fail()),
    tree = h.render("WorkspaceTabs", {
      value: "State Completion",
      onChange: (value) => (selected = value),
    }),
    tabs = nodes(tree).filter((n) => n.props?.role === "tab"),
    label = (tab) =>
      nodes(tab).find((node) => node.type === "strong")?.props.children,
    description = (tab) =>
      text(
        nodes(tab).find(
          (node) => node.props?.className === "workspace-tab-copy",
        ),
      );
  assert.deepEqual(tabs.map(label), [
    "State Completion",
    "Industry Summary",
    "ZIP Economics",
    "Demographic GDP",
    "Operations",
  ]);
  assert.deepEqual(tabs.map(description), [
    "State CompletionNationwide dataset availability",
    "Industry SummaryIndustry reach and connectivity",
    "ZIP EconomicsZIP total and segment GDP",
    "Demographic GDPNational and ZIP cross-views",
    "OperationsJobs, evidence, and connectors",
  ]);
  assert.equal(tabs[0].props["aria-selected"], true);
  for (const [key, index] of [
    ["ArrowLeft", 4],
    ["ArrowRight", 1],
    ["End", 4],
    ["Home", 0],
  ]) {
    let prevented = false;
    tabs[0].props.onKeyDown({ key, preventDefault: () => (prevented = true) });
    assert.equal(prevented, true);
    assert.equal(
      selected,
      ["State Completion", "Industry Summary", "ZIP Economics", "Demographic GDP", "Operations"][
        index
      ],
    );
    assert.equal(h.focused.at(-1), `workspace-tab-${index}`);
  }
});
test("operations subtabs group former workspaces and support keyboard navigation", () => {
  let selected;
  const h = harness(() => assert.fail()),
    tree = h.render("OperationsTabs", {
      value: "Jobs",
      onChange: (value) => (selected = value),
    }),
    tabs = nodes(tree).filter((n) => n.props?.role === "tab");
  assert.deepEqual(
    tabs.map((tab) => tab.props.children),
    ["Jobs", "Collection", "Evidence", "Connectors"],
  );
  tabs[0].props.onKeyDown({ key: "End", preventDefault() {} });
  assert.equal(selected, "Connectors");
  assert.equal(h.focused.at(-1), "operations-tab-3");
});
test("coverage exposes category scope and differentiates zero null and missing evidence", async () => {
  let signal;
  const h = harness(async (url, options) => {
    assert.match(url, /goal-completion\?category=general-business/);
    signal = options.signal;
    return {
      available: true,
      release_id: "fixture-release",
      denominator: { version: "fixture-v7" },
      categories: ["general-business", "health-care"],
      jurisdictions: [
        {
          code: "AK",
          name: "Alaska",
          available: 0,
          measured: 2,
          unmeasured: 1,
          denominator: 3,
          percent: 0,
        },
        {
          code: "DC",
          name: "District of Columbia",
          available: 0,
          measured: 0,
          unmeasured: 3,
          denominator: 3,
          percent: null,
        },
      ],
      selected: null,
    };
  });
  h.render("CoverageWorkspace");
  await flush();
  const tree = h.render("CoverageWorkspace"),
    value = text(tree),
    selector = nodes(tree).find(
      (n) => n.props?.["aria-label"] === "Coverage category",
    );
  assert.deepEqual(
    nodes(selector)
      .filter((n) => n.type === "option")
      .map((n) => text(n)),
    ["All expected datasets", "Broad state organization layer", "Health care"],
  );
  assert.match(value, /Broad state organization layer availability/);
  assert.match(value, /0\.0%/);
  assert.match(value, /unmeasured/);
  assert.match(value, /fixture-v7/);
  assert.match(value, /not all-business or GDP completeness/);
  assert.match(value, /3 unmeasured/);
  assert.match(
    value,
    /100% availability applies only to the selected category/,
  );
  assert.equal(
    nodes(tree).filter((n) => n.props?.["aria-pressed"] !== undefined).length,
    2,
  );
  h.close();
  assert.equal(signal.aborted, true);
});
test("industries leads with summary and connectivity without redundant subnavigation", async () => {
  const h = harness(async (url) =>
    url.includes("state-summary")
      ? {
          available: true,
          categories: [{ id: "health-care", label: "Health care" }],
          national_category_counts: { "health-care": 120 },
          national_category_percent_of_collected_evidence: {
            "health-care": 12.5,
          },
          states: [
            {
              postal_abbreviation: "MD",
              state_name: "Maryland",
              category_counts: { "health-care": 8 },
              percent_of_category_nationwide: { "health-care": 6.7 },
            },
          ],
        }
      : {
          available: true,
          release_id: "matrix",
          denominator: { version: "v1" },
          categories: ["health-care"],
          category_summaries: [
            {
              category_id: "health-care",
              national: {
                available: 40,
                expected: 51,
                measured: 45,
                unmeasured: 6,
                denominator_percent: 78.4,
                measured_only_percent: 88.9,
                missing_or_unknown: 11,
                states_fully_available: 35,
                states: 51,
              },
              selected_state: {
                code: "MD",
                name: "Maryland",
                available: 1,
                expected: 1,
                measured: 1,
                unmeasured: 0,
                measurement_status: "measured",
              },
            },
          ],
          jurisdictions: [
            {
              code: "MD",
              name: "Maryland",
              available: 1,
              measured: 2,
              unmeasured: 1,
              denominator: 3,
              percent: 50,
              broad_layer_gap: false,
            },
          ],
          selected: { code: "MD", category: { datasets: [] } },
        },
  );
  h.render("CoverageWorkspace", {
    industries: true,
    stateCode: "MD",
    categoryCode: "health-care",
  });
  await flush();
  const tree = h.render("CoverageWorkspace", {
      industries: true,
      stateCode: "MD",
      categoryCode: "health-care",
    }),
    value = text(tree);
  assert.match(value, /Industry summary/);
  assert.match(value, /National evidence rows120/);
  assert.match(value, /MD evidence rows8/);
  assert.match(value, /Industry connectivity/);
  assert.match(value, /78.4%/);
  assert.match(value, /Missing \/ unknown/);
  assert.equal(
    nodes(tree).some(
      (n) => typeof n.type === "function" && n.type.name === "IndustryViewTabs",
    ),
    false,
  );
  assert.doesNotMatch(value, /Selected industry and state summary/);
  h.close();
});

test("default state completion uses all expected industry datasets and preserves unknown business completeness", async () => {
  const row = {
    code: "MD",
    name: "Maryland",
    available: 1,
    measured: 1,
    unmeasured: 2,
    denominator: 3,
    percent: 33.3,
    broad_layer_gap: true,
  };
  const h = harness(async (url) =>
    url.includes("temporal-claim")
      ? { available: false }
      : {
          available: true,
          status: "verified",
          release_id: "matrix",
          categories: ["general-business"],
          denominator: { version: "v1" },
          jurisdictions: [
            { ...row, denominator: 1, unmeasured: 0, percent: 100 },
          ],
          overall_jurisdictions: [row],
          category_summaries: [],
          selected: { code: "MD", category: { datasets: [] } },
        },
  );
  h.render("CoverageWorkspace", { stateCode: "MD" });
  await flush();
  const tree = h.render("CoverageWorkspace", { stateCode: "MD" }),
    value = text(tree),
    map = nodes(tree).find((node) => node.props?.measure === "expected");
  assert.equal(map.props.categoryLabel, "All expected datasets");
  assert.equal(map.props.rows[0].percent, (1 / 3) * 100);
  assert.match(value, /National dataset completion33.3%/);
  assert.match(value, /Measured-only availability100.0%/);
  assert.match(value, /All-business completenessUnknown/);
  assert.match(value, /Industry connections/);
  h.close();
});

test("ZIP selection restores when switching workspaces and publishes exact ZIP scope", () => {
  const requests = [],
    selected = [],
    h = harness((url) => {
      requests.push(url);
      return new Promise(() => {});
    });
  let tree = h.render("ZipEconomyWorkspace", {
    initialZip: "00501",
    onZipChange: (zip) => selected.push(zip),
  });
  assert.equal(
    nodes(tree).find((node) => node.props?.["aria-label"] === "Economy ZIP5")
      .props.value,
    "00501",
  );
  assert.match(requests[0], /zip=00501/);
  nodes(tree)
    .find((node) => node.props?.["aria-label"] === "Economy ZIP5")
    .props.onChange({ target: { value: "00601" } });
  tree = h.render("ZipEconomyWorkspace", {
    initialZip: "00501",
    onZipChange: (zip) => selected.push(zip),
  });
  nodes(tree)
    .find((node) => node.type === "form")
    .props.onSubmit({ preventDefault() {} });
  assert.deepEqual(selected, ["00601"]);
  h.close();
});
test("coverage aside shows the exact retained temporal boundary and fails closed", () => {
  const h = harness(() => assert.fail()),
    sha = "a".repeat(64),
    view = {
      schema_version: "national-business-temporal-claim-matrix-view@1.0.0",
      available: true,
      scope: "retained-source-classification-only",
      summary: {
        source_count: 30,
        source_defined_current_membership_sources: 22,
        non_active_directory_registration_reporting_sources: 7,
        annual_aggregate_sources: 1,
        broad_state_dc_source_defined_active: 11,
        broad_state_dc_total: 51,
        broad_state_dc_gaps: 40,
        verified_current_complete_jurisdictions: 0,
        verified_current_complete_gaps: 51,
        active_business_count: null,
        completeness_percentage: null,
      },
      provenance: {
        release_id: `national-business-temporal-claim-matrix-${sha}`,
        manifest_sha256: sha,
        artifact_sha256: sha,
        created_at: "2026-10-03T00:00:00.000Z",
        registry_release_id: "registry-r1",
        registry_manifest_sha256: sha,
        coverage_release_id: "coverage-r1",
        coverage_manifest_sha256: sha,
      },
      claims: {
        network_requests: 0,
        current_pointer_written: false,
        production_enrollment: false,
        current_operations_verified: false,
        active_business_count: false,
        completeness_inferred: false,
      },
    };
  assert.equal(h.render("validTemporalMatrix", view), true);
  const value = text(
    h.render("TemporalCoverageSummary", { view, error: false }),
  );
  assert.match(value, /Source classifications30/);
  assert.match(value, /Source-defined current-membership cohorts22/);
  assert.match(value, /Broad state\/DC sources11 \/ 51/);
  assert.match(value, /Broad state\/DC gaps40/);
  assert.match(value, /Verified-current-complete jurisdictions0 \/ 51/);
  assert.match(value, /Active-business countUnknown/);
  assert.match(value, /All-business completenessUnknown/);
  assert.match(value, /does not independently verify current operation/);
  assert.match(value, new RegExp(sha));
  for (const malformed of [
    { ...view, summary: { ...view.summary, active_business_count: 1 } },
    { ...view, claims: { ...view.claims, current_operations_verified: true } },
    { ...view, provenance: { ...view.provenance, manifest_sha256: "bad" } },
    null,
  ])
    assert.equal(h.render("validTemporalMatrix", malformed), false);
  assert.doesNotMatch(
    text(h.render("TemporalCoverageSummary", { view: null, error: true })),
    /30|22|11 \/ 51/,
  );
});
test("coverage labels retained IRS evidence as adjacent and outside broad availability", async () => {
  const payload = {
    available: true,
    release_id: "matrix-release",
    denominator: { version: "matrix-v" },
    categories: ["general-business"],
    jurisdictions: [
      {
        code: "AK",
        name: "Alaska",
        available: 0,
        measured: 0,
        unmeasured: 1,
        denominator: 1,
        percent: null,
        broad_layer_gap: true,
      },
    ],
    selected: {
      code: "AK",
      category: {
        datasets: [
          {
            dataset_id: "broad",
            label: "Broad jurisdiction organization layer",
            availability_status: "unmeasured",
            state_record_count: null,
            gap_reason: "missing",
          },
        ],
      },
      adjacent_evidence: [
        {
          dataset_id: "national-irs-eo-bmf-organization-coverage",
          evidence_kind: "adjacent-retained-national-organization-cohort",
          included_in_broad_layer: false,
          included_in_dataset_availability: false,
          release_id: "irs-release",
          source_release_id: "source-release",
          source_date: "2026-08-11",
          state: "AK",
          row_semantics:
            "IRS EO BMF current-extract organization record grouped by reported filing-address state; not a physical site",
          organization_count: 5822,
          record_zcta_count: 4951,
          record_nonpolygon_count: 871,
          limitations: [
            "Tax-exempt filing-address evidence only; not a broad state organization layer.",
            "Not all businesses, all nonprofits, unique businesses, current operations, or verified physical sites.",
            "Same-code ZCTA evidence does not establish current USPS validity.",
            "Excluded from generic totals, matrix datasets, availability, denominator, and broad-layer gap status.",
          ],
        },
      ],
    },
  };
  const h = harness(async () => payload);
  h.render("CoverageWorkspace", { stateCode: "AK" });
  await flush();
  const value = text(h.render("CoverageWorkspace", { stateCode: "AK" }));
  assert.match(value, /National IRS adjacent evidence — outside availability/);
  assert.match(value, /5,822/);
  assert.match(value, /reported filing-address state/);
  assert.match(value, /Same-code ZCTA records4,951/);
  assert.match(value, /Nonpolygon records871/);
  assert.match(value, /not a broad state organization layer/);
  assert.match(
    value,
    /Excluded from generic totals, matrix datasets, availability, denominator, and broad-layer gap status/,
  );
  assert.match(value, /Broad state organization layer: Gap/);
  h.close();
});
test("state panel validates and renders governed state-local adjacent evidence and explicit none", () => {
  const hash = "a".repeat(64),
    base = {
      schema_version: "broad-organization-adjacent-evidence-view@1.0.0",
      available: true,
      release_id:
        "broad-organization-adjacent-evidence-index-1b609cdc273a49212fe9fe12",
      manifest_sha256: hash,
      summary: {
        broad_layer_gap_jurisdictions: 40,
        jurisdictions_with_retained_adjacent_evidence: 11,
        jurisdictions_without_retained_adjacent_evidence: 29,
        retained_evidence_items: 12,
        broad_layer_gaps_closed: 0,
      },
      selected: {
        code: "CA",
        name: "California",
        broad_layer_gap: true,
        broad_layer_status: "unmeasured",
        adjacent_evidence_status: "retained-adjacent-evidence",
        evidence_count: 1,
        evidence: [
          {
            evidence_id: "ca-license",
            label: "California licensed premises",
            evidence_kind: "statewide-industry-license-cohort",
            record_count: 84497,
            row_unit: "licensed premise",
            provenance: {
              release_id: "ca-release",
              source_release_id: "ca-source",
              manifest_sha256: hash,
            },
            source_reference: { status: "unknown", field: null, value: null },
            temporal_limitation:
              "Active license status is not proof of current operation.",
            current_operation_verified: false,
            geography_scope: "California licensed-premise cohort",
            authority: {
              retained_offline_use_authorized: true,
              acquisition_authorized: false,
              broad_layer_admission_authorized: false,
              production_pointer_change_authorized: false,
              export_policy: "local-review-only",
            },
            coverage_limitations: ["Industry-limited license cohort."],
          },
        ],
        limitations: ["Adjacent evidence does not change this gap."],
      },
      claims: {
        network_requests: 0,
        acquisition_performed: false,
        current_pointer_written: false,
        production_enrollment: false,
        broad_layer_gap_preserved: true,
        active_business_count: null,
        all_business_completeness_percent: null,
      },
    },
    h = harness(() => assert.fail());
  assert.equal(h.render("validBroadGapAdjacentView", base, "CA"), true);
  const value = text(
    h.render("BroadGapAdjacentEvidencePanel", {
      view: base,
      error: false,
      state: "CA",
    }),
  );
  assert.match(
    value,
    /State\/local retained cohorts — outside broad availability/,
  );
  assert.match(value, /84,497 licensed premise rows/);
  assert.match(value, /statewide industry license cohort/);
  assert.match(value, /Source\/reference dateUnknown/);
  assert.match(value, /Current operationNot verified/);
  assert.match(value, /broad admission not authorized/);
  assert.match(value, /ca-release/);
  assert.match(value, new RegExp(hash));
  assert.match(value, /Industry-limited license cohort/);
  for (const malformed of [
    { ...base, claims: { ...base.claims, broad_layer_gap_preserved: false } },
    { ...base, selected: { ...base.selected, broad_layer_gap: false } },
    { ...base, selected: { ...base.selected, evidence_count: 0 } },
  ])
    assert.equal(h.render("validBroadGapAdjacentView", malformed, "CA"), false);
  const none = {
    ...base,
    selected: {
      ...base.selected,
      code: "AL",
      name: "Alabama",
      adjacent_evidence_status: "no-retained-adjacent-evidence",
      evidence_count: 0,
      evidence: [],
    },
  };
  assert.equal(h.render("validBroadGapAdjacentView", none, "AL"), true);
  const noneText = text(
    h.render("BroadGapAdjacentEvidencePanel", {
      view: none,
      error: false,
      state: "AL",
    }),
  );
  assert.match(noneText, /None retained/);
  assert.match(
    noneText,
    /No governed state-specific, municipal, license, credential, or childcare cohort/,
  );
  h.close();
});
test("Overview source requests the authenticated broad-gap adjacent endpoint only for selected general-business gaps", async () => {
  const source = await readFile(
    new URL("../app/workspace-views.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /category\s*!==\s*["']general-business["']\s*\|\|\s*!state\s*\|\|\s*!selected\?\.broad_layer_gap/,
  );
  assert.match(
    source,
    /\/api\/business-map\/broad-organization-adjacent-evidence\?state=/,
  );
  assert.match(source, /BroadGapAdjacentEvidencePanel\s+state=\{state\}/);
});
test("unavailable coverage and unmounted late reads cannot display success counts", async () => {
  let resolve;
  const h = harness(() => new Promise((r) => (resolve = r)));
  h.render("CoverageWorkspace");
  h.close();
  resolve({ available: true, jurisdictions: [{ code: "XX" }] });
  await flush();
  assert.match(text(h.render("CoverageWorkspace")), /Verifying/);
  const missing = harness(async () => ({
    available: false,
    status: "missing-enrollment",
  }));
  missing.render("CoverageWorkspace");
  await flush();
  assert.match(
    text(missing.render("CoverageWorkspace")),
    /Completion is unmeasured/,
  );
});
test("demographic readiness validator accepts only the closed verified contract", () => {
  const sha = "a".repeat(64),
    view = {
      schema_version: "zcta-demographic-readiness-view@1.0.0",
      zcta: "00601",
      available: true,
      status: "found",
      readiness: {
        status: "partial-input-readiness",
        population_2020: 17242,
        housing_units_2020: 7605,
        availability: {
          population_2020: true,
          housing_units_2020: true,
          race: false,
          ancestry_lineage: false,
          sex: false,
          age: false,
        },
        blockers: [
          "race-input-unavailable",
          "ancestry-lineage-input-unavailable",
          "sex-input-unavailable",
          "age-input-unavailable",
        ],
      },
      provenance: {
        release_id: `zcta-demographic-input-readiness-${sha}`,
        manifest_sha256: sha,
        artifact_sha256: sha,
        created_at: "2026-10-03T06:00:52.153Z",
        geography_release_id: "us-census-geography-r1",
      },
      claims: {
        official_zip_code: false,
        demographic_percentages: false,
        gdp: false,
        network_requests: 0,
        current_pointer_written: false,
        production_enrollment: false,
      },
    },
    h = harness(() => assert.fail());
  assert.equal(h.render("validZctaDemographicReadiness", view, "00601"), true);
  for (const malformed of [
    { ...view, extra: true },
    { ...view, zcta: "00602" },
    { ...view, available: false },
    { ...view, claims: { ...view.claims, gdp: true } },
    { ...view, claims: { ...view.claims, network_requests: 1 } },
    {
      ...view,
      readiness: {
        ...view.readiness,
        availability: { ...view.readiness.availability, race: true },
      },
    },
    {
      ...view,
      readiness: {
        ...view.readiness,
        blockers: view.readiness.blockers.slice(1),
      },
    },
  ])
    assert.equal(
      h.render("validZctaDemographicReadiness", malformed, "00601"),
      false,
    );
});
test("demographic readiness panel renders verified Race blockers, counts, lineage and disclaimers", async () => {
  const sha = "b".repeat(64),
    view = {
      schema_version: "zcta-demographic-readiness-view@1.0.0",
      zcta: "00601",
      available: true,
      status: "found",
      readiness: {
        status: "partial-input-readiness",
        population_2020: 17242,
        housing_units_2020: 7605,
        availability: {
          population_2020: true,
          housing_units_2020: true,
          race: false,
          ancestry_lineage: false,
          sex: false,
          age: false,
        },
        blockers: [
          "race-input-unavailable",
          "ancestry-lineage-input-unavailable",
          "sex-input-unavailable",
          "age-input-unavailable",
        ],
      },
      provenance: {
        release_id: `zcta-demographic-input-readiness-${sha}`,
        manifest_sha256: sha,
        artifact_sha256: sha,
        created_at: "2026-10-03T06:00:52.153Z",
        geography_release_id: "us-census-geography-r1",
      },
      claims: {
        official_zip_code: false,
        demographic_percentages: false,
        gdp: false,
        network_requests: 0,
        current_pointer_written: false,
        production_enrollment: false,
      },
    },
    requests = [],
    h = harness(async (url) => {
      requests.push(url);
      return view;
    });
  h.render("ZctaDemographicReadinessPanel", {
    zcta: "00601",
    dimension: "Race",
  });
  await flush();
  const tree = h.render("ZctaDemographicReadinessPanel", {
      zcta: "00601",
      dimension: "Race",
    }),
    value = text(tree);
  assert.deepEqual(requests, [
    "/api/business-map/zcta-demographic-readiness?zcta=00601",
  ]);
  assert.match(value, /Race: Unavailable/);
  assert.match(value, /partial-input-readiness/);
  assert.match(value, /17,242/);
  assert.match(value, /7,605/);
  assert.match(value, /race-input-unavailable/);
  assert.match(value, new RegExp(`zcta-demographic-input-readiness-${sha}`));
  assert.match(value, /us-census-geography-r1/);
  assert.match(value, /not an official USPS ZIP or demographic percentage/);
  assert.match(value, /No GDP allocation is produced/);
  h.close();
});
test("demographic readiness panel distinguishes no-ZCTA and malformed response states", async () => {
  let requests = 0;
  const none = harness(async () => {
    requests++;
    return {};
  });
  const noZcta = none.render("ZctaDemographicReadinessPanel", {
    zcta: null,
    dimension: "Race",
  });
  assert.equal(noZcta.props.role, "status");
  assert.match(
    text(noZcta),
    /not applicable because this ZIP has no same-code governed Census ZCTA match/,
  );
  assert.equal(requests, 0);
  none.close();
  const malformed = harness(async () => ({ schema_version: "malformed" }));
  malformed.render("ZctaDemographicReadinessPanel", {
    zcta: "00601",
    dimension: "Race",
  });
  await flush();
  const alert = malformed.render("ZctaDemographicReadinessPanel", {
    zcta: "00601",
    dimension: "Race",
  });
  assert.equal(alert.props.role, "alert");
  assert.match(text(alert), /unavailable or malformed/);
  assert.match(
    text(alert),
    /no totals, status, or availability was substituted/,
  );
  malformed.close();
});
test("exact ZIP matrix validates thirty-nine temporal source dimensions and publisher-specific metadata", async () => {
  const matrix = crossView().industry_evidence,
    h = harness(async () => matrix);
  assert.equal(h.render("validExactZipEvidence", matrix, "00601"), true);
  const malformed = [
    { ...matrix, extra: true },
    { ...matrix, row: { ...matrix.row, zip5: "00602" } },
    {
      ...matrix,
      row: {
        ...matrix.row,
        cells: { ...matrix.row.cells, extra: matrix.row.cells.pharmacy },
      },
    },
    {
      ...matrix,
      row: {
        ...matrix.row,
        cells: {
          ...matrix.row.cells,
          regulated_facilities: {
            ...matrix.row.cells.regulated_facilities,
            count: null,
          },
        },
      },
    },
    {
      ...matrix,
      row: {
        ...matrix.row,
        cells: {
          ...matrix.row.cells,
          childcare_pa_candidates: {
            ...matrix.row.cells.childcare_pa_candidates,
            status: "unknown-zero-state",
          },
        },
      },
    },
    {
      ...matrix,
      source_metadata: {
        ...matrix.source_metadata,
        pharmacy: {
          ...matrix.source_metadata.pharmacy,
          current_operation_verified: true,
        },
      },
    },
    { ...matrix, source_quality_gaps: [] },
    {
      ...matrix,
      source_quality_gaps: [
        { ...matrix.source_quality_gaps[0], zip5: "21708" },
      ],
    },
    {
      ...matrix,
      source_address_row_gaps: [
        { ...matrix.source_address_row_gaps[0], zip5: "21708" },
      ],
    },
    {
      ...matrix,
      source_metadata: {
        ...matrix.source_metadata,
        childcare_md_candidates: {
          ...matrix.source_metadata.childcare_md_candidates,
          export_policy: "public",
        },
      },
    },
    { ...matrix, claims: { ...matrix.claims, usps_validity_classified: true } },
    { ...matrix, full_matrix_replay_performed: true },
    {
      ...matrix,
      source_metadata: {
        ...matrix.source_metadata,
        childcare_pa_candidates: {
          ...matrix.source_metadata.childcare_pa_candidates,
          zero_evidence_semantics: {
            ...matrix.source_metadata.childcare_pa_candidates.zero_evidence_semantics,
            exact_zip_denominator: true,
          },
        },
      },
    },
    {
      ...matrix,
      row: {
        ...matrix.row,
        cells: {
          ...matrix.row.cells,
          childcare_pa_candidates: {
            ...matrix.row.cells.childcare_pa_candidates,
            status: "measured-zero",
          },
        },
      },
    },
  ];
  for (const value of malformed)
    assert.equal(h.render("validExactZipEvidence", value, "00601"), false);
  h.render("ExactZipIndustryEvidencePanel", { zip: "00601" });
  await flush();
  const tree = h.render("ExactZipIndustryEvidencePanel", { zip: "00601" }),
    value = text(tree);
  assert.equal(
    nodes(tree)
      .filter((n) => n.type === "tbody")
      .flatMap((n) => nodes(n).filter((row) => row.type === "tr")).length,
    39,
  );
  assert.match(value, /Measured zero in this source projection/);
  assert.match(value, /Outside source denominator — not zero/);
  assert.match(value, /No retained source row — not measured zero/);
  assert.match(value, /USPS validity: Unknown/);
  assert.match(value, /ZIP\+4: Separate and not joined/);
  assert.match(value, /Cells are nonadditive/);
  assert.match(
    value,
    /Registry-location profiles preserve source-native status categories/,
  );
  assert.match(value, /Source status labels: present/);
  assert.match(value, /observation, not refresh/);
  assert.match(
    value,
    /Childcare candidate rows and publisher reporting-center rows remain distinct source units/,
  );
  assert.match(value, /Childcare source ZIP quality gaps/);
  assert.match(value, /invalid-source-zip-range/);
  assert.match(value, /no ZIP5 key is asserted/);
  assert.match(value, /Separate broad-organization address-row ZIP gaps/);
  assert.match(value, /source referenced current operation unverified/);
  assert.match(value, new RegExp(matrix.release_id));
  h.close();
});
test("registry profile cells fail closed on lost status conservation or conflated source clocks", () => {
  const base = crossView().industry_evidence,
    h = harness(() => base),
    profile = "ak_license_location_profiles",
    row = base.row;
  const badCounts = {
    ...base,
    row: {
      ...row,
      cells: {
        ...row.cells,
        [profile]: {
          ...row.cells[profile],
          source_status_counts: {
            present: 1,
            "empty-object": 0,
            missing: 0,
            null: 0,
          },
        },
      },
    },
  };
  const badObservation = {
    ...base,
    source_metadata: {
      ...base.source_metadata,
      [profile]: {
        ...base.source_metadata[profile],
        source_observation: {
          ...base.source_metadata[profile].source_observation,
          earliest_observed_at: "2026-09-03",
        },
      },
    },
  };
  const badRefresh = {
    ...base,
    source_metadata: {
      ...base.source_metadata,
      [profile]: {
        ...base.source_metadata[profile],
        source_refresh_asserted: true,
      },
    },
  };
  for (const value of [badCounts, badObservation, badRefresh])
    assert.equal(h.render("validExactZipEvidence", value, "00601"), false);
});
test("exact ZIP matrix exposes childcare and CMS out-of-cohort gaps without invalid-ZIP claims", async () => {
  for (const [zip5, source_id, label] of [
    ["21708", "childcare_md_candidates", "MD childcare candidate rows"],
    ["35999", "cms_nursing_home_directory", "CMS nursing-home directory rows"],
  ]) {
    const base = crossView(
        zip5,
        "unavailable-exact-zip-evidence",
      ).industry_evidence,
      gap = {
        ...base,
        out_of_cohort_source_zip_gaps: [
          {
            zip5,
            source_id,
            ...(zip5 === "21708" ? { publisher_scope: "MD" } : {}),
            count: 1,
            measure: zip5 === "21708" ? "candidate_rows" : "directory_rows",
            source_release_id: "source-release",
            temporal_status: {
              status: "source-referenced-current-operation-unverified",
              source_reference_date: "2026-05-27T19:48:49Z",
            },
          },
        ],
      },
      h = harness(async () => gap);
    h.render("ExactZipIndustryEvidencePanel", { zip: zip5 });
    await flush();
    const value = text(
      h.render("ExactZipIndustryEvidencePanel", { zip: zip5 }),
    );
    assert.match(value, /out-of-cohort gaps/);
    assert.match(value, new RegExp(label));
    assert.match(value, /does not establish an invalid USPS ZIP/);
    if (zip5 === "21708") {
      assert.match(value, /not keyed to this out-of-cohort ZIP/);
      assert.match(value, /invalid-source-zip-range/);
    }
    h.close();
  }
  const base = crossView(
      "99998",
      "unavailable-exact-zip-evidence",
    ).industry_evidence,
    h = harness(async () => base);
  h.render("ExactZipIndustryEvidencePanel", { zip: "99998" });
  await flush();
  assert.match(
    text(h.render("ExactZipIndustryEvidencePanel", { zip: "99998" })),
    /outside the retained evidence cohort/,
  );
  h.close();
});
test("ZIP economics withholds unsupported GDP outputs and exposes modeled methodology and demographic coverage gaps", () => {
  const h = harness(() => assert.fail("no request before valid ZIP"));
  let tree = h.render("ZipEconomyWorkspace"),
    value = text(tree);
  assert.match(value, /Withheld — no approved ZIP model/);
  assert.match(value, /Current governed BEA evidence is county-level/);
  assert.match(
    value,
    /Industry counts and source memberships are not GDP weights/,
  );
  nodes(tree)
    .find((n) => n.props?.id === "economy-tab-2")
    .props.onClick();
  tree = h.render("ZipEconomyWorkspace");
  assert.match(text(tree), /Withheld · no governed national estimate/);
  assert.match(text(tree), /Coverage is unknown, not zero/);
  const select = nodes(tree).find(
    (n) => n.props?.["aria-label"] === "Demographic dimension",
  );
  assert.deepEqual(
    nodes(select)
      .filter((n) => n.type === "option")
      .map((n) => text(n)),
    ["Race", "Lineage / ancestry", "Sex", "Age"],
  );
  select.props.onChange({ target: { value: "Age" } });
  assert.match(
    text(h.render("ZipEconomyWorkspace")),
    /Age × All source categories/,
  );
});
test("readiness panels expose distinct non-additive memberships and exact ZIP blockers", async () => {
  const sha = "a".repeat(64),
    view = {
      schema_version: "business-intelligence-readiness-view@1.2.0",
      source_replay_performed: false,
      pharmacy_overlay: {
        status: "verified-retained-nonadditive-overlay",
        release_id: `national-nppes-pharmacy-registry-overlay-${sha}`,
        manifest_sha256: sha,
        created_at: "2026-10-03T10:38:45.404Z",
        summary: {
          pharmacy_rows: 89077,
          exact_npi_membership_matches: 89077,
          already_present_same_source_identity: 89077,
          generic_business_additivity_delta: 0,
          organization_additions: 0,
          site_additions: 0,
          establishment_additions: 0,
          zip5_denominator_rows: 48194,
          positive_zip5_rows: 15376,
        },
        claims: {
          active_npi_enumeration_as_of: "2026-08-09",
          nationwide_completeness: false,
          authoritative_current_usps_zip_denominator: null,
          current_operation: null,
          licensed_pharmacy: null,
          production_enrollment: false,
        },
      },
      fmcsa_transportation_membership: {
        status: "verified-retained-nonadditive-membership",
        release_id: `national-fmcsa-registry-industry-overlay-${sha}`,
        manifest_sha256: sha,
        created_at: "2026-10-03T12:22:32.719Z",
        summary: {
          fmcsa_rows: 2195563,
          exact_usdot_membership_matches: 2195563,
          exact_site_identity_matches: 2195563,
          exact_establishment_identity_matches: 2195563,
          missing_identities: 0,
          extra_identities: 0,
          organization_additions: 0,
          site_additions: 0,
          establishment_additions: 0,
          generic_business_additivity_delta: 0,
          jurisdiction_rows: 56,
          zip5_denominator_rows: 48194,
          positive_zip5_rows: 35648,
        },
        claims: {
          source_defined_active_fmcsa_registration_as_of:
            "2026-08-30T11:55:17.000Z",
          reported_principal_office_only: true,
          roles_and_classes_exclusive: false,
          unique_business: false,
          current_operation_beyond_source: false,
          verified_physical_site: false,
          public_access: false,
          complete_carrier_universe: false,
          complete_trucking_or_transportation_universe: false,
          nationwide_completeness: false,
          authoritative_current_usps_zip_denominator: null,
          network_requests: 0,
          acquisition_performed: false,
          current_pointer_written: false,
          production_enrollment: false,
          production_execution: false,
        },
      },
      irs_tax_exempt_organization_membership: {
        status: "verified-retained-nonadditive-membership",
        release_id: `national-irs-eo-registry-industry-overlay-${sha}`,
        manifest_sha256: sha,
        created_at: "2026-10-03T13:20:49.338Z",
        summary: {
          irs_eo_rows: 1955841,
          exact_ein_organization_membership_matches: 1955841,
          missing_identities: 0,
          extra_identities: 0,
          organization_additions: 0,
          site_additions: 0,
          establishment_additions: 0,
          generic_business_additivity_delta: 0,
          jurisdiction_rows: 56,
          zip5_denominator_rows: 48194,
          positive_zip5_rows: 36950,
        },
        claims: {
          source_current_extract_membership_as_of: "2026-08-11",
          filing_address_only: true,
          identifier_free_aggregate_output: true,
          k_anonymous: false,
          small_cell_suppression_applied: false,
          disclosure_control_claimed: false,
          current_operation_beyond_source: false,
          verified_physical_site: false,
          nationwide_business_completeness: false,
          authoritative_current_usps_zip_denominator: null,
          network_requests: 0,
          acquisition_performed: false,
          current_pointer_written: false,
          production_enrollment: false,
          production_execution: false,
        },
      },
      zip_denominator: {
        status: "blocked-on-authorized-authoritative-input",
        release_id: `zip-denominator-admission-readiness-${sha}`,
        manifest_sha256: sha,
        readiness_sha256: sha,
        observed_at: "2026-10-03T10:40:43.007Z",
        blockers: [
          "missing-authorized-authoritative-usps-zip-artifact",
          "authoritative-current-usps-denominator-unverified",
        ],
        retained_zip_evidence: {
          rows: 48194,
          usps_unverified: 48194,
          same_code_census_zcta: 33791,
          source_contributed_outside_zcta: 14361,
        },
        claims: {
          authoritative_current_usps_zip_denominator: null,
          valid_usps_zip_count: null,
          zip_validity_classified: false,
          production_execution: false,
        },
      },
    },
    h = harness(async () => view);
  assert.equal(h.render("validBiReadiness", view), true);
  h.render("BusinessIntelligenceReadiness", { mode: "industry" });
  await flush();
  const industry = text(
    h.render("BusinessIntelligenceReadiness", { mode: "industry" }),
  );
  assert.match(industry, /Transportation · FMCSA membership/);
  assert.match(industry, /2,195,563/);
  assert.match(industry, /not a unique-business count/i);
  assert.match(industry, /Tax-exempt organizations · IRS EO membership/);
  assert.match(industry, /1,955,841/);
  assert.match(industry, /small cells are not suppressed/i);
  h.close();
  const zip = harness(async () => view);
  zip.render("BusinessIntelligenceReadiness", { mode: "zip" });
  await flush();
  const output = text(
    zip.render("BusinessIntelligenceReadiness", { mode: "zip" }),
  );
  assert.match(output, /missing-authorized-authoritative-usps-zip-artifact/);
  assert.match(output, /Valid USPS ZIP countUnknown/);
  zip.close();
  const invalid = [
    { ...view, extra: true },
    {
      ...view,
      fmcsa_transportation_membership: {
        ...view.fmcsa_transportation_membership,
        stale: true,
      },
    },
    {
      ...view,
      fmcsa_transportation_membership: {
        ...view.fmcsa_transportation_membership,
        summary: {
          ...view.fmcsa_transportation_membership.summary,
          generic_business_additivity_delta: 1,
        },
      },
    },
    {
      ...view,
      fmcsa_transportation_membership: {
        ...view.fmcsa_transportation_membership,
        claims: {
          ...view.fmcsa_transportation_membership.claims,
          current_operation_beyond_source: true,
        },
      },
    },
    {
      ...view,
      fmcsa_transportation_membership: {
        ...view.fmcsa_transportation_membership,
        claims: {
          ...view.fmcsa_transportation_membership.claims,
          authoritative_current_usps_zip_denominator: 48194,
        },
      },
    },
    {
      ...view,
      irs_tax_exempt_organization_membership: {
        ...view.irs_tax_exempt_organization_membership,
        claims: {
          ...view.irs_tax_exempt_organization_membership.claims,
          identifier_free_aggregate_output: false,
        },
      },
    },
    {
      ...view,
      zip_denominator: {
        ...view.zip_denominator,
        retained_zip_evidence: {
          ...view.zip_denominator.retained_zip_evidence,
          same_code_census_zcta: -1,
        },
      },
    },
  ];
  for (const malformed of invalid)
    assert.equal(h.render("validBiReadiness", malformed), false);
});

test("readiness UI aborts its request on unmount and ignores late stale completion", async () => {
  let captured, resolve;
  const pending = new Promise((done) => (resolve = done)),
    h = harness((_url, { signal }) => {
      captured = signal;
      return pending;
    });
  h.render("BusinessIntelligenceReadiness", { mode: "industry" });
  h.close();
  assert.equal(captured.aborted, true);
  resolve({ schema_version: "stale" });
  await flush();
  assert.match(
    text(h.render("BusinessIntelligenceReadiness", { mode: "industry" })),
    /Verifying retained readiness/,
  );
  h.close();
});
test("GDP approval packet validator and card retain HOLD boundaries and exact provenance", async () => {
  const registration = JSON.parse(
      await readFile(
        new URL(
          "../config/datasets/zcta-gdp-model-approval-packet.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    packet = JSON.parse(
      await readFile(
        new URL(
          `../${registration.retained_release.manifest.replace(/manifest\.json$/, "approval-packet.json")}`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    h = harness(() => assert.fail());
  assert.equal(h.render("validZctaGdpApprovalPacket", packet), true);
  for (const malformed of [
    { ...packet, extra: true },
    { ...packet, decision_status: "approved" },
    { ...packet, feasibility: { ...packet.feasibility, withheld: 3214 } },
    { ...packet, claims: { ...packet.claims, numeric_gdp_emitted: true } },
    { ...packet, scope: { ...packet.scope, official_usps_zip: true } },
    {
      ...packet,
      bindings: {
        ...packet.bindings,
        bea_policy: { ...packet.bindings.bea_policy, sha256: "bad" },
      },
    },
  ])
    assert.equal(h.render("validZctaGdpApprovalPacket", malformed), false);
  const value = text(
    h.render("ZctaGdpApprovalCard", { view: packet, error: false }),
  );
  assert.match(value, /GDP model decision · HOLD/);
  assert.match(value, /30,576 \/ 33,791/);
  assert.match(value, /Withheld3,215/);
  assert.match(value, /Technical feasibility is not approval/);
  assert.match(value, /not operational USPS ZIP coverage/);
  assert.match(value, /industry GDP, or demographic GDP/);
  assert.match(value, /Required decisions and exact provenance/);
  assert.match(
    value,
    new RegExp(packet.bindings.model_specification.manifest_sha256),
  );
  assert.match(
    value,
    new RegExp(packet.bindings.allocation_evaluation.manifest_sha256),
  );
  assert.match(value, new RegExp(packet.bindings.bea_policy.sha256));
  assert.doesNotMatch(
    text(h.render("ZctaGdpApprovalCard", { view: null, error: true })),
    /30,576|33,791|3,215/,
  );
});
test("GDP approval packet loader uses the authenticated read-only route and fails closed", async () => {
  const registration = JSON.parse(
      await readFile(
        new URL(
          "../config/datasets/zcta-gdp-model-approval-packet.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    packet = JSON.parse(
      await readFile(
        new URL(
          `../${registration.retained_release.manifest.replace(/manifest\.json$/, "approval-packet.json")}`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    requests = [],
    h = harness(async (url) => {
      requests.push(url);
      return packet;
    });
  h.render("ZctaGdpApprovalCardLoader");
  await flush();
  assert.deepEqual(requests, [
    "/api/business-map/zcta-gdp-model-approval-packet",
  ]);
  let card = h.render("ZctaGdpApprovalCardLoader");
  assert.equal(card.props.view, packet);
  assert.equal(card.props.error, false);
  assert.match(
    text(h.render("ZctaGdpApprovalCard", card.props)),
    /GDP model decision · HOLD/,
  );
  h.close();
  const malformed = harness(async () => ({
    ...packet,
    claims: { ...packet.claims, output_authorized: true },
  }));
  malformed.render("ZctaGdpApprovalCardLoader");
  await flush();
  card = malformed.render("ZctaGdpApprovalCardLoader");
  assert.equal(card.props.view, null);
  assert.equal(card.props.error, true);
  const value = text(malformed.render("ZctaGdpApprovalCard", card.props));
  assert.match(value, /unavailable or malformed/);
  assert.doesNotMatch(value, /30,576|33,791|3,215/);
  malformed.close();
});
test("page navigation reaches every operations view, scopes job actions and preserves tab context", () => {
  const h = pageHarness(),
    component = (tree, name) =>
      nodes(tree).find(
        (node) => typeof node.type === "function" && node.type.name === name,
      ),
    buttons = (tree) =>
      nodes(tree)
        .filter((node) => node.type === "button")
        .map(text);
  let tree = h.render();
  const coverage = component(tree, "CoverageWorkspace");
  assert.equal(coverage.props.industries, undefined);
  coverage.props.onStateChange("MD");
  coverage.props.onCategoryChange("health-care");
  component(tree, "WorkspaceTabs").props.onChange("Operations");
  tree = h.render();
  assert.equal(component(tree, "OperationsTabs").props.value, "Jobs");
  assert.match(text(tree), /Execution queue/);
  assert.ok(buttons(tree).some((label) => label.includes("Import")));
  assert.ok(buttons(tree).some((label) => label.includes("Export")));
  assert.ok(buttons(tree).some((label) => label.includes("New job")));
  for (const [tab, name] of [
    ["Collection", "DataOperations"],
    ["Evidence", "BusinessIntelligence"],
    ["Connectors", "ConnectorCatalog"],
  ]) {
    component(tree, "OperationsTabs").props.onChange(tab);
    tree = h.render();
    assert.equal(component(tree, name).type.name, name);
    assert.ok(!buttons(tree).some((label) => label.includes("Import")));
    assert.ok(!buttons(tree).some((label) => label.includes("Export")));
    assert.ok(!buttons(tree).some((label) => label.includes("New job")));
    if (tab === "Evidence") {
      assert.equal(
        component(tree, "CoverageExplorer").type.name,
        "CoverageExplorer",
      );
      assert.equal(
        component(tree, "BenchmarkReview").type.name,
        "BenchmarkReview",
      );
    }
  }
  component(tree, "WorkspaceTabs").props.onChange("ZIP Economics");
  tree = h.render();
  assert.equal(component(tree, "ZipEconomyWorkspace").props.stateCode, "MD");
  assert.equal(component(tree, "ZipEconomyWorkspace").props.initialZip, "");
  component(tree, "WorkspaceTabs").props.onChange("State Completion");
  tree = h.render();
  assert.equal(component(tree, "CoverageWorkspace").props.stateCode, "MD");
  component(tree, "WorkspaceTabs").props.onChange("Industry Summary");
  tree = h.render();
  const industries = component(tree, "CoverageWorkspace");
  assert.equal(industries.props.industries, true);
  assert.equal(industries.props.stateCode, "MD");
  assert.equal(industries.props.categoryCode, "health-care");
  component(tree, "WorkspaceTabs").props.onChange("Operations");
  tree = h.render();
  assert.equal(component(tree, "OperationsTabs").props.value, "Connectors");
  assert.equal(
    component(tree, "ConnectorCatalog").type.name,
    "ConnectorCatalog",
  );
  component(tree, "OperationsTabs").props.onChange("Jobs");
  tree = h.render();
  assert.match(text(tree), /Execution queue/);
  assert.ok(buttons(tree).some((label) => label.includes("New job")));
});
