import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";
import { BROAD_ORGANIZATION_ZIP_SOURCES } from "./broad-organization-zip-descriptors.mjs";
import { composeNationalBusinessLifecycleJurisdictionEvidence } from "./national-business-lifecycle-jurisdiction-evidence.mjs";

export const VERSION =
  "national-state-registration-license-supplemental-evidence@1.0.0";
const DATASET = "national-state-registration-license-supplemental-evidence",
  ASSESSMENT_AS_OF = "2026-11-12";
const BROAD_RELEASE =
    "national-broad-organization-zip-summary-bb8ca12cdb429a520406d141319d2424569199a55a87469e37e94f52f2bb2b2c",
  BROAD_MANIFEST_SHA =
    "13600e6fc129d3e1ab3e7ce0a5cea1fbc7b9e8e352fd3d70b01a5d144a8c25e6";
const BASE_STATES = ["CT", "DE", "CO", "OR", "IA", "NY", "FL", "PA"];
const ASSESSMENTS = {
  DE: "config/state-business-source-existing-assessments/de-2026-11-12.json",
  IA: "config/state-business-source-existing-assessments/ia-2026-11-11.json",
  NY: "config/state-business-source-existing-assessments/ny-2026-11-12.json",
  WA: "config/governed-source-refresh-assessments/wa-lni-active-contractor-licenses-2026-11-12.json",
};
const ASSESSMENT_IDS = {
  DE: "de-existing-governed-source-2026-11-12",
  IA: "ia-existing-governed-source-2026-11-11",
  NY: "ny-existing-governed-source-2026-11-12",
  WA: "wa-lni-active-contractor-licenses-2026-11-12",
};
const EVIDENCE = {
  CT: "organization-registration-address",
  CO: "organization-registration-address",
  IA: "organization-registration-address",
  NY: "organization-registration-address",
  FL: "organization-registration-address",
  PA: "organization-registration-address",
  DE: "business-license-address",
  WA: "construction-contractor-license",
};
const WA = {
  datasetId: "wa-lni-active-contractor-organizations",
  releaseId: "wa-lni-active-contractor-licenses-20260907-135045275Z-4c8b3283",
  normalizedSourceId: "washington-lni-active-contractor-licenses",
  sourceReleaseId:
    "wa-lni-active-contractor-licenses-2026-09-07-24c7059d65e4d084",
  artifactType: "normalized-wa-lni-active-contractor-organization-jsonl-gzip",
  addressField: "reported_mailing_addresses",
  nameField: "deterministic_display_name",
  recordKind: "organization",
  transformation: "wa-lni-active-contractor-licenses@1.0.1",
};
const SPECS = Object.freeze(
  Object.fromEntries(
    [
      ...BASE_STATES.map((state) => [
        state,
        BROAD_ORGANIZATION_ZIP_SOURCES[state],
      ]),
      ["WA", WA],
    ].map(([state, spec]) => [
      state,
      Object.freeze({
        ...spec,
        state,
        evidenceClass: EVIDENCE[state],
        manifest: `data/business-sources/${spec.datasetId}/releases/${spec.releaseId}/manifest.json`,
      }),
    ]),
  ),
);
const DIMENSIONS = [
  [
    "broad_org_ct_organization_addresses",
    "CT",
    "organization-registration-address",
  ],
  ["broad_org_de_license_addresses", "DE", "business-license-address"],
  [
    "broad_org_co_organization_addresses",
    "CO",
    "organization-registration-address",
  ],
  [
    "broad_org_or_legal_registration_addresses",
    "OR",
    "legal-registration-address",
  ],
  [
    "broad_org_or_brand_registration_addresses",
    "OR",
    "assumed-business-name-address",
  ],
  [
    "broad_org_ia_organization_addresses",
    "IA",
    "organization-registration-address",
  ],
  [
    "broad_org_ny_organization_addresses",
    "NY",
    "organization-registration-address",
  ],
  [
    "broad_org_fl_organization_addresses",
    "FL",
    "organization-registration-address",
  ],
  [
    "broad_org_pa_organization_addresses",
    "PA",
    "organization-registration-address",
  ],
  [
    "wa_lni_active_contractor_organization_mailing_addresses",
    "WA",
    "construction-contractor-license",
  ],
].map(([dimension_id, issuer_state, evidence_class]) => ({
  dimension_id,
  issuer_state,
  evidence_class,
  source_id:
    issuer_state === "WA"
      ? WA.normalizedSourceId
      : SPECS[issuer_state].normalizedSourceId,
}));
const sha = (value) => createHash("sha256").update(value).digest("hex"),
  line = (value) => `${JSON.stringify(value)}\n`;
