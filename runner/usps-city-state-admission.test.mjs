import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { admitCityStateProjection, verifyCityStateAdmission } from "./usps-city-state-admission.mjs";

const rows = [
  { zip5: "00501", zip_class: "unique", status: "active" },
  { zip5: "09012", zip_class: "military", status: "active" },
  { zip5: "12345", zip_class: "standard", status: "active" },
  { zip5: "60688", zip_class: "po-box", status: "active" },
];
const declaration = Object.fromEntries(["standard", "po-box", "unique", "military"].map((key) => [key, { disposition: "included" }]));
const body = `${rows.map(JSON.stringify).join("\n")}\n`;
const hash = createHash("sha256").update(body).digest("hex");

async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "city-state-admission-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, "projection.jsonl");
  await writeFile(input, body);
  const options = { inputPath: input, outputRoot: path.join(root, "out"), sourceMonth: "2026-09", sourceVersion: "CITYSTATE-2026-09", expectedSha256: hash, expectedBytes: Buffer.byteLength(body), permissionReference: "AIS-LICENSE-REF-001", zipClassDeclaration: declaration, now: () => new Date("2026-09-22T12:00:00Z") };
  return { root, input, options };
}

test("admits one offline projection with exact class/status conservation and no pointer or licensed rows", async (t) => {
  const { options } = await setup(t);
  const result = await admitCityStateProjection(options);
  const verified = await verifyCityStateAdmission(result.manifestPath);
  assert.equal(verified.conservation.row_count, 4);
  assert.deepEqual(verified.conservation.counts_by_class, { military: 1, "po-box": 1, standard: 1, unique: 1 });
  const files = await import("node:fs/promises").then(({ readdir }) => readdir(result.directory));
  assert.deepEqual(files.sort(), ["manifest.json", "receipt.json"]);
  assert.equal(result.manifest.produces_current_pointer, false);
  assert.equal(result.manifest.semantics.zip4, "separate-not-present");
  assert.equal(result.manifest.semantics.zcta, "separate-not-present");
});

test("fails closed for hash, byte, class and duplicate tampering before writing", async (t) => {
  const { root, input, options } = await setup(t);
  await assert.rejects(admitCityStateProjection({ ...options, expectedSha256: "0".repeat(64) }), /does not match/);
  await assert.rejects(admitCityStateProjection({ ...options, expectedBytes: 1 }), /does not match/);
  const excluded = structuredClone(declaration); excluded.unique = { disposition: "excluded", reason: "Not covered by license." };
  await assert.rejects(admitCityStateProjection({ ...options, outputRoot: path.join(root, "excluded"), zipClassDeclaration: excluded }), /declared excluded/);
  const duplicateBody = `${body}${JSON.stringify(rows[0])}\n`;
  await writeFile(input, duplicateBody);
  await assert.rejects(admitCityStateProjection({ ...options, outputRoot: path.join(root, "duplicate"), expectedBytes: Buffer.byteLength(duplicateBody), expectedSha256: createHash("sha256").update(duplicateBody).digest("hex") }), /duplicate ZIP5/);
});

test("cancellation and immutable identity never overwrite an admission", async (t) => {
  const { root, options } = await setup(t);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(admitCityStateProjection({ ...options, outputRoot: path.join(root, "cancelled"), signal: controller.signal }), /cancelled/);
  const first = await admitCityStateProjection(options);
  const before = await readFile(first.manifestPath);
  await assert.rejects(admitCityStateProjection(options), /already exists/);
  assert.deepEqual(await readFile(first.manifestPath), before);
});

test("independent verification rejects receipt and manifest tampering", async (t) => {
  const { options } = await setup(t);
  const result = await admitCityStateProjection(options);
  const receiptPath = path.join(result.directory, "receipt.json");
  await writeFile(receiptPath, (await readFile(receiptPath, "utf8")).replace('"active": 4', '"active": 3'));
  await assert.rejects(verifyCityStateAdmission(result.manifestPath), /Receipt size or SHA-256 mismatch/);
});

test("rejects linked input paths and malformed source paths", async (t) => {
  const { root, input, options } = await setup(t);
  const linked = path.join(root, "linked.jsonl");
  await link(input, linked);
  await assert.rejects(admitCityStateProjection({ ...options, inputPath: linked }), /non-linked/);
  await assert.rejects(admitCityStateProjection({ ...options, inputPath: path.join(root, "missing.jsonl") }), /ENOENT/);
});
