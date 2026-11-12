import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";

const DATASET = "national-irs-eo-supplemental-industry-evidence";
const RELEASE = `${DATASET}-011a6a090fe9d1a27aa7f05ed5a33b40f2c5e9f6e9ab49b04f131a4db799ad65`;
const PINS = Object.freeze({
  registration:
    "09fcf954fd84f622adc08e736d517b594ae760992e9964ac6c3c17183dfd9029",
  manifest: "ea1f62b477375269fc829562172137c3368b54f5596ad2aa69d51ae1b60d8aa1",
  scopes: "c65867324217a85fa7c47235f1056e67e2ae1fa7eb1e475282912a1ef3053d95",
  reported: "12be8e625923b4d97773a202f057713f06c72feaa570846853a5cd3c134db53d",
  summary: "3875515521d403de10629707015071b3ebabb9db374f40856dcc6a26c6b84e4d",
  assessment:
    "61c5dbfec39137eeea10945dd4a2b167da8d9e955611f71a3512df8f4f3520a5",
  overlay: "3fadc44772bcf2166d5e777d268028f3427342f7bfd0aab0a7706b92058581ce",
  source: "999233d73e42eac72a094d1248d6790680d39d276c3a9e849a496d01ed5288f8",
  disposition:
    "d2f2114dfdbf6788eea0dd2335c9a9383673d61baf557486ebd2e8aba7ffbf41",
  dispositionArtifact:
    "d29f7047dfe713fd9e95ede930edd0d2642eaa59158e3d2398ee3d5945658c84",
});
const SPECIAL = [
  "multi-state-material",
  "zcta-overlay-unresolved",
  "non-zcta-unassigned",
  "explicit-placeholder",
];
const CLAIMS = Object.freeze({
  evidence_kind: "supplemental-non-active-reporting-membership",
  industry: "tax-exempt-organizations",
  filing_address_only: true,
  lifecycle_base_denominator_changed: false,
  lifecycle_base_assignments_changed: false,
  unique_business_count: null,
  current_operation_verified: false,
  physical_site_verified: false,
  complete_all_nonprofits: false,
  all_business_completeness: null,
  additive_to_business_or_industry_totals: false,
  authoritative_current_usps_zip_validity: null,
  zip4_joined: false,
  geography_disposition_and_reported_jurisdiction_are_separate: true,
  state_inferred_from_zip_prefix: false,
  reported_jurisdiction_overwrites_geography_disposition: false,
  network_requests: 0,
  source_acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
});
const REVIEW = Object.freeze({
  source_posting_date: "2026-08-11",
  retrieved_date: "2026-09-03",
  assessment_as_of: "2026-11-12",
  internal_review_window_days: 75,
  posting_age_days_at_assessment: 93,
  review_status: "stale",
  refresh_context: {
    status: "refresh-available-not-collected",
    observed_posting_date: "2026-10-13",
    source_page_claimed_records: 1975975,
    records_downloaded: 0,
  },
});
const hash = (value) => createHash("sha256").update(value).digest("hex");
const exact = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const fail = () => {
  throw Error("IRS EO supplemental industry runtime evidence rejected.");
};
const parse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    fail();
  }
};

async function stable(root, relative, maximum, expected) {
  try {
    root = path.resolve(root);
    const target = path.resolve(root, relative),
      rel = path.relative(root, target);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) fail();
    let cursor = root;
    for (const part of rel.split(path.sep)) {
      cursor = path.join(cursor, part);
      if ((await fs.lstat(cursor)).isSymbolicLink()) fail();
    }
    if ((await fs.realpath(target)) !== target) fail();
    const before = await fs.lstat(target),
      value = await fs.readFile(target),
      after = await fs.lstat(target);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      value.length !== before.size ||
      value.length < 1 ||
      value.length > maximum ||
      hash(value) !== expected
    )
      fail();
    return { value, sha256: expected };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "IRS EO supplemental industry runtime evidence rejected."
    )
      throw error;
    fail();
  }
}

