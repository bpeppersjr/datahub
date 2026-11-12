import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const MIDWEST_SOURCE_ASSESSMENT_WAVE_SCHEMA = "state-business-source-assessment-wave@1.0.0";
export const MIDWEST_SOURCE_ASSESSMENT_WAVE_ID = "state-business-source-assessment-wave-midwest-il-in-mi-oh-2026-11-12";
export const MIDWEST_SOURCE_ASSESSMENT_STATES = Object.freeze(["IL", "IN", "MI", "OH"]);
const DEFAULT_WAVE = path.join(APP_ROOT, "config", "state-business-source-assessment-waves", "midwest-il-in-mi-oh-2026-11-12.json");
const SHA256 = /^[0-9a-f]{64}$/;
const expectedAssessmentHashes = Object.freeze({
  IL: "58905b77a08494fd381654805bff0e70f73d08307355ef3b61ab94ef1264f323",
  IN: "985bee2a6e3c1e46b01451c038f5336d1404d333c381f0b85d5148b73e9a99f7",
  MI: "23283f4c51633ec22abf1a08f64c066166dc4bfcbba9520874eeca6ce7273d02",
  OH: "cc5ed09ade4e0a2fd43ad2eda2b0ce08d39de6c5a2ee26ee2426dfd79dc65c24",
});
const fail = (message) => { throw new Error(`Midwest business-source assessment wave rejected: ${message}`); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expectedControl = Object.freeze({
  source_assessments_reused: 4,
  network_requests: 0,
  downloads: 0,
  contacts_made: 0,
  fees_paid: 0,
  operations_started: 0,
  production_changes: 0,
  acquisition_authorized: false,
  source_action_authorized: false,
  production_pointer_change_authorized: false,
  broad_layer_admitted: false,
});
const expectedOutcomes = Object.freeze({
  IL: "offline-connector-retained-package-and-rights-unresolved",
  IN: "account-gated-paid-bulk-contract-unresolved",
  MI: "written-scope-and-contract-required",
  OH: "paid-ftp-contract-and-schema-unresolved",
});

async function safeFile(candidate, label) {
  const root = await realpath(APP_ROOT);
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(`${label} must stay inside APP_ROOT`);
  const stat = await lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 5_000_000) fail(`${label} is not a bounded singly linked regular file`);
  const before = { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs };
  const bytes = await readFile(resolved);
  const after = await lstat(resolved);
  if (Object.entries(before).some(([key, value]) => after[key] !== value)) fail(`${label} changed while read`);
  return { bytes, resolved };
}

export function validateMidwestBusinessSourceAssessmentWave(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail("wave must be an object");
  if (value.schema_version !== MIDWEST_SOURCE_ASSESSMENT_WAVE_SCHEMA || value.wave_id !== MIDWEST_SOURCE_ASSESSMENT_WAVE_ID || value.created_at !== "2026-11-12T19:00:00.000Z") fail("identity drifted");
  if (JSON.stringify(value.states) !== JSON.stringify(MIDWEST_SOURCE_ASSESSMENT_STATES)) fail("state roster or order drifted");
  if (!Array.isArray(value.source_assessments) || value.source_assessments.length !== 4) fail("assessment roster is incomplete");
  for (const [index, row] of value.source_assessments.entries()) {
    const state = MIDWEST_SOURCE_ASSESSMENT_STATES[index], slug = state.toLowerCase();
    if (row?.state !== state || row.assessment_id !== `${slug}-business-source-reassessment-2026-10-03` || row.path !== `config/state-business-source-assessments/${slug}-2026-10-03.json` || row.file_sha256 !== expectedAssessmentHashes[state] || !SHA256.test(row.file_sha256)) fail(`assessment binding drifted for ${state}`);
  }
  const gap = value.national_gap_binding;
  if (gap?.federation_release_id !== "national-goal-evidence-federation-7759bbfd3679a96e78886f91b94f1a64bdda297dd8c329c05df5b1970c030d7b" || gap.federation_manifest_sha256 !== "f386b18be2bb9a9325f141a27a6b0183dba638d84aa5df6feb5be22d19f370ae" || !SHA256.test(gap.gap_ledger_sha256) || gap.required_gap_status !== "missing-retained-broad-organization-layer") fail("national gap binding drifted");
  if (JSON.stringify(value.controls) !== JSON.stringify(expectedControl)) fail("authority boundary drifted");
  if (JSON.stringify(value.outcomes) !== JSON.stringify(expectedOutcomes)) fail("outcomes drifted");
  return structuredClone(value);
}

export async function loadMidwestBusinessSourceAssessmentWave(file = DEFAULT_WAVE) {
  const waveRead = await safeFile(file, "wave");
  const wave = validateMidwestBusinessSourceAssessmentWave(JSON.parse(waveRead.bytes));
  for (const row of wave.source_assessments) {
    const source = await safeFile(path.join(APP_ROOT, row.path), `${row.state} assessment`);
    if (sha256(source.bytes) !== row.file_sha256) fail(`${row.state} assessment file checksum drifted`);
    const assessment = JSON.parse(source.bytes);
    if (assessment.assessment_id !== row.assessment_id || assessment.state?.abbreviation !== row.state || assessment.decision !== "hold" || assessment.connector_candidate !== false || !Object.values(assessment.authority ?? {}).every((flag) => flag === false)) fail(`${row.state} assessment widened authority or changed identity`);
  }
  const gapRead = await safeFile(path.join(APP_ROOT, wave.national_gap_binding.gap_ledger_path), "gap ledger");
  if (sha256(gapRead.bytes) !== wave.national_gap_binding.gap_ledger_sha256) fail("gap ledger checksum drifted");
  const ledger = JSON.parse(gapRead.bytes);
  const gaps = new Map((ledger.broad_business ?? []).map((row) => [row.state, row]));
  for (const state of MIDWEST_SOURCE_ASSESSMENT_STATES) {
    const gap = gaps.get(state);
    if (gap?.status !== wave.national_gap_binding.required_gap_status || gap.authority_evidence?.acquisition_authorized !== false || gap.authority_evidence?.production_pointer_change_authorized !== false) fail(`${state} is no longer the bound non-authorized broad-layer gap`);
  }
  return wave;
}
