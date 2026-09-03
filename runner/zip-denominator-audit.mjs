import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

import { APP_ROOT } from "./paths.mjs";

export const ZIP_DENOMINATOR_AUDIT_SCHEMA_VERSION = "1.1.0";
export const ZIP_DENOMINATOR_REASON_CONTRACT_MINIMUM_REGISTRY_VERSION = "2.10.0";
export const DEFAULT_ZIP_DENOMINATOR_AUDIT_COHORTS = Object.freeze([
  Object.freeze({
    cohort_id: "production-current",
    pointer: "data/business-registry/current.json",
    required: true,
  }),
  Object.freeze({
    cohort_id: "postal-migration-candidate",
    pointer: "data/migrations/normalized-us-postal-fields-v1/downstream/business-registry/current.json",
    required: false,
  }),
]);

const ALLOWED_USPS_STATUSES = new Set([
  "unverified",
  "listed-in-current-usps-area-district-file",
  "not-listed-in-current-usps-area-district-file",
]);

const OUTSIDE_ZCTA_STATUSES = new Set([
  "no-2020-zcta-polygon",
  "not-observed-in-integrated-census-coverage-union",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function memberSetSha256(values) {
  return sha256(values.length ? `${values.join("\n")}\n` : "");
}

function versionAtLeast(version, minimum) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
    if (!match) return null;
    return match.slice(1).map(Number);
  };
  const actual = parse(version);
  const floor = parse(minimum);
  if (!actual || !floor) return false;
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== floor[index]) return actual[index] > floor[index];
  }
  return true;
}

