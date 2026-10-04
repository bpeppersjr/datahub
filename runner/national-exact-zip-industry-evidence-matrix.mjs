import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";
import { verifyRetainedChildcareZipEvidence } from "./retained-childcare-zip-evidence.mjs";
import {
  DIMENSIONS as BROAD_ORG_DIMENSIONS,
  verifyBroadOrganizationZipSummary,
} from "./broad-organization-zip-summary.mjs";

export const VERSION = "national-exact-zip-industry-evidence-matrix@1.7.0";
export const ROW_VERSION =
  "national-exact-zip-industry-evidence-matrix-row@1.7.0";
const DATASET = "national-exact-zip-industry-evidence-matrix",
  SHA = /^[a-f0-9]{64}$/;
export const MAX_PREFIX_BYTES = 16_000_000;
const REPORTING_REGISTRY_MANIFEST =
  "data/business-registry/releases/national-business-registry-20260911-022652067Z-1ec656c3/manifest.json";
const REPORTING_REGISTRY_SHA =
  "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76";
const REPORTING_BUCKETS = [
  {
    path: "reporting/location-evidence/zip2=01/records.jsonl.gz",
    bytes: 265976,
    sha256: "1f6c669259d2141a7e019443a8139c6ef7655f073b1b25bb9aa8c43ade664be8",
    record_count: 1377,
  },
  {
    path: "reporting/location-evidence/zip2=02/records.jsonl.gz",
    bytes: 312406,
    sha256: "582298f71b61fe030370f01924b0facbfa89e532337b19ca087cd351fd78efe8",
    record_count: 1630,
  },
  {
    path: "reporting/location-evidence/zip2=07/records.jsonl.gz",
    bytes: 550345,
    sha256: "ad2702e0b8b405b093cef98e601529f48a037b98ed13639921093337e73dcd5e",
    record_count: 2503,
  },
  {
    path: "reporting/location-evidence/zip2=08/records.jsonl.gz",
    bytes: 344841,
    sha256: "aaef08b296c853bd95e72a9e2eb66675887e4fed92d790d2b4084774ce0d39d9",
    record_count: 1572,
  },
  {
    path: "reporting/location-evidence/zip2=37/records.jsonl.gz",
    bytes: 255055,
    sha256: "d03b9cca409bcd2cb765a3ebacc1361fe3708bdbaf4b6259ed7823588104f927",
    record_count: 1105,
  },
  {
    path: "reporting/location-evidence/zip2=38/records.jsonl.gz",
    bytes: 132370,
    sha256: "09a64cffa1e2aab52f05813ab692cd66653d096fac4af199c528f8b4b71c3ce9",
    record_count: 586,
  },
  {
    path: "reporting/location-evidence/zip2=43/records.jsonl.gz",
    bytes: 317033,
    sha256: "cddf0e0105b9b942d990132f9fc6cd99fce0be268b2666092162f59cbafc772d",
    record_count: 1429,
  },
  {
    path: "reporting/location-evidence/zip2=44/records.jsonl.gz",
    bytes: 342751,
    sha256: "acfe82aafee8518233a12c2eda940c0f133071bf62c0663ca435c50a1db44dc0",
    record_count: 1539,
  },
  {
    path: "reporting/location-evidence/zip2=45/records.jsonl.gz",
    bytes: 281473,
    sha256: "c06abbd547ad6e2ade63fcb0eaf79caaa4dfb3ef2f9b62a326efa003a60c3804",
    record_count: 1269,
  },
  {
    path: "reporting/location-evidence/zip2=unassigned/records.jsonl.gz",
    bytes: 39688,
    sha256: "0b44b999e708770c9d8cbe031652cae09bae006d7271347065e7a0088b51ea2f",
    record_count: 172,
  },
];
const REPORTING_CHILDCARE_DIMENSIONS = [
  {
    id: "childcare_ma_reporting_centers",
    source_id: "ma-licensed-center-based-childcare",
    scope: "MA",
    expected_count: 3007,
    expected_zips: 438,
    status_source_counts: {
      Current: 2561,
      "Renewal in progress": 431,
      Expired: 13,
      "Regional Enrollment Freeze": 2,
    },
    source_release_id:
      "ma-childcare-c6b4990deeedb98fb2bc384c420b2fe3c0d37892398f1596d11ca077ed2e80b5",
    source_manifest:
      "data/industry-segments/runs/ma-app-acquisition-20260907-02/state-ma-childcare-MA/releases/ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6/manifest.json",
    source_manifest_sha256:
      "c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc",
    observed_at: "2026-09-07T19:10:25.331Z",
    zip4_rows: 1113,
    coordinate_rows: 3007,
    coordinate_ineligible_rows: 0,
  },
  {
    id: "childcare_nj_reporting_centers",
    source_id: "nj-licensed-childcare-centers",
    scope: "NJ",
    expected_count: 4075,
    expected_zips: 525,
    status_source_counts: { null: 4075 },
    source_release_id:
      "nj-childcare-a9ed3d970922f919cee26a93310677b81a8319ae6ce960d83b34f607fec34f69",
    source_manifest:
      "data/business-sources/nj-licensed-childcare-centers-reprocessed/releases/nj-childcare-c79b679e-3267-4238-b4c6-6b43dbef9812/manifest.json",
    source_manifest_sha256:
      "b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e",
    observed_at: "2026-09-07T20:05:27.313Z",
    zip4_rows: 0,
    coordinate_rows: 4075,
    coordinate_ineligible_rows: 0,
  },
  {
    id: "childcare_tn_reporting_centers",
    source_id: "tn-dhs-active-childcare-centers",
    scope: "TN",
    expected_count: 1863,
    expected_zips: 327,
    status_source_counts: { Active: 1863 },
    source_release_id:
      "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
    source_manifest:
      "data/business-sources/tn-dhs-active-childcare-centers-recovered/releases/tn-childcare-recovered-307bc79c-4f4f-4c77-a349-73dfd9fb1801/manifest.json",
    source_manifest_sha256:
      "98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d",
    observed_at: "2026-09-08T00:36:36.628Z",
    zip4_rows: 259,
    coordinate_rows: 1860,
    coordinate_ineligible_rows: 0,
  },
  {
    id: "childcare_oh_reporting_centers",
    source_id: "oh-dcy-publisher-open-childcare-centers",
    scope: "OH",
    expected_count: 4237,
    expected_zips: 674,
    status_source_counts: { Open: 4237 },
    source_release_id:
      "oh-childcare-2c38df58d6d977c7e93a26d6b1e730e7850ec893b6f5a947b76d5060e1cc6e4b",
    source_manifest:
      "data/industry-segments/runs/bd35c825-a6d0-4922-8508-7954ce00f5d5/state-oh-childcare-OH/normalized/releases/oh-childcare-c253c884-2048-47f9-8d7f-5ed29531acee/manifest.json",
    source_manifest_sha256:
      "e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171",
    observed_at: null,
    earliest_observed_at: "2026-09-08T08:30:15.824Z",
    latest_observed_at: "2026-09-08T08:31:02.735Z",
    zip4_rows: 0,
    coordinate_rows: 4237,
    coordinate_ineligible_rows: 4237,
  },
];
const ZIP_STATUS_REGISTRATION =
  "config/datasets/zip-source-native-status-distribution.json";
