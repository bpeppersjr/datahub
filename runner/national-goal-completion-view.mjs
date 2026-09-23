import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { datasetAvailability, verifyNationalGoalCompletionMatrix } from "./national-goal-completion-matrix.mjs";

const RELEASE_ID = /^national-goal-completion-\d{14}-[a-f0-9]{8}$/;
const CATEGORY = /^[a-z][a-z0-9-]{1,79}$/;
const STATE = /^[A-Z]{2}$/;

function unavailable(status) {
  return { available: false, status, release_id: null, all_business_completion_percent: null, jurisdictions: [], selected: null };
}

export async function readNewestNationalGoalCompletionMatrix({ root = APP_ROOT } = {}) {
  const canonicalRoot = await realpath(path.resolve(root));
  const releases = path.join(canonicalRoot, "data", "national-goal-completion-matrix", "releases");
  let entries;
  try { entries = await readdir(releases, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const candidates = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && RELEASE_ID.test(entry.name)).map((entry) => entry.name).sort().reverse();
  if (candidates.length > 256) throw new Error("Too many goal-completion matrix releases require operator review.");
  if (!candidates.length) return null;
  const directory = path.join(releases, candidates[0]);
  if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error("Newest goal-completion matrix path is not canonical.");
  const manifestPath = path.join(directory, "manifest.json");
  const verified = await verifyNationalGoalCompletionMatrix(manifestPath);
  const report=verified.schema_version==='national-goal-completion-matrix@1.0.0'?{...verified.report,jurisdictions:verified.report.jurisdictions.map(jurisdiction=>({...jurisdiction,categories:jurisdiction.categories.map(category=>({...category,dataset_availability:datasetAvailability(category.datasets)}))}))}:verified.report;
  return { report, manifestPath };
}

export async function nationalGoalCompletionView({ root = APP_ROOT, state = null, category = "general-business" } = {}) {
  if (state !== null && !STATE.test(state)) throw Object.assign(new Error("Invalid state selection."), { statusCode: 400 });
  if (!CATEGORY.test(category)) throw Object.assign(new Error("Invalid category selection."), { statusCode: 400 });
  let loaded;
  try { loaded = await readNewestNationalGoalCompletionMatrix({ root }); } catch { return unavailable("newest-release-verification-failed"); }
  if (!loaded) return unavailable("no-immutable-release");
  const { report } = loaded;
  const categoryIds = report.jurisdictions[0]?.categories.map((row) => row.category_id) ?? [];
  if (!categoryIds.includes(category)) throw Object.assign(new Error("Category is not in the matrix denominator."), { statusCode: 400 });
  const jurisdictions = report.jurisdictions.map((jurisdiction) => {
    const cell = jurisdiction.categories.find((row) => row.category_id === category);
    return { code: jurisdiction.code, name: jurisdiction.name, available: cell.dataset_availability.available, denominator: cell.dataset_availability.denominator,
      measured: cell.dataset_availability.measured, unmeasured: cell.dataset_availability.unmeasured, measurement_status: cell.dataset_availability.measurement_status,
      percent: cell.dataset_availability.percent, broad_layer_gap: jurisdiction.categories.find((row) => row.category_id === "general-business")?.datasets[0]?.availability_status !== "available" };
  });
  const selectedJurisdiction = state ? report.jurisdictions.find((row) => row.code === state) : null;
  if (state && !selectedJurisdiction) throw Object.assign(new Error("State is not in the 50-state and D.C. matrix."), { statusCode: 400 });
  const selected = selectedJurisdiction ? selectedJurisdiction.categories.find((row) => row.category_id === category) : null;
  return {
    available: true, status: "verified-immutable-release", release_id: report.release_id, created_at: report.created_at,
    denominator: report.denominator, category, categories: categoryIds,
    all_business_completion_percent: null,
    jurisdictions,
    broad_layer_gaps: jurisdictions.filter((row) => row.broad_layer_gap).length,
    selected: selectedJurisdiction ? { code: selectedJurisdiction.code, name: selectedJurisdiction.name, category: selected } : null,
    limitations: report.limitations,
  };
}
