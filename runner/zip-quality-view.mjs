import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { auditZipDenominators } from "./zip-denominator-audit.mjs";

const DEFAULT_ENROLLMENT_PATH = path.join(APP_ROOT, "config", "zip-quality-view-enrollment.json");

function assertEnrollment(enrollment) {
  for (const key of ["cohort_id", "pointer_path", "pointer_sha256", "manifest_sha256", "zip_artifact_sha256", "release_id"]) {
    if (!String(enrollment?.[key] ?? "").trim()) throw new Error(`ZIP-quality enrollment is missing ${key}.`);
  }
}

function publicUspsEvidence(row) {
  return {
    operational_status: null,
    evidence_status: "unverified",
    reason: row.usps_operational_evidence.reason,
    source_release_id: row.usps_operational_evidence.source_release_id,
    source_month: row.usps_operational_evidence.source_month,
    deliverability_status: "not-asserted",
  };
}

export function createZipQualityView({ appRoot = APP_ROOT, enrollment: suppliedEnrollment } = {}) {
  let cached;
  async function load() {
    if (cached) return cached;
    cached = (async () => {
      const enrollment = suppliedEnrollment ?? JSON.parse(await readFile(DEFAULT_ENROLLMENT_PATH, "utf8"));
      assertEnrollment(enrollment);
      const report = await auditZipDenominators({
        appRoot,
        cohorts: [{ cohort_id: enrollment.cohort_id, pointer: enrollment.pointer_path, required: true }],
        includeRows: true,
        includeZipLists: false,
      });
      const cohort = report.cohorts[0];
      if (cohort.release_id !== enrollment.release_id
        || cohort.pointer_sha256 !== enrollment.pointer_sha256
        || cohort.manifest_sha256 !== enrollment.manifest_sha256
        || cohort.artifact.sha256 !== enrollment.zip_artifact_sha256) {
        throw new Error("ZIP-quality enrolled pointer, manifest, or ZIP artifact hash drifted.");
      }
      const byZip = new Map(cohort.rows.map((row) => [row.zip5, row]));
      return { enrollment, report, cohort, byZip };
    })().catch((error) => { cached = undefined; throw error; });
    return cached;
  }

  return async function zipQualityView({ zip } = {}) {
    if (zip != null && !/^\d{5}$/.test(zip)) {
      const error = new Error("ZIP lookup requires exactly five digits.");
      error.statusCode = 400;
      throw error;
    }
    const { enrollment, report, cohort, byZip } = await load();
    const bindings = {
      audit_id: report.audit_id,
      release_id: cohort.release_id,
      pointer_sha256: enrollment.pointer_sha256,
      manifest_sha256: enrollment.manifest_sha256,
      zip_artifact_sha256: enrollment.zip_artifact_sha256,
    };
    if (zip == null) {
      return {
        schema_version: "1.0.0",
        bindings,
        classification: cohort.source_reported_zip5_quality,
        postal_fields: cohort.postal_field_policy,
        usps_operational_status: null,
        usps_evidence_status: "unverified",
        limitation: report.claim_boundary.reason,
      };
    }
    const row = byZip.get(zip);
    if (!row) {
      return { schema_version: "1.0.0", bindings, zip5: zip, found: false, classification: null };
    }
    return {
      schema_version: "1.0.0",
      bindings,
      zip5: row.zip5,
      found: true,
      classification: row.source_reported_zip5_quality,
      postal_fields: row.artifact_postal_fields,
      split_postal_contract: row.split_postal_contract,
      registry_coverage_status: row.registry_coverage_status,
      governed_zcta_membership: row.governed_zcta_membership,
      positive_source_contributions: row.positive_source_contributions,
      usps_operational_evidence: publicUspsEvidence(row),
      limitations: row.unresolved_proof_gap_codes,
    };
  };
}

export const zipQualityView = createZipQualityView();
