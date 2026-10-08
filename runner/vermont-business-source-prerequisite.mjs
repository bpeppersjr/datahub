import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { loadOkNeVtMeBusinessSourceReassessment } from "./ok-ne-vt-me-business-source-reassessment.mjs";

export const VERMONT_DOCUMENT_PREREQUISITE_ID = "vt-business-source-document-prerequisite-2026-10-07";
const CONTENT_SHA256 = "259f7edbbe67097e2b4ec3eefd9ecdb033f330e45a9eb8d42371335cff19f6d6";
const FILE = path.join(APP_ROOT, "config/state-business-source-assessments/vt-2026-10-07.json");
const check = (condition, reason) => { if (!condition) throw new Error(`Vermont document prerequisite rejected: ${reason}`); };

// This pins a reviewed observation, not live source readiness. Changed facts need
// a new dated artifact; the loader performs only fixed local-file reads.
export function validateVermontBusinessSourcePrerequisite(value) {
  check(value?.schema_version === "state-business-source-prerequisite@1.0.0"
    && value.assessment_id === VERMONT_DOCUMENT_PREREQUISITE_ID
    && value.state?.abbreviation === "VT" && value.observed_at === "2026-10-07", "identity");
  check(value.decision === "hold" && value.connector_candidate === false, "HOLD boundary");
  check(value.authority && Object.values(value.authority).every(flag => flag === false), "authority boundary");
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === CONTENT_SHA256, "reviewed evidence digest");
  return structuredClone(value);
}

export async function loadVermontBusinessSourcePrerequisite() {
  const [value, predecessor] = await Promise.all([
    readFile(FILE, "utf8").then(JSON.parse),
    loadOkNeVtMeBusinessSourceReassessment("VT"),
  ]);
  const validated = validateVermontBusinessSourcePrerequisite(value);
  check(validated.supersedes_assessment_id === predecessor.assessment_id, "predecessor identity");
  return validated;
}
