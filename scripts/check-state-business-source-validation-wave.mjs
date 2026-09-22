import path from "node:path";
import { APP_ROOT } from "../runner/paths.mjs";
import { ASSESSMENT_STATES, loadStateBusinessSourceValidationAssessment } from "../runner/state-business-source-validation-wave.mjs";

for (const state of ASSESSMENT_STATES) {
  const file = path.join(APP_ROOT, "config", `state-business-source-${state.toLowerCase()}-2026-09-22.json`);
  await loadStateBusinessSourceValidationAssessment(file, state);
}
console.log(`Official-source validation wave: PASS (${ASSESSMENT_STATES.join(", ")}; reporting only; 0 acquisitions authorized)`);
