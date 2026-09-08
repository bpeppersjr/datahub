import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { validateIndustryConfig } from "./industry-segments.mjs";
import { loadStateBusinessSourceAssessmentCatalog } from "./state-business-source-assessment.mjs";
import { loadMnConstructionReportingEnrollment, projectMnConstructionStateEvidence } from "./mn-construction-reporting-enrollment.mjs";
import { loadPaChildcareReportingEnrollment, projectPaChildcareStateEvidence } from "./pa-childcare-reporting-enrollment.mjs";
import { loadCtChildcareReportingEnrollment, projectCtChildcareStateEvidence } from "./ct-childcare-reporting-enrollment.mjs";
import { loadMdChildcareReportingEnrollment, projectMdChildcareStateEvidence } from "./md-childcare-reporting-enrollment.mjs";
import { loadVtChildcareReportingEnrollment, projectVtChildcarePublisherEvidence } from "./vt-childcare-reporting-enrollment.mjs";

const PROFILE_IDS = Object.freeze({
  "national-snap-retailers": "usda-snap-current-retailers",
  "national-nppes-organizations": "cms-nppes-monthly-v2",
  "national-fdic-bankfind": "fdic-bankfind-current-structure",
  "national-ncua-quarterly": "ncua-final-quarterly-call-report",
  "national-fmcsa-census": "fmcsa-company-census-active-us-principal-office",
  "state-ny-retail-food": "new-york-agriculture-markets-retail-food-stores",
  "state-ca-abc": "california-abc-daily-active-licenses",
  "state-wa-contractors": null,
  // App enrollment is not evidence of national reporting coverage.
  "state-mn-contractor-registrations": null,
  "state-mn-residential-contractors": null,
  "state-tx-sales-tax": "texas-comptroller-active-sales-tax-permits",
  "state-dc-basic-licenses": "dc-dlcp-active-basic-business-licenses",
  "state-de-business-licenses": "delaware-division-of-revenue-current-business-licenses",
  "state-ak-business-licenses": "alaska-dcced-active-business-licenses",
  "state-ma-childcare": "ma-licensed-center-based-childcare",
  "state-nj-childcare": "nj-licensed-childcare-centers",
  "state-tn-childcare": "tn-dhs-active-childcare-centers",
  // Native collection is enrolled, but no national reporting adapter/release
  // exists yet. Configuration or local downloads cannot manufacture coverage.
  "state-oh-childcare": null,
  "state-pa-childcare-centers": null,
  "state-ct-childcare-centers": null,
  "state-md-childcare-centers": null,
  "state-vt-childcare-centers": null,
  "national-irs-eo-bmf": null,
});
// The coverage view retains this historical count-field name for both evidence
// classes. These sources are reporting-only, never identity-matching profiles.
const REPORTING_ONLY_SOURCES = new Set(["state-ma-childcare", "state-nj-childcare", "state-tn-childcare"]);
const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const CANONICAL = new Set(STATES);
const digest = (value) => createHash("sha256").update(value).digest("hex");

function inside(root, value) {
  const base = path.resolve(root), file = path.resolve(base, value), relative = path.relative(base, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("State access path escapes datahub.");
  return file;
}

async function rejectLinks(root, target, { allowMissing = false } = {}) {
  const base = path.resolve(root), file = inside(base, target), relative = path.relative(base, file);
  let cursor = base;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink() || path.resolve(await realpath(cursor)) !== path.resolve(cursor)) throw new Error(`Linked paths are not allowed: ${path.relative(base, cursor)}`);
    } catch (error) {
      if (error.code === "ENOENT" && allowMissing) break;
      throw error;
    }
  }
  return file;
}

async function readPinnedJson(root, value) {
  const file = await rejectLinks(root, value), bytes = await readFile(file);
  return { file, bytes, value: JSON.parse(bytes), sha256: digest(bytes) };
}

