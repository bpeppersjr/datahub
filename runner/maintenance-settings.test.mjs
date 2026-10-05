import assert from "node:assert/strict";
import { mkdtemp, mkdir, open, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createIndustryMaintenanceStore, validateMaintainedIndustries } from "./maintenance-settings.mjs";

const ids = ["childcare", "retail-consumer", "transportation"];
const configLoader = async () => ({ industries: Object.fromEntries(ids.map((id) => [id, []])) });
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-maintenance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return path.join(root, "data", "administration", "industry-maintenance.json");
}

test("selection rejects unknown, duplicate, case-invalid and malformed values", () => {
  assert.deepEqual(validateMaintainedIndustries(["transportation", "childcare"], ids), ["childcare", "transportation"]);
  assert.throws(() => validateMaintainedIndustries("childcare", ids), /must be an array/);
  assert.throws(() => validateMaintainedIndustries(["childcare", "childcare"], ids), /duplicates/);
  assert.throws(() => validateMaintainedIndustries(["Childcare"], ids), /case-invalid/);
  assert.throws(() => validateMaintainedIndustries(["unknown"], ids), /unsupported/);
});

test("dedicated store persists after restart and rejects stale, concurrent and extra-key writes", async (t) => {
  const file = await fixture(t), store = await createIndustryMaintenanceStore({ file, configLoader });
  assert.equal(store.view().revision, 0);
  const saved = await store.update({ maintainedIndustries: ["childcare"], expectedRevision: 0 }, 0);
  assert.equal(saved.revision, 1);
  const restarted = await createIndustryMaintenanceStore({ file, configLoader });
  assert.deepEqual(restarted.view().maintainedIndustries, ["childcare"]);
  await assert.rejects(restarted.update({ maintainedIndustries: [], expectedRevision: 0 }, 0), (error) => error.statusCode === 409);
  await assert.rejects(restarted.update({ maintainedIndustries: [], expectedRevision: 1, extra: true }, 1), /no extra fields/);
  const outcomes = await Promise.allSettled([
    restarted.update({ maintainedIndustries: ["transportation"], expectedRevision: 1 }, 1),
    restarted.update({ maintainedIndustries: ["retail-consumer"], expectedRevision: 1 }, 1),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(({ status }) => status === "rejected")[0].reason.statusCode, 409);
});

test("disk failure does not mutate memory and malformed retained state is isolated", async (t) => {
  const file = await fixture(t);
  const io = { mkdir, open, readFile, unlink, rename: async () => { throw new Error("disk failure"); } };
  const store = await createIndustryMaintenanceStore({ file, configLoader, io });
  await assert.rejects(store.update({ maintainedIndustries: ["childcare"], expectedRevision: 0 }, 0), /disk failure/);
  assert.deepEqual(store.view().maintainedIndustries, []);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '{"bad":true}\n');
  const corrupt = await createIndustryMaintenanceStore({ file, configLoader });
  assert.throws(() => corrupt.view(), (error) => error.statusCode === 503);
  const missingConfig = await createIndustryMaintenanceStore({ file: `${file}.other`, configLoader: async () => { throw Object.assign(new Error("missing config"), { code: "ENOENT" }); } });
  assert.throws(() => missingConfig.view(), (error) => error.statusCode === 503);
});
