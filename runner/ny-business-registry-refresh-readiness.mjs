import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const NY_BUSINESS_REGISTRY_REFRESH_SOURCE_ID = "ny-business-registry";

const inputs = Object.freeze({
  policy: "config/source-policies/ny-business-registry.json",
  connector: "config/connectors/ny-business-registry.json",
  dataset: "config/datasets/ny-business-registry-active-entities.json",
  assessment: "config/state-business-source-existing-assessments/ny-2026-09-22.json",
});

const EXPECTED_RELEASE_ID = "ny-business-registry-20260903-005209518Z-d9e3551f";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const plainObject = value => value && typeof value === "object" && !Array.isArray(value);

async function boundedJson(file, maximum) {
  const resolved = path.resolve(file);
  const info = await lstat(resolved, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n || info.size <= 0n || info.size > BigInt(maximum) || await realpath(resolved) !== resolved) throw new Error("Governed New York evidence file is unsafe.");
  const bytes = await readFile(resolved);
  const after = await lstat(resolved, { bigint: true });
  if (bytes.length !== Number(info.size) || after.dev !== info.dev || after.ino !== info.ino || after.size !== info.size || after.mtimeNs !== info.mtimeNs || after.ctimeNs !== info.ctimeNs) throw new Error("Governed New York evidence changed while read.");
  const value = JSON.parse(bytes.toString("utf8"));
  if (!plainObject(value)) throw new Error("Governed New York evidence is invalid.");
  return { value, sha256: sha256(bytes), bytes: bytes.length };
}

async function governedJson(relative) {
  return boundedJson(path.join(APP_ROOT, relative), 1024 * 1024);
}

