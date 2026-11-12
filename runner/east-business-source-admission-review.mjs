import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { validateScMnAlBusinessSourceReassessment } from "./sc-mn-al-business-source-reassessment.mjs";
import { validateGeorgiaNewMexicoMontanaBusinessSourceReassessment } from "./georgia-new-mexico-montana-business-source-reassessment.mjs";
import { validateWvNdNcBusinessSourceReassessment } from "./wv-nd-nc-business-source-reassessment.mjs";

export const EAST_ADMISSION_REVIEW_STATES = Object.freeze(["AL", "GA", "NC", "SC"]);
const CONFIG_KEYS = ["schema_version", "wave_id", "assembled_at", "scope", "inputs"];
const INPUT_KEYS = ["path", "sha256", "assessment_id"];
const ZERO_ACTION_CONTROLS = Object.freeze({
  record_requests: 0,
  datasets_acquired: 0,
  accounts_created: 0,
  terms_accepted: 0,
  fees_paid: 0,
  publisher_contacts: 0,
  portal_automation: false,
  production_changes: 0,
});

const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const check = (condition, reason) => {
  if (!condition) throw new Error(`East business-source admission review rejected: ${reason}`);
};

export function validateEastBusinessSourceAdmissionReviewConfig(value) {
  check(plain(value) && JSON.stringify(Object.keys(value)) === JSON.stringify(CONFIG_KEYS), "config shape");
  check(value.schema_version === "state-business-source-admission-review-wave-config@1.0.0", "config schema");
  check(value.wave_id === "east-business-source-admission-review-2026-11-12", "wave identity");
  check(value.assembled_at === "2026-11-12T20:00:00.000Z", "assembly timestamp");
  check(JSON.stringify(value.scope) === JSON.stringify(EAST_ADMISSION_REVIEW_STATES), "exact ordered scope");
  check(plain(value.inputs) && JSON.stringify(Object.keys(value.inputs)) === JSON.stringify(EAST_ADMISSION_REVIEW_STATES), "input state conservation");
  for (const state of EAST_ADMISSION_REVIEW_STATES) {
    const input = value.inputs[state];
    check(plain(input) && JSON.stringify(Object.keys(input)) === JSON.stringify(INPUT_KEYS), `${state} input shape`);
    check(input.path === `config/state-business-source-assessments/${state.toLowerCase()}-2026-10-03.json`, `${state} input path`);
    check(/^[a-f0-9]{64}$/.test(input.sha256), `${state} input digest`);
    check(input.assessment_id === `${state.toLowerCase()}-business-source-reassessment-2026-10-03`, `${state} assessment identity`);
  }
  return structuredClone(value);
}

function validateAssessment(value, state) {
  if (state === "GA") return validateGeorgiaNewMexicoMontanaBusinessSourceReassessment(value);
  if (state === "NC") return validateWvNdNcBusinessSourceReassessment(value, state);
  return validateScMnAlBusinessSourceReassessment(value, state);
}

function assertFalseAuthority(value, state) {
  const flags = Object.values(value.authority ?? {});
  check(flags.length > 0 && flags.every(flag => flag === false), `${state} authority must remain false`);
}

export async function loadEastBusinessSourceAdmissionReview({ root = APP_ROOT } = {}) {
  const configPath = path.join(root, "config/state-business-source-assessment-waves/east-admission-review-2026-11-12.json");
  const config = validateEastBusinessSourceAdmissionReviewConfig(JSON.parse(await readFile(configPath, "utf8")));
  const states = [];
  for (const state of EAST_ADMISSION_REVIEW_STATES) {
    const input = config.inputs[state];
    const bytes = await readFile(path.join(root, input.path));
    check(createHash("sha256").update(bytes).digest("hex") === input.sha256, `${state} input bytes changed`);
    const assessment = validateAssessment(JSON.parse(bytes), state);
    check(assessment.state.abbreviation === state && assessment.assessment_id === input.assessment_id, `${state} substitution`);
    check(assessment.decision === "hold" && assessment.connector_candidate === false, `${state} decision boundary`);
    assertFalseAuthority(assessment, state);
    states.push({
      state,
      assessment_id: assessment.assessment_id,
      observed_at: assessment.observed_at,
      input_sha256: input.sha256,
      decision: assessment.decision,
      access_classification: assessment.access.classification,
      unresolved_gates: [...assessment.unresolved_gates],
      strongest_next_action: assessment.strongest_next_action,
      assessment,
    });
  }
  return {
    schema_version: "state-business-source-admission-review-wave@1.0.0",
    wave_id: config.wave_id,
    assembled_at: config.assembled_at,
    scope: [...EAST_ADMISSION_REVIEW_STATES],
    decisions: { hold: 4, connector_candidate: 0 },
    controls: { ...ZERO_ACTION_CONTROLS },
    claims: {
      observations_refreshed_by_wave: false,
      acquisition_authorized: false,
      network_execution_authorized: false,
      source_contact_authorized: false,
      payment_authorized: false,
      production_pointer_change_authorized: false,
      national_admission_authorized: false,
      broad_business_coverage_established: false,
    },
    states,
  };
}