async function governedStates(root, pointer) {
  const pp = await readPinnedJson(root, pointer);
  const mp = await readPinnedJson(root, inside(root, path.resolve(path.dirname(pp.file), pp.value.manifest)));
  if (mp.value.dataset_id !== "national-business-coverage-views" || mp.value.release_id !== pp.value.release_id || !String(mp.value.status).startsWith("published")) throw new Error("Coverage pointer does not identify a published release.");
  const artifact = mp.value.artifacts?.find((item) => item.artifact_type === "state-coverage-view-jsonl");
  if (!artifact || !Number.isSafeInteger(artifact.bytes) || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error("Coverage release has no governed state artifact.");
  const artifactPath = inside(root, path.resolve(path.dirname(mp.file), artifact.path));
  await rejectLinks(root, artifactPath);
  const bytes = await readFile(artifactPath);
  if (bytes.length !== artifact.bytes || digest(bytes) !== artifact.sha256) throw new Error("State coverage artifact integrity failed.");
  const rows = bytes.toString("utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.is_50_states_or_dc === true && CANONICAL.has(row.postal_abbreviation));
  if (rows.length !== 51 || new Set(rows.map((row) => row.postal_abbreviation)).size !== 51) throw new Error("Coverage artifact must contain the unique 50 states plus DC.");
  return { rows: new Map(rows.map((row) => [row.postal_abbreviation, row])), releaseId: mp.value.release_id, manifestSha256: mp.sha256, artifactPath: path.relative(root, artifactPath).replaceAll("\\", "/"), artifactSha256: artifact.sha256, artifactBytes: artifact.bytes };
}

function validateWorkstreams(config) {
  if (config?.schema_version !== 1 || config.max_total_agent_concurrency !== 4 || config.workstreams?.length !== 51 || config.jurisdictions?.length !== 51) throw new Error("State access workstream configuration is invalid.");
  const jurisdictions = new Set(config.jurisdictions), states = new Set(config.workstreams.map((item) => item.state));
  if (jurisdictions.size !== 51 || states.size !== 51 || STATES.some((state) => !jurisdictions.has(state) || !states.has(state)) || new Set(config.workstreams.map((item) => item.id)).size !== 51 || new Set(config.workstreams.map((item) => item.peer_task_name)).size !== 51) throw new Error("State access jurisdictions and workstreams must be unique, corresponding, and complete.");
  return config;
}

async function missingPrerequisites(root, prerequisites) {
  const missing = [];
  for (const item of prerequisites) try { await rejectLinks(root, item); await access(inside(root, item)); } catch { missing.push(item); }
  return missing;
}

export async function buildStateAccessLedger({ root = APP_ROOT, coveragePointer = "data/business-coverage-views/current.json", industryConfigPath = "config/industry-segments.json", workstreamConfigPath = "config/state-access-workstreams.json", assessmentLoader = loadStateBusinessSourceAssessmentCatalog, activeAssignments = [], observedTotalActiveAgents = null } = {}) {
  const industryRead = await readPinnedJson(root, industryConfigPath); validateIndustryConfig(industryRead.value, industryRead.file);
  const workstreamRead = await readPinnedJson(root, workstreamConfigPath), workstreams = validateWorkstreams(workstreamRead.value);
  const [coverage, assessments, localCredentials, localFacilities, localCtCandidates, localMdCandidates, localVtCandidates] = await Promise.all([governedStates(root, coveragePointer), assessmentLoader(), loadMnConstructionReportingEnrollment({root}), loadPaChildcareReportingEnrollment({root}), loadCtChildcareReportingEnrollment({root}), loadMdChildcareReportingEnrollment({root}), loadVtChildcareReportingEnrollment({root})]);
  const assessmentStates = assessments.states ?? [];
  if (!Array.isArray(assessmentStates) || assessmentStates.some((item) => !CANONICAL.has(item.state_abbreviation)) || new Set(assessmentStates.map((item) => item.state_abbreviation)).size !== assessmentStates.length) throw new Error("Assessment states must contain unique canonical state codes.");
  for (const sourceKeys of Object.values(industryRead.value.industries)) for (const key of sourceKeys) if (!Object.hasOwn(PROFILE_IDS, key)) throw new Error(`Industry source ${key} has no explicit coverage profile mapping.`);
  if (!Array.isArray(activeAssignments) || activeAssignments.some((state) => !CANONICAL.has(state)) || new Set(activeAssignments).size !== activeAssignments.length || activeAssignments.length > workstreams.max_total_agent_concurrency) throw new Error("activeAssignments must contain unique canonical state codes within total concurrency.");
  if (observedTotalActiveAgents !== null && (!Number.isInteger(observedTotalActiveAgents) || observedTotalActiveAgents < activeAssignments.length || observedTotalActiveAgents > workstreams.max_total_agent_concurrency)) throw new Error("observedTotalActiveAgents is invalid.");
  const assessmentByState = new Map(assessmentStates.map((item) => [item.state_abbreviation, item])), active = new Set(activeAssignments), jurisdictions = [];
  for (const state of workstreams.jurisdictions) {
    const row = coverage.rows.get(state), assignment = workstreams.workstreams.find((item) => item.state === state), assessment = assessmentByState.get(state), industries = [];
    for (const [industryId, sourceKeys] of Object.entries(industryRead.value.industries)) {
      const evidence = [], appSources = []; let direct = false, national = false, unmeasured = false;
      for (const key of sourceKeys) {
        const source = industryRead.value.sources[key], profileId = PROFILE_IDS[key], count = profileId === null ? null : row.registry_evidence?.source_profile_counts_by_reported_address_state?.[profileId];
        const applies = source.scope === "national" || source.states.includes(state), positive = Number.isSafeInteger(count) && count > 0;
        if (!applies) continue;
        const reportingOnly = REPORTING_ONLY_SOURCES.has(key);
        if (reportingOnly && count !== undefined && count !== null && (!Number.isSafeInteger(count) || count < 0)) throw new Error("Published childcare reporting count must be a non-negative integer.");
        const missing = await missingPrerequisites(root, source.prerequisites ?? []);
        appSources.push({ sourceId: key, acquisitionExecutor: "cotive-app", prerequisiteStatus: missing.length ? "MISSING" : "PRESENT", missingPrerequisites: missing, limitations: source.coverage_notes ?? [] });
        if (source.scope === "state" && positive) { direct = true; evidence.push({ type: reportingOnly ? "published-direct-state-reporting-count" : "published-direct-state-profile-count", sourceId: profileId, recordCount: count, coverageReleaseId: coverage.releaseId, artifactPath: coverage.artifactPath }); }
        else if (source.scope === "national" && positive) { national = true; evidence.push({ type: "published-state-profile-count", sourceId: profileId, recordCount: count, coverageReleaseId: coverage.releaseId, artifactPath: coverage.artifactPath }); }
        else if (profileId === null || reportingOnly && (count === undefined || count === null)) unmeasured = true;
      }
      const accessEvidenceStatus = direct ? "direct-state-publisher" : national ? "national-dataset-state-evidence" : unmeasured ? "unsupported-evidence-not-measured" : "unsupported-missing";
      if (assessment?.decision === "hold") evidence.push({ type: "separate-state-publisher-assessment-hold", assessmentId: assessment.assessment_id, assessmentCoverageReleaseId: assessment.coverage_release_id ?? assessments.coverage_release_id ?? null, observedAt: assessment.observed_at ?? assessments.observed_at ?? null, reason: assessment.strongest_bounded_next_action });
      const prerequisiteReady = appSources.length > 0 && appSources.every((item) => item.prerequisiteStatus === "PRESENT");
      industries.push({ industry: industryId, accessEvidenceStatus, evidence, appHandoff: { acquisitionExecutor: "cotive-app", status: (direct || national) && prerequisiteReady ? "APP_PREFLIGHT_REQUIRED" : !prerequisiteReady ? "BLOCKED_PREREQUISITE" : unmeasured ? "NOT_READY_EVIDENCE_UNMEASURED" : "NOT_READY_NO_PUBLISHED_STATE_EVIDENCE", configuredSources: appSources, prerequisiteContentsValidated: false, jobSubmitted: false, recurringSchedulerImplemented: null, schedulerObservation: "not-inspected-by-ledger" }, limitations: ["Published counts are source-specific profiles or explicitly identified reporting-only records, not deduplicated businesses or proof of complete industry coverage."] });
    }
    jurisdictions.push({ state, jurisdictionKind: state === "DC" ? "district" : "state", workstream: { ...assignment, status: active.has(state) ? "IN_PROGRESS" : "UNASSIGNED", assignee: active.has(state) ? `peer:${assignment.peer_task_name}` : null, assignmentEvidence: active.has(state) ? "operator-reported" : null }, industries });
    // Local credential evidence does not change published national status,
    // dispatch readiness, matching profiles or physical-site totals.
    const construction=industries.find(cell=>cell.industry==='construction');
    if(construction)construction.localCredentialEvidence=projectMnConstructionStateEvidence(localCredentials,state);
    const childcare=industries.find(cell=>cell.industry==='childcare');
    if(childcare)childcare.localFacilityEvidence=projectPaChildcareStateEvidence(localFacilities,state);
    if(childcare)childcare.localSourceCandidateEvidence=state==='MD'
      ?projectMdChildcareStateEvidence(localMdCandidates,state)
      :projectCtChildcareStateEvidence(localCtCandidates,state);
    // VT reports publisher scope, not address state. Do not turn its unknown
    // address-state bucket into Vermont address coverage or published totals.
    if(childcare&&state==='VT')childcare.localPublisherCohortEvidence=projectVtChildcarePublisherEvidence(localVtCandidates,state);
  }
  const counts = {}; for (const jurisdiction of jurisdictions) for (const item of jurisdiction.industries) counts[item.accessEvidenceStatus] = (counts[item.accessEvidenceStatus] ?? 0) + 1;
  const assessmentCoverageReleaseId = assessments.coverage_release_id ?? null;
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), scope: { configuredIndustryBucketsOnly: true, industryBucketCount: Object.keys(industryRead.value.industries).length }, evidence: { coverageReleaseId: coverage.releaseId, coverageManifestSha256: coverage.manifestSha256, stateArtifactPath: coverage.artifactPath, stateArtifactSha256: coverage.artifactSha256, stateArtifactBytes: coverage.artifactBytes, assessmentCatalogId: assessments.assessment_catalog_id, assessmentCoverageReleaseId, assessmentObservedAt: assessments.observed_at ?? null, assessmentCoverageMatchesCurrent: assessmentCoverageReleaseId === coverage.releaseId, industryConfigSha256: industryRead.sha256, workstreamConfigSha256: workstreamRead.sha256 }, dispatch: { maxTotalAgentConcurrency: 4, operatorReportedActiveStateAssignments: activeAssignments.length, observedTotalActiveAgents, availableDispatchSlots: observedTotalActiveAgents === null ? null : Math.max(0, 4 - observedTotalActiveAgents) }, summary: { jurisdictions: 51, states: 50, districts: 1, industryCells: jurisdictions.reduce((sum, item) => sum + item.industries.length, 0), accessEvidenceStatusCounts: counts }, jurisdictions };
}

export async function writeStateAccessReport(options = {}) {
  const root = options.root ?? APP_ROOT, ledger = await buildStateAccessLedger(options), directory = inside(root, "data/state-access/reports");
  await rejectLinks(root, directory, { allowMissing: true }); await mkdir(directory, { recursive: true }); await rejectLinks(root, directory);
  const reportPath = path.join(directory, `${ledger.generatedAt.replace(/\D/g, "").slice(0, 14)}-${randomUUID()}.json`);
  await writeFile(reportPath, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx" });
  return { reportPath, ledger };
}
