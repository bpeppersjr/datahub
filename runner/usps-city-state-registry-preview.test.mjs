import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { admitCityStateProjection } from "./usps-city-state-admission.mjs";
import { buildCityStateDenominatorCandidate } from "./usps-city-state-denominator-candidate.mjs";
import { previewUspsCityStateCandidate } from "./usps-city-state-registry-preview.mjs";
import { APP_ROOT } from "./paths.mjs";

const classes = Object.fromEntries(["standard", "po-box", "unique", "military"].map((key) => [key, { disposition: "included" }]));
const inputRows = [
  { zip5: "00100", zip_class: "standard", status: "active" },
  { zip5: "10000", zip_class: "po-box", status: "active" },
  { zip5: "20000", zip_class: "unique", status: "active" },
  { zip5: "99999", zip_class: "military", status: "active" },
];
const inputBody = `${inputRows.map((row) => JSON.stringify(row)).join("\n")}\n`;
const mapping = {
  semantics_reference: "CITY-STATE-PREVIEW-2026-09",
  statuses: {
    active: { disposition: "included", meaning: "Source identifies an included candidate operational code.", reason: "The reviewed synthetic mapping admits this observed status." },
  },
};

async function setup(t) {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/usps-city-state-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "city-state.jsonl");
  const statusMappingPath = path.join(root, "mapping.json");
  await writeFile(inputPath, inputBody);
  await writeFile(statusMappingPath, `${JSON.stringify(mapping)}\n`);
  const sha = createHash("sha256").update(inputBody).digest("hex");
  const admission = await admitCityStateProjection({
    inputPath,
    outputRoot: path.join(root, "admission"),
    sourceMonth: "2026-09",
    sourceVersion: "CITYSTATE-PREVIEW-2026-09",
    expectedSha256: sha,
    expectedBytes: Buffer.byteLength(inputBody),
    permissionReference: "CITYSTATE-PREVIEW-LICENSE-001",
    zipClassDeclaration: classes,
    now: () => new Date("2026-09-22T12:00:00Z"),
  });
  const candidate = await buildCityStateDenominatorCandidate({
    admissionManifestPath: admission.manifestPath,
    inputPath,
    statusMappingPath,
    outputRoot: path.join(root, "candidate"),
    now: () => new Date("2026-09-22T12:01:00Z"),
  });
  return { root, inputPath, statusMappingPath, admissionManifestPath: admission.manifestPath, candidateManifestPath: candidate.manifestPath };
}

test("previews leading-zero City State rows with explicit absence semantics and no writes", async (t) => {
  const fixture = await setup(t);
  const preview = await previewUspsCityStateCandidate({
    ...fixture,
    zip5Universe: ["00100", "00001", "10000", "20000", "99999"],
    limit: 20,
  });
  assert.equal(preview.read_only, true);
  assert.equal(preview.writes_performed, 0);
  assert.equal(preview.production_admitted, false);
  assert.equal(preview.current_pointer_written, false);
  assert.equal(preview.candidate.universe_listed_row_count, 4);
  assert.equal(preview.candidate.universe_not_listed_row_count, 1);
  assert.deepEqual(preview.candidate.candidate_conservation.counts_by_class, { military: 1, "po-box": 1, standard: 1, unique: 1 });
  const leading = preview.rows.find((row) => row.zip5 === "00100");
  assert.equal(leading.membership_status, "listed-in-reviewed-usps-city-state-operational-candidate");
  assert.equal(leading.zip4, null);
  assert.equal(leading.zip_class, "standard");
  assert.equal(leading.source_month, "2026-09");
  assert.equal(leading.assignment_status, "usps-city-state-included");
  assert.equal(leading.observed_at, "2026-09-22T12:00:00.000Z");
  assert.equal(leading.created_at, "2026-09-22T12:01:00.000Z");
  assert.equal(leading.export_policy, "local-restricted");
  const absent = preview.rows.find((row) => row.zip5 === "00001");
  assert.equal(absent.membership_status, "not-listed-in-reviewed-usps-city-state-operational-candidate");
  assert.equal(absent.source_status, null);
  assert.match(preview.candidate.universe.absence_meaning, /selected-candidate-only/);
});

test("reads an in-root ZIP universe and preserves candidate files without mutation", async (t) => {
  const fixture = await setup(t);
  const universePath = path.join(fixture.root, "zip-universe.json");
  await writeFile(universePath, `${JSON.stringify(["00100", "00001", "99999"])}\n`);
  const manifestBefore = await readFile(fixture.candidateManifestPath);
  const artifactPath = path.join(path.dirname(fixture.candidateManifestPath), "zip5-operational-denominator.jsonl");
  const artifactBefore = await readFile(artifactPath);
  const preview = await previewUspsCityStateCandidate({ ...fixture, zip5UniversePath: universePath, limit: 10 });
  assert.equal(preview.candidate.universe.zip5_count, 3);
  assert.equal(preview.candidate.universe_listed_row_count, 2);
  assert.equal(preview.candidate.universe_not_listed_row_count, 1);
  assert.deepEqual(await readFile(fixture.candidateManifestPath), manifestBefore);
  assert.deepEqual(await readFile(artifactPath), artifactBefore);
});

test("filters and paginates the bounded preview without changing candidate conservation", async (t) => {
  const fixture = await setup(t);
  const preview = await previewUspsCityStateCandidate({ ...fixture, zipClass: "military", offset: 0, limit: 1 });
  assert.equal(preview.pagination.total, 1);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].zip5, "99999");
  assert.equal(preview.rows[0].source_status, "active");
  assert.equal(preview.candidate.candidate_conservation.row_count, 4);
});

test("fails closed when explicit replay input drifts", async (t) => {
  const fixture = await setup(t);
  const original = await readFile(fixture.statusMappingPath, "utf8");
  await writeFile(fixture.statusMappingPath, original.replace("CITY-STATE-PREVIEW-2026-09", "DRIFTED-MAPPING"));
  await assert.rejects(() => previewUspsCityStateCandidate(fixture), /exactly match|replay|candidate/i);
});

test("rejects unsafe filters, pagination, universe size, and paths", async (t) => {
  const fixture = await setup(t);
  await assert.rejects(() => previewUspsCityStateCandidate({ ...fixture, zipPrefix: "12x" }), /zipPrefix/);
  await assert.rejects(() => previewUspsCityStateCandidate({ ...fixture, zipClass: "deliverable" }), /zipClass/);
  await assert.rejects(() => previewUspsCityStateCandidate({ ...fixture, membershipStatus: "operational" }), /membershipStatus/);
  await assert.rejects(() => previewUspsCityStateCandidate({ ...fixture, offset: "1.5" }), /offset/);
  await assert.rejects(() => previewUspsCityStateCandidate({ ...fixture, limit: "0" }), /limit/);
  await assert.rejects(() => previewUspsCityStateCandidate({ ...fixture, zip5Universe: new Array(100_001).fill("00100") }), /at most/);
  await assert.rejects(() => previewUspsCityStateCandidate({ ...fixture, zip5UniversePath: path.resolve(APP_ROOT, "..", "outside-preview.json") }), /inside app|path/i);
});
