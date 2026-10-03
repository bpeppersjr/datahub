import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { datasetAvailability, verifyNationalGoalCompletionMatrix } from "./national-goal-completion-matrix.mjs";
import { validateIndustryConfig } from './industry-segments.mjs';
import { validateNationalReportingCatalog } from './national-reporting-catalog.mjs';
import { createNationalReportingTenCatalog, TEN_VERSION } from './national-reporting-ten-catalog.mjs';
import { mnSelectionReadJson } from './mn-construction-retained-selection.mjs';
import {readRetainedIrsStateAdjacentEvidence} from './retained-irs-state-adjacent-evidence.mjs';

const RELEASE_ID = /^national-goal-completion-\d{14}-[a-f0-9]{8}$/;
const CATEGORY = /^[a-z][a-z0-9-]{1,79}$/;
const STATE = /^[A-Z]{2}$/;

function statusCounts(datasets, field, property) {
  const counts = new Map();
  for (const dataset of datasets) {
    const status = dataset?.[field]?.[property];
    if (typeof status === "string" && status.length > 0) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

function unavailable(status) {
  return { available: false, status, release_id: null, all_business_completion_percent: null, jurisdictions: [], category_summaries: [], selected: null, scope_comparison: scopeUnavailable() };
}

function scopeUnavailable(version = null) {
  return { available: false, status: 'scope-comparison-unavailable', denominator_version: version, configuration: null, catalog: null, industries: null };
}

export async function configuredIndustryScopeComparison(report, { root = APP_ROOT } = {}) {
  const version = report?.denominator?.version ?? null;
  try {
    const configPath = path.join(root, 'config/industry-segments.json'), catalogPath = path.join(root, 'config/national-reporting-sources.json');
    const configMeter = {}, catalogMeter = {};
    const config = await mnSelectionReadJson(configPath, 256000, undefined, configMeter);
    validateIndustryConfig(config);
    const predecessor = validateNationalReportingCatalog(await mnSelectionReadJson(catalogPath, 32000, undefined, catalogMeter));
    const catalog = version?.startsWith(`${TEN_VERSION}+`) ? createNationalReportingTenCatalog(predecessor) : predecessor;
    if (!version?.startsWith(`${catalog.denominatorVersion}+`) || report.evidence?.catalog_sha256 !== catalogMeter.sha256) throw Error('Scope identity mismatch.');
    const groups = new Set(catalog.sources.map(source => source.group));
    const expectedCategories = ['general-business', ...groups].sort();
    if (!report.jurisdictions?.length || report.jurisdictions.some(row => JSON.stringify(row.categories.map(cell => cell.category_id).sort()) !== JSON.stringify(expectedCategories))) throw Error('Scope category mismatch.');
    const industries = Object.entries(config.industries).filter(([id]) => !groups.has(id)).map(([id, ids]) => ({
      id, sources: [...new Set(ids)].sort().map(sourceId => {
        const source = config.sources[sourceId];
        return { id: sourceId, scope: source.scope, publisher_states: source.states === 'all' ? 'all' : [...source.states], manual_selection_required: source.manual_selection_required === true };
      }),
    })).sort((a, b) => a.id.localeCompare(b.id));
    const configAfter = {}, catalogAfter = {};
    await mnSelectionReadJson(configPath, 256000, undefined, configAfter);
    await mnSelectionReadJson(catalogPath, 32000, undefined, catalogAfter);
    if (configAfter.sha256 !== configMeter.sha256 || catalogAfter.sha256 !== catalogMeter.sha256) throw Error('Scope inputs changed.');
    return { available: true, status: 'validated-configuration-comparison', denominator_version: version,
      configuration: { path: 'config/industry-segments.json', version: config.version, sha256: configMeter.sha256 },
      catalog: { path: 'config/national-reporting-sources.json', schema_version: catalog.schemaVersion, denominator_version: catalog.denominatorVersion, predecessor_sha256: catalogMeter.sha256 },
      industries };
  } catch { return scopeUnavailable(version); }
}

export async function readNewestNationalGoalCompletionMatrix({ root = APP_ROOT, verifier = verifyNationalGoalCompletionMatrix, verifierOptions = {} } = {}) {
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
  const verified = await verifier(manifestPath, { root: canonicalRoot, ...verifierOptions });
  const report=verified.schema_version==='national-goal-completion-matrix@1.0.0'?{...verified.report,jurisdictions:verified.report.jurisdictions.map(jurisdiction=>({...jurisdiction,categories:jurisdiction.categories.map(category=>({...category,dataset_availability:datasetAvailability(category.datasets)}))}))}:verified.report;
  return { report, manifestPath };
}

export async function nationalGoalCompletionView({ root = APP_ROOT, state = null, category = "general-business", verifier = verifyNationalGoalCompletionMatrix, verifierOptions = {}, adjacentReader = readRetainedIrsStateAdjacentEvidence, signal } = {}) {
  if (state !== null && !STATE.test(state)) throw Object.assign(new Error("Invalid state selection."), { statusCode: 400 });
  if (!CATEGORY.test(category)) throw Object.assign(new Error("Invalid category selection."), { statusCode: 400 });
  let loaded;
  try { loaded = await readNewestNationalGoalCompletionMatrix({ root, verifier, verifierOptions }); } catch { return unavailable("newest-release-verification-failed"); }
  if (!loaded) return unavailable("no-immutable-release");
  const { report } = loaded;
  const categoryIds = report.jurisdictions[0]?.categories.map((row) => row.category_id) ?? [];
  if (!categoryIds.includes(category)) throw Object.assign(new Error("Category is not in the matrix denominator."), { statusCode: 400 });
  const jurisdictions = report.jurisdictions.map((jurisdiction) => {
    const cell = jurisdiction.categories.find((row) => row.category_id === category);
    const datasets = cell.datasets ?? [];
    return { code: jurisdiction.code, name: jurisdiction.name, available: cell.dataset_availability.available, denominator: cell.dataset_availability.denominator,
      measured: cell.dataset_availability.measured, unmeasured: cell.dataset_availability.unmeasured, measurement_status: cell.dataset_availability.measurement_status,
      percent: cell.dataset_availability.percent,
      temporal_status_counts: statusCounts(datasets, "temporal_status", "status"),
      authorization_state_counts: statusCounts(datasets, "authorization", "state"),
      broad_layer_gap: jurisdiction.categories.find((row) => row.category_id === "general-business")?.datasets[0]?.availability_status !== "available" };
  });
  const selectedJurisdiction = state ? report.jurisdictions.find((row) => row.code === state) : null;
  if (state && !selectedJurisdiction) throw Object.assign(new Error("State is not in the 50-state and D.C. matrix."), { statusCode: 400 });
  const selected = selectedJurisdiction ? selectedJurisdiction.categories.find((row) => row.category_id === category) : null;
  const categorySummaries = categoryIds.map((categoryId) => {
    const cells = report.jurisdictions.map((jurisdiction) => jurisdiction.categories.find((row) => row.category_id === categoryId));
    const national = cells.reduce((totals, cell) => ({
      available: totals.available + cell.dataset_availability.available,
      measured: totals.measured + cell.dataset_availability.measured,
      unmeasured: totals.unmeasured + cell.dataset_availability.unmeasured,
      expected: totals.expected + cell.dataset_availability.denominator,
    }), { available: 0, measured: 0, unmeasured: 0, expected: 0 });
    const stateCell = selectedJurisdiction?.categories.find((row) => row.category_id === categoryId) ?? null;
    return { category_id: categoryId, national, selected_state: stateCell ? {
      code: selectedJurisdiction.code,
      name: selectedJurisdiction.name,
      available: stateCell.dataset_availability.available,
      measured: stateCell.dataset_availability.measured,
      unmeasured: stateCell.dataset_availability.unmeasured,
      expected: stateCell.dataset_availability.denominator,
      measurement_status: stateCell.dataset_availability.measurement_status,
    } : null };
  });
  let adjacentEvidence=null;
  if(selectedJurisdiction&&category==='general-business')adjacentEvidence=await adjacentReader({root,state:selectedJurisdiction.code,signal});
  return {
    available: true, status: "verified-immutable-release", release_id: report.release_id, created_at: report.created_at,
    denominator: report.denominator, category, categories: categoryIds,
    all_business_completion_percent: null,
    jurisdictions, category_summaries: categorySummaries,
    broad_layer_gaps: jurisdictions.filter((row) => row.broad_layer_gap).length,
    selected: selectedJurisdiction ? { code: selectedJurisdiction.code, name: selectedJurisdiction.name, category: selected, adjacent_evidence: adjacentEvidence ? [adjacentEvidence] : [] } : null,
    limitations: report.limitations,
    scope_comparison: await configuredIndustryScopeComparison(report, { root }),
  };
}
