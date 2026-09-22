import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { ASSESSMENT_STATES, validateStateBusinessSourceValidationAssessment } from "./state-business-source-validation-wave.mjs";

async function fixture(state) { return JSON.parse(await readFile(path.join(APP_ROOT, "config", `state-business-source-${state.toLowerCase()}-2026-09-22.json`))); }

test("accepts five official-source, reporting-only assessments", async () => {
  for (const state of ASSESSMENT_STATES) assert.equal(validateStateBusinessSourceValidationAssessment(await fixture(state), state).decision, "hold");
});

test("rejects acquisition escalation, nonofficial evidence, and incomplete temporal semantics", async () => {
  const authority = await fixture("IL"); authority.authorizations.download = true;
  assert.throws(() => validateStateBusinessSourceValidationAssessment(authority, "IL"), /forbidden operation/);
  const source = await fixture("MS"); source.citations[0].url = "https://example.com";
  assert.throws(() => validateStateBusinessSourceValidationAssessment(source, "MS"), /not official/);
  const temporal = await fixture("HI"); temporal.temporal_refresh = "unknown";
  assert.throws(() => validateStateBusinessSourceValidationAssessment(temporal, "HI"), /temporal_refresh/);
  const crossed = await fixture("AR");
  assert.throws(() => validateStateBusinessSourceValidationAssessment(crossed, "NV"), /state identity/);
  const malformed = await fixture("MS"); malformed.access.mode = "api";
  assert.throws(() => validateStateBusinessSourceValidationAssessment(malformed, "MS"), /access assessment/);
});