export async function getNyBusinessRegistryRefreshReadiness() {
  const [policyEvidence, connectorEvidence, datasetEvidence, assessmentEvidence] = await Promise.all(Object.values(inputs).map(governedJson));
  const policy = policyEvidence.value;
  const connector = connectorEvidence.value;
  const dataset = datasetEvidence.value;
  const assessment = assessmentEvidence.value;
  if (policy.policy_id !== NY_BUSINESS_REGISTRY_REFRESH_SOURCE_ID
    || policy.catalog_dataset_id !== "n9v6-gdp6"
    || connector.connector_id !== NY_BUSINESS_REGISTRY_REFRESH_SOURCE_ID
    || connector.source_policy !== inputs.policy
    || dataset.dataset_id !== "ny-business-registry-active-entities"
    || dataset.connector !== inputs.connector
    || dataset.source_policy !== inputs.policy
    || assessment.assessment_id !== "ny-existing-governed-source-2026-09-22"
    || assessment.state?.abbreviation !== "NY"
    || assessment.source?.dataset_id !== "n9v6-gdp6") throw new Error("Governed New York refresh inputs do not match the fixed source contract.");

  const authorization = assessment.authorization;
  if (!plainObject(authorization)
    || authorization.fresh_acquisition_authorized !== false
    || authorization.autonomous_acquisition_authorized !== false
    || authorization.production_pointer_change_authorized !== false) throw new Error("Governed New York assessment no longer contains the reviewed acquisition HOLD.");

  const sourceRoot = path.join(APP_ROOT, "data/business-sources/ny-business-registry-active-entities");
  const pointerPath = path.join(sourceRoot, "current.json");
  const pointerEvidence = await boundedJson(pointerPath, 100000);
  const pointer = pointerEvidence.value;
  if (pointer.dataset_id !== dataset.dataset_id
    || pointer.release_id !== EXPECTED_RELEASE_ID
    || pointer.release_id !== assessment.source.retained_release_id
    || pointer.manifest !== `releases/${EXPECTED_RELEASE_ID}/manifest.json`) throw new Error("Governed New York current pointer does not match the assessed retained release.");

  const manifestPath = path.join(sourceRoot, ...pointer.manifest.split("/"));
  const manifestEvidence = await boundedJson(manifestPath, 1024 * 1024);
  const manifest = manifestEvidence.value;
  const coverage = manifest.coverage;
  const artifacts = manifest.artifacts;
  const publishedCount = artifacts?.filter(item => item.artifact_type === "normalized-ny-business-organization-jsonl-gzip").reduce((total, item) => total + item.record_count, 0);
  if (manifest.dataset_id !== dataset.dataset_id
    || manifest.connector?.id !== connector.connector_id
    || manifest.connector?.version !== connector.version
    || manifest.release_id !== EXPECTED_RELEASE_ID
    || manifest.status !== "published"
    || manifest.complete_selected_business_entities_snapshot !== true
    || !plainObject(coverage)
    || !Array.isArray(artifacts)
    || artifacts.length !== 22
    || !artifacts.every(item => typeof item.path === "string" && Number.isSafeInteger(item.bytes) && item.bytes >= 0 && /^[a-f0-9]{64}$/.test(item.sha256))
    || !Number.isSafeInteger(coverage.source_active_extract_records)
    || coverage.source_active_extract_records !== coverage.organizations_published + coverage.quarantined_source_records
    || publishedCount !== coverage.organizations_published
    || manifest.quality_gates?.source_published_and_quarantined_counts_match !== true) throw new Error("Governed New York current manifest is incomplete or violates its count contract.");

  const evidence = Object.entries(inputs).map(([kind, relative], index) => {
    const item = [policyEvidence, connectorEvidence, datasetEvidence, assessmentEvidence][index];
    return { kind, path: relative, sha256: item.sha256, bytes: item.bytes };
  });
  evidence.push(
    { kind: "current-pointer", path: path.relative(APP_ROOT, pointerPath).replaceAll("\\", "/"), sha256: pointerEvidence.sha256, bytes: pointerEvidence.bytes },
    { kind: "current-manifest", path: path.relative(APP_ROOT, manifestPath).replaceAll("\\", "/"), sha256: manifestEvidence.sha256, bytes: manifestEvidence.bytes },
  );
  const planSeed = JSON.stringify({ sourceId: NY_BUSINESS_REGISTRY_REFRESH_SOURCE_ID, evidence, retainedReleaseId: manifest.release_id, assessmentId: assessment.assessment_id });
  return Object.freeze({
    sourceId: NY_BUSINESS_REGISTRY_REFRESH_SOURCE_ID,
    label: "New York business registry refresh",
    readinessStatus: "HOLD",
    dispatchAvailable: false,
    freshAcquisitionAuthorized: false,
    autonomousAcquisitionAuthorized: false,
    productionPointerChangeAuthorized: false,
    retainedRelease: {
      releaseId: manifest.release_id,
      sourceReleaseId: manifest.source_release_id,
      sourceRowsUpdatedAt: manifest.source_rows_updated_at,
      sourceActiveExtractRecords: coverage.source_active_extract_records,
      organizationsPublished: coverage.organizations_published,
      quarantinedSourceRecords: coverage.quarantined_source_records,
      artifactCount: artifacts.length,
    },
    observedAssessment: {
      assessmentId: assessment.assessment_id,
      observedAt: assessment.observed_at,
      decision: assessment.decision,
      retainedReleaseId: assessment.source.retained_release_id,
      catalogRetainedReleaseMatchesAssessment: dataset.current_verified_release?.release_id === assessment.source.retained_release_id,
      currentRetainedReleaseMatchesAssessment: manifest.release_id === assessment.source.retained_release_id,
    },
    plan: {
      planId: `ny-refresh-plan-${sha256(planSeed).slice(0, 20)}`,
      sourceId: NY_BUSINESS_REGISTRY_REFRESH_SOURCE_ID,
      mode: "governed-full-snapshot-refresh",
      status: "HOLD",
      allocationCount: 0,
      networkRequestCount: 0,
      operationCreated: false,
      steps: ["revalidate fixed policy and connector", "verify retained complete selected-field snapshot", "compare a future monthly snapshot without interpreting absence as current operation", "require separate acquisition and pointer-change authorization"],
      unresolvedGates: [...assessment.unresolved_gates],
      evidence,
    },
    nextAction: assessment.strongest_next_action,
  });
}