const ZIP_STATUS_PIN = {
  release_id:
    "zip-source-native-status-f6ae96364838baab402d8bcd487cac04059f910af1b71bb9da6bf19424d50640",
  manifest_sha256:
    "0d244bf8622d83089153c142837b9078db049d7b521c34bf76471831cedfb338",
};
const ZIP_STATUS_DIMENSIONS = [
  {
    id: "ak_license_location_profiles",
    source_id: "alaska-dcced-active-business-licenses",
    release_id: "ak-active-business-licenses-2026-09-03-d77a60ab0d6e75dc",
    expected_count: 94550,
    expected_zips: 4383,
  },
  {
    id: "ca_abc_license_location_profiles",
    source_id: "california-abc-daily-active-licenses",
    release_id: "ca-abc-active-licenses-2026-09-07-4adb619cd534904b",
    expected_count: 84497,
    expected_zips: 2920,
  },
  {
    id: "chicago_license_location_profiles",
    source_id: "city-of-chicago-bacp-current-active-business-licenses",
    release_id: "chicago-active-business-licenses-2026-09-02-5509fc257e382b49",
    expected_count: 42940,
    expected_zips: 1033,
  },
  {
    id: "dc_basic_license_location_profiles",
    source_id: "dc-dlcp-active-basic-business-licenses",
    release_id: "dc-basic-business-licenses-2026-09-07-70f09a6a032c9408",
    expected_count: 54910,
    expected_zips: 3125,
  },
  {
    id: "la_registered_location_profiles",
    source_id: "los-angeles-office-of-finance-active-businesses",
    release_id: "la-active-businesses-2026-08-15-7a4190d1dfe2b2ac",
    expected_count: 633232,
    expected_zips: 5371,
  },
  {
    id: "ny_retail_food_location_profiles",
    source_id: "new-york-agriculture-markets-retail-food-stores",
    release_id: "ny-retail-food-stores-2025-09-30-9dfbb0199594dab8",
    expected_count: 24230,
    expected_zips: 1498,
  },
  {
    id: "nyc_dcwp_license_location_profiles",
    source_id: "nyc-dcwp-issued-licenses-active-premises",
    release_id: "nyc-dcwp-active-premises-2026-08-20-6c47b96b3ab94aec",
    expected_count: 31163,
    expected_zips: 1550,
  },
  {
    id: "tx_sales_tax_outlet_profiles",
    source_id: "texas-comptroller-active-sales-tax-permits",
    release_id: "tx-active-sales-tax-2026-08-29-98b90d177d81493e",
    expected_count: 885097,
    expected_zips: 2156,
  },
];
const SOURCES = [
  {
    id: "healthcare_organizations",
    registration:
      "config/datasets/national-cms-nppes-organization-practice-location-coverage.json",
    pointer:
      "data/national-cms-nppes-organization-practice-location-coverage/current.json",
    artifact: "zip5-coverage.jsonl",
    key: "code",
    countField: "practice_location_count",
    temporalPath: ["source", "source_date"],
    temporalField: "source.source_date",
    semantics:
      "NPPES enumeration evidence as of the source dissemination date; current operation is not verified.",
  },
  {
    id: "regulated_facilities",
    registration:
      "config/datasets/national-epa-echo-active-facility-coverage.json",
    pointer: "data/national-epa-echo-active-facility-coverage/current.json",
    artifact: "zip5-coverage.jsonl",
    key: "code",
    countField: "active_facility_count",
    temporalPath: ["source", "source_date"],
    temporalField: "source.source_date",
    semantics:
      "EPA source-defined active-program evidence as of the source date; current operation beyond that classification is not verified.",
  },
  {
    id: "fdic_offices",
    registration: "config/datasets/national-fdic-bankfind-coverage.json",
    pointer: "data/national-fdic-bankfind-coverage/current.json",
    artifact: "zip5-coverage.jsonl",
    key: "code",
    countField: "current_indexed_office_count",
    temporalPath: ["source", "location_index_created_at"],
    temporalField: "source.location_index_created_at",
    semantics:
      "FDIC indexed-office snapshot referenced to the retained location-index creation time; present-day operation is not verified.",
  },
  {
    id: "food_safety_establishments",
    registration:
      "config/datasets/national-fsis-active-establishment-coverage.json",
    pointer: "data/national-fsis-active-establishment-coverage/current.json",
    artifact: "zip5-coverage.jsonl",
    key: "code",
    countField: "active_establishment_count",
    temporalPath: ["source", "source_date"],
    temporalField: "source.source_date",
    semantics:
      "FSIS source-defined active-directory evidence as of the source date; current operation beyond the directory is not verified.",
  },
  {
    id: "credit_union_locations",
    registration: "config/datasets/national-ncua-credit-union-coverage.json",
    pointer: "data/national-ncua-credit-union-coverage/current.json",
    artifact: "zip5-coverage.jsonl",
    key: "code",
    countField: "scoped_location_count",
    temporalPath: ["source", "cycle_date"],
    temporalField: "source.cycle_date",
    semantics:
      "NCUA federally insured quarterly snapshot referenced to its cycle date; current operation is not verified.",
  },
  {
    id: "snap_retailers",
    registration:
      "config/datasets/national-snap-retailer-industry-coverage.json",
    pointer: "data/national-snap-retailer-industry-coverage/current.json",
    artifact: "zip5-coverage.jsonl",
    key: "zip_code",
    countField: "authorized_retailer_location_count",
    temporalPath: ["source", "source_updated_at"],
    temporalField: "source.source_updated_at",
    semantics:
      "SNAP authorization evidence as of the source update timestamp; current retail operation is not verified.",
  },
  {
    id: "pharmacy",
    registration:
      "config/datasets/national-nppes-pharmacy-registry-overlay.json",
    countField: "pharmacy_organization_count",
    temporalPath: ["claims", "active_npi_enumeration_as_of"],
    temporalField: "claims.active_npi_enumeration_as_of",
    semantics:
      "NPPES active-enumeration pharmacy taxonomy evidence as of the stated date; licensure and current operation are not verified.",
  },
  {
    id: "transportation",
    registration:
      "config/datasets/national-fmcsa-registry-industry-overlay.json",
    countField: "fmcsa_registration_principal_office_count",
    temporalPath: ["claims", "source_defined_active_fmcsa_registration_as_of"],
    temporalField: "claims.source_defined_active_fmcsa_registration_as_of",
    semantics:
      "FMCSA source-defined active-registration evidence as of the stated timestamp; current operation beyond the source is not verified.",
  },
  {
    id: "tax_exempt_organizations",
    registration:
      "config/datasets/national-irs-eo-registry-industry-overlay.json",
    countField: "organization_count",
    temporalPath: ["claims", "source_current_extract_membership_as_of"],
    temporalField: "claims.source_current_extract_membership_as_of",
    semantics:
      "IRS EO current-extract membership evidence as of the stated date; current operation is not verified.",
  },
  {
    id: "cms_hospital_directory",
    countField: "directory_rows",
    temporalPath: [
      "bindings",
      "sources",
      "hospital",
      "source_dates",
      "released",
    ],
    temporalField: "bindings.sources.hospital.source_dates.released",
    semantics:
      "Rows in the pinned retained CMS hospital directory as of its source release date; current operation is not verified.",
  },
  {
    id: "cms_nursing_home_directory",
    countField: "directory_rows",
    temporalPath: [
      "bindings",
      "sources",
      "nursing_home",
      "source_dates",
      "released",
    ],
    temporalField: "bindings.sources.nursing_home.source_dates.released",
    semantics:
      "Rows in the pinned retained CMS nursing-home directory as of its source release date; current operation is not verified.",
  },
  ...["PA", "CT", "MD", "VT", "CO", "UT", "IA"].map((publisher_scope) => ({
    id: `childcare_${publisher_scope.toLowerCase()}_candidates`,
    countField: "candidate_rows",
    publisher_scope,
    semantics: `Separate retained ${publisher_scope} childcare publisher candidate rows; source units are not merged, deduplicated, or evidence of current operation.`,
  })),
  ...REPORTING_CHILDCARE_DIMENSIONS.map((d) => ({
    id: d.id,
    countField: "reported_center_rows",
    publisher_scope: d.scope,
    reportingChildcare: true,
    semantics: `${d.scope} publisher reporting/location-evidence center rows from observed source release ${d.source_release_id}; source status labels are not verification of current operation.`,
  })),
  ...ZIP_STATUS_DIMENSIONS.map((d) => ({
    id: d.id,
    countField: "registry_location_profile_count",
    semantics: `${d.source_id} retained registry-location profiles, grouped by source-native status; not unique businesses, sites, or current operations.`,
  })),
  ...BROAD_ORG_DIMENSIONS.map((d) => ({
    id: d.id,
    countField: d.measure,
    publisher_scope: d.scope,
    semantics: `Separate retained ${d.scope} broad-organization ${d.recordKind} source-reported address rows; not businesses, establishments, or current operations.`,
    broadOrganization: true,
    dimension: d,
  })),
];
const EXACT_ZIP_DENOMINATOR_SOURCES = new Set([
  "pharmacy",
  "transportation",
  "tax_exempt_organizations",
  "cms_hospital_directory",
  "cms_nursing_home_directory",
]);
const OUTSIDE_DENOMINATOR_SOURCES = new Set([
  "healthcare_organizations",
  "regulated_facilities",
  "fdic_offices",
  "food_safety_establishments",
  "credit_union_locations",
  "snap_retailers",
]);
const STATE_LOCAL_SOURCE_IDS = new Set([
  ...["PA", "CT", "MD", "VT", "CO", "UT", "IA"].map(
    (state) => `childcare_${state.toLowerCase()}_candidates`,
  ),
  ...REPORTING_CHILDCARE_DIMENSIONS.map((dimension) => dimension.id),
  ...ZIP_STATUS_DIMENSIONS.map((dimension) => dimension.id),
  ...BROAD_ORG_DIMENSIONS.map((dimension) => dimension.id),
]);
const sourceIds = SOURCES.map((source) => source.id);
if (!(
  sourceIds.length === 39 && new Set(sourceIds).size === 39 &&
  sourceIds.every((id) => EXACT_ZIP_DENOMINATOR_SOURCES.has(id) || OUTSIDE_DENOMINATOR_SOURCES.has(id) || STATE_LOCAL_SOURCE_IDS.has(id)) &&
    EXACT_ZIP_DENOMINATOR_SOURCES.size + OUTSIDE_DENOMINATOR_SOURCES.size + STATE_LOCAL_SOURCE_IDS.size === sourceIds.length &&
    [...EXACT_ZIP_DENOMINATOR_SOURCES, ...OUTSIDE_DENOMINATOR_SOURCES, ...STATE_LOCAL_SOURCE_IDS].every((id) => sourceIds.includes(id))
)) throw Error("Exact ZIP industry matrix rejected: closed per-dimension zero-evidence contract roster.");
const ZERO_EVIDENCE_CONTRACTS = Object.freeze(Object.fromEntries(
  SOURCES.map((source) => {
    const stateLocal = STATE_LOCAL_SOURCE_IDS.has(source.id),
      outside = OUTSIDE_DENOMINATOR_SOURCES.has(source.id);
    return [source.id, Object.freeze({
      absent_cell_status: stateLocal ? "absent-from-retained-source-rows" : outside ? "outside-source-denominator" : "measured-zero",
        exact_zip_denominator: EXACT_ZIP_DENOMINATOR_SOURCES.has(source.id),
      explicit_zero_evidence_allowed: !stateLocal,
      interpretation: stateLocal
        ? `${source.semantics} This retained state/local source declares no nationwide exact-ZIP measurement denominator; an absent row means only absent-from-retained-source-rows, not measured zero or completeness. Publisher jurisdiction is not inferred from ZIP/ZCTA code.`
        : outside
          ? `${source.semantics} The source does not establish an exhaustive exact-ZIP denominator; a ZIP absent from the source index is outside-source-denominator, not zero. An explicit retained source row with count zero remains measured-zero evidence.`
          : `${source.semantics} The pinned nationwide source membership supports a zero source-row count at an exact ZIP when no row is present; this is not a zero-business or current-operation claim.`,
    })];
  }),
));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const stable = (v) => `${JSON.stringify(v)}\n`;
const check = (v, m) => {
  if (!v) throw Error(`Exact ZIP industry matrix rejected: ${m}.`);
};
async function readBoundedBytes(file, max) {
  let handle;
  try {
    handle = await fs.open(file, "r");
    const before = await handle.stat();
    check(before.isFile() && before.size <= max, "input exceeds bound");
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      check(bytesRead > 0, "input changed during bounded read");
      offset += bytesRead;
    }
    const after = await handle.stat();
    check(
      after.size === before.size && after.mtimeMs === before.mtimeMs,
      "input changed during bounded read",
    );
    return bytes;
  } finally {
    await handle?.close();
  }
}
async function readPinned(root, relative, pin, max = 100_000_000) {
  const file = path.join(root, relative),
    b = await readBoundedBytes(file, max);
  if (pin) check(hash(b) === pin, "input digest");
  let value;
  try {
    value = JSON.parse(b);
  } catch {
    check(false, "input JSON");
  }
  return { file, bytes: b.length, sha256: hash(b), value };
}
async function lines(root, relative, pin, max = 100_000_000) {
  const file = path.join(root, relative),
    b = await readBoundedBytes(file, max);
  check(hash(b) === pin, "line input integrity or bound");
  let rows;
  try {
    rows = new TextDecoder("utf-8", { fatal: true })
      .decode(b)
      .trimEnd()
      .split("\n")
      .map((x) => JSON.parse(x));
  } catch {
    check(false, "line input JSON");
  }
  return { file, bytes: b.length, sha256: hash(b), rows };
}
async function retainedChildcareReportingEvidence(root, cohortKeys) {
  const registry = await readPinned(
      root,
      REPORTING_REGISTRY_MANIFEST,
      REPORTING_REGISTRY_SHA,
      20_000_000,
    ),
    manifest = registry.value;
  check(
    manifest.release_id ===
      "national-business-registry-20260911-022652067Z-1ec656c3" &&
      manifest.dataset_id === "national-business-registry" &&
      manifest.complete_national_business_registry === false,
    "retained reporting registry identity",
  );
  const selected = manifest.artifacts.filter((a) =>
    a.path.startsWith("reporting/location-evidence/zip2="),
  );
  check(
    selected.length === REPORTING_BUCKETS.length &&
      REPORTING_BUCKETS.every((pin) => {
        const a = selected.find((item) => item.path === pin.path);
        return (
          a &&
          a.bytes === pin.bytes &&
          a.sha256 === pin.sha256 &&
          a.record_count === pin.record_count
        );
      }),
    "retained reporting bucket inventory",
  );
  const bySource = new Map(
    REPORTING_CHILDCARE_DIMENSIONS.map((d) => [
      d.source_id,
      {
        byZip: new Map(),
        status_counts: { ...d.status_source_counts },
        count: 0,
        zip4_rows: 0,
        coordinate_rows: 0,
        coordinate_ineligible_rows: 0,
        missing_zip_reasons: {},
      },
    ]),
  );
  for (const dimension of REPORTING_CHILDCARE_DIMENSIONS) {
    const sourceManifest = await readPinned(
        root,
        dimension.source_manifest,
        dimension.source_manifest_sha256,
        2_000_000,
      ),
      source = sourceManifest.value;
    check(
      source.dataset_id === dimension.source_id &&
        source.release_id ===
          path.posix.basename(path.posix.dirname(dimension.source_manifest)) &&
        source.status ===
          (dimension.scope === "OH" ? "offline-review-only" : "complete") &&
        (dimension.scope === "OH"
          ? typeof source.observed_at === "string"
          : source.observed_at === dimension.observed_at) &&
        source.counts?.accepted === dimension.expected_count,
      "reporting source manifest pin/clock",
    );
  }
  for (const pin of REPORTING_BUCKETS) {
    const input = await readBoundedBytes(
      path.join(root, REPORTING_REGISTRY_MANIFEST, "..", pin.path),
      pin.bytes,
    );
    check(
      input.length === pin.bytes && hash(input) === pin.sha256,
      "retained reporting source bucket digest",
    );
    let decoded;
    try {
      decoded = gunzipSync(input, { maxOutputLength: 16_000_000 }).toString(
        "utf8",
      );
    } catch {
      check(false, "retained reporting gzip bounds");
    }
    const rows = [];
    try {
      for (const line of decoded.trimEnd().split("\n"))
        rows.push(JSON.parse(line));
    } catch {
      check(false, "retained reporting JSONL");
    }
    check(
      rows.length === pin.record_count,
      "retained reporting source bucket rows",
    );
    for (const row of rows) {
      const id = row.source?.source_id,
        state = REPORTING_CHILDCARE_DIMENSIONS.find((d) => d.source_id === id);
      if (!state) continue;
      const target = bySource.get(id);
      check(
        row.source?.source_release_id === state.source_release_id &&
          row.evidence?.manifest_sha256 === state.source_manifest_sha256 &&
          row.identity_matching_eligible === false &&
          row.source_status?.active_business_verified === false &&
          row.export_policy === "local-review-only" &&
          row.category === "childcare",
        "reporting row authorization/provenance",
      );
      check(
        row.observed_at === state.observed_at ||
          (id === "oh-dcy-publisher-open-childcare-centers" &&
            typeof row.observed_at === "string" &&
            row.observed_at >= state.earliest_observed_at &&
            row.observed_at <= state.latest_observed_at),
        "reporting row observation semantics",
      );
      const label = row.source_status?.status_source ?? null;
      check(
        Object.hasOwn(
          state.status_source_counts,
          label === null ? "null" : label,
        ),
        "reporting status label roster",
      );
      if ((target.status_counts[label === null ? "null" : label] ?? 0) < 1)
        check(false, "reporting source status count overflow");
      target.count++;
      if (label !== null) target.status_counts[label]--;
      else target.status_counts.null--;
      if (row.address?.zip4 !== null && row.address?.zip4 !== undefined)
        target.zip4_rows++;
      if (
        row.location?.latitude !== null &&
        row.location?.latitude !== undefined &&
        row.location?.longitude !== null &&
        row.location?.longitude !== undefined
      )
        target.coordinate_rows++;
      if (row.governed_geographic_assignment_eligible === false)
        target.coordinate_ineligible_rows++;
      const zip = row.zip_code;
      if (
        typeof zip === "string" &&
        zip.length === 5 &&
        [...zip].every((ch) => ch >= "0" && ch <= "9")
      ) {
        check(cohortKeys.has(zip), "reporting ZIP outside cohort");
        const value = target.byZip.get(zip) ?? { count: 0, status_counts: {} };
        value.count++;
        const key = label === null ? "null" : label;
        value.status_counts[key] = (value.status_counts[key] ?? 0) + 1;
        target.byZip.set(zip, value);
      } else {
        check(
          zip === null && id === "tn-dhs-active-childcare-centers",
          "unexpected missing reporting ZIP",
        );
        const reason = row.evidence?.zip_unavailable_reason;
        check(
          reason === "missing-source-zip" ||
            reason === "invalid-source-zip-placeholder",
          "TN reporting ZIP quality reason",
        );
        target.missing_zip_reasons[reason] =
          (target.missing_zip_reasons[reason] ?? 0) + 1;
      }
    }
  }
  const gaps = [];
  for (const dimension of REPORTING_CHILDCARE_DIMENSIONS) {
    const data = bySource.get(dimension.source_id),
      zipRows = [...data.byZip.values()].reduce((n, v) => n + v.count, 0),
      zipUnion = data.byZip.size;
    check(
      data.count === dimension.expected_count &&
        zipRows ===
          (dimension.scope === "TN" ? 1691 : dimension.expected_count) &&
        zipUnion === dimension.expected_zips &&
        Object.values(data.status_counts).every((n) => n === 0) &&
        data.zip4_rows === dimension.zip4_rows &&
        data.coordinate_rows === dimension.coordinate_rows &&
        data.coordinate_ineligible_rows ===
          dimension.coordinate_ineligible_rows,
      "reporting childcare conservation",
    );
    if (dimension.scope === "TN")
      check(
        data.missing_zip_reasons["missing-source-zip"] === 27 &&
          data.missing_zip_reasons["invalid-source-zip-placeholder"] === 145,
        "TN reporting gap conservation",
      );
    for (const [reason, count] of Object.entries(data.missing_zip_reasons))
      gaps.push({
        zip5: null,
        quality_dimension: "source-zip",
        publisher_scope: dimension.scope,
        source_id: dimension.source_id,
        reason,
        reported_center_rows: count,
        source_release_id: dimension.source_release_id,
        source_observed_at: dimension.observed_at,
      });
  }
  const zipUnion = new Set(
    REPORTING_CHILDCARE_DIMENSIONS.flatMap((d) => [
      ...bySource.get(d.source_id).byZip.keys(),
    ]),
  );
  check(
    zipUnion.size === 1964 &&
      REPORTING_CHILDCARE_DIMENSIONS.reduce(
        (n, d) => n + bySource.get(d.source_id).count,
        0,
      ) === 13182 &&
      REPORTING_CHILDCARE_DIMENSIONS.reduce(
        (n, d) =>
          n +
          [...bySource.get(d.source_id).byZip.values()].reduce(
            (x, v) => x + v.count,
            0,
          ),
        0,
      ) === 13010,
    "reporting childcare aggregate conservation",
  );
  return {
    registration_path: REPORTING_REGISTRY_MANIFEST,
    registration_sha256: registry.sha256,
    manifest_path: REPORTING_REGISTRY_MANIFEST,
    manifest_sha256: registry.sha256,
    release_id: manifest.release_id,
    artifacts: REPORTING_BUCKETS.map(
      ({ path, bytes, sha256, record_count }) => ({
        path,
        bytes,
        sha256,
        record_count,
      }),
    ),
    dimensions: REPORTING_CHILDCARE_DIMENSIONS.map((d) => ({
      id: d.id,
      source_id: d.source_id,
      publisher_scope: d.scope,
      source_release_id: d.source_release_id,
      source_manifest: d.source_manifest,
      source_manifest_sha256: d.source_manifest_sha256,
      source_observed_at: d.observed_at,
      earliest_observed_at: d.earliest_observed_at ?? d.observed_at,
      latest_observed_at: d.latest_observed_at ?? d.observed_at,
      measure: "reported_center_rows",
      row_unit: "publisher-reported-center-row",
      export_policy: "local-review-only",
      identity_matching_eligible: false,
      active_business_verified: false,
      source_status_counts: d.status_source_counts,
      zip_count: d.expected_zips,
      accepted_rows: d.expected_count,
      zip4_rows: d.zip4_rows,
      coordinate_rows: d.coordinate_rows,
      coordinate_ineligible_rows: d.coordinate_ineligible_rows,
    })),
    byZip: new Map(
      [...zipUnion].map((zip) => [
        zip,
        Object.fromEntries(
          REPORTING_CHILDCARE_DIMENSIONS.map((d) => [
            d.id,
            bySource.get(d.source_id).byZip.get(zip) ?? {
              count: 0,
              status_counts: {},
            },
          ]),
        ),
      ]),
    ),
    quality_gaps: gaps,
    summary: {
      reported_center_rows: 13182,
      zip_bearing_center_rows: 13010,
      zip_union: 1964,
      out_of_cohort_zip_rows: 0,
      zip4_rows: REPORTING_CHILDCARE_DIMENSIONS.reduce(
        (n, d) => n + d.zip4_rows,
        0,
      ),
      coordinate_rows: REPORTING_CHILDCARE_DIMENSIONS.reduce(
        (n, d) => n + d.coordinate_rows,
        0,
      ),
      coordinate_assignment_ineligible_rows:
        REPORTING_CHILDCARE_DIMENSIONS.reduce(
          (n, d) => n + d.coordinate_ineligible_rows,
          0,
        ),
    },
  };
}
export async function validateRetainedChildcareReportingContract(
  root = APP_ROOT,
) {
  root = path.resolve(root);
  const cohortRegistration = await readPinned(
      root,
      "config/datasets/zip-denominator-gap-cohort.json",
    ),
    retained = cohortRegistration.value.retained_release,
    cohortManifest = await readPinned(
      root,
      retained.manifest,
      retained.manifest_sha256,
    ),
    descriptor = cohortManifest.value.artifacts.find(
      (artifact) => artifact.path === "cohort.jsonl",
    );
  check(
    descriptor?.sha256 === retained.cohort_sha256,
    "reporting fixture cohort pin",
  );
  const cohort = await lines(
    root,
    path.posix.join(path.posix.dirname(retained.manifest), descriptor.path),
    descriptor.sha256,
  );
  return retainedChildcareReportingEvidence(
    root,
    new Set(cohort.rows.map((row) => row.zip5)),
  );
}
const at = (value, parts) =>
  parts.reduce((current, key) => current?.[key], value);
