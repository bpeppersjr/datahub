import { createHash } from "node:crypto";
import { validateOhChildcarePreflight } from "./oh-childcare-preflight.mjs";
import policy from "../config/source-policies/oh-childcare-internal-acquisition.json" with { type: "json" };
import decision from "../docs/states/OH-CHILDCARE-USE-DECISION-2026-09-08.json" with { type: "json" };

const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const utf8Hash = (v) => createHash("sha256").update(v).digest("hex");
const POLICY_HASH = "960a78cc81c6e11783e6b670dbb89e83dd935d4b5c82daabd618c77b12532bfa";
const DECISION_HASH = "501d51672889a8daac1a99b864f445398a4d866f1d7852576f656cdabb36d225";
const exact = (v, names) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k));
const time = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const check = (v, reason) => { if (!v) throw new Error(`Ohio source-use binding rejected: ${reason}.`); };

export function assertOhChildcareSourceUseConfiguration() {
  check(hash(policy) === POLICY_HASH && hash(decision) === DECISION_HASH, "versioned policy or decision drift");
}

/** Binds supplied current prerequisite evidence to a scoped decision. Not a request,
 * publisher authentication, legal approval, or an app dispatch permission token.
 */
export function bindOhChildcareSourceUse(preflight, availability, options = {}) {
  check(exact(options, ["checkedAt"]) && time(options.checkedAt), "explicit canonical check time");
  assertOhChildcareSourceUseConfiguration();
  validateOhChildcarePreflight(preflight);
  const { checkedAt } = options, now = Date.parse(checkedAt);
  check(checkedAt >= decision.decided_at, "check precedes decision");
  const fresh = (at) => time(at) && Date.parse(at) <= now && now - Date.parse(at) <= policy.runtime_requirements.maximum_prerequisite_age_ms;
  check(fresh(preflight.started_at) && fresh(preflight.finished_at), "fresh preflight required");
  for (const item of preflight.observations.filter((o) => o.kind === "item")) {
    for (const field of ["licenseInfo", "description"]) check(utf8Hash(item.payload[field]) === policy.notice_fingerprints[`item_${field}_utf8_sha256`], "current complete item notices changed; review required");
  }
  check(Array.isArray(availability) && availability.length === decision.availability_observations.length, "complete availability roster");
  let prior = null;
  for (const [index, observation] of availability.entries()) {
    const expected = decision.availability_observations[index];
    check(exact(observation, ["url", "observed_at", "http_status", "bytes", "sha256"]) && fresh(observation.observed_at)
      && (prior === null || observation.observed_at >= prior), "fresh ordered availability evidence");
    check(["url", "http_status", "bytes", "sha256"].every((key) => observation[key] === expected[key]), "linked/XML response changed or became available; review required");
    prior = observation.observed_at;
  }
  return {
    schema_version: "1.0.0", binding_version: "oh-childcare-source-use@1.0.0", checked_at: checkedAt,
    policy_id: policy.policy_id, policy_version: policy.version, policy_sha256: POLICY_HASH,
    decision_id: decision.decision_id, decision_sha256: DECISION_HASH, preflight_sha256: hash(preflight),
    availability_sha256: hash(availability), availability_observations: structuredClone(availability),
    source_use_status: "conditional-internal-acquisition", source_use_authorized: true,
    dispatch_authorized: false, app_job_enrolled: false, agreement_acceptance_performed: false,
    legal_approval: false, export_authorized: false, source_authenticity_verified: false,
    limitations: "Supplied-evidence binding only. App enrollment, persisted operation receipt and live before-row invocation remain required. Known notice availability gaps are unresolved, not assumed absent terms.",
  };
}
