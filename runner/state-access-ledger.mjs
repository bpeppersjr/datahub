import path from "node:path";
import { retainedChildcareStateCount, RETAINED_CHILDCARE_SOURCE_IDS } from './retained-childcare-state-evidence.mjs';
import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { validateIndustryConfig } from "./industry-segments.mjs";
import { loadStateBusinessSourceAssessmentCatalog } from "./state-business-source-assessment.mjs";
import { loadMnConstructionReportingEnrollment, projectMnConstructionStateEvidence } from "./mn-construction-reporting-enrollment.mjs";
import { loadPaChildcareReportingEnrollment, projectPaChildcareStateEvidence } from "./pa-childcare-reporting-enrollment.mjs";
import { loadCtChildcareReportingEnrollment, projectCtChildcareStateEvidence } from "./ct-childcare-reporting-enrollment.mjs";
import { loadCoChildcareReportingEnrollment, projectCoChildcareStateEvidence } from "./co-childcare-reporting-enrollment.mjs";
import { loadMdChildcareReportingEnrollment, projectMdChildcareStateEvidence } from "./md-childcare-reporting-enrollment.mjs";
import { loadVtChildcareReportingEnrollment, projectVtChildcarePublisherEvidence } from "./vt-childcare-reporting-enrollment.mjs";
import { loadUtChildcareReportingEnrollment, projectUtChildcareStateEvidence } from "./ut-childcare-reporting-enrollment.mjs";
import { loadIaChildcareReportingEnrollment, projectIaChildcarePublisherEvidence } from "./ia-childcare-reporting-enrollment.mjs";
import { BROAD_ORGANIZATION_SOURCES, buildBroadOrganizationEvidence } from "./broad-organization-evidence.mjs";
import { loadStateCoverageReassessment } from "./state-coverage-reassessment.mjs";
import { loadMnCredentialPublicationStatus } from "./mn-credential-publication-status.mjs";

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
  "state-oh-childcare": "oh-dcy-publisher-open-childcare-centers",
  "state-pa-childcare-centers": null,
  "state-ct-childcare-centers": null,
  "state-md-childcare-centers": null,
  "state-vt-childcare-centers": null,
  "state-co-childcare-centers": null,
  "state-ia-childcare-centers": null,
  "state-ok-childcare-spatial-batch": null,
  // Offline retained adoption is not a national reporting profile or refresh.
  "state-ut-childcare-centers-retained": null,
  "national-irs-eo-bmf": null,
});
// The coverage view retains this historical count-field name for both evidence
// classes. These sources are reporting-only, never identity-matching profiles.
const REPORTING_ONLY_SOURCES = new Set(["state-ma-childcare", "state-nj-childcare", "state-tn-childcare", "state-oh-childcare"]);
const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const CANONICAL = new Set(STATES);
const digest = (value) => createHash("sha256").update(value).digest("hex");

function validateMnCredentialMetric(metric) {
  if (metric === undefined) return null;
  const count = metric?.credential_rows, selected = metric?.selected_cohort_rows, categories = metric?.by_category;
  const expectedPercent = selected > 0 ? 100 * count / selected : null;
  const categoryIds = ["construction-contractor-registration", "residential-building-contractor", "residential-remodeler", "residential-roofer", "manufactured-home-installer"];
  if (metric?.schema_version !== "mn-credential-registry-input@1.0.0"
    || !Number.isSafeInteger(count) || count < 0
    || !Number.isSafeInteger(metric.missing_reported_zip5_rows) || metric.missing_reported_zip5_rows < 0 || metric.missing_reported_zip5_rows > count
    || !Number.isSafeInteger(selected) || selected < count
    || metric.percent_of_selected_credential_cohort !== expectedPercent
    || !Array.isArray(categories) || categories.length !== 5
    || JSON.stringify(categories.map((item) => item?.category)) !== JSON.stringify(categoryIds)
    || categories.some((item) => !Number.isSafeInteger(item?.credential_rows) || item.credential_rows < 0)
    || categories.reduce((sum, item) => sum + item.credential_rows, 0) !== count
    || metric.denominator !== "all accepted credential rows in the explicitly selected Minnesota source cohort; not all U.S. construction businesses"
    || metric.record_unit !== "publisher-business-credential-row"
    || metric.identity_matching_eligible !== false || metric.physical_site_eligible !== false
    || metric.geographic_assignment_performed !== false || metric.current_operations_verified !== false
    || metric.unique_business_count !== null || metric.active_business_count !== null || metric.national_completeness_percent !== null
    || metric.public_export_authorized !== false || metric.export_policy !== "local-review-only" || metric.zip4_aggregated !== false) {
    throw new Error("Published Minnesota credential reporting metric is invalid.");
  }
  return metric;
}

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