function temporal(spec, manifest) {
  const reference = at(manifest, spec.temporalPath),
    valid =
      typeof reference === "string" &&
      /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(reference);
  return {
    status: valid
      ? "source-referenced-current-operation-unverified"
      : "source-reference-unresolved",
    source_reference_field: spec.temporalField,
    source_reference_date: valid ? reference : null,
    current_operation_verified: false,
    semantics: valid
      ? spec.semantics
      : `${spec.semantics} The pinned source did not provide a valid reference date, so temporal applicability is unresolved.`,
  };
}
export async function nativeStatusEvidence(root, cohortKeys) {
  const registration = await readPinned(root, ZIP_STATUS_REGISTRATION),
    rr = registration.value.retained_release;
  check(
    registration.value.dataset_id === "zip-source-native-status-distribution" &&
      registration.value.status === "registered-local-derived-evidence" &&
      registration.value.runtime_pointer === null &&
      registration.value.production_enrollment === false &&
      registration.value.current_pointer_written === false &&
      registration.value.export_policy === "local-review-only" &&
      registration.value.claims?.source_native_status_only === true &&
      registration.value.claims?.general_current_operation_verified === false &&
      registration.value.claims?.active_business_count === null &&
      registration.value.claims?.all_business_completion_percent === null &&
      rr.release_id === ZIP_STATUS_PIN.release_id &&
      rr.manifest_sha256 === ZIP_STATUS_PIN.manifest_sha256,
    "native status registration pin/policy",
  );
  const manifestRead = await readPinned(
      root,
      rr.manifest,
      ZIP_STATUS_PIN.manifest_sha256,
      1_100_000,
    ),
    manifest = manifestRead.value;
  check(
    manifest.schema_version === "zip-source-native-status-distribution@1.0.0" &&
      manifest.dataset_id === "zip-source-native-status-distribution" &&
      manifest.release_id === ZIP_STATUS_PIN.release_id &&
      manifest.status === "immutable-local-derived-release" &&
      manifest.export_policy === "local-review-only" &&
      manifest.claims?.source_native_status_only === true &&
      manifest.claims?.general_current_operation_verified === false &&
      manifest.claims?.active_business_count === null &&
      manifest.claims?.network_requests === 0 &&
      manifest.claims?.current_pointer_written === false &&
      manifest.claims?.production_enrollment === false &&
      manifest.counts?.profiles === 8011835 &&
      manifest.counts?.sources === 15 &&
      manifest.counts?.status_groups === 232092 &&
      manifest.counts?.buckets === 200,
    "native status manifest contract",
  );
  const statusKinds = ["present", "empty-object", "missing", "null"],
    sourceRows = new Map(ZIP_STATUS_DIMENSIONS.map((d) => [d.id, new Map()])),
    sourceTotals = new Map(
      ZIP_STATUS_DIMENSIONS.map((d) => [
        d.id,
        {
          count: 0,
          zips: new Set(),
          status_counts: Object.fromEntries(statusKinds.map((k) => [k, 0])),
        },
      ]),
    ),
    specBySource = new Map(ZIP_STATUS_DIMENSIONS.map((d) => [d.source_id, d]));
  const artifacts = manifest.artifacts,
    dataArtifacts = artifacts.filter((a) => /^zip-\d{2}\.jsonl$/.test(a.path)),
    indexArtifacts = artifacts.filter((a) =>
      /^index-\d{2}\.json$/.test(a.path),
    );
  check(
    artifacts.length === 200 &&
      dataArtifacts.length === 100 &&
      indexArtifacts.length === 100 &&
      manifest.source_conservation.length === 15,
    "native status bucket inventory",
  );
  for (const d of ZIP_STATUS_DIMENSIONS) {
    const native = manifest.source_conservation.find(
      (s) => s.source_id === d.source_id,
    );
    check(
      native &&
        native.source_release_id === d.release_id &&
        native.records === d.expected_count &&
        native.records ===
          native.status_present +
            native.status_empty +
            native.status_missing +
            native.status_null &&
        native.observed_at_present + native.observed_at_missing ===
          native.records &&
        typeof native.canonical_status_distribution_sha256 === "string" &&
        SHA.test(native.canonical_status_distribution_sha256),
      "native source conservation",
    );
    d.source_conservation = native;
  }
  for (const descriptor of dataArtifacts) {
    check(
      SHA.test(descriptor.sha256) &&
        Number.isSafeInteger(descriptor.record_count) &&
        descriptor.record_count >= 0 &&
        descriptor.bytes <= 16_777_216,
      "native status ZIP2 descriptor",
    );
    const file = path.posix.join(
        path.posix.dirname(rr.manifest),
        descriptor.path,
      ),
      bytes = await fs.readFile(path.join(root, file));
    check(
      bytes.length === descriptor.bytes && hash(bytes) === descriptor.sha256,
      "native status ZIP2 byte count/integrity",
    );
    const rows = bytes.length
      ? new TextDecoder("utf-8", { fatal: true })
          .decode(bytes)
          .trimEnd()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    check(
      rows.length === descriptor.record_count,
      "native status ZIP2 row count",
    );
    for (const row of rows) {
      check(
        Object.keys(row).sort().join("|") ===
          "count|count_unit|source_id|source_release_id|status_kind|status_sha256|zip5" &&
          Number.isSafeInteger(row.count) &&
          row.count > 0 &&
          row.count_unit === "registry-location-profile" &&
          /^\d{5}$/.test(row.zip5) &&
          SHA.test(row.status_sha256) &&
          statusKinds.includes(row.status_kind),
        "native status grouped ZIP row",
      );
      const d = specBySource.get(row.source_id);
      if (!d) continue;
      check(
        row.source_release_id === d.release_id,
        "native source release mismatch",
      );
      const sourceRowsByZip = sourceRows.get(d.id),
        byStatus = sourceRowsByZip.get(row.zip5) ?? {
          count: 0,
          status_counts: Object.fromEntries(statusKinds.map((k) => [k, 0])),
        };
      byStatus.count += row.count;
      byStatus.status_counts[row.status_kind] += row.count;
      sourceRowsByZip.set(row.zip5, byStatus);
      const total = sourceTotals.get(d.id);
      total.count += row.count;
      total.zips.add(row.zip5);
      total.status_counts[row.status_kind] += row.count;
    }
  }
  const cohort = new Set(cohortKeys);
  const sources = ZIP_STATUS_DIMENSIONS.map((d) => {
    const total = sourceTotals.get(d.id),
      conservation = d.source_conservation,
      sourceReferenceDate =
        d.release_id.match(/-(\d{4}-\d{2}-\d{2})-/)?.[1] ?? null;
    check(
      total.count === d.expected_count &&
        total.zips.size === d.expected_zips &&
        Object.entries(total.status_counts).every(
          ([kind, count]) =>
            count === conservation[`status_${kind.replace("-object", "")}`],
        ),
      "native status source/profile conservation",
    );
    check(
      [...total.zips].every((zip) => cohort.has(zip)),
      "native profile ZIP outside cohort",
    );
    return {
      id: d.id,
      source_id: d.source_id,
      source_release_id: d.release_id,
      measure: "registry_location_profile_count",
      count_unit: "registry-location-profile",
      expected_count: d.expected_count,
      zip_count: d.expected_zips,
      source_reference_date: sourceReferenceDate,
      source_reference_basis:
        "date token in pinned native source release ID; not an observed-at or refresh timestamp",
      source_refresh_at: null,
      source_refresh_asserted: false,
      observation: {
        earliest_observed_at: conservation.earliest_observed_at,
        latest_observed_at: conservation.latest_observed_at,
        observed_at_present: conservation.observed_at_present,
        observed_at_missing: conservation.observed_at_missing,
      },
      source_status_counts: total.status_counts,
      temporal_status: {
        status: "source-referenced-current-operation-unverified",
        source_reference_field: "source_release_id.date_token",
        source_reference_date: sourceReferenceDate,
        current_operation_verified: false,
        semantics:
          "Retained registry-location profiles grouped by exact source-native status; not unique businesses, sites, or current operations.",
      },
    };
  });
  const zipUnion = new Set();
  for (const rows of sourceRows.values())
    for (const zip of rows.keys()) zipUnion.add(zip);
  check(
    zipUnion.size === 12454 &&
      [...zipUnion].every((zip) => cohort.has(zip)) &&
      sources.reduce((n, s) => n + s.expected_count, 0) === 1850619,
    "native status cohort union conservation",
  );
  check(
    sources.find((s) => s.id === "ny_retail_food_location_profiles")
      .source_reference_date === "2025-09-30" &&
      sources.find((s) => s.id === "la_registered_location_profiles")
        .source_status_counts.null === 633232 &&
      sources.find((s) => s.id === "la_registered_location_profiles")
        .source_status_counts.present === 0 &&
      sources.reduce((n, s) => n + s.source_status_counts.present, 0) ===
        1217387,
    "native status clocks and status-kind conservation",
  );
  return {
    registration_path: ZIP_STATUS_REGISTRATION,
    registration_sha256: registration.sha256,
    manifest_path: rr.manifest,
    manifest_sha256: manifestRead.sha256,
    release_id: rr.release_id,
    created_at: manifest.created_at,
    artifact_count: artifacts.length,
    artifact_bytes: artifacts.reduce((n, a) => n + a.bytes, 0),
    artifact_inventory_sha256: hash(JSON.stringify(artifacts)),
    profile_count: manifest.counts.profiles,
    source_count: manifest.counts.sources,
    status_group_count: manifest.counts.status_groups,
    zip_union_count: zipUnion.size,
    out_of_cohort_zip_count: 0,
    source_release_bindings: sources,
    sourceRows,
    zip_union: [...zipUnion].sort(),
  };
}
export function projectOutOfCohortSourceZipGaps(cohortZip5s, sources) {
  check(
    Array.isArray(cohortZip5s) && Array.isArray(sources),
    "out-of-cohort inputs",
  );
  const cohort = new Set(cohortZip5s),
    gaps = [];
  for (const source of sources) {
    check(
      typeof source.id === "string" &&
        source.id.length > 0 &&
        typeof source.release_id === "string" &&
        typeof source.measure === "string" &&
        Array.isArray(source.rows),
      "out-of-cohort source",
    );
    for (const row of source.rows) {
      check(
        /^\d{5}$/.test(row.zip5) &&
          Number.isSafeInteger(row.count) &&
          row.count >= 0,
        "out-of-cohort ZIP count",
      );
      if (!cohort.has(row.zip5) && row.count > 0)
        gaps.push({
          zip5: row.zip5,
          source_id: source.id,
          ...(source.publisher_scope
            ? { publisher_scope: source.publisher_scope }
            : {}),
          count: row.count,
          measure: source.measure,
          source_release_id: source.release_id,
          temporal_status: {
            status: source.temporal_status.status,
            source_reference_date: source.temporal_status.source_reference_date,
          },
        });
    }
  }
  return gaps.sort(
    (a, b) =>
      a.zip5.localeCompare(b.zip5) || a.source_id.localeCompare(b.source_id),
  );
}
async function inputs(root) {
  const cohortReg = await readPinned(
    root,
    "config/datasets/zip-denominator-gap-cohort.json",
  );
  const cr = cohortReg.value.retained_release;
  check(
    cr.rows === 48194 &&
      SHA.test(cr.manifest_sha256) &&
      SHA.test(cr.cohort_sha256),
    "cohort registration",
  );
  const cohortManifest = await readPinned(
    root,
    cr.manifest,
    cr.manifest_sha256,
  );
  const ca = cohortManifest.value.artifacts.find(
    (a) => a.path === "cohort.jsonl",
  );
  check(
    ca?.sha256 === cr.cohort_sha256 && ca.record_count === 48194,
    "cohort artifact",
  );
  const cohort = await lines(
    root,
    path.posix.join(path.posix.dirname(cr.manifest), ca.path),
    ca.sha256,
  );
  const sources = [];
  for (const spec of SOURCES.filter((source) => source.registration)) {
    const { id, registration, countField } = spec,
      reg = await readPinned(root, registration);
    let manifestPath,
      manifestPin,
      releaseId,
      pointer_sha256 = null,
      artifactName = "zip5-overlay.jsonl";
    if (spec.pointer) {
      const pointer = await readPinned(root, spec.pointer);
      check(
        pointer.value.dataset_id === reg.value.dataset_id &&
          /^[a-z0-9-]+$/.test(pointer.value.release_id) &&
          pointer.value.manifest ===
            `releases/${pointer.value.release_id}/manifest.json` &&
          SHA.test(pointer.value.manifest_sha256),
        "source pointer",
      );
      manifestPath = path.posix.join(
        path.posix.dirname(spec.pointer),
        pointer.value.manifest,
      );
      manifestPin = pointer.value.manifest_sha256;
      releaseId = pointer.value.release_id;
      pointer_sha256 = pointer.sha256;
      artifactName = spec.artifact;
    } else {
      const rr = reg.value.retained_release;
      check(
        reg.value.runtime_pointer === null &&
          reg.value.production_enrollment === false &&
          SHA.test(rr.manifest_sha256) &&
          /^data\/[a-z0-9-]+\/releases\/[a-z0-9-]+\/manifest\.json$/.test(
            rr.manifest,
          ),
        "source registration",
      );
      manifestPath = rr.manifest;
      manifestPin = rr.manifest_sha256;
      releaseId = rr.release_id;
    }
    const manifest = await readPinned(root, manifestPath, manifestPin);
    check(manifest.value.release_id === releaseId, "source release");
    const a = manifest.value.artifacts.find((a) => a.path === artifactName);
    check(
      a && SHA.test(a.sha256) && a.record_count <= 48194,
      "source ZIP artifact",
    );
    const overlay = await lines(
      root,
      path.posix.join(path.posix.dirname(manifestPath), a.path),
      a.sha256,
    );
    sources.push({
      id,
      countField,
      key: spec.key ?? "zip5",
      registration,
      registration_sha256: reg.sha256,
      pointer_path: spec.pointer ?? null,
      pointer_sha256,
      manifest_path: manifestPath,
      manifest_sha256: manifest.sha256,
      release_id: releaseId,
      artifact_path: a.path,
      artifact_sha256: a.sha256,
      temporal_status: temporal(spec, manifest.value),
      rows: overlay.rows,
    });
  }
  const cmsReg = await readPinned(
    root,
    "config/datasets/cms-retained-directory-zip-evidence.json",
  );
  check(
    cmsReg.value.dataset_id === "cms-retained-directory-zip-evidence" &&
      cmsReg.value.runtime_pointer === null &&
      cmsReg.value.production_enrollment === false &&
      cmsReg.value.national_reporting_denominator_enrollment === false &&
      cmsReg.value.current_pointer_written === false &&
      cmsReg.value.export_policy === "local-review-only" &&
      cmsReg.value.claims?.network_requests === 0 &&
      cmsReg.value.claims?.current_operating_count === null &&
      cmsReg.value.claims?.business_count === null,
    "CMS ZIP registration policy",
  );
  const cmsRelease = cmsReg.value.retained_release;
  check(
    cmsRelease?.manifest && SHA.test(cmsRelease.manifest_sha256),
    "CMS ZIP registration pin",
  );
  const cmsManifest = await readPinned(
      root,
      cmsRelease.manifest,
      cmsRelease.manifest_sha256,
    ),
    cm = cmsManifest.value,
    { release_id: cmsId, ...cmsBody } = cm;
  check(
    cmsId === cmsRelease.release_id &&
      cmsId ===
        `cms-retained-directory-zip-evidence-${hash(JSON.stringify(cmsBody))}` &&
      cm.schema_version === "cms-retained-directory-zip-evidence@1.0.0" &&
      cm.status === "published-pre-production-evidence" &&
      JSON.stringify(cm.claims) === JSON.stringify(cmsReg.value.claims) &&
      cmsManifest.bytes === cmsRelease.manifest_bytes &&
      cm.schema_version === cmsRelease.manifest_schema_version &&
      cm.created_at === cmsRelease.created_at &&
      JSON.stringify(cm.bindings) === JSON.stringify(cmsRelease.bindings) &&
      JSON.stringify(cm.summary) === JSON.stringify(cmsRelease.summary) &&
      cm.indexed_zip_count === cmsRelease.indexed_zip_count &&
      cm.artifacts.length === cmsRelease.artifact_count &&
      cm.artifacts.reduce((n, a) => n + a.bytes, 0) ===
        cmsRelease.artifact_bytes &&
      hash(JSON.stringify(cm.artifacts)) ===
        cmsRelease.artifact_inventory_sha256 &&
      cm.claims?.production_enrollment === false &&
      cm.claims?.current_pointer_written === false &&
      cm.claims?.network_requests === 0,
    "CMS ZIP release identity/policy",
  );
  const cohortKeys = new Set(cohort.rows.map((row) => row.zip5)),
    cmsByZip = new Map(),
    cmsArtifacts = [];
  let hospitalRows = 0,
    nursingRows = 0,
    indexedZipCount = 0,
    priorArtifact = "";
  for (const a of cm.artifacts) {
    check(
      /^zip-\d{2}\.json$/.test(a.path) &&
        a.path > priorArtifact &&
        SHA.test(a.sha256),
      "CMS ZIP descriptor",
    );
    priorArtifact = a.path;
    const bucket = await readPinned(
      root,
      path.posix.join(path.posix.dirname(cmsRelease.manifest), a.path),
      a.sha256,
      2_000_000,
    );
    check(
      Array.isArray(bucket.value) && bucket.value.length === a.zip_count,
      "CMS ZIP bucket",
    );
    cmsArtifacts.push({
      path: a.path,
      bytes: bucket.bytes,
      sha256: bucket.sha256,
      zip_count: a.zip_count,
    });
    let previous = "";
    for (const row of bucket.value) {
      check(
        /^\d{5}$/.test(row.zip5) &&
          row.zip5 !== "00000" &&
          row.zip5 > previous &&
          row.zip5.slice(0, 2) === a.path.slice(4, 6) &&
          row.zip4 === null &&
          row.hospital &&
          row.nursing_home,
        "CMS ZIP row schema/order",
      );
      previous = row.zip5;
      for (const kind of ["hospital", "nursing_home"]) {
        const value = row[kind];
        check(
          Number.isSafeInteger(value.directory_rows) &&
            value.directory_rows >= 0 &&
            value.reported_states &&
            Object.entries(value.reported_states).every(
              ([key, n]) =>
                (key === "missing" ||
                  /^reported:[^\u0000-\u001f]{0,32}$/u.test(key)) &&
                Number.isSafeInteger(n) &&
                n > 0,
            ) &&
            Object.values(value.reported_states).reduce(
              (sum, n) => sum + n,
              0,
            ) === value.directory_rows,
          "CMS category conservation",
        );
        if (kind === "hospital") hospitalRows += value.directory_rows;
        else nursingRows += value.directory_rows;
      }
      check(
        row.hospital.directory_rows + row.nursing_home.directory_rows > 0,
        "empty CMS ZIP row",
      );
      cmsByZip.set(row.zip5, row);
    }
    indexedZipCount += bucket.value.length;
  }
  check(
    indexedZipCount === cm.indexed_zip_count &&
      indexedZipCount === cmsRelease.indexed_zip_count &&
      hospitalRows === cm.summary.hospital.directory_rows &&
      nursingRows === cm.summary.nursing_home.directory_rows &&
      cmsArtifacts.length === cmsRelease.artifact_count,
    "CMS ZIP source conservation",
  );
  for (const kind of ["hospital", "nursing_home"]) {
    const id =
        kind === "hospital"
          ? "cms_hospital_directory"
          : "cms_nursing_home_directory",
      spec = SOURCES.find((source) => source.id === id);
    sources.push({
      id,
      countField: spec.countField,
      key: "zip5",
      registration: "config/datasets/cms-retained-directory-zip-evidence.json",
      registration_sha256: cmsReg.sha256,
      pointer_path: null,
      pointer_sha256: null,
      manifest_path: cmsRelease.manifest,
      manifest_sha256: cmsManifest.sha256,
      release_id: cm.release_id,
      artifact_path: "zip-*.json",
      artifact_sha256: hash(JSON.stringify(cmsArtifacts)),
      source_index_artifacts: cmsArtifacts,
      temporal_status: temporal(spec, cm),
    });
  }
  const childcareReg = await readPinned(
    root,
    "config/datasets/retained-childcare-zip-evidence.json",
  );
  check(
    childcareReg.value.dataset_id === "retained-childcare-zip-evidence" &&
      childcareReg.value.runtime_pointer === null &&
      childcareReg.value.production_enrollment === false &&
      childcareReg.value.national_denominator_enrollment === false &&
      childcareReg.value.claims?.export_policy === "internal" &&
      childcareReg.value.claims?.network_requests === 0 &&
      childcareReg.value.claims?.current_pointer_written === false &&
      childcareReg.value.claims?.production_enrollment === false &&
      childcareReg.value.claims?.national_denominator_enrollment === false &&
      childcareReg.value.claims?.deduplicated_business_count === null &&
      childcareReg.value.claims?.physical_site_count === null &&
      childcareReg.value.claims?.current_operating_count === null &&
      childcareReg.value.claims?.public_export_authorized === false,
    "childcare registration policy",
  );
  const childcareRelease = childcareReg.value.retained_release;
  check(
    childcareRelease?.manifest && SHA.test(childcareRelease.manifest_sha256),
    "childcare registration pin",
  );
  const childcareManifest = await readPinned(
      root,
      childcareRelease.manifest,
      childcareRelease.manifest_sha256,
      1_000_000,
    ),
    ch = childcareManifest.value,
    { release_id: childcareId, ...childcareBody } = ch;
  check(
    childcareId === childcareRelease.release_id &&
      childcareId ===
        `retained-childcare-zip-evidence-${hash(JSON.stringify(childcareBody))}` &&
      ch.schema_version === "retained-childcare-zip-evidence@1.1.0" &&
      ch.status === "published-pre-production-evidence" &&
      ch.publication_mode === "immutable-pointer-free" &&
      JSON.stringify(ch.claims) === JSON.stringify(childcareReg.value.claims) &&
      childcareManifest.bytes === childcareRelease.manifest_bytes &&
      ch.created_at === childcareRelease.created_at &&
      JSON.stringify(ch.bindings) ===
        JSON.stringify(childcareRelease.bindings) &&
      JSON.stringify(ch.sources) === JSON.stringify(childcareRelease.sources) &&
      JSON.stringify(ch.summary) === JSON.stringify(childcareRelease.summary) &&
      ch.root_view_sha256 === childcareRelease.root_view_sha256 &&
      ch.artifacts.length === childcareRelease.artifact_count &&
      ch.artifacts.reduce((n, a) => n + a.bytes, 0) ===
        childcareRelease.artifact_bytes &&
      hash(JSON.stringify(ch.artifacts)) ===
        childcareRelease.artifact_inventory_sha256,
    "childcare manifest identity",
  );
  const childcareVerification = await verifyRetainedChildcareZipEvidence(
    path.join(root, childcareRelease.manifest),
  );
  check(
    childcareVerification.verified === true &&
      childcareVerification.release_id === childcareRelease.release_id &&
      childcareVerification.manifest_sha256 ===
        childcareRelease.manifest_sha256 &&
      JSON.stringify(childcareVerification.summary) ===
        JSON.stringify(ch.summary),
    "childcare independent source replay",
  );
  const publisherScopes = ["PA", "CT", "MD", "VT", "CO", "UT", "IA"],
    childcareByZip = new Map(),
    childcareArtifacts = [],
    childcareTotals = Object.fromEntries(
      publisherScopes.map((scope) => [scope, 0]),
    );
  let childcareZipCount = 0,
    childcareRootFound = false,
    priorChildcareArtifact = "";
  for (const a of ch.artifacts) {
    check(
      SHA.test(a.sha256) && Number.isSafeInteger(a.bytes) && a.bytes >= 0,
      "childcare artifact descriptor",
    );
    if (a.path === "cohort-root.json") {
      const rootArtifact = await readPinned(
        root,
        path.posix.join(path.posix.dirname(childcareRelease.manifest), a.path),
        a.sha256,
        2_000_000,
      );
      check(
        rootArtifact.bytes === a.bytes && a.record_count === 7,
        "childcare root artifact",
      );
      childcareArtifacts.push({
        path: a.path,
        bytes: rootArtifact.bytes,
        sha256: rootArtifact.sha256,
        record_count: a.record_count,
      });
      childcareRootFound = true;
      continue;
    }
    check(
      /^zip-\d{2}\.json$/.test(a.path) && a.path > priorChildcareArtifact,
      "childcare ZIP artifact descriptor",
    );
    priorChildcareArtifact = a.path;
    const bucket = await readPinned(
      root,
      path.posix.join(path.posix.dirname(childcareRelease.manifest), a.path),
      a.sha256,
      2_000_000,
    );
    check(
      Array.isArray(bucket.value) && bucket.value.length === a.record_count,
      "childcare ZIP bucket",
    );
    childcareArtifacts.push({
      path: a.path,
      bytes: bucket.bytes,
      sha256: bucket.sha256,
      record_count: a.record_count,
    });
    let previous = "";
    for (const row of bucket.value) {
      check(
        /^\d{5}$/.test(row.zip5) &&
          row.zip5 !== "00000" &&
          row.zip5 > previous &&
          row.zip5.slice(0, 2) === a.path.slice(4, 6) &&
          row.zip4 === null &&
          Array.isArray(row.sources),
        "childcare ZIP row schema/order",
      );
      previous = row.zip5;
      const counts = Object.fromEntries(
        publisherScopes.map((scope) => [scope, 0]),
      );
      for (const sourceRow of row.sources) {
        check(
          publisherScopes.includes(sourceRow.publisher_scope) &&
            sourceRow.source_id ===
              ch.sources[sourceRow.publisher_scope]?.source_id &&
            Number.isSafeInteger(sourceRow.candidate_rows) &&
            sourceRow.candidate_rows > 0 &&
            (sourceRow.reported_state === null ||
              (typeof sourceRow.reported_state === "string" &&
                /^[A-Z]{2}$/.test(sourceRow.reported_state))) &&
            (!["VT", "IA"].includes(sourceRow.publisher_scope) ||
              sourceRow.reported_state === null),
          "childcare source row",
        );
        counts[sourceRow.publisher_scope] += sourceRow.candidate_rows;
      }
      for (const scope of publisherScopes)
        childcareTotals[scope] += counts[scope];
      childcareByZip.set(row.zip5, counts);
    }
    childcareZipCount += bucket.value.length;
  }
  check(
    childcareRootFound &&
      childcareZipCount === ch.summary.indexed_zip_count &&
      childcareZipCount === childcareRelease.summary.indexed_zip_count &&
      childcareArtifacts.length === ch.artifacts.length,
    "childcare artifact conservation",
  );
  for (const publisher_scope of publisherScopes) {
    const id = `childcare_${publisher_scope.toLowerCase()}_candidates`,
      spec = SOURCES.find((source) => source.id === id),
      publisher = ch.sources[publisher_scope],
      updated = publisher.provenance.source_updated_at,
      cohortDate = publisher.provenance.publisher_cohort_date,
      reference =
        typeof updated === "string" && /^\d{4}-\d{2}-\d{2}/.test(updated)
          ? updated
          : typeof cohortDate === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(cohortDate)
            ? cohortDate
            : null,
      temporal_status = {
        status: reference
          ? "source-referenced-current-operation-unverified"
          : "source-reference-unresolved",
        source_reference_field: updated
          ? "provenance.source_updated_at"
          : cohortDate
            ? "provenance.publisher_cohort_date"
            : publisher.provenance.report_edition
              ? "provenance.report_edition"
              : "provenance.source_updated_at",
        source_reference_date: reference,
        current_operation_verified: false,
        semantics: spec.semantics,
      };
    check(
      publisher.status === "available" &&
        publisher.publisher_scope === publisher_scope &&
        childcareTotals[publisher_scope] === publisher.quality.with_zip5 &&
        publisher.source_claims.export_policy === "internal" &&
        publisher.source_claims.national_reporting_integrated === false &&
        publisher.source_claims.public_export_authorized === false,
      "childcare publisher conservation/policy",
    );
    sources.push({
      id,
      countField: "candidate_rows",
      key: "zip5",
      registration: "config/datasets/retained-childcare-zip-evidence.json",
      registration_sha256: childcareReg.sha256,
      pointer_path: null,
      pointer_sha256: null,
      manifest_path: childcareRelease.manifest,
      manifest_sha256: childcareManifest.sha256,
      release_id: ch.release_id,
      artifact_path: "zip-*.json",
      artifact_sha256: hash(JSON.stringify(childcareArtifacts)),
      publisher_scope,
      source_id: publisher.source_id,
      row_unit: publisher.source_claims.row_unit,
      export_policy: publisher.source_claims.export_policy,
      accepted_candidate_rows: publisher.accepted_candidate_rows,
      temporal_status,
    });
  }
  check(
    ch.summary.accepted_candidate_rows === 12206 &&
      ch.summary.zip_present_candidate_rows ===
        childcareTotals.PA +
          childcareTotals.CT +
          childcareTotals.MD +
          childcareTotals.VT +
          childcareTotals.CO +
          childcareTotals.UT +
          childcareTotals.IA &&
      ch.summary.missing_zip_candidate_rows === 0 &&
      ch.summary.invalid_zip_candidate_rows === 1 &&
      ch.summary.invalid_zip_buckets.length === 1,
    "childcare cohort conservation",
  );
  const childcareQualityGaps = ch.summary.invalid_zip_buckets.map((gap) => {
    check(
      gap.reason === "invalid-source-zip-range" &&
        gap.publisher_scope === "MD" &&
        gap.source_id === ch.sources.MD.source_id &&
        gap.candidate_rows === 1,
      "explicit childcare quality gap",
    );
    return {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: gap.publisher_scope,
      source_id: gap.source_id,
      reason: gap.reason,
      candidate_rows: gap.candidate_rows,
      source_release_id: ch.release_id,
      source_reference_date: ch.sources.MD.provenance.source_updated_at,
    };
  });
  const broadRegistrationPath =
      "config/datasets/national-broad-organization-zip-summary.json",
    broadReg = await readPinned(root, broadRegistrationPath);
  check(
    broadReg.value.dataset_id === "national-broad-organization-zip-summary" &&
      broadReg.value.runtime_pointer === null &&
      broadReg.value.production_enrollment === false &&
      broadReg.value.claims?.network_requests === 0 &&
      broadReg.value.claims?.acquisition_performed === false &&
      broadReg.value.claims?.current_pointer_written === false,
    "broad organization summary registration policy",
  );
  const broadRelease = broadReg.value.retained_release;
  check(
    broadRelease?.manifest &&
      SHA.test(broadRelease.manifest_sha256) &&
      /^data\/national-broad-organization-zip-summary\/releases\/[a-z0-9-]+\/manifest\.json$/.test(
        broadRelease.manifest,
      ),
    "broad organization summary pin",
  );
  const broadManifestRead = await readPinned(
      root,
      broadRelease.manifest,
      broadRelease.manifest_sha256,
      2_000_000,
    ),
    bm = broadManifestRead.value;
  check(
    bm.release_id === broadRelease.release_id &&
      bm.dataset_id === "national-broad-organization-zip-summary" &&
      bm.schema_version === "broad-organization-zip-summary@1.0.0" &&
      bm.status === "immutable-local-review-only" &&
      bm.publication_mode === "pointer-free" &&
      bm.claims?.source_acquisition_performed === false &&
      bm.claims?.network_requests === 0 &&
      bm.claims?.identity_merges === false &&
      bm.claims?.current_operation_verified === false &&
      bm.claims?.production_enrollment === false &&
      bm.claims?.current_pointer_written === false,
    "broad organization summary release policy",
  );
  const broadVerification = await verifyBroadOrganizationZipSummary(
    path.join(root, broadRelease.manifest),
    { root },
  );
  check(
    broadVerification.verified &&
      broadVerification.manifest_sha256 === broadRelease.manifest_sha256 &&
      broadVerification.zip5_union_rows === 30802 &&
      broadVerification.out_of_cohort_zip_rows === 0,
    "broad organization summary full source replay",
  );
  const broadByZip = new Map(),
    broadArtifacts = [];
  let broadUnion = 0,
    priorBroadArtifact = "";
  for (const a of bm.artifacts) {
    check(
      /^zip-prefix=\d{2}\.json$/.test(a.path) &&
        a.path > priorBroadArtifact &&
        SHA.test(a.sha256),
      "broad organization ZIP summary descriptor",
    );
    priorBroadArtifact = a.path;
    const bucket = await readPinned(
      root,
      path.posix.join(path.posix.dirname(broadRelease.manifest), a.path),
      a.sha256,
      10_000_000,
    );
    check(
      Array.isArray(bucket.value) &&
        bucket.value.length === a.record_count &&
        bucket.bytes === a.bytes,
      "broad organization bounded prefix bucket",
    );
    broadArtifacts.push({
      path: a.path,
      bytes: bucket.bytes,
      sha256: bucket.sha256,
      record_count: a.record_count,
    });
    let previous = "";
    for (const row of bucket.value) {
      check(
        /^\d{5}$/.test(row.zip5) &&
          row.zip5 > previous &&
          row.zip5.slice(0, 2) === a.path.slice(11, 13) &&
          row.zip4 === null &&
          row.counts &&
          Object.keys(row.counts).join("|") ===
            BROAD_ORG_DIMENSIONS.map((d) => d.id).join("|") &&
          BROAD_ORG_DIMENSIONS.every(
            (d) =>
              Number.isSafeInteger(row.counts[d.id]) && row.counts[d.id] >= 0,
          ),
        "broad organization ZIP row",
      );
      previous = row.zip5;
      broadByZip.set(row.zip5, row.counts);
    }
    broadUnion += bucket.value.length;
  }
  check(
    broadUnion === bm.summary.zip5_union_rows &&
      broadUnion === 30802 &&
      bm.summary.address_rows === 14340583 &&
      bm.summary.eligible_address_rows === 9940777 &&
      bm.summary.missing_or_ineligible_address_rows === 4399806 &&
      bm.summary.out_of_cohort_zip_rows === 0,
    "broad organization summary conservation",
  );
  const broadGapPath = path.posix.join(
      path.posix.dirname(broadRelease.manifest),
      bm.source_address_row_gaps.path,
    ),
    broadGapsRead = await readPinned(
      root,
      broadGapPath,
      bm.source_address_row_gaps.sha256,
      2_000_000,
    );
  check(
    Array.isArray(broadGapsRead.value) &&
      broadGapsRead.value.length === bm.source_address_row_gaps.record_count &&
      broadGapsRead.value.reduce((n, g) => n + g.address_rows, 0) ===
        bm.summary.missing_or_ineligible_address_rows &&
      broadGapsRead.value.every(
        (g) =>
          g.zip5 === null &&
          g.gap_type === "source-address-row-without-eligible-zip5" &&
          g.source_manifest_sha256 ===
            bm.bindings.upstream_release.manifest_sha256,
      ),
    "broad organization address-gap taxonomy/conservation",
  );
  for (const dimension of BROAD_ORG_DIMENSIONS) {
    const sourceBinding = bm.bindings.sources[dimension.scope],
      temporal_status = {
        status: "source-referenced-current-operation-unverified",
        source_reference_field: sourceBinding.source_rows_reference_field,
        source_reference_date: sourceBinding.source_reference_date,
        current_operation_verified: false,
        semantics: `${dimension.scope} source reference date ${sourceBinding.source_reference_date}; source-reported address rows only, not current operations.`,
      };
    sources.push({
      id: dimension.id,
      countField: dimension.measure,
      key: "zip5",
      registration: broadRegistrationPath,
      registration_sha256: broadReg.sha256,
      pointer_path: null,
      pointer_sha256: null,
      manifest_path: broadRelease.manifest,
      manifest_sha256: broadManifestRead.sha256,
      release_id: bm.release_id,
      artifact_path: "zip-prefix=*.json",
      artifact_sha256: hash(JSON.stringify(broadArtifacts)),
      publisher_scope: dimension.scope,
      source_id: sourceBinding.source_dataset_id,
      row_unit: dimension.rowUnit,
      export_policy: sourceBinding.export_policy,
      accepted_address_rows:
        bm.summary.eligible_rows_by_dimension[dimension.id],
      record_kind: dimension.recordKind,
      source_provenance: sourceBinding,
      temporal_status,
    });
  }
  const reportingChildcare = await retainedChildcareReportingEvidence(
    root,
    cohortKeys,
  );
  for (const dimension of REPORTING_CHILDCARE_DIMENSIONS) {
    const metadata = reportingChildcare.dimensions.find(
        (d) => d.id === dimension.id,
      ),
      temporal_status = {
        status: "source-referenced-current-operation-unverified",
        source_reference_field:
          metadata.source_observed_at === metadata.earliest_observed_at &&
          metadata.source_observed_at === metadata.latest_observed_at
            ? "source_observed_at"
            : "row.observed_at",
        source_reference_date:
          metadata.source_observed_at ?? metadata.earliest_observed_at,
        current_operation_verified: false,
        semantics: `${dimension.scope} publisher reporting/location-evidence rows as observed; source status labels are not verification of current operation.`,
      };
    sources.push({
      id: dimension.id,
      countField: "reported_center_rows",
      key: "zip5",
      registration_path: reportingChildcare.registration_path,
      registration_sha256: reportingChildcare.registration_sha256,
      pointer_path: null,
      pointer_sha256: null,
      manifest_path: dimension.source_manifest,
      manifest_sha256: dimension.source_manifest_sha256,
      release_id: dimension.source_release_id,
      artifact_path: "reporting/location-evidence/zip2=*.jsonl.gz",
      artifact_sha256: hash(JSON.stringify(reportingChildcare.artifacts)),
      source_id: dimension.source_id,
      publisher_scope: dimension.scope,
      row_unit: "publisher-reported-center-row",
      export_policy: "local-review-only",
      accepted_reporting_rows: dimension.expected_count,
      source_status_counts: dimension.status_source_counts,
      source_observed_at: metadata.source_observed_at,
      earliest_observed_at: metadata.earliest_observed_at,
      latest_observed_at: metadata.latest_observed_at,
      source_refresh_at: null,
      source_refresh_asserted: false,
      identity_matching_eligible: false,
      active_business_verified: false,
      coordinate_assignment_ineligible_rows:
        dimension.coordinate_ineligible_rows,
      temporal_status,
      reportingChildcare: true,
    });
  }
  const nativeStatus = await nativeStatusEvidence(root, cohortKeys);
  for (const dimension of ZIP_STATUS_DIMENSIONS) {
    const binding = nativeStatus.source_release_bindings.find(
        (source) => source.id === dimension.id,
      ),
      temporal_status = binding.temporal_status;
    sources.push({
      id: dimension.id,
      countField: "registry_location_profile_count",
      key: "zip5",
      registration: ZIP_STATUS_REGISTRATION,
      registration_sha256: nativeStatus.registration_sha256,
      pointer_path: null,
      pointer_sha256: null,
      manifest_path: nativeStatus.manifest_path,
      manifest_sha256: nativeStatus.manifest_sha256,
      release_id: dimension.release_id,
      artifact_path: "zip-*.jsonl",
      artifact_sha256: nativeStatus.artifact_inventory_sha256,
      source_id: dimension.source_id,
      row_unit: "registry-location-profile",
      export_policy: "local-review-only",
      accepted_profile_count: dimension.expected_count,
      source_status_counts: binding.source_status_counts,
      source_reference_date: binding.source_reference_date,
      source_observation: binding.observation,
      source_refresh_at: null,
      source_refresh_asserted: false,
      temporal_status,
      registryLocationProfiles: true,
    });
  }
  const orderedSources = SOURCES.map((spec) => {
    const source = sources.find((item) => item.id === spec.id);
    return source && {
      ...source,
      zero_evidence_contract: ZERO_EVIDENCE_CONTRACTS[spec.id],
    };
  });
  check(orderedSources.every(Boolean), "complete exact-ZIP source roster");
  return {
    cohort: {
      registration_sha256: cohortReg.sha256,
      manifest_path: cr.manifest,
      manifest_sha256: cohortManifest.sha256,
      artifact_sha256: ca.sha256,
      release_id: cr.release_id,
      rows: cohort.rows,
    },
    sources: orderedSources,
    cmsByZip,
    cohortKeys,
    childcareByZip,
    reportingChildcare,
    broadByZip,
    registryLocationProfileByZip: new Map(
      nativeStatus.zip_union.map((zip) => [
        zip,
        Object.fromEntries(
          ZIP_STATUS_DIMENSIONS.map((d) => [
            d.id,
            nativeStatus.sourceRows.get(d.id).get(zip) ?? {
              count: 0,
              status_counts: {
                present: 0,
                "empty-object": 0,
                missing: 0,
                null: 0,
              },
            },
          ]),
        ),
      ]),
    ),
    nativeStatus,
    cms: {
      registration_sha256: cmsReg.sha256,
      manifest_path: cmsRelease.manifest,
      manifest_sha256: cmsManifest.sha256,
      release_id: cm.release_id,
      indexed_zip_count: indexedZipCount,
      artifacts: cmsArtifacts,
      summary: cm.summary,
    },
    childcare: {
      registration_path: "config/datasets/retained-childcare-zip-evidence.json",
      registration_sha256: childcareReg.sha256,
      manifest_path: childcareRelease.manifest,
      manifest_sha256: childcareManifest.sha256,
      release_id: ch.release_id,
      created_at: ch.created_at,
      root_view_sha256: ch.root_view_sha256,
      claims: ch.claims,
      indexed_zip_count: childcareZipCount,
      artifacts: childcareArtifacts,
      summary: ch.summary,
      quality_gaps: [
        ...childcareQualityGaps,
        ...reportingChildcare.quality_gaps,
      ],
      publisher_scopes: publisherScopes,
      sources: ch.sources,
    },
    broad: {
      registration_path: broadRegistrationPath,
      registration_sha256: broadReg.sha256,
      manifest_path: broadRelease.manifest,
      manifest_sha256: broadManifestRead.sha256,
      release_id: bm.release_id,
      created_at: bm.created_at,
      indexed_zip_count: broadUnion,
      artifacts: broadArtifacts,
      summary: bm.summary,
      address_gaps: broadGapsRead.value,
      source_address_row_gaps: bm.source_address_row_gaps,
      bindings: bm.bindings,
    },
  };
}
function compose(i) {
  const bySource = new Map(
    i.sources
      .filter(
        (s) =>
          !s.registryLocationProfiles &&
          !s.reportingChildcare &&
          !s.id.startsWith("cms_") &&
          !s.id.startsWith("childcare_") &&
          !s.id.startsWith("broad_org_"),
      )
      .map((s) => [s.id, new Map(s.rows.map((r) => [r[s.key], r]))]),
  );
  const rows = [],
    summary = {
      positive: 0,
      "measured-zero": 0,
      "outside-source-denominator": 0,
      "absent-from-retained-source-rows": 0,
      unavailable: 0,
    },
    cellStatusCountsByDimension = Object.fromEntries(
      i.sources.map((source) => [source.id, {
        positive: 0,
        "measured-zero": 0,
        "outside-source-denominator": 0,
        "absent-from-retained-source-rows": 0,
        unavailable: 0,
      }]),
    );
  for (const c of i.cohort.rows) {
    check(/^\d{5}$/.test(c.zip5) && c.usps_validity === null, "cohort row");
    const cells = {};
    for (const s of i.sources) {
      let count, status, status_counts;
      if (s.registryLocationProfiles) {
        const profile = i.registryLocationProfileByZip.get(c.zip5)?.[s.id] ?? {
          count: 0,
          status_counts: { present: 0, "empty-object": 0, missing: 0, null: 0 },
        };
        count = profile.count;
        status_counts = profile.status_counts;
        check(
          Object.values(status_counts).reduce((n, v) => n + v, 0) === count,
          "native status cell conservation",
        );
        status = count > 0 ? "positive" : s.zero_evidence_contract.absent_cell_status;
      } else if (s.id.startsWith("cms_")) {
        const category =
          s.id === "cms_hospital_directory" ? "hospital" : "nursing_home";
        count = i.cmsByZip.get(c.zip5)?.[category].directory_rows ?? 0;
        status = count > 0 ? "positive" : s.zero_evidence_contract.absent_cell_status;
      } else if (s.reportingChildcare) {
        const row = i.reportingChildcare.byZip.get(c.zip5)?.[s.id] ?? {
          count: 0,
          status_counts: {},
        };
        count = row.count;
        status_counts = row.status_counts;
        check(
          Object.values(status_counts).reduce((n, v) => n + v, 0) === count,
          "reporting childcare status cell conservation",
        );
        status = count > 0 ? "positive" : s.zero_evidence_contract.absent_cell_status;
      } else if (s.id.startsWith("childcare_")) {
        count = i.childcareByZip.get(c.zip5)?.[s.publisher_scope] ?? 0;
        status = count > 0 ? "positive" : s.zero_evidence_contract.absent_cell_status;
      } else if (s.id.startsWith("broad_org_")) {
        count = i.broadByZip.get(c.zip5)?.[s.id] ?? 0;
        status = count > 0 ? "positive" : s.zero_evidence_contract.absent_cell_status;
      } else {
        const r = bySource.get(s.id).get(c.zip5);
        status = s.zero_evidence_contract.absent_cell_status;
        count = status === "measured-zero" ? 0 : null;
        if (r) {
          check(
            Number.isSafeInteger(r[s.countField]) && r[s.countField] >= 0,
            "overlay alignment",
          );
          count = r[s.countField];
          check(
            count > 0 || s.zero_evidence_contract.explicit_zero_evidence_allowed,
            "source row zero is unsupported by its denominator contract",
          );
          status = count > 0 ? "positive" : "measured-zero";
        }
      }
      cells[s.id] = {
        status,
        count,
        measure: s.countField,
        source_release_id: s.release_id,
        temporal_status: {
          status: s.temporal_status.status,
          source_reference_date: s.temporal_status.source_reference_date,
        },
        ...(status_counts ? { source_status_counts: status_counts } : {}),
      };
      summary[status]++;
      check(cellStatusCountsByDimension[s.id][status] !== undefined, "unknown cell status");
      cellStatusCountsByDimension[s.id][status]++;
    }
    rows.push({
      schema_version: ROW_VERSION,
      zip5: c.zip5,
      zip4: null,
      cohort_classification: c.classification,
      usps_validity: null,
      zcta_geoid: c.zcta_geoid ?? null,
      cells,
    });
  }
  const sourceZipGaps = projectOutOfCohortSourceZipGaps(
    [...i.cohortKeys],
    [
      ...i.sources
        .filter((s) => s.id.startsWith("cms_"))
        .map((source) => ({
          id: source.id,
          release_id: source.release_id,
          measure: source.countField,
          temporal_status: source.temporal_status,
          rows: [...i.cmsByZip].map(([zip5, row]) => ({
            zip5,
            count:
              row[
                source.id === "cms_hospital_directory"
                  ? "hospital"
                  : "nursing_home"
              ].directory_rows,
          })),
        })),
      ...i.sources
        .filter((s) => s.id.startsWith("childcare_") && !s.reportingChildcare)
        .map((source) => ({
          id: source.id,
          release_id: source.release_id,
          measure: source.countField,
          publisher_scope: source.publisher_scope,
          temporal_status: source.temporal_status,
          rows: [...i.childcareByZip].map(([zip5, row]) => ({
            zip5,
            count: row[source.publisher_scope],
          })),
        })),
    ],
  );
  check(rows.length === 48194, "row conservation");
  return {
    rows,
    summary,
    cellStatusCountsByDimension,
    sourceZipGaps,
    sourceQualityGaps: i.childcare.quality_gaps,
    sourceAddressRowGaps: i.broad.address_gaps.map((g) => ({
      ...g,
      temporal_status: {
        status: "source-referenced-current-operation-unverified",
        source_reference_date: g.source_reference_date,
      },
    })),
  };
}
function manifestFor(
  i,
  result,
  createdAt,
  artifacts,
  gapArtifact,
  qualityGapArtifact,
  addressGapArtifact,
) {
  const bindings = {
      cohort: Object.fromEntries(
        Object.entries(i.cohort).filter(([k]) => k !== "rows"),
      ),
      cms: i.cms,
      childcare: i.childcare,
      childcare_reporting: i.reportingChildcare,
      broad_organization: i.broad,
      registry_location_profiles: {
        registration_path: i.nativeStatus.registration_path,
        registration_sha256: i.nativeStatus.registration_sha256,
        manifest_path: i.nativeStatus.manifest_path,
        manifest_sha256: i.nativeStatus.manifest_sha256,
        release_id: i.nativeStatus.release_id,
        created_at: i.nativeStatus.created_at,
        input_profile_count: i.nativeStatus.profile_count,
        source_count: i.nativeStatus.source_count,
        status_group_count: i.nativeStatus.status_group_count,
        zip_union_count: i.nativeStatus.zip_union_count,
        out_of_cohort_zip_count: i.nativeStatus.out_of_cohort_zip_count,
        artifact_count: i.nativeStatus.artifact_count,
        artifact_bytes: i.nativeStatus.artifact_bytes,
        artifact_inventory_sha256: i.nativeStatus.artifact_inventory_sha256,
        dimensions: i.nativeStatus.source_release_bindings,
      },
      sources: i.sources.map((source) => {
        const binding = { ...source, measure: source.countField };
        delete binding.rows;
        delete binding.countField;
        delete binding.registryLocationProfiles;
        return binding;
      }),
    },
    temporalCounts = {};
  for (const source of i.sources)
    temporalCounts[source.temporal_status.status] =
      (temporalCounts[source.temporal_status.status] ?? 0) + result.rows.length;
  const broadDimensions = Object.fromEntries(
      BROAD_ORG_DIMENSIONS.map((d) => [
        d.id,
        i.broad.summary.eligible_rows_by_dimension[d.id],
      ]),
    ),
    profileDimensions = Object.fromEntries(
      i.nativeStatus.source_release_bindings.map((d) => [
        d.id,
        {
          source_id: d.source_id,
          source_release_id: d.source_release_id,
          measure: d.measure,
          count: d.expected_count,
          zip_count: d.zip_count,
          status_counts: d.source_status_counts,
          source_reference_date: d.source_reference_date,
          source_observation: d.observation,
          source_refresh_at: null,
          source_refresh_asserted: false,
        },
      ]),
    ),
    selectedProfileCount = i.nativeStatus.source_release_bindings.reduce(
      (n, d) => n + d.expected_count,
      0,
    );
  check(
    selectedProfileCount === 1850619,
    "selected registry-location profile conservation",
  );
  const reclassifiedAbsentCells = Object.values(result.cellStatusCountsByDimension)
      .reduce((n, counts) => n + counts["absent-from-retained-source-rows"], 0),
    totalCellsByDimension = Object.values(result.cellStatusCountsByDimension)
      .map((counts) => Object.values(counts).reduce((n, value) => n + value, 0));
  check(
    totalCellsByDimension.length === 39 &&
      totalCellsByDimension.every((cells) => cells === result.rows.length) &&
      result.rows.length === 48194 && reclassifiedAbsentCells === 1237187 &&
      result.summary.positive === 336058 &&
      result.summary["measured-zero"] === 248869 &&
      result.summary["outside-source-denominator"] === 57452 &&
      result.summary["absent-from-retained-source-rows"] === 1237187,
    "v1.7 exact-ZIP status conservation",
  );
  const body = {
    schema_version: VERSION,
    dataset_id: DATASET,
    status: "immutable-local-review-only",
    publication_mode: "pointer-free",
    created_at: createdAt,
    bindings,
    summary: {
      zip5_rows: result.rows.length,
      industry_cells: result.rows.length * i.sources.length,
      max_prefix_artifact_bytes: Math.max(...artifacts.map((a) => a.bytes)),
      status_counts: result.summary,
      cell_status_counts_by_dimension: result.cellStatusCountsByDimension,
      reclassified_absent_source_row_cells: reclassifiedAbsentCells,
      temporal_status_counts: temporalCounts,
      included_industries: i.sources.map((s) => s.id),
      registry_location_profile_zip_union: i.nativeStatus.zip_union_count,
      registry_location_profile_rows: selectedProfileCount,
      registry_location_status_input_profile_rows: i.nativeStatus.profile_count,
      registry_location_profile_out_of_cohort_zip_rows:
        i.nativeStatus.out_of_cohort_zip_count,
      registry_location_profiles_by_dimension: profileDimensions,
      cms_source_zip_indexed_zip_count: i.cms.indexed_zip_count,
      cms_source_directory_rows: {
        hospital: i.cms.summary.hospital.directory_rows,
        nursing_home: i.cms.summary.nursing_home.directory_rows,
      },
      childcare_source_zip_indexed_zip_count: i.childcare.indexed_zip_count,
      childcare_source_candidate_rows:
        i.childcare.summary.accepted_candidate_rows,
      childcare_source_zip_present_candidate_rows:
        i.childcare.summary.zip_present_candidate_rows,
      childcare_source_candidate_rows_by_publisher: Object.fromEntries(
        i.childcare.publisher_scopes.map((scope) => [
          scope,
          i.childcare.sources[scope].accepted_candidate_rows,
        ]),
      ),
      childcare_reporting_rows:
        i.reportingChildcare.summary.reported_center_rows,
      childcare_reporting_zip_bearing_rows:
        i.reportingChildcare.summary.zip_bearing_center_rows,
      childcare_reporting_zip_union: i.reportingChildcare.summary.zip_union,
      childcare_reporting_out_of_cohort_zip_rows:
        i.reportingChildcare.summary.out_of_cohort_zip_rows,
      childcare_reporting_by_dimension: Object.fromEntries(
        i.reportingChildcare.dimensions.map((dimension) => [
          dimension.id,
          {
            source_id: dimension.source_id,
            source_release_id: dimension.source_release_id,
            row_unit: dimension.row_unit,
            measure: dimension.measure,
            accepted_rows: dimension.accepted_rows,
            zip_count: dimension.zip_count,
            source_status_counts: dimension.source_status_counts,
            source_observed_at: dimension.source_observed_at,
            earliest_observed_at: dimension.earliest_observed_at,
            latest_observed_at: dimension.latest_observed_at,
            zip4_rows: dimension.zip4_rows,
            coordinate_rows: dimension.coordinate_rows,
            coordinate_ineligible_rows: dimension.coordinate_ineligible_rows,
            identity_matching_eligible: false,
            active_business_verified: false,
            export_policy: dimension.export_policy,
          },
        ]),
      ),
      broad_organization_source_zip_indexed_zip_count:
        i.broad.indexed_zip_count,
      broad_organization_source_address_rows: i.broad.summary.address_rows,
      broad_organization_eligible_address_rows:
        i.broad.summary.eligible_address_rows,
      broad_organization_missing_or_ineligible_address_rows:
        i.broad.summary.missing_or_ineligible_address_rows,
      broad_organization_eligible_rows_by_dimension: broadDimensions,
      broad_organization_out_of_cohort_zip_rows: 0,
      out_of_cohort_source_zip_gaps: {
        record_count: result.sourceZipGaps.length,
        zip_count: new Set(result.sourceZipGaps.map((g) => g.zip5)).size,
        records_by_source: Object.fromEntries(
          i.sources
            .filter(
              (s) => s.id.startsWith("cms_") || s.id.startsWith("childcare_"),
            )
            .map((s) => [
              s.id,
              result.sourceZipGaps.filter((g) => g.source_id === s.id).length,
            ]),
        ),
        artifact_path: gapArtifact.path,
        artifact_bytes: gapArtifact.bytes,
        artifact_sha256: gapArtifact.sha256,
      },
      source_quality_gaps: {
        record_count: result.sourceQualityGaps.length,
        artifact_path: qualityGapArtifact.path,
        artifact_bytes: qualityGapArtifact.bytes,
        artifact_sha256: qualityGapArtifact.sha256,
      },
      source_address_row_gaps: {
        record_count: result.sourceAddressRowGaps.length,
        address_rows: result.sourceAddressRowGaps.reduce(
          (n, g) => n + g.address_rows,
          0,
        ),
        artifact_path: addressGapArtifact.path,
        artifact_bytes: addressGapArtifact.bytes,
        artifact_sha256: addressGapArtifact.sha256,
      },
      omitted_industries_status: "unavailable-not-materialized",
    },
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
    artifacts: [
      ...artifacts,
      gapArtifact,
      qualityGapArtifact,
      addressGapArtifact,
    ],
  };
  return { release_id: `${DATASET}-${hash(JSON.stringify(body))}`, ...body };
}
export async function buildExactZipIndustryEvidenceMatrix({
  root = APP_ROOT,
  createdAt,
} = {}) {
  root = path.resolve(root);
  check(
    new Date(createdAt).toISOString() === createdAt,
    "explicit canonical clock",
  );
  const i = await inputs(root),
    result = compose(i),
    buckets = new Map();
  for (const row of result.rows) {
    const p = row.zip5.slice(0, 2);
    if (!buckets.has(p)) buckets.set(p, []);
    buckets.get(p).push(row);
  }
  const artifacts = [...buckets].sort().map(([p, rows]) => {
      const raw = stable(rows);
      return {
        path: `prefix=${p}.json`,
        bytes: Buffer.byteLength(raw),
        sha256: hash(raw),
        record_count: rows.length,
      };
    }),
    gapRaw = stable(result.sourceZipGaps),
    gapArtifact = {
      path: "out-of-cohort-source-zip-gaps.json",
      bytes: Buffer.byteLength(gapRaw),
      sha256: hash(gapRaw),
      record_count: result.sourceZipGaps.length,
    },
    qualityRaw = stable(result.sourceQualityGaps),
    qualityGapArtifact = {
      path: "source-quality-gaps.json",
      bytes: Buffer.byteLength(qualityRaw),
      sha256: hash(qualityRaw),
      record_count: result.sourceQualityGaps.length,
    },
    addressGapRaw = stable(result.sourceAddressRowGaps),
    addressGapArtifact = {
      path: "source-address-row-gaps.json",
      bytes: Buffer.byteLength(addressGapRaw),
      sha256: hash(addressGapRaw),
      record_count: result.sourceAddressRowGaps.length,
    };
  check(
    artifacts.every((artifact) => artifact.bytes <= MAX_PREFIX_BYTES),
    "serialized prefix exceeds prepublication bound",
  );
  let m = manifestFor(
      i,
      result,
      createdAt,
      artifacts,
      gapArtifact,
      qualityGapArtifact,
      addressGapArtifact,
    ),
    dir = path.join(root, "data", DATASET, "releases", m.release_id);
  await fs.mkdir(dir, { recursive: true });
  for (const a of artifacts) {
    const raw = stable(buckets.get(a.path.slice(7, 9)));
    await fs
      .writeFile(path.join(dir, a.path), raw, { flag: "wx" })
      .catch(async (e) => {
        if (e.code !== "EEXIST") throw e;
        check(
          hash(await fs.readFile(path.join(dir, a.path))) === a.sha256,
          "existing bucket drift",
        );
      });
  }
  for (const [artifact, raw] of [
    [gapArtifact, gapRaw],
    [qualityGapArtifact, qualityRaw],
    [addressGapArtifact, addressGapRaw],
  ])
    await fs
      .writeFile(path.join(dir, artifact.path), raw, { flag: "wx" })
      .catch(async (e) => {
        if (e.code !== "EEXIST") throw e;
        check(
          hash(await fs.readFile(path.join(dir, artifact.path))) ===
            artifact.sha256,
          "existing gap artifact drift",
        );
      });
  const raw = stable(m);
  await fs
    .writeFile(path.join(dir, "manifest.json"), raw, { flag: "wx" })
    .catch(async (e) => {
      if (e.code !== "EEXIST") throw e;
      check(
        hash(await fs.readFile(path.join(dir, "manifest.json"))) === hash(raw),
        "existing manifest drift",
      );
    });
  return verifyExactZipIndustryEvidenceMatrix(path.join(dir, "manifest.json"), {
    root,
  });
}
export async function verifyExactZipIndustryEvidenceMatrix(
  manifestPath,
  { root = APP_ROOT } = {},
) {
  root = path.resolve(root);
  const raw = await fs.readFile(manifestPath),
    m = JSON.parse(raw);
  check(
    m.schema_version === VERSION &&
      m.dataset_id === DATASET &&
      m.status === "immutable-local-review-only" &&
      m.publication_mode === "pointer-free",
    "manifest",
  );
  const { release_id, ...body } = m;
  check(
    release_id === `${DATASET}-${hash(JSON.stringify(body))}` &&
      path.basename(path.dirname(manifestPath)) === release_id,
    "content identity",
  );
  const i = await inputs(root),
    result = compose(i),
    prefixArtifacts = m.artifacts.filter((a) => a.path.startsWith("prefix=")),
    gapArtifact = m.artifacts.find(
      (a) => a.path === "out-of-cohort-source-zip-gaps.json",
    ),
    qualityGapArtifact = m.artifacts.find(
      (a) => a.path === "source-quality-gaps.json",
    ),
    addressGapArtifact = m.artifacts.find(
      (a) => a.path === "source-address-row-gaps.json",
    );
  check(
    m.artifacts.length === prefixArtifacts.length + 3 &&
      gapArtifact &&
      qualityGapArtifact &&
      addressGapArtifact &&
      prefixArtifacts.every(
        (a) => Number.isSafeInteger(a.bytes) && a.bytes <= MAX_PREFIX_BYTES,
      ),
    "artifact inventory schema/reader bound",
  );
  const maxPrefixBytes = Math.max(...prefixArtifacts.map((a) => a.bytes));
  let rowIndex = 0;
  for (const a of prefixArtifacts) {
    check(
      /^prefix=\d{2}\.json$/.test(a.path) && SHA.test(a.sha256),
      "artifact descriptor",
    );
    const b = await readBoundedBytes(
      path.join(path.dirname(manifestPath), a.path),
      MAX_PREFIX_BYTES,
    );
    check(b.length === a.bytes && hash(b) === a.sha256, "artifact integrity");
    const rows = JSON.parse(b);
    check(rows.length === a.record_count, "artifact count");
    for (const row of rows) {
      check(
        rowIndex < result.rows.length &&
          JSON.stringify(row) === JSON.stringify(result.rows[rowIndex]),
        "complete replay row",
      );
      rowIndex++;
    }
  }
  check(rowIndex === result.rows.length, "complete replay row count");
  const gapBytes = await fs.readFile(
      path.join(path.dirname(manifestPath), gapArtifact.path),
    ),
    qualityBytes = await fs.readFile(
      path.join(path.dirname(manifestPath), qualityGapArtifact.path),
    ),
    addressGapBytes = await fs.readFile(
      path.join(path.dirname(manifestPath), addressGapArtifact.path),
    );
  check(
    gapBytes.length === gapArtifact.bytes &&
      hash(gapBytes) === gapArtifact.sha256 &&
      JSON.stringify(JSON.parse(gapBytes)) ===
        JSON.stringify(result.sourceZipGaps) &&
      gapArtifact.record_count === result.sourceZipGaps.length,
    "source ZIP gap sidecar replay",
  );
  check(
    qualityBytes.length === qualityGapArtifact.bytes &&
      hash(qualityBytes) === qualityGapArtifact.sha256 &&
      JSON.stringify(JSON.parse(qualityBytes)) ===
        JSON.stringify(result.sourceQualityGaps) &&
      qualityGapArtifact.record_count === result.sourceQualityGaps.length,
    "source quality gap sidecar replay",
  );
  check(
    addressGapBytes.length === addressGapArtifact.bytes &&
      hash(addressGapBytes) === addressGapArtifact.sha256 &&
      JSON.stringify(JSON.parse(addressGapBytes)) ===
        JSON.stringify(result.sourceAddressRowGaps) &&
      addressGapArtifact.record_count === result.sourceAddressRowGaps.length,
    "source address-row gap sidecar replay",
  );
  const rebuilt = manifestFor(
    i,
    result,
    m.created_at,
    prefixArtifacts,
    gapArtifact,
    qualityGapArtifact,
    addressGapArtifact,
  );
  for (const key of new Set([...Object.keys(rebuilt), ...Object.keys(m)]))
    check(
      JSON.stringify(rebuilt[key]) === JSON.stringify(m[key]),
      `manifest replay field ${key}`,
    );
  check(
    (await fs.readdir(path.dirname(manifestPath))).sort().join("|") ===
      ["manifest.json", ...m.artifacts.map((a) => a.path)].sort().join("|"),
    "closed inventory",
  );
  return {
    verified: true,
    release_id,
    manifest_sha256: hash(raw),
    zip5_rows: result.rows.length,
    industry_cells: result.rows.length * i.sources.length,
    max_prefix_artifact_bytes: maxPrefixBytes,
    status_counts: result.summary,
    cell_status_counts_by_dimension: result.cellStatusCountsByDimension,
    reclassified_absent_source_row_cells:
      result.summary["absent-from-retained-source-rows"],
    out_of_cohort_source_zip_gaps: result.sourceZipGaps,
    source_quality_gaps: result.sourceQualityGaps,
    source_address_row_gaps: result.sourceAddressRowGaps,
  };
}
export async function readExactZipIndustryEvidence({
  root = APP_ROOT,
  zip5,
} = {}) {
  root = path.resolve(root);
  check(/^\d{5}$/.test(zip5), "ZIP5");
  const reg = await readPinned(
    root,
    "config/datasets/national-exact-zip-industry-evidence-matrix.json",
  );
  check(
    reg.value.schema_version === VERSION.slice(VERSION.lastIndexOf("@") + 1) &&
    reg.value.runtime_pointer === null &&
      reg.value.production_enrollment === false,
    "registration policy",
  );
  const rr = reg.value.retained_release,
    mr = await readPinned(root, rr.manifest, rr.manifest_sha256),
    m = mr.value,
    { release_id, ...body } = m,
    statusKeys = [
      "positive",
      "measured-zero",
      "outside-source-denominator",
      "absent-from-retained-source-rows",
      "unavailable",
    ],
    sourceIds = SOURCES.map((source) => source.id),
    aggregateCellStatusCounts = Object.fromEntries(statusKeys.map((status) => [status, 0])),
    maxPrefixBytes = Math.max(
      ...m.artifacts
        .filter((a) => a.path.startsWith("prefix="))
        .map((a) => a.bytes),
    );
  check(
    release_id === rr.release_id &&
      release_id === `${DATASET}-${hash(JSON.stringify(body))}` &&
      m.schema_version === VERSION &&
      m.summary?.status_counts?.positive === 336058 &&
      m.summary?.status_counts?.["measured-zero"] === 248869 &&
      m.summary?.status_counts?.["outside-source-denominator"] === 57452 &&
      m.summary?.status_counts?.["absent-from-retained-source-rows"] === 1237187 &&
      m.summary?.reclassified_absent_source_row_cells === 1237187 &&
      Object.keys(m.summary?.cell_status_counts_by_dimension ?? {}).length === 39 &&
      rr.max_prefix_artifact_bytes === maxPrefixBytes &&
      maxPrefixBytes <= MAX_PREFIX_BYTES &&
      Object.keys(m.summary?.status_counts ?? {}).sort().join("|") === [...statusKeys].sort().join("|") &&
      Object.keys(m.summary?.cell_status_counts_by_dimension ?? {}).join("|") === sourceIds.join("|") &&
      m.summary.reclassified_absent_source_row_cells === 1237187 &&
      sourceIds.every((sourceId) => {
        const counts = m.summary.cell_status_counts_by_dimension[sourceId];
        if (Object.keys(counts ?? {}).sort().join("|") !== [...statusKeys].sort().join("|") ||
          statusKeys.some((status) => !Number.isSafeInteger(counts[status]) || counts[status] < 0) ||
          statusKeys.reduce((sum, status) => sum + counts[status], 0) !== 48194) return false;
        for (const status of statusKeys) aggregateCellStatusCounts[status] += counts[status];
        const contract = ZERO_EVIDENCE_CONTRACTS[sourceId];
        return contract.explicit_zero_evidence_allowed || counts["measured-zero"] === 0;
      }) &&
      statusKeys.every((status) => aggregateCellStatusCounts[status] === m.summary.status_counts[status]) &&
      m.summary.status_counts.positive === 336058 &&
      m.summary.status_counts["measured-zero"] === 248869 &&
      m.summary.status_counts["outside-source-denominator"] === 57452 &&
      m.summary.status_counts["absent-from-retained-source-rows"] === 1237187 &&
      m.summary.status_counts.unavailable === 0,
    "registered content identity/bucket bound",
  );
  const a = m.artifacts.find(
    (x) => x.path === `prefix=${zip5.slice(0, 2)}.json`,
  );
  check(
    a && SHA.test(a.sha256) && a.bytes <= MAX_PREFIX_BYTES,
    "registered bounded bucket",
  );
  const br = await readPinned(
    root,
    path.posix.join(path.posix.dirname(rr.manifest), a.path),
    a.sha256,
    MAX_PREFIX_BYTES,
  );
  check(
    Array.isArray(br.value) && br.value.length === a.record_count,
    "bucket",
  );
  const requestedRow = br.value.find((row) => row.zip5 === zip5);
  if (requestedRow) for (const source of m.bindings.sources) {
    const cell = requestedRow.cells?.[source.id],
      contract = source.zero_evidence_contract;
    check(cell && contract && [
      "positive",
      "measured-zero",
      "outside-source-denominator",
      "absent-from-retained-source-rows",
    ].includes(cell.status), "closed source cell status");
    check(cell.status === "positive"
      ? Number.isSafeInteger(cell.count) && cell.count > 0
      : cell.status === "measured-zero"
        ? cell.count === 0 && contract.explicit_zero_evidence_allowed === true
        : cell.status === "outside-source-denominator"
          ? cell.count === null && contract.absent_cell_status === cell.status
          : cell.count === 0 && contract.absent_cell_status === cell.status
        , "cell status/zero-evidence contract");
  }
  const gap = m.summary.out_of_cohort_source_zip_gaps,
    gb = await readPinned(
      root,
      path.posix.join(path.posix.dirname(rr.manifest), gap.artifact_path),
      gap.artifact_sha256,
      100_000,
    ),
    quality = m.summary.source_quality_gaps,
    qb = await readPinned(
      root,
      path.posix.join(path.posix.dirname(rr.manifest), quality.artifact_path),
      quality.artifact_sha256,
      100_000,
    ),
    addressGaps = m.summary.source_address_row_gaps,
    ab = await readPinned(
      root,
      path.posix.join(
        path.posix.dirname(rr.manifest),
        addressGaps.artifact_path,
      ),
      addressGaps.artifact_sha256,
      2_000_000,
    );
  check(
    Array.isArray(gb.value) &&
      gb.value.length === gap.record_count &&
      Array.isArray(qb.value) &&
      qb.value.length === quality.record_count &&
      Array.isArray(ab.value) &&
      ab.value.length === addressGaps.record_count &&
      ab.value.reduce((n, g) => n + g.address_rows, 0) ===
        addressGaps.address_rows,
    "distinct gap sidecars",
  );
  const source_metadata = Object.fromEntries(
    m.bindings.sources.map((source) => {
      const metadata = {
        source_reference_field: source.temporal_status.source_reference_field,
        current_operation_verified:
          source.temporal_status.current_operation_verified,
        semantics: source.temporal_status.semantics,
        zero_evidence_semantics: source.zero_evidence_contract,
        source_manifest: source.manifest_path,
        source_manifest_sha256: source.manifest_sha256,
      };
      if (source.reportingChildcare) {
        const dimension = m.bindings.childcare_reporting.dimensions.find(
          (item) => item.id === source.id,
        );
        check(dimension, "reporting childcare dimension binding");
        Object.assign(metadata, {
          publisher_scope: dimension.publisher_scope,
          source_id: dimension.source_id,
          source_release_id: dimension.source_release_id,
          row_unit: dimension.row_unit,
          export_policy: dimension.export_policy,
          accepted_reporting_rows: dimension.accepted_rows,
          source_zip_count: dimension.zip_count,
          source_status_counts: dimension.source_status_counts,
          source_observed_at: dimension.source_observed_at,
          earliest_observed_at: dimension.earliest_observed_at,
          latest_observed_at: dimension.latest_observed_at,
          source_refresh_at: null,
          source_refresh_asserted: false,
          zip4_rows: dimension.zip4_rows,
          coordinate_rows: dimension.coordinate_rows,
          coordinate_ineligible_rows: dimension.coordinate_ineligible_rows,
          identity_matching_eligible: false,
          active_business_verified: false,
        });
      } else if (source.publisher_scope && source.id.endsWith("_candidates"))
        Object.assign(metadata, {
          publisher_scope: source.publisher_scope,
          source_id: source.source_id,
          row_unit: source.row_unit,
          export_policy: source.export_policy,
          accepted_candidate_rows: source.accepted_candidate_rows,
          retained_source: m.bindings.childcare.sources[source.publisher_scope],
        });
      else if (source.publisher_scope && source.id.startsWith("broad_org_"))
        Object.assign(metadata, {
          publisher_scope: source.publisher_scope,
          source_id: source.source_id,
          row_unit: source.row_unit,
          export_policy: source.export_policy,
          record_kind: source.record_kind,
          accepted_address_rows: source.accepted_address_rows,
          source_provenance: source.source_provenance,
        });
      else if (ZIP_STATUS_DIMENSIONS.some((d) => d.id === source.id)) {
        const dimension = m.bindings.registry_location_profiles.dimensions.find(
          (d) => d.id === source.id,
        );
        check(dimension, "registry-location profile binding");
        Object.assign(metadata, {
          source_id: dimension.source_id,
          source_release_id: dimension.source_release_id,
          row_unit: "registry-location-profile",
          export_policy: "local-review-only",
          accepted_profile_count: dimension.expected_count,
          source_zip_count: dimension.zip_count,
          source_reference_date: dimension.source_reference_date,
          source_reference_basis: dimension.source_reference_basis,
          source_status_counts: dimension.source_status_counts,
          source_observation: dimension.observation,
          source_refresh_at: dimension.source_refresh_at,
          source_refresh_asserted: dimension.source_refresh_asserted,
        });
      }
      return [source.id, metadata];
    }),
  );
  return {
    schema_version: VERSION,
    status: "present",
    row: requestedRow ?? null,
    out_of_cohort_source_zip_gaps: gb.value.filter(
      (item) => item.zip5 === zip5,
    ),
    source_quality_gaps: qb.value,
    source_address_row_gaps: ab.value,
    source_metadata,
    status_counts: m.summary.status_counts,
    cell_status_counts_by_dimension: m.summary.cell_status_counts_by_dimension,
    reclassified_absent_source_row_cells:
      m.summary.reclassified_absent_source_row_cells,
    release_id,
    manifest_sha256: mr.sha256,
    source_bytes_read: br.bytes + gb.bytes + qb.bytes + ab.bytes,
    full_matrix_replay_performed: false,
    claims: m.claims,
  };
}
