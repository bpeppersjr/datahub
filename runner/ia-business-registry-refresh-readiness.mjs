import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const IA_BUSINESS_REGISTRY_REFRESH_SOURCE_ID = "ia-business-registry";

const inputs = Object.freeze({
  policy: "config/source-policies/ia-business-registry.json",
  connector: "config/connectors/ia-business-registry.json",
  dataset: "config/datasets/ia-business-registry-active-entities.json",
  assessment: "config/state-business-source-existing-assessments/ia-2026-09-22.json",
});

const sha256 = value => createHash("sha256").update(value).digest("hex");
const plainObject = value => value && typeof value === "object" && !Array.isArray(value);

async function governedJson(relative) {
  const bytes = await readFile(path.join(APP_ROOT, relative));
  const value = JSON.parse(bytes.toString("utf8"));
  if (!plainObject(value)) throw new Error(`Governed Iowa input is invalid: ${relative}.`);
  return { value, sha256: sha256(bytes), bytes: bytes.length };
}

export async function getIaBusinessRegistryRefreshReadiness() {
  const [policyEvidence, connectorEvidence, datasetEvidence, assessmentEvidence] = await Promise.all(Object.values(inputs).map(governedJson));
  const policy = policyEvidence.value;
  const connector = connectorEvidence.value;
  const dataset = datasetEvidence.value;
  const assessment = assessmentEvidence.value;
  if (policy.policy_id !== IA_BUSINESS_REGISTRY_REFRESH_SOURCE_ID
    || connector.connector_id !== IA_BUSINESS_REGISTRY_REFRESH_SOURCE_ID
    || connector.source_policy !== inputs.policy
    || dataset.dataset_id !== "ia-business-registry-active-entities"
    || dataset.connector !== inputs.connector
    || dataset.source_policy !== inputs.policy
    || assessment.assessment_id !== "ia-existing-governed-source-2026-09-22"
    || assessment.state?.abbreviation !== "IA"
    || assessment.source?.dataset_id !== "554") throw new Error("Governed Iowa refresh inputs do not match the fixed source contract.");

  const authorization = assessment.authorization;
  const held = plainObject(authorization)
    && authorization.fresh_acquisition_authorized === false
    && authorization.autonomous_acquisition_authorized === false
    && authorization.production_pointer_change_authorized === false;
  if (!held) throw new Error("Governed Iowa assessment no longer contains the reviewed acquisition HOLD.");
  const retained = dataset.current_verified_release;
  if (!plainObject(retained) || typeof retained.release_id !== "string" || typeof assessment.source.retained_release_id !== "string") throw new Error("Governed Iowa retained-release evidence is incomplete.");

  const evidence = Object.entries(inputs).map(([kind, relative], index) => {
    const item = [policyEvidence, connectorEvidence, datasetEvidence, assessmentEvidence][index];
    return { kind, path: relative, sha256: item.sha256, bytes: item.bytes };
  });
  const planSeed = JSON.stringify({ sourceId: IA_BUSINESS_REGISTRY_REFRESH_SOURCE_ID, evidence, retainedReleaseId: retained.release_id, assessmentId: assessment.assessment_id });
  return Object.freeze({
    sourceId: IA_BUSINESS_REGISTRY_REFRESH_SOURCE_ID,
    label: "Iowa business registry refresh",
    readinessStatus: "HOLD",
    dispatchAvailable: false,
    freshAcquisitionAuthorized: false,
    autonomousAcquisitionAuthorized: false,
    productionPointerChangeAuthorized: false,
    retainedRelease: {
      releaseId: retained.release_id,
      sourceReleaseId: retained.source_release_id,
      sourceModifiedAt: retained.source_modified_at,
      sourceRows: retained.source_rows,
      activeEntitiesPublished: retained.active_entities_published,
    },
    observedAssessment: { assessmentId: assessment.assessment_id, observedAt: assessment.observed_at, decision: assessment.decision, retainedReleaseId: assessment.source.retained_release_id, catalogRetainedReleaseMatchesAssessment: retained.release_id === assessment.source.retained_release_id },
    plan: {
      planId: `ia-refresh-plan-${sha256(planSeed).slice(0, 20)}`,
      sourceId: IA_BUSINESS_REGISTRY_REFRESH_SOURCE_ID,
      mode: "governed-full-snapshot-refresh",
      status: "HOLD",
      allocationCount: 0,
      networkRequestCount: 0,
      operationCreated: false,
      steps: ["revalidate fixed policy and connector", "compare a future full snapshot without interpreting row loss as closure", "reconcile replacement and deletion evidence", "require separate acquisition and pointer-change authorization"],
      unresolvedGates: [...assessment.unresolved_gates],
      evidence,
    },
    nextAction: assessment.strongest_next_action,
  });
}
