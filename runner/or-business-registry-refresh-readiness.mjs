import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const OR_BUSINESS_REGISTRY_REFRESH_SOURCE_ID = "or-business-registry";

const inputs = Object.freeze({
  policy: "config/source-policies/or-business-registry.json",
  connector: "config/connectors/or-business-registry.json",
  dataset: "config/datasets/or-business-registry-active-registrations.json",
  assessment: "config/state-business-source-existing-assessments/or-2026-09-22.json",
});

const sha256 = value => createHash("sha256").update(value).digest("hex");
const plainObject = value => value && typeof value === "object" && !Array.isArray(value);

async function boundedJson(file, maximum) {
  const resolved = path.resolve(file), info = await lstat(resolved, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n || info.size <= 0n || info.size > BigInt(maximum) || await realpath(resolved) !== resolved) throw new Error("Governed Oregon evidence file is unsafe.");
  const bytes = await readFile(resolved), after = await lstat(resolved, { bigint: true });
  if (bytes.length !== Number(info.size) || after.dev !== info.dev || after.ino !== info.ino || after.size !== info.size || after.mtimeNs !== info.mtimeNs || after.ctimeNs !== info.ctimeNs) throw new Error("Governed Oregon evidence changed while read.");
  const value = JSON.parse(bytes.toString("utf8"));
  if (!plainObject(value)) throw new Error("Governed Oregon evidence is invalid.");
  return { value, sha256: sha256(bytes), bytes: bytes.length };
}

async function governedJson(relative) { return boundedJson(path.join(APP_ROOT, relative), 1024 * 1024); }