function assertContained(parent, candidate, label) {
  const relative = path.relative(parent, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes ${parent}.`);
  }
}

async function resolveExistingInside(root, candidate, label) {
  const resolved = path.resolve(root, candidate);
  assertContained(root, resolved, label);
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(resolved)]);
  assertContained(realRoot, realCandidate, label);
  return resolved;
}

async function readJsonDocument(filePath, label) {
  const buffer = await readFile(filePath);
  try {
    return {
      value: JSON.parse(buffer.toString("utf8")),
      bytes: buffer.length,
      sha256: sha256(buffer),
    };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function samples(values, limit = 10) {
  return values.slice(0, limit);
}

function evidenceSet(values, { includeValues = false } = {}) {
  return {
    count: values.length,
    zip5_member_set_sha256: memberSetSha256(values),
    sample_zip5: samples(values),
    ...(includeValues ? { zip5_values: values } : {}),
  };
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sourceReleaseForZcta(row) {
  return row.geography?.provenance?.source_release_id ?? null;
}

function detailForRow(row, includedInZcta, sourceReportedOutside, reason, unresolvedProofGapCodes, postalContractApplicable) {
  const postalCodePresent = Object.hasOwn(row, "postal_code");
  const zip4Present = Object.hasOwn(row, "zip4");
  const postalFieldsValid = postalCodePresent && row.postal_code === row.zip_code
    && zip4Present && row.zip4 === null;
  return {
    zip5: row.zip_code,
    artifact_postal_fields: {
      zip_code: row.zip_code,
      postal_code_present: postalCodePresent,
      ...(postalCodePresent ? { postal_code: row.postal_code } : {}),
      zip4_present: zip4Present,
      ...(zip4Present ? { zip4: row.zip4 } : {}),
    },
    split_postal_contract: {
      applicability: postalContractApplicable ? "required" : "not-applicable-legacy",
      status: postalContractApplicable ? (postalFieldsValid ? "passed" : "failed") : "not-evaluated",
      zip5_and_postal_code_are_equal: postalContractApplicable ? postalCodePresent && row.postal_code === row.zip_code : null,
      zip4_is_separate_and_null: postalContractApplicable ? zip4Present && row.zip4 === null : null,
      zip4_is_geometric: false,
    },
    registry_coverage_status: row.registry_coverage.status,
    governed_zcta_membership: includedInZcta ? {
      status: "included",
      geo_id: row.geography.geo_id,
      geoid: row.geography.geoid,
      source_release_id: sourceReleaseForZcta(row),
    } : {
      status: "not-in-denominator",
      geo_id: null,
      geoid: null,
      source_release_id: null,
    },
    source_reported_zip5_outside_zcta: sourceReportedOutside,
    usps_operational_evidence: {
      status: row.current_usps_validity.status,
      reason,
      source_release_id: row.current_usps_validity.source_release_id ?? null,
      source_month: row.current_usps_validity.source_month ?? null,
      deliverability_status: row.current_usps_validity.deliverability_status ?? "not-asserted",
    },
    unresolved_proof_gap_codes: unresolvedProofGapCodes,
  };
}

export function auditRegistryZipRows(rows, {
  registryPublisherVersion,
  includeRows = false,
  includeZipLists = true,
} = {}) {
  if (!Array.isArray(rows)) throw new Error("Registry ZIP rows must be an array.");
  if (!registryPublisherVersion) throw new Error("Registry publisher version is required for the ZIP denominator audit.");
  if (!/^\d+\.\d+\.\d+$/.test(registryPublisherVersion)) throw new Error("Registry publisher version must be a valid semantic version for the ZIP denominator audit.");
  const postalContractApplicable = versionAtLeast(
    registryPublisherVersion,
    ZIP_DENOMINATOR_REASON_CONTRACT_MINIMUM_REGISTRY_VERSION,
  );
  const reasonRequired = postalContractApplicable;
  const allZip5 = [];
  const governedZctaMembers = [];
  const sourceReportedOutsideZcta = [];
  const denominatorOnlyOutsideZcta = [];
  const unverifiedZip5 = [];
  const missingUnverifiedReasonZip5 = [];
  const missingPostalCodeZip5 = [];
  const joinedPostalCodeZip5 = [];
  const mismatchedPostalCodeZip5 = [];
  const missingZip4Zip5 = [];
  const nonNullZip4Zip5 = [];
  const statusCounts = new Map();
  const reasonCounts = new Map();
  const zctaSourceReleaseIds = new Set();
  const details = [];
  const seen = new Set();

  for (const row of rows) {
    const zip5 = row?.zip_code;
    if (!/^\d{5}$/.test(zip5 ?? "")) throw new Error(`Registry ZIP audit found an invalid ZIP5: ${zip5 ?? "(missing)"}.`);
    if (seen.has(zip5)) throw new Error(`Registry ZIP audit found duplicate ZIP5 ${zip5}.`);
    seen.add(zip5);
    allZip5.push(zip5);

    if (postalContractApplicable) {
      if (!Object.hasOwn(row, "postal_code")) missingPostalCodeZip5.push(zip5);
      else if (/^\d{5}-\d{4}$/.test(row.postal_code ?? "")) joinedPostalCodeZip5.push(zip5);
      else if (row.postal_code !== zip5) mismatchedPostalCodeZip5.push(zip5);
      if (!Object.hasOwn(row, "zip4")) missingZip4Zip5.push(zip5);
      else if (row.zip4 !== null) nonNullZip4Zip5.push(zip5);
    }

    if (!["record-level-source-contribution", "denominator-only-no-record-level-contribution"].includes(row.registry_coverage?.status)) {
      throw new Error(`Registry ZIP ${zip5} has an unsupported registry coverage status.`);
    }

    const geographyStatus = row.geography?.status;
    const includedInZcta = geographyStatus === "2020-zcta-polygon-available";
    if (includedInZcta) {
      if (row.geography.geo_id !== `zcta:${zip5}` || row.geography.geoid !== zip5
        || !String(sourceReleaseForZcta(row) ?? "").trim()) {
        throw new Error(`Registry ZIP ${zip5} has incomplete governed ZCTA membership evidence.`);
      }
      governedZctaMembers.push(zip5);
      zctaSourceReleaseIds.add(sourceReleaseForZcta(row));
    } else {
      if (!OUTSIDE_ZCTA_STATUSES.has(geographyStatus)
        || row.geography?.geo_id !== null || row.geography?.geoid !== null) {
        throw new Error(`Registry ZIP ${zip5} has an unsupported outside-ZCTA geography shape.`);
      }
      if (row.registry_coverage.status === "record-level-source-contribution") sourceReportedOutsideZcta.push(zip5);
      else denominatorOnlyOutsideZcta.push(zip5);
    }

    const uspsStatus = row.current_usps_validity?.status;
    if (!ALLOWED_USPS_STATUSES.has(uspsStatus)) {
      throw new Error(`Registry ZIP ${zip5} has unsupported USPS operational evidence status ${uspsStatus ?? "(missing)"}.`);
    }
    const reason = typeof row.current_usps_validity.reason === "string"
      ? row.current_usps_validity.reason.trim() || null
      : null;
    increment(statusCounts, uspsStatus);
    increment(reasonCounts, JSON.stringify([uspsStatus, reason]));

    const unresolvedProofGapCodes = [];
    if (uspsStatus === "unverified") {
      unverifiedZip5.push(zip5);
      unresolvedProofGapCodes.push("current-usps-operational-status-unverified");
      if (!reason) {
        missingUnverifiedReasonZip5.push(zip5);
        unresolvedProofGapCodes.push("unverified-usps-evidence-reason-missing");
      }
    }
    const sourceReportedOutside = !includedInZcta
      && row.registry_coverage.status === "record-level-source-contribution";
    if (sourceReportedOutside) {
      unresolvedProofGapCodes.push("source-reported-zip5-outside-governed-census-zcta");
    }
    if (postalContractApplicable) {
      if (!Object.hasOwn(row, "postal_code")) unresolvedProofGapCodes.push("postal-code-alias-missing");
      else if (/^\d{5}-\d{4}$/.test(row.postal_code ?? "")) unresolvedProofGapCodes.push("postal-code-alias-joined-with-zip4");
      else if (row.postal_code !== zip5) unresolvedProofGapCodes.push("postal-code-alias-does-not-equal-zip5");
      if (!Object.hasOwn(row, "zip4")) unresolvedProofGapCodes.push("separate-zip4-field-missing");
      else if (row.zip4 !== null) unresolvedProofGapCodes.push("aggregate-zip4-field-is-not-null");
    }
    if (includeRows) details.push(detailForRow(
      row,
      includedInZcta,
      sourceReportedOutside,
      reason,
      unresolvedProofGapCodes,
      postalContractApplicable,
    ));
  }

  for (const values of [allZip5, governedZctaMembers, sourceReportedOutsideZcta, denominatorOnlyOutsideZcta,
    unverifiedZip5, missingUnverifiedReasonZip5, missingPostalCodeZip5, joinedPostalCodeZip5,
    mismatchedPostalCodeZip5, missingZip4Zip5, nonNullZip4Zip5]) values.sort();
  if (includeRows) details.sort((left, right) => left.zip5.localeCompare(right.zip5));

  const reasonDistribution = [...reasonCounts.entries()]
    .map(([key, count]) => {
      const [status, reason] = JSON.parse(key);
      return { status, reason, count };
    })
    .sort((left, right) => left.status.localeCompare(right.status)
      || String(left.reason ?? "").localeCompare(String(right.reason ?? "")));
  const unresolvedProofGaps = [
    {
      gap_code: "current-usps-operational-status-unverified",
      meaning: "No governed authoritative current USPS operational evidence resolves these ZIP5 rows.",
      blocks_claim: "complete-current-valid-usps-zip-denominator",
      ...evidenceSet(unverifiedZip5),
    },
    {
      gap_code: "unverified-usps-evidence-reason-missing",
      meaning: "The row does not explain why its USPS operational status is unverified.",
      contract_violation: reasonRequired && missingUnverifiedReasonZip5.length > 0,
      ...evidenceSet(missingUnverifiedReasonZip5, { includeValues: includeZipLists }),
    },
    {
      gap_code: "source-reported-zip5-outside-governed-census-zcta",
      meaning: "Source evidence reports this ZIP5, but it is not a member of the governed Census ZCTA polygon denominator.",
      blocks_claim: "zip5-has-census-zcta-polygon",
      ...evidenceSet(sourceReportedOutsideZcta, { includeValues: includeZipLists }),
    },
    ...(postalContractApplicable ? [
      {
        gap_code: "postal-code-alias-missing",
        meaning: "Publisher 2.10 or later ZIP coverage row is missing the physical postal_code compatibility field.",
        contract_violation: missingPostalCodeZip5.length > 0,
        ...evidenceSet(missingPostalCodeZip5, { includeValues: includeZipLists }),
      },
      {
        gap_code: "postal-code-alias-joined-with-zip4",
        meaning: "The physical postal_code field improperly joins ZIP5 and ZIP+4 instead of equaling ZIP5.",
        contract_violation: joinedPostalCodeZip5.length > 0,
        ...evidenceSet(joinedPostalCodeZip5, { includeValues: includeZipLists }),
      },
      {
        gap_code: "postal-code-alias-does-not-equal-zip5",
        meaning: "The physical postal_code compatibility field does not exactly equal zip_code.",
        contract_violation: mismatchedPostalCodeZip5.length > 0,
        ...evidenceSet(mismatchedPostalCodeZip5, { includeValues: includeZipLists }),
      },
      {
        gap_code: "separate-zip4-field-missing",
        meaning: "Publisher 2.10 or later ZIP coverage row is missing the physical, separate zip4 field.",
        contract_violation: missingZip4Zip5.length > 0,
        ...evidenceSet(missingZip4Zip5, { includeValues: includeZipLists }),
      },
      {
        gap_code: "aggregate-zip4-field-is-not-null",
        meaning: "The ZIP denominator aggregate row carries address-level ZIP+4 evidence; this field must be explicitly null.",
        contract_violation: nonNullZip4Zip5.length > 0,
        ...evidenceSet(nonNullZip4Zip5, { includeValues: includeZipLists }),
      },
    ] : []),
  ].filter((gap) => gap.count > 0);

  const postalViolationCount = missingPostalCodeZip5.length + joinedPostalCodeZip5.length
    + mismatchedPostalCodeZip5.length + missingZip4Zip5.length + nonNullZip4Zip5.length;
  const contractStatus = (reasonRequired && missingUnverifiedReasonZip5.length > 0)
    || (postalContractApplicable && postalViolationCount > 0) ? "failed" : "passed";
  const result = {
    reason_contract: {
      minimum_registry_publisher_version: ZIP_DENOMINATOR_REASON_CONTRACT_MINIMUM_REGISTRY_VERSION,
      registry_publisher_version: registryPublisherVersion ?? null,
      unverified_reason_required: reasonRequired,
    },
    split_postal_field_contract: {
      minimum_registry_publisher_version: ZIP_DENOMINATOR_REASON_CONTRACT_MINIMUM_REGISTRY_VERSION,
      registry_publisher_version: registryPublisherVersion ?? null,
      applicability: postalContractApplicable ? "required" : "not-applicable-legacy",
      status: postalContractApplicable ? (postalViolationCount > 0 ? "failed" : "passed") : "not-evaluated",
      requirements: postalContractApplicable ? {
        postal_code_field_present_and_equal_to_zip_code: true,
        separate_zip4_field_present_and_null_for_aggregate_row: true,
        zip4_has_geometry: false,
      } : null,
      invalid_counts: postalContractApplicable ? {
        missing_postal_code: missingPostalCodeZip5.length,
        joined_postal_code: joinedPostalCodeZip5.length,
        mismatched_postal_code: mismatchedPostalCodeZip5.length,
        missing_zip4: missingZip4Zip5.length,
        non_null_zip4: nonNullZip4Zip5.length,
      } : null,
    },
    contract_status: contractStatus,
    audit_status: contractStatus === "failed"
      ? "failed-contract"
      : unresolvedProofGaps.length > 0 ? "passed-with-unresolved-proof-gaps" : "passed",
    counts: {
      zip5_rows: allZip5.length,
      governed_census_zcta_members: governedZctaMembers.length,
      source_reported_zip5_outside_governed_census_zcta: sourceReportedOutsideZcta.length,
      denominator_only_zip5_outside_governed_census_zcta: denominatorOnlyOutsideZcta.length,
      usps_operational_status_unverified: unverifiedZip5.length,
      unverified_usps_rows_missing_reason: missingUnverifiedReasonZip5.length,
    },
    governed_zcta_membership: {
      ...evidenceSet(governedZctaMembers),
      source_release_ids: [...zctaSourceReleaseIds].sort(),
      denominator_semantics: "complete selected governed U.S. Census Bureau ZCTA5 polygon set represented in this registry release",
    },
    source_reported_zip5_outside_governed_zcta: evidenceSet(sourceReportedOutsideZcta, { includeValues: includeZipLists }),
    denominator_only_zip5_outside_governed_zcta: evidenceSet(denominatorOnlyOutsideZcta, { includeValues: includeZipLists }),
    usps_operational_evidence: {
      status_counts: Object.fromEntries([...statusCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
      status_and_reason_distribution: reasonDistribution,
      address_level_deliverability_asserted: false,
    },
    unresolved_proof_gaps: unresolvedProofGaps,
    postal_field_policy: {
      source_zip5_field: "zip_code",
      compatibility_alias_field: postalContractApplicable ? "postal_code" : null,
      compatibility_alias_equals_zip5: postalContractApplicable && postalViolationCount === 0 ? true : null,
      zip4_field: postalContractApplicable ? "zip4" : null,
      zip4_joined_to_zip5: postalContractApplicable && postalViolationCount === 0 ? false : null,
      zip4_has_geometry: false,
      evidence_basis: postalContractApplicable ? "physical-fields-inspected" : "not-applicable-legacy-fields-not-asserted",
    },
    ...(includeRows ? { rows: details } : {}),
  };
  Object.defineProperty(result, "_audit_sets", {
    value: { allZip5, governedZctaMembers },
    enumerable: false,
  });
  return result;
}

async function readAndAuditZipArtifact(filePath, artifact, options) {
  const stream = createReadStream(filePath);
  const hash = createHash("sha256");
  let bytes = 0;
  stream.on("data", (chunk) => {
    bytes += chunk.length;
    hash.update(chunk);
  });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const rows = [];
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      rows.push({
        zip_code: row.zip_code,
        ...(Object.hasOwn(row, "postal_code") ? { postal_code: row.postal_code } : {}),
        ...(Object.hasOwn(row, "zip4") ? { zip4: row.zip4 } : {}),
        registry_coverage: { status: row.registry_coverage?.status },
        geography: {
          status: row.geography?.status,
          geo_id: row.geography?.geo_id,
          geoid: row.geography?.geoid,
          provenance: { source_release_id: row.geography?.provenance?.source_release_id },
        },
        current_usps_validity: {
          status: row.current_usps_validity?.status,
          reason: row.current_usps_validity?.reason,
          source_release_id: row.current_usps_validity?.source_release_id,
          source_month: row.current_usps_validity?.source_month,
          deliverability_status: row.current_usps_validity?.deliverability_status,
        },
      });
    } catch (error) {
      throw new Error(`Registry ZIP artifact line ${lineNumber} is invalid JSON: ${error.message}`);
    }
  }
  const actualSha256 = hash.digest("hex");
  if (bytes !== artifact.bytes || actualSha256 !== artifact.sha256 || rows.length !== artifact.record_count) {
    throw new Error("Registry ZIP artifact bytes, SHA-256, or record count do not match its manifest.");
  }
  return {
    analysis: auditRegistryZipRows(rows, options),
    artifact_evidence: {
      path: artifact.path,
      bytes,
      sha256: actualSha256,
      record_count: rows.length,
      artifact_type: artifact.artifact_type,
    },
  };
}

async function inspectCohort(appRoot, definition, options) {
  const pointerPath = path.resolve(appRoot, definition.pointer);
  try {
    await stat(pointerPath);
  } catch (error) {
    if (error.code === "ENOENT" && !definition.required) {
      return {
        public: {
          cohort_id: definition.cohort_id,
          availability: "unavailable",
          pointer_path: definition.pointer.replaceAll("\\", "/"),
          unavailable_reason: "pointer-not-found",
        },
        fingerprint: { cohort_id: definition.cohort_id, availability: "unavailable" },
        sets: null,
      };
    }
    throw error;
  }
  const safePointerPath = await resolveExistingInside(appRoot, definition.pointer, `${definition.cohort_id} pointer`);
  const pointerDocument = await readJsonDocument(safePointerPath, `${definition.cohort_id} pointer`);
  const pointer = pointerDocument.value;
  if (pointer.dataset_id !== "national-business-registry" || !String(pointer.manifest ?? "").trim()) {
    throw new Error(`${definition.cohort_id} does not point to a national business registry manifest.`);
  }
  const manifestCandidate = path.resolve(path.dirname(safePointerPath), pointer.manifest);
  assertContained(path.dirname(safePointerPath), manifestCandidate, `${definition.cohort_id} manifest`);
  const manifestPath = await resolveExistingInside(appRoot, path.relative(appRoot, manifestCandidate), `${definition.cohort_id} manifest`);
  const manifestDocument = await readJsonDocument(manifestPath, `${definition.cohort_id} manifest`);
  const manifest = manifestDocument.value;
  if (manifest.dataset_id !== pointer.dataset_id || manifest.release_id !== pointer.release_id
    || manifest.status !== "published-partial" || manifest.complete_national_business_registry !== false) {
    throw new Error(`${definition.cohort_id} pointer and manifest do not describe the same published-partial registry release.`);
  }
  const publisherVersion = manifest.publisher?.version;
  if (!/^\d+\.\d+\.\d+$/.test(publisherVersion ?? "")) {
    throw new Error(`${definition.cohort_id} registry publisher version is missing or invalid.`);
  }
  const artifact = manifest.artifacts?.find((candidate) => candidate.path === "derived/zip-coverage.jsonl"
    && candidate.artifact_type === "registry-zip-coverage-jsonl");
  if (!artifact) throw new Error(`${definition.cohort_id} registry release has no governed ZIP coverage artifact.`);
  const releaseDirectory = path.dirname(manifestPath);
  const artifactCandidate = path.resolve(releaseDirectory, artifact.path);
  assertContained(releaseDirectory, artifactCandidate, `${definition.cohort_id} ZIP artifact`);
  const artifactPath = await resolveExistingInside(appRoot, path.relative(appRoot, artifactCandidate), `${definition.cohort_id} ZIP artifact`);
  const audited = await readAndAuditZipArtifact(artifactPath, artifact, {
    registryPublisherVersion: publisherVersion,
    includeRows: options.includeRows,
    includeZipLists: options.includeZipLists,
  });
  return {
    public: {
      cohort_id: definition.cohort_id,
      availability: "available",
      pointer_path: path.relative(appRoot, safePointerPath).replaceAll("\\", "/"),
      pointer_sha256: pointerDocument.sha256,
      manifest_path: path.relative(appRoot, manifestPath).replaceAll("\\", "/"),
      manifest_sha256: manifestDocument.sha256,
      dataset_id: manifest.dataset_id,
      release_id: manifest.release_id,
      publisher_version: publisherVersion,
      release_status: manifest.status,
      authoritative_current_usps_zip_denominator: manifest.coverage?.authoritative_current_usps_zip_denominator ?? null,
      artifact: audited.artifact_evidence,
      ...audited.analysis,
    },
    fingerprint: {
      cohort_id: definition.cohort_id,
      availability: "available",
      pointer_sha256: pointerDocument.sha256,
      manifest_sha256: manifestDocument.sha256,
      zip_artifact_sha256: audited.artifact_evidence.sha256,
    },
    sets: audited.analysis._audit_sets,
  };
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function compareAvailableCohorts(inspected, includeZipLists) {
  const available = inspected.filter((cohort) => cohort.sets);
  if (available.length !== 2) return null;
  const [left, right] = available;
  const leftOnlyZip5 = difference(left.sets.allZip5, right.sets.allZip5);
  const rightOnlyZip5 = difference(right.sets.allZip5, left.sets.allZip5);
  const leftOnlyZcta = difference(left.sets.governedZctaMembers, right.sets.governedZctaMembers);
  const rightOnlyZcta = difference(right.sets.governedZctaMembers, left.sets.governedZctaMembers);
  return {
    left_cohort_id: left.public.cohort_id,
    right_cohort_id: right.public.cohort_id,
    zip5_rows_only_in_left: evidenceSet(leftOnlyZip5, { includeValues: includeZipLists }),
    zip5_rows_only_in_right: evidenceSet(rightOnlyZip5, { includeValues: includeZipLists }),
    governed_zcta_members_only_in_left: evidenceSet(leftOnlyZcta, { includeValues: includeZipLists }),
    governed_zcta_members_only_in_right: evidenceSet(rightOnlyZcta, { includeValues: includeZipLists }),
  };
}

export async function auditZipDenominators({
  appRoot = APP_ROOT,
  cohorts = DEFAULT_ZIP_DENOMINATOR_AUDIT_COHORTS,
  includeRows = false,
  includeZipLists = true,
} = {}) {
  const resolvedRoot = path.resolve(appRoot);
  const inspected = [];
  for (const cohort of cohorts) {
    inspected.push(await inspectCohort(resolvedRoot, cohort, { includeRows, includeZipLists }));
  }
  const available = inspected.filter((cohort) => cohort.public.availability === "available");
  const contractFailures = available.filter((cohort) => cohort.public.contract_status === "failed");
  const unavailableRequired = inspected.filter((cohort) => cohort.public.availability !== "available"
    && cohorts.find((definition) => definition.cohort_id === cohort.public.cohort_id)?.required);
  const fingerprint = inspected.map((cohort) => cohort.fingerprint);
  return {
    schema_version: ZIP_DENOMINATOR_AUDIT_SCHEMA_VERSION,
    audit_id: `zip-denominator-audit-${sha256(JSON.stringify({
      schema_version: ZIP_DENOMINATOR_AUDIT_SCHEMA_VERSION,
      cohorts: fingerprint,
    })).slice(0, 24)}`,
    audit_mode: "read-only",
    overall_contract_status: contractFailures.length || unavailableRequired.length ? "failed" : "passed",
    claim_boundary: {
      valid_usps_zip_denominator_complete: false,
      reason: "Census ZCTA membership and source-reported ZIP5 values do not establish a complete current USPS operational ZIP denominator.",
      zcta_is_statistical_polygon_not_postal_delivery_boundary: true,
      zip4_is_non_geometric: true,
    },
    cohorts: inspected.map((cohort) => cohort.public),
    comparison: compareAvailableCohorts(inspected, includeZipLists),
  };
}
