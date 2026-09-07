import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStateCoverageReassessment } from "../runner/state-coverage-reassessment.mjs";

import {
  loadStateBusinessSourceAssessmentCatalog,
  summarizeStateBusinessSourceAssessments,
} from "../runner/state-business-source-assessment.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT_COVERAGE_POINTER_PATH = path.join(ROOT, "data", "business-coverage-views", "current.json");

const catalog = await loadStateBusinessSourceAssessmentCatalog();
const currentCoveragePointer = JSON.parse(await readFile(CURRENT_COVERAGE_POINTER_PATH, "utf8"));
if (currentCoveragePointer.dataset_id !== "national-business-coverage-views" || !/^national-business-coverage-views-/.test(currentCoveragePointer.release_id ?? "")) {
  throw new Error("Current business-coverage pointer is invalid.");
}
const summary = summarizeStateBusinessSourceAssessments(catalog, currentCoveragePointer.release_id);
if (summary.coverage_release_matches_current !== true) {
  const reassessment=await loadStateCoverageReassessment(currentCoveragePointer);
  if(catalog.coverage_release_id!==reassessment.historicalRelease || catalog.states.some(state=>!reassessment.states.some(row=>row.state===state.state_abbreviation)))throw new Error("Assessment coverage reassessment does not cover the historical catalog.");
  console.log(`Coverage reassessment ${reassessment.id}: PASS; historical source reviews remain dated ${catalog.observed_at}, not freshly authorized.`);
}
if (summary.jurisdictions_assessed !== 33 || summary.jurisdictions_revalidated !== 5 || summary.jurisdictions_discovered !== 28 || summary.hold_decisions !== 31 || summary.bounded_connector_decisions !== 2 || summary.autonomous_acquisitions_authorized !== 0 || summary.production_ready_jurisdictions !== 0) {
  throw new Error("State-source assessment decision totals drifted.");
}

console.log(`State-source assessment catalog ${summary.assessment_catalog_id}: PASS`);
console.log(`Assessed: ${summary.jurisdictions_assessed}; revalidated: ${summary.jurisdictions_revalidated}; newly discovered: ${summary.jurisdictions_discovered}; holds: ${summary.hold_decisions}; autonomous acquisitions authorized: ${summary.autonomous_acquisitions_authorized}; production-ready: ${summary.production_ready_jurisdictions}`);