function validateSummary(value) {
  const keys = [
    "schema_version",
    "zip5_rows",
    "positive_zip5_rows",
    "organization_membership_count",
    "geography_disposition_scope_rows",
    "state_scope_rows",
    "territory_scope_rows",
    "special_scope_rows",
    "reported_filing_address_jurisdiction_rows",
    "evidence_kind",
    "industry",
    "review_status",
    "lifecycle_base_profile_membership_count",
    "lifecycle_base_industry_assignment_count",
    "lifecycle_base_changed",
    "review",
    "claims",
  ];
  if (
    !exact(value, keys) ||
    value.schema_version !== `${DATASET}-summary@1.0.0` ||
    value.zip5_rows !== 48194 ||
    value.positive_zip5_rows !== 36950 ||
    value.organization_membership_count !== 1955841 ||
    value.geography_disposition_scope_rows !== 60 ||
    value.state_scope_rows !== 51 ||
    value.territory_scope_rows !== 5 ||
    value.special_scope_rows !== 4 ||
    value.reported_filing_address_jurisdiction_rows !== 56 ||
    value.evidence_kind !== CLAIMS.evidence_kind ||
    value.industry !== CLAIMS.industry ||
    value.review_status !== "stale" ||
    value.lifecycle_base_profile_membership_count !== 8011213 ||
    value.lifecycle_base_industry_assignment_count !== 6782745 ||
    value.lifecycle_base_changed !== false ||
    !same(value.review, REVIEW) ||
    !same(value.claims, CLAIMS)
  )
    fail();
  return structuredClone(value);
}

function validateScope(value) {
  const keys = [
    "schema_version",
    "scope_id",
    "scope_kind",
    "scope_label",
    "state_geo_id",
    "state_fips",
    "state_name",
    "postal_abbreviation",
    "zip5_rows",
    "positive_zip5_rows",
    "organization_membership_count",
    "evidence_kind",
    "industry",
    "review_status",
  ];
  if (
    !exact(value, keys) ||
    value.schema_version !== `${DATASET}-scope@1.0.0` ||
    typeof value.scope_id !== "string" ||
    !value.scope_id ||
    typeof value.scope_label !== "string" ||
    !value.scope_label ||
    !integer(value.zip5_rows) ||
    !integer(value.positive_zip5_rows) ||
    value.positive_zip5_rows > value.zip5_rows ||
    !integer(value.organization_membership_count) ||
    value.evidence_kind !== CLAIMS.evidence_kind ||
    value.industry !== CLAIMS.industry ||
    value.review_status !== "stale"
  )
    fail();
  const stateLike = /^(state|territory):\d{2}$/.test(value.scope_id);
  const expectedKind = value.scope_id.startsWith("state:")
    ? "state"
    : value.scope_id.startsWith("territory:")
      ? "territory"
      : value.scope_id;
  if (
    value.scope_kind !== expectedKind ||
    stateLike !==
      (typeof value.state_geo_id === "string" &&
        /^state:\d{2}$/.test(value.state_geo_id) &&
        /^\d{2}$/.test(value.state_fips) &&
        typeof value.state_name === "string" &&
        /^[A-Z]{2}$/.test(value.postal_abbreviation)) ||
    (!stateLike &&
      [
        value.state_geo_id,
        value.state_fips,
        value.state_name,
        value.postal_abbreviation,
      ].some((item) => item !== null))
  )
    fail();
  return structuredClone(value);
}

function validateReported(value) {
  const keys = [
    "schema_version",
    "reported_filing_address_jurisdiction",
    "organization_membership_count",
    "evidence_kind",
    "industry",
    "review_status",
    "comparison_only",
    "geography_disposition_scope_id",
  ];
  if (
    !exact(value, keys) ||
    value.schema_version !== `${DATASET}-reported-jurisdiction@1.0.0` ||
    !/^[A-Z]{2}$/.test(value.reported_filing_address_jurisdiction) ||
    !integer(value.organization_membership_count) ||
    value.evidence_kind !== CLAIMS.evidence_kind ||
    value.industry !== CLAIMS.industry ||
    value.review_status !== "stale" ||
    value.comparison_only !== true ||
    value.geography_disposition_scope_id !== null
  )
    fail();
  return structuredClone(value);
}

