import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { auditZipDenominators } from "./zip-denominator-audit.mjs";

export const NATIONAL_ZIP_COVERAGE_SUMMARY_SCHEMA = "national-zip-coverage-summary@1.0.0";
const DATASET_ID = "national-zip-coverage-summary";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const check = (condition, message = "National ZIP coverage summary rejected.") => { if (!condition) throw new Error(message); };
const isDigest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isIso = (value) => { try { return typeof value === "string" && new Date(value).toISOString() === value; } catch { return false; } };
function failure(code, message) { const error = new Error(message); error.code = code; return error; }
function contained(parent, candidate) { const relative = path.relative(parent, candidate); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); }

function compactSet(value) {
  check(Number.isSafeInteger(value?.count) && value.count >= 0 && isDigest(value?.zip5_member_set_sha256), "ZIP coverage member-set evidence is invalid.");
  return { count: value.count, member_set_sha256: value.zip5_member_set_sha256 };
}

function containsArray(value) {
  if (Array.isArray(value)) return true;
  return value && typeof value === "object" && Object.values(value).some(containsArray);
}
function sameShape(left, right) {
  if (!left || typeof left !== "object" || !right || typeof right !== "object") return true;
  const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
  return JSON.stringify(leftKeys) === JSON.stringify(rightKeys)
    && leftKeys.every((key) => sameShape(left[key], right[key]));
}