async function governedIrsStateEvidence(root, catalogPath) {
  const catalog = await readPinnedJson(root, catalogPath);
  const source = catalog.value?.sources?.find((item) => item.id === "national-irs-eo-bmf");
  const contract = source?.stateEvidence;
  if (catalog.value?.schemaVersion !== "national-reporting-catalog@1.0.0"
    || source?.profileId !== null || source?.sourceKey !== "irs_eo_bmf_organizations"
    || contract?.kind !== "reported-filing-address-aggregate" || contract?.artifactType !== "irs-eo-bmf-source-summary"
    || contract?.field !== "states_and_territories" || contract?.rowUnit !== "organization-filing-address-record"
    || contract?.identityMatchingEligible !== false || contract?.physicalSiteEligible !== false
    || contract?.currentOperationsVerified !== false || contract?.allBusinessCompleteness !== null) {
    throw new Error("IRS state aggregate evidence contract is invalid.");
  }
  const pointer = await readPinnedJson(root, contract.pointer);
  const manifest = await readPinnedJson(root, inside(root, path.resolve(path.dirname(pointer.file), pointer.value.manifest)));
  if (pointer.value.dataset_id !== "irs-eo-bmf-organizations" || manifest.value.dataset_id !== pointer.value.dataset_id
    || manifest.value.release_id !== pointer.value.release_id || !String(manifest.value.status).startsWith("published")) {
    throw new Error("IRS state aggregate pointer does not identify a published release.");
  }
  const artifacts = manifest.value.artifacts?.filter((item) => item.artifact_type === contract.artifactType) ?? [];
  if (artifacts.length !== 1 || !Number.isSafeInteger(artifacts[0].bytes) || !/^[a-f0-9]{64}$/.test(artifacts[0].sha256)) throw new Error("IRS state aggregate summary artifact is invalid.");
  const summaryPath = inside(root, path.resolve(path.dirname(manifest.file), artifacts[0].path));
  await rejectLinks(root, summaryPath);
  const bytes = await readFile(summaryPath);
  if (bytes.length !== artifacts[0].bytes || digest(bytes) !== artifacts[0].sha256) throw new Error("IRS state aggregate summary integrity failed.");
  const counts = JSON.parse(bytes)[contract.field];
  if (!counts || STATES.some((state) => !Number.isSafeInteger(counts[state]) || counts[state] <= 0)) throw new Error("IRS state aggregate summary must contain positive counts for all 50 states and DC.");
  return { counts, source, contract, releaseId: manifest.value.release_id, manifestSha256: manifest.sha256, artifactPath: path.relative(root, summaryPath).replaceAll("\\", "/"), artifactSha256: artifacts[0].sha256 };
}

async function governedWaContractorEvidence(root, pointerPath) {
  const pointer = await readPinnedJson(root, pointerPath);
  const manifest = await readPinnedJson(root, inside(root, path.resolve(path.dirname(pointer.file), pointer.value.manifest)));
  if (pointer.value.dataset_id !== "wa-lni-active-contractor-organizations"
    || manifest.value.dataset_id !== pointer.value.dataset_id
    || manifest.value.release_id !== pointer.value.release_id
    || manifest.value.status !== "published") throw new Error("Washington contractor pointer does not identify a published release.");
  const artifacts = manifest.value.artifacts?.filter((item) => item.artifact_type === "wa-lni-active-contractor-licenses-source-summary") ?? [];
  if (artifacts.length !== 1 || !Number.isSafeInteger(artifacts[0].bytes) || artifacts[0].bytes <= 0 || !/^[a-f0-9]{64}$/.test(artifacts[0].sha256)) throw new Error("Washington contractor release must contain one verified source summary.");
  const summaryPath = inside(root, path.resolve(path.dirname(manifest.file), artifacts[0].path));
  await rejectLinks(root, summaryPath);
  const bytes = await readFile(summaryPath);
  if (bytes.length !== artifacts[0].bytes || digest(bytes) !== artifacts[0].sha256) throw new Error("Washington contractor source summary integrity failed.");
  const summary = JSON.parse(bytes);
  const count = summary.active_contractor_organizations;
  if (!Number.isSafeInteger(count) || count <= 0
    || count !== manifest.value.coverage?.organizations_published
    || summary.active_contractor_license_source_rows !== manifest.value.coverage?.source_active_contractor_license_rows
    || summary.active_contractor_license_activities !== manifest.value.coverage?.active_contractor_license_activities
    || manifest.value.coverage?.physical_sites !== null || manifest.value.coverage?.establishments !== null) {
    throw new Error("Washington contractor source summary has invalid or unreconciled cohort semantics.");
  }
  return { count, releaseId: manifest.value.release_id, sourceReleaseId: manifest.value.source_release_id,
    manifestSha256: manifest.sha256, artifactPath: path.relative(root, summaryPath).replaceAll("\\", "/"), artifactSha256: artifacts[0].sha256 };
}