function validateZip(value, zip5) {
  const keys = [
    "schema_version",
    "zip5",
    "zip4",
    "denominator_classification",
    "geography_disposition_scope_id",
    "evidence_kind",
    "industry",
    "organization_membership_count",
    "review_status",
    "filing_address_only",
  ];
  if (
    !exact(value, keys) ||
    value.schema_version !== `${DATASET}-zip@1.0.0` ||
    value.zip5 !== zip5 ||
    value.zip4 !== null ||
    typeof value.denominator_classification !== "string" ||
    !value.denominator_classification ||
    typeof value.geography_disposition_scope_id !== "string" ||
    !value.geography_disposition_scope_id ||
    value.evidence_kind !== CLAIMS.evidence_kind ||
    value.industry !== CLAIMS.industry ||
    !integer(value.organization_membership_count) ||
    value.review_status !== "stale" ||
    value.filing_address_only !== true
  )
    fail();
  return structuredClone(value);
}

function descriptor(value, pathName, type, count, digest) {
  if (
    !exact(value, [
      "path",
      "artifact_type",
      "record_count",
      "bytes",
      "sha256",
    ]) ||
    value.path !== pathName ||
    value.artifact_type !== type ||
    value.record_count !== count ||
    !integer(value.bytes) ||
    value.bytes < 1 ||
    value.sha256 !== digest
  )
    fail();
}

