import { readFile } from "node:fs/promises";

export const ASSESSMENT_SCHEMA_VERSION = "1.0.0";
export const ASSESSMENT_STATES = Object.freeze(["AR", "HI", "IL", "MS", "NV"]);
const ACCESS_MODES = new Set(["bulk-request", "paid-list-builder", "search-only"]);
const DECISIONS = new Set(["hold", "connector-candidate"]);

function fail(state, message) {
  throw new Error(`${state ?? "assessment"}: ${message}`);
}

export function validateStateBusinessSourceValidationAssessment(value, expectedState) {
  const state = value?.state_abbreviation;
  if (state !== expectedState || !ASSESSMENT_STATES.includes(state)) fail(state, "state identity drifted");
  if (value.schema_version !== ASSESSMENT_SCHEMA_VERSION) fail(state, "unsupported schema version");
  if (!new RegExp(`^state-business-source-${state.toLowerCase()}-20260922-v1$`).test(value.assessment_id ?? "")) fail(state, "assessment identity drifted");
  if (value.observed_at !== "2026-09-22") fail(state, "observation date drifted");
  if (!ACCESS_MODES.has(value.access.mode) || typeof value.access.api_available !== "boolean" || !value.access.automation || !value.access.fees) fail(state, "access assessment is incomplete");
  for (const key of ["fields", "active_status_semantics", "statewide_completeness", "address_and_zip", "redistribution", "temporal_refresh"]) {
    if (typeof value[key] !== "string" || value[key].length < 20) fail(state, `${key} assessment is incomplete`);
  }
  if (!DECISIONS.has(value.decision) || value.decision !== "hold") fail(state, "decision or authorization boundary drifted");
  if (value.authorizations?.download !== false || value.authorizations?.signup !== false || value.authorizations?.contact !== false || value.authorizations?.scraping !== false || value.authorizations?.production !== false) fail(state, "forbidden operation became authorized");
  if (!Array.isArray(value.unresolved_gates) || value.unresolved_gates.length < 3) fail(state, "unresolved gates are incomplete");
  if (!Array.isArray(value.citations) || value.citations.length < 2 || value.citations.some(({ url }) => !/^https:\/\/(?:[^/]+\.)?(?:arkansas\.gov|hawaii\.gov|ilsos\.gov|ms\.gov|nv\.gov|state\.nv\.us)(?:\/|$)/i.test(url ?? ""))) fail(state, "citations are missing or not official state sources");
  if (!value.next_action?.includes("Do not")) fail(state, "next action lacks explicit boundary");
  return value;
}

export async function loadStateBusinessSourceValidationAssessment(filePath, expectedState) {
  return validateStateBusinessSourceValidationAssessment(JSON.parse(await readFile(filePath, "utf8")), expectedState);
}