async function governedDelawareLicenseEvidence(root, pointerPath) {
  const pointer = await readPinnedJson(root, pointerPath);
  const manifest = await readPinnedJson(root, inside(root, path.resolve(path.dirname(pointer.file), pointer.value.manifest)));
  if (pointer.value.dataset_id !== "de-business-licenses-current"
    || manifest.value.dataset_id !== pointer.value.dataset_id
    || manifest.value.release_id !== pointer.value.release_id
    || manifest.value.status !== "published"
    || manifest.value.complete_current_license_snapshot !== true) throw new Error("Delaware license pointer does not identify a published complete release.");
  const artifacts = manifest.value.artifacts?.filter((item) => item.artifact_type === "de-business-licenses-source-summary") ?? [];
  if (artifacts.length !== 1 || !Number.isSafeInteger(artifacts[0].bytes) || artifacts[0].bytes <= 0 || !/^[a-f0-9]{64}$/.test(artifacts[0].sha256)) throw new Error("Delaware license release must contain one verified source summary.");
  const summaryPath = inside(root, path.resolve(path.dirname(manifest.file), artifacts[0].path));
  await rejectLinks(root, summaryPath);
  const bytes = await readFile(summaryPath);
  if (bytes.length !== artifacts[0].bytes || digest(bytes) !== artifacts[0].sha256) throw new Error("Delaware license source summary integrity failed.");
  const summary = JSON.parse(bytes), count = summary.distinct_licenses_published, coverage = manifest.value.coverage;
  if (!Number.isSafeInteger(count) || count <= 0
    || count !== coverage?.distinct_licenses_published
    || summary.source_current_license_rows !== coverage.source_current_license_rows
    || summary.accepted_current_license_rows !== coverage.accepted_current_license_rows
    || summary.distinct_source_license_numbers !== coverage.distinct_source_license_numbers
    || summary.quarantined_source_records !== coverage.quarantined_source_records
    || summary.quarantined_license_groups !== coverage.quarantined_license_groups
    || summary.accepted_current_license_rows + summary.quarantined_source_records !== summary.source_current_license_rows
    || summary.distinct_licenses_published + summary.quarantined_license_groups !== summary.distinct_source_license_numbers
    || coverage.physical_sites !== null || coverage.establishments !== null) {
    throw new Error("Delaware license source summary has invalid or unconserved cohort semantics.");
  }
  return { count, releaseId: manifest.value.release_id, sourceReleaseId: manifest.value.source_release_id,
    manifestSha256: manifest.sha256, artifactPath: path.relative(root, summaryPath).replaceAll("\\", "/"), artifactSha256: artifacts[0].sha256 };
}