const fail = (message) => {
  throw Error(
    `State registration/license supplemental evidence rejected: ${message}.`,
  );
};
const check = (value, message) => {
  if (!value) fail(message);
};
const inside = (root, file) => {
  const r = path.resolve(root),
    f = path.resolve(r, file);
  check(f === r || f.startsWith(`${r}${path.sep}`), "path outside root");
  return f;
};
const samePath = (a, b) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
async function rejectLinkedComponents(file) {
  const resolved = path.resolve(file),
    parsed = path.parse(resolved),
    parts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let cursor = parsed.root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    const stat = await fs.lstat(cursor);
    check(!stat.isSymbolicLink(), "symbolic-link path component");
  }
  check(
    samePath(path.resolve(await fs.realpath(resolved)), resolved),
    "non-canonical path identity",
  );
}
async function bytes(file, max = 100_000_000) {
  file = path.resolve(file);
  await rejectLinkedComponents(file);
  const before = await fs.lstat(file);
  check(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size <= max,
    "bounded canonical single-link regular file",
  );
  const handle = await fs.open(file, "r");
  try {
    const opened = await handle.stat();
    check(
      opened.isFile() &&
        opened.nlink === 1 &&
        opened.dev === before.dev &&
        opened.ino === before.ino &&
        opened.size === before.size,
      "opened file identity",
    );
    const raw = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < raw.length) {
      const read = await handle.read(raw, offset, raw.length - offset, offset);
      check(read.bytesRead > 0, "short read");
      offset += read.bytesRead;
    }
    const afterFd = await handle.stat(),
      afterPath = await fs.lstat(file);
    check(
      opened.dev === afterFd.dev &&
        opened.ino === afterFd.ino &&
        opened.size === afterFd.size &&
        opened.mtimeMs === afterFd.mtimeMs &&
        afterFd.nlink === 1 &&
        afterPath.dev === opened.dev &&
        afterPath.ino === opened.ino &&
        afterPath.size === opened.size &&
        afterPath.mtimeMs === opened.mtimeMs &&
        afterPath.nlink === 1,
      "file changed while reading",
    );
    check(
      samePath(path.resolve(await fs.realpath(file)), file),
      "canonical identity changed",
    );
    return raw;
  } finally {
    await handle.close();
  }
}
async function json(file, max) {
  const buffer = await bytes(file, max);
  try {
    return { buffer, value: JSON.parse(buffer), sha256: sha(buffer) };
  } catch {
    fail("JSON syntax");
  }
}
const claims = () => ({
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
});
function temporal(manifest, observation = null) {
  const selected =
    manifest.source_rows_updated_at ??
    manifest.source_modified_at ??
    manifest.source?.rows_updated_at ??
    manifest.retrieved_at ??
    null;
  return {
    selected_source_reference_at: selected,
    selected_retrieved_at: manifest.retrieved_at ?? null,
    assessment_as_of: ASSESSMENT_AS_OF,
    review_status: selected ? "stale" : "unmeasured",
    newer_edition_observed: observation !== null,
    newer_edition_observed_at: observation?.observed_at ?? null,
    newer_edition_observed_source_reference_at:
      observation?.source_reference_at ?? null,
    newer_edition_observed_aggregate_records:
      observation?.aggregate_records ?? null,
    newer_edition_observed_not_collected: observation !== null,
    observed_records_downloaded: observation?.records_downloaded ?? 0,
    observed_count_is_not_net_business_creation: observation !== null,
  };
}