async function contract(root) {
  root = path.resolve(root);
  const registrationPath = `config/datasets/${DATASET}.json`;
  const registrationProof = await stable(
      root,
      registrationPath,
      100000,
      PINS.registration,
    ),
    registration = parse(registrationProof.value),
    retained = registration.retained_release;
  if (
    !exact(registration, [
      "schema_version",
      "dataset_id",
      "status",
      "runtime_pointer",
      "production_enrollment",
      "retained_release",
      "claims",
      "documentation",
    ]) ||
    registration.schema_version !== `${DATASET}-registration@1.0.0` ||
    registration.dataset_id !== DATASET ||
    registration.status !== "registered-pointer-free-local-review-only" ||
    registration.runtime_pointer !== null ||
    registration.production_enrollment !== false ||
    !same(registration.claims, CLAIMS) ||
    retained.release_id !== RELEASE ||
    retained.manifest_sha256 !== PINS.manifest ||
    retained.manifest_bytes !== 25937 ||
    retained.artifact_count !== 103 ||
    retained.zip5_rows !== 48194 ||
    retained.positive_zip5_rows !== 36950 ||
    retained.organization_membership_count !== 1955841 ||
    retained.geography_disposition_scope_rows !== 60 ||
    retained.reported_filing_address_jurisdiction_rows !== 56
  )
    fail();
  const manifestProof = await stable(
      root,
      retained.manifest,
      30000,
      PINS.manifest,
    ),
    manifest = parse(manifestProof.value);
  if (
    !exact(manifest, [
      "release_id",
      "schema_version",
      "dataset_id",
      "status",
      "publication_mode",
      "bindings",
      "review",
      "summary",
      "claims",
      "artifacts",
    ]) ||
    manifest.release_id !== RELEASE ||
    manifest.schema_version !== `${DATASET}@1.0.0` ||
    manifest.dataset_id !== DATASET ||
    manifest.status !== "immutable-pointer-free-local-review-only" ||
    manifest.publication_mode !== "pointer-free" ||
    !same(manifest.review, REVIEW) ||
    !same(manifest.claims, CLAIMS) ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== 103
  )
    fail();
  const bindings = manifest.bindings,
    overlay = bindings?.irs_eo_registry_overlay,
    source = bindings?.irs_eo_source_release,
    disposition = bindings?.jurisdiction_disposition,
    assessmentBinding = bindings?.refresh_assessment;
  if (
    !exact(bindings, [
      "irs_eo_registry_overlay",
      "irs_eo_source_release",
      "jurisdiction_disposition",
      "refresh_assessment",
    ]) ||
    overlay.release_id !==
      "national-irs-eo-registry-industry-overlay-61f2ddfb76bee49f47b32b6609cf6004a1bd686f51d50a19e2449b2d750e694c" ||
    overlay.manifest_sha256 !== PINS.overlay ||
    source.release_id !== "irs-eo-bmf-20260903-003447217Z-565da6cd" ||
    source.manifest_sha256 !== PINS.source ||
    disposition.release_id !==
      "state-exact-zip-industry-evidence-disposition-2e71fa9aa3aee1398399674634d5537fc33c19427f1dfa9d97196656c841689c" ||
    disposition.manifest_sha256 !== PINS.disposition ||
    disposition.artifact_sha256 !== PINS.dispositionArtifact ||
    assessmentBinding.assessment_id !== "irs-eo-bmf-2026-11-12" ||
    assessmentBinding.path !==
      "config/governed-source-refresh-assessments/irs-eo-bmf-2026-11-12.json" ||
    assessmentBinding.sha256 !== PINS.assessment
  )
    fail();
  const assessment = parse(
    (await stable(root, assessmentBinding.path, 10000, PINS.assessment)).value,
  );
  if (
    assessment.assessment_id !== "irs-eo-bmf-2026-11-12" ||
    assessment.source_id !== "irs-eo-bmf" ||
    assessment.dataset_id !== "irs-eo-bmf-organizations" ||
    assessment.observed_at !== "2026-11-12" ||
    assessment.controls?.records_downloaded !== 0 ||
    assessment.controls?.entity_row_requests !== 0 ||
    assessment.controls?.production_changes !== 0 ||
    assessment.observation?.source_posting_date !== "2026-10-13" ||
    assessment.observation?.aggregate_records !== 1975975 ||
    assessment.observation?.regional_file_count !== 4 ||
    assessment.observation?.returned_entity_rows !== 0
  )
    fail();
  for (let prefix = 0; prefix < 100; prefix++) {
    const name = `zip2=${String(prefix).padStart(2, "0")}.jsonl.gz`,
      item = manifest.artifacts[prefix];
    if (
      !exact(item, [
        "path",
        "artifact_type",
        "record_count",
        "bytes",
        "sha256",
        "decoded_bytes",
      ]) ||
      item.path !== name ||
      item.artifact_type !== "irs-eo-supplemental-exact-zip-jsonl-gzip" ||
      !integer(item.record_count) ||
      !integer(item.bytes) ||
      item.bytes < 1 ||
      item.bytes > 10000 ||
      !integer(item.decoded_bytes) ||
      item.decoded_bytes > 500000 ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      fail();
  }
  descriptor(
    manifest.artifacts[100],
    "geography-disposition-scopes.json",
    "irs-eo-supplemental-geography-disposition-scopes",
    60,
    PINS.scopes,
  );
  descriptor(
    manifest.artifacts[101],
    "reported-jurisdictions.json",
    "irs-eo-supplemental-reported-filing-address-jurisdictions",
    56,
    PINS.reported,
  );
  descriptor(
    manifest.artifacts[102],
    "national-summary.json",
    "irs-eo-supplemental-national-summary",
    1,
    PINS.summary,
  );
  const base = path.dirname(retained.manifest);
  const summary = validateSummary(
    parse(
      (
        await stable(
          root,
          path.join(base, "national-summary.json"),
          3000,
          PINS.summary,
        )
      ).value,
    ),
  );
  const scopes = parse(
    (
      await stable(
        root,
        path.join(base, "geography-disposition-scopes.json"),
        40000,
        PINS.scopes,
      )
    ).value,
  ).map(validateScope);
  const reported = parse(
    (
      await stable(
        root,
        path.join(base, "reported-jurisdictions.json"),
        30000,
        PINS.reported,
      )
    ).value,
  ).map(validateReported);
  if (
    !same(
      manifest.summary,
      Object.fromEntries(
        Object.entries(summary).filter(
          ([key]) => !["schema_version", "review", "claims"].includes(key),
        ),
      ),
    ) ||
    scopes.length !== 60 ||
    reported.length !== 56 ||
    new Set(scopes.map((row) => row.scope_id)).size !== 60 ||
    new Set(reported.map((row) => row.reported_filing_address_jurisdiction))
      .size !== 56 ||
    scopes.reduce((sum, row) => sum + row.zip5_rows, 0) !== 48194 ||
    scopes.reduce((sum, row) => sum + row.positive_zip5_rows, 0) !== 36950 ||
    scopes.reduce((sum, row) => sum + row.organization_membership_count, 0) !==
      1955841 ||
    reported.reduce(
      (sum, row) => sum + row.organization_membership_count,
      0,
    ) !== 1955841
  )
    fail();
  const byScope = new Map(scopes.map((row) => [row.scope_id, row])),
    states = scopes
      .filter((row) => row.scope_kind === "state")
      .sort((a, b) => a.state_fips.localeCompare(b.state_fips)),
    territories = scopes
      .filter((row) => row.scope_kind === "territory")
      .sort((a, b) => a.state_fips.localeCompare(b.state_fips)),
    special = SPECIAL.map((id) => byScope.get(id));
  if (
    states.length !== 51 ||
    territories.length !== 5 ||
    special.some((row) => !row) ||
    reported.some(
      (row, index) =>
        index &&
        row.reported_filing_address_jurisdiction <=
          reported[index - 1].reported_filing_address_jurisdiction,
    )
  )
    fail();
  return {
    root,
    registration,
    manifest,
    retained,
    base,
    summary,
    states,
    territories,
    special,
    byScope,
    reported,
    byReported: new Map(
      reported.map((row) => [row.reported_filing_address_jurisdiction, row]),
    ),
    registration_sha256: registrationProof.sha256,
    manifest_sha256: manifestProof.sha256,
  };
}

const release = (value) => ({
  release_id: RELEASE,
  registration_sha256: value.registration_sha256,
  manifest_sha256: value.manifest_sha256,
  scope_artifact_sha256: PINS.scopes,
  reported_jurisdictions_artifact_sha256: PINS.reported,
  summary_artifact_sha256: PINS.summary,
  source_manifest_sha256: PINS.source,
  overlay_manifest_sha256: PINS.overlay,
  jurisdiction_manifest_sha256: PINS.disposition,
  jurisdiction_artifact_sha256: PINS.dispositionArtifact,
  refresh_assessment_sha256: PINS.assessment,
});
const refresh = () => ({
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
});

export async function readNationalIrsEoSupplementalIndustrySummary({
  root = APP_ROOT,
  signal,
} = {}) {
  signal?.throwIfAborted();
  const value = await contract(root);
  signal?.throwIfAborted();
  return {
    schema_version: `${DATASET}-runtime-summary@1.0.0`,
    release: release(value),
    refresh: refresh(),
    summary: value.summary,
    scopes: {
      states: value.states.map(
        ({ scope_id, state_fips, state_name, postal_abbreviation }) => ({
          scope_id,
          state_fips,
          state_name,
          postal_abbreviation,
        }),
      ),
      territories: value.territories.map(
        ({ scope_id, state_fips, state_name, postal_abbreviation }) => ({
          scope_id,
          state_fips,
          state_name,
          postal_abbreviation,
        }),
      ),
      special: value.special.map(({ scope_id, scope_label }) => ({
        scope_id,
        scope_label,
      })),
    },
    reported_filing_address_jurisdictions: value.reported.map((row) => ({
      reported_filing_address_jurisdiction:
        row.reported_filing_address_jurisdiction,
      organization_membership_count: row.organization_membership_count,
    })),
    claims: CLAIMS,
  };
}

export async function readNationalIrsEoSupplementalIndustryZip({
  root = APP_ROOT,
  zip5,
  signal,
} = {}) {
  if (typeof zip5 !== "string" || !/^\d{5}$/.test(zip5)) fail();
  signal?.throwIfAborted();
  const value = await contract(root),
    name = `zip2=${zip5.slice(0, 2)}.jsonl.gz`,
    descriptor = value.manifest.artifacts[Number(zip5.slice(0, 2))],
    proof = await stable(
      value.root,
      path.join(value.base, name),
      10000,
      descriptor.sha256,
    );
  let decoded;
  try {
    decoded = gunzipSync(proof.value, { maxOutputLength: 500000 });
  } catch {
    fail();
  }
  if (decoded.length !== descriptor.decoded_bytes) fail();
  const lines = decoded.toString("utf8").split("\n").filter(Boolean);
  if (lines.length !== descriptor.record_count) fail();
  let previous = "",
    found = null;
  for (const line of lines) {
    if (line.length > 1000) fail();
    const raw = parse(line);
    if (
      !/^\d{5}$/.test(raw.zip5) ||
      !raw.zip5.startsWith(zip5.slice(0, 2)) ||
      raw.zip5 <= previous
    )
      fail();
    previous = raw.zip5;
    const row = validateZip(raw, raw.zip5);
    if (raw.zip5 === zip5) found = row;
  }
  signal?.throwIfAborted();
  return {
    schema_version: `${DATASET}-runtime-zip@1.0.0`,
    release: release(value),
    refresh: refresh(),
    partition: { path: name, sha256: descriptor.sha256 },
    zip5,
    status: found
      ? found.organization_membership_count
        ? "governed-supplemental-memberships"
        : "governed-zero-supplemental-memberships"
      : "outside-governed-cohort",
    row: found,
    claims: CLAIMS,
  };
}

export async function readNationalIrsEoSupplementalIndustryJurisdiction({
  root = APP_ROOT,
  state,
  scopeId,
  signal,
} = {}) {
  const stateQuery = typeof state === "string" && /^[A-Z]{2}$/.test(state),
    scopeQuery =
      typeof scopeId === "string" &&
      (/^(state|territory):\d{2}$/.test(scopeId) || SPECIAL.includes(scopeId));
  if (stateQuery === scopeQuery) fail();
  signal?.throwIfAborted();
  const value = await contract(root),
    scope = stateQuery
      ? value.states.find((row) => row.postal_abbreviation === state)
      : value.byScope.get(scopeId);
  if (!scope || (stateQuery && scope.scope_kind !== "state")) fail();
  const reported = scope.postal_abbreviation
    ? value.byReported.get(scope.postal_abbreviation)
    : null;
  const comparison = reported
    ? {
        comparison_kind: "separate-marginals-not-record-linkage",
        reported_filing_address_jurisdiction:
          reported.reported_filing_address_jurisdiction,
        governed_geography_membership_count:
          scope.organization_membership_count,
        reported_filing_address_membership_count:
          reported.organization_membership_count,
      }
    : null;
  signal?.throwIfAborted();
  return {
    schema_version: `${DATASET}-runtime-jurisdiction@1.0.0`,
    release: release(value),
    refresh: refresh(),
    status: scope.organization_membership_count
      ? "governed-supplemental-memberships"
      : "governed-zero-supplemental-memberships",
    scope: structuredClone(scope),
    reported_filing_address_comparison: comparison,
    claims: CLAIMS,
  };
}

export {
  validateScope as validateNationalIrsEoSupplementalIndustryScopeForTest,
  validateZip as validateNationalIrsEoSupplementalIndustryZipForTest,
};