async function governedStates(root, pointer) {
  const pp = await readPinnedJson(root, pointer);
  const mp = await readPinnedJson(root, inside(root, path.resolve(path.dirname(pp.file), pp.value.manifest)));
  if (mp.value.dataset_id !== "national-business-coverage-views" || mp.value.release_id !== pp.value.release_id || !String(mp.value.status).startsWith("published")) throw new Error("Coverage pointer does not identify a published release.");
  const artifact = mp.value.artifacts?.find((item) => item.artifact_type === "state-coverage-view-jsonl");
  const sourceArtifact = mp.value.artifacts?.find((item) => item.artifact_type === "source-coverage-view-jsonl");
  if (!artifact || !Number.isSafeInteger(artifact.bytes) || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error("Coverage release has no governed state artifact.");
  if (!sourceArtifact || !Number.isSafeInteger(sourceArtifact.bytes) || !/^[a-f0-9]{64}$/.test(sourceArtifact.sha256)) throw new Error("Coverage release has no governed source artifact.");
  const artifactPath = inside(root, path.resolve(path.dirname(mp.file), artifact.path));
  await rejectLinks(root, artifactPath);
  const bytes = await readFile(artifactPath);
  if (bytes.length !== artifact.bytes || digest(bytes) !== artifact.sha256) throw new Error("State coverage artifact integrity failed.");
  const rows = bytes.toString("utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.is_50_states_or_dc === true && CANONICAL.has(row.postal_abbreviation));
  if (rows.length !== 51 || new Set(rows.map((row) => row.postal_abbreviation)).size !== 51) throw new Error("Coverage artifact must contain the unique 50 states plus DC.");
  for (const row of rows) validateMnCredentialMetric(row.mn_construction_credential_reporting);
  const sourceArtifactPath = inside(root, path.resolve(path.dirname(mp.file), sourceArtifact.path));
  await rejectLinks(root, sourceArtifactPath);
  const sourceBytes = await readFile(sourceArtifactPath);
  if (sourceBytes.length !== sourceArtifact.bytes || digest(sourceBytes) !== sourceArtifact.sha256) throw new Error("Source coverage artifact integrity failed.");
  const sources = sourceBytes.toString("utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return { pointer: pp.value, retainedChildcare: mp.value.retained_childcare_reporting, rows: new Map(rows.map((row) => [row.postal_abbreviation, row])), sources: new Map(sources.map((row) => [row.source_key, row])), releaseId: mp.value.release_id, manifestSha256: mp.sha256, artifactPath: path.relative(root, artifactPath).replaceAll("\\", "/"), artifactSha256: artifact.sha256, artifactBytes: artifact.bytes };
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

export async function buildStateAccessLedger({ root = APP_ROOT, coveragePointer = "data/business-coverage-views/current.json", waContractorPointer = "data/business-sources/wa-lni-active-contractor-organizations/current.json", deLicensePointer = "data/business-sources/de-business-licenses-current/current.json", industryConfigPath = "config/industry-segments.json", workstreamConfigPath = "config/state-access-workstreams.json", nationalReportingConfigPath = "config/national-reporting-sources.json", assessmentLoader = loadStateBusinessSourceAssessmentCatalog, coverageReassessmentLoader = loadStateCoverageReassessment, mnCredentialPublicationLoader = loadMnCredentialPublicationStatus, activeAssignments = [], observedTotalActiveAgents = null } = {}) {
  const industryRead = await readPinnedJson(root, industryConfigPath); validateIndustryConfig(industryRead.value, industryRead.file);
  const workstreamRead = await readPinnedJson(root, workstreamConfigPath), workstreams = validateWorkstreams(workstreamRead.value);
  const [coverage, irsStateEvidence, waContractorEvidence, deLicenseEvidence, assessments, credentialPublication, localCredentials, localFacilities, localCtCandidates, localMdCandidates, localVtCandidates, localCoCandidates, localUtCandidates, localIaCandidates] = await Promise.all([governedStates(root, coveragePointer), governedIrsStateEvidence(root, nationalReportingConfigPath), governedWaContractorEvidence(root, waContractorPointer), governedDelawareLicenseEvidence(root, deLicensePointer), assessmentLoader(), mnCredentialPublicationLoader({root}), loadMnConstructionReportingEnrollment({root}), loadPaChildcareReportingEnrollment({root}), loadCtChildcareReportingEnrollment({root}), loadMdChildcareReportingEnrollment({root}), loadVtChildcareReportingEnrollment({root}), loadCoChildcareReportingEnrollment({root}), loadUtChildcareReportingEnrollment({root}), loadIaChildcareReportingEnrollment({root})]);
  const credentialPublicationVerified = credentialPublication?.status === "verified-downstream-publication"
    && credentialPublication.included === true && credentialPublication.credentialRows === 11456
    && credentialPublication.recordUnit === "publisher-business-credential-row"
    && credentialPublication.exportPolicy === "local-review-only"
    && credentialPublication.uniqueBusinessCount === null && credentialPublication.activeBusinessCount === null
    && credentialPublication.physicalSiteCount === null && credentialPublication.nationalCompletenessPercent === null
    && credentialPublication.geographicAssignmentPerformed === false && credentialPublication.publicExportAuthorized === false
    && credentialPublication.coverageReleaseId === coverage.releaseId
    && credentialPublication.coverageManifestSha256 === coverage.manifestSha256;
  if ([...coverage.rows.values()].some((row) => row.mn_construction_credential_reporting !== undefined) && !credentialPublicationVerified) throw new Error("Published Minnesota credential reporting requires its verified downstream publication receipt chain.");
  const assessmentStates = assessments.states ?? [];
  if (!Array.isArray(assessmentStates) || assessmentStates.some((item) => !CANONICAL.has(item.state_abbreviation)) || new Set(assessmentStates.map((item) => item.state_abbreviation)).size !== assessmentStates.length) throw new Error("Assessment states must contain unique canonical state codes.");
  for (const sourceKeys of Object.values(industryRead.value.industries)) for (const key of sourceKeys) if (!Object.hasOwn(PROFILE_IDS, key)) throw new Error(`Industry source ${key} has no explicit coverage profile mapping.`);
  if (!Array.isArray(activeAssignments) || activeAssignments.some((state) => !CANONICAL.has(state)) || new Set(activeAssignments).size !== activeAssignments.length || activeAssignments.length > workstreams.max_total_agent_concurrency) throw new Error("activeAssignments must contain unique canonical state codes within total concurrency.");
  if (observedTotalActiveAgents !== null && (!Number.isInteger(observedTotalActiveAgents) || observedTotalActiveAgents < activeAssignments.length || observedTotalActiveAgents > workstreams.max_total_agent_concurrency)) throw new Error("observedTotalActiveAgents is invalid.");
  const assessmentByState = new Map(assessmentStates.map((item) => [item.state_abbreviation, item])), active = new Set(activeAssignments), jurisdictions = [];
  const catalogCoverageReleaseId = assessments.coverage_release_id ?? null;
  let coverageReassessment = null;
  if (catalogCoverageReleaseId && catalogCoverageReleaseId !== coverage.releaseId) {
    try {
      coverageReassessment = await coverageReassessmentLoader(coverage.pointer, { root });
    } catch (error) {
      if (!/no reviewed reassessment transition/i.test(error?.message ?? "")) throw error;
    }
  }
  if (coverageReassessment && coverageReassessment.historicalRelease !== catalogCoverageReleaseId) throw new Error("Coverage reassessment does not originate at the assessment coverage release.");
  const reassessedStates = new Set(coverageReassessment?.states?.map((item) => item.state) ?? []);
  const broadEvidence = new Map(await Promise.all(Object.entries(BROAD_ORGANIZATION_SOURCES).map(async ([state, { sourceKey }]) => [state, await buildBroadOrganizationEvidence({ state, source: coverage.sources.get(sourceKey), root, asOf: new Date() })])));
  const assessmentFreshnessCounts = { current: 0, stale: 0, missingCoverageReleaseId: 0, unassessed: 0 };
  const assessmentCoverageApplicabilityCounts = { exactPin: 0, reviewedCompatible: 0, notReviewed: 0, missingCoverageReleaseId: 0, unassessed: 0 };
  for (const state of workstreams.jurisdictions) {
    const row = coverage.rows.get(state), assignment = workstreams.workstreams.find((item) => item.state === state), assessment = assessmentByState.get(state), industries = [];
    const assessmentCoverageReleaseId = assessment ? assessment.coverage_release_id ?? assessments.coverage_release_id ?? null : null;
    const assessmentFreshnessStatus = !assessment ? "unassessed"
      : !assessmentCoverageReleaseId ? "missing-coverage-release-id"
      : assessmentCoverageReleaseId === coverage.releaseId ? "current"
      : "stale";
    const assessmentCoverageApplicabilityStatus = !assessment ? "unassessed"
      : !assessmentCoverageReleaseId ? "missing-coverage-release-id"
      : assessmentCoverageReleaseId === coverage.releaseId ? "exact-pin"
      : reassessedStates.has(state) ? "reviewed-compatible"
      : "not-reviewed";
    if (assessmentFreshnessStatus === "missing-coverage-release-id") assessmentFreshnessCounts.missingCoverageReleaseId += 1;
    else assessmentFreshnessCounts[assessmentFreshnessStatus] += 1;
    if (assessmentCoverageApplicabilityStatus === "exact-pin") assessmentCoverageApplicabilityCounts.exactPin += 1;
    else if (assessmentCoverageApplicabilityStatus === "reviewed-compatible") assessmentCoverageApplicabilityCounts.reviewedCompatible += 1;
    else if (assessmentCoverageApplicabilityStatus === "not-reviewed") assessmentCoverageApplicabilityCounts.notReviewed += 1;
    else if (assessmentCoverageApplicabilityStatus === "missing-coverage-release-id") assessmentCoverageApplicabilityCounts.missingCoverageReleaseId += 1;
    else assessmentCoverageApplicabilityCounts.unassessed += 1;
    for (const [industryId, sourceKeys] of Object.entries(industryRead.value.industries)) {
      const evidence = [], appSources = []; let direct = false, national = false, unmeasured = false;
      if (industryId === "construction" && state === "MN") {
        const metric = validateMnCredentialMetric(row.mn_construction_credential_reporting);
        if (metric?.credential_rows > 0) {
          direct = true;
          evidence.push({ type: "published-direct-state-credential-count", sourceId: "mn-construction-credential-reporting", recordCount: metric.credential_rows,
            coverageReleaseId: coverage.releaseId, artifactPath: coverage.artifactPath, rowUnit: metric.record_unit,
            addressBasis: "reported-address-state", identityMatchingEligible: false, physicalSiteEligible: false,
            currentOperationsVerified: false, exportPolicy: metric.export_policy, nationalCompletenessPercent: null });
        }
      }
      if (industryId === "construction" && state !== "MN") {
        const metric = validateMnCredentialMetric(row.mn_construction_credential_reporting);
        if (credentialPublicationVerified && metric?.credential_rows > 0) {
          national = true;
          evidence.push({ type: "published-national-source-cohort-reported-address-count", evidenceClass: "minnesota-publisher-residential-construction-credential-cohort",
            sourceId: "mn-construction-credential-reporting", publisherJurisdiction: "MN", reportedAddressState: state,
            recordCount: metric.credential_rows, selectedCohortRows: metric.selected_cohort_rows,
            coverageReleaseId: coverage.releaseId, coverageManifestSha256: coverage.manifestSha256,
            artifactPath: coverage.artifactPath, artifactSha256: coverage.artifactSha256,
            productionRunId: credentialPublication.productionRunId, productionReceiptSha256: credentialPublication.productionReceiptSha256,
            reportingReleaseId: credentialPublication.reportingReleaseId, reportingManifestSha256: credentialPublication.reportingManifestSha256,
            rowUnit: metric.record_unit, addressBasis: "reported-address-state", identityMatchingEligible: false,
            uniqueBusinessCount: null, activeBusinessCount: null, physicalSiteEligible: false, physicalSiteCount: null,
            currentOperationsVerified: false, nationalCompletenessPercent: null, geographicAssignmentPerformed: false,
            publicExportAuthorized: false, exportPolicy: metric.export_policy });
        }
      }
      if (industryId === "construction" && state === "WA") {
        direct = true;
        evidence.push({ type: "published-direct-state-contractor-license-organization-count", evidenceClass: "washington-publisher-active-contractor-license-organization-cohort",
          sourceId: "washington-lni-active-contractor-licenses", sourceReleaseId: waContractorEvidence.sourceReleaseId,
          recordCount: waContractorEvidence.count, rowUnit: "publisher-ubi-organization-with-one-or-more-a-active-contractor-license-rows",
          artifactPath: waContractorEvidence.artifactPath, artifactSha256: waContractorEvidence.artifactSha256,
          sourceManifestSha256: waContractorEvidence.manifestSha256, identityMatchingEligible: false, physicalSiteEligible: false,
          currentOperationsVerified: false, uniqueBusinessCount: null, nationalCompletenessPercent: null,
          exportPolicy: "local-review-only", aggregateDistribution: "public-under-pddl-with-l-and-i-attribution-and-semantic-limitations" });
      }
      if (industryId === "local-business-licenses" && state === "DE") {
        direct = true;
        evidence.push({ type: "published-direct-state-publisher-cohort-count", evidenceClass: "delaware-publisher-current-license-organization-cohort",
          sourceId: "delaware-division-of-revenue-current-business-licenses", sourceReleaseId: deLicenseEvidence.sourceReleaseId,
          recordCount: deLicenseEvidence.count, rowUnit: "publisher-current-license-number-organization-candidate",
          stateBasis: "publisher-jurisdiction", publisherJurisdiction: "DE", reportedAddressState: null,
          artifactPath: deLicenseEvidence.artifactPath, artifactSha256: deLicenseEvidence.artifactSha256,
          sourceManifestSha256: deLicenseEvidence.manifestSha256, identityMatchingEligible: false, physicalSiteEligible: false,
          currentOperationsVerified: false, uniqueBusinessCount: null, nationalCompletenessPercent: null,
          exportPolicy: "local-review-only", aggregateDistribution: "public-with-provenance-and-semantic-limitations" });
      }
      for (const key of sourceKeys) {
        const source = industryRead.value.sources[key], profileId = PROFILE_IDS[key], count = profileId === null ? null : row.registry_evidence?.source_profile_counts_by_reported_address_state?.[profileId];
        const applies = source.scope === "national" || source.states.includes(state), positive = Number.isSafeInteger(count) && count > 0;
        if (!applies) continue;
        if (key === 'state-vt-childcare-centers' && state === 'VT') {
          const cohort = projectVtChildcarePublisherEvidence(localVtCandidates, state);
          if (cohort.status === 'verified-retained-publisher-cohort') {
            direct = true;
            evidence.push({
              type: 'published-direct-state-publisher-cohort-count', evidenceClass: 'retained-publisher-childcare-candidate',
              sourceId: cohort.sourceId, recordCount: cohort.publisherCohortRows, rowUnit: 'retained-publisher-childcare-candidate',
              stateBasis: 'publisher-jurisdiction', publisherJurisdiction: 'VT', reportedAddressState: null,
              enrollmentSha256: cohort.enrollmentSha256, appReceiptSha256: cohort.appReceiptSha256,
              acquiredManifestSha256: cohort.acquiredManifestSha256, normalizedManifestSha256: cohort.normalizedManifestSha256,
              acceptedCohortRows: cohort.acceptedCohortRows, sourceRows: cohort.sourceRows, quarantinedRows: cohort.quarantinedRows,
              facilityCount: null, uniqueBusinessCount: null, uniqueActiveBusinessCount: null,
              identityMatchingEligible: false, physicalSiteVerified: false, currentOperationsVerified: false,
              publicExportAuthorized: false, exportPolicy: 'internal', nationalReportingIntegrated: false,
              nationalCompletenessPercent: null, reportingPeriod: null, reportingPeriodVerified: false,
            });
          }
        }
        if (key === 'state-ia-childcare-centers' && state === 'IA') {
          const cohort = projectIaChildcarePublisherEvidence(localIaCandidates, state);
          if (cohort.status === 'verified-retained-publisher-cohort') {
            direct = true;
            evidence.push({
              type: 'published-direct-state-publisher-cohort-count', evidenceClass: 'retained-iowa-publisher-scope-childcare-candidate',
              sourceId: cohort.sourceId, recordCount: cohort.publisherCohortRows, rowUnit: 'retained-iowa-publisher-childcare-candidate',
              stateBasis: 'publisher-jurisdiction', publisherJurisdiction: 'IA', reportedAddressState: null,
              enrollmentSha256: cohort.enrollmentSha256, appReceiptSha256: cohort.appReceiptSha256,
              acquiredManifestSha256: cohort.acquiredManifestSha256, normalizedManifestSha256: cohort.normalizedManifestSha256,
              acceptedCohortRows: cohort.acceptedCohortRows, sourceRows: cohort.sourceRows,
              sourceResponseRows: cohort.sourceResponseRows, excludedSourceRows: cohort.excludedSourceRows,
              duplicateSelectedRows: cohort.duplicateSelectedRows, quarantinedRows: cohort.quarantinedRows,
              rowsWithReportedAddressState: 0, rowsWithoutReportedAddressState: cohort.reportedAddressStateUnavailableRows,
              facilityCount: null, uniqueBusinessCount: null, uniqueActiveBusinessCount: null,
              identityMatchingEligible: false, physicalSiteVerified: false, currentOperationsVerified: false,
              publicExportAuthorized: false, exportPolicy: 'internal', nationalReportingIntegrated: false,
              nationalCompletenessPercent: null, reportingPeriod: null, reportingPeriodVerified: false,
            });
          }
        }
        const retainedCount = retainedChildcareStateCount(row, coverage.retainedChildcare, key);
        if (retainedCount > 0) {
          direct = true;
          evidence.push({ type: 'published-direct-state-candidate-count', sourceId: RETAINED_CHILDCARE_SOURCE_IDS[key], recordCount: retainedCount,
            coverageReleaseId: coverage.releaseId, artifactPath: coverage.artifactPath, rowUnit: 'source-candidate-row',
            addressBasis: 'reported-address-state', identityMatchingEligible: false, physicalSiteVerified: false,
            currentOperationsVerified: false, exportPolicy: 'internal', nationalCompletenessPercent: null });
        }
        const reportingOnly = REPORTING_ONLY_SOURCES.has(key);
        if (reportingOnly && count !== undefined && count !== null && (!Number.isSafeInteger(count) || count < 0)) throw new Error("Published childcare reporting count must be a non-negative integer.");
        const missing = await missingPrerequisites(root, source.prerequisites ?? []);
        appSources.push({ sourceId: key, acquisitionExecutor: "cotive-app", ...(source.manual_selection_required ? { manualSelectionRequired: true } : {}), prerequisiteStatus: missing.length ? "MISSING" : "PRESENT", missingPrerequisites: missing, limitations: source.coverage_notes ?? [] });
        if (key === "national-irs-eo-bmf") {
          const aggregateCount = irsStateEvidence.counts[state];
          national = true;
          evidence.push({ type: "published-state-reported-address-aggregate-count", evidenceClass: irsStateEvidence.contract.kind,
            sourceId: key, sourceReleaseId: irsStateEvidence.releaseId, recordCount: aggregateCount,
            artifactPath: irsStateEvidence.artifactPath, artifactSha256: irsStateEvidence.artifactSha256,
            rowUnit: irsStateEvidence.contract.rowUnit, addressBasis: "reported-filing-address-state",
            identityMatchingEligible: false, physicalSiteEligible: false, currentOperationsVerified: false,
            allBusinessCompleteness: null });
          continue;
        }
        if (source.scope === "state" && positive) { direct = true; evidence.push({ type: reportingOnly ? "published-direct-state-reporting-count" : "published-direct-state-profile-count", sourceId: profileId, recordCount: count, coverageReleaseId: coverage.releaseId, artifactPath: coverage.artifactPath }); }
        else if (source.scope === "national" && positive) { national = true; evidence.push({ type: "published-state-profile-count", sourceId: profileId, recordCount: count, coverageReleaseId: coverage.releaseId, artifactPath: coverage.artifactPath }); }
        else if (profileId === null || reportingOnly && (count === undefined || count === null)) unmeasured = true;
      }
      const accessEvidenceStatus = direct ? "direct-state-publisher" : national ? "national-dataset-state-evidence" : unmeasured ? "unsupported-evidence-not-measured" : "unsupported-missing";
      if (assessment?.decision === "hold") evidence.push({
        type: assessmentFreshnessStatus === "current" ? "current-state-publisher-assessment-hold" : "historical-state-publisher-assessment-hold",
        evidenceClass: "assessment-context-not-coverage-evidence",
        assessmentId: assessment.assessment_id,
        assessmentCoverageReleaseId,
        currentCoverageReleaseId: coverage.releaseId,
        assessmentFreshnessStatus,
        assessmentCoverageApplicabilityStatus,
        coverageReassessmentId: assessmentCoverageApplicabilityStatus === "reviewed-compatible" ? coverageReassessment.id : null,
        observedAt: assessment.observed_at ?? assessments.observed_at ?? null,
        reason: assessment.strongest_bounded_next_action,
      });
      const prerequisiteReady = appSources.length > 0 && appSources.every((item) => item.prerequisiteStatus === "PRESENT");
      industries.push({ industry: industryId, accessEvidenceStatus, evidence, appHandoff: { acquisitionExecutor: "cotive-app", status: (direct || national) && prerequisiteReady ? "APP_PREFLIGHT_REQUIRED" : !prerequisiteReady ? "BLOCKED_PREREQUISITE" : unmeasured ? "NOT_READY_EVIDENCE_UNMEASURED" : "NOT_READY_NO_PUBLISHED_STATE_EVIDENCE", configuredSources: appSources, prerequisiteContentsValidated: false, jobSubmitted: false, recurringSchedulerImplemented: null, schedulerObservation: "not-inspected-by-ledger" }, limitations: ["Published counts are source-specific profiles or explicitly identified reporting-only records, not deduplicated businesses or proof of complete industry coverage."] });
    }
    const observedAt = assessment ? assessment.observed_at ?? assessments.observed_at ?? null : null;
    jurisdictions.push({ state, jurisdictionKind: state === "DC" ? "district" : "state", assessmentContext: { status: assessmentFreshnessStatus, assessmentId: assessment?.assessment_id ?? null, assessmentCoverageReleaseId, currentCoverageReleaseId: coverage.releaseId, observedAt, observation: { observedAt, freshnessStatus: observedAt ? "not-evaluated-no-age-policy" : "unobserved" }, coverageApplicability: { status: assessmentCoverageApplicabilityStatus, assessmentCoverageReleaseId, currentCoverageReleaseId: coverage.releaseId, exactReleaseMatch: assessmentCoverageReleaseId === coverage.releaseId, reconciliationId: assessmentCoverageApplicabilityStatus === "reviewed-compatible" ? coverageReassessment.id : null } }, broadOrganizationEvidence: broadEvidence.get(state) ?? null, workstream: { ...assignment, status: active.has(state) ? "IN_PROGRESS" : "UNASSIGNED", assignee: active.has(state) ? `peer:${assignment.peer_task_name}` : null, assignmentEvidence: active.has(state) ? "operator-reported" : null }, industries });
    // Local credential evidence does not change published national status,
    // dispatch readiness, matching profiles or physical-site totals.
    const construction=industries.find(cell=>cell.industry==='construction');
    if(construction)construction.localCredentialEvidence=projectMnConstructionStateEvidence(localCredentials,state);
    const childcare=industries.find(cell=>cell.industry==='childcare');
    if(childcare)childcare.localFacilityEvidence=projectPaChildcareStateEvidence(localFacilities,state);
    if(childcare)childcare.localSourceCandidateEvidence=state==='UT'
      ?projectUtChildcareStateEvidence(localUtCandidates,state)
      :state==='CO'
      ?projectCoChildcareStateEvidence(localCoCandidates,state)
      :state==='MD'
      ?projectMdChildcareStateEvidence(localMdCandidates,state)
      :projectCtChildcareStateEvidence(localCtCandidates,state);
    // VT reports publisher scope, not address state. Do not turn its unknown
    // address-state bucket into Vermont address coverage or published totals.
    if(childcare&&state==='VT')childcare.localPublisherCohortEvidence=projectVtChildcarePublisherEvidence(localVtCandidates,state);
    if(childcare&&state==='IA')childcare.localPublisherCohortEvidence=projectIaChildcarePublisherEvidence(localIaCandidates,state);
  }
  const counts = {}; for (const jurisdiction of jurisdictions) for (const item of jurisdiction.industries) counts[item.accessEvidenceStatus] = (counts[item.accessEvidenceStatus] ?? 0) + 1;
  const assessmentCoverageReleaseId = assessments.coverage_release_id ?? null;
  const assessmentCatalogFreshnessStatus = !assessmentCoverageReleaseId ? "missing-coverage-release-id" : assessmentCoverageReleaseId === coverage.releaseId ? "current" : "stale";
  const catalogApplicabilityStatus = !assessmentCoverageReleaseId ? "missing-coverage-release-id" : assessmentCoverageReleaseId === coverage.releaseId ? "exact-pin" : coverageReassessment && assessmentCoverageApplicabilityCounts.reviewedCompatible === assessmentStates.length ? "reviewed-compatible" : "not-reviewed";
  return { schemaVersion: 3, generatedAt: new Date().toISOString(), scope: { configuredIndustryBucketsOnly: true, industryBucketCount: Object.keys(industryRead.value.industries).length }, evidence: { coverageReleaseId: coverage.releaseId, coverageManifestSha256: coverage.manifestSha256, stateArtifactPath: coverage.artifactPath, stateArtifactSha256: coverage.artifactSha256, stateArtifactBytes: coverage.artifactBytes, assessmentCatalogId: assessments.assessment_catalog_id, assessmentCoverageReleaseId, assessmentObservedAt: assessments.observed_at ?? null, assessmentCoverageMatchesCurrent: assessmentCoverageReleaseId === coverage.releaseId, assessmentObservation: { observedAt: assessments.observed_at ?? null, freshnessStatus: assessments.observed_at ? "not-evaluated-no-age-policy" : "unobserved" }, assessmentCoverageApplicability: { status: catalogApplicabilityStatus, currentCoverageReleaseId: coverage.releaseId, assessmentCoverageReleaseId, exactReleaseMatch: assessmentCoverageReleaseId === coverage.releaseId, reconciliationId: catalogApplicabilityStatus === "reviewed-compatible" ? coverageReassessment.id : null, assessedJurisdictions: assessmentStates.length, exactPinJurisdictions: assessmentCoverageApplicabilityCounts.exactPin, reviewedCompatibleJurisdictions: assessmentCoverageApplicabilityCounts.reviewedCompatible, notReviewedJurisdictions: assessmentCoverageApplicabilityCounts.notReviewed, missingCoverageReleaseIdJurisdictions: assessmentCoverageApplicabilityCounts.missingCoverageReleaseId, unassessedJurisdictions: assessmentCoverageApplicabilityCounts.unassessed }, assessmentFreshness: { status: assessmentCatalogFreshnessStatus, currentCoverageReleaseId: coverage.releaseId, assessmentCoverageReleaseId, assessedJurisdictions: assessmentStates.length, currentJurisdictions: assessmentFreshnessCounts.current, staleJurisdictions: assessmentFreshnessCounts.stale, missingCoverageReleaseIdJurisdictions: assessmentFreshnessCounts.missingCoverageReleaseId, unassessedJurisdictions: assessmentFreshnessCounts.unassessed }, industryConfigSha256: industryRead.sha256, workstreamConfigSha256: workstreamRead.sha256 }, dispatch: { maxTotalAgentConcurrency: 4, operatorReportedActiveStateAssignments: activeAssignments.length, observedTotalActiveAgents, availableDispatchSlots: observedTotalActiveAgents === null ? null : Math.max(0, 4 - observedTotalActiveAgents) }, summary: { jurisdictions: 51, states: 50, districts: 1, industryCells: jurisdictions.reduce((sum, item) => sum + item.industries.length, 0), accessEvidenceStatusCounts: counts, assessmentFreshnessStatusCounts: assessmentFreshnessCounts, assessmentCoverageApplicabilityStatusCounts: assessmentCoverageApplicabilityCounts }, jurisdictions };
}

export async function writeStateAccessReport(options = {}) {
  const root = options.root ?? APP_ROOT, ledger = await buildStateAccessLedger(options), directory = inside(root, "data/state-access/reports");
  await rejectLinks(root, directory, { allowMissing: true }); await mkdir(directory, { recursive: true }); await rejectLinks(root, directory);
  const reportPath = path.join(directory, `${ledger.generatedAt.replace(/\D/g, "").slice(0, 14)}-${randomUUID()}.json`);
  await writeFile(reportPath, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx" });
  return { reportPath, ledger };
}