export async function composeNationalStateRegistrationLicenseSupplementalEvidence({
  root = APP_ROOT,
} = {}) {
  root = path.resolve(root);
  const governed = await composeNationalBusinessLifecycleJurisdictionEvidence({
    root,
  });
  check(
    governed.rows.length === 60 && governed.governed.mapping.size === 48_194,
    "governed 60-scope ZIP disposition",
  );
  const sourceInputs = [],
    zipCounts = new Map(),
    issuerRows = [];
  const assessments = {};
  for (const [state, assessmentPath] of Object.entries(ASSESSMENTS)) {
    const read = await json(inside(root, assessmentPath), 200_000),
      value = read.value;
    check(
      value.assessment_id === ASSESSMENT_IDS[state] &&
        value.observed_at === (state === "IA" ? "2026-11-11" : "2026-11-12") &&
        value.schema_version ===
          (state === "WA"
            ? "governed-source-refresh-assessment@1.0.0"
            : "state-business-source-existing-assessment@1.0.0"),
      `${state} assessment identity`,
    );
    check(
      state === "WA"
        ? value.dataset_id === WA.datasetId &&
            value.source_id === "wa-lni-active-contractor-licenses"
        : value.state.abbreviation === state &&
            value.source.retained_release_id === SPECS[state].releaseId,
      `${state} assessment source binding`,
    );
    const stateAssessment =
      state === "WA"
        ? {
            source_reference_at: value.observation.source_rows_updated_at,
            aggregate_records: value.observation.aggregate_records,
            records_downloaded: value.controls.records_downloaded,
          }
        : {
            source_reference_at:
              state === "IA"
                ? value.source.observed_catalog.publisher.modified_at
                : value.source.observed_catalog.rows_updated_at,
            aggregate_records:
              state === "IA"
                ? value.source.observed_catalog.publisher.reported_row_count
                : value.source.observed_aggregate.records,
            records_downloaded:
              value.controls.records_downloaded ?? value.controls.downloads,
          };
    check(
      stateAssessment.records_downloaded === 0 &&
        Number.isSafeInteger(stateAssessment.aggregate_records) &&
        typeof stateAssessment.source_reference_at === "string",
      `${state} observed-newer assessment`,
    );
    assessments[state] = {
      path: assessmentPath,
      sha256: read.sha256,
      assessment_id: value.assessment_id,
      observed_at: value.observed_at,
      ...stateAssessment,
    };
  }
  const broadRegistration = await json(
      inside(
        root,
        "config/datasets/national-broad-organization-zip-summary.json",
      ),
      200_000,
    ),
    broadPin = broadRegistration.value.retained_release,
    broad = await json(inside(root, broadPin.manifest), 500_000);
  check(
    broadPin.release_id === BROAD_RELEASE &&
      broadPin.manifest_sha256 === BROAD_MANIFEST_SHA &&
      broad.sha256 === BROAD_MANIFEST_SHA &&
      broad.value.release_id === BROAD_RELEASE &&
      broad.value.schema_version === "broad-organization-zip-summary@1.0.0" &&
      broad.value.status === "immutable-local-review-only" &&
      broad.value.publication_mode === "pointer-free" &&
      broad.value.summary.eligible_address_rows === 9_940_777 &&
      broad.value.artifacts.length === 100,
    "eight-source governed aggregate binding",
  );
  const broadDims = {
    CO: ["broad_org_co_organization_addresses"],
    CT: ["broad_org_ct_organization_addresses"],
    DE: ["broad_org_de_license_addresses"],
    FL: ["broad_org_fl_organization_addresses"],
    IA: ["broad_org_ia_organization_addresses"],
    NY: ["broad_org_ny_organization_addresses"],
    OR: [
      "broad_org_or_legal_registration_addresses",
      "broad_org_or_brand_registration_addresses",
    ],
    PA: ["broad_org_pa_organization_addresses"],
  };
  const broadPaths = new Set(),
    broadZips = new Set();
  for (const artifact of broad.value.artifacts) {
    check(
      /^zip-prefix=\d{2}\.json$/.test(artifact.path) &&
        !broadPaths.has(artifact.path),
      "broad aggregate closed prefix inventory",
    );
    broadPaths.add(artifact.path);
    const raw = await bytes(
      inside(path.dirname(inside(root, broadPin.manifest)), artifact.path),
      2_000_000,
    );
    check(
      raw.length === artifact.bytes && sha(raw) === artifact.sha256,
      `broad aggregate ${artifact.path}`,
    );
    let rows;
    try {
      rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    } catch {
      fail(`broad aggregate JSON ${artifact.path}`);
    }
    check(
      Array.isArray(rows) && rows.length === artifact.record_count,
      `broad aggregate rows ${artifact.path}`,
    );
    for (const row of rows) {
      check(
        /^\d{5}$/.test(row.zip5) &&
          row.zip5.startsWith(artifact.path.slice(11, 13)) &&
          row.zip4 === null &&
          !broadZips.has(row.zip5) &&
          governed.governed.mapping.has(row.zip5),
        "broad aggregate ZIP identity",
      );
      broadZips.add(row.zip5);
      check(
        Object.keys(row.counts).sort().join("|") ===
          Object.values(broadDims).flat().sort().join("|") &&
          Object.values(row.counts).every(Number.isSafeInteger),
        "broad aggregate dimensions",
      );
      for (const dimension_id of Object.values(broadDims).flat()) {
        const count = row.counts[dimension_id];
        if (count) zipCounts.set(`${row.zip5}|${dimension_id}`, count);
      }
    }
  }
  check(
    broadPaths.size === 100 && broadZips.size === 30_802,
    "broad aggregate inventory and ZIP union",
  );
  for (const state of BASE_STATES) {
    const spec = SPECS[state],
      binding = broad.value.bindings.sources[state],
      manifest = await json(
        inside(root, binding.normalized_manifest_path),
        2_000_000,
      ),
      policyPath = binding.policy_path,
      policy = await json(inside(root, policyPath), 200_000);
    check(
      manifest.sha256 === binding.normalized_manifest_sha256 &&
        manifest.value.release_id === spec.releaseId,
      `${state} native manifest pin`,
    );
    check(
      /^[a-f0-9]{64}$/.test(binding.policy_sha256) &&
        policy.value.policy_id === spec.policy.replace(/\.json$/, "") &&
        typeof policy.value.version === "string",
      `${state} policy identity`,
    );
    if (state === "DE")
      check(
        policy.value.field_export_policy
          ?.normalized_record_level_organizations_addresses_assertions_and_match_profiles ===
          "local-review-only",
        "DE local-review policy ceiling",
      );
    const review = temporal(manifest.value, assessments[state]),
      eligible = broadDims[state].reduce(
        (n, id) => n + broad.value.summary.eligible_rows_by_dimension[id],
        0,
      ),
      missing =
        broad.value.summary.missing_or_ineligible_rows_by_publisher[state];
    sourceInputs.push({
      source_id: spec.normalizedSourceId,
      issuer_state: state,
      evidence_classes: DIMENSIONS.filter(
        (row) => row.issuer_state === state,
      ).map((row) => row.evidence_class),
      dataset_id: spec.datasetId,
      release_id: spec.releaseId,
      source_release_id: spec.sourceReleaseId,
      manifest_path: binding.normalized_manifest_path,
      manifest_sha256: manifest.sha256,
      policy_path: policyPath,
      policy_sha256: policy.sha256,
      upstream_policy_sha256: binding.policy_sha256,
      refresh_assessment: assessments[state] ?? null,
      review,
    });
    issuerRows.push({
      schema_version: `${DATASET}-issuer-state-marginal@1.0.0`,
      issuer_state: state,
      source_id: spec.normalizedSourceId,
      source_address_row_count: eligible + missing,
      eligible_address_membership_count: eligible,
      missing_or_ineligible_address_membership_count: missing,
      outside_governed_cohort_address_membership_count: 0,
      comparison_only: true,
      geography_disposition_scope_id: null,
      review_status: review.review_status,
    });
  }
  const waSpec = SPECS.WA,
    waManifest = await json(inside(root, waSpec.manifest), 2_000_000);
  check(
    waManifest.sha256 ===
      "3b7097aa58fbb4f1987cd535f4f838cc4d99e69bd76f4a7edc403d37c4bc680d",
    "WA manifest pin",
  );
  const waPolicyPath =
      "config/source-policies/wa-lni-active-contractor-licenses.json",
    waPolicy = await json(inside(root, waPolicyPath), 200_000);
  const waArtifacts = waManifest.value.artifacts.filter(
    (item) => item.path === "derived/zip-coverage.jsonl",
  );
  check(waArtifacts.length === 1, "WA exact aggregate descriptor");
  const waArtifact = waArtifacts[0],
    waRaw = await bytes(
      inside(path.dirname(inside(root, waSpec.manifest)), waArtifact.path),
      60_000_000,
    );
  check(
    waRaw.length === waArtifact.bytes &&
      sha(waRaw) === waArtifact.sha256 &&
      waArtifact.sha256 ===
        "3bf7cbc3deea1a57166c4ae1a22906b061d0cf2b61a01bb1556804c8a5a60b08" &&
      waArtifact.record_count === 37_845,
    "WA aggregate pin",
  );
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(waRaw);
  } catch {
    fail("WA aggregate UTF-8");
  }
  const waLines = decoded.trimEnd().split(/\r?\n/);
  check(waLines.length === 37_845, "WA aggregate line count");
  let waSum = 0,
    waPositive = 0;
  const waZips = new Set();
  for (const text of waLines) {
    check(Buffer.byteLength(text) <= 3_000, "WA aggregate line length");
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      fail("WA aggregate JSONL syntax");
    }
    const count =
      row.wa_lni_active_contractor_license_snapshot
        ?.active_contractor_organization_mailing_address_count;
    check(
      /^\d{5}$/.test(row.zip_code) &&
        !waZips.has(row.zip_code) &&
        governed.governed.mapping.has(row.zip_code) &&
        Number.isSafeInteger(count) &&
        count >= 0,
      "WA aggregate row contract",
    );
    waZips.add(row.zip_code);
    waSum += count;
    if (count) {
      waPositive++;
      zipCounts.set(
        `${row.zip_code}|wa_lni_active_contractor_organization_mailing_addresses`,
        count,
      );
    }
  }
  check(
    waZips.size === 37_845 && waPositive === 3_113 && waSum === 74_030,
    "WA eligible address conservation",
  );
  const waReview = temporal(waManifest.value, assessments.WA);
  sourceInputs.push({
    source_id: waSpec.normalizedSourceId,
    issuer_state: "WA",
    evidence_classes: [EVIDENCE.WA],
    dataset_id: waSpec.datasetId,
    release_id: waSpec.releaseId,
    source_release_id: waSpec.sourceReleaseId,
    manifest_path: waSpec.manifest,
    manifest_sha256: waManifest.sha256,
    policy_path: waPolicyPath,
    policy_sha256: waPolicy.sha256,
    refresh_assessment: assessments.WA,
    aggregate_artifact: {
      path: waArtifact.path,
      bytes: waArtifact.bytes,
      sha256: waArtifact.sha256,
      record_count: waArtifact.record_count,
    },
    review: waReview,
  });
  issuerRows.push({
    schema_version: `${DATASET}-issuer-state-marginal@1.0.0`,
    issuer_state: "WA",
    source_id: waSpec.normalizedSourceId,
    source_address_row_count: 74_141,
    eligible_address_membership_count: 74_030,
    missing_or_ineligible_address_membership_count: 111,
    outside_governed_cohort_address_membership_count: 0,
    comparison_only: true,
    geography_disposition_scope_id: null,
    review_status: waReview.review_status,
  });
  check(
    waPolicy.value.policy_id === "wa-lni-active-contractor-licenses" &&
      typeof waPolicy.value.version === "string" &&
    waPolicy.value.field_export_policy
      ?.normalized_record_level_organizations_names_mailing_addresses_and_license_activities ===
        "local-review-only",
    "WA policy identity and local-review ceiling",
  );
  const scopeBuckets = new Map(
    governed.rows.map((row) => [
      row.scope_id,
      Object.fromEntries(DIMENSIONS.map((dim) => [dim.dimension_id, 0])),
    ]),
  );
  const zipRows = [...governed.governed.mapping]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([zip5, scope]) => {
      const dimensions = DIMENSIONS.map((dim) => ({
        ...dim,
        source_address_membership_count:
          zipCounts.get(`${zip5}|${dim.dimension_id}`) ?? 0,
        review_status: sourceInputs.find(
          (item) => item.issuer_state === dim.issuer_state,
        ).review.review_status,
      }));
      for (const dim of dimensions)
        scopeBuckets.get(scope)[dim.dimension_id] +=
          dim.source_address_membership_count;
      const count = dimensions.reduce(
        (n, row) => n + row.source_address_membership_count,
        0,
      );
      return {
        schema_version: `${DATASET}-zip@1.0.0`,
        zip5,
        zip4: null,
        status:
          count > 0
            ? "governed-supplemental-memberships"
            : "governed-zero-supplemental-memberships",
        geography_disposition_scope_id: scope,
        source_address_membership_count: count,
        dimensions,
      };
    });
  const scopeRows = governed.rows.map((base) => {
    const dimensions = DIMENSIONS.map((dim) => ({
      ...dim,
      source_address_membership_count: scopeBuckets.get(base.scope_id)[
        dim.dimension_id
      ],
      review_status: sourceInputs.find(
        (item) => item.issuer_state === dim.issuer_state,
      ).review.review_status,
    }));
    return {
      schema_version: `${DATASET}-scope@1.0.0`,
      scope_id: base.scope_id,
      scope_kind: base.scope_kind,
      scope_label: base.scope_label,
      state_geo_id: base.state_geo_id,
      state_fips: base.state_fips,
      state_name: base.state_name,
      postal_abbreviation: base.postal_abbreviation,
      zip5_rows: base.zip5_rows,
      positive_zip5_rows: zipRows.filter(
        (row) =>
          row.geography_disposition_scope_id === base.scope_id &&
          row.source_address_membership_count > 0,
      ).length,
      source_address_membership_count: dimensions.reduce(
        (n, row) => n + row.source_address_membership_count,
        0,
      ),
      dimensions,
    };
  });
  const perDimension = Object.fromEntries(
    DIMENSIONS.map((dim) => [
      dim.dimension_id,
      zipRows.reduce(
        (n, row) =>
          n +
          row.dimensions.find(
            (value) => value.dimension_id === dim.dimension_id,
          ).source_address_membership_count,
        0,
      ),
    ]),
  );
  const summary = {
    zip5_rows: 48_194,
    positive_zip5_rows: zipRows.filter(
      (row) => row.source_address_membership_count > 0,
    ).length,
    zero_zip5_rows: zipRows.filter(
      (row) => row.source_address_membership_count === 0,
    ).length,
    geography_disposition_scope_rows: 60,
    state_scope_rows: 51,
    territory_scope_rows: 5,
    special_scope_rows: 4,
    issuer_state_marginal_rows: 9,
    dimension_rows: 10,
    source_address_row_count: issuerRows.reduce(
      (n, row) => n + row.source_address_row_count,
      0,
    ),
    eligible_address_membership_count: issuerRows.reduce(
      (n, row) => n + row.eligible_address_membership_count,
      0,
    ),
    missing_or_ineligible_address_membership_count: issuerRows.reduce(
      (n, row) => n + row.missing_or_ineligible_address_membership_count,
      0,
    ),
    eligible_address_membership_counts_by_dimension: perDimension,
  };
  check(
    summary.source_address_row_count === 14_414_724 &&
      summary.eligible_address_membership_count === 10_014_807 &&
      summary.missing_or_ineligible_address_membership_count === 4_399_917 &&
      summary.positive_zip5_rows === 31_050,
    "national conservation",
  );
  for (const dim of DIMENSIONS) {
    const zipTotal = perDimension[dim.dimension_id],
      scopeTotal = scopeRows.reduce(
        (n, row) =>
          n +
          row.dimensions.find(
            (value) => value.dimension_id === dim.dimension_id,
          ).source_address_membership_count,
        0,
      ),
      issuerTotal = issuerRows.find(
        (row) => row.issuer_state === dim.issuer_state,
      ).eligible_address_membership_count;
    check(
      zipTotal === scopeTotal,
      `${dim.dimension_id} ZIP/scope conservation`,
    );
    if (dim.issuer_state !== "OR")
      check(
        zipTotal === issuerTotal,
        `${dim.dimension_id} issuer conservation`,
      );
  }
  check(
    perDimension.broad_org_or_legal_registration_addresses +
      perDimension.broad_org_or_brand_registration_addresses ===
      issuerRows.find((row) => row.issuer_state === "OR")
        .eligible_address_membership_count,
    "Oregon dimension/issuer conservation",
  );
  return {
    root,
    governed,
    broadBinding: {
      registration_path:
        "config/datasets/national-broad-organization-zip-summary.json",
      registration_sha256: broadRegistration.sha256,
      release_id: broad.value.release_id,
      manifest_path: broadPin.manifest,
      manifest_sha256: broad.sha256,
    },
    sourceInputs,
    zipRows,
    scopeRows,
    issuerRows,
    summary,
  };
}