export function buildNationalZipCoverageSummary(report, { cohortId, releaseId, createdAt, projectionMode = "immutable-release" } = {}) {
  check(/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(releaseId ?? ""), "A canonical ZIP coverage summary release ID is required.");
  check(isIso(createdAt), "ZIP coverage summary created_at must be canonical ISO-8601 UTC.");
  check(["immutable-release", "live-verified-projection"].includes(projectionMode), "ZIP coverage projection mode is invalid.");
  check(report?.overall_contract_status === "passed", "ZIP denominator audit contract did not pass.");
  check(typeof cohortId === "string" && cohortId.length > 0, "An exact governed ZIP cohort ID is required.");
  const cohort = report.cohorts?.find((row) => row.cohort_id === cohortId);
  check(cohort?.availability === "available" && cohort.contract_status === "passed", "Governed ZIP cohort is unavailable or invalid.");
  check(cohort.dataset_id === "national-business-registry" && cohort.pointer_dataset_id === cohort.dataset_id
    && cohort.pointer_release_id === cohort.release_id && cohort.pointer_status === cohort.release_status
    && cohort.release_status === "published-partial" && cohort.complete_national_business_registry === false,
  "Registry pointer, release, or completeness evidence is invalid.");
  check(cohort.artifact?.distribution_policy === "local-review-only", "ZIP coverage artifact lacks local-review-only distribution governance.");
  check(cohort.source_reported_zip5_quality?.conservation?.status === "passed"
    && cohort.registry_coverage?.conservation?.status === "passed"
    && cohort.split_postal_field_contract?.applicability === "required"
    && cohort.split_postal_field_contract?.status === "passed", "Upstream ZIP conservation or split-field contract did not pass.");
  const registry = compactSet(cohort.registry_zip5_members);
  const recordContribution = compactSet(cohort.registry_coverage?.record_level_source_contribution);
  const denominatorOnly = compactSet(cohort.registry_coverage?.denominator_only_no_record_level_contribution);
  const placeholder = compactSet(cohort.source_reported_zip5_quality?.classes?.explicit_placeholder);
  const zcta = compactSet(cohort.governed_zcta_membership);
  check(cohort.governed_zcta_membership.source_release_ids?.length === 1
    && String(cohort.governed_zcta_membership.source_release_ids[0]).trim(), "A single governed Census ZCTA release binding is required.");
  const outsideSource = compactSet(cohort.source_reported_zip5_outside_governed_zcta);
  const outsideDenominator = compactSet(cohort.denominator_only_zip5_outside_governed_zcta);
  const listed = compactSet(cohort.usps_operational_evidence?.listed_members);
  const notListed = compactSet(cohort.usps_operational_evidence?.not_listed_members);
  const unverified = compactSet(cohort.usps_operational_evidence?.unverified_members);
  const classificationTotal = placeholder.count + zcta.count + outsideSource.count + outsideDenominator.count;
  const coverageTotal = recordContribution.count + denominatorOnly.count;
  const uspsStatusTotal = listed.count + notListed.count + unverified.count;
  check(classificationTotal === registry.count && coverageTotal === registry.count && uspsStatusTotal === registry.count,
    "National ZIP coverage conservation failed.");
  const denominator = cohort.authoritative_current_usps_zip_denominator;
  const reconciliation = cohort.usps_zip_member_set_reconciliation;
  if (denominator) {
    check(Number.isSafeInteger(denominator.count) && denominator.count >= 0 && isDigest(denominator.member_set_sha256), "USPS assignment denominator is invalid.");
    check(reconciliation?.exact_member_set_match === true && isDigest(reconciliation.sha256) && reconciliation.member_count === denominator.count
      && listed.count === denominator.count && listed.member_set_sha256 === denominator.member_set_sha256,
    "USPS assignment reconciliation is not exact.");
    check(reconciliation.source_dataset_id === denominator.dataset_id && reconciliation.source_release_id === denominator.release_id
      && reconciliation.source_month === denominator.source_month
      && reconciliation.assignment_artifact_sha256 === denominator.assignment_artifact_sha256
      && isDigest(reconciliation.source_manifest_sha256) && isDigest(denominator.assignment_artifact_sha256),
    "USPS source provenance does not match the exact reconciliation.");
    check(unverified.count === 0 && cohort.complete_current_usps_assignment_denominator_verified === true
      && report.claim_boundary.valid_usps_zip_denominator_complete === true,
    "USPS completeness flags are inconsistent with exact reconciliation.");
  } else {
    check(reconciliation === null && listed.count === 0 && notListed.count === 0 && unverified.count === registry.count
      && cohort.complete_current_usps_assignment_denominator_verified === false
      && report.claim_boundary.valid_usps_zip_denominator_complete === false,
    "No-USPS state must remain wholly unverified and incomplete.");
  }
  const summary = {
    schema_version: NATIONAL_ZIP_COVERAGE_SUMMARY_SCHEMA,
    dataset_id: DATASET_ID,
    release_id: releaseId,
    created_at: createdAt,
    projection_mode: projectionMode,
    bindings: {
      zip_denominator_audit_schema_version: report.schema_version,
      zip_denominator_audit_id: report.audit_id,
      cohort_id: cohort.cohort_id,
      registry_pointer_path: cohort.pointer_path,
      registry_pointer_dataset_id: cohort.pointer_dataset_id,
      registry_pointer_release_id: cohort.pointer_release_id,
      registry_pointer_status: cohort.pointer_status,
      registry_pointer_manifest: cohort.pointer_manifest,
      registry_release_id: cohort.release_id,
      registry_dataset_id: cohort.dataset_id,
      registry_release_status: cohort.release_status,
      registry_publisher_version: cohort.publisher_version,
      registry_complete_national_business_registry: cohort.complete_national_business_registry,
      registry_pointer_sha256: cohort.pointer_sha256,
      registry_manifest_sha256: cohort.manifest_sha256,
      registry_zip_artifact_path: cohort.artifact.path,
      registry_zip_artifact_bytes: cohort.artifact.bytes,
      registry_zip_artifact_record_count: cohort.artifact.record_count,
      registry_zip_artifact_type: cohort.artifact.artifact_type,
      registry_zip_artifact_distribution_policy: cohort.artifact.distribution_policy,
      registry_zip_artifact_sha256: cohort.artifact.sha256,
      census_zcta_source_release_id: cohort.governed_zcta_membership.source_release_ids[0],
      census_zcta_member_set_sha256: zcta.member_set_sha256,
      reconciliation_artifact_path: reconciliation?.path ?? null,
      reconciliation_artifact_bytes: reconciliation?.bytes ?? null,
      reconciliation_artifact_sha256: reconciliation?.sha256 ?? null,
      usps_source_dataset_id: denominator?.dataset_id ?? null,
      usps_source_release_id: denominator?.release_id ?? null,
      usps_source_month: denominator?.source_month ?? null,
      usps_source_manifest_sha256: reconciliation?.source_manifest_sha256 ?? null,
      usps_assignment_artifact_sha256: denominator?.assignment_artifact_sha256 ?? null,
      usps_evidence_scope: denominator?.evidence_scope ?? null,
      usps_distribution_policy: denominator?.distribution_policy ?? null,
    },
    registry_zip5: {
      semantics: "unique five-digit registry coverage keys; not a deliverability assertion",
      members: registry,
      record_level_source_contribution: recordContribution,
      denominator_only_no_record_level_contribution: denominatorOnly,
      explicit_placeholder: placeholder,
      conservation: { classified_count: coverageTotal, total_count: registry.count, status: "passed" },
    },
    census_zcta: {
      semantics: "Census statistical polygon membership; not a USPS ZIP assignment or delivery boundary",
      statistical_geography_not_usps_postal_delivery_boundary: true,
      same_code_governed_zcta_members: zcta,
      source_reported_zip5_without_same_code_zcta: outsideSource,
      denominator_only_zip5_without_same_code_zcta: outsideDenominator,
      classification_conservation: { classified_count: classificationTotal, total_count: registry.count, status: "passed" },
    },
    usps_assignment: {
      semantics: "governed USPS Area/District five-digit assignment membership; address-level deliverability is not asserted",
      governed_dependency_present: denominator !== null,
      assignment_members: denominator ? { count: denominator.count, member_set_sha256: denominator.member_set_sha256 } : null,
      registry_listed_members: listed,
      registry_not_listed_members: notListed,
      registry_unverified_members: unverified,
      status_conservation: { classified_count: uspsStatusTotal, total_count: registry.count, status: "passed" },
      exact_member_set_reconciliation: denominator ? true : null,
      complete_current_assignment_denominator_verified: cohort.complete_current_usps_assignment_denominator_verified,
      address_level_deliverability_asserted: false,
    },
    zip4_policy: {
      applicability: cohort.split_postal_field_contract.applicability,
      status: cohort.split_postal_field_contract.status,
      invalid_counts: cohort.split_postal_field_contract.invalid_counts,
      stored_separately_from_zip5: cohort.postal_field_policy.zip4_joined_to_zip5 === false,
      geometric: false,
    },
    claim_boundary: {
      valid_usps_zip_denominator_complete: report.claim_boundary.valid_usps_zip_denominator_complete,
      complete_all_businesses: null,
      all_business_completion_percentage: null,
      active_business_completion_percentage: null,
      reason: report.claim_boundary.reason,
    },
  };
  check(!containsArray(summary), "National ZIP coverage summary must not contain member arrays or samples.");
  return summary;
}

