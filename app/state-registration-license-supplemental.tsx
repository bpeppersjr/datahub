"use client";
import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

const D = "national-state-registration-license-supplemental-evidence";
const classes = [
  "organization-registration-address",
  "business-license-address",
  "legal-registration-address",
  "assumed-business-name-address",
  "construction-contractor-license",
] as const;
const dimensions = [
  [
    "broad_org_ct_organization_addresses",
    "CT",
    classes[0],
    "connecticut-business-registry-business-master-active",
  ],
  [
    "broad_org_de_license_addresses",
    "DE",
    classes[1],
    "delaware-division-of-revenue-current-business-licenses",
  ],
  [
    "broad_org_co_organization_addresses",
    "CO",
    classes[0],
    "colorado-business-entities-good-standing-or-delinquent",
  ],
  [
    "broad_org_or_legal_registration_addresses",
    "OR",
    classes[2],
    "oregon-active-business-registrations-principal-place",
  ],
  [
    "broad_org_or_brand_registration_addresses",
    "OR",
    classes[3],
    "oregon-active-business-registrations-principal-place",
  ],
  [
    "broad_org_ia_organization_addresses",
    "IA",
    classes[0],
    "iowa-active-business-entities",
  ],
  [
    "broad_org_ny_organization_addresses",
    "NY",
    classes[0],
    "new-york-active-corporations-monthly-extract",
  ],
  [
    "broad_org_fl_organization_addresses",
    "FL",
    classes[0],
    "florida-sunbiz-quarterly-corporate-data",
  ],
  [
    "broad_org_pa_organization_addresses",
    "PA",
    classes[0],
    "pennsylvania-department-of-state-active-business-registrations",
  ],
  [
    "wa_lni_active_contractor_organization_mailing_addresses",
    "WA",
    classes[4],
    "washington-lni-active-contractor-licenses",
  ],
] as const;
const issuerCounts = [
  ["CT", 458892, 448166, 10726],
  ["DE", 66667, 66502, 165],
  ["CO", 2164811, 2150360, 14451],
  ["OR", 559882, 559530, 352],
  ["IA", 347200, 334176, 13024],
  ["NY", 4273072, 350933, 3922139],
  ["FL", 4109230, 3928280, 180950],
  ["PA", 2360829, 2102830, 257999],
  ["WA", 74141, 74030, 111],
] as const;
const pins = {
  release: `${D}-560d12835e8adf6d9c5c627b580ee12e7ccd54fb8210e384ed3f168a2bea2ebd`,
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
type Dimension = {
  dimension_id: string;
  issuer_state: string;
  evidence_class: string;
  source_id: string;
  source_address_membership_count: number;
  review_status: "stale";
};
type Scope = {
  schema_version: string;
  scope_id: string;
  scope_kind: string;
  scope_label: string;
  state_geo_id: string | null;
  state_fips: string | null;
  state_name: string | null;
  postal_abbreviation: string | null;
  zip5_rows: number;
  positive_zip5_rows: number;
  source_address_membership_count: number;
  dimensions: Dimension[];
};
type ZipRow = {
  schema_version: string;
  zip5: string;
  zip4: null;
  status: string;
  geography_disposition_scope_id: string;
  source_address_membership_count: number;
  dimensions: Dimension[];
};
type Issuer = {
  schema_version: string;
  issuer_state: string;
  source_id: string;
  source_address_row_count: number;
  eligible_address_membership_count: number;
  missing_or_ineligible_address_membership_count: number;
  outside_governed_cohort_address_membership_count: 0;
  comparison_only: true;
  geography_disposition_scope_id: null;
  review_status: "stale";
};
type Release = Record<string, string>;
type SummaryView = {
  schema_version: string;
  release: Release;
  summary: Record<string, unknown>;
  classes: string[];
  sources: Array<
    Omit<Dimension, "source_address_membership_count" | "review_status">
  >;
  scopes: { states: unknown[]; territories: unknown[]; special: unknown[] };
  issuer_marginals: Issuer[];
  claims: Record<string, unknown>;
};
type Lookup = {
  schema_version: string;
  release: Release;
  status: string;
  row?: ZipRow | null;
  scope?: Scope;
  partition?: { path: string; sha256: string } | null;
  zip5?: string;
  issuer_marginal_comparison?: Record<string, unknown> | null;
  claims: Record<string, unknown>;
};
const exact = (v: unknown, keys: string[]) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join("|") === [...keys].sort().join("|");
const integer = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
const releaseKeys = [
  "release_id",
  "registration_sha256",
  "manifest_sha256",
  "scope_artifact_sha256",
  "issuer_marginals_artifact_sha256",
  "summary_artifact_sha256",
  "broad_registration_sha256",
  "broad_manifest_sha256",
  "jurisdiction_manifest_sha256",
  "jurisdiction_artifact_sha256",
  "wa_manifest_sha256",
  "wa_zip_coverage_artifact_sha256",
];
const validRelease = (v: unknown): v is Release =>
  exact(v, releaseKeys) &&
  (v as Release).release_id === pins.release &&
  (v as Release).registration_sha256 === pins.registration &&
  (v as Release).manifest_sha256 === pins.manifest &&
  (v as Release).scope_artifact_sha256 === pins.scopes &&
  (v as Release).issuer_marginals_artifact_sha256 === pins.issuers &&
  (v as Release).summary_artifact_sha256 === pins.summary &&
  (v as Release).broad_registration_sha256 === pins.broadRegistration &&
  (v as Release).broad_manifest_sha256 === pins.broadManifest &&
  (v as Release).jurisdiction_manifest_sha256 === pins.disposition &&
  (v as Release).jurisdiction_artifact_sha256 === pins.dispositionArtifact &&
  (v as Release).wa_manifest_sha256 === pins.waManifest &&
  (v as Release).wa_zip_coverage_artifact_sha256 === pins.waArtifact;
const validClaims = (v: unknown) =>
  exact(v, [
    "record_unit",
    "governed_lookup_statuses",
    "issuer_state_marginals_are_separate",
    "geography_disposition_and_issuer_state_are_separate",
    "cross_source_additivity_asserted",
    "additive_business_count_asserted",
    "unique_business_count",
    "current_operation_verified",
    "physical_site_verified",
    "all_business_completeness",
    "authoritative_current_usps_zip_validity",
    "state_inferred_from_zip_prefix",
    "zip4_joined",
    "wa_mailing_address_only",
    "wa_record_level_local_review_only",
    "de_record_level_local_review_only",
    "observed_newer_counts_are_not_net_business_creation",
    "network_requests",
    "source_acquisition_performed",
    "current_pointer_written",
    "production_enrollment",
  ]) &&
  (v as Record<string, unknown>).record_unit ===
    "source-reported registration-or-license address membership" &&
  JSON.stringify((v as Record<string, unknown>).governed_lookup_statuses) ===
    JSON.stringify([
      "governed-supplemental-memberships",
      "governed-zero-supplemental-memberships",
      "outside-governed-cohort",
    ]) &&
  (v as Record<string, unknown>).issuer_state_marginals_are_separate === true &&
  (v as Record<string, unknown>)
    .geography_disposition_and_issuer_state_are_separate === true &&
  (v as Record<string, unknown>).cross_source_additivity_asserted === false &&
  (v as Record<string, unknown>).additive_business_count_asserted === false &&
  (v as Record<string, unknown>).unique_business_count === null &&
  (v as Record<string, unknown>).current_operation_verified === false &&
  (v as Record<string, unknown>).physical_site_verified === false &&
  (v as Record<string, unknown>).all_business_completeness === null &&
  (v as Record<string, unknown>).authoritative_current_usps_zip_validity ===
    null &&
  (v as Record<string, unknown>).state_inferred_from_zip_prefix === false &&
  (v as Record<string, unknown>).zip4_joined === false &&
  (v as Record<string, unknown>).wa_mailing_address_only === true &&
  (v as Record<string, unknown>).wa_record_level_local_review_only === true &&
  (v as Record<string, unknown>).de_record_level_local_review_only === true &&
  (v as Record<string, unknown>)
    .observed_newer_counts_are_not_net_business_creation === true &&
  (v as Record<string, unknown>).network_requests === 0 &&
  (v as Record<string, unknown>).source_acquisition_performed === false &&
  (v as Record<string, unknown>).current_pointer_written === false &&
  (v as Record<string, unknown>).production_enrollment === false;
function validDimensions(v: unknown): v is Dimension[] {
  return (
    Array.isArray(v) &&
    v.length === 10 &&
    v.every(
      (x, i) =>
        exact(x, [
          "dimension_id",
          "issuer_state",
          "evidence_class",
          "source_id",
          "source_address_membership_count",
          "review_status",
        ]) &&
        (x as Dimension).dimension_id === dimensions[i][0] &&
        (x as Dimension).issuer_state === dimensions[i][1] &&
        (x as Dimension).evidence_class === dimensions[i][2] &&
        (x as Dimension).source_id === dimensions[i][3] &&
        integer((x as Dimension).source_address_membership_count) &&
        (x as Dimension).review_status === "stale",
    )
  );
}
function validScope(v: unknown): v is Scope {
  return (
    exact(v, [
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
    ]) &&
    (v as Scope).schema_version === `${D}-scope@1.0.0` &&
    integer((v as Scope).zip5_rows) &&
    integer((v as Scope).positive_zip5_rows) &&
    validDimensions((v as Scope).dimensions) &&
    (v as Scope).dimensions.reduce(
      (n, x) => n + x.source_address_membership_count,
      0,
    ) === (v as Scope).source_address_membership_count
  );
}
export function validStateRegistrationLicenseSummary(
  v: unknown,
): v is SummaryView {
  if (
    !exact(v, [
      "schema_version",
      "release",
      "summary",
      "classes",
      "sources",
      "scopes",
      "issuer_marginals",
      "claims",
    ])
  )
    return false;
  const x = v as SummaryView,
    s = x.summary as Record<string, unknown>;
  return (
    x.schema_version === `${D}-runtime-summary@1.0.0` &&
    validRelease(x.release) &&
    validClaims(x.claims) &&
    JSON.stringify(x.classes) === JSON.stringify(classes) &&
    x.sources.length === 10 &&
    x.sources.every(
      (source, i) =>
        exact(source, [
          "dimension_id",
          "issuer_state",
          "evidence_class",
          "source_id",
        ]) &&
        source.dimension_id === dimensions[i][0] &&
        source.issuer_state === dimensions[i][1] &&
        source.evidence_class === dimensions[i][2] &&
        source.source_id === dimensions[i][3],
    ) &&
    exact(x.scopes, ["states", "territories", "special"]) &&
    x.scopes.states.length === 51 &&
    x.scopes.territories.length === 5 &&
    x.scopes.special.length === 4 &&
    x.issuer_marginals.length === 9 &&
    x.issuer_marginals.every(
      (r, i) =>
        exact(r, [
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
        ]) &&
        r.schema_version === `${D}-issuer-state-marginal@1.0.0` &&
        r.issuer_state === issuerCounts[i][0] &&
        r.source_address_row_count === issuerCounts[i][1] &&
        r.eligible_address_membership_count === issuerCounts[i][2] &&
        r.missing_or_ineligible_address_membership_count ===
          issuerCounts[i][3] &&
        r.source_address_row_count ===
          r.eligible_address_membership_count +
            r.missing_or_ineligible_address_membership_count &&
        r.outside_governed_cohort_address_membership_count === 0 &&
        r.comparison_only === true &&
        r.geography_disposition_scope_id === null &&
        r.review_status === "stale",
    ) &&
    exact(s, [
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
    ]) &&
    s.schema_version === `${D}-summary@1.0.0` &&
    validClaims(s.claims) &&
    s.zip5_rows === 48194 &&
    s.positive_zip5_rows === 31050 &&
    s.zero_zip5_rows === 17144 &&
    s.geography_disposition_scope_rows === 60 &&
    s.state_scope_rows === 51 &&
    s.territory_scope_rows === 5 &&
    s.special_scope_rows === 4 &&
    s.issuer_state_marginal_rows === 9 &&
    s.dimension_rows === 10 &&
    s.source_address_row_count === 14414724 &&
    s.eligible_address_membership_count === 10014807 &&
    s.missing_or_ineligible_address_membership_count === 4399917
  );
}
export function validStateRegistrationLicenseZip(
  v: unknown,
  zip: string,
): v is Lookup {
  if (
    !exact(v, [
      "schema_version",
      "release",
      "partition",
      "zip5",
      "status",
      "row",
      "claims",
    ])
  )
    return false;
  const x = v as Lookup;
  if (
    x.schema_version !== `${D}-runtime-zip@1.0.0` ||
    x.zip5 !== zip ||
    !validRelease(x.release) ||
    !validClaims(x.claims) ||
    ![
      "governed-supplemental-memberships",
      "governed-zero-supplemental-memberships",
      "outside-governed-cohort",
    ].includes(x.status)
  )
    return false;
  if (
    !exact(x.partition, ["path", "sha256"]) ||
    x.partition?.path !== `zip2=${zip.slice(0, 2)}.jsonl.gz` ||
    !/^[a-f0-9]{64}$/.test(x.partition.sha256)
  )
    return false;
  if (x.status === "outside-governed-cohort") return x.row === null;
  const r = x.row;
  if (
    !r ||
    !exact(r, [
      "schema_version",
      "zip5",
      "zip4",
      "status",
      "geography_disposition_scope_id",
      "source_address_membership_count",
      "dimensions",
    ]) ||
    r.schema_version !== `${D}-zip@1.0.0` ||
    r.zip5 !== zip ||
    r.zip4 !== null ||
    r.status !== x.status ||
    !validDimensions(r.dimensions)
  )
    return false;
  return (
    r.dimensions.reduce((n, d) => n + d.source_address_membership_count, 0) ===
      r.source_address_membership_count &&
    r.source_address_membership_count > 0 ===
      (x.status === "governed-supplemental-memberships")
  );
}
export function validStateRegistrationLicenseJurisdiction(
  v: unknown,
  state: string,
): v is Lookup {
  if (
    !exact(v, [
      "schema_version",
      "release",
      "status",
      "scope",
      "issuer_marginal_comparison",
      "claims",
    ])
  )
    return false;
  const x = v as Lookup;
  return (
    x.schema_version === `${D}-runtime-jurisdiction@1.0.0` &&
    validRelease(x.release) &&
    validClaims(x.claims) &&
    validScope(x.scope) &&
    x.scope.postal_abbreviation === state &&
    x.status ===
      (x.scope.source_address_membership_count > 0
        ? "governed-supplemental-memberships"
        : "governed-zero-supplemental-memberships")
  );
}
const n = (v: number) => v.toLocaleString("en-US");
export default function StateRegistrationLicenseSupplemental({
  state,
  zip5,
}: {
  state?: string;
  zip5?: string;
}) {
  const [summary, setSummary] = useState<SummaryView | null>(null),
    [summaryFailed, setSummaryFailed] = useState(false),
    [lookup, setLookup] = useState<{
      key: string;
      value: Lookup | null;
      failed: boolean;
    } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void runnerJson<unknown>(
      "/api/business-map/state-registration-license-supplemental-summary",
      { signal: c.signal },
    )
      .then((v) => {
        if (!c.signal.aborted) {
          if (validStateRegistrationLicenseSummary(v)) setSummary(v);
          else setSummaryFailed(true);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setSummaryFailed(true);
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    const key = state ?? zip5 ?? "";
    if (!(state && /^[A-Z]{2}$/.test(state)) && !(zip5 && /^\d{5}$/.test(zip5)))
      return;
    const c = new AbortController(),
      url = state
        ? `/api/business-map/state-registration-license-supplemental-jurisdiction?state=${encodeURIComponent(state)}`
        : `/api/business-map/state-registration-license-supplemental-zip?zip=${encodeURIComponent(zip5!)}`;
    void runnerJson<unknown>(url, { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted) {
          const ok = state
            ? validStateRegistrationLicenseJurisdiction(v, state)
            : validStateRegistrationLicenseZip(v, zip5!);
          setLookup({ key, value: ok ? (v as Lookup) : null, failed: !ok });
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setLookup({ key, value: null, failed: true });
      });
    return () => c.abort();
  }, [state, zip5]);
  const key = state ?? zip5 ?? "",
    current = lookup?.key === key ? lookup : null,
    row = current?.value?.scope ?? current?.value?.row;
  return (
    <article
      className="state-alignment-card"
      aria-label="State registration and license supplemental evidence"
    >
      <div>
        <span>Registration / license supplemental evidence</span>
        <strong>
          {state
            ? `Selected state ${state}`
            : zip5
              ? `Exact ZIP ${zip5}`
              : "Select a state or exact ZIP"}
        </strong>
      </div>
      {summary ? (
        <p>
          <strong>National source-address context:</strong>{" "}
          {n(summary.summary.eligible_address_membership_count as number)}{" "}
          eligible memberships ·{" "}
          {n(
            summary.summary
              .missing_or_ineligible_address_membership_count as number,
          )}{" "}
          missing/ineligible · 9 issuer marginals, 10 dimensions, 5 evidence
          classes.
        </p>
      ) : summaryFailed ? (
        <p role="status">
          Registration/license supplemental context is unavailable. Lifecycle,
          IRS, and maintenance status remain available.
        </p>
      ) : (
        <p role="status">
          Verifying registration/license supplemental context…
        </p>
      )}
      {current?.failed && (
        <p role="status">
          Selected registration/license supplemental evidence is unavailable.
          Other status panels are unaffected.
        </p>
      )}
      {current?.value?.status === "outside-governed-cohort" && (
        <p>
          <strong>Outside the governed exact-ZIP cohort.</strong> This is not a
          supplemental zero, an invalid ZIP, or evidence that no businesses
          exist. The ZIP is not converted into a state or inferred from its
          prefix.
        </p>
      )}
      {row && (
        <>
          <p>
            <strong>
              {"scope_label" in row ? row.scope_label : `ZIP ${row.zip5}`}:
            </strong>{" "}
            {n(row.source_address_membership_count)} source-address memberships.{" "}
            {row.source_address_membership_count === 0
              ? "Governed supplemental zero across all 10 dimensions; this is not zero businesses."
              : "Source-relative evidence; not unique businesses or verified current operations."}
          </p>
          <div className="entity-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Issuer / dimension</th>
                  <th>Evidence class</th>
                  <th>Address memberships</th>
                </tr>
              </thead>
              <tbody>
                {row.dimensions.map((d) => (
                  <tr key={d.dimension_id}>
                    <th>
                      {d.issuer_state} · {d.dimension_id}
                    </th>
                    <td>
                      {d.evidence_class}
                      {d.issuer_state === "WA"
                        ? " · contractor-license mailing-address evidence"
                        : ""}
                    </td>
                    <td>{n(d.source_address_membership_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {summary && (
        <details>
          <summary>Issuer-state marginals and boundaries</summary>
          {summary.issuer_marginals.map((i) => (
            <p key={i.issuer_state}>
              <strong>{i.issuer_state} issuer marginal:</strong>{" "}
              {n(i.source_address_row_count)} source-address rows ={" "}
              {n(i.eligible_address_membership_count)} eligible +{" "}
              {n(i.missing_or_ineligible_address_membership_count)}{" "}
              missing/ineligible. Separate marginal—not record linkage or a
              governed geography assignment.
            </p>
          ))}
        </details>
      )}
      <p className="entity-method-note">
        Supplemental administrative evidence only. Broad registrations, Delaware
        mixed-industry licenses, Oregon legal and assumed-name records, and
        Washington contractor-license mailing addresses remain distinct. Counts
        are not additive businesses, unique businesses, completeness, physical
        sites, or verified current operations. ZIP+4 is separate; USPS validity
        and ZIP-to-state inference are not asserted.
      </p>
    </article>
  );
}