function descriptor(pathname, type, raw, count, decodedBytes) {
  return {
    path: pathname,
    artifact_type: type,
    record_count: count,
    bytes: raw.length,
    sha256: sha(raw),
    ...(decodedBytes === undefined ? {} : { decoded_bytes: decodedBytes }),
  };
}
async function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
async function acquirePublicationLock(lockPath, token) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(
        line({ token, pid: process.pid, created_at: new Date().toISOString() }),
      );
      await handle.sync();
      return handle;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const read = await json(lockPath, 10_000),
        owner = read.value,
        age = Date.now() - Date.parse(owner.created_at);
      check(
        typeof owner.token === "string" &&
          Number.isSafeInteger(owner.pid) &&
          Number.isFinite(age),
        "publication lock contract",
      );
      if (age <= 300_000 || (await processAlive(owner.pid)))
        fail("publication is already owned");
      const recoveryPath = `${lockPath}.recovery`,
        recoveryToken = randomUUID();
      let recovery;
      try {
        recovery = await fs.open(recoveryPath, "wx");
        await recovery.writeFile(
          line({
            token: recoveryToken,
            pid: process.pid,
            created_at: new Date().toISOString(),
            stale_owner_token: owner.token,
          }),
        );
        await recovery.sync();
        const current = (await json(lockPath, 10_000)).value,
          currentAge = Date.now() - Date.parse(current.created_at);
        check(
          current.token === owner.token &&
            current.pid === owner.pid &&
            current.created_at === owner.created_at &&
            Number.isFinite(currentAge) &&
            currentAge > 300_000 &&
            !(await processAlive(current.pid)),
          "publication lock changed during recovery",
        );
        await fs.unlink(lockPath);
      } catch (recoveryError) {
        if (recoveryError.code === "EEXIST")
          fail("publication lock recovery is already owned");
        throw recoveryError;
      } finally {
        await recovery?.close();
        try {
          const recoveryOwner = JSON.parse(
            await fs.readFile(recoveryPath, "utf8"),
          );
          if (recoveryOwner.token === recoveryToken)
            await fs.unlink(recoveryPath);
        } catch (recoveryError) {
          if (recoveryError.code !== "ENOENT") throw recoveryError;
        }
      }
    }
  }
  fail("stale publication lock recovery");
}
function manifestBody(result, artifacts) {
  return {
    schema_version: VERSION,
    dataset_id: DATASET,
    status: "immutable-pointer-free-local-review-only",
    publication_mode: "pointer-free",
    bindings: {
      broad_organization_aggregate: result.broadBinding,
      sources: result.sourceInputs,
      jurisdiction_disposition: {
        release_id: result.governed.disposition.manifest.value.release_id,
        manifest_path: path
          .relative(result.root, result.governed.disposition.manifestPath)
          .replaceAll("\\", "/"),
        manifest_sha256: result.governed.disposition.manifest.sha256,
        artifact_sha256: result.governed.governed.artifact.sha256,
      },
    },
    summary: result.summary,
    claims: claims(),
    artifacts,
  };
}
export async function buildNationalStateRegistrationLicenseSupplementalEvidence({
  root = APP_ROOT,
  outputRoot,
} = {}) {
  const result =
    await composeNationalStateRegistrationLicenseSupplementalEvidence({ root });
  const payloads = [];
  for (let prefix = 0; prefix < 100; prefix++) {
    const key = String(prefix).padStart(2, "0"),
      rows = result.zipRows.filter((row) => row.zip5.startsWith(key)),
      plain = Buffer.from(rows.map(line).join("")),
      raw = gzipSync(plain, { level: 9, mtime: 0 });
    payloads.push({
      name: `zip2=${key}.jsonl.gz`,
      raw,
      descriptor: descriptor(
        `zip2=${key}.jsonl.gz`,
        "state-registration-license-supplemental-exact-zip-jsonl-gzip",
        raw,
        rows.length,
        plain.length,
      ),
    });
  }
  for (const [name, type, rows] of [
    [
      "geography-disposition-scopes.json",
      "state-registration-license-supplemental-scopes",
      result.scopeRows,
    ],
    [
      "issuer-state-marginals.json",
      "state-registration-license-supplemental-issuer-state-marginals",
      result.issuerRows,
    ],
  ]) {
    const raw = Buffer.from(line(rows));
    payloads.push({
      name,
      raw,
      descriptor: descriptor(name, type, raw, rows.length),
    });
  }
  const national = Buffer.from(
    line({
      schema_version: `${DATASET}-summary@1.0.0`,
      ...result.summary,
      claims: claims(),
    }),
  );
  payloads.push({
    name: "national-summary.json",
    raw: national,
    descriptor: descriptor(
      "national-summary.json",
      "state-registration-license-supplemental-national-summary",
      national,
      1,
    ),
  });
  const body = manifestBody(
      result,
      payloads.map((item) => item.descriptor),
    ),
    manifest = {
      release_id: `${DATASET}-${sha(JSON.stringify(body))}`,
      ...body,
    };
  outputRoot = inside(
    result.root,
    outputRoot ?? path.join(result.root, "data", DATASET),
  );
  const releases = path.join(outputRoot, "releases"),
    directory = path.join(releases, manifest.release_id),
    staging = path.join(releases, `.staging-${randomUUID()}`),
    lockPath = `${directory}.lock`,
    token = randomUUID();
  await fs.mkdir(releases, { recursive: true });
  await rejectLinkedComponents(releases);
  if (
    await fs
      .lstat(directory)
      .then(() => true)
      .catch((error) => (error.code === "ENOENT" ? false : Promise.reject(error)))
  )
    return verifyNationalStateRegistrationLicenseSupplementalEvidence(
      path.join(directory, "manifest.json"),
      { root: result.root },
    );
  let lock;
  try {
    lock = await acquirePublicationLock(lockPath, token);
    check(
      !(await fs
        .lstat(directory)
        .then(() => true)
        .catch((error) =>
          error.code === "ENOENT" ? false : Promise.reject(error),
        )),
      "immutable release already exists",
    );
    await fs.mkdir(staging, { recursive: false });
    await rejectLinkedComponents(staging);
    for (const item of [
      ...payloads,
      { name: "manifest.json", raw: Buffer.from(line(manifest)) },
    ])
      await fs.writeFile(path.join(staging, item.name), item.raw, {
        flag: "wx",
      });
    await fs.rename(staging, directory);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    await lock?.close();
    try {
      const owner = JSON.parse(await fs.readFile(lockPath, "utf8"));
      if (owner.token === token) await fs.unlink(lockPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return verifyNationalStateRegistrationLicenseSupplementalEvidence(
    path.join(directory, "manifest.json"),
    { root: result.root },
  );
}
export async function verifyNationalStateRegistrationLicenseSupplementalEvidence(
  manifestPath,
  { root = APP_ROOT } = {},
) {
  root = path.resolve(root);
  manifestPath = inside(root, manifestPath);
  const read = await json(manifestPath, 2_000_000),
    manifest = read.value,
    { release_id, ...body } = manifest;
  check(
    manifest.schema_version === VERSION &&
      manifest.dataset_id === DATASET &&
      release_id === `${DATASET}-${sha(JSON.stringify(body))}` &&
      path.basename(path.dirname(manifestPath)) === release_id,
    "manifest identity",
  );
  check(
    JSON.stringify(manifest.claims) === JSON.stringify(claims()),
    "closed claims",
  );
  const result =
      await composeNationalStateRegistrationLicenseSupplementalEvidence({
        root,
      }),
    expected = new Map();
  for (let prefix = 0; prefix < 100; prefix++) {
    const key = String(prefix).padStart(2, "0"),
      rows = result.zipRows.filter((row) => row.zip5.startsWith(key)),
      plain = Buffer.from(rows.map(line).join("")),
      raw = gzipSync(plain, { level: 9, mtime: 0 });
    expected.set(`zip2=${key}.jsonl.gz`, {
      raw,
      count: rows.length,
      decoded: plain.length,
      type: "state-registration-license-supplemental-exact-zip-jsonl-gzip",
    });
  }
  expected.set("geography-disposition-scopes.json", {
    raw: Buffer.from(line(result.scopeRows)),
    count: 60,
    type: "state-registration-license-supplemental-scopes",
  });
  expected.set("issuer-state-marginals.json", {
    raw: Buffer.from(line(result.issuerRows)),
    count: 9,
    type: "state-registration-license-supplemental-issuer-state-marginals",
  });
  expected.set("national-summary.json", {
    raw: Buffer.from(
      line({
        schema_version: `${DATASET}-summary@1.0.0`,
        ...result.summary,
        claims: claims(),
      }),
    ),
    count: 1,
    type: "state-registration-license-supplemental-national-summary",
  });
  const paths = new Set(manifest.artifacts.map((item) => item.path));
  check(
    manifest.artifacts.length === 103 &&
      paths.size === 103 &&
      [...paths].every((item) => expected.has(item)),
    "closed artifacts",
  );
  for (const artifact of manifest.artifacts) {
    const item = expected.get(artifact.path);
    check(
      artifact.artifact_type === item.type &&
        artifact.record_count === item.count &&
        artifact.bytes === item.raw.length &&
        artifact.sha256 === sha(item.raw) &&
        (item.decoded === undefined
          ? artifact.decoded_bytes === undefined
          : artifact.decoded_bytes === item.decoded),
      `artifact ${artifact.path}`,
    );
    const actual = await bytes(
      inside(path.dirname(manifestPath), artifact.path),
      60_000_000,
    );
    check(actual.equals(item.raw), `artifact replay ${artifact.path}`);
    if (item.decoded !== undefined) {
      check(item.decoded <= 25_000_000, "decoded gzip bound");
      let decoded;
      try {
        decoded = gunzipSync(actual, { maxOutputLength: 25_000_000 });
      } catch {
        fail(`bounded gzip ${artifact.path}`);
      }
      check(decoded.length === item.decoded, `gzip replay ${artifact.path}`);
    }
  }
  check(
    JSON.stringify(body) ===
      JSON.stringify(manifestBody(result, manifest.artifacts)),
    "manifest replay",
  );
  check(
    (await fs.readdir(path.dirname(manifestPath))).sort().join("|") ===
      [...expected.keys(), "manifest.json"].sort().join("|"),
    "closed inventory",
  );
  return {
    verified: true,
    release_id,
    manifest_sha256: read.sha256,
    manifest_bytes: read.buffer.length,
    artifact_count: 103,
    ...result.summary,
  };
}
export async function verifyRegisteredNationalStateRegistrationLicenseSupplementalEvidence({
  root = APP_ROOT,
} = {}) {
  const registration = await json(
      inside(root, `config/datasets/${DATASET}.json`),
      200_000,
    ),
    value = registration.value;
  check(
    Object.keys(value).sort().join("|") ===
      [
        "claims",
        "dataset_id",
        "production_enrollment",
        "retained_release",
        "runtime_pointer",
        "schema_version",
        "status",
      ]
        .sort()
        .join("|") &&
      value.schema_version === `${DATASET}-registration@1.0.0` &&
      value.dataset_id === DATASET &&
      value.status === "registered-pointer-free-local-review-evidence" &&
      value.runtime_pointer === null &&
      value.production_enrollment === false &&
      JSON.stringify(value.claims) === JSON.stringify(claims()),
    "registration contract",
  );
  const retainedKeys = [
    "artifact_count",
    "geography_disposition_scope_rows",
    "issuer_state_marginal_rows",
    "manifest",
    "manifest_bytes",
    "manifest_sha256",
    "positive_zip5_rows",
    "release_id",
    "zero_zip5_rows",
    "zip5_rows",
  ];
  check(
    Object.keys(value.retained_release).sort().join("|") ===
      retainedKeys.sort().join("|") &&
      value.retained_release.manifest ===
        `data/${DATASET}/releases/${value.retained_release.release_id}/manifest.json`,
    "registration retained release contract",
  );
  const verified =
    await verifyNationalStateRegistrationLicenseSupplementalEvidence(
      inside(root, value.retained_release.manifest),
      { root },
    );
  for (const key of [
    "release_id",
    "manifest_sha256",
    "manifest_bytes",
    "artifact_count",
    "zip5_rows",
    "positive_zip5_rows",
    "zero_zip5_rows",
    "geography_disposition_scope_rows",
    "issuer_state_marginal_rows",
  ])
    check(
      verified[key] === value.retained_release[key],
      `registration pin ${key}`,
    );
  return verified;
}
export const nationalStateRegistrationLicenseSupplementalClaimsForTest = claims;
export const nationalStateRegistrationLicenseSupplementalReadForTest = (
  file,
  max,
) => bytes(file, max);
export const nationalStateRegistrationLicenseSupplementalAcquirePublicationLockForTest =
  (file, token) => acquirePublicationLock(file, token);
