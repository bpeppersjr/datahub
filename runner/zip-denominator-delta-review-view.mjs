import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { stableRead, verifyZipDenominatorDeltaReview } from "./zip-denominator-delta-review.mjs";

const CONFIG_SHA = "69ce28137897a33ec3452769ce145d6e79ffc3c010eae808c63918fdde7397ec";
const SCHEMA_SHA = "aac9dff9ef68c52e42bf27aaeec59f5b0fd8c9545d4b624d14c036e8ed4d2369";

export async function loadZipDenominatorDeltaReviewView({ root = APP_ROOT, verifier = verifyZipDenominatorDeltaReview } = {}) {
  const [configProof, schemaProof] = await Promise.all([
    stableRead(path.join(root, "config/datasets/zip-denominator-delta-review.json")),
    stableRead(path.join(root, "config/schemas/zip-denominator-delta-review.schema.json")),
  ]);
  if (configProof.sha256 !== CONFIG_SHA || schemaProof.sha256 !== SCHEMA_SHA) throw Error("unavailable");
  const config = JSON.parse(configProof.value), schema = JSON.parse(schemaProof.value);
  const keys = Object.keys(config).sort();
  if (keys.join(",") !== [...schema.required].sort().join(",") || schema.additionalProperties !== false ||
    !keys.every(key => schema.properties[key].type === "null" ? config[key] === null : config[key] === schema.properties[key].const)) throw Error("unavailable");

  const verified = await verifier(path.join(root, config.manifest_path), { root });
  if (verified.release_id !== config.release_id || verified.manifest_sha256 !== config.manifest_sha256 || verified.artifact_sha256 !== config.artifact_sha256) throw Error("unavailable");
  const artifact = verified.artifact;
  return {
    schema_version: "zip-denominator-delta-review-view@1.0.0",
    available: true,
    release: { release_id: verified.release_id, manifest_sha256: verified.manifest_sha256, artifact_sha256: verified.artifact_sha256, created_at: artifact.created_at },
    classification: artifact.classification,
    not_operational_usps_denominator: true,
    production: artifact.production,
    prior_candidate: artifact.prior_candidate,
    delta: artifact.delta,
    local_review_drilldown: artifact.local_review_drilldown,
    claims: artifact.claims,
    read_only: true,
  };
}