export async function getOrBusinessRegistryRefreshReadiness() {
  const [policyEvidence, connectorEvidence, datasetEvidence, assessmentEvidence] = await Promise.all(Object.values(inputs).map(governedJson));
  const policy = policyEvidence.value, connector = connectorEvidence.value, dataset = datasetEvidence.value, assessment = assessmentEvidence.value;
  if (policy.policy_id !== OR_BUSINESS_REGISTRY_REFRESH_SOURCE_ID
    || connector.connector_id !== OR_BUSINESS_REGISTRY_REFRESH_SOURCE_ID
    || connector.source_policy !== inputs.policy
    || dataset.dataset_id !== "or-business-registry-active-registrations"
    || dataset.connector !== inputs.connector
    || dataset.source_policy !== inputs.policy
    || assessment.assessment_id !== "or-existing-governed-source-2026-09-22"
    || assessment.state?.abbreviation !== "OR"
    || assessment.source?.dataset_id !== "tckn-sxa6") throw new Error("Governed Oregon refresh inputs do not match the fixed source contract.");

  const authorization = assessment.authorization;
  const held = plainObject(authorization) && authorization.fresh_acquisition_authorized === false
    && authorization.autonomous_acquisition_authorized === false && authorization.production_pointer_change_authorized === false;
  if (!held) throw new Error("Governed Oregon assessment no longer contains the reviewed acquisition HOLD.");
  const configuredRetained = dataset.current_verified_release;
  if (!plainObject(configuredRetained) || typeof configuredRetained.release_id !== "string" || typeof assessment.source.retained_release_id !== "string") throw new Error("Governed Oregon retained-release evidence is incomplete.");
  const sourceRoot = path.join(APP_ROOT, "data/business-sources/or-business-registry-active-registrations"), pointerPath = path.join(sourceRoot, "current.json"), pointerEvidence = await boundedJson(pointerPath, 100000), pointer = pointerEvidence.value;
  if (pointer.dataset_id !== dataset.dataset_id || pointer.release_id !== assessment.source.retained_release_id || pointer.manifest !== `releases/${pointer.release_id}/manifest.json`) throw new Error("Governed Oregon current pointer does not match the assessed retained release.");
  const manifestPath = path.join(sourceRoot, ...pointer.manifest.split("/")), manifestEvidence = await boundedJson(manifestPath, 1024 * 1024), manifest = manifestEvidence.value, coverage = manifest.coverage;
  if (manifest.dataset_id !== dataset.dataset_id || manifest.release_id !== pointer.release_id || manifest.status !== "published"
    || manifest.complete_selected_active_registration_snapshot !== true || typeof manifest.source_release_id !== "string" || typeof manifest.source_rows_updated_at !== "string"
    || !plainObject(coverage) || !Number.isSafeInteger(coverage.source_principal_place_rows) || !Number.isSafeInteger(coverage.distinct_source_registrations)
    || !Number.isSafeInteger(coverage.active_registrations_published) || !Number.isSafeInteger(coverage.legal_entity_registrations)
    || !Number.isSafeInteger(coverage.assumed_business_name_registrations) || coverage.distinct_source_registrations !== coverage.active_registrations_published
    || coverage.legal_entity_registrations + coverage.assumed_business_name_registrations !== coverage.active_registrations_published) throw new Error("Governed Oregon current manifest does not match its pointer or source contract.");

  const evidence = Object.entries(inputs).map(([kind, relative], index) => {
    const item = [policyEvidence, connectorEvidence, datasetEvidence, assessmentEvidence][index];
    return { kind, path: relative, sha256: item.sha256, bytes: item.bytes };
  });
  evidence.push({ kind: "current-pointer", path: path.relative(APP_ROOT, pointerPath).replaceAll("\\", "/"), sha256: pointerEvidence.sha256, bytes: pointerEvidence.bytes }, { kind: "current-manifest", path: path.relative(APP_ROOT, manifestPath).replaceAll("\\", "/"), sha256: manifestEvidence.sha256, bytes: manifestEvidence.bytes });
  const planSeed = JSON.stringify({ sourceId: OR_BUSINESS_REGISTRY_REFRESH_SOURCE_ID, evidence, retainedReleaseId: manifest.release_id, assessmentId: assessment.assessment_id });
  return Object.freeze({
    sourceId: OR_BUSINESS_REGISTRY_REFRESH_SOURCE_ID, label: "Oregon business registry refresh", readinessStatus: "HOLD", dispatchAvailable: false,
    freshAcquisitionAuthorized: false, autonomousAcquisitionAuthorized: false, productionPointerChangeAuthorized: false,
    retainedRelease: { releaseId: manifest.release_id, sourceReleaseId: manifest.source_release_id, sourceRowsUpdatedAt: manifest.source_rows_updated_at, sourcePrincipalPlaceRows: coverage.source_principal_place_rows, activeRegistrationsPublished: coverage.active_registrations_published, legalEntityRegistrations: coverage.legal_entity_registrations, assumedBusinessNameRegistrations: coverage.assumed_business_name_registrations },
    observedAssessment: { assessmentId: assessment.assessment_id, observedAt: assessment.observed_at, decision: assessment.decision, retainedReleaseId: assessment.source.retained_release_id, catalogRetainedReleaseMatchesAssessment: configuredRetained.release_id === assessment.source.retained_release_id, currentRetainedReleaseMatchesAssessment: manifest.release_id === assessment.source.retained_release_id },
    plan: { planId: `or-refresh-plan-${sha256(planSeed).slice(0, 20)}`, sourceId: OR_BUSINESS_REGISTRY_REFRESH_SOURCE_ID, mode: "governed-full-snapshot-refresh", status: "HOLD", allocationCount: 0, networkRequestCount: 0, operationCreated: false, steps: ["revalidate fixed policy and connector", "run a governed transport and metadata preflight", "compare a future full snapshot without interpreting row loss as closure", "preserve legal-entity and assumed-name identity semantics", "require separate acquisition and pointer-change authorization"], unresolvedGates: [...assessment.unresolved_gates], evidence },
    nextAction: assessment.strongest_next_action,
  });
}
