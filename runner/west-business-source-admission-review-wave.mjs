import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { loadArizonaBusinessSourceReassessment } from "./arizona-missouri-indiana-business-source-reassessment.mjs";
import { loadCaIdNhOhBusinessSourceReassessment } from "./ca-id-nh-oh-business-source-reassessment.mjs";
import { loadKyHiNvBusinessSourceReassessment } from "./ky-hi-nv-business-source-reassessment.mjs";
import { loadNewMexicoBusinessSourceReassessment } from "./georgia-new-mexico-montana-business-source-reassessment.mjs";

export const WEST_ADMISSION_REVIEW_SCHEMA = "west-business-source-admission-review-wave@1.0.0";
export const WEST_ADMISSION_REVIEW_STATES = Object.freeze(["AZ", "CA", "NV", "NM"]);
const HASH = /^[a-f0-9]{64}$/;
const fail = (message) => { throw new Error(`Western business-source admission review rejected: ${message}`); };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalValue = (value) => Array.isArray(value)
  ? value.map(canonicalValue)
  : value && Object.getPrototypeOf(value) === Object.prototype
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
    : value;
const canonical = (value) => JSON.stringify(canonicalValue(value));

function zeroActionBoundary(assessment) {
  const controls = assessment.controls ?? {};
  const counts = ["record_requests", "downloads", "datasets_acquired", "accounts_created", "terms_accepted", "fees_paid", "contacts_made", "publisher_contacts", "production_changes"];
  if (counts.some((key) => controls[key] !== undefined && controls[key] !== 0) || controls.portal_automation !== false) fail(`${assessment.state.abbreviation} action boundary drifted`);
  if (assessment.decision !== "hold" || assessment.connector_candidate !== false) fail(`${assessment.state.abbreviation} HOLD boundary drifted`);
}

async function loadAssessments(root) {
  const values = await Promise.all([
    loadArizonaBusinessSourceReassessment(path.join(root, "config/state-business-source-assessments/az-2026-10-03.json")),
    loadCaIdNhOhBusinessSourceReassessment("CA", path.join(root, "config/state-business-source-assessments/ca-2026-10-03.json")),
    loadKyHiNvBusinessSourceReassessment("NV", { root }),
    loadNewMexicoBusinessSourceReassessment(path.join(root, "config/state-business-source-assessments/nm-2026-10-03.json")),
  ]);
  for (const value of values) zeroActionBoundary(value);
  return values;
}

export async function loadWestBusinessSourceAdmissionReviewWave({ root = APP_ROOT } = {}) {
  const contractPath = path.join(root, "config/national-status-contract.json");
  const contractBytes = await readFile(contractPath);
  const contract = JSON.parse(contractBytes);
  if (!contract.release_id || !HASH.test(contract.manifest_sha256 ?? "") || !HASH.test(contract.artifact_sha256?.["gap-ledger.json"] ?? "")) fail("national status contract is incomplete");

  const manifestPath = path.join(root, contract.manifest);
  const manifestBytes = await readFile(manifestPath);
  if (digest(manifestBytes) !== contract.manifest_sha256) fail("national federation manifest hash differs from its contract");
  const manifest = JSON.parse(manifestBytes);
  if (manifest.release_id !== contract.release_id) fail("national federation release identity differs from its contract");

  const gapPath = path.join(path.dirname(manifestPath), "gap-ledger.json");
  const gapBytes = await readFile(gapPath);
  if (digest(gapBytes) !== contract.artifact_sha256["gap-ledger.json"]) fail("national broad-business gap ledger hash differs from its contract");
  const gapLedger = JSON.parse(gapBytes);
  const gaps = new Map((gapLedger.broad_business ?? []).map((row) => [row.state, row]));
  const assessments = await loadAssessments(root);

  const states = assessments.map((assessment) => {
    const state = assessment.state.abbreviation;
    const gap = gaps.get(state);
    if (gap?.status !== "missing-retained-broad-organization-layer" || gap.action_class !== "admission-review" || gap.authority_evidence?.acquisition_authorized !== false) fail(`${state} is not a current zero-authority admission-review gap`);
    const assessmentBytes = Buffer.from(JSON.stringify(assessment));
    return {
      state,
      assessment_id: assessment.assessment_id,
      assessment_observed_at: assessment.observed_at,
      assessment_sha256: digest(assessmentBytes),
      decision: "hold",
      connector_candidate: false,
      current_gap_status: gap.status,
      action_class: gap.action_class,
      unresolved_gates: [...assessment.unresolved_gates],
      strongest_next_action: assessment.strongest_next_action,
      authority: {
        acquisition_authorized: false,
        network_execution_authorized: false,
        source_contact_authorized: false,
        payment_authorized: false,
        production_pointer_change_authorized: false,
        national_admission_authorized: false,
      },
    };
  });
  if (states.map(({ state }) => state).join(",") !== WEST_ADMISSION_REVIEW_STATES.join(",")) fail("state scope or order drifted");

  const body = {
    schema_version: WEST_ADMISSION_REVIEW_SCHEMA,
    assessed_through: "2026-10-03",
    source_federation: {
      release_id: contract.release_id,
      manifest_sha256: contract.manifest_sha256,
      gap_ledger_sha256: contract.artifact_sha256["gap-ledger.json"],
    },
    scope: { states: [...WEST_ADMISSION_REVIEW_STATES], current_gap_count: states.length },
    controls: { network_requests: 0, source_actions: 0, acquisitions: 0, pointer_changes: 0, production_admissions: 0 },
    claims: { broad_business_coverage_added: false, active_business_claim_authorized: false, completeness_claimed: false },
    states,
  };
  return { ...body, wave_id: `west-business-source-admission-review-${digest(Buffer.from(canonical(body))).slice(0, 16)}` };
}

