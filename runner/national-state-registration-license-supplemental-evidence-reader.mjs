import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";

const D = "national-state-registration-license-supplemental-evidence";
const RELEASE = `${D}-560d12835e8adf6d9c5c627b580ee12e7ccd54fb8210e384ed3f168a2bea2ebd`;
const PIN = {
  registration:
    "6b1b6f21d02a5fb6c5e32ab1f42e5dca4bceaf4c183a4a13b66b1e4439207e6a",
  manifest: "3204731844daecc3c6b9da9454040a3ebd6876690d07770852000de783d1689e",
  scopes: "50614e7ea44050a28d3c827bea2fbf0f7f3b12e897884e6e778313c1344d641f",
  issuers: "27ae03b7619a2c1c86ffa85a00f33fe14d878172cb6b0205a48eaf1154ef0764",
  summary: "ee6788ae36508bf943556a7de38ab3c9a3bbd7877f94836856d527f0e4d95aa0",
  broadRegistration:
    "a8a70af7d6ad4c8dafeec80ed78ee097d85a6fa2dd6d6ecb2ecc6bf81dc53de7",
  broadManifest:
    "13600e6fc129d3e1ab3e7ce0a5cea1fbc7b9e8e352fd3d70b01a5d144a8c25e6",
  disposition:
    "d2f2114dfdbf6788eea0dd2335c9a9383673d61baf557486ebd2e8aba7ffbf41",
  dispositionArtifact:
    "d29f7047dfe713fd9e95ede930edd0d2642eaa59158e3d2398ee3d5945658c84",
  waManifest:
    "3b7097aa58fbb4f1987cd535f4f838cc4d99e69bd76f4a7edc403d37c4bc680d",
  waArtifact:
    "3bf7cbc3deea1a57166c4ae1a22906b061d0cf2b61a01bb1556804c8a5a60b08",
};
const SPECIAL = [
  "multi-state-material",
  "zcta-overlay-unresolved",
  "non-zcta-unassigned",
  "explicit-placeholder",
];
const DIMENSIONS = [
  [
    "broad_org_ct_organization_addresses",
    "CT",
    "organization-registration-address",
    "connecticut-business-registry-business-master-active",
    448166,
  ],
  [
    "broad_org_de_license_addresses",
    "DE",
    "business-license-address",
    "delaware-division-of-revenue-current-business-licenses",
    66502,
  ],
  [
    "broad_org_co_organization_addresses",
    "CO",
    "organization-registration-address",
    "colorado-business-entities-good-standing-or-delinquent",
    2150360,
  ],
  [
    "broad_org_or_legal_registration_addresses",
    "OR",
    "legal-registration-address",
    "oregon-active-business-registrations-principal-place",
    443123,
  ],
  [
    "broad_org_or_brand_registration_addresses",
    "OR",
    "assumed-business-name-address",
    "oregon-active-business-registrations-principal-place",
    116407,
  ],
  [
    "broad_org_ia_organization_addresses",
    "IA",
    "organization-registration-address",
    "iowa-active-business-entities",
    334176,
  ],
  [
    "broad_org_ny_organization_addresses",
    "NY",
    "organization-registration-address",
    "new-york-active-corporations-monthly-extract",
    350933,
  ],
  [
    "broad_org_fl_organization_addresses",
    "FL",
    "organization-registration-address",
    "florida-sunbiz-quarterly-corporate-data",
    3928280,
  ],
  [
    "broad_org_pa_organization_addresses",
    "PA",
    "organization-registration-address",
    "pennsylvania-department-of-state-active-business-registrations",
    2102830,
  ],
  [
    "wa_lni_active_contractor_organization_mailing_addresses",
    "WA",
    "construction-contractor-license",
    "washington-lni-active-contractor-licenses",
    74030,
  ],
];
const ISSUERS = [
  ["CT", 458892, 448166, 10726],
  ["DE", 66667, 66502, 165],
  ["CO", 2164811, 2150360, 14451],
  ["OR", 559882, 559530, 352],
  ["IA", 347200, 334176, 13024],
  ["NY", 4273072, 350933, 3922139],
  ["FL", 4109230, 3928280, 180950],
  ["PA", 2360829, 2102830, 257999],
  ["WA", 74141, 74030, 111],
];
const CLASSES = [
  "organization-registration-address",
  "business-license-address",
  "legal-registration-address",
  "assumed-business-name-address",
  "construction-contractor-license",
];
const CLAIMS = {
  record_unit: "source-reported registration-or-license address membership",
  governed_lookup_statuses: [
    "governed-supplemental-memberships",
    "governed-zero-supplemental-memberships",
    "outside-governed-cohort",
  ],
  issuer_state_marginals_are_separate: true,
  geography_disposition_and_issuer_state_are_separate: true,
  cross_source_additivity_asserted: false,
  additive_business_count_asserted: false,
  unique_business_count: null,
  current_operation_verified: false,
  physical_site_verified: false,
  all_business_completeness: null,
  authoritative_current_usps_zip_validity: null,
  state_inferred_from_zip_prefix: false,
  zip4_joined: false,
  wa_mailing_address_only: true,
  wa_record_level_local_review_only: true,
  de_record_level_local_review_only: true,
  observed_newer_counts_are_not_net_business_creation: true,
  network_requests: 0,
  source_acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const exact = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  integer = (value) => Number.isSafeInteger(value) && value >= 0;
const samePath = (a, b) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const fail = () => {
  throw Error(
    "State registration/license supplemental runtime evidence rejected.",
  );
};
const parse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    fail();
  }
};
async function stable(root, relative, max, digest) {
  try {
    root = path.resolve(root);
    const target = path.resolve(root, relative),
      rel = path.relative(root, target);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) fail();
    const parsed = path.parse(target);
    let cursor = parsed.root;
    for (const part of target
      .slice(parsed.root.length)
      .split(path.sep)
      .filter(Boolean)) {
      cursor = path.join(cursor, part);
      if ((await fs.lstat(cursor)).isSymbolicLink()) fail();
    }
    if (!samePath(path.resolve(await fs.realpath(target)), target)) fail();
    const before = await fs.lstat(target);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size < 1 ||
      before.size > max
    )
      fail();
    const handle = await fs.open(target, "r");
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino ||
        opened.size !== before.size
      )
        fail();
      const raw = Buffer.alloc(opened.size);
      let offset = 0;
      while (offset < raw.length) {
        const result = await handle.read(
          raw,
          offset,
          raw.length - offset,
          offset,
        );
        if (result.bytesRead < 1) fail();
        offset += result.bytesRead;
      }
      const afterFd = await handle.stat(),
        afterPath = await fs.lstat(target);
      if (
        opened.dev !== afterFd.dev ||
        opened.ino !== afterFd.ino ||
        opened.size !== afterFd.size ||
        opened.mtimeMs !== afterFd.mtimeMs ||
        afterFd.nlink !== 1 ||
        afterPath.dev !== opened.dev ||
        afterPath.ino !== opened.ino ||
        afterPath.size !== opened.size ||
        afterPath.mtimeMs !== opened.mtimeMs ||
        afterPath.nlink !== 1 ||
        !samePath(path.resolve(await fs.realpath(target)), target) ||
        sha(raw) !== digest
      )
        fail();
      return { raw, sha256: digest };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "State registration/license supplemental runtime evidence rejected."
    )
      throw error;
    fail();
  }
}
function dimension(value, index) {
  const expected = DIMENSIONS[index],
    keys = [
      "dimension_id",
      "issuer_state",
      "evidence_class",
      "source_id",
      "source_address_membership_count",
      "review_status",
    ];
  if (
    !exact(value, keys) ||
    value.dimension_id !== expected[0] ||
    value.issuer_state !== expected[1] ||
    value.evidence_class !== expected[2] ||
    value.source_id !== expected[3] ||
    !integer(value.source_address_membership_count) ||
    value.review_status !== "stale"
  )
    fail();
  return value;
}
function scope(value) {
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
    "source_address_membership_count",
    "dimensions",
  ];
  if (
    !exact(value, keys) ||
    value.schema_version !== `${D}-scope@1.0.0` ||
    !integer(value.zip5_rows) ||
    !integer(value.positive_zip5_rows) ||
    value.positive_zip5_rows > value.zip5_rows ||
    !integer(value.source_address_membership_count) ||
    !Array.isArray(value.dimensions) ||
    value.dimensions.length !== 10
  )
    fail();
  value.dimensions.forEach(dimension);
  if (
    value.dimensions.reduce(
      (n, row) => n + row.source_address_membership_count,
      0,
    ) !== value.source_address_membership_count
  )
    fail();
  const stateLike = /^(state|territory):\d{2}$/.test(value.scope_id),
    kind = value.scope_id.startsWith("state:")
      ? "state"
      : value.scope_id.startsWith("territory:")
        ? "territory"
        : value.scope_id;
  if (
    value.scope_kind !== kind ||
    stateLike !==
      (typeof value.state_geo_id === "string" &&
        /^\d{2}$/.test(value.state_fips) &&
        /^[A-Z]{2}$/.test(value.postal_abbreviation)) ||
    (!stateLike &&
      [
        value.state_geo_id,
        value.state_fips,
        value.state_name,
        value.postal_abbreviation,
      ].some((x) => x !== null))
  )
    fail();
  return structuredClone(value);
}
function zipRow(value, zip5) {
  const keys = [
    "schema_version",
    "zip5",
    "zip4",
    "status",
    "geography_disposition_scope_id",
    "source_address_membership_count",
    "dimensions",
  ];
  if (
    !exact(value, keys) ||
    value.schema_version !== `${D}-zip@1.0.0` ||
    value.zip5 !== zip5 ||
    value.zip4 !== null ||
    !CLAIMS.governed_lookup_statuses.slice(0, 2).includes(value.status) ||
    typeof value.geography_disposition_scope_id !== "string" ||
    !integer(value.source_address_membership_count) ||
    !Array.isArray(value.dimensions) ||
    value.dimensions.length !== 10
  )
    fail();
  value.dimensions.forEach(dimension);
  if (
    value.dimensions.reduce(
      (n, row) => n + row.source_address_membership_count,
      0,
    ) !== value.source_address_membership_count ||
    value.source_address_membership_count > 0 !==
      (value.status === "governed-supplemental-memberships")
  )
    fail();
  return structuredClone(value);
}
function issuer(value, index) {
  const expected = ISSUERS[index],
    keys = [
      "schema_version",
      "issuer_state",
      "source_id",
      "source_address_row_count",
      "eligible_address_membership_count",
      "missing_or_ineligible_address_membership_count",
      "outside_governed_cohort_address_membership_count",
      "comparison_only",
      "geography_disposition_scope_id",
      "review_status",
    ];
  if (
    !exact(value, keys) ||
    value.schema_version !== `${D}-issuer-state-marginal@1.0.0` ||
    value.issuer_state !== expected[0] ||
    value.source_address_row_count !== expected[1] ||
    value.eligible_address_membership_count !== expected[2] ||
    value.missing_or_ineligible_address_membership_count !== expected[3] ||
    value.source_address_row_count !==
      value.eligible_address_membership_count +
        value.missing_or_ineligible_address_membership_count ||
    value.outside_governed_cohort_address_membership_count !== 0 ||
    value.comparison_only !== true ||
    value.geography_disposition_scope_id !== null ||
    value.review_status !== "stale"
  )
    fail();
  return structuredClone(value);
}
function summary(value) {
  const keys = [
    "schema_version",
    "zip5_rows",
    "positive_zip5_rows",
    "zero_zip5_rows",
    "geography_disposition_scope_rows",
    "state_scope_rows",
    "territory_scope_rows",
    "special_scope_rows",
    "issuer_state_marginal_rows",
    "dimension_rows",
    "source_address_row_count",
    "eligible_address_membership_count",
    "missing_or_ineligible_address_membership_count",
    "eligible_address_membership_counts_by_dimension",
    "claims",
  ];
  if (
    !exact(value, keys) ||
    value.schema_version !== `${D}-summary@1.0.0` ||
    value.zip5_rows !== 48194 ||
    value.positive_zip5_rows !== 31050 ||
    value.zero_zip5_rows !== 17144 ||
    value.geography_disposition_scope_rows !== 60 ||
    value.state_scope_rows !== 51 ||
    value.territory_scope_rows !== 5 ||
    value.special_scope_rows !== 4 ||
    value.issuer_state_marginal_rows !== 9 ||
    value.dimension_rows !== 10 ||
    value.source_address_row_count !== 14414724 ||
    value.eligible_address_membership_count !== 10014807 ||
    value.missing_or_ineligible_address_membership_count !== 4399917 ||
    !same(value.claims, CLAIMS) ||
    !exact(
      value.eligible_address_membership_counts_by_dimension,
      DIMENSIONS.map((x) => x[0]),
    ) ||
    DIMENSIONS.some(
      (x) =>
        value.eligible_address_membership_counts_by_dimension[x[0]] !== x[4],
    )
  )
    fail();
  return structuredClone(value);
}
async function contract(root) {
  root = path.resolve(root);
  const registrationProof = await stable(
      root,
      `config/datasets/${D}.json`,
      100000,
      PIN.registration,
    ),
    registration = parse(registrationProof.raw),
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
    ]) ||
    registration.schema_version !== `${D}-registration@1.0.0` ||
    registration.dataset_id !== D ||
    registration.runtime_pointer !== null ||
    registration.production_enrollment !== false ||
    !same(registration.claims, CLAIMS) ||
    retained.release_id !== RELEASE ||
    retained.manifest_sha256 !== PIN.manifest ||
    retained.manifest_bytes !== 41416 ||
    retained.artifact_count !== 103 ||
    retained.zip5_rows !== 48194 ||
    retained.positive_zip5_rows !== 31050 ||
    retained.zero_zip5_rows !== 17144 ||
    retained.geography_disposition_scope_rows !== 60 ||
    retained.issuer_state_marginal_rows !== 9
  )
    fail();
  const manifestProof = await stable(
      root,
      retained.manifest,
      50000,
      PIN.manifest,
    ),
    manifest = parse(manifestProof.raw);
  if (
    !exact(manifest, [
      "release_id",
      "schema_version",
      "dataset_id",
      "status",
      "publication_mode",
      "bindings",
      "summary",
      "claims",
      "artifacts",
    ]) ||
    manifest.release_id !== RELEASE ||
    manifest.schema_version !== `${D}@1.0.0` ||
    manifest.status !== "immutable-pointer-free-local-review-only" ||
    manifest.publication_mode !== "pointer-free" ||
    !same(manifest.claims, CLAIMS) ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== 103
  )
    fail();
  const broad = manifest.bindings?.broad_organization_aggregate,
    j = manifest.bindings?.jurisdiction_disposition,
    sources = manifest.bindings?.sources;
  if (
    !exact(manifest.bindings, [
      "broad_organization_aggregate",
      "sources",
      "jurisdiction_disposition",
    ]) ||
    broad.registration_sha256 !== PIN.broadRegistration ||
    broad.manifest_sha256 !== PIN.broadManifest ||
    j.manifest_sha256 !== PIN.disposition ||
    j.artifact_sha256 !== PIN.dispositionArtifact ||
    !Array.isArray(sources) ||
    sources.length !== 9 ||
    sources.map((x) => x.issuer_state).join("|") !==
      ISSUERS.map((x) => x[0]).join("|") ||
    sources[8].manifest_sha256 !== PIN.waManifest ||
    sources[8].aggregate_artifact?.sha256 !== PIN.waArtifact
  )
    fail();
  for (let n = 0; n < 100; n++) {
    const a = manifest.artifacts[n],
      name = `zip2=${String(n).padStart(2, "0")}.jsonl.gz`;
    if (
      !exact(a, [
        "path",
        "artifact_type",
        "record_count",
        "bytes",
        "sha256",
        "decoded_bytes",
      ]) ||
      a.path !== name ||
      a.artifact_type !==
        "state-registration-license-supplemental-exact-zip-jsonl-gzip" ||
      !integer(a.record_count) ||
      !integer(a.bytes) ||
      a.bytes < 1 ||
      a.bytes > 100000 ||
      !integer(a.decoded_bytes) ||
      a.decoded_bytes > 5000000 ||
      !/^[a-f0-9]{64}$/.test(a.sha256)
    )
      fail();
  }
  const aggregate = [
      manifest.artifacts[100],
      manifest.artifacts[101],
      manifest.artifacts[102],
    ],
    specs = [
      ["geography-disposition-scopes.json", 60, PIN.scopes],
      ["issuer-state-marginals.json", 9, PIN.issuers],
      ["national-summary.json", 1, PIN.summary],
    ];
  for (let n = 0; n < 3; n++) {
    if (
      aggregate[n].path !== specs[n][0] ||
      aggregate[n].record_count !== specs[n][1] ||
      aggregate[n].sha256 !== specs[n][2]
    )
      fail();
  }
  const base = path.dirname(retained.manifest),
    s = summary(
      parse(
        (
          await stable(
            root,
            path.join(base, "national-summary.json"),
            3000,
            PIN.summary,
          )
        ).raw,
      ),
    ),
    scopes = parse(
      (
        await stable(
          root,
          path.join(base, "geography-disposition-scopes.json"),
          200000,
          PIN.scopes,
        )
      ).raw,
    ).map(scope),
    issuers = parse(
      (
        await stable(
          root,
          path.join(base, "issuer-state-marginals.json"),
          10000,
          PIN.issuers,
        )
      ).raw,
    ).map(issuer);
  if (
    !same(
      manifest.summary,
      Object.fromEntries(
        Object.entries(s).filter(
          ([k]) => !["schema_version", "claims"].includes(k),
        ),
      ),
    ) ||
    scopes.length !== 60 ||
    issuers.length !== 9 ||
    scopes.reduce((n, x) => n + x.zip5_rows, 0) !== 48194 ||
    scopes.reduce((n, x) => n + x.positive_zip5_rows, 0) !== 31050 ||
    scopes.reduce((n, x) => n + x.source_address_membership_count, 0) !==
      10014807 ||
    issuers.reduce((n, x) => n + x.source_address_row_count, 0) !== 14414724
  )
    fail();
  const byScope = new Map(scopes.map((x) => [x.scope_id, x])),
    states = scopes
      .filter((x) => x.scope_kind === "state")
      .sort((a, b) => a.state_fips.localeCompare(b.state_fips)),
    territories = scopes
      .filter((x) => x.scope_kind === "territory")
      .sort((a, b) => a.state_fips.localeCompare(b.state_fips)),
    special = SPECIAL.map((id) => byScope.get(id));
  if (
    byScope.size !== 60 ||
    states.length !== 51 ||
    territories.length !== 5 ||
    special.some((x) => !x)
  )
    fail();
  return {
    root,
    registration,
    manifest,
    retained,
    base,
    s,
    scopes,
    issuers,
    byIssuer: new Map(issuers.map((x) => [x.issuer_state, x])),
    states,
    territories,
    special,
    byScope,
    registration_sha256: registrationProof.sha256,
    manifest_sha256: manifestProof.sha256,
  };
}
const release = (value) => ({
  release_id: RELEASE,
  registration_sha256: value.registration_sha256,
  manifest_sha256: value.manifest_sha256,
  scope_artifact_sha256: PIN.scopes,
  issuer_marginals_artifact_sha256: PIN.issuers,
  summary_artifact_sha256: PIN.summary,
  broad_registration_sha256: PIN.broadRegistration,
  broad_manifest_sha256: PIN.broadManifest,
  jurisdiction_manifest_sha256: PIN.disposition,
  jurisdiction_artifact_sha256: PIN.dispositionArtifact,
  wa_manifest_sha256: PIN.waManifest,
  wa_zip_coverage_artifact_sha256: PIN.waArtifact,
});
export async function readNationalStateRegistrationLicenseSupplementalSummary({
  root = APP_ROOT,
  signal,
} = {}) {
  signal?.throwIfAborted();
  const v = await contract(root);
  signal?.throwIfAborted();
  return {
    schema_version: `${D}-runtime-summary@1.0.0`,
    release: release(v),
    summary: v.s,
    classes: CLASSES,
    sources: DIMENSIONS.map(
      ([dimension_id, issuer_state, evidence_class, source_id]) => ({
        dimension_id,
        issuer_state,
        evidence_class,
        source_id,
      }),
    ),
    scopes: {
      states: v.states.map(
        ({ scope_id, state_fips, state_name, postal_abbreviation }) => ({
          scope_id,
          state_fips,
          state_name,
          postal_abbreviation,
        }),
      ),
      territories: v.territories.map(
        ({ scope_id, state_fips, state_name, postal_abbreviation }) => ({
          scope_id,
          state_fips,
          state_name,
          postal_abbreviation,
        }),
      ),
      special: v.special.map(({ scope_id, scope_label }) => ({
        scope_id,
        scope_label,
      })),
    },
    issuer_marginals: v.issuers,
    claims: CLAIMS,
  };
}
export async function readNationalStateRegistrationLicenseSupplementalZip({
  root = APP_ROOT,
  zip5,
  signal,
} = {}) {
  if (typeof zip5 !== "string" || !/^\d{5}$/.test(zip5)) fail();
  signal?.throwIfAborted();
  const v = await contract(root),
    name = `zip2=${zip5.slice(0, 2)}.jsonl.gz`,
    a = v.manifest.artifacts[Number(zip5.slice(0, 2))],
    proof = await stable(v.root, path.join(v.base, name), 100000, a.sha256);
  let decoded;
  try {
    decoded = gunzipSync(proof.raw, { maxOutputLength: 5000000 });
  } catch {
    fail();
  }
  if (decoded.length !== a.decoded_bytes) fail();
  const lines = decoded.toString("utf8").split("\n").filter(Boolean);
  if (lines.length !== a.record_count) fail();
  let previous = "",
    found = null;
  for (const line of lines) {
    if (line.length > 5000) fail();
    const raw = parse(line);
    if (
      !/^\d{5}$/.test(raw.zip5) ||
      !raw.zip5.startsWith(zip5.slice(0, 2)) ||
      raw.zip5 <= previous
    )
      fail();
    previous = raw.zip5;
    const row = zipRow(raw, raw.zip5);
    if (raw.zip5 === zip5) found = row;
  }
  signal?.throwIfAborted();
  return {
    schema_version: `${D}-runtime-zip@1.0.0`,
    release: release(v),
    partition: { path: name, sha256: a.sha256 },
    zip5,
    status: found ? found.status : "outside-governed-cohort",
    row: found,
    claims: CLAIMS,
  };
}
export async function readNationalStateRegistrationLicenseSupplementalJurisdiction({
  root = APP_ROOT,
  state,
  scopeId,
  signal,
} = {}) {
  const sq = typeof state === "string" && /^[A-Z]{2}$/.test(state),
    iq =
      typeof scopeId === "string" &&
      (/^(state|territory):\d{2}$/.test(scopeId) || SPECIAL.includes(scopeId));
  if (sq === iq) fail();
  signal?.throwIfAborted();
  const v = await contract(root),
    row = sq
      ? v.states.find((x) => x.postal_abbreviation === state)
      : v.byScope.get(scopeId);
  if (!row || (sq && row.scope_kind !== "state")) fail();
  const issuer = row.postal_abbreviation
      ? v.byIssuer.get(row.postal_abbreviation)
      : null,
    comparison = issuer
      ? {
          comparison_kind: "separate-marginals-not-record-linkage",
          issuer_state: issuer.issuer_state,
          governed_geography_address_membership_count:
            row.source_address_membership_count,
          issuer_source_address_row_count: issuer.source_address_row_count,
          issuer_eligible_address_membership_count:
            issuer.eligible_address_membership_count,
          issuer_missing_or_ineligible_address_membership_count:
            issuer.missing_or_ineligible_address_membership_count,
        }
      : null;
  signal?.throwIfAborted();
  return {
    schema_version: `${D}-runtime-jurisdiction@1.0.0`,
    release: release(v),
    status: row.source_address_membership_count
      ? "governed-supplemental-memberships"
      : "governed-zero-supplemental-memberships",
    scope: structuredClone(row),
    issuer_marginal_comparison: comparison,
    claims: CLAIMS,
  };
}
export {
  stable as readNationalStateRegistrationLicenseSupplementalFileForTest,
  scope as validateNationalStateRegistrationLicenseSupplementalScopeForTest,
  zipRow as validateNationalStateRegistrationLicenseSupplementalZipForTest,
};