export async function buildCurrentNationalZipCoverageSummary({ root = APP_ROOT, cohort, releaseId, createdAt, projectionMode = "immutable-release", auditReader = auditZipDenominators } = {}) {
  check(cohort?.cohort_id && cohort?.pointer, "A governed ZIP audit cohort is required.");
  const report = await auditReader({ appRoot: root, cohorts: [{ ...cohort, required: true }], includeRows: false, includeZipLists: false });
  return buildNationalZipCoverageSummary(report, { cohortId: cohort.cohort_id, releaseId, createdAt, projectionMode });
}

export async function publishNationalZipCoverageSummary({
  root = APP_ROOT,
  cohort,
  releaseId = `national-zip-coverage-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
  createdAt = new Date().toISOString(),
  auditReader = auditZipDenominators,
} = {}) {
  root = await realpath(path.resolve(root));
  check(/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(releaseId), "Invalid ZIP coverage summary release ID.");
  const summary = await buildCurrentNationalZipCoverageSummary({ root, cohort, releaseId, createdAt, auditReader });
  const directory = path.join(root, "data", DATASET_ID, "releases", releaseId);
  check(contained(root, directory));
  const base = path.dirname(directory);
  await mkdir(base, { recursive: true });
  check(await realpath(base) === base && contained(root, base), "ZIP coverage summary release root uses an escaping symlink.");
  await mkdir(directory);
  check(await realpath(directory) === directory, "ZIP coverage summary release directory is not canonical.");
  const bytes = Buffer.from(stable(summary));
  const artifact = { path: "zip-coverage-summary.json", bytes: bytes.length, sha256: hash(bytes), record_count: 1,
    artifact_type: "national-zip-coverage-summary-json", distribution_policy: "local-review-only" };
  await writeFile(path.join(directory, artifact.path), bytes, { flag: "wx" });
  const manifest = { schema_version: NATIONAL_ZIP_COVERAGE_SUMMARY_SCHEMA, dataset_id: DATASET_ID, release_id: releaseId,
    status: "published-local-derived-report", created_at: createdAt, network_requests: 0, production_pointers_changed: false,
    artifacts: [artifact], evidence: summary.bindings };
  await writeFile(path.join(directory, "manifest.json"), stable(manifest), { flag: "wx" });
  return { directory, manifest, summary };
}

export async function verifyNationalZipCoverageSummary(manifestPath, { root = APP_ROOT, cohort, auditReader = auditZipDenominators } = {}) {
  root = await realpath(path.resolve(root));
  const resolvedManifest = await realpath(path.resolve(manifestPath));
  check(contained(root, resolvedManifest), "ZIP coverage summary manifest escapes the governed root.");
  const manifest = JSON.parse(await readFile(resolvedManifest, "utf8"));
  check(manifest.schema_version === NATIONAL_ZIP_COVERAGE_SUMMARY_SCHEMA && manifest.dataset_id === DATASET_ID
    && manifest.status === "published-local-derived-report" && manifest.network_requests === 0
    && manifest.production_pointers_changed === false && manifest.artifacts?.length === 1,
  "ZIP coverage summary manifest is invalid.");
  const expectedDirectory = path.join(root, "data", DATASET_ID, "releases", manifest.release_id);
  check(path.dirname(resolvedManifest) === expectedDirectory && path.basename(resolvedManifest) === "manifest.json"
    && isIso(manifest.created_at), "ZIP coverage summary release path, ID, or created_at is not canonical.");
  const artifact = manifest.artifacts[0];
  check(artifact.path === "zip-coverage-summary.json" && artifact.record_count === 1
    && artifact.artifact_type === "national-zip-coverage-summary-json" && artifact.distribution_policy === "local-review-only",
  "ZIP coverage summary artifact declaration is invalid.");
  const artifactPath = await realpath(path.join(path.dirname(resolvedManifest), artifact.path));
  check(artifactPath === path.join(path.dirname(resolvedManifest), artifact.path)
    && contained(path.dirname(resolvedManifest), artifactPath), "ZIP coverage summary artifact escapes its release or uses a symlink.");
  const bytes = await readFile(artifactPath);
  if (bytes.length !== artifact.bytes || hash(bytes) !== artifact.sha256) throw failure("ZIP_COVERAGE_SEMANTIC_TAMPER", "ZIP coverage summary artifact bytes or digest drifted.");
  let summary; try { summary = JSON.parse(bytes); } catch (error) { throw failure("ZIP_COVERAGE_SEMANTIC_TAMPER", `ZIP coverage summary JSON is invalid: ${error.message}`); }
  if (summary.schema_version !== NATIONAL_ZIP_COVERAGE_SUMMARY_SCHEMA || summary.dataset_id !== DATASET_ID
    || summary.release_id !== manifest.release_id || summary.created_at !== manifest.created_at
    || summary.projection_mode !== "immutable-release" || containsArray(summary)
    || stable(manifest.evidence) !== stable(summary.bindings)) {
    throw failure("ZIP_COVERAGE_SEMANTIC_TAMPER", "ZIP coverage summary report and manifest semantics differ.");
  }
  let expected;
  try {
    expected = await buildCurrentNationalZipCoverageSummary({ root, cohort, releaseId: manifest.release_id,
      createdAt: manifest.created_at, auditReader });
  } catch (error) {
    throw failure("ZIP_COVERAGE_EVIDENCE_REBUILD_REQUIRED", `Current governed ZIP evidence cannot reproduce the summary: ${error.message}`);
  }
  if (!sameShape(summary, expected)) throw failure("ZIP_COVERAGE_SEMANTIC_TAMPER", "ZIP coverage summary does not match the exact schema.");
  if (stable(summary.bindings) !== stable(expected.bindings)) {
    throw failure("ZIP_COVERAGE_EVIDENCE_REBUILD_REQUIRED", "ZIP coverage summary no longer matches current governed evidence.");
  }
  if (stable(summary) !== stable(expected)) {
    throw failure("ZIP_COVERAGE_SEMANTIC_TAMPER", "ZIP coverage summary semantics differ while the governed evidence bindings are unchanged.");
  }
  return { status: "verified", release_id: manifest.release_id, artifact_sha256: artifact.sha256, summary };
}
