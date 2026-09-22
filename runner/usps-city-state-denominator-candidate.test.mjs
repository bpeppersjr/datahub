import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { link, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { admitCityStateProjection } from "./usps-city-state-admission.mjs";
import { APP_ROOT } from "./paths.mjs";
import { buildCityStateDenominatorCandidate, verifyCityStateDenominatorCandidate } from "./usps-city-state-denominator-candidate.mjs";

const classes = Object.fromEntries(["standard", "po-box", "unique", "military"].map((key) => [key, { disposition: "included" }]));
const rows = [
  { zip5: "00501", zip_class: "unique", status: "active" },
  { zip5: "09012", zip_class: "military", status: "active" },
  { zip5: "12345", zip_class: "standard", status: "active" },
  { zip5: "60688", zip_class: "po-box", status: "active" },
  { zip5: "99998", zip_class: "standard", status: "retired" },
];
const sourceBody = `${rows.map(JSON.stringify).join("\n")}\n`;
const mapping = {
  semantics_reference: "CITY-STATE-SEMANTICS-2026-09",
  statuses: {
    active: { disposition: "included", meaning: "Source identifies this ZIP5 as an active operational code.", reason: "Included by the reviewed candidate operational-code rule." },
    retired: { disposition: "excluded", meaning: "Source identifies this ZIP5 as retired or no longer active.", reason: "Excluded because the candidate retains only explicitly included statuses." },
  },
};

async function setup(t) {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/city-state-denominator-candidate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, "city-state.jsonl");
  const mappingPath = path.join(root, "status-mapping.json");
  const admissionRoot = path.join(root, "admission");
  const outputRoot = path.join(root, "candidate");
  await writeFile(input, sourceBody);
  await writeFile(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`);
  const sourceSha = createHash("sha256").update(sourceBody).digest("hex");
  const admission = await admitCityStateProjection({ inputPath: input, outputRoot: admissionRoot, sourceMonth: "2026-09", sourceVersion: "CITYSTATE-2026-09", expectedSha256: sourceSha, expectedBytes: Buffer.byteLength(sourceBody), permissionReference: "CITYSTATE-LICENSE-REF-001", zipClassDeclaration: classes, now: () => new Date("2026-09-22T12:00:00Z") });
  return { root, input, inputPath: input, mappingPath, statusMappingPath: mappingPath, outputRoot, admissionManifestPath: admission.manifestPath };
}

test("builds and independently verifies a complete four-class local candidate", async (t) => {
  const fixture = await setup(t);
  const result = await buildCityStateDenominatorCandidate({ ...fixture, sourceProfilePath: path.join(APP_ROOT, "config/source-profiles/usps-city-state-operational-denominator.json"), now: () => new Date("2026-09-22T12:01:00Z") });
  const verified = await verifyCityStateDenominatorCandidate(result.manifestPath, fixture);
  assert.equal(verified.candidate_conservation.row_count, 4);
  assert.deepEqual(verified.candidate_conservation.counts_by_class, { military: 1, "po-box": 1, standard: 1, unique: 1 });
  assert.deepEqual(verified.candidate_conservation.excluded_by_status, { retired: 1 });
  assert.deepEqual((await readdir(result.releaseDirectory)).sort(), ["manifest.json", "receipt.json", "zip5-operational-denominator.jsonl"]);
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.equal(manifest.current_pointer_written, false);
  assert.equal(manifest.production_admitted, false);
  assert.equal(manifest.semantics.not_area_or_district, true);
  assert.equal(manifest.semantics.zip4, "separate-not-present");
  assert.equal(manifest.semantics.zcta, "separate-not-present");
  const firstRow = JSON.parse((await readFile(path.join(result.releaseDirectory, "zip5-operational-denominator.jsonl"), "utf8")).split("\n")[0]);
  assert.deepEqual(Object.keys(firstRow).sort(), ["assignment_status", "created_at", "deliverability_status", "evidence_scope", "export_policy", "observed_at", "postal_code", "provenance", "schema_version", "source_month", "source_status", "source_version", "zip4", "zip_class", "zip_code", "zcta_status"].sort());
  assert.equal(firstRow.zip_code, firstRow.postal_code);
  assert.equal(firstRow.zip4, null);
  assert.equal(firstRow.assignment_status, "usps-city-state-included");
  assert.equal(firstRow.evidence_scope, "usps-city-state-source-reported-zip5-assignment");
  assert.equal(firstRow.deliverability_status, "not-asserted");
  assert.equal(firstRow.zcta_status, "not-asserted");
  assert.equal(firstRow.provenance.status_mapping_semantics_reference, mapping.semantics_reference);
});

test("requires an explicit meaning and reason for every observed status", async (t) => {
  const fixture = await setup(t);
  const incomplete = { ...mapping, statuses: { active: { disposition: "included", meaning: "missing reason" } } };
  await writeFile(fixture.mappingPath, `${JSON.stringify(incomplete)}\n`);
  await assert.rejects(buildCityStateDenominatorCandidate(fixture), /requires a non-secret meaning and reason/);
});

test("rejects a status map with an unobserved status and a source with an unmapped status", async (t) => {
  const fixture = await setup(t);
  const extra = structuredClone(mapping);
  extra.statuses.pending = { disposition: "excluded", meaning: "Source has not classified this code.", reason: "Excluded until source semantics are reviewed." };
  await writeFile(fixture.mappingPath, `${JSON.stringify(extra)}\n`);
  await assert.rejects(buildCityStateDenominatorCandidate(fixture), /unobserved status/);
  await writeFile(fixture.mappingPath, `${JSON.stringify({ ...mapping, statuses: { active: mapping.statuses.active } })}\n`);
  await assert.rejects(buildCityStateDenominatorCandidate(fixture), /Every observed source status/);
});

test("replays the exact source and fails closed on source or candidate tampering", async (t) => {
  const fixture = await setup(t);
  const result = await buildCityStateDenominatorCandidate(fixture);
  await writeFile(fixture.input, `${sourceBody} `);
  await assert.rejects(verifyCityStateDenominatorCandidate(result.manifestPath, fixture), /exactly match/);
  await writeFile(fixture.input, sourceBody);
  const artifact = path.join(result.releaseDirectory, "zip5-operational-denominator.jsonl");
  await writeFile(artifact, (await readFile(artifact, "utf8")).replace("00501", "00502"));
  await assert.rejects(verifyCityStateDenominatorCandidate(result.manifestPath, fixture), /artifact size or SHA-256|artifact rows/);
});

test("cancellation and manifest-last tamper produce no completed candidate", async (t) => {
  const fixture = await setup(t);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(buildCityStateDenominatorCandidate({ ...fixture, signal: cancelled.signal }), /cancelled/);
  const tamperOutput = path.join(fixture.root, "tamper-output");
  await assert.rejects(buildCityStateDenominatorCandidate({ ...fixture, outputRoot: tamperOutput, beforeManifest: async ({ staging }) => writeFile(path.join(staging, "zip5-operational-denominator.jsonl"), "tampered\n") }), /changed before manifest/);
  assert.deepEqual(await readdir(path.join(tamperOutput, "releases")), []);
});

test("requires every admission ZIP class and rejects linked inputs", async (t) => {
  const fixture = await setup(t);
  const linkedInput = path.join(fixture.root, "linked-city-state.jsonl");
  await link(fixture.input, linkedInput);
  await assert.rejects(buildCityStateDenominatorCandidate({ ...fixture, inputPath: linkedInput }), /non-linked/);
  const admissionManifest = JSON.parse(await readFile(fixture.admissionManifestPath, "utf8"));
  admissionManifest.zip_class_declaration.military = { disposition: "excluded", reason: "Not included in this synthetic admission." };
  await writeFile(fixture.admissionManifestPath, JSON.stringify(admissionManifest));
  await assert.rejects(buildCityStateDenominatorCandidate(fixture), /Receipt size or SHA-256 mismatch|Receipt and manifest disagree|Complete candidate requires admission class/);
});

test("restricts output roots to data and rejects the worktrees boundary", async (t) => {
  const fixture = await setup(t);
  await assert.rejects(buildCityStateDenominatorCandidate({ ...fixture, outputRoot: path.join(APP_ROOT, "runner", "candidate-output") }), /beneath the data folder/);
  await assert.rejects(buildCityStateDenominatorCandidate({ ...fixture, outputRoot: path.join(APP_ROOT, "data", "worktrees", "candidate-output") }), /data\/worktrees/);
});

test("rejects drift in a pinned static config dependency", async (t) => {
  const fixture = await setup(t);
  const result = await buildCityStateDenominatorCandidate(fixture);
  const datasetPath = path.join(APP_ROOT, "config/datasets/usps-city-state-operational-denominator-candidate.json");
  const original = await readFile(datasetPath);
  t.after(() => writeFile(datasetPath, original));
  await writeFile(datasetPath, Buffer.from(original.toString().replace('"label": "USPS City State operational-denominator candidate"', '"label": "DRIFTED City State candidate"')));
  await assert.rejects(verifyCityStateDenominatorCandidate(result.manifestPath, fixture), /config dependency dataset drifted/);
});

test("both CLIs reject unknown, repeated, missing, and odd arguments", () => {
  const buildScript = path.join(APP_ROOT, "scripts/build-usps-city-state-denominator-candidate.mjs");
  const verifyScript = path.join(APP_ROOT, "scripts/verify-usps-city-state-denominator-candidate.mjs");
  const unknownBuild = spawnSync(process.execPath, [buildScript, "--unknown", "value"], { cwd: APP_ROOT, encoding: "utf8" });
  assert.notEqual(unknownBuild.status, 0);
  assert.match(unknownBuild.stderr, /Unknown or misplaced/);
  const oddBuild = spawnSync(process.execPath, [buildScript, "--input"], { cwd: APP_ROOT, encoding: "utf8" });
  assert.notEqual(oddBuild.status, 0);
  assert.match(oddBuild.stderr, /requires one value/);
  const repeatedBuild = spawnSync(process.execPath, [buildScript, "--input", "a", "--input", "b"], { cwd: APP_ROOT, encoding: "utf8" });
  assert.notEqual(repeatedBuild.status, 0);
  assert.match(repeatedBuild.stderr, /more than once/);
  const unknownVerify = spawnSync(process.execPath, [verifyScript, "manifest.json", "--unknown", "value"], { cwd: APP_ROOT, encoding: "utf8" });
  assert.notEqual(unknownVerify.status, 0);
  assert.match(unknownVerify.stderr, /Unknown or misplaced/);
  const oddVerify = spawnSync(process.execPath, [verifyScript, "manifest.json", "--input"], { cwd: APP_ROOT, encoding: "utf8" });
  assert.notEqual(oddVerify.status, 0);
  assert.match(oddVerify.stderr, /requires one value/);
});
